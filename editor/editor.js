/* ===== PORTFOLIO EDITOR ===== */

(function () {
  'use strict';

  // Simple hash function for password verification (not cryptographic, but sufficient for client-side gating)
  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  var EDITOR_PASSWORD_HASH = 1420961128;

  var GITHUB_REPO = 'brianskcheng/joyce-portfolio';

  var Editor = {
    active: false,
    data: null,
    originalData: null,
    hasUnsavedChanges: false,
    toastTimer: null,
    unlocked: false,

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
        localStorage.setItem('github_token', setupToken);
        // Clean URL to hide the token
        urlParams.delete('setup_token');
        var cleanUrl = window.location.pathname;
        var remaining = urlParams.toString();
        if (remaining) cleanUrl += '?' + remaining;
        window.history.replaceState({}, '', cleanUrl);
      }

      // Warn before leaving with unsaved changes
      window.addEventListener('beforeunload', function (e) {
        if (self.hasUnsavedChanges) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      // Intercept link clicks when there are unsaved changes
      document.addEventListener('click', function (e) {
        if (!self.hasUnsavedChanges) return;
        var link = e.target.closest('a[href]');
        if (!link) return;
        var href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

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
    },

    toggleEditMode: function () {
      var self = this;

      // Password gate: require password on first activation per session
      if (!this.active && !this.unlocked) {
        this.showPasswordPrompt(function () {
          self.unlocked = true;
          self.enterEditMode();
        });
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

    showPasswordPrompt: function (onSuccess) {
      var self = this;
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Enter Password';
      modal.appendChild(heading);

      var fieldDiv = document.createElement('div');
      fieldDiv.className = 'editor-modal__field';

      var label = document.createElement('label');
      label.textContent = 'Password';
      fieldDiv.appendChild(label);

      var input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'Enter editor password';
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitBtn.click();
      });
      fieldDiv.appendChild(input);

      modal.appendChild(fieldDiv);

      var actions = document.createElement('div');
      actions.className = 'editor-modal__actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
      });

      var submitBtn = document.createElement('button');
      submitBtn.textContent = 'Enter';
      submitBtn.className = 'modal-btn-primary';
      submitBtn.addEventListener('click', function () {
        var password = input.value;
        if (simpleHash(password) !== EDITOR_PASSWORD_HASH) {
          self.showToast('Incorrect password', true);
          input.value = '';
          input.focus();
          return;
        }
        overlay.remove();
        if (onSuccess) onSuccess();
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(submitBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Focus the input
      setTimeout(function () { input.focus(); }, 50);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
    },

    // --- Enable / Disable Editing ---

    enableEditing: function () {
      if (document.getElementById('projects-grid')) {
        this.enableHomepageEditing();
      }
      if (document.getElementById('project-content')) {
        this.enableProjectPageEditing();
      }
    },

    disableEditing: function () {
      // Re-render to clean up edit controls
      this.data = window.PortfolioApp.data;
      window.PortfolioApp.render();
    },

    // --- Homepage Editing ---

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

          // Image URL button
          var urlBtn = document.createElement('button');
          urlBtn.className = 'edit-action-btn';
          urlBtn.textContent = 'Set Image URL';
          urlBtn.style.marginTop = '0';
          urlBtn.addEventListener('click', function () {
            var imageIndex = self.findImageIndex(project, imgDiv);
            if (imageIndex === -1) return;
            var url = prompt('Enter image URL:', project.images[imageIndex].src || '');
            if (url !== null) {
              project.images[imageIndex].src = url;
              self.refreshProjectPage();
              self.markChanged();
            }
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

          controlsDiv.appendChild(urlBtn);
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

      this.showModal('Edit Project', [
        { name: 'title', label: 'Project Title', type: 'text', value: project.title },
        { name: 'slug', label: 'URL Slug', type: 'text', value: project.slug },
        { name: 'type', label: 'Project Type / Subtitle', type: 'text', value: project.type },
        { name: 'cardMeta', label: 'Card Meta', type: 'text', value: project.cardMeta },
        { name: 'thumbnail', label: 'Thumbnail URL', type: 'text', value: project.thumbnail || '' }
      ], function (values) {
        project.title = values.title || project.title;
        project.slug = values.slug || project.slug;
        project.type = values.type;
        project.cardMeta = values.cardMeta;
        project.thumbnail = values.thumbnail;

        window.PortfolioApp.data = self.data;
        window.PortfolioApp.render();
        self.enableEditing();
        self.markChanged();
        self.showToast('Project updated');
      });
    },

    showAddImageModal: function (project) {
      var self = this;
      this.showModal('Add Image', [
        { name: 'caption', label: 'Caption / Description', type: 'text', value: '' },
        { name: 'src', label: 'Image URL (optional)', type: 'text', value: '' },
        { name: 'layout', label: 'Layout', type: 'select', value: 'full', options: [
          { value: 'full', label: 'Full Width' },
          { value: 'half', label: 'Half Width' }
        ]}
      ], function (values) {
        project.images.push({
          src: values.src || '',
          caption: values.caption || 'New Image',
          layout: values.layout || 'full'
        });
        self.refreshProjectPage();
        self.markChanged();
        self.showToast('Image added');
      });
    },

    getToken: function () {
      return localStorage.getItem('github_token');
    },

    promptForToken: function (callback) {
      var self = this;
      var existing = document.getElementById('editor-modal-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'editor-modal-overlay';
      overlay.className = 'editor-modal-overlay open';

      var modal = document.createElement('div');
      modal.className = 'editor-modal';

      var heading = document.createElement('h3');
      heading.textContent = 'Setup Required';
      modal.appendChild(heading);

      var instructions = document.createElement('div');
      instructions.style.marginBottom = '20px';
      instructions.style.color = '#666';
      instructions.style.fontSize = '14px';
      instructions.style.lineHeight = '1.6';
      instructions.innerHTML =
        '<p style="margin-bottom:12px">A GitHub token is needed to publish. This is a one-time setup.</p>' +
        '<ol style="margin:0;padding-left:20px">' +
        '<li>Go to <strong>github.com/settings/tokens</strong></li>' +
        '<li>Click <strong>Generate new token (classic)</strong></li>' +
        '<li>Give it a name (e.g. "Portfolio Editor")</li>' +
        '<li>Select the <strong>repo</strong> scope</li>' +
        '<li>Click <strong>Generate token</strong> and paste it below</li>' +
        '</ol>';
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
      input.type = 'text';
      input.placeholder = 'ghp_...';
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
        localStorage.setItem('github_token', token);
        overlay.remove();
        self.showToast('Token saved');
        if (callback) callback();
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
          values[key] = inputs[key].value;
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

    publish: function (onSuccess) {
      var self = this;
      var token = this.getToken();

      if (!token) {
        this.promptForToken(function () {
          self.publish(onSuccess);
        });
        return;
      }

      var repo = GITHUB_REPO;
      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Publishing...';

      var content = btoa(unescape(encodeURIComponent(JSON.stringify(this.data, null, 2))));
      var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/data/projects.json';

      fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      .then(function (response) {
        if (response.status === 404) {
          return { sha: null };
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
        if (!response.ok) {
          throw new Error('Publish failed (HTTP ' + response.status + ')');
        }
        return response.json();
      })
      .then(function () {
        localStorage.removeItem('portfolio_draft');
        self.hasUnsavedChanges = false;
        self.originalData = JSON.stringify(self.data);
        if (statusEl) statusEl.textContent = 'Published';
        self.showToast('Published successfully');
        setTimeout(function () {
          if (statusEl) statusEl.textContent = 'Edit Mode';
        }, 3000);
        if (onSuccess) onSuccess();
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = 'Edit Mode';
        self.showToast('Publish failed: ' + err.message, true);
      });
    },

    // --- Revert ---

    showRevertModal: function () {
      var self = this;
      var token = this.getToken();

      if (!token) {
        this.promptForToken(function () {
          self.showRevertModal();
        });
        return;
      }

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

      // Fetch commit history for projects.json
      var apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/commits?path=data/projects.json&per_page=10';
      fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      .then(function (response) { return response.json(); })
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

          var date = new Date(commit.commit.author.date);
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
          msgEl.textContent = commit.commit.message;

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
    },

    revertToCommit: function (commitSha) {
      var self = this;
      var token = this.getToken();
      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Reverting...';

      // Fetch the file content at that commit
      var apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/projects.json?ref=' + commitSha;
      fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      .then(function (response) { return response.json(); })
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

    // --- Toast ---

    showToast: function (message, isError) {
      var existing = document.querySelector('.editor-toast');
      if (existing) existing.remove();

      var toast = document.createElement('div');
      toast.className = 'editor-toast' + (isError ? ' error' : '');
      toast.textContent = message;
      document.body.appendChild(toast);

      // Trigger animation
      requestAnimationFrame(function () {
        toast.classList.add('visible');
      });

      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(function () {
        toast.classList.remove('visible');
        setTimeout(function () { toast.remove(); }, 300);
      }, 3000);
    }
  };

  // Initialize
  Editor.init();
})();
