/* ===== JOYCE LEE PORTFOLIO — Main JS ===== */

(function () {
  'use strict';

  // --- Hamburger menu toggle ---
  var hamburger = document.querySelector('.nav__hamburger');
  var mobileNav = document.querySelector('.nav__mobile');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open');
    });

    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
      });
    });
  }

  // --- Grid / List view toggle ---
  var viewButtons = document.querySelectorAll('.view-toggle button');
  var projectsGrid = document.getElementById('projects-grid');

  if (viewButtons.length && projectsGrid) {
    viewButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var view = btn.getAttribute('data-view');
        viewButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (view === 'list') {
          projectsGrid.classList.add('list-view');
        } else {
          projectsGrid.classList.remove('list-view');
        }
      });
    });
  }

  // --- Data loading ---
  window.PortfolioApp = {
    data: null,

    getBasePath: function () {
      // Determine base path based on current page location
      if (window.location.pathname.indexOf('project.html') !== -1) {
        return './';
      }
      return './';
    },

    loadData: function () {
      var basePath = this.getBasePath();
      var self = this;

      return fetch(basePath + 'data/projects.json?v=' + Date.now())
        .then(function (response) { return response.json(); })
        .then(function (data) {
          self.data = data;
          self.render();
          return data;
        });
    },

    render: function () {
      if (!this.data) return;

      // Render homepage elements if present
      this.renderHomepage();

      // Render project page if present
      this.renderProjectPage();
    },

    renderHomepage: function () {
      var titleEl = document.getElementById('site-title');
      var subtitleEl = document.getElementById('site-subtitle');
      var taglineEl = document.getElementById('site-tagline');
      var countEl = document.getElementById('project-count');
      var gridEl = document.getElementById('projects-grid');

      if (!titleEl) return; // Not on homepage

      var site = this.data.site;
      var projects = this.data.projects;

      titleEl.textContent = site.title;
      subtitleEl.textContent = site.subtitle;
      taglineEl.textContent = site.tagline;

      // Compute year range
      var years = [];
      projects.forEach(function (p) {
        var match = p.cardMeta.match(/\d{4}/g);
        if (match) match.forEach(function (y) { years.push(parseInt(y)); });
      });
      var minYear = Math.min.apply(null, years);
      var maxYear = Math.max.apply(null, years);
      countEl.textContent = projects.length + ' Projects \u00b7 ' + minYear + '\u2013' + maxYear;

      // Render project cards
      gridEl.innerHTML = '';
      projects.forEach(function (project) {
        var card = document.createElement('a');
        card.href = 'project.html?slug=' + project.slug;
        card.className = 'project-card';
        card.setAttribute('data-slug', project.slug);

        var imgDiv = document.createElement('div');
        imgDiv.className = 'project-card__image';
        if (project.thumbnail) {
          var img = document.createElement('img');
          img.src = project.thumbnail;
          img.alt = project.title;
          img.loading = 'lazy';
          imgDiv.appendChild(img);
        } else {
          var placeholder = document.createElement('span');
          placeholder.className = 'placeholder-text';
          placeholder.textContent = 'Project Image';
          imgDiv.appendChild(placeholder);
        }

        var title = document.createElement('h2');
        title.className = 'project-card__title';
        title.textContent = project.title;

        var meta = document.createElement('p');
        meta.className = 'project-card__meta';
        meta.textContent = project.cardMeta;

        card.appendChild(imgDiv);
        card.appendChild(title);
        card.appendChild(meta);
        gridEl.appendChild(card);
      });
    },

    renderProjectPage: function () {
      var container = document.getElementById('project-content');
      if (!container) return; // Not on project page

      var params = new URLSearchParams(window.location.search);
      var slug = params.get('slug');
      if (!slug) return;

      var project = null;
      for (var i = 0; i < this.data.projects.length; i++) {
        if (this.data.projects[i].slug === slug) {
          project = this.data.projects[i];
          break;
        }
      }
      if (!project) {
        container.innerHTML = '<p>Project not found.</p>';
        return;
      }

      // Update page title
      document.title = project.title + ' \u2014 Joyce Lee';

      // Build header
      var html = '';
      html += '<a href="index.html" class="project-page__back">All Projects</a>';
      html += '<div class="project-page__header">';
      html += '<div>';
      html += '<h1 class="project-page__title">' + this.escapeHtml(project.title) + '</h1>';
      html += '<p class="project-page__type">' + this.escapeHtml(project.type) + '</p>';

      project.descriptions.forEach(function (desc, idx) {
        if (idx > 0) html += '<br>';
        html += '<p class="project-page__description">' + desc + '</p>';
      });

      html += '</div>';
      html += '<div class="project-page__meta">';

      project.meta.forEach(function (item) {
        html += '<div class="project-page__meta-item">';
        html += '<span class="label">' + this.escapeHtml(item.label) + '</span>';
        html += '<span>' + this.escapeHtml(item.value) + '</span>';
        html += '</div>';
      }.bind(this));

      html += '</div></div>';

      // Build images
      html += '<div class="project-page__images">';
      var i = 0;
      while (i < project.images.length) {
        var img = project.images[i];
        if (img.layout === 'half' && i + 1 < project.images.length && project.images[i + 1].layout === 'half') {
          html += '<div class="project-page__image-row">';
          html += this.buildImageHtml(img, true);
          html += this.buildImageHtml(project.images[i + 1], true);
          html += '</div>';
          i += 2;
        } else {
          html += this.buildImageHtml(img, false);
          i++;
        }
      }
      html += '</div>';

      // Build related projects
      if (project.relatedProjects && project.relatedProjects.length > 0) {
        html += '<div class="related-projects">';
        html += '<h3>Related Projects</h3>';
        html += '<div class="related-projects__grid">';

        var self = this;
        project.relatedProjects.forEach(function (relSlug) {
          var rel = null;
          for (var j = 0; j < self.data.projects.length; j++) {
            if (self.data.projects[j].slug === relSlug) {
              rel = self.data.projects[j];
              break;
            }
          }
          if (rel) {
            html += '<a href="project.html?slug=' + rel.slug + '" class="project-card">';
            html += '<div class="project-card__image"><span class="placeholder-text">Project Image</span></div>';
            html += '<h2 class="project-card__title">' + self.escapeHtml(rel.title) + '</h2>';
            html += '<p class="project-card__meta">' + self.escapeHtml(rel.cardMeta) + '</p>';
            html += '</a>';
          }
        });

        html += '</div></div>';
      }

      container.innerHTML = html;
    },

    buildImageHtml: function (img, isHalf) {
      var cls = 'project-page__image' + (isHalf ? ' half' : '');
      var html = '<div class="' + cls + '">';
      if (img.src) {
        html += '<img src="' + this.escapeHtml(img.src) + '" alt="' + this.escapeHtml(img.caption) + '" loading="lazy">';
      } else {
        html += '<span class="placeholder-text">' + this.escapeHtml(img.caption) + '</span>';
      }
      html += '</div>';
      return html;
    },

    escapeHtml: function (str) {
      if (!str) return '';
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };

  // Load data on page ready
  window.PortfolioApp.loadData();
})();
