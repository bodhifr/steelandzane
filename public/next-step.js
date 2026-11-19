// /next-step (VSL #2): every Book Your Call button and the top badge scroll to the
// calendar section (#book). No form, no tracking params, no storage.

(function () {
  'use strict';

  const book = document.getElementById('book');
  if (!book) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('.ns-book-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Section heading near the top of the screen (scroll-margin-top in next-step.css).
      book.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      book.focus({ preventScroll: true });   // keyboard and screen-reader users land on the calendar
    });
  });
}());
