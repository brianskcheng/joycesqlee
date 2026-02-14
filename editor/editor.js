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

  var Editor = {
    active: false,
    data: null,
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

      // Wait for PortfolioApp to load data
      var checkReady = setInterval(function () {
        if (window.PortfolioApp && window.PortfolioApp.data) {
          clearInterval(checkReady);
          self.data = window.PortfolioApp.data;
          self.bindControls();
        }
      }, 100);
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
      var saveDraftBtn = document.getElementById('btn-save-draft');
      var publishBtn = document.getElementById('btn-publish');
      var settingsBtn = document.getElementById('btn-settings');
      var addProjectBtn = document.getElementById('btn-add-project');

      if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
          self.toggleEditMode();
        });
      }

      if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', function () {
          self.saveDraft();
        });
      }

      if (publishBtn) {
        publishBtn.addEventListener('click', function () {
          self.publish();
        });
      }

      if (settingsBtn) {
        settingsBtn.addEventListener('click', function () {
          self.showSettings();
        });
      }

      if (addProjectBtn) {
        addProjectBtn.addEventListener('click', function () {
          self.showAddProjectModal();
        });
      }
    },

    toggleEditMode: function () {
      // Password gate: require password on first activation per session
      if (!this.active && !this.unlocked) {
        var password = prompt('Enter editor password:');
        if (password === null) return;
        if (simpleHash(password) !== EDITOR_PASSWORD_HASH) {
          this.showToast('Incorrect password', true);
          return;
        }
        this.unlocked = true;
      }

      this.active = !this.active;
      document.body.classList.toggle('edit-mode', this.active);

      var toggleBtn = document.getElementById('edit-toggle');
      if (toggleBtn) {
        toggleBtn.classList.toggle('active', this.active);
        toggleBtn.textContent = this.active ? 'Exit Edit' : 'Edit';
      }

      if (this.active) {
        this.enableEditing();
      } else {
        this.disableEditing();
      }
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
      });
      this.makeEditable('site-subtitle', function (val) {
        self.data.site.subtitle = val;
      });
      this.makeEditable('site-tagline', function (val) {
        self.data.site.tagline = val;
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
        });
      }

      // Make type editable
      var typeEl = container.querySelector('.project-page__type');
      if (typeEl) {
        typeEl.setAttribute('contenteditable', 'true');
        typeEl.setAttribute('data-editable', 'type');
        typeEl.addEventListener('blur', function () {
          project.type = typeEl.textContent.trim();
        });
      }

      // Make descriptions editable
      var descEls = container.querySelectorAll('.project-page__description');
      descEls.forEach(function (el, idx) {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('data-editable', 'desc-' + idx);
        el.addEventListener('blur', function () {
          project.descriptions[idx] = el.innerHTML.trim();
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
          });
          valueEl.addEventListener('blur', function () {
            project.meta[idx].value = valueEl.textContent.trim();
          });
        }

        // Add remove button for meta item
        var removeMetaBtn = document.createElement('button');
        removeMetaBtn.className = 'edit-action-btn edit-action-btn--danger';
        removeMetaBtn.textContent = 'Remove';
        removeMetaBtn.addEventListener('click', function () {
          project.meta.splice(idx, 1);
          self.refreshProjectPage();
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
          if (val !== null) project.cardMeta = val;
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
        { name: 'title', label: 'Project Title', type: 'text', value: '' },
        { name: 'slug', label: 'URL Slug (lowercase, hyphens)', type: 'text', value: '' },
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
        self.showToast('Image added');
      });
    },

    showSettings: function () {
      var self = this;
      var currentToken = localStorage.getItem('github_token') || '';
      var currentRepo = localStorage.getItem('github_repo') || '';

      this.showModal('Settings', [
        { name: 'repo', label: 'GitHub Repository (owner/repo)', type: 'text', value: currentRepo, placeholder: 'e.g. username/joyce-portfolio' },
        { name: 'token', label: 'GitHub Personal Access Token', type: 'text', value: currentToken, placeholder: 'ghp_...' }
      ], function (values) {
        if (values.repo) localStorage.setItem('github_repo', values.repo);
        if (values.token) localStorage.setItem('github_token', values.token);
        self.showToast('Settings saved');
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

    // --- Save & Publish ---

    saveDraft: function () {
      localStorage.setItem('portfolio_draft', JSON.stringify(this.data));
      this.showToast('Draft saved');
    },

    publish: function () {
      var self = this;
      var token = localStorage.getItem('github_token');
      var repo = localStorage.getItem('github_repo');

      if (!token || !repo) {
        this.showSettings();
        this.showToast('Please configure GitHub settings first', true);
        return;
      }

      var statusEl = document.getElementById('editor-status');
      if (statusEl) statusEl.textContent = 'Publishing...';

      var content = btoa(unescape(encodeURIComponent(JSON.stringify(this.data, null, 2))));
      var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/data/projects.json';

      // First, get the current file SHA
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
        // Clear draft on successful publish
        localStorage.removeItem('portfolio_draft');
        if (statusEl) statusEl.textContent = 'Published';
        self.showToast('Published successfully');
        setTimeout(function () {
          if (statusEl) statusEl.textContent = 'Edit Mode';
        }, 3000);
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = 'Edit Mode';
        self.showToast('Publish failed: ' + err.message, true);
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
