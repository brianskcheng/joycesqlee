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

      // Render about page if present
      this.renderAboutPage();
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
            html += '<div class="project-card__image">';
            if (rel.thumbnail) {
              html += '<img src="' + self.escapeHtml(rel.thumbnail) + '" alt="' + self.escapeHtml(rel.title) + '" loading="lazy">';
            } else {
              html += '<span class="placeholder-text">Project Image</span>';
            }
            html += '</div>';
            html += '<h2 class="project-card__title">' + self.escapeHtml(rel.title) + '</h2>';
            html += '<p class="project-card__meta">' + self.escapeHtml(rel.cardMeta) + '</p>';
            html += '</a>';
          }
        });

        html += '</div></div>';
      }

      container.innerHTML = html;
    },

    renderAboutPage: function () {
      var container = document.getElementById('about-content');
      if (!container || !this.data.about) return;

      var about = this.data.about;
      var html = '';

      // Intro block
      html += '<div class="about-page__intro">';
      html += '<div class="about-page__photo" id="about-photo">';
      if (about.photo) {
        html += '<img src="' + this.escapeHtml(about.photo) + '" alt="' + this.escapeHtml(about.name) + '">';
      }
      html += '</div>';
      html += '<div class="about-page__bio">';
      html += '<h1 id="about-name">' + this.escapeHtml(about.name) + '</h1>';
      html += '<span class="label" id="about-title">' + this.escapeHtml(about.title) + '</span>';
      html += '<div id="about-bio" class="about-page__bio-text">' + this.formatBioHtml(about.bio) + '</div>';
      html += '<div class="about-page__contact">';
      html += '<a href="mailto:' + this.escapeHtml(about.email) + '" id="about-email">' + this.escapeHtml(about.email) + '</a>';
      html += '<a href="tel:' + this.escapeHtml(about.phone.replace(/\s/g, '')) + '" id="about-phone">' + this.escapeHtml(about.phone) + '</a>';
      html += '</div></div></div>';

      // Sections
      var self = this;
      (about.sections || []).forEach(function (section, sIdx) {
        html += '<section class="about-section" data-section-index="' + sIdx + '">';
        html += '<h2 class="about-section__title" data-section-title="' + sIdx + '">' + self.escapeHtml(section.title) + '</h2>';

        if (section.type === 'experience') {
          (section.items || []).forEach(function (item, iIdx) {
            html += '<div class="experience-item" data-section-index="' + sIdx + '" data-item-index="' + iIdx + '">';
            html += '<span class="experience-item__date" data-field="date">' + self.escapeHtml(item.date) + '</span>';
            html += '<div>';
            html += '<p class="experience-item__role" data-field="role">' + self.escapeHtml(item.role) + '</p>';
            html += '<p class="experience-item__org" data-field="org">' + self.escapeHtml(item.org) + '</p>';
            html += '<p class="experience-item__desc" data-field="desc">' + self.escapeHtml(item.desc) + '</p>';
            html += '</div></div>';
          });
        } else if (section.type === 'skills') {
          html += '<div class="skills-grid">';
          (section.groups || []).forEach(function (group, gIdx) {
            html += '<div class="skills-group" data-section-index="' + sIdx + '" data-group-index="' + gIdx + '">';
            html += '<h4 data-field="heading">' + self.escapeHtml(group.heading) + '</h4>';
            html += '<ul>';
            (group.items || []).forEach(function (skill, skIdx) {
              html += '<li data-skill-index="' + skIdx + '">';
              html += '<span data-field="skill">' + self.escapeHtml(skill) + '</span>';
              html += '</li>';
            });
            html += '</ul></div>';
          });
          html += '</div>';
        }

        html += '</section>';
      });

      container.innerHTML = html;
    },

    buildImageHtml: function (img, isHalf) {
      var cls = 'project-page__image';
      if (img.layout === 'hero') cls += ' hero';
      else if (isHalf) cls += ' half';
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
    },

    splitBioParagraphs: function (bio) {
      if (!bio) return [];
      var parts = bio.split(/\n\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
      if (parts.length <= 1 && bio.indexOf('\n') !== -1) {
        parts = bio.split(/\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      }
      return parts;
    },

    formatBioHtml: function (bio) {
      var parts = this.splitBioParagraphs(bio);
      if (!parts.length) return '<p></p>';
      var self = this;
      return parts.map(function (part) {
        return '<p>' + self.escapeHtml(part) + '</p>';
      }).join('');
    },

    readBioFromElement: function (el) {
      if (!el) return '';
      var parts = [];
      var i;
      for (i = 0; i < el.childNodes.length; i++) {
        var node = el.childNodes[i];
        if (node.nodeType === 1 && (node.nodeName === 'P' || node.nodeName === 'DIV')) {
          var text = node.textContent.trim();
          if (text) parts.push(text);
        } else if (node.nodeType === 3) {
          text = node.textContent.trim();
          if (text) parts.push(text);
        }
      }
      if (parts.length) return parts.join('\n\n');
      var inner = el.innerText.trim();
      if (!inner) return '';
      return inner.split(/\n\n+/).map(function (s) { return s.trim(); }).filter(Boolean).join('\n\n');
    }
  };

  // Load data on page ready
  window.PortfolioApp.loadData();

  // --- Site update detection ---
  (function () {
    var POLL_INTERVAL = 60000;
    var loadedVersion = null;
    var latestRemoteVersion = null;
    var promptVisible = false;
    var dismissedVersion = null;

    function getVersionUrl() {
      if (window.location.pathname.indexOf('/projects/') !== -1) {
        return '../../version.json';
      }
      return './version.json';
    }

    function fetchVersion() {
      return fetch(getVersionUrl(), { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('version unavailable');
          return response.json();
        })
        .then(function (data) {
          return data && data.version ? String(data.version) : null;
        });
    }

    function showUpdatePrompt() {
      if (promptVisible || document.getElementById('update-modal-overlay')) return;
      promptVisible = true;

      var overlay = document.createElement('div');
      overlay.id = 'update-modal-overlay';
      overlay.className = 'update-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'update-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Site updated';
      modal.appendChild(heading);

      var message = document.createElement('p');
      message.textContent = 'A new version of this site is available. Reload to see the latest content.';
      modal.appendChild(message);

      var actions = document.createElement('div');
      actions.className = 'update-modal__actions';

      var laterBtn = document.createElement('button');
      laterBtn.type = 'button';
      laterBtn.textContent = 'Later';
      laterBtn.addEventListener('click', function () {
        dismissedVersion = latestRemoteVersion;
        overlay.remove();
        promptVisible = false;
      });

      var reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.className = 'update-modal__btn-primary';
      reloadBtn.textContent = 'Reload';
      reloadBtn.addEventListener('click', function () {
        if ('caches' in window) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (key) { return caches.delete(key); }));
          }).finally(performHardReload);
        } else {
          performHardReload();
        }
      });

      actions.appendChild(laterBtn);
      actions.appendChild(reloadBtn);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }

    function performHardReload() {
      var url = new URL(window.location.href);
      url.searchParams.set('_reload', Date.now().toString());
      window.location.replace(url.href);
    }

    function checkForUpdate() {
      fetchVersion()
        .then(function (remoteVersion) {
          if (!remoteVersion) return;

          if (loadedVersion === null) {
            loadedVersion = remoteVersion;
            return;
          }

          if (remoteVersion !== loadedVersion) {
            latestRemoteVersion = remoteVersion;
            if (remoteVersion !== dismissedVersion) {
              showUpdatePrompt();
            }
          }
        })
        .catch(function () {});
    }

    if (window.location.protocol === 'file:') return;

    fetchVersion()
      .then(function (version) {
        loadedVersion = version;
        setInterval(checkForUpdate, POLL_INTERVAL);
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
      })
      .catch(function () {});
  })();
})();
