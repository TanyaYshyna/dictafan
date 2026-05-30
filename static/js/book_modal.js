(function () {
  try {
    if (window.BookModal) return;

    function escapeHtml(s) {
      try {
        return String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      } catch (e) {
        return '';
      }
    }

    function getToken() {
      try {
        if (window.UM && window.UM.token) return window.UM.token;
      } catch (e) {
      }
      try {
        return localStorage.getItem('jwt_token');
      } catch (e) {
        return null;
      }
    }

    async function apiRequest(url, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const token = getToken();
      const headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = `Bearer ${token}`;
      if (!(opts.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      }

      const response = await fetch(url, Object.assign({}, opts, { headers, cache: 'no-store' }));

      if (response.status === 401 || response.status === 422) {
        try {
          if (window.UM) window.UM.requireAuth();
        } catch (e) {
        }
        throw new Error('Требуется авторизация');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json();
    }

    function showToast(message, opts) {
      try {
        if (window.DictationKart && typeof window.DictationKart._showToast === 'function') {
          window.DictationKart._showToast(message, opts);
          return;
        }
      } catch (e) {
      }

      const o = opts && typeof opts === 'object' ? opts : {};
      const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 4000;
      const sticky = o && o.sticky === true;

      let el = document.getElementById('auto-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'auto-toast';
        el.addEventListener('click', () => {
          try { el.style.display = 'none'; } catch (e) { }
        });
        document.body.appendChild(el);
      }

      el.textContent = message || '';
      el.style.display = 'block';

      if (el._hideTimer) window.clearTimeout(el._hideTimer);
      if (!sticky) {
        el._hideTimer = window.setTimeout(() => {
          try { el.style.display = 'none'; } catch (e) { }
        }, Math.max(0, durationMs));
      }
    }

    function showLoadingIndicator(message) {
      try {
        if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
          window.DesktopLoadingModal.show(message || 'Загрузка…');
          return;
        }
      } catch (e) {
      }

      try {
        if (window.DictationKart && typeof window.DictationKart._showLoadingIndicator === 'function') {
          window.DictationKart._showLoadingIndicator(message);
          return;
        }
      } catch (e) {
      }
    }

    function hideLoadingIndicator() {
      try {
        if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
          window.DesktopLoadingModal.hide();
          return;
        }
      } catch (e) {
      }

      try {
        if (window.DictationKart && typeof window.DictationKart._hideLoadingIndicator === 'function') {
          window.DictationKart._hideLoadingIndicator();
          return;
        }
      } catch (e) {
      }
    }

    const state = {
      activeBookId: null,
      activeBookIsWorkbook: false,
      bookViewActiveBookId: null,
      selectedDictationCard: null,

      bookEditDirty: false,
      bookLanguageSelector: null,

      lastLoadedBook: null,
    };

    function setBookEditDirty(nextDirty) {
      state.bookEditDirty = !!nextDirty;
      const star = document.getElementById('book-edit-unsaved-star');
      if (star) {
        star.style.display = state.bookEditDirty ? '' : 'none';
      }
    }

    function getDefaultOriginalLanguageForNewBook() {
      try {
        const v = window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage
          ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
          : '';
        return v || 'en';
      } catch (e) {
        return 'en';
      }
    }

    function getBookCroppedCoverBlob() {
      try {
        const m = window.CoverManager;
        if (m && typeof m.getCroppedBlob === 'function') {
          return m.getCroppedBlob('book');
        }
      } catch (e) {
      }
      return null;
    }

    function clearBookCroppedCoverBlob() {
      try {
        const m = window.CoverManager;
        if (m && typeof m.clearCroppedBlob === 'function') {
          m.clearCroppedBlob('book');
        }
      } catch (e) {
      }
    }

    function bindCoverHandlers() {
      try {
        const m = window.CoverManager;
        if (!m || typeof m.bind !== 'function') return;

        m.bind({
          kind: 'book',
          fileInputId: 'book-cover-upload',
          openFileBtnId: 'book-cover-upload-btn',
          clickablePreviewId: 'book-cover-clickable',
          previewImgId: 'book-cover-preview',
          placeholderId: 'book-cover-placeholder',
          cropModalId: 'crop-modal',
          cropImageId: 'crop-image',
          cropCloseId: 'crop-close',
          cropCancelId: 'crop-cancel',
          cropConfirmId: 'crop-confirm',
          maxFileSizeBytes: 5 * 1024 * 1024,
          successToast: 'Обложка готова к сохранению',
          onDirty: () => {
            try { setBookEditDirty(true); } catch (e) { }
          },
          onConfirm: () => {
            try { setBookEditDirty(true); } catch (e) { }
          },
        });
      } catch (e) {
      }
    }

    function openBookViewModal() {
      const modal = document.getElementById('book-view-modal');
      if (!modal) {
        try { console.warn('[BookModal] Missing #book-view-modal element in DOM'); } catch (e) {}
        try { showToast('Не найдено окно книги (book-view-modal)', { durationMs: 3500 }); } catch (e) {}
        return;
      }
      modal.style.display = 'flex';
      modal.classList.add('show');
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }
    }

    function closeBookViewModal() {
      const modal = document.getElementById('book-view-modal');
      if (!modal) return;
      modal.style.display = 'none';
      modal.classList.remove('show');
    }

    function openBookModal(book) {
      setBookEditDirty(false);

      const modal = document.getElementById('book-edit-modal');
      const titleEl = document.getElementById('book-edit-title');
      const idInput = document.getElementById('book-id-input');
      const titleInput = document.getElementById('book-title-input');
      const authorInput = document.getElementById('book-author-text-input');
      const themeInput = document.getElementById('book-theme-input');
      const visibilityInput = document.getElementById('book-visibility-input');
      const descInput = document.getElementById('book-description-input');
      const authorMaterialsUrlInput = document.getElementById('book-author-materials-url-input');
      const coverPreview = document.getElementById('book-cover-preview');
      const coverPlaceholder = document.getElementById('book-cover-placeholder');
      const coverUploadInput = document.getElementById('book-cover-upload');

      if (!modal) return;

      state.lastLoadedBook = book || null;

      if (book) {
        if (titleEl) titleEl.textContent = 'Редактирование книги';
        if (idInput) idInput.value = book.id;
        if (titleInput) titleInput.value = book.title || '';
        if (authorInput) authorInput.value = book.author_text || '';
        if (themeInput) themeInput.value = book.theme || '';
        if (visibilityInput) visibilityInput.value = book.visibility || 'private';
        if (descInput) descInput.value = book.short_description || '';
        if (authorMaterialsUrlInput) authorMaterialsUrlInput.value = book.author_materials_url || '';

        if (coverPreview && coverPlaceholder) {
          if (book.cover_url) {
            coverPreview.src = book.cover_url;
            coverPreview.style.display = 'block';
            coverPlaceholder.style.display = 'none';
          } else {
            coverPreview.style.display = 'none';
            coverPlaceholder.style.display = 'flex';
          }
        }
      } else {
        if (titleEl) titleEl.textContent = 'Новая книга';
        if (idInput) idInput.value = '';
        if (titleInput) titleInput.value = '';
        if (authorInput) authorInput.value = '';
        if (themeInput) themeInput.value = '';
        if (visibilityInput) visibilityInput.value = 'private';
        if (descInput) descInput.value = '';
        if (authorMaterialsUrlInput) authorMaterialsUrlInput.value = '';
        if (coverPreview && coverPlaceholder) {
          coverPreview.style.display = 'none';
          coverPlaceholder.style.display = 'flex';
          coverPreview.src = '';
        }
        if (coverUploadInput) coverUploadInput.value = '';
      }

      modal.style.display = 'flex';
      modal.classList.add('show');

      const defaultLang = book ? book.original_language : getDefaultOriginalLanguageForNewBook();
      initBookLanguageSelector(defaultLang);

      try {
        const trackIds = [
          'book-title-input',
          'book-author-text-input',
          'book-author-materials-url-input',
          'book-theme-input',
          'book-visibility-input',
          'book-description-input',
        ];
        trackIds.forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.dataset && el.dataset.bookDirtyBound === '1') return;
          if (el.dataset) el.dataset.bookDirtyBound = '1';
          el.addEventListener('input', () => setBookEditDirty(true));
          el.addEventListener('change', () => setBookEditDirty(true));
        });
      } catch (e) {
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }

      try {
        if (window.CoverManager) {
          bindCoverHandlers();
        }
      } catch (e) {
      }
    }

    function _doCloseBookModalNow() {
      const modal = document.getElementById('book-edit-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
      }
      setBookEditDirty(false);
      clearBookCroppedCoverBlob();
    }

    function requestCloseBookModal() {
      if (!state.bookEditDirty) {
        _doCloseBookModalNow();
        return;
      }

      try {
        if (window.DesktopConfirmModal && typeof window.DesktopConfirmModal.open === 'function') {
          window.DesktopConfirmModal.open({
            title: 'Сохранить изменения?',
            showSave: true,
            onDiscard: () => {
              _doCloseBookModalNow();
            },
            onSave: async () => {
              const ok = await handleSaveBook();
              if (ok) _doCloseBookModalNow();
            },
          });
          return;
        }
      } catch (e) {
      }

      _doCloseBookModalNow();
    }

    function closeBookModal() {
      requestCloseBookModal();
    }

    function initBookLanguageSelector(selectedLanguage) {
      const container = document.getElementById('book-language-selector');
      if (!container) return;
      container.innerHTML = '';

      const initSelector = () => {
        if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
          setTimeout(initSelector, 100);
          return;
        }

        const languageData = window.LanguageManager.getLanguageData();
        if (!languageData) return;

        const defaultLanguage = selectedLanguage || (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage) || 'en';

        if (typeof window.initLanguageSelector === 'function') {
          state.bookLanguageSelector = window.initLanguageSelector('book-language-selector', {
            mode: 'native-selector',
            nativeLanguage: defaultLanguage,
            languageData: languageData,
            onLanguageChange: function (_values) { },
          });
        }
      };

      initSelector();
    }

    async function handleSaveBook(evt) {
      try {
        if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      } catch (e) {
      }

      const idInput = document.getElementById('book-id-input');
      const titleInput = document.getElementById('book-title-input');
      const authorInput = document.getElementById('book-author-text-input');
      const themeInput = document.getElementById('book-theme-input');
      const visibilityInput = document.getElementById('book-visibility-input');
      const descInput = document.getElementById('book-description-input');
      const authorMaterialsUrlInput = document.getElementById('book-author-materials-url-input');
      const coverUploadInput = document.getElementById('book-cover-upload');

      const bookId = idInput && idInput.value ? parseInt(idInput.value, 10) : null;

      if (!titleInput || !String(titleInput.value || '').trim()) {
        showToast('Введите название книги', { durationMs: 2500 });
        return false;
      }

      let originalLanguage = '';
      if (state.bookLanguageSelector && typeof state.bookLanguageSelector.getValues === 'function') {
        const values = state.bookLanguageSelector.getValues();
        originalLanguage = values.nativeLanguage || '';
      }

      showLoadingIndicator('Сохранение книги...');

      try {
        let data;
        const token = getToken();

        const croppedBlob = getBookCroppedCoverBlob();
        const hasCover = croppedBlob || (coverUploadInput && coverUploadInput.files && coverUploadInput.files[0]);

        if (hasCover) {
          const formData = new FormData();
          formData.append('title', String(titleInput.value || '').trim());
          formData.append('author_text', String(authorInput && authorInput.value ? authorInput.value : '').trim());
          formData.append('original_language', String(originalLanguage || ''));
          formData.append('theme', String(themeInput && themeInput.value ? themeInput.value : '').trim());
          formData.append('visibility', String(visibilityInput && visibilityInput.value ? visibilityInput.value : 'private'));
          formData.append('short_description', String(descInput && descInput.value ? descInput.value : '').trim());
          if (authorMaterialsUrlInput) {
            formData.append('author_materials_url', String(authorMaterialsUrlInput.value || '').trim());
          }

          if (croppedBlob) {
            formData.append('cover', croppedBlob, 'cover.webp');
          } else {
            formData.append('cover', coverUploadInput.files[0]);
          }

          const headers = {};
          if (token) headers.Authorization = `Bearer ${token}`;

          if (bookId) {
            const response = await fetch(`/library/api/book/${bookId}`, {
              method: 'PATCH',
              headers,
              body: formData,
            });
            data = await response.json();
          } else {
            const response = await fetch('/library/api/book', {
              method: 'POST',
              headers,
              body: formData,
            });
            data = await response.json();
          }
        } else {
          const payload = {
            title: String(titleInput.value || '').trim(),
            author_text: String(authorInput && authorInput.value ? authorInput.value : '').trim(),
            original_language: String(originalLanguage || ''),
            theme: String(themeInput && themeInput.value ? themeInput.value : '').trim(),
            visibility: String(visibilityInput && visibilityInput.value ? visibilityInput.value : 'private'),
            short_description: String(descInput && descInput.value ? descInput.value : '').trim(),
          };

          if (authorMaterialsUrlInput) {
            payload.author_materials_url = String(authorMaterialsUrlInput.value || '').trim() || null;
          }

          if (bookId) {
            data = await apiRequest(`/library/api/book/${bookId}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            });
          } else {
            data = await apiRequest('/library/api/book', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          }
        }

        if (!data || !data.success) {
          hideLoadingIndicator();
          showToast((data && data.error) ? data.error : 'Ошибка сохранения книги');
          return false;
        }

        setBookEditDirty(false);
        clearBookCroppedCoverBlob();

        try {
          if (bookId && state.bookViewActiveBookId && Number(bookId) === Number(state.bookViewActiveBookId)) {
            await openBookViewBook(state.bookViewActiveBookId, state.activeBookIsWorkbook);
          }
        } catch (e) {
        }

        hideLoadingIndicator();
        showToast('Сохранено', { durationMs: 1500 });
        return true;
      } catch (error) {
        hideLoadingIndicator();
        showToast('Ошибка сохранения книги');
        return false;
      }
    }

    function renderActiveBookCard(book, container, options) {
      const target = container || document.getElementById('bookViewCard');
      if (!target) return;

      const opts = options && typeof options === 'object' ? options : {};

      const bookTitle = book && book.title ? String(book.title) : 'Книга';
      const creatorName = book && book.creator_name ? String(book.creator_name) : '';
      const finalAvatarUrl = book && book.creator_avatar_url ? String(book.creator_avatar_url) : '';
      const coverUrl = book && book.cover_url ? String(book.cover_url) : '';
      const visibility = book && book.visibility ? String(book.visibility) : '';

      const visibilityBadge = visibility
        ? `<span class="badge badge--${escapeHtml(visibility)}">${escapeHtml(visibility)}</span>`
        : '';

      const closeButton = '';

      const coverContent = coverUrl
        ? `<img src="${escapeHtml(coverUrl)}" alt="" class="book-card-max-cover-img" onerror="this.onerror=null;this.src='/static/data/covers/cover_en.webp'">`
        : `<div class="book-card-max-cover-placeholder"><i data-lucide="image"></i></div>`;

      target.innerHTML = `
        <div class="book-card-max">
          ${closeButton}
          <div class="book-card-max-cover-wrapper">
            <div class="book-card-max-cover">${coverContent}</div>
            <div class="book-card-max-creator">
              <div class="book-card-max-creator-avatar">
                ${finalAvatarUrl
                  ? `<img src="${escapeHtml(finalAvatarUrl)}" alt="${escapeHtml(creatorName)}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`
                  : '<i data-lucide="user"></i>'
                }
              </div>
              <div class="book-card-max-creator-name">${escapeHtml(creatorName)}</div>
            </div>
          </div>

          <div class="book-card-max-info">
            <div class="book-card-max-header">
              <div class="book-card-max-header-left">
                ${visibilityBadge}
                <div class="book-card-max-title-author-wrapper">
                  <h2 class="book-card-max-title">${escapeHtml(bookTitle)}</h2>
                  ${book && book.author_text ? `<p class="book-card-max-author">${escapeHtml(book.author_text)}</p>` : ''}
                </div>
              </div>
            </div>

            ${book && book.short_description ? `<p class="book-card-max-description">${escapeHtml(book.short_description)}</p>` : ''}

            <div class="book-card-max-actions">
              <div class="dropdown-menu-wrapper">
                <button class="book-card-max-btn dropdown-toggle btn-book-actions" type="button" title="Действия">
                  <i data-lucide="more-vertical"></i>
                </button>
                <div class="dropdown-menu book-actions-menu" style="display: none;">
                  <button class="dropdown-menu-item" data-action="edit-book" type="button">
                    <i data-lucide="edit-3"></i>
                    <span>Редактировать книгу</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const closeBtn = target.querySelector('.btn-close-active-book');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof opts.onClose === 'function') opts.onClose();
        });
      }

      const bookActionsBtn = target.querySelector('.btn-book-actions');
      const bookActionsMenu = target.querySelector('.book-actions-menu');
      if (bookActionsBtn && bookActionsMenu) {
        bookActionsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isVisible = bookActionsMenu.classList.contains('show');
          if (isVisible) {
            bookActionsMenu.classList.remove('show');
            bookActionsMenu.style.display = 'none';
          } else {
            bookActionsMenu.classList.add('show');
            bookActionsMenu.style.display = 'block';
            setTimeout(() => {
              const closeMenuHandler = function (ev) {
                if (!bookActionsMenu.contains(ev.target) && !bookActionsBtn.contains(ev.target)) {
                  bookActionsMenu.classList.remove('show');
                  bookActionsMenu.style.display = 'none';
                  document.removeEventListener('click', closeMenuHandler);
                }
              };
              document.addEventListener('click', closeMenuHandler);
            }, 0);
          }
        });

        bookActionsMenu.addEventListener('click', (e) => {
          const item = e.target.closest('.dropdown-menu-item');
          if (!item) return;
          e.preventDefault();
          e.stopPropagation();

          const action = item.getAttribute('data-action');
          bookActionsMenu.classList.remove('show');
          bookActionsMenu.style.display = 'none';

          if (action === 'edit-book') {
            openBookModal(book);
          }
        });
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(target ? { root: target } : undefined);
        }
      } catch (e) {
      }
    }

    function renderBookContentTo(container, sections, dictations, isWorkbook) {
      if (!container) return;

      const sList = Array.isArray(sections) ? sections : [];
      const dList = Array.isArray(dictations) ? dictations : [];

      if (!sList.length && !dList.length) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этой книге нет разделов и диктантов</div>';
        return;
      }

      const frag = document.createDocumentFragment();

      if (!isWorkbook && sList.length) {
        const wrap = document.createElement('div');
        wrap.className = 'book-structure-list';
        for (const section of sList) {
          const sectionNumber = section && section.order_index ? `§ ${section.order_index}. ` : '§ ';
          const div = document.createElement('div');
          div.className = 'structure-item structure-section';
          div.setAttribute('data-section-id', String(section.id));
          div.innerHTML = `
            <div class="structure-item-header">
              <button class="structure-item-toggle" data-section-id="${escapeHtml(String(section.id))}" type="button" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
              <span class="structure-item-title">${escapeHtml(sectionNumber)}${escapeHtml(String(section.title || ''))}</span>
            </div>
            <div class="structure-item-content" data-section-content-id="${escapeHtml(String(section.id))}" style="display: none;"></div>
          `;
          wrap.appendChild(div);
        }
        frag.appendChild(wrap);
      }

      if (dList.length) {
        const grid = document.createElement('div');
        grid.className = 'shorts-grid';
        for (const d of dList) {
          try {
            if (window.DictationKart && typeof window.DictationKart.createBookCardElement === 'function') {
              const el = window.DictationKart.createBookCardElement(d);
              if (el) {
                grid.appendChild(el);
                continue;
              }
            }
          } catch (e) {
          }

          try {
            if (window.DictationKart && typeof window.DictationKart.render === 'function') {
              const html = window.DictationKart.render(d, { context: 'book' });
              const el = window.DictationKart._createElementFromHtml(html);
              if (el) grid.appendChild(el);
            }
          } catch (e) {
          }
        }
        frag.appendChild(grid);
      }

      container.innerHTML = '';
      container.appendChild(frag);

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(container ? { root: container } : undefined);
        }
      } catch (e) {
      }

      // section toggles: lazy-load dictations per section
      try {
        container.querySelectorAll('.structure-item-toggle').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-section-id');
            const content = container.querySelector(`.structure-item-content[data-section-content-id="${CSS.escape(String(id))}"]`);
            if (!id || !content) return;

            const isOpen = content.style.display !== 'none';
            if (isOpen) {
              content.style.display = 'none';
              btn.classList.remove('expanded');
              return;
            }

            btn.classList.add('expanded');
            content.style.display = 'block';

            if (content.dataset.loaded === '1') return;
            content.dataset.loaded = '1';
            content.innerHTML = '<div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>';

            try {
              const dictationsData = await apiRequest(`/library/api/book/${encodeURIComponent(String(id))}/dictations`);
              const dictations = dictationsData && dictationsData.success ? (dictationsData.dictations || []) : [];
              renderBookContentTo(content, [], dictations, true);
            } catch (err) {
              content.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки</div>';
            }
          });
        });
      } catch (e) {
      }
    }

    async function openBookViewBook(bookId, isWorkbook) {
      const idNum = parseInt(String(bookId || ''), 10);
      if (!idNum || !isFinite(idNum)) return;

      openBookViewModal();

      state.bookViewActiveBookId = idNum;
      state.activeBookId = idNum;
      state.activeBookIsWorkbook = !!isWorkbook;

      const card = document.getElementById('bookViewCard');
      const structure = document.getElementById('bookViewStructure');
      if (!card || !structure) {
        try { console.warn('[BookModal] Missing #bookViewCard or #bookViewStructure element in DOM'); } catch (e) {}
        try { showToast('Не найдены элементы окна книги (bookViewCard/bookViewStructure)', { durationMs: 3500 }); } catch (e) {}
        try { closeBookViewModal(); } catch (e) {}
        return;
      }

      showLoadingIndicator('Загрузка книги...');
      try {
        const bookData = await apiRequest(`/library/api/book/${idNum}`);
        if (bookData && bookData.success && bookData.book) {
          const titleEl = document.getElementById('book-view-title');
          if (titleEl) titleEl.textContent = bookData.book.title || 'Книга';
          renderActiveBookCard(bookData.book, card, { onClose: closeBookViewModal });
        }

        let sections = [];
        let dictations = [];
        if (isWorkbook) {
          const orphanData = await apiRequest('/library/api/orphan-dictations');
          dictations = orphanData && orphanData.success ? (orphanData.dictations || []) : [];
        } else {
          const sectionsData = await apiRequest(`/library/api/book/${idNum}/sections`);
          const dictationsData = await apiRequest(`/library/api/book/${idNum}/dictations`);
          sections = sectionsData && sectionsData.success ? (sectionsData.sections || []) : [];
          dictations = dictationsData && dictationsData.success ? (dictationsData.dictations || []) : [];
        }

        renderBookContentTo(structure, sections, dictations, !!isWorkbook);
      } finally {
        hideLoadingIndicator();
      }
    }

    async function showDeskDictationInBook(dictationId) {
      showLoadingIndicator('Загрузка книги...');
      try {
        const raw = String(dictationId || '').trim();
        if (!raw) return;

        const numId = raw.startsWith('dict_')
          ? parseInt(raw.replace('dict_', ''), 10)
          : parseInt(raw, 10);
        if (!numId || !isFinite(numId)) {
          try { showToast('Некорректный id диктанта', { durationMs: 2500 }); } catch (e) { }
          return;
        }

        const data = await apiRequest(`/library/api/dictation/${numId}/book`);
        if (!data || !data.success || !data.book_id) {
          try {
            let wbId = state.__workbookBookId;
            if (!wbId) {
              const booksData = await apiRequest('/library/api/user-books');
              const own = (booksData && booksData.success) ? (booksData.own_books || []) : [];
              const wb = Array.isArray(own) ? own.find(b => b && b.is_workbook) : null;
              wbId = wb && wb.id ? Number(wb.id) : null;
              if (wbId) state.__workbookBookId = wbId;
            }
            if (wbId) {
              await openBookViewBook(wbId, true);
              setTimeout(() => {
                try {
                  const card = document.querySelector(`#book-view-modal .short-card[data-dictation-id="dict_${CSS.escape(String(numId))}"]`)
                    || document.querySelector(`#book-view-modal .short-card[data-dictation-id="${CSS.escape(String(raw))}"]`);
                  if (card) {
                    try {
                      if (state.selectedDictationCard && state.selectedDictationCard !== card) {
                        state.selectedDictationCard.classList.remove('short-card--selected');
                      }
                      card.classList.add('short-card--selected');
                      state.selectedDictationCard = card;
                    } catch (e2) {
                    }
                    try {
                      card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    } catch (e3) {
                      card.scrollIntoView();
                    }
                  }
                } catch (e) {
                }
              }, 150);
              return;
            }
          } catch (e) {
          }

          try { showToast('Этот диктант не находится ни в одной книге', { durationMs: 2500 }); } catch (e) { }
          return;
        }

        const directBookId = Number(data.book_id) || null;
        const rootBookId = Number(data.root_book_id) || directBookId;
        if (!rootBookId) {
          try { showToast('Не удалось определить книгу для диктанта', { durationMs: 2500 }); } catch (e) { }
          return;
        }

        await openBookViewBook(rootBookId, false);

        setTimeout(() => {
          try {
            const card = document.querySelector(`#book-view-modal .short-card[data-dictation-id="dict_${CSS.escape(String(numId))}"]`)
              || document.querySelector(`#book-view-modal .short-card[data-dictation-id="${CSS.escape(String(raw))}"]`);
            if (card) {
              try {
                if (state.selectedDictationCard && state.selectedDictationCard !== card) {
                  state.selectedDictationCard.classList.remove('short-card--selected');
                }
                card.classList.add('short-card--selected');
                state.selectedDictationCard = card;
              } catch (e2) {
              }
              try {
                card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
              } catch (e3) {
                card.scrollIntoView();
              }
            }
          } catch (e) {
          }
        }, 200);
      } catch (e) {
      }
      finally {
        hideLoadingIndicator();
      }
    }

    function _bindOnce() {
      const viewClose = document.getElementById('book-view-close');
      if (viewClose && viewClose.dataset.bound !== '1') {
        viewClose.dataset.bound = '1';
        viewClose.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeBookViewModal();
        });
      }

      const viewModal = document.getElementById('book-view-modal');
      if (viewModal && viewModal.dataset.bound !== '1') {
        viewModal.dataset.bound = '1';
        viewModal.addEventListener('click', (e) => {
          if (e && e.target === viewModal) closeBookViewModal();
        });
      }

      const editClose = document.getElementById('book-edit-close');
      if (editClose && editClose.dataset.bound !== '1') {
        editClose.dataset.bound = '1';
        editClose.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeBookModal();
        });
      }

      const editModal = document.getElementById('book-edit-modal');
      if (editModal && editModal.dataset.bound !== '1') {
        editModal.dataset.bound = '1';
        editModal.addEventListener('click', (e) => {
          if (e && e.target === editModal) closeBookModal();
        });
      }

      const form = document.getElementById('book-edit-form');
      if (form && form.dataset.bound !== '1') {
        form.dataset.bound = '1';
        form.addEventListener('submit', handleSaveBook);
      }
    }

    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bindOnce);
      } else {
        _bindOnce();
      }
    } catch (e) {
    }

    window.BookModal = {
      openBook: (bookId, isWorkbook) => openBookViewBook(bookId, !!isWorkbook),
      showDictationInBook: (dictationId) => showDeskDictationInBook(dictationId),
      openEdit: (book) => openBookModal(book),
      closeView: () => closeBookViewModal(),
      closeEdit: () => closeBookModal(),
    };
  } catch (e) {
  }
})();
