/**
 * Steel & Zane — Complimentary Shoot leads
 *
 * Google Apps Script bound to the "Complimentary Shoot Leads" Sheet.
 * Receives saves from the website's /api/lead function, upserts one row per
 * lead (keyed by lead_id), and emails Bodhi at most twice per lead:
 *   1. when a cell number is first captured (status Incomplete)
 *   2. when the form is completed (status Complete)
 *
 * This file is the source of truth; it lives in the website repo
 * (apps-script/Code.gs) and is pasted into the Sheet's script editor.
 * Setup steps are in the repo README under "Complimentary Shoot page".
 */

const LEADS_TAB = 'Leads';
const BDRS_TAB = 'BDRs';
const NOTIFY_EMAIL = 'bodhi@steelandzane.com';
const MAX_UPDATES_PER_LEAD = 25;

const HEADERS = [
  'lead_id', 'status', 'last_step', 'created_at', 'updated_at',
  'first_name', 'last_name', 'cell', 'email',
  'listing_address', 'no_listing', 'listing_status', 'timing', 'shoot_date', 'notes',
  'src', 'src_label', 'bdr', 'bdr_label', 'query_string', 'client_submitted_at',
  'update_count', 'emailed_partial_at', 'emailed_complete_at',
];

const SRC_LABELS = { '0': 'Direct', '1': 'Text', '2': 'Email' };

const STEP_LABELS = {
  name: '1 Name', cell: '2 Cell', email: '3 Email', haslisting: '4 Listing in mind?',
  listing: '5 Address', status: '6 Active/Coming soon',
  timing: 'Timing (old form)', notes: 'Notes (old form)',
};

