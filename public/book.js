// ─── SPIRO BOOKING LINKS ─────────────────────────────────────────────────────
// Replace each placeholder with the real Spiro booking URL before going live.
// See README.md for instructions.
const SPIRO_LINKS = {
  photosOnly:  'https://REPLACE-WITH-SPIRO-PHOTOS-ONLY-LINK.com',
  photoVideo:  'https://REPLACE-WITH-SPIRO-PHOTO-VIDEO-LINK.com',
  photoDrone:  'https://REPLACE-WITH-SPIRO-PHOTO-DRONE-LINK.com',
  fullPackage: 'https://REPLACE-WITH-SPIRO-FULL-PACKAGE-LINK.com',
  luxury:      'https://REPLACE-WITH-SPIRO-LUXURY-LINK.com',
  commercial:  'https://REPLACE-WITH-SPIRO-COMMERCIAL-LINK.com',
  rental:      'https://REPLACE-WITH-SPIRO-RENTAL-AIRBNB-LINK.com',
  threeD:      'https://REPLACE-WITH-SPIRO-3D-FLOORPLAN-LINK.com',
};

// Priority: luxury / commercial / rental override service selection.
// Standard residential routes by service chosen.
function getRedirectUrl(property, service) {
  if (property === 'luxury')     return SPIRO_LINKS.luxury;
  if (property === 'commercial') return SPIRO_LINKS.commercial;
  if (property === 'rental')     return SPIRO_LINKS.rental;

  const serviceMap = {
    'photos':       SPIRO_LINKS.photosOnly,
    'photo-video':  SPIRO_LINKS.photoVideo,
    'photo-drone':  SPIRO_LINKS.photoDrone,
    'full-package': SPIRO_LINKS.fullPackage,
    'three-d':      SPIRO_LINKS.threeD,
  };
  return serviceMap[service] || SPIRO_LINKS.photosOnly;
}

// ─── MOBILE NAV ──────────────────────────────────────────────────────────────
const navToggle = document.querySelector('.nav-toggle');
const siteNav   = document.getElementById('site-nav');

navToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  navToggle.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-expanded', isOpen);
});

siteNav.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// ─── HEADER SCROLL ───────────────────────────────────────────────────────────
const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => {
  header.style.background = window.scrollY > 40
    ? 'rgba(31, 28, 25, 1)'
    : 'rgba(31, 28, 25, 0.96)';
});

// ─── BOOKING FORM ────────────────────────────────────────────────────────────
const form      = document.getElementById('book-form');
const submitBtn = document.getElementById('book-submit');

function getRadioValue(name) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : null;
}

// Clear inline errors as soon as the user makes a selection
['property', 'service', 'sqft', 'timeline'].forEach(name => {
  form.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.addEventListener('change', () => {
      document.getElementById(`error-${name}`).classList.remove('visible');
    });
  });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const property = getRadioValue('property');
  const service  = getRadioValue('service');
  const sqft     = getRadioValue('sqft');
  const timeline = getRadioValue('timeline');

  let valid = true;

  if (!property) { document.getElementById('error-property').classList.add('visible'); valid = false; }
  if (!service)  { document.getElementById('error-service').classList.add('visible');  valid = false; }
  if (!sqft)     { document.getElementById('error-sqft').classList.add('visible');     valid = false; }
  if (!timeline) { document.getElementById('error-timeline').classList.add('visible'); valid = false; }

  if (!valid) return;

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Redirecting…';

  window.location.href = getRedirectUrl(property, service);
});
