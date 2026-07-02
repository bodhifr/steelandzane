// ─────────────────────────────────────────────────────────────────────────────
// HERO SLIDES — edit this array to add, remove, or reorder slides.
//   image        : path from the public root
//   featuredTitle: shown in the bottom-right property badge
// Copy (headline, body, CTAs) is in the HTML — edit index.html hero-content.
// ─────────────────────────────────────────────────────────────────────────────
var HERO_SLIDES = [
  { image: '/images/hero/1.jpg', featuredTitle: 'Malibu Modern Oceanfront' },
  { image: '/images/hero/2.jpg', featuredTitle: 'Malibu Modern Oceanfront' },
  { image: '/images/hero/3.jpg', featuredTitle: 'Malibu Modern Oceanfront' },
  { image: '/images/hero/4.jpg', featuredTitle: 'Malibu Modern Oceanfront' },
  { image: '/images/hero/5.jpg', featuredTitle: 'Malibu Modern Oceanfront' },
  { image: '/images/hero/6.jpg', featuredTitle: 'Malibu Modern Oceanfront' },
];

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.getElementById('site-nav');

navToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  navToggle.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-expanded', isOpen);
});

// Close mobile nav when a link is clicked
siteNav.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Header: gradient shadow over hero, solid on scroll
const header = document.querySelector('.site-header');
const isHeroPage = document.body.classList.contains('has-hero');
const heroGradient = 'linear-gradient(to bottom, rgba(14,11,9,0.88) 0%, rgba(14,11,9,0.40) 60%, rgba(14,11,9,0.00) 100%)';
window.addEventListener('scroll', () => {
  if (isHeroPage) {
    header.style.background = window.scrollY > 80
      ? 'rgba(31, 28, 25, 0.96)'
      : heroGradient;
  }
});

// Contact form — POST to /api/contact serverless function
const form = document.getElementById('contact-form');
const successMsg = document.getElementById('form-success');
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = form.querySelector('input[name="email"]').value.trim();
  if (!email) {
    form.querySelector('input[name="email"]').focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  const body = {
    name: form.querySelector('input[name="name"]').value.trim(),
    email,
    phone: form.querySelector('input[name="phone"]').value.trim(),
    message: form.querySelector('textarea[name="message"]').value.trim(),
  };

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      submitBtn.style.display = 'none';
      successMsg.classList.add('visible');
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
      alert('Something went wrong. Please email us directly at book@steelandzane.com');
    }
  } catch {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message';
    alert('Something went wrong. Please email us directly at book@steelandzane.com');
  }
});

// Scroll reveal — fires once per element when it enters the viewport
const revealEls = document.querySelectorAll('.reveal, .reveal-pop, .reveal-fade');
if (revealEls.length) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const delay = entry.target.dataset.delay ? parseInt(entry.target.dataset.delay) * 100 : 0;
      setTimeout(() => entry.target.classList.add('is-visible'), delay);
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => revealObserver.observe(el));
}

// Count-up animation for credibility stats
const statEls = document.querySelectorAll('.stat-number[data-target]');
if (statEls.length) {
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      countObserver.unobserve(entry.target);
      const el = entry.target;
      const target = parseInt(el.dataset.target);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const useComma = el.dataset.comma === 'true';
      const duration = 1800;
      const start = performance.now();
      function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const value = Math.round(easeOut(progress) * target);
        el.textContent = prefix + (useComma ? value.toLocaleString() : value) + suffix;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = prefix + (useComma ? target.toLocaleString() : target) + suffix;
          el.classList.add('stat-landed');
        }
      }
      el.textContent = prefix + '0' + suffix;
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  statEls.forEach(el => countObserver.observe(el));
}

// ─── Hero Carousel ────────────────────────────────────────────────────────────
(function initHeroCarousel() {
  var heroEl = document.getElementById('hero');
  if (!heroEl || !HERO_SLIDES.length) return;

  var slidesWrap = heroEl.querySelector('.hero-slides');
  var slideNav   = heroEl.querySelector('.hero-slide-nav');
  var propName   = heroEl.querySelector('.hero-property-name');

  var current  = 0;
  var timer    = null;
  var INTERVAL = 6000;

  // Build slide + nav elements from HERO_SLIDES array
  HERO_SLIDES.forEach(function(slide, i) {
    var slideEl = document.createElement('div');
    slideEl.className = 'hero-slide' + (i === 0 ? ' is-active' : '');
    var bgEl = document.createElement('div');
    bgEl.className = 'hero-slide-bg';
    bgEl.style.backgroundImage = "url('" + slide.image + "')";
    slideEl.appendChild(bgEl);
    slidesWrap.appendChild(slideEl);

    var btn = document.createElement('button');
    btn.className = 'hero-slide-nav-btn' + (i === 0 ? ' is-active' : '');
    btn.textContent = String(i + 1).padStart(2, '0');
    btn.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    btn.addEventListener('click', function() { goTo(i); resetTimer(); });
    slideNav.appendChild(btn);
  });

  var slides  = heroEl.querySelectorAll('.hero-slide');
  var navBtns = heroEl.querySelectorAll('.hero-slide-nav-btn');

  function goTo(index) {
    slides[current].classList.remove('is-active');
    navBtns[current].classList.remove('is-active');
    current = index;
    slides[current].classList.add('is-active');
    navBtns[current].classList.add('is-active');
    if (propName) propName.textContent = HERO_SLIDES[current].featuredTitle;
  }

  function next()       { goTo((current + 1) % HERO_SLIDES.length); }
  function startTimer() { timer = setInterval(next, INTERVAL); }
  function stopTimer()  { clearInterval(timer); }
  function resetTimer() { stopTimer(); startTimer(); }

  heroEl.addEventListener('mouseenter', stopTimer);
  heroEl.addEventListener('mouseleave', startTimer);

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startTimer();
  }
}());
