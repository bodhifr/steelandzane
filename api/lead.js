// Complimentary Shoot lead capture.
// Receives one save per form screen from /complimentary-shoot, validates it,
// screens out obvious spam, and forwards it to the Google Apps Script web app
// that upserts the row in the leads Sheet and emails Bodhi.
//
// Env (Vercel dashboard → Settings → Environment Variables, Production + Preview):
//   LEADS_WEBHOOK_URL     Apps Script web app URL (…/exec)
//   LEADS_WEBHOOK_SECRET  shared token, must match the script's SECRET property

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS = ['name', 'cell', 'email', 'listing', 'status', 'timing', 'notes'];
const STATUSES = ['Incomplete', 'Complete'];

// Whitelisted answer fields and their max lengths. Anything else is dropped.
const FIELDS = {
  first_name: 60,
  last_name: 60,
  cell: 20,
  email: 120,
  listing_address: 200,
  listing_status: 20,
  timing: 30,
  shoot_date: 10,
  notes: 2000,
};

const MIN_AGE_MS = 2000;            // faster than any human fills a screen
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 60;                // saves per IP per window (generous: carriers NAT many phones behind one IP)

// Best-effort only: each Vercel instance has its own memory.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();   // bound memory on a long-lived instance
  return recent.length > RATE_MAX;
}

function clean(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Spam traps: answer "ok" so bots learn nothing, but store nothing.
  if (body.hp) return res.status(200).json({ ok: true });
  if (typeof body.ageMs !== 'number' || body.ageMs < MIN_AGE_MS) {
    return res.status(200).json({ ok: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip'] || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false });

  if (!UUID_RE.test(body.leadId || '') || !STATUSES.includes(body.status) || !STEPS.includes(body.step)) {
    return res.status(400).json({ ok: false });
  }

  const raw = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const answers = {};
  for (const [key, max] of Object.entries(FIELDS)) answers[key] = clean(raw[key], max);
  answers.no_listing = raw.no_listing === true;

  if (body.status === 'Complete'
      && !(answers.first_name && answers.last_name && answers.cell && answers.email)) {
    return res.status(400).json({ ok: false });
  }

  const lead = {
    lead_id: body.leadId.toLowerCase(),
    status: body.status,
    last_step: body.step,
    ...answers,
    src: /^[012]$/.test(body.src || '') ? body.src : '0',
    bdr: /^\d{1,3}$/.test(body.bdr || '') ? body.bdr : '',
    query_string: clean(body.qs, 500),
    client_submitted_at: clean(body.clientTs, 40),
  };

  const url = process.env.LEADS_WEBHOOK_URL;
  const secret = process.env.LEADS_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.error('lead: LEADS_WEBHOOK_URL / LEADS_WEBHOOK_SECRET not set');
    return res.status(500).json({ ok: false });
  }

  try {
    // Apps Script answers a POST with a 302 to the result; fetch follows it.
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, lead }),
      redirect: 'follow',
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data || !data.ok) {
      console.error('lead: webhook rejected', upstream.status, data && data.error);
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('lead: webhook error', err);
    return res.status(502).json({ ok: false });
  }
};
