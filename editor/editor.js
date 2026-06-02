/* ===== PORTFOLIO EDITOR ===== */

(function () {
  'use strict';

  var GITHUB_REPO = 'brianskcheng/joycesqlee';
  // Set after deploying publish-worker (see publish-worker/wrangler.toml)
  var PUBLISH_API_URL = 'https://joyce-portfolio-publish.brianskcheng.workers.dev';
  var LIVE_SITE_URL = 'https://joycesqlee.com';
  var DEPLOY_POLL_INTERVAL = 4000;
  var DEPLOY_MAX_WAIT = 300000;

  var Editor = {
    active: false,
    data: null,
    originalData: null,
    hasUnsavedChanges: false,
    toastTimer: null,
    uploadPreviews: {},
    publishDeployTimer: null,
    isPublishing: false,

    init: function () {
      var self = this;

      // Listen for secret keyboard shortcut: Ctrl+Shift+E to reveal editor
      document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
          e.preventDefault();
          self.revealEditButton();
        }
      });

      // Also allow ?admin URL parameter to reveal editor
      if (window.location.search.indexOf('admin') !== -1) {
        this.revealEditButton();
      }

      // Hidden setup: ?setup_token=ghp_xxx stores the token (one-time by developer)
      var urlParams = new URLSearchParams(window.location.search);
      var setupToken = urlParams.get('setup_token');
      if (setupToken) {
        urlParams.delete('setup_token');
        var cleanUrl = window.location.pathname;
        var remaining = urlParams.toString();
        if (remaining) cleanUrl += '?' + remaining;
        window.history.replaceState({}, '', cleanUrl);
        self.validateToken(setupToken)
          .then(function () {
            localStorage.setItem('github_token', setupToken);
            self.showToast('GitHub token saved');
          })
          .catch(function (err) {
            self.showToast('Token setup failed: ' + err.message, true);
          });
      }

      // Warn before leaving during publish or with unsaved changes
      window.addEventListener('beforeunload', function (e) {
        if (self.isPublishing) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
        if (self.hasUnsavedChanges) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      // Block navigation while publishing or when there are unsaved changes
      document.addEventListener('click', function (e) {
        var link = e.target.closest('a[href]');
        if (!link) return;
        var href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        if (self.isPublishing) {
          e.preventDefault();
          self.showPublishingWarning();
          return;
        }

        if (!self.hasUnsavedChanges) return;

        e.preventDefault();
        self.showUnsavedWarning(href);
      });

      // Wait for PortfolioApp to load data
      var checkReady = setInterval(function () {
        if (window.PortfolioApp && window.PortfolioApp.data) {
          clearInterval(checkReady);
          self.data = window.PortfolioApp.data;
          self.originalData = JSON.stringify(window.PortfolioApp.data);
          self.bindControls();
        }
      }, 100);
    },

    markChanged: function () {
      if (this.isPublishing) return;
      this.hasUnsavedChanges = true;
      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Unsaved Changes';
    },

    showUnsavedWarning: function (targetHref) {
      var self = this;
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Unsaved Changes';
      modal.appendChild(heading);

      var msg = document.createElement('p');
      msg.textContent = 'You have unpublished changes. Would you like to publish them or discard?';
      msg.style.marginBottom = '24px';
      modal.appendChild(msg);

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';

      var discardBtn = document.createElement('button');
      discardBtn.textContent = 'Discard';
      discardBtn.addEventListener('click', function () {
        self.hasUnsavedChanges = false;
        overlay.remove();
        if (targetHref) {
          window.location.href = targetHref;
        } else {
          // Restore original data and exit edit mode
          self.data = JSON.parse(self.originalData);
          window.PortfolioApp.data = self.data;
          self.active = false;
          document.body.classList.remove('edit-mode');
          var toggleBtn = document.getElementById('edit-toggle');
          if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = 'Edit';
          }
          window.PortfolioApp.render();
        }
      });

      var publishBtn = document.createElement('button');
      publishBtn.textContent = 'Publish';
      publishBtn.className = 'modal-btn-primary';
      publishBtn.addEventListener('click', function () {
        overlay.remove();
        self.publish(function () {
          if (targetHref) {
            window.location.href = targetHref;
          }
        });
      });

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(discardBtn);
      actions.appendChild(publishBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
    },

    showPublishingWarning: function () {
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Publishing in progress';
      modal.appendChild(heading);

      var msg = document.createElement('p');
      msg.textContent = 'Your changes are being deployed. Please stay on this page until publishing finishes.';
      msg.style.marginBottom = '24px';
      modal.appendChild(msg);

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';

      var okBtn = document.createElement('button');
      okBtn.className = 'modal-btn-primary';
      okBtn.textContent = 'OK';
      okBtn.addEventListener('click', function () {
        overlay.remove();
      });

      actions.appendChild(okBtn);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    },

    revealEditButton: function () {
      var toggleBtn = document.getElementById('edit-toggle');
      if (toggleBtn) {
        toggleBtn.style.display = 'inline-block';
      }
    },

    // --- Core Controls ---

    bindControls: function () {
      var self = this;
      var toggleBtn = document.getElementById('edit-toggle');
      var publishBtn = document.getElementById('btn-publish');
      var addProjectBtn = document.getElementById('btn-add-project');

      if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
          self.toggleEditMode();
        });
      }

      if (publishBtn) {
        publishBtn.addEventListener('click', function () {
          self.showPublishMenu();
        });
      }

      if (addProjectBtn) {
        addProjectBtn.addEventListener('click', function () {
          self.showAddProjectModal();
        });
      }

      var suggestBtn = document.getElementById('btn-suggest');
      if (suggestBtn) {
        suggestBtn.addEventListener('click', function () {
          self.startSuggestMode();
        });
      }
    },

    toggleEditMode: function () {
      if (this.isPublishing) {
        this.showPublishingWarning();
        return;
      }

      // If exiting edit mode with unsaved changes, warn
      if (this.active && this.hasUnsavedChanges) {
        this.showUnsavedWarning(null);
        return;
      }

      if (this.active) {
        this.exitEditMode();
      } else {
        this.enterEditMode();
      }
    },

    enterEditMode: function () {
      this.active = true;
      document.body.classList.add('edit-mode');

      var toggleBtn = document.getElementById('edit-toggle');
      if (toggleBtn) {
        toggleBtn.classList.add('active');
        toggleBtn.textContent = 'Exit Edit';
      }

      this.enableEditing();
    },

    exitEditMode: function () {
      this.active = false;
      document.body.classList.remove('edit-mode');

      var toggleBtn = document.getElementById('edit-toggle');
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = 'Edit';
      }

      this.disableEditing();
    },

    // --- Enable / Disable Editing ---

    enableEditing: function () {
      if (document.getElementById('projects-grid')) {
        this.enableHomepageEditing();
      }
      if (document.getElementById('project-content')) {
        this.enableProjectPageEditing();
      }
      if (document.getElementById('about-content')) {
        this.enableAboutPageEditing();
      }
      this.applyUploadPreviews();
    },

    disableEditing: function () {
      // Re-render to clean up edit controls
      this.data = window.PortfolioApp.data;
      window.PortfolioApp.render();
    },

    // --- Homepage Editing ---

    // --- Drag-to-Reorder State ---
    dragState: null,

    enableHomepageEditing: function () {
      var self = this;

      // Make site title, subtitle, tagline editable
      this.makeEditable('site-title', function (val) {
        self.data.site.title = val;
        self.markChanged();
      });
      this.makeEditable('site-subtitle', function (val) {
        self.data.site.subtitle = val;
        self.markChanged();
      });
      this.makeEditable('site-tagline', function (val) {
        self.data.site.tagline = val;
        self.markChanged();
      });

      // Add edit controls to each project card
      var cards = document.querySelectorAll('.project-card');
      cards.forEach(function (card, index) {
        // Prevent navigation in edit mode
        card.addEventListener('click', function (e) {
          if (self.active) e.preventDefault();
        });

        // --- Drag-to-Reorder ---
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-index', index);

        card.addEventListener('dragstart', function (e) {
          self.dragState = { fromIndex: index };
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', index);
        });

        card.addEventListener('dragend', function () {
          card.classList.remove('dragging');
          self.dragState = null;
          // Remove all drop indicators
          document.querySelectorAll('.project-card').forEach(function (c) {
            c.classList.remove('drag-over-before', 'drag-over-after');
          });
        });

        card.addEventListener('dragover', function (e) {
          if (!self.dragState) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';

          // Determine if cursor is in top or bottom half
          var rect = card.getBoundingClientRect();
          var midY = rect.top + rect.height / 2;
          var allCards = document.querySelectorAll('.project-card');
          allCards.forEach(function (c) {
            c.classList.remove('drag-over-before', 'drag-over-after');
          });

          if (e.clientY < midY) {
            card.classList.add('drag-over-before');
          } else {
            card.classList.add('drag-over-after');
          }
        });

        card.addEventListener('dragleave', function () {
          card.classList.remove('drag-over-before', 'drag-over-after');
        });

        card.addEventListener('drop', function (e) {
          e.preventDefault();
          if (!self.dragState) return;

          var fromIndex = self.dragState.fromIndex;
          var rect = card.getBoundingClientRect();
          var midY = rect.top + rect.height / 2;
          var toIndex = e.clientY < midY ? index : index + 1;

          // Adjust if dragging from before the drop target
          if (fromIndex < toIndex) toIndex--;

          if (fromIndex !== toIndex && toIndex >= 0 && toIndex < self.data.projects.length) {
            var project = self.data.projects.splice(fromIndex, 1)[0];
            self.data.projects.splice(toIndex, 0, project);
            window.PortfolioApp.data = self.data;
            window.PortfolioApp.render();
            self.enableEditing();
            self.markChanged();
          }

          self.dragState = null;
          document.querySelectorAll('.project-card').forEach(function (c) {
            c.classList.remove('dragging', 'drag-over-before', 'drag-over-after');
          });
        });

        // Add control buttons
        var controls = document.createElement('div');
        controls.className = 'card-edit-controls';

        var editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.showEditProjectModal(index);
        });

        var upBtn = document.createElement('button');
        upBtn.textContent = '\u2191';
        upBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.moveProject(index, -1);
        });

        var downBtn = document.createElement('button');
        downBtn.textContent = '\u2193';
        downBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.moveProject(index, 1);
        });

        var deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (confirm('Delete "' + self.data.projects[index].title + '"?')) {
            self.data.projects.splice(index, 1);
            window.PortfolioApp.data = self.data;
            window.PortfolioApp.render();
            self.enableEditing();
            self.markChanged();
          }
        });

        controls.appendChild(editBtn);
        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        controls.appendChild(deleteBtn);
        card.appendChild(controls);
      });
    },

    moveProject: function (index, direction) {
      var newIndex = index + direction;
      if (newIndex < 0 || newIndex >= this.data.projects.length) return;

      var projects = this.data.projects;
      var temp = projects[index];
      projects[index] = projects[newIndex];
      projects[newIndex] = temp;

      window.PortfolioApp.data = this.data;
      window.PortfolioApp.render();
      this.enableEditing();
      this.markChanged();
    },

    // --- Project Page Editing ---

    enableProjectPageEditing: function () {
      var self = this;
      var params = new URLSearchParams(window.location.search);
      var slug = params.get('slug');
      if (!slug) return;

      var projectIndex = -1;
      for (var i = 0; i < this.data.projects.length; i++) {
        if (this.data.projects[i].slug === slug) {
          projectIndex = i;
          break;
        }
      }
      if (projectIndex === -1) return;

      var project = this.data.projects[projectIndex];
      var container = document.getElementById('project-content');

      // Make title editable
      var titleEl = container.querySelector('.project-page__title');
      if (titleEl) {
        titleEl.setAttribute('contenteditable', 'true');
        titleEl.setAttribute('data-editable', 'title');
        titleEl.addEventListener('blur', function () {
          project.title = titleEl.textContent.trim();
          self.markChanged();
        });
      }

      // Make type editable
      var typeEl = container.querySelector('.project-page__type');
      if (typeEl) {
        typeEl.setAttribute('contenteditable', 'true');
        typeEl.setAttribute('data-editable', 'type');
        typeEl.addEventListener('blur', function () {
          project.type = typeEl.textContent.trim();
          self.markChanged();
        });
      }

      // Make descriptions editable
      var descEls = container.querySelectorAll('.project-page__description');
      descEls.forEach(function (el, idx) {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('data-editable', 'desc-' + idx);
        el.addEventListener('blur', function () {
          project.descriptions[idx] = el.innerHTML.trim();
          self.markChanged();
        });
      });

      // Add description controls
      var descParent = container.querySelector('.project-page__header > div');
      if (descParent) {
        var addDescBtn = document.createElement('button');
        addDescBtn.className = 'edit-action-btn';
        addDescBtn.textContent = '+ Add Paragraph';
        addDescBtn.addEventListener('click', function () {
          project.descriptions.push('New paragraph...');
          self.refreshProjectPage();
          self.markChanged();
        });
        descParent.appendChild(addDescBtn);

        // Add remove buttons for each description
        descEls.forEach(function (el, idx) {
          var removeBtn = document.createElement('button');
          removeBtn.className = 'edit-action-btn edit-action-btn--danger';
          removeBtn.textContent = 'Remove';
          removeBtn.style.marginLeft = '8px';
          removeBtn.style.marginTop = '0';
          removeBtn.addEventListener('click', function () {
            project.descriptions.splice(idx, 1);
            self.refreshProjectPage();
            self.markChanged();
          });
          el.parentNode.insertBefore(removeBtn, el.nextSibling);
        });
      }

      // Make meta items editable
      var metaItems = container.querySelectorAll('.project-page__meta-item');
      metaItems.forEach(function (item, idx) {
        var labelEl = item.querySelector('.label');
        var valueEl = item.querySelector('span:last-child');
        if (labelEl && valueEl) {
          labelEl.setAttribute('contenteditable', 'true');
          labelEl.setAttribute('data-editable', 'meta-label-' + idx);
          valueEl.setAttribute('contenteditable', 'true');
          valueEl.setAttribute('data-editable', 'meta-value-' + idx);
          labelEl.addEventListener('blur', function () {
            project.meta[idx].label = labelEl.textContent.trim();
            self.markChanged();
          });
          valueEl.addEventListener('blur', function () {
            project.meta[idx].value = valueEl.textContent.trim();
            self.markChanged();
          });
        }

        // Add remove button for meta item
        var removeMetaBtn = document.createElement('button');
        removeMetaBtn.className = 'edit-action-btn edit-action-btn--danger';
        removeMetaBtn.textContent = 'Remove';
        removeMetaBtn.addEventListener('click', function () {
          project.meta.splice(idx, 1);
          self.refreshProjectPage();
          self.markChanged();
        });
        item.appendChild(removeMetaBtn);
      });

      // Add meta button
      var metaParent = container.querySelector('.project-page__meta');
      if (metaParent) {
        var addMetaBtn = document.createElement('button');
        addMetaBtn.className = 'edit-action-btn';
        addMetaBtn.textContent = '+ Add Field';
        addMetaBtn.addEventListener('click', function () {
          project.meta.push({ label: 'Label', value: 'Value' });
          self.refreshProjectPage();
          self.markChanged();
        });
        metaParent.appendChild(addMetaBtn);
      }

      // Image controls
      var imagesContainer = container.querySelector('.project-page__images');
      if (imagesContainer) {
        // Add edit/remove buttons to each image
        var allImageDivs = imagesContainer.querySelectorAll('.project-page__image');
        allImageDivs.forEach(function (imgDiv, idx) {
          // Find the actual project image index by matching caption
          var captionEl = imgDiv.querySelector('.placeholder-text');
          var imgEl = imgDiv.querySelector('img');

          var controlsDiv = document.createElement('div');
          controlsDiv.style.display = 'flex';
          controlsDiv.style.gap = '4px';
          controlsDiv.style.position = 'absolute';
          controlsDiv.style.top = '8px';
          controlsDiv.style.right = '8px';
          imgDiv.style.position = 'relative';

          var setImgBtn = document.createElement('button');
          setImgBtn.className = 'edit-action-btn';
          setImgBtn.textContent = 'Set Image';
          setImgBtn.style.marginTop = '0';
          setImgBtn.addEventListener('click', function () {
            var imageIndex = self.findImageIndex(project, imgDiv);
            if (imageIndex === -1) return;
            self.showImageSourceModal(
              'Set Image',
              project.images[imageIndex].src || '',
              'projects/' + project.slug,
              function (src) {
                project.images[imageIndex].src = src;
                self.refreshProjectPage();
                self.markChanged();
              }
            );
          });

          var removeImgBtn = document.createElement('button');
          removeImgBtn.className = 'edit-action-btn edit-action-btn--danger';
          removeImgBtn.textContent = 'Remove';
          removeImgBtn.style.marginTop = '0';
          removeImgBtn.addEventListener('click', function () {
            var imageIndex = self.findImageIndex(project, imgDiv);
            if (imageIndex === -1) return;
            project.images.splice(imageIndex, 1);
            self.refreshProjectPage();
            self.markChanged();
          });

          controlsDiv.appendChild(setImgBtn);
          controlsDiv.appendChild(removeImgBtn);
          imgDiv.appendChild(controlsDiv);

          // Make caption editable
          if (captionEl) {
            captionEl.setAttribute('contenteditable', 'true');
            captionEl.setAttribute('data-editable', 'img-caption');
            captionEl.addEventListener('blur', function () {
              var imageIndex = self.findImageIndex(project, imgDiv);
              if (imageIndex !== -1) {
                project.images[imageIndex].caption = captionEl.textContent.trim();
                self.markChanged();
              }
            });
          }
        });

        // Add image button
        var addImageBtn = document.createElement('button');
        addImageBtn.className = 'edit-action-btn';
        addImageBtn.textContent = '+ Add Image';
        addImageBtn.addEventListener('click', function () {
          self.showAddImageModal(project);
        });
        imagesContainer.appendChild(addImageBtn);
      }

      // Card meta (for homepage card display)
      // Edit the cardMeta field via the project detail page
      var headerDiv = container.querySelector('.project-page__header');
      if (headerDiv) {
        var cardMetaBtn = document.createElement('button');
        cardMetaBtn.className = 'edit-action-btn';
        cardMetaBtn.textContent = 'Edit Card Display Text';
        cardMetaBtn.addEventListener('click', function () {
          var val = prompt('Card meta (shown on homepage):', project.cardMeta);
          if (val !== null) {
            project.cardMeta = val;
            self.markChanged();
          }
        });
        headerDiv.appendChild(cardMetaBtn);
      }
    },

    findImageIndex: function (project, imgDiv) {
      var captionEl = imgDiv.querySelector('.placeholder-text');
      var imgEl = imgDiv.querySelector('img');
      var caption = captionEl ? captionEl.textContent.trim() : (imgEl ? imgEl.alt : '');

      for (var i = 0; i < project.images.length; i++) {
        if (project.images[i].caption === caption) return i;
      }
      return -1;
    },

    refreshProjectPage: function () {
      window.PortfolioApp.data = this.data;
      window.PortfolioApp.renderProjectPage();
      this.enableProjectPageEditing();
      this.applyUploadPreviews();
    },

    refreshAboutPage: function () {
      window.PortfolioApp.data = this.data;
      window.PortfolioApp.renderAboutPage();
      this.enableAboutPageEditing();
      this.applyUploadPreviews();
    },

    // --- About Page Editing ---

    enableAboutPageEditing: function () {
      var self = this;
      if (!this.data.about) return;

      // Intro fields
      this.makeEditable('about-name', function (val) {
        self.data.about.name = val;
        self.markChanged();
      });
      this.makeEditable('about-title', function (val) {
        self.data.about.title = val;
        self.markChanged();
      });
      this.makeEditable('about-bio', function (val) {
        self.data.about.bio = val;
        self.markChanged();
      });

      var emailEl = document.getElementById('about-email');
      if (emailEl) {
        emailEl.setAttribute('contenteditable', 'true');
        emailEl.setAttribute('data-editable', 'about-email');
        emailEl.addEventListener('blur', function () {
          var val = emailEl.textContent.trim();
          self.data.about.email = val;
          emailEl.href = 'mailto:' + val;
          self.markChanged();
        });
      }

      var phoneEl = document.getElementById('about-phone');
      if (phoneEl) {
        phoneEl.setAttribute('contenteditable', 'true');
        phoneEl.setAttribute('data-editable', 'about-phone');
        phoneEl.addEventListener('blur', function () {
          var val = phoneEl.textContent.trim();
          self.data.about.phone = val;
          phoneEl.href = 'tel:' + val.replace(/\s/g, '');
          self.markChanged();
        });
      }

      // Photo control
      var photoEl = document.getElementById('about-photo');
      if (photoEl) {
        var photoBtn = document.createElement('button');
        photoBtn.className = 'edit-action-btn';
        photoBtn.textContent = 'Set Photo';
        photoBtn.style.marginTop = '8px';
        photoBtn.addEventListener('click', function () {
          self.showImageSourceModal(
            'Set Photo',
            self.data.about.photo || '',
            'portfolio',
            function (src) {
              self.data.about.photo = src;
              self.refreshAboutPage();
              self.markChanged();
            }
          );
        });
        photoEl.appendChild(photoBtn);
      }

      // Section titles and content
      (this.data.about.sections || []).forEach(function (section, sIdx) {
        var titleEl = document.querySelector('[data-section-title="' + sIdx + '"]');
        if (titleEl) {
          titleEl.setAttribute('contenteditable', 'true');
          titleEl.setAttribute('data-editable', 'section-title-' + sIdx);
          titleEl.addEventListener('blur', function () {
            section.title = titleEl.textContent.trim();
            self.markChanged();
          });
        }

        if (section.type === 'experience') {
          self.enableExperienceSectionEditing(section, sIdx);
        } else if (section.type === 'skills') {
          self.enableSkillsSectionEditing(section, sIdx);
        }
      });
    },

    enableExperienceSectionEditing: function (section, sIdx) {
      var self = this;
      var sectionEl = document.querySelector('.about-section[data-section-index="' + sIdx + '"]');
      if (!sectionEl) return;

      var items = sectionEl.querySelectorAll('.experience-item[data-section-index="' + sIdx + '"]');
      items.forEach(function (itemEl) {
        var iIdx = parseInt(itemEl.getAttribute('data-item-index'), 10);
        var item = section.items[iIdx];
        if (!item) return;

        ['date', 'role', 'org', 'desc'].forEach(function (field) {
          var fieldEl = itemEl.querySelector('[data-field="' + field + '"]');
          if (fieldEl) {
            fieldEl.setAttribute('contenteditable', 'true');
            fieldEl.setAttribute('data-editable', 'exp-' + sIdx + '-' + iIdx + '-' + field);
            fieldEl.addEventListener('blur', function () {
              item[field] = fieldEl.textContent.trim();
              self.markChanged();
            });
          }
        });

        var controls = document.createElement('div');
        controls.className = 'about-item-controls';
        controls.style.marginTop = '8px';

        var upBtn = document.createElement('button');
        upBtn.className = 'edit-action-btn';
        upBtn.textContent = '\u2191';
        upBtn.addEventListener('click', function () {
          if (iIdx > 0) {
            var temp = section.items[iIdx];
            section.items[iIdx] = section.items[iIdx - 1];
            section.items[iIdx - 1] = temp;
            self.refreshAboutPage();
            self.markChanged();
          }
        });

        var downBtn = document.createElement('button');
        downBtn.className = 'edit-action-btn';
        downBtn.textContent = '\u2193';
        downBtn.addEventListener('click', function () {
          if (iIdx < section.items.length - 1) {
            var temp = section.items[iIdx];
            section.items[iIdx] = section.items[iIdx + 1];
            section.items[iIdx + 1] = temp;
            self.refreshAboutPage();
            self.markChanged();
          }
        });

        var removeBtn = document.createElement('button');
        removeBtn.className = 'edit-action-btn edit-action-btn--danger';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', function () {
          if (confirm('Remove this entry?')) {
            section.items.splice(iIdx, 1);
            self.refreshAboutPage();
            self.markChanged();
          }
        });

        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        controls.appendChild(removeBtn);
        itemEl.querySelector('div').appendChild(controls);
      });

      var addBtn = document.createElement('button');
      addBtn.className = 'edit-action-btn';
      addBtn.textContent = '+ Add Entry';
      addBtn.addEventListener('click', function () {
        section.items.push({
          date: 'Date',
          role: 'Role',
          org: 'Organisation',
          desc: 'Description'
        });
        self.refreshAboutPage();
        self.markChanged();
      });
      sectionEl.appendChild(addBtn);
    },

    enableSkillsSectionEditing: function (section, sIdx) {
      var self = this;
      var sectionEl = document.querySelector('.about-section[data-section-index="' + sIdx + '"]');
      if (!sectionEl) return;

      var groups = sectionEl.querySelectorAll('.skills-group[data-section-index="' + sIdx + '"]');
      groups.forEach(function (groupEl) {
        var gIdx = parseInt(groupEl.getAttribute('data-group-index'), 10);
        var group = section.groups[gIdx];
        if (!group) return;

        var headingEl = groupEl.querySelector('[data-field="heading"]');
        if (headingEl) {
          headingEl.setAttribute('contenteditable', 'true');
          headingEl.setAttribute('data-editable', 'skill-heading-' + sIdx + '-' + gIdx);
          headingEl.addEventListener('blur', function () {
            group.heading = headingEl.textContent.trim();
            self.markChanged();
          });
        }

        var skillEls = groupEl.querySelectorAll('[data-field="skill"]');
        skillEls.forEach(function (skillEl) {
          var liEl = skillEl.closest('li');
          var skIdx = parseInt(liEl.getAttribute('data-skill-index'), 10);
          skillEl.setAttribute('contenteditable', 'true');
          skillEl.setAttribute('data-editable', 'skill-' + sIdx + '-' + gIdx + '-' + skIdx);
          skillEl.addEventListener('blur', function () {
            group.items[skIdx] = skillEl.textContent.trim();
            self.markChanged();
          });

          var removeSkillBtn = document.createElement('button');
          removeSkillBtn.className = 'edit-action-btn edit-action-btn--danger';
          removeSkillBtn.textContent = '\u00d7';
          removeSkillBtn.style.marginLeft = '4px';
          removeSkillBtn.style.padding = '0 6px';
          removeSkillBtn.addEventListener('click', function () {
            group.items.splice(skIdx, 1);
            self.refreshAboutPage();
            self.markChanged();
          });
          liEl.appendChild(removeSkillBtn);
        });

        var groupControls = document.createElement('div');
        groupControls.style.marginTop = '8px';

        var addSkillBtn = document.createElement('button');
        addSkillBtn.className = 'edit-action-btn';
        addSkillBtn.textContent = '+ Add Skill';
        addSkillBtn.addEventListener('click', function () {
          group.items.push('New skill');
          self.refreshAboutPage();
          self.markChanged();
        });

        var removeGroupBtn = document.createElement('button');
        removeGroupBtn.className = 'edit-action-btn edit-action-btn--danger';
        removeGroupBtn.textContent = 'Remove Group';
        removeGroupBtn.style.marginLeft = '8px';
        removeGroupBtn.addEventListener('click', function () {
          if (confirm('Remove this skills group?')) {
            section.groups.splice(gIdx, 1);
            self.refreshAboutPage();
            self.markChanged();
          }
        });

        groupControls.appendChild(addSkillBtn);
        groupControls.appendChild(removeGroupBtn);
        groupEl.appendChild(groupControls);
      });

      var addGroupBtn = document.createElement('button');
      addGroupBtn.className = 'edit-action-btn';
      addGroupBtn.textContent = '+ Add Group';
      addGroupBtn.style.marginTop = '16px';
      addGroupBtn.addEventListener('click', function () {
        section.groups.push({ heading: 'New Group', items: ['New skill'] });
        self.refreshAboutPage();
        self.markChanged();
      });
      sectionEl.appendChild(addGroupBtn);
    },

    // --- Inline Editable Helper ---

    makeEditable: function (elementId, onUpdate) {
      var el = document.getElementById(elementId);
      if (!el) return;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-editable', elementId);
      el.addEventListener('blur', function () {
        onUpdate(el.textContent.trim());
      });
    },

    // --- Modals ---

    showAddProjectModal: function () {
      if (this.isPublishing) {
        this.showPublishingWarning();
        return;
      }
      var self = this;
      this.showModal('Add New Project', [
        { name: 'title', label: 'Project Title', type: 'text', value: '', required: true },
        { name: 'slug', label: 'URL Slug (lowercase, hyphens)', type: 'text', value: '', required: true },
        { name: 'type', label: 'Project Type / Subtitle', type: 'text', value: '' },
        { name: 'cardMeta', label: 'Card Meta (e.g. Practice \u00b7 2025 \u00b7 Location)', type: 'text', value: '' },
        { name: 'description', label: 'Description', type: 'textarea', value: '' }
      ], function (values) {
        if (!values.title || !values.slug) {
          self.showToast('Title and slug are required', true);
          return;
        }

        // Auto-generate slug if empty
        var slug = values.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        self.data.projects.push({
          slug: slug,
          title: values.title,
          type: values.type || '',
          cardMeta: values.cardMeta || '',
          thumbnail: '',
          descriptions: values.description ? [values.description] : [''],
          meta: [],
          images: [],
          relatedProjects: []
        });

        window.PortfolioApp.data = self.data;
        window.PortfolioApp.render();
        self.enableEditing();
        self.markChanged();
        self.showToast('Project added');
      });
    },

    showEditProjectModal: function (index) {
      var self = this;
      var project = this.data.projects[index];
      var destDir = 'projects/' + project.slug;

      this.showModal('Edit Project', [
        { name: 'title', label: 'Project Title', type: 'text', value: project.title },
        { name: 'slug', label: 'URL Slug', type: 'text', value: project.slug },
        { name: 'type', label: 'Project Type / Subtitle', type: 'text', value: project.type },
        { name: 'cardMeta', label: 'Card Meta', type: 'text', value: project.cardMeta },
        { name: 'thumbnail', label: 'Thumbnail URL or path (optional)', type: 'text', value: project.thumbnail || '' },
        { name: 'thumbnailFile', label: 'Upload thumbnail from device', type: 'file', hint: 'JPEG, PNG, GIF, WebP. Uploaded immediately; may take ~1 min to appear on the live site.' }
      ], function (values) {
        var finish = function () {
          project.title = values.title || project.title;
          project.slug = values.slug || project.slug;
          project.type = values.type;
          project.cardMeta = values.cardMeta;
          if (!values.thumbnailFile) {
            project.thumbnail = values.thumbnail;
          }

          window.PortfolioApp.data = self.data;
          window.PortfolioApp.render();
          self.enableEditing();
          self.markChanged();
          self.showToast('Project updated');
        };

        if (values.thumbnailFile) {
          self.uploadImage(values.thumbnailFile, destDir, function (err, path) {
            if (!err && path) {
              project.thumbnail = path;
              finish();
            }
          });
        } else {
          finish();
        }
      });
    },

    showAddImageModal: function (project) {
      var self = this;
      var destDir = 'projects/' + project.slug;

      this.showModal('Add Image', [
        { name: 'caption', label: 'Caption / Description', type: 'text', value: '' },
        { name: 'src', label: 'Image URL or path (optional)', type: 'text', value: '' },
        { name: 'file', label: 'Upload from device', type: 'file', hint: 'JPEG, PNG, GIF, WebP. Uploaded immediately; may take ~1 min to appear on the live site.' },
        { name: 'layout', label: 'Layout', type: 'select', value: 'full', options: [
          { value: 'full', label: 'Full Width' },
          { value: 'half', label: 'Half Width' }
        ]}
      ], function (values) {
        var addImage = function (src) {
          project.images.push({
            src: src || '',
            caption: values.caption || 'New Image',
            layout: values.layout || 'full'
          });
          self.refreshProjectPage();
          self.markChanged();
          self.showToast('Image added');
        };

        if (values.file) {
          self.uploadImage(values.file, destDir, function (err, path) {
            if (!err && path) addImage(path);
          });
        } else {
          addImage(values.src ? values.src.trim() : '');
        }
      });
    },

    showImageSourceModal: function (title, currentSrc, destDir, onApply) {
      var self = this;
      this.showModal(title, [
        { name: 'src', label: 'Image URL or path (optional)', type: 'text', value: currentSrc || '' },
        { name: 'file', label: 'Upload from device', type: 'file', hint: 'JPEG, PNG, GIF, WebP. Uploaded immediately; may take ~1 min to appear on the live site.' }
      ], function (values) {
        if (values.file) {
          self.uploadImage(values.file, destDir, function (err, path) {
            if (!err && path) onApply(path);
          });
        } else if (values.src && values.src.trim()) {
          onApply(values.src.trim());
        } else {
          self.showToast('Enter a URL/path or choose a file', true);
        }
      });
    },

    sanitizeFilename: function (name) {
      var extMatch = name.match(/\.([^.]+)$/);
      var ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
      if (ext === 'jpeg') ext = 'jpg';
      if (['jpg', 'png', 'gif', 'webp'].indexOf(ext) === -1) ext = 'jpg';
      var base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
      return base + '-' + Date.now().toString(36) + '.' + ext;
    },

    prepareImageFile: function (file, callback) {
      var maxDim = 2400;
      var maxBytes = 4 * 1024 * 1024;
      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width;
        var h = img.height;
        var needsResize = w > maxDim || h > maxDim;

        if (!needsResize && file.size < maxBytes) {
          var reader = new FileReader();
          reader.onload = function () {
            var parts = reader.result.split(',');
            callback(null, parts[1], file.type || 'application/octet-stream', file.name);
          };
          reader.onerror = function () {
            callback(new Error('Failed to read file'));
          };
          reader.readAsDataURL(file);
          return;
        }

        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.round(w * scale);
        var ch = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);

        var isPng = file.type === 'image/png';
        var mime = isPng ? 'image/png' : 'image/jpeg';
        var dataUrl = canvas.toDataURL(mime, isPng ? undefined : 0.85);
        var b64 = dataUrl.split(',')[1];
        var newName = file.name.replace(/\.[^.]+$/, '') + (isPng ? '.png' : '.jpg');
        callback(null, b64, mime, newName);
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        callback(new Error('Invalid image file'));
      };

      img.src = url;
    },

    uploadImage: function (file, destDir, onDone) {
      var self = this;
      var token = this.getToken();

      if (!token) {
        this.promptForToken(function () {
          self.uploadImage(file, destDir, onDone);
        });
        return;
      }

      this.showToast('Uploading image...');

      this.prepareImageFile(file, function (err, b64, mime, suggestedName) {
        if (err) {
          self.showToast(err.message, true);
          if (onDone) onDone(err);
          return;
        }

        var filename = self.sanitizeFilename(suggestedName || file.name);
        var path = destDir.replace(/\/$/, '') + '/' + filename;
        var apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + path;

        fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Upload image: ' + filename,
            content: b64
          })
        })
          .then(function (response) {
            if (!response.ok) {
              return response.json().then(function (data) {
                var msg = (data && data.message) ? data.message : ('HTTP ' + response.status);
                throw new Error(msg);
              }).catch(function () {
                throw new Error('Upload failed (HTTP ' + response.status + ')');
              });
            }
            return response.json();
          })
          .then(function () {
            self.uploadPreviews[path] = 'data:' + mime + ';base64,' + b64;
            self.showToast('Image uploaded');
            if (onDone) onDone(null, path);
          })
          .catch(function (uploadErr) {
            self.showToast('Upload failed: ' + uploadErr.message, true);
            if (onDone) onDone(uploadErr);
          });
      });
    },

    applyUploadPreviews: function () {
      var previews = this.uploadPreviews;
      var keys = Object.keys(previews);
      if (!keys.length) return;

      document.querySelectorAll('img[src]').forEach(function (img) {
        var src = img.getAttribute('src') || '';
        for (var i = 0; i < keys.length; i++) {
          var path = keys[i];
          if (src === path || src.indexOf(path) !== -1) {
            img.src = previews[path];
            break;
          }
        }
      });
    },

    getToken: function () {
      return localStorage.getItem('github_token');
    },

    clearToken: function () {
      localStorage.removeItem('github_token');
    },

    usesPublishApi: function () {
      return !!PUBLISH_API_URL;
    },

    apiRequest: function (path, options) {
      var url = PUBLISH_API_URL.replace(/\/$/, '') + path;
      return fetch(url, options || {}).then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || ('Request failed (HTTP ' + response.status + ')'));
          }
          return data;
        });
      });
    },

    isAuthError: function (status) {
      return status === 401 || status === 403;
    },

    handleAuthFailure: function (callback) {
      this.clearToken();
      this.showToast('GitHub token expired or invalid. Please sign in again.', true);
      this.promptForToken(callback, true);
    },

    ensureAuth: function (callback) {
      if (this.usesPublishApi()) {
        callback();
        return;
      }
      var self = this;
      var token = this.getToken();
      if (!token) {
        this.promptForToken(function () {
          self.ensureAuth(callback);
        });
        return;
      }
      this.validateToken(token)
        .then(function () {
          callback();
        })
        .catch(function () {
          self.handleAuthFailure(callback);
        });
    },

    validateToken: function (token) {
      var apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO;
      return fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      .then(function (response) {
        if (response.status === 401) {
          throw new Error('Invalid token. Check that it has not expired.');
        }
        if (response.status === 404) {
          throw new Error('Token cannot access repository ' + GITHUB_REPO + '.');
        }
        if (!response.ok) {
          throw new Error('Token validation failed (HTTP ' + response.status + ').');
        }
        return response.json();
      })
      .then(function (repo) {
        if (repo.permissions && !repo.permissions.push) {
          throw new Error('Token does not have write access. Enable Contents read/write permission.');
        }
      });
    },

    promptForToken: function (callback, tokenExpired) {
      var self = this;
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = tokenExpired ? 'Token Expired' : 'Setup Required';
      modal.appendChild(heading);

      var instructions = document.createElement('div');
      instructions.style.marginBottom = '20px';
      instructions.style.color = '#666';
      instructions.style.fontSize = '14px';
      instructions.style.lineHeight = '1.6';
      instructions.innerHTML =
        (tokenExpired
          ? '<p style="margin-bottom:12px">Your saved GitHub token is no longer valid. Generate a new one and paste it below.</p>'
          : '<p style="margin-bottom:12px">A GitHub token is needed to publish. This is a one-time setup.</p>') +
        '<ol style="margin:0;padding-left:20px">' +
        '<li>Go to <strong>github.com/settings/tokens?type=beta</strong></li>' +
        '<li>Click <strong>Generate new token</strong></li>' +
        '<li>Select repository access: <strong>' + GITHUB_REPO + '</strong></li>' +
        '<li>Under Repository permissions, set <strong>Contents</strong> to <strong>Read and write</strong></li>' +
        '<li>Generate the token and paste it below</li>' +
        '</ol>' +
        '<p style="margin-top:12px;margin-bottom:0">Classic tokens also work: use the <strong>repo</strong> scope at <strong>github.com/settings/tokens</strong>.</p>';
      modal.appendChild(instructions);

      var fieldDiv = document.createElement('div');
      fieldDiv.className = 'editor-modal__field';

      var label = document.createElement('label');
      label.textContent = 'GitHub Token';
      var asterisk = document.createElement('span');
      asterisk.textContent = ' *';
      asterisk.style.color = '#c0392b';
      label.appendChild(asterisk);
      fieldDiv.appendChild(label);

      var input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'ghp_... or github_pat_...';
      fieldDiv.appendChild(input);

      modal.appendChild(fieldDiv);

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
      });

      var saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.className = 'modal-btn-primary';
      saveBtn.addEventListener('click', function () {
        var token = input.value.trim();
        if (!token) {
          self.showToast('Token is required', true);
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Validating...';
        self.validateToken(token)
          .then(function () {
            localStorage.setItem('github_token', token);
            overlay.remove();
            self.showToast('Token saved');
            if (callback) callback();
          })
          .catch(function (err) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            self.showToast(err.message, true);
          });
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
    },

    showModal: function (title, fields, onSubmit) {
      if (this.isPublishing) {
        this.showPublishingWarning();
        return;
      }

      // Remove existing modal if any
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = title;
      modal.appendChild(heading);

      var inputs = {};

      fields.forEach(function (field) {
        var fieldDiv = document.createElement('div');
        fieldDiv.className = 'editor-modal__field';

        var label = document.createElement('label');
        label.textContent = field.label;
        if (field.required) {
          var asterisk = document.createElement('span');
          asterisk.textContent = ' *';
          asterisk.style.color = '#c0392b';
          label.appendChild(asterisk);
        }
        fieldDiv.appendChild(label);

        if (field.hint) {
          var hint = document.createElement('p');
          hint.className = 'editor-modal__hint';
          hint.textContent = field.hint;
          fieldDiv.appendChild(hint);
        }

        if (field.type === 'textarea') {
          var textarea = document.createElement('textarea');
          textarea.value = field.value || '';
          if (field.placeholder) textarea.placeholder = field.placeholder;
          fieldDiv.appendChild(textarea);
          inputs[field.name] = textarea;
        } else if (field.type === 'select') {
          var select = document.createElement('select');
          (field.options || []).forEach(function (opt) {
            var option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === field.value) option.selected = true;
            select.appendChild(option);
          });
          fieldDiv.appendChild(select);
          inputs[field.name] = select;
        } else if (field.type === 'file') {
          var fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.className = 'editor-modal__file';
          fieldDiv.appendChild(fileInput);
          inputs[field.name] = fileInput;
        } else {
          var input = document.createElement('input');
          input.type = field.type || 'text';
          input.value = field.value || '';
          if (field.placeholder) input.placeholder = field.placeholder;
          fieldDiv.appendChild(input);
          inputs[field.name] = input;
        }

        modal.appendChild(fieldDiv);
      });

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
      });

      var saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.className = 'modal-btn-primary';
      saveBtn.addEventListener('click', function () {
        var values = {};
        for (var key in inputs) {
          var el = inputs[key];
          if (el.type === 'file') {
            values[key] = el.files && el.files[0] ? el.files[0] : null;
          } else {
            values[key] = el.value;
          }
        }
        overlay.remove();
        onSubmit(values);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
    },

    // --- Publish Menu ---

    showPublishMenu: function () {
      if (this.isPublishing) {
        this.showPublishingWarning();
        return;
      }

      var self = this;
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Publish';
      modal.appendChild(heading);

      var msg = document.createElement('p');
      msg.style.marginBottom = '24px';
      msg.style.color = '#666';
      msg.textContent = self.hasUnsavedChanges
        ? 'You have changes ready to publish.'
        : 'No new changes to publish. You can revert to a previous version.';
      modal.appendChild(msg);

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';
      actions.style.flexDirection = 'column';
      actions.style.gap = '12px';

      var publishBtn = document.createElement('button');
      publishBtn.className = 'modal-btn-primary';
      publishBtn.textContent = 'Publish Changes';
      publishBtn.style.width = '100%';
      publishBtn.style.padding = '12px 20px';
      if (!self.hasUnsavedChanges) {
        publishBtn.disabled = true;
        publishBtn.style.opacity = '0.4';
        publishBtn.style.cursor = 'default';
      }
      publishBtn.addEventListener('click', function () {
        if (!self.hasUnsavedChanges) return;
        overlay.remove();
        self.publish();
      });

      var revertBtn = document.createElement('button');
      revertBtn.textContent = 'Revert to Previous Version';
      revertBtn.style.width = '100%';
      revertBtn.style.padding = '12px 20px';
      revertBtn.addEventListener('click', function () {
        overlay.remove();
        self.showRevertModal();
      });

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.width = '100%';
      cancelBtn.style.padding = '12px 20px';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
      });

      actions.appendChild(publishBtn);
      actions.appendChild(revertBtn);
      actions.appendChild(cancelBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
    },

    // --- Publish ---

    setPublishStatus: function (text, state) {
      var statusEl = document.getElementById('editor-status');
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = 'editor-toolbar__status';
      if (state) {
        statusEl.classList.add('editor-toolbar__status--' + state);
      }
    },

    disablePublish: function (disabled) {
      var btn = document.getElementById('btn-publish');
      if (btn) {
        btn.disabled = disabled;
      }
    },

    setEditorControlsDisabled: function (disabled) {
      var ids = ['btn-publish', 'btn-add-project', 'btn-suggest', 'edit-toggle'];
      var i;
      for (i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el) el.disabled = disabled;
      }
    },

    setPublishing: function (active) {
      this.isPublishing = !!active;
      document.body.classList.toggle('editor-publishing', this.isPublishing);
      this.setEditorControlsDisabled(this.isPublishing);

      if (this.isPublishing) {
        var modal = document.getElementById('editor-modal-overlay');
        if (modal) modal.remove();
        if (this.suggestMode) {
          this.endSuggestMode();
        }
      }
    },

    ensureDeployBar: function () {
      if (document.getElementById('editor-deploy-bar')) return;
      var toolbar = document.getElementById('editor-toolbar');
      if (!toolbar) return;
      var bar = document.createElement('div');
      bar.id = 'editor-deploy-bar';
      bar.className = 'editor-deploy-bar';
      bar.innerHTML = '<div class="editor-deploy-bar__fill"></div>';
      toolbar.appendChild(bar);
    },

    hideDeployBar: function () {
      var bar = document.getElementById('editor-deploy-bar');
      if (bar) bar.remove();
    },

    getLiveDataUrl: function () {
      var host = window.location.hostname;
      if (host === 'joycesqlee.com' || host === 'www.joycesqlee.com') {
        return '/data/projects.json';
      }
      return LIVE_SITE_URL.replace(/\/$/, '') + '/data/projects.json';
    },

    contentFingerprint: function (data) {
      return JSON.stringify(data, null, 2);
    },

    fetchLiveContent: function () {
      return fetch(this.getLiveDataUrl() + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Live site not reachable');
          }
          return response.json();
        });
    },

    fetchDeployStatus: function (commitSha) {
      if (this.usesPublishApi()) {
        var query = commitSha ? '?sha=' + encodeURIComponent(commitSha) : '';
        return this.apiRequest('/deploy-status' + query);
      }

      var token = this.getToken();
      if (!token) {
        return Promise.resolve({ status: 'unknown' });
      }

      return fetch('https://api.github.com/repos/' + GITHUB_REPO + '/actions/runs?event=push&branch=main&per_page=10', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      .then(function (response) {
        if (!response.ok) {
          return { status: 'unknown' };
        }
        return response.json();
      })
      .then(function (data) {
        var runs = data.workflow_runs || [];
        var run = null;
        var i;

        if (commitSha) {
          for (i = 0; i < runs.length; i++) {
            if (runs[i].head_sha === commitSha) {
              run = runs[i];
              break;
            }
          }
        }
        if (!run && runs.length) {
          run = runs[0];
        }
        if (!run) {
          return { status: 'unknown' };
        }

        return {
          status: run.status,
          conclusion: run.conclusion,
          url: run.html_url
        };
      });
    },

    waitForLiveDeploy: function (fingerprint, commitSha) {
      var self = this;
      var started = Date.now();

      this.ensureDeployBar();
      this.setPublishing(true);
      this.setPublishStatus('Building site...', 'working');
      this.showToast('Changes saved — waiting for the live site to update', false, 0);

      return new Promise(function (resolve) {
        function poll() {
          if (Date.now() - started > DEPLOY_MAX_WAIT) {
            resolve({ timedOut: true });
            return;
          }

          self.fetchDeployStatus(commitSha)
            .then(function (deploy) {
              if (deploy.status === 'completed' && deploy.conclusion === 'failure') {
                throw new Error('GitHub Pages deployment failed');
              }
              if (deploy.status === 'queued' || deploy.status === 'waiting' || deploy.status === 'pending') {
                self.setPublishStatus('Queued for deployment...', 'working');
              } else if (deploy.status === 'in_progress') {
                self.setPublishStatus('Building site...', 'working');
              } else if (deploy.status === 'completed') {
                self.setPublishStatus('Updating live site...', 'working');
              } else {
                self.setPublishStatus('Deploying to site...', 'working');
              }

              return self.fetchLiveContent();
            })
            .then(function (liveData) {
              if (self.contentFingerprint(liveData) === fingerprint) {
                resolve({ live: true });
                return;
              }
              self.publishDeployTimer = setTimeout(poll, DEPLOY_POLL_INTERVAL);
            })
            .catch(function (err) {
              resolve({ error: err.message || 'Deployment check failed' });
            });
        }

        poll();
      }).then(function (result) {
        self.setPublishing(false);
        self.hideDeployBar();
        if (self.publishDeployTimer) {
          clearTimeout(self.publishDeployTimer);
          self.publishDeployTimer = null;
        }

        if (result.live) {
          self.setPublishStatus('Live on site', 'live');
          self.showToast('Your changes are now live on joycesqlee.com');
          setTimeout(function () {
            self.setPublishStatus('Edit Mode', '');
          }, 5000);
        } else if (result.timedOut) {
          self.setPublishStatus('Edit Mode', '');
          self.showToast('Changes saved — the site may still be updating. Check back in a minute.', false, 8000);
        } else if (result.error) {
          self.setPublishStatus('Edit Mode', '');
          self.showToast(result.error, true);
        }

        return result;
      });
    },

    publish: function (onSuccess) {
      var self = this;

      this.ensureAuth(function () {
        self.setPublishStatus('Saving changes...', 'working');
        self.setPublishing(true);

        var content = btoa(unescape(encodeURIComponent(JSON.stringify(self.data, null, 2))));
        var fingerprint = self.contentFingerprint(self.data);

        var publishPromise;
        if (self.usesPublishApi()) {
          publishPromise = self.apiRequest('/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
          });
        } else {
          publishPromise = self.publishViaGitHub(content);
        }

        publishPromise
          .then(function (result) {
            localStorage.removeItem('portfolio_draft');
            self.hasUnsavedChanges = false;
            self.originalData = JSON.stringify(self.data);
            var commitSha = result && result.sha ? result.sha : null;
            return self.waitForLiveDeploy(fingerprint, commitSha);
          })
          .then(function (result) {
            if (onSuccess && (!result || result.live || result.timedOut)) {
              onSuccess();
            }
          })
          .catch(function (err) {
            self.setPublishing(false);
            self.hideDeployBar();
            self.setPublishStatus('Edit Mode', '');
            if (err && err.authError) {
              self.handleAuthFailure(function () {
                self.publish(onSuccess);
              });
              return;
            }
            self.showToast('Publish failed: ' + (err.message || err), true);
          });
      });
    },

    publishViaGitHub: function (content) {
      var self = this;
      var token = this.getToken();
      var apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/projects.json';

      return fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      .then(function (response) {
        if (self.isAuthError(response.status)) {
          throw { authError: true, status: response.status };
        }
        if (response.status === 404) {
          return { sha: null };
        }
        if (!response.ok) {
          throw new Error('Failed to read file (HTTP ' + response.status + ')');
        }
        return response.json();
      })
      .then(function (fileData) {
        var body = {
          message: 'Update portfolio projects',
          content: content
        };
        if (fileData.sha) {
          body.sha = fileData.sha;
        }

        return fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      })
      .then(function (response) {
        if (self.isAuthError(response.status)) {
          throw { authError: true, status: response.status };
        }
        if (!response.ok) {
          throw new Error('Publish failed (HTTP ' + response.status + ')');
        }
        return response.json();
      })
      .then(function (data) {
        return { sha: data.commit && data.commit.sha ? data.commit.sha : null };
      });
    },

    // --- Revert ---

    showRevertModal: function () {
      if (this.isPublishing) {
        this.showPublishingWarning();
        return;
      }

      var self = this;

      this.ensureAuth(function () {
        var existing = document.getElementById('editor-modal-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'editor-modal-overlay';
        overlay.className = 'editor-modal-overlay open';

        var modal = document.createElement('div');
        modal.className = 'editor-modal';

        var heading = document.createElement('h3');
        heading.textContent = 'Revert to Previous Version';
        modal.appendChild(heading);

        var loading = document.createElement('p');
        loading.textContent = 'Loading version history...';
        loading.style.color = '#666';
        modal.appendChild(loading);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) overlay.remove();
        });

        var historyPromise;
        if (self.usesPublishApi()) {
          historyPromise = self.apiRequest('/history');
        } else {
          historyPromise = fetch('https://api.github.com/repos/' + GITHUB_REPO + '/commits?path=data/projects.json&per_page=10', {
            headers: {
              'Authorization': 'Bearer ' + self.getToken(),
              'Accept': 'application/vnd.github.v3+json'
            }
          })
          .then(function (response) { return response.json(); })
          .then(function (commits) {
            return (commits || []).map(function (commit) {
              return {
                sha: commit.sha,
                message: commit.commit.message,
                date: commit.commit.author.date
              };
            });
          });
        }

        historyPromise
      .then(function (commits) {
        loading.remove();

        if (!commits || !commits.length) {
          var none = document.createElement('p');
          none.textContent = 'No previous versions found.';
          modal.appendChild(none);
          return;
        }

        var list = document.createElement('div');
        list.style.maxHeight = '300px';
        list.style.overflowY = 'auto';

        // Skip the first commit (current version)
        var history = commits.slice(1);
        if (!history.length) {
          var noOlder = document.createElement('p');
          noOlder.textContent = 'No older versions available.';
          noOlder.style.color = '#666';
          modal.appendChild(noOlder);
          return;
        }

        history.forEach(function (commit) {
          var item = document.createElement('div');
          item.style.padding = '12px';
          item.style.borderBottom = '1px solid #eee';
          item.style.cursor = 'pointer';
          item.style.transition = 'background 0.2s';

          var date = new Date(commit.date);
          var dateStr = date.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });

          var dateEl = document.createElement('div');
          dateEl.style.fontWeight = '400';
          dateEl.textContent = dateStr;

          var msgEl = document.createElement('div');
          msgEl.style.fontSize = '13px';
          msgEl.style.color = '#888';
          msgEl.style.marginTop = '4px';
          msgEl.textContent = commit.message;

          item.appendChild(dateEl);
          item.appendChild(msgEl);

          item.addEventListener('mouseenter', function () {
            item.style.background = '#f5f5f5';
          });
          item.addEventListener('mouseleave', function () {
            item.style.background = '';
          });

          item.addEventListener('click', function () {
            if (confirm('Revert to version from ' + dateStr + '? This will replace your current content.')) {
              overlay.remove();
              self.revertToCommit(commit.sha);
            }
          });

          list.appendChild(item);
        });

        modal.appendChild(list);

        var cancelActions = document.createElement('div');
        cancelActions.className = 'editor-modal__actions';
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
          overlay.remove();
        });
        cancelActions.appendChild(cancelBtn);
        modal.appendChild(cancelActions);
      })
      .catch(function (err) {
        loading.textContent = 'Failed to load version history.';
        self.showToast('Error: ' + err.message, true);
      });
      });
    },

    revertToCommit: function (commitSha) {
      var self = this;
      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Reverting...';

      var contentPromise;
      if (this.usesPublishApi()) {
        contentPromise = this.apiRequest('/content?ref=' + encodeURIComponent(commitSha));
      } else {
        contentPromise = fetch('https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/projects.json?ref=' + commitSha, {
          headers: {
            'Authorization': 'Bearer ' + this.getToken(),
            'Accept': 'application/vnd.github.v3+json'
          }
        })
        .then(function (response) { return response.json(); })
        .then(function (fileData) {
          return { content: fileData.content.replace(/\n/g, '') };
        });
      }

      contentPromise
      .then(function (fileData) {
        var decoded = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
        var oldData = JSON.parse(decoded);

        // Set as current data
        self.data = oldData;
        window.PortfolioApp.data = oldData;
        self.markChanged();
        window.PortfolioApp.render();
        self.enableEditing();

        if (statusEl) statusEl.textContent = 'Reverted (unpublished)';
        self.showToast('Reverted successfully. Hit Publish to make it live.');
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = 'Edit Mode';
        self.showToast('Revert failed: ' + err.message, true);
      });
    },

    // --- Suggest Mode ---

    suggestMode: false,
    suggestHighlight: null,
    suggestHandlers: null,

    startSuggestMode: function () {
      if (this.isPublishing) {
        this.showPublishingWarning();
        return;
      }

      var self = this;
      this.suggestMode = true;
      document.body.classList.add('suggest-mode');

      var suggestBtn = document.getElementById('btn-suggest');
      if (suggestBtn) {
        suggestBtn.classList.add('active');
        suggestBtn.textContent = 'Cancel';
      }

      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Click an element to suggest an improvement';

      // Create highlight overlay
      this.suggestHighlight = document.createElement('div');
      this.suggestHighlight.className = 'suggest-highlight';
      document.body.appendChild(this.suggestHighlight);

      var ignoreTags = ['NAV', 'HTML', 'BODY', 'SCRIPT', 'STYLE', 'LINK', 'META'];

      function onMouseMove(e) {
        var el = e.target;
        if (!el || ignoreTags.indexOf(el.tagName) !== -1) return;
        if (el.closest('.nav') || el.closest('.editor-toolbar') || el.closest('.suggest-highlight')) return;

        var rect = el.getBoundingClientRect();
        self.suggestHighlight.style.top = (rect.top + window.scrollY) + 'px';
        self.suggestHighlight.style.left = (rect.left + window.scrollX) + 'px';
        self.suggestHighlight.style.width = rect.width + 'px';
        self.suggestHighlight.style.height = rect.height + 'px';
        self.suggestHighlight.style.display = 'block';
      }

      function onClick(e) {
        var el = e.target;
        if (!el || ignoreTags.indexOf(el.tagName) !== -1) return;
        if (el.closest('.nav') || el.closest('.editor-toolbar') || el.closest('.suggest-highlight')) return;
        if (el.id === 'btn-suggest' || el.closest('#btn-suggest')) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Gather element context
        var elementDesc = self.describeElement(el);
        self.endSuggestMode();
        self.showSuggestModal(elementDesc);
      }

      // Cancel on Escape or clicking Suggest button again
      function onKeydown(e) {
        if (e.key === 'Escape') {
          self.endSuggestMode();
        }
      }

      function onSuggestBtnClick() {
        self.endSuggestMode();
      }

      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeydown);
      if (suggestBtn) {
        suggestBtn.addEventListener('click', onSuggestBtnClick);
      }

      this.suggestHandlers = {
        mousemove: onMouseMove,
        click: onClick,
        keydown: onKeydown,
        btnClick: onSuggestBtnClick
      };
    },

    endSuggestMode: function () {
      this.suggestMode = false;
      document.body.classList.remove('suggest-mode');

      var suggestBtn = document.getElementById('btn-suggest');
      if (suggestBtn) {
        suggestBtn.classList.remove('active');
        suggestBtn.textContent = 'Suggest';
      }

      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Edit Mode';

      if (this.suggestHighlight) {
        this.suggestHighlight.remove();
        this.suggestHighlight = null;
      }

      if (this.suggestHandlers) {
        document.removeEventListener('mousemove', this.suggestHandlers.mousemove, true);
        document.removeEventListener('click', this.suggestHandlers.click, true);
        document.removeEventListener('keydown', this.suggestHandlers.keydown);
        var suggestBtn2 = document.getElementById('btn-suggest');
        if (suggestBtn2) {
          suggestBtn2.removeEventListener('click', this.suggestHandlers.btnClick);
        }
        this.suggestHandlers = null;
      }
    },

    describeElement: function (el) {
      var tag = el.tagName.toLowerCase();
      var text = (el.textContent || '').trim();
      if (text.length > 80) text = text.substring(0, 80) + '...';

      // Build a readable description
      var parts = [];

      // Check for meaningful class names
      var cls = el.className;
      if (typeof cls === 'string' && cls) {
        var meaningful = cls.split(/\s+/).filter(function (c) {
          return c && !c.startsWith('edit-') && !c.startsWith('card-edit');
        });
        if (meaningful.length) parts.push('.' + meaningful[0]);
      }

      // Check for identifiable parent context
      var section = el.closest('section, article, footer, .hero, .about-page, .project-page');
      if (section) {
        var sectionCls = section.className || section.tagName.toLowerCase();
        parts.push('in ' + sectionCls.split(/\s+/)[0]);
      }

      var desc = tag;
      if (parts.length) desc += ' (' + parts.join(' ') + ')';

      return {
        element: desc,
        text: text,
        page: window.location.pathname.split('/').pop() || 'index.html'
      };
    },

    showSuggestModal: function (elementDesc) {
      var self = this;
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Suggest an Improvement';
      modal.appendChild(heading);

      // Show selected element context
      var contextDiv = document.createElement('div');
      contextDiv.className = 'suggest-context';
      var contextLabel = document.createElement('span');
      contextLabel.className = 'suggest-context__label';
      contextLabel.textContent = 'Selected element';
      contextDiv.appendChild(contextLabel);
      var contextText = document.createElement('span');
      contextText.className = 'suggest-context__text';
      contextText.textContent = elementDesc.text || elementDesc.element;
      contextDiv.appendChild(contextText);
      modal.appendChild(contextDiv);

      // Suggestion textarea
      var fieldDiv = document.createElement('div');
      fieldDiv.className = 'editor-modal__field';
      var label = document.createElement('label');
      label.textContent = 'What should be improved?';
      fieldDiv.appendChild(label);
      var textarea = document.createElement('textarea');
      textarea.placeholder = 'Describe what you\'d like changed...';
      textarea.style.minHeight = '100px';
      fieldDiv.appendChild(textarea);
      modal.appendChild(fieldDiv);

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
      });

      var submitBtn = document.createElement('button');
      submitBtn.textContent = 'Submit';
      submitBtn.className = 'modal-btn-primary';
      submitBtn.addEventListener('click', function () {
        var suggestion = textarea.value.trim();
        if (!suggestion) {
          self.showToast('Please describe the improvement', true);
          textarea.focus();
          return;
        }
        overlay.remove();
        self.submitSuggestion(elementDesc, suggestion);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(submitBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      setTimeout(function () { textarea.focus(); }, 50);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
    },

    submitSuggestion: function (elementDesc, suggestion) {
      var title = encodeURIComponent('Suggestion: ' + (elementDesc.text || elementDesc.element).substring(0, 60));
      var body = encodeURIComponent(
        '**Page:** ' + elementDesc.page + '\n' +
        '**Element:** ' + elementDesc.element + '\n' +
        '**Content:** ' + (elementDesc.text || '(no text)') + '\n\n' +
        '**Suggestion:**\n' + suggestion
      );

      var url = 'https://github.com/' + GITHUB_REPO + '/issues/new?labels=suggestion&title=' + title + '&body=' + body;
      window.open(url, '_blank');
      this.showToast('Suggestion opened in GitHub');
    },

    // --- Toast ---

    showToast: function (message, isError, duration) {
      var existing = document.querySelector('.editor-toast');
      if (existing) existing.remove();

      var toast = document.createElement('div');
      toast.className = 'editor-toast' + (isError ? ' error' : '');
      toast.textContent = message;
      document.body.appendChild(toast);

      requestAnimationFrame(function () {
        toast.classList.add('visible');
      });

      clearTimeout(this.toastTimer);
      if (duration !== 0) {
        var ms = duration !== undefined ? duration : 3000;
        this.toastTimer = setTimeout(function () {
          toast.classList.remove('visible');
          setTimeout(function () { toast.remove(); }, 300);
        }, ms);
      }
    }
  };

  // Initialize
  Editor.init();
})();