/**
 * Run once from the script editor (select "setup", click Run).
 * Creates the tabs, seeds the BDR list, generates the shared secret and
 * triggers the authorization prompt for Sheets + Mail.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());

  let leads = ss.getSheetByName(LEADS_TAB);
  if (!leads) leads = ss.insertSheet(LEADS_TAB, 0);
  leads.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  leads.setFrozenRows(1);

  let bdrs = ss.getSheetByName(BDRS_TAB);
  if (!bdrs) {
    bdrs = ss.insertSheet(BDRS_TAB);
    bdrs.getRange(1, 1, 3, 2).setValues([['code', 'name'], ['1', 'Bodhi'], ['2', 'Joshua']]);
    bdrs.getRange('A:A').setNumberFormat('@');
    bdrs.getRange(1, 1, 1, 2).setFontWeight('bold');
    bdrs.setFrozenRows(1);
  }

  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid().slice(0, 8));
  }
  MailApp.getRemainingDailyQuota();   // forces the Mail authorization prompt

  Logger.log('Setup complete.');
  Logger.log('LEADS_WEBHOOK_SECRET for Vercel: ' + props.getProperty('SECRET'));
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_json' });
  }

  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('SECRET');
  if (!secret || payload.secret !== secret) return json({ ok: false, error: 'auth' });

  const lead = payload.lead || {};
  if (!lead.lead_id) return json({ ok: false, error: 'no_lead_id' });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  }

  try {
    const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
    const sheet = ss.getSheetByName(LEADS_TAB);
    const rowIndex = findRow(sheet, lead.lead_id);
    const existing = rowIndex ? readRow(sheet, rowIndex) : null;
    const now = new Date();

    if (existing && Number(existing.update_count) >= MAX_UPDATES_PER_LEAD) {
      return json({ ok: true, capped: true });
    }

    const record = Object.assign({}, existing || {}, {
      lead_id: lead.lead_id,
      // Never downgrade a completed lead back to Incomplete.
      status: existing && existing.status === 'Complete' ? 'Complete' : lead.status,
      last_step: STEP_LABELS[lead.last_step] || lead.last_step,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      first_name: lead.first_name,
      last_name: lead.last_name,
      cell: lead.cell,
      email: lead.email,
      listing_address: lead.listing_address,
      no_listing: lead.no_listing ? 'Yes' : '',
      listing_status: lead.listing_status,
      timing: lead.timing,
      shoot_date: lead.shoot_date,
      notes: lead.notes,
      src: lead.src,
      src_label: SRC_LABELS[lead.src] || '',
      bdr: lead.bdr,
      bdr_label: bdrName(ss, lead.bdr),
      query_string: lead.query_string,
      client_submitted_at: lead.client_submitted_at,
      update_count: (existing ? Number(existing.update_count) || 0 : 0) + 1,
    });

    // Save the lead first, so it is never lost to an email failure.
    const targetRow = rowIndex || sheet.getLastRow() + 1;
    writeRow(sheet, targetRow, record);

    // Mark an email as sent only after it actually sends. A failed send stays
    // unmarked and is retried on the lead's next save.
    const link = ss.getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + targetRow;
    const sendPartial = record.status === 'Incomplete' && record.cell && !record.emailed_partial_at;
    const sendComplete = record.status === 'Complete' && !record.emailed_complete_at;
    try {
      if (sendPartial) {
        notify(record, link, false);
        setCell(sheet, targetRow, 'emailed_partial_at', new Date());
      }
      if (sendComplete) {
        notify(record, link, true);
        setCell(sheet, targetRow, 'emailed_complete_at', new Date());
      }
    } catch (mailErr) {
      console.error('Email failed for ' + lead.lead_id + ': ' + mailErr);
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
}

// ── Sheet helpers ────────────────────────────────────────────────────────────

function findRow(sheet, leadId) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const cell = sheet.getRange(2, 1, last - 1, 1)
    .createTextFinder(leadId).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function readRow(sheet, row) {
  const values = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  const obj = {};
  HEADERS.forEach(function (h, i) { obj[h] = values[i]; });
  return obj;
}

function writeRow(sheet, row, record) {
  const values = HEADERS.map(function (h) { return safeCell(record[h]); });
  sheet.getRange(row, 1, 1, HEADERS.length).setValues([values]);
}

function setCell(sheet, row, header, value) {
  sheet.getRange(row, HEADERS.indexOf(header) + 1).setValue(value);
}

// Strings starting with = + - @ would be run as formulas by setValues.
function safeCell(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function bdrName(ss, code) {
  if (!code) return '';
  const sheet = ss.getSheetByName(BDRS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return '';
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(code)) return String(rows[i][1]);
  }
  return '';
}

// ── Email ────────────────────────────────────────────────────────────────────

function notify(r, link, complete) {
  const name = (r.first_name + ' ' + r.last_name).trim() || '(no name yet)';
  const via = [r.bdr_label || (r.bdr ? 'BDR ' + r.bdr : 'No BDR'), r.src_label || 'Direct'].join(' / ');
  const subject = complete
    ? 'Lead COMPLETE: ' + name + ' — ' + (r.no_listing ? 'No listing yet' : (r.listing_address || 'no address'))
    : 'New lead (Incomplete): ' + name + ' · ' + r.cell + ' · via ' + via;

  const rows = [
    ['Status', r.status],
    ['Furthest screen reached', r.last_step],
    ['Name', name],
    ['Cell', r.cell],
    ['Email', r.email],
    ['Listing', r.no_listing ? 'No listing yet' : r.listing_address],
    ['Active / coming soon', r.listing_status],
    ['Timing', r.timing + (r.shoot_date ? ' — ' + formatDate(r.shoot_date) : '')],
    ['Notes', r.notes],
    ['Sent by', via],
  ];

  const html = '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">'
    + rows.map(function (row) {
      return '<tr><td style="color:#6C665E;vertical-align:top"><b>' + esc(row[0]) + '</b></td>'
        + '<td style="white-space:pre-wrap">' + esc(row[1] || '—') + '</td></tr>';
    }).join('')
    + '</table><p style="font-family:Arial,sans-serif;font-size:14px"><a href="' + esc(link) + '">Open in Sheet</a></p>';

  const text = rows.map(function (row) { return row[0] + ': ' + (row[1] || '—'); }).join('\n')
    + '\n\nSheet: ' + link;

  const options = { to: NOTIFY_EMAIL, subject: subject, htmlBody: html, body: text, name: 'Steel & Zane Leads' };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(r.email || ''))) options.replyTo = String(r.email);
  MailApp.sendEmail(options);
}

function formatDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'EEE, MMM d, yyyy');
  return String(v);
}

function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
