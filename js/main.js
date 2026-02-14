/* ===== JOYCE LEE PORTFOLIO — Main JS ===== */

(function () {
  'use strict';

  // --- Hamburger menu toggle ---
  const hamburger = document.querySelector('.nav__hamburger');
  const mobileNav = document.querySelector('.nav__mobile');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open');
    });

    // Close mobile nav when a link is clicked
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
      });
    });
  }

  // --- Grid / List view toggle ---
  const viewButtons = document.querySelectorAll('.view-toggle button');
  const projectsGrid = document.getElementById('projects-grid');

  if (viewButtons.length && projectsGrid) {
    viewButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var view = btn.getAttribute('data-view');

        // Update active button
        viewButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        // Toggle class on grid
        if (view === 'list') {
          projectsGrid.classList.add('list-view');
        } else {
          projectsGrid.classList.remove('list-view');
        }
      });
    });
  }
})();
