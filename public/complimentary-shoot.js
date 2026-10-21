// Complimentary Shoot landing page — conversational lead form + tracking.
// One question per screen. The full set of answers so far is saved to
// /api/lead after every screen, so partial leads reach the Sheet too.

(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  // GA4 Measurement ID, e.g. 'G-ABC123XYZ'. Leave empty to disable analytics.
  const GA4_ID = '';

  // Called once, after the final screen has saved successfully.
  // Paste the Vidalytics conversion snippet (from the Vidalytics dashboard)
  // inside this function so watch-time can be tied to conversions.
  function trackVidalyticsConversion() {
    // VIDALYTICS CONVERSION: paste snippet here.
  }

  // Google Maps Platform browser key (Maps JavaScript API + Places API (New)),
  // restricted to this site's domains. Leave empty to turn address
  // suggestions off; the address box then works as a plain text field.
  const MAPS_API_KEY = '';

  const CALL_FROM = '323-643-9060';
  const API_URL = '/api/lead';
  const STORE_KEY = 'snz_cs_lead_v1';
  const STORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // resume a lead for 30 days

  const ALL_STEPS = ['name', 'cell', 'email', 'haslisting', 'listing', 'status'];
  const NO_LISTING_STEPS = ['name', 'cell', 'email', 'haslisting'];   // "Not Yet" ends here

  // ── DOM ───────────────────────────────────────────────────────────────────
  const form = document.getElementById('cs-form');
  if (!form) return;
  const wrap = document.getElementById('cs-form-wrap');
  const progress = wrap.querySelector('.cs-progress');
  const progressFill = wrap.querySelector('.cs-progress-fill');
  const done = document.getElementById('cs-done');
  const honeypot = document.getElementById('cs-website');
  const address = document.getElementById('f-address');
  const gate = document.getElementById('cs-gate');
  const claimBtn = document.getElementById('cs-claim');
  const addrList = document.getElementById('cs-addr-list');

  const sections = {};
  form.querySelectorAll('.cs-step').forEach((el) => { sections[el.dataset.step] = el; });

  // ── STORAGE (every access guarded: private mode / blocked storage) ────────
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.leadId || Date.now() - s.startedAt > STORE_TTL_MS) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function clearStored() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // ── TRACKING PARAMS ───────────────────────────────────────────────────────
  // Only known-shaped codes are kept, so nothing personal can leak into
  // analytics or the Sheet through src/bdr. No params = direct (src 0).
  const params = new URLSearchParams(location.search);
  const urlSrc = /^[012]$/.test(params.get('src') || '') ? params.get('src') : '0';
  const urlBdr = /^\d{1,3}$/.test(params.get('bdr') || '') ? params.get('bdr') : '';
  const urlQs = location.search.slice(1, 501);

  let state = loadState();
  if (state) {
    // First touch wins, but fill in attribution the first visit lacked.
    if (state.src === '0' && urlSrc !== '0') state.src = urlSrc;
    if (!state.bdr && urlBdr) state.bdr = urlBdr;
  } else {
    state = {
      leadId: uuid(),
      startedAt: Date.now(),
      step: 'name',
      answers: {},
      src: urlSrc,
      bdr: urlBdr,
      qs: urlQs,
      formStarted: false,
    };
  }

  // ── ANALYTICS (GA4) ───────────────────────────────────────────────────────
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  if (GA4_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA4_ID, { src: state.src, bdr: state.bdr });
  }

  function track(event) {
    if (GA4_ID) gtag('event', event, { src: state.src, bdr: state.bdr });
  }

  // ── STEP HELPERS ──────────────────────────────────────────────────────────
  function activeSteps() {
    return state.answers.no_listing ? NO_LISTING_STEPS : ALL_STEPS;
  }

  function isFinal(step) {
    const steps = activeSteps();
    return steps[steps.length - 1] === step;
  }

  function setProgress(step) {
    const steps = activeSteps();
    const pct = Math.max(6, Math.round((steps.indexOf(step) / steps.length) * 100));
    progressFill.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(pct));
  }

  function showStep(step, moveFocus) {
    Object.keys(sections).forEach((name) => { sections[name].hidden = name !== step; });
    state.step = step;
    setProgress(step);
    updateListingButton();
    if (step === 'listing') loadPlaces();   // warm up address suggestions

    if (moveFocus) {
      const heading = sections[step].querySelector('.cs-q');
      heading.focus({ preventScroll: true });
      if (wrap.getBoundingClientRect().top < 0) {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // "Do you have a listing in mind?": answering "Not Yet" makes this the last screen.
  function updateListingButton() {
    const btn = sections.haslisting.querySelector('.cs-next');
    btn.textContent = checkedValue('has_listing') === 'no' ? 'Claim My Future Shoot' : 'Next';
  }

  // ── VALIDATION ────────────────────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function normalizePhone(value) {
    let digits = value.replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
    if (digits.length !== 10) return null;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function checkedValue(name) {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  }

  // Each validator returns { answers } on success or { error, field } on failure.
  const validators = {
    name() {
      const first = form.first_name.value.trim();
      const last = form.last_name.value.trim();
      if (!first) return { error: 'Please enter your first name.', field: form.first_name };
      if (!last) return { error: 'Please enter your last name.', field: form.last_name };
      return { answers: { first_name: first, last_name: last } };
    },
    cell() {
      const phone = normalizePhone(form.cell.value);
      if (!phone) return { error: 'Please enter a 10-digit cell number.', field: form.cell };
      form.cell.value = phone;
      return { answers: { cell: phone } };
    },
    email() {
      const email = form.email.value.trim();
      if (!EMAIL_RE.test(email)) return { error: 'Please enter a valid email address.', field: form.email };
      return { answers: { email } };
    },
    haslisting() {
      const v = checkedValue('has_listing');
      if (!v) return { error: 'Please choose one.', field: form.querySelector('input[name="has_listing"]') };
      if (v === 'no') return { answers: { no_listing: true, listing_address: '', listing_status: '' } };
      return { answers: { no_listing: false } };
    },
    listing() {
      const addr = address.value.trim();
      if (addr.length < 5) return { error: 'Please enter the listing address.', field: address };
      return { answers: { listing_address: addr } };
    },
    status() {
      const v = checkedValue('listing_status');
      if (!v) return { error: 'Please choose one.', field: form.querySelector('input[name="listing_status"]') };
      return { answers: { listing_status: v } };
    },
  };

  function showError(step, message, field) {
    const el = sections[step].querySelector('.cs-error');
    el.textContent = message;
    if (field) {
      if (field.type !== 'radio') field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function clearError(step) {
    const sec = sections[step];
    sec.querySelector('.cs-error').textContent = '';
    sec.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  // ── SAVING ────────────────────────────────────────────────────────────────
  // Saves run one at a time, in order. Each carries all answers so far, so
  // the server can upsert idempotently and the last save always wins.
  let saveChain = Promise.resolve();

  function save(status) {
    const payload = {
      leadId: state.leadId,
      status,
      step: state.step,
      answers: state.answers,
      src: state.src,
      bdr: state.bdr,
      qs: state.qs,
      clientTs: new Date().toISOString(),
      ageMs: Date.now() - state.startedAt,
      hp: honeypot.value,
    };
    const run = saveChain.then(() => fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).then((data) => {
      if (!data || !data.ok) throw new Error('Save rejected');
      return data;
    }));
    saveChain = run.catch(() => {});   // keep the chain alive after a failure
    return run;
  }

  // ── SUBMIT / NAVIGATION ───────────────────────────────────────────────────
  let finishing = false;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (finishing) return;

    const step = state.step;
    clearError(step);
    const result = validators[step]();
    if (result.error) {
      showError(step, result.error, result.field);
      return;
    }
    Object.assign(state.answers, result.answers);

    if (isFinal(step)) {
      finish(step);
      return;
    }

    if (step === 'name' && !state.formStarted) {
      state.formStarted = true;
      track('form_start');
    }

    const steps = activeSteps();
    const next = steps[steps.indexOf(step) + 1];
    state.step = next;     // record progress before saving, so the Sheet shows the furthest screen
    persist();
    save('Incomplete').catch(() => { /* retried implicitly by the next save */ });
    showStep(next, true);
  });

  function finish(step) {
    finishing = true;
    const btn = sections[step].querySelector('.cs-next');
    const label = btn.textContent;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Sending…';
    persist();

    save('Complete').then(() => {
      track('form_complete');
      try { trackVidalyticsConversion(); } catch (err) { /* never block the confirmation */ }
      showConfirmation();
      clearStored();
    }).catch(() => {
      finishing = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = label;
      showError(step,
        `Something went wrong sending your request. Please try again, or call or text us at ${CALL_FROM}.`,
        null);
    });
  }

  function showConfirmation() {
    const first = state.answers.first_name || '';
    form.hidden = true;
    progress.hidden = true;
    done.hidden = false;
    // Built from text nodes only: user input never becomes HTML.
    const title = document.getElementById('cs-done-title');
    const name = document.createElement('strong');
    name.textContent = `${first}.`;
    title.replaceChildren(document.createTextNode('Thanks, '), name);
    const body = document.getElementById('cs-done-body');
    if (state.answers.no_listing) {
      body.replaceChildren(document.createTextNode('Your complimentary shoot is saved for your next listing.'),
        document.createElement('br'), document.createTextNode('We’ll be in touch.'));
    } else {
      body.textContent = `We’ll give you a call from ${CALL_FROM} as soon as possible to plan your shoot.`;
    }
    document.getElementById('cs-done-title').focus({ preventScroll: true });
    if (wrap.getBoundingClientRect().top < 0) {
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  form.querySelectorAll('.cs-back').forEach((btn) => {
    btn.addEventListener('click', () => {
      const steps = activeSteps();
      const i = steps.indexOf(state.step);
      if (i > 0) {
        clearError(state.step);
        showStep(steps[i - 1], true);
        persist();
      }
    });
  });

  // ── FIELD BEHAVIOUR ───────────────────────────────────────────────────────
  form.querySelectorAll('input[name="has_listing"]').forEach((r) => {
    r.addEventListener('change', () => {
      clearError('haslisting');
      state.answers.no_listing = checkedValue('has_listing') === 'no';
      setProgress('haslisting');
      updateListingButton();
    });
  });

  form.querySelectorAll('input[name="listing_status"]').forEach((r) => {
    r.addEventListener('change', () => clearError('status'));
  });

  form.cell.addEventListener('blur', () => {
    const phone = normalizePhone(form.cell.value);
    if (phone) form.cell.value = phone;
  });

  form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      sections[state.step].querySelector('.cs-error').textContent = '';
    }
  });

  // ── ADDRESS SUGGESTIONS (Google Places API (New)) ─────────────────────────
  // Loaded only when the listing screen is reached, and only with a key.
  // Any failure leaves the box as a plain text field.
  const LA_BIAS = { center: { lat: 34.05, lng: -118.30 }, radius: 50000 };
  let placesPromise = null;
  let places = null;
  let sessionToken = null;
  let suggestions = [];
  let activeIndex = -1;
  let requestSeq = 0;
  let debounceTimer = 0;

  function loadPlaces() {
    if (!MAPS_API_KEY) return Promise.resolve(null);
    if (!placesPromise) {
      placesPromise = new Promise((resolve, reject) => {
        window.__csMapsReady = resolve;
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(MAPS_API_KEY)
          + '&loading=async&libraries=places&callback=__csMapsReady';
        s.onerror = reject;
        document.head.appendChild(s);
      })
        .then(() => google.maps.importLibrary('places'))
        .then((lib) => { places = lib; enableCombobox(); return lib; })
        .catch(() => null);
    }
    return placesPromise;
  }

  function enableCombobox() {
    address.setAttribute('role', 'combobox');
    address.setAttribute('aria-autocomplete', 'list');
    address.setAttribute('aria-expanded', 'false');
    address.setAttribute('aria-controls', 'cs-addr-list');
    address.setAttribute('autocomplete', 'off');   // our list replaces the browser's
  }

  function closeSuggestions() {
    suggestions = [];
    activeIndex = -1;
    addrList.hidden = true;
    addrList.replaceChildren();
    address.setAttribute('aria-expanded', 'false');
    address.removeAttribute('aria-activedescendant');
  }

  function renderSuggestions() {
    addrList.replaceChildren();
    if (!suggestions.length) { closeSuggestions(); return; }
    suggestions.forEach((sug, i) => {
      const p = sug.placePrediction;
      const li = document.createElement('li');
      li.id = `cs-addr-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === activeIndex));
      li.textContent = p.mainText ? p.mainText.text : p.text.text;
      if (p.secondaryText) {
        const sec = document.createElement('span');
        sec.className = 'cs-addr-secondary';
        sec.textContent = p.secondaryText.text.replace(/, USA$/, '');
        li.appendChild(sec);
      }
      // mousedown (not click) so the input doesn't blur and close the list first
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
      addrList.appendChild(li);
    });
    const attrib = document.createElement('li');
    attrib.className = 'cs-addr-attrib';
    attrib.setAttribute('role', 'presentation');
    attrib.textContent = 'Google Maps';
    addrList.appendChild(attrib);
    addrList.hidden = false;
    address.setAttribute('aria-expanded', 'true');
    if (activeIndex >= 0) address.setAttribute('aria-activedescendant', `cs-addr-opt-${activeIndex}`);
    else address.removeAttribute('aria-activedescendant');
  }

  async function fetchSuggestions(query) {
    const seq = ++requestSeq;
    try {
      if (!sessionToken) sessionToken = new places.AutocompleteSessionToken();
      const res = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        sessionToken,
        includedRegionCodes: ['us'],
        includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
        locationBias: LA_BIAS,
      });
      if (seq !== requestSeq) return;            // a newer keystroke won
      suggestions = (res.suggestions || []).filter((s) => s.placePrediction).slice(0, 5);
      activeIndex = -1;
      renderSuggestions();
    } catch (err) {
      if (seq === requestSeq) closeSuggestions();
    }
  }

  async function choose(i) {
    const p = suggestions[i] && suggestions[i].placePrediction;
    if (!p) return;
    const typed = p.text.text.replace(/, USA$/, '');
    address.value = typed;                        // immediate, then upgrade with ZIP
    closeSuggestions();
    clearError('listing');
    requestSeq++;
    try {
      const place = p.toPlace();
      await place.fetchFields({ fields: ['formattedAddress'] });
      // e.g. "123 Green St, Los Angeles, CA 90025, USA" -> drop the country
      if (place.formattedAddress && address.value === typed) {
        address.value = place.formattedAddress.replace(/, USA$/, '');
      }
    } catch (err) { /* keep the prediction text */ }
    sessionToken = null;                          // selection ends the billing session
  }

  address.addEventListener('focus', () => { loadPlaces(); });

  address.addEventListener('input', () => {
    if (!places) return;
    clearTimeout(debounceTimer);
    const q = address.value.trim();
    if (q.length < 3) { requestSeq++; closeSuggestions(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 200);
  });

  address.addEventListener('keydown', (e) => {
    if (addrList.hidden || !suggestions.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = suggestions.length;
      activeIndex = e.key === 'ArrowDown' ? (activeIndex + 1) % n : (activeIndex - 1 + n) % n;
      renderSuggestions();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();                         // pick the address, don't submit yet
      choose(activeIndex);
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });

  address.addEventListener('blur', () => { setTimeout(closeSuggestions, 150); });

  // ── CLAIM GATE ────────────────────────────────────────────────────────────
  // The questions stay hidden until the agent taps "Claim My Shoot".
  function openForm() {
    gate.hidden = true;
    progress.hidden = false;
    form.hidden = false;
    wrap.classList.add('is-open');   // terracotta outline around the questions
  }

  const isDesktop = () => window.matchMedia('(min-width: 720px)').matches;

  // Desktop: scroll so the current question's text boxes sit in the exact middle of
  // the screen. (Phones keep the browser's own focus scrolling for the keyboard.)
  function centerInputs() {
    const sec = sections[state.step] || sections.name;
    const target = sec.querySelector('.cs-row, .cs-field, .cs-tiles') || sec;
    const r = target.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, behavior: 'smooth' });
  }

  // Top badge: scroll down to the Claim button (or to the form once it's open).
  document.getElementById('cs-badge').addEventListener('click', (e) => {
    e.preventDefault();
    const target = gate.hidden ? wrap : claimBtn;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!gate.hidden) claimBtn.focus({ preventScroll: true });
  });

  claimBtn.addEventListener('click', () => {
    state.claimed = true;
    persist();
    track('cta_click');
    openForm();
    showStep(state.step, false);
    if (isDesktop()) {
      form.first_name.focus({ preventScroll: true });
      centerInputs();
    } else {
      form.first_name.focus();   // opens the keyboard on phones
    }
  });

  // Lower Claim buttons open the questions in place, under "Your first shoot is on us":
  // the one form (answers kept) moves into the slot there, with a screen of space below
  // it so the questions section stays out of view. Then it reuses the top Claim button
  // when the form isn't open yet (same reveal + focus behavior) and scrolls down to it.
  const formSlot = document.getElementById('cs-form-slot');
  document.querySelectorAll('.cs-claim-again').forEach((btn) => {
    btn.addEventListener('click', () => {
      track('cta_click_again');
      if (wrap.parentNode !== formSlot) {
        formSlot.appendChild(wrap);
        formSlot.classList.add('has-form');
      }
      if (!gate.hidden) claimBtn.click();              // opens the form (desktop: centres it)
      if (isDesktop()) centerInputs();
      else wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Questions fade up as each scrolls into view (skipped for reduced motion).
  const qaItems = document.querySelectorAll('.cs-qa-item');
  if (qaItems.length && 'IntersectionObserver' in window
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const qaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          qaObserver.unobserve(entry.target);
        }
      });
    // The huge top margin counts anything already scrolled past as seen, so a fast
    // jump past a question never leaves it invisible.
    }, { threshold: 0.2, rootMargin: '100000px 0px -8% 0px' });
    qaItems.forEach((el) => { el.classList.add('cs-reveal'); qaObserver.observe(el); });
  }

  // ── RESTORE A RESUMED LEAD ────────────────────────────────────────────────
  function restoreFields() {
    const a = state.answers;
    if (a.first_name) form.first_name.value = a.first_name;
    if (a.last_name) form.last_name.value = a.last_name;
    if (a.cell) form.cell.value = a.cell;
    if (a.email) form.email.value = a.email;
    if (a.listing_address) address.value = a.listing_address;
    if (a.no_listing === true || a.no_listing === false) {
      form.querySelectorAll('input[name="has_listing"]').forEach((r) => {
        r.checked = r.value === (a.no_listing ? 'no' : 'yes');
      });
    }
    ['listing_status'].forEach((name) => {
      if (!a[name]) return;
      form.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
        r.checked = r.value === a[name];
      });
    });
  }

  restoreFields();
  if (!sections[state.step] || activeSteps().indexOf(state.step) === -1) state.step = 'name';
  showStep(state.step, false);   // never steal focus on page load
  // Someone who already started skips the Claim button and resumes.
  if (state.claimed || state.step !== 'name' || Object.keys(state.answers).length) openForm();
  persist();
}());
