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

    function withCacheBust(url) {
      try {
        if (window.CoverManager && typeof window.CoverManager.withCacheBust === 'function') {
          return window.CoverManager.withCacheBust(url);
        }
      } catch (e) {
      }
      return String(url || '');
    }

    function withCacheBustVersion(url, version) {
      try {
        if (window.CoverManager && typeof window.CoverManager.withCacheBustVersion === 'function') {
          return window.CoverManager.withCacheBustVersion(url, version);
        }
      } catch (e) {
      }
      return withCacheBust(url);
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

    function getBookViewCacheKey(bookId, isWorkbook) {
      return `book_view:${Number(bookId)}:${isWorkbook ? 'wb' : 'book'}`;
    }

    function getSectionDictationsCacheKey(sectionId) {
      return `book_view:section:${Number(sectionId)}`;
    }

    async function readBookViewCache(bookId, isWorkbook) {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbGet !== 'function') return null;
        const row = await idb.idbGet('book_view', getBookViewCacheKey(bookId, isWorkbook));
        return (row && row.data) ? row.data : null;
      } catch (e) {
        return null;
      }
    }

    async function writeBookViewCache(bookId, isWorkbook, data) {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbPut !== 'function') return;
        await idb.idbPut('book_view', {
          key: getBookViewCacheKey(bookId, isWorkbook),
          data,
          updatedAt: Date.now(),
        });
      } catch (e) {
      }
    }

    async function readSectionDictationsCache(sectionId) {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbGet !== 'function') return null;
        const row = await idb.idbGet('book_view', getSectionDictationsCacheKey(sectionId));
        return (row && Array.isArray(row.data)) ? row.data : null;
      } catch (e) {
        return null;
      }
    }

    async function writeSectionDictationsCache(sectionId, dictations) {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbPut !== 'function') return;
        await idb.idbPut('book_view', {
          key: getSectionDictationsCacheKey(sectionId),
          data: dictations,
          updatedAt: Date.now(),
        });
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

    function initStaticTexts() {
      try {
        const setTextIfEmptyById = (id, text) => {
          const el = document.getElementById(id);
          if (!el) return;
          const current = (el.textContent || '').trim();
          if (current) return;
          el.textContent = text;
        };

        const setTextIfEmpty = (selector, text) => {
          const el = document.querySelector(selector);
          if (!el) return;
          const current = (el.textContent || '').trim();
          if (current) return;
          el.textContent = text;
        };

        try {
          const btn = document.querySelector('.book-edit-save-header');
          if (btn) {
            const label = (window.I18n && typeof window.I18n.t === 'function')
              ? window.I18n.t('common.save')
              : 'Сохранить';
            btn.title = String(label || 'Сохранить');
            btn.setAttribute('aria-label', String(label || 'Сохранить'));
          }
        } catch (e) {
        }

        setTextIfEmptyById('book-cover-upload-btn', 'Загрузить обложку');

        setTextIfEmpty('label[for="book-title-input"]', 'Название');
        setTextIfEmpty('label[for="book-author-text-input"]', 'Автор');
        setTextIfEmpty('label[for="book-author-materials-url-input"]', 'Ссылка на материалы автора');
        setTextIfEmpty('label[for="book-theme-input"]', 'Тема');
        setTextIfEmpty('label[for="book-visibility-input"]', 'Видимость');
        setTextIfEmpty('label[for="book-description-input"]', 'Описание');

        try {
          const visibility = document.getElementById('book-visibility-input');
          if (visibility) {
            const privateOpt = visibility.querySelector('option[value="private"]');
            if (privateOpt && !(privateOpt.textContent || '').trim()) privateOpt.textContent = 'Приватная';
            const publicOpt = visibility.querySelector('option[value="public"]');
            if (publicOpt && !(publicOpt.textContent || '').trim()) publicOpt.textContent = 'Публичная';
          }
        } catch (e) {
        }

        setTextIfEmpty('label[for="section-number-input"]', 'Номер');
        setTextIfEmpty('label[for="section-title-input"]', 'Название');
        try {
          const btn = document.getElementById('section-edit-save');
          if (btn) {
            const label = (window.I18n && typeof window.I18n.t === 'function')
              ? window.I18n.t('common.save')
              : 'Сохранить';
            btn.title = String(label || 'Сохранить');
            btn.setAttribute('aria-label', String(label || 'Сохранить'));
          }
        } catch (e) {
        }

        try {
          const h = document.querySelector('#move-dictation-modal .modal-header h3');
          if (h && !(h.textContent || '').trim()) h.textContent = 'Переместить диктант';
        } catch (e) {
        }
        try {
          const close = document.getElementById('move-dictation-close');
          if (close) {
            if (!close.getAttribute('aria-label')) close.setAttribute('aria-label', 'Закрыть');
            if (!close.getAttribute('title')) close.setAttribute('title', 'Закрыть');
          }
        } catch (e) {
        }
        setTextIfEmpty('#move-dictation-form label[for="move-target-book"]', 'Книга');
        setTextIfEmpty('#move-dictation-sections-container > label', 'Раздел');
        try {
          const opt = document.querySelector('#move-target-book option[value=""]');
          if (opt && !(opt.textContent || '').trim()) opt.textContent = 'Выберите книгу';
        } catch (e) {
        }
        setTextIfEmpty('.move-dictation-submit', 'Переместить');

        setTextIfEmptyById('crop-cancel', 'Отмена');
        setTextIfEmptyById('crop-confirm', 'Обрезать');
      } catch (e) {
      }
    }

    function openSectionModal(section, parentId) {
      const modal = document.getElementById('section-edit-modal');
      const titleEl = document.getElementById('section-edit-title');
      const idInput = document.getElementById('section-id-input');
      const parentIdInput = document.getElementById('section-parent-id-input');
      const numberInput = document.getElementById('section-number-input');
      const titleInput = document.getElementById('section-title-input');
      if (!modal || !titleEl || !idInput || !parentIdInput || !numberInput || !titleInput) return;

      if (section) {
        titleEl.textContent = 'Редактирование раздела';
        idInput.value = section.id != null ? String(section.id) : '';
        parentIdInput.value = section.parent_id != null ? String(section.parent_id) : '';
        numberInput.value = section.order_index != null ? String(section.order_index) : '';
        titleInput.value = section.title != null ? String(section.title) : '';
      } else {
        titleEl.textContent = 'Новый раздел';
        idInput.value = '';
        parentIdInput.value = parentId != null
          ? String(parentId)
          : (state.bookViewActiveBookId != null ? String(state.bookViewActiveBookId) : '');
        numberInput.value = '1';
        titleInput.value = '';
      }

      modal.style.display = 'flex';
      modal.classList.add('show');
      try { titleInput.focus(); } catch (e) { }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }
    }

    function closeSectionModal() {
      const modal = document.getElementById('section-edit-modal');
      if (!modal) return;
      modal.style.display = 'none';
      modal.classList.remove('show');
    }

    // ==================== Перемещение диктанта ====================

    function closeMoveDictationModal() {
      const modal = document.getElementById('move-dictation-modal');
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';

        const form = document.getElementById('move-dictation-form');
        if (form) {
          try { form.reset(); } catch (e) { }
        }

        const sectionsContainer = document.getElementById('move-dictation-sections-container');
        const sectionsList = document.getElementById('move-dictation-sections-list');
        if (sectionsContainer) sectionsContainer.style.display = 'none';
        if (sectionsList) sectionsList.innerHTML = '';

        try {
          document.querySelectorAll('.move-dictation-section-item').forEach((el) => el.classList.remove('selected'));
        } catch (e) {
        }
      }
    }

    function toggleMoveSectionChildren(sectionId, itemElement) {
      const toggle = itemElement.querySelector('.move-dictation-section-toggle');
      const childrenContainer = itemElement.nextElementSibling;

      if (!childrenContainer || !childrenContainer.classList.contains('move-dictation-section-children')) {
        return;
      }

      const isExpanded = childrenContainer.classList.contains('expanded');
      if (isExpanded) {
        childrenContainer.classList.remove('expanded');
        if (toggle) toggle.classList.remove('expanded');
      } else {
        childrenContainer.classList.add('expanded');
        if (toggle) toggle.classList.add('expanded');
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      } catch (e) {
      }
    }

    function renderMoveSectionsTree(sections, container, bookId, parentId = null, level = 0) {
      const sList = Array.isArray(sections) ? sections : [];
      const filtered = sList.filter((s) => {
        if (level === 0 && parentId === bookId) {
          const sectionParentId = parseInt(s && s.parent_id, 10);
          const bookIdNum = parseInt(bookId, 10);
          return sectionParentId === bookIdNum;
        }
        if (parentId === null) return !s.parent_id || s.parent_id === null;
        const sectionParentId = parseInt(s && s.parent_id, 10);
        const parentIdNum = parseInt(parentId, 10);
        return sectionParentId === parentIdNum;
      });

      filtered.sort((a, b) => (a && a.order_index ? a.order_index : 0) - (b && b.order_index ? b.order_index : 0));

      filtered.forEach((section) => {
        const hasChildren = sList.some((s) => s && s.parent_id === section.id);

        const item = document.createElement('div');
        item.className = 'move-dictation-section-item';
        item.setAttribute('data-level', String(level));
        item.setAttribute('data-section-id', String(section.id));
        item.setAttribute('data-book-id', String(bookId));

        item.innerHTML = `
          ${hasChildren ? `
            <div class="move-dictation-section-toggle" data-section-id="${escapeHtml(String(section.id))}">
              <i data-lucide="chevron-right"></i>
            </div>
          ` : '<div style="width: 20px;"></div>'}
          <span class="move-dictation-section-title">${escapeHtml(String(section.title || 'Без названия'))}</span>
        `;

        item.addEventListener('click', (e) => {
          if (e.target && e.target.closest && e.target.closest('.move-dictation-section-toggle')) {
            e.stopPropagation();
            toggleMoveSectionChildren(section.id, item);
            return;
          }

          try {
            document.querySelectorAll('.move-dictation-section-item').forEach((el) => el.classList.remove('selected'));
          } catch (e2) {
          }
          item.classList.add('selected');

          const sectionInput = document.getElementById('move-target-section');
          if (sectionInput) sectionInput.value = String(section.id);
        });

        container.appendChild(item);

        if (hasChildren) {
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'move-dictation-section-children';
          childrenContainer.setAttribute('data-parent-id', String(section.id));
          container.appendChild(childrenContainer);
          renderMoveSectionsTree(sList, childrenContainer, bookId, section.id, level + 1);
        }
      });

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function' && filtered.length > 0) {
          setTimeout(() => window.lucide.createIcons(), 0);
        }
      } catch (e) {
      }
    }

    function renderMoveSectionsRoot({ sections, container, bookId, bookTitle }) {
      if (!container) return;
      const sList = Array.isArray(sections) ? sections : [];

      const rootItem = document.createElement('div');
      rootItem.className = 'move-dictation-section-item move-dictation-section-item--root selected';
      rootItem.setAttribute('data-level', '0');
      rootItem.setAttribute('data-section-id', '');
      rootItem.setAttribute('data-book-id', String(bookId));

      rootItem.innerHTML = `
        <div class="move-dictation-section-toggle expanded" data-section-id="root">
          <i data-lucide="chevron-right"></i>
        </div>
        <span class="move-dictation-section-title">${escapeHtml(String(bookTitle || 'Книга'))}</span>
      `;

      rootItem.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.move-dictation-section-toggle')) {
          e.stopPropagation();
          const childrenContainer = rootItem.nextElementSibling;
          const toggle = rootItem.querySelector('.move-dictation-section-toggle');
          if (!childrenContainer || !childrenContainer.classList.contains('move-dictation-section-children')) return;
          const isExpanded = childrenContainer.classList.contains('expanded');
          if (isExpanded) {
            childrenContainer.classList.remove('expanded');
            if (toggle) toggle.classList.remove('expanded');
          } else {
            childrenContainer.classList.add('expanded');
            if (toggle) toggle.classList.add('expanded');
          }
          try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
          } catch (e2) {
          }
          return;
        }

        try {
          document.querySelectorAll('.move-dictation-section-item').forEach((el) => el.classList.remove('selected'));
        } catch (e2) {
        }
        rootItem.classList.add('selected');

        const sectionInput = document.getElementById('move-target-section');
        if (sectionInput) sectionInput.value = '';
      });

      container.appendChild(rootItem);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'move-dictation-section-children expanded';
      childrenContainer.setAttribute('data-parent-id', String(bookId));
      container.appendChild(childrenContainer);

      renderMoveSectionsTree(sList, childrenContainer, bookId, bookId, 1);

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          setTimeout(() => window.lucide.createIcons(), 0);
        }
      } catch (e) {
      }
    }

    async function openMoveDictationModal(dictationId) {
      const modal = document.getElementById('move-dictation-modal');
      const dictIdInput = document.getElementById('move-dictation-id');
      const bookSelect = document.getElementById('move-target-book');
      const sectionsContainer = document.getElementById('move-dictation-sections-container');
      const sectionsList = document.getElementById('move-dictation-sections-list');
      const sectionInput = document.getElementById('move-target-section');

      if (!modal || !dictIdInput || !bookSelect) return;

      dictIdInput.value = String(dictationId || '');
      if (sectionInput) sectionInput.value = '';

      if (sectionsContainer) sectionsContainer.style.display = 'none';
      if (sectionsList) sectionsList.innerHTML = '';

      showLoadingIndicator('Загрузка книг...');
      try {
        const booksData = await apiRequest('/library/api/user-books');
        const own = (booksData && booksData.success) ? (booksData.own_books || []) : [];
        const books = Array.isArray(own) ? own.filter((b) => b && !b.is_workbook) : [];

        bookSelect.innerHTML = '<option value=""></option>';
        for (const b of books) {
          if (!b || !b.id) continue;
          const option = document.createElement('option');
          option.value = String(b.id);
          option.textContent = String(b.title || 'Без названия');
          bookSelect.appendChild(option);
        }

        bookSelect.onchange = async function () {
          const selectedBookId = String(this.value || '').trim();
          const selectedBookIdInt = parseInt(selectedBookId, 10);
          if (sectionInput) sectionInput.value = '';

          if (!selectedBookId || !selectedBookIdInt || !isFinite(selectedBookIdInt)) {
            if (sectionsContainer) sectionsContainer.style.display = 'none';
            if (sectionsList) sectionsList.innerHTML = '';
            return;
          }

          if (sectionsContainer) sectionsContainer.style.display = 'none';
          if (sectionsList) sectionsList.innerHTML = '';

          showLoadingIndicator('Загрузка разделов...');
          try {
            const data = await apiRequest(`/library/api/book/${encodeURIComponent(String(selectedBookIdInt))}/sections-tree`);
            const sections = (data && data.success) ? (data.sections || []) : [];

            if (sectionsContainer) sectionsContainer.style.display = 'block';
            if (sectionsList) {
              sectionsList.innerHTML = '';
              const title = (() => {
                try {
                  const opt = bookSelect.selectedOptions && bookSelect.selectedOptions[0];
                  return opt ? String(opt.textContent || '').trim() : '';
                } catch (e0) {
                  return '';
                }
              })();
              renderMoveSectionsRoot({
                sections,
                container: sectionsList,
                bookId: selectedBookIdInt,
                bookTitle: title || 'Книга диктантов',
              });
            }
          } finally {
            hideLoadingIndicator();
          }
        };

        modal.classList.add('show');
        modal.style.display = 'flex';

        try {
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons(modal ? { root: modal } : undefined);
          }
        } catch (e) {
        }
      } finally {
        hideLoadingIndicator();
      }
    }

    async function handleMoveDictation(event) {
      try {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
      } catch (e) {
      }

      const dictationId = document.getElementById('move-dictation-id')?.value;
      const bookId = document.getElementById('move-target-book')?.value;
      const sectionId = document.getElementById('move-target-section')?.value || null;

      if (!dictationId || !bookId) {
        showToast('Выберите книгу', { durationMs: 2500 });
        return;
      }

      const targetId = sectionId || bookId;

      showLoadingIndicator('Перемещение...');
      try {
        const data = await apiRequest(`/library/api/dictation/${encodeURIComponent(String(dictationId))}/move-to-book`, {
          method: 'POST',
          body: JSON.stringify({ book_id: parseInt(String(targetId), 10) }),
        });

        if (data && data.success) {
          showToast('Диктант перемещён');
          closeMoveDictationModal();

          const targetBookIdNum = parseInt(String(bookId), 10);
          if (state.bookViewActiveBookId && targetBookIdNum && state.bookViewActiveBookId === targetBookIdNum) {
            await openBookViewBook(state.bookViewActiveBookId, !!state.activeBookIsWorkbook);
          } else if (state.bookViewActiveBookId) {
            await openBookViewBook(state.bookViewActiveBookId, !!state.activeBookIsWorkbook);
          }
          return;
        }

        showToast('Не удалось переместить диктант', { durationMs: 3500 });
      } catch (e) {
        showToast('Ошибка перемещения диктанта', { durationMs: 3500 });
      } finally {
        hideLoadingIndicator();
      }
    }

    async function handleSaveSection(event) {
      try {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
      } catch (e) {
      }

      const idInput = document.getElementById('section-id-input');
      const parentIdInput = document.getElementById('section-parent-id-input');
      const numberInput = document.getElementById('section-number-input');
      const titleInput = document.getElementById('section-title-input');

      const sectionId = idInput && idInput.value ? parseInt(String(idInput.value), 10) : null;
      const parentIdRaw = parentIdInput ? String(parentIdInput.value || '').trim() : '';
      const parentId = parentIdRaw ? parseInt(parentIdRaw, 10) : null;
      const sectionNumber = numberInput && numberInput.value ? parseInt(String(numberInput.value), 10) : null;
      const title = titleInput ? String(titleInput.value || '').trim() : '';

      if (!title) {
        showToast('Введите название раздела');
        return;
      }

      if (!parentId || Number.isNaN(parentId)) {
        showToast('Ошибка: не выбрана книга для раздела', { durationMs: 2500 });
        return;
      }

      showLoadingIndicator('Сохранение раздела...');
      try {
        const payload = {
          title,
          parent_id: parentId,
          author_text: null,
          short_description: null,
          original_language: null,
          visibility: 'private',
          theme: null,
          order_index: sectionNumber,
        };

        let data;
        if (sectionId) {
          data = await apiRequest(`/library/api/book/${encodeURIComponent(String(sectionId))}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          data = await apiRequest('/library/api/book', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }

        if (!data || !data.success) {
          showToast((data && (data.error || data.message)) ? String(data.error || data.message) : 'Ошибка сохранения раздела');
          return;
        }

        closeSectionModal();
        if (state.bookViewActiveBookId) {
          await openBookViewBook(state.bookViewActiveBookId, state.activeBookIsWorkbook);
        }
      } catch (e) {
        showToast('Ошибка сохранения раздела');
      } finally {
        hideLoadingIndicator();
      }
    }

    async function deleteBook(bookId) {
      const idNum = Number(bookId);
      if (!Number.isFinite(idNum) || idNum <= 0) return;

      showLoadingIndicator('Удаление книги...');
      try {
        const data = await apiRequest(`/library/api/book/${encodeURIComponent(String(idNum))}`, {
          method: 'DELETE',
          body: JSON.stringify({}),
        });

        if (!data || !data.success) {
          showToast((data && (data.error || data.message)) ? String(data.error || data.message) : 'Ошибка удаления книги');
          return;
        }

        try { closeBookViewModal(); } catch (e) { }
        showToast('Книга удалена', { durationMs: 1800 });

        try {
          if (window.PrivateLibraryModal && typeof window.PrivateLibraryModal.reload === 'function') {
            window.PrivateLibraryModal.reload().catch(() => { });
          }
        } catch (e2) {
        }
      } catch (e) {
        showToast('Ошибка удаления книги');
      } finally {
        hideLoadingIndicator();
      }
    }

    function setDictationTargetBook(bookId) {
      try {
        sessionStorage.setItem('dictationTargetBook', String(bookId));
      } catch (e) {
      }
    }

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
      try {
        setBookEditDirty(false);

        const modal = document.getElementById('book-edit-modal');
        const titleEl = document.getElementById('book-edit-title');
        const devIdEl = document.getElementById('book-edit-dev-id');
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

        if (!modal) {
          try { console.warn('[BookModal] Missing #book-edit-modal element in DOM'); } catch (e1) { }
          try { showToast('Не найдено окно редактирования книги (book-edit-modal)', { durationMs: 3500 }); } catch (e2) { }
          return;
        }

        state.lastLoadedBook = book || null;

        if (book) {
          if (titleEl) titleEl.textContent = 'Редактирование книги';
          if (idInput) idInput.value = book.id;
          if (devIdEl) devIdEl.textContent = book.id != null ? `ID: ${String(book.id)}` : '';
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
          if (devIdEl) devIdEl.textContent = '';
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
      } catch (e) {
        try { console.warn('[BookModal] openBookModal failed', e); } catch (e2) { }
        try { showToast('Ошибка открытия окна редактирования книги', { durationMs: 3500 }); } catch (e3) { }
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
      const creatorName = book && (book.creator_username || book.creator_name) ? String(book.creator_username || book.creator_name) : '';
      const creatorUserId = book && book.creator_user_id ? Number(book.creator_user_id) : null;
      const finalAvatarUrl = creatorUserId
        ? withCacheBust(`/user/api/avatar?user_id=${encodeURIComponent(String(creatorUserId))}&size=small`)
        : '';

      const coverUrlRaw = book && book.cover_url ? String(book.cover_url) : '';
      const coverV = coverUrlRaw && coverUrlRaw.includes('/library/api/book-cover')
        ? (book.updated_at || Date.now())
        : (window.__APP_BUILD || '1');
      const coverUrl = coverUrlRaw ? withCacheBustVersion(coverUrlRaw, coverV) : '';
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
                  <button class="dropdown-menu-item" data-action="add-section" type="button">
                    <i data-lucide="plus"></i>
                    <span>Добавить раздел</span>
                  </button>
                  <button class="dropdown-menu-item" data-action="add-dictation" type="button">
                    <i data-lucide="plus"></i>
                    <span>Добавить диктант</span>
                  </button>
                  <button class="dropdown-menu-item" data-action="edit-book" type="button">
                    <i data-lucide="edit-3"></i>
                    <span>Редактировать книгу</span>
                  </button>
                  <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-book" type="button">
                    <i data-lucide="trash-2"></i>
                    <span>Удалить книгу</span>
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

          if (action === 'add-section') {
            openSectionModal(null, (book && book.id != null) ? Number(book.id) : state.bookViewActiveBookId);
            return;
          }
          if (action === 'add-dictation') {
            try {
              const id = (book && book.id != null) ? Number(book.id) : state.bookViewActiveBookId;
              if (id) setDictationTargetBook(id);
            } catch (e2) {
            }
            // Відкрити редактор для нового диктанта
            if (window.DictationEditorModal && typeof window.DictationEditorModal.open === 'function') {
              window.DictationEditorModal.open({
                isNewDictation: true,
                dictationId: '',
                originalLanguage: '',
                translationLanguage: '',
                title: '',
                level: '',
                coverUrl: '',
                sentences: [],
                audio_user_shared: null,
                audio_order: '',
              });
            }
            return;
          }
          if (action === 'edit-book') {
            openBookModal(book);
            return;
          }
          if (action === 'delete-book') {
            try {
              if (window.DesktopConfirmModal && typeof window.DesktopConfirmModal.confirm === 'function') {
                window.DesktopConfirmModal.confirm({
                  title: 'Удалить книгу',
                  message: `Вы уверены, что хотите удалить книгу "${String(book && book.title ? book.title : 'книгу')}"?`,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmButtonClass: 'btn-danger',
                  onConfirm: () => deleteBook(book && book.id != null ? book.id : state.bookViewActiveBookId),
                });
                return;
              }
            } catch (e3) {
            }

            if (confirm(`Вы уверены, что хотите удалить книгу "${String(book && book.title ? book.title : 'книгу')}"?`)) {
              deleteBook(book && book.id != null ? book.id : state.bookViewActiveBookId);
            }
            return;
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

        const byParent = new Map();
        for (const s of sList) {
          if (!s || s.id == null) continue;
          const p = (s.parent_id == null) ? null : Number(s.parent_id);
          const key = String(p);
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key).push(s);
        }

        const sortSections = (arr) => (arr || []).slice().sort((a, b) => {
          const ao = (a && a.order_index != null) ? Number(a.order_index) : 0;
          const bo = (b && b.order_index != null) ? Number(b.order_index) : 0;
          if (ao !== bo) return ao - bo;
          const ai = (a && a.id != null) ? Number(a.id) : 0;
          const bi = (b && b.id != null) ? Number(b.id) : 0;
          return ai - bi;
        });

        const buildSectionNode = (section, level) => {
          const id = Number(section.id);
          const div = document.createElement('div');
          div.className = 'structure-item structure-section';
          div.setAttribute('data-section-id', String(id));
          div.setAttribute('data-level', String(level || 0));
          div.style.paddingLeft = `${Math.max(0, level || 0) * 14}px`;

          const sectionNumber = section && section.order_index ? `§ ${section.order_index}. ` : '§ ';

          div.innerHTML = `
            <div class="structure-item-header">
              <button class="structure-item-toggle" data-section-id="${escapeHtml(String(id))}" type="button" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
              <span class="structure-item-title">${escapeHtml(sectionNumber)}${escapeHtml(String(section.title || ''))}</span>
              <div class="dropdown-menu-wrapper" style="margin-left:auto;">
                <button class="structure-item-menu-btn" type="button" title="Дії">
                  <i data-lucide="more-vertical"></i>
                </button>
                <div class="dropdown-menu section-actions-menu" style="display:none;">
                  <button class="dropdown-menu-item" data-action="section-add-group" type="button">
                    <i data-lucide="folder-plus"></i> <span>Нова група</span>
                  </button>
                  <button class="dropdown-menu-item" data-action="section-add-dictation" type="button">
                    <i data-lucide="plus"></i> <span>Новий диктант</span>
                  </button>
                  <button class="dropdown-menu-item" data-action="section-edit" type="button">
                    <i data-lucide="edit-3"></i> <span>Редагувати розділ</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="structure-item-content" data-section-content-id="${escapeHtml(String(id))}" style="display: none;">
              <div class="structure-children" data-section-children-id="${escapeHtml(String(id))}"></div>
              <div class="structure-dictations" data-section-dictations-id="${escapeHtml(String(id))}"></div>
            </div>
          `;

          const childWrap = div.querySelector(`.structure-children[data-section-children-id="${CSS.escape(String(id))}"]`);
          const children = sortSections(byParent.get(String(id)) || []);
          if (childWrap && children.length) {
            for (const ch of children) {
              childWrap.appendChild(buildSectionNode(ch, (level || 0) + 1));
            }
          }

          // Додаємо обробники для меню "..."
          const menuBtn = div.querySelector('.structure-item-menu-btn');
          const menu = div.querySelector('.section-actions-menu');
          if (menuBtn && menu) {
            menuBtn.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              var isVisible = menu.classList.contains('show');
              if (isVisible) {
                menu.classList.remove('show');
                menu.style.display = 'none';
              } else {
                menu.classList.add('show');
                menu.style.display = 'block';
                setTimeout(function() {
                  var closeHandler = function(ev) {
                    if (!menu.contains(ev.target) && !menuBtn.contains(ev.target)) {
                      menu.classList.remove('show');
                      menu.style.display = 'none';
                      document.removeEventListener('click', closeHandler);
                    }
                  };
                  document.addEventListener('click', closeHandler);
                }, 0);
              }
            });

            menu.addEventListener('click', function(e) {
              var item = e.target.closest('.dropdown-menu-item');
              if (!item) return;
              e.preventDefault();
              e.stopPropagation();
              menu.classList.remove('show');
              menu.style.display = 'none';

              var action = item.getAttribute('data-action');
              var sectionId = Number(section.id);
              var bookId = (state && state.bookViewActiveBookId != null) ? Number(state.bookViewActiveBookId) : null;

              if (action === 'section-add-group') {
                // Нова група (підгрупа в поточній групі)
                if (typeof openSectionModal === 'function') {
                  openSectionModal(null, sectionId);
                }
                return;
              }
              if (action === 'section-add-dictation') {
                // Новий диктант
                try {
                  if (bookId) {
                    if (typeof setDictationTargetBook === 'function') {
                      setDictationTargetBook(sectionId);
                    }
                  }
                } catch (e2) {}
                if (window.DictationEditorModal && typeof window.DictationEditorModal.open === 'function') {
                  window.DictationEditorModal.open({
                    isNewDictation: true,
                    dictationId: '',
                    originalLanguage: '',
                    translationLanguage: '',
                    title: '',
                    level: '',
                    coverUrl: '',
                    sentences: [],
                    audio_user_shared: null,
                    audio_order: '',
                  });
                }
                return;
              }
              if (action === 'section-edit') {
                // Редагувати розділ
                if (typeof openSectionModal === 'function') {
                  openSectionModal(section, bookId);
                }
                return;
              }
            });
          }

          return div;
        };

        const rootId = (state && state.bookViewActiveBookId != null) ? Number(state.bookViewActiveBookId) : null;
        const topLevel = sortSections(byParent.get(String(rootId)) || []);
        for (const section of topLevel) {
          wrap.appendChild(buildSectionNode(section, 0));
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

            const dictationsContainer = content.querySelector(`.structure-dictations[data-section-dictations-id="${CSS.escape(String(id))}"]`);
            if (!dictationsContainer) return;

            if (dictationsContainer.dataset.loaded === '1') return;
            dictationsContainer.dataset.loaded = '1';

            // Принцип «сначала кеш»: показываем диктанты раздела из IndexedDB мгновенно,
            // а свежие данные подтягиваем в фоне и обновляем DOM только при изменениях.
            try {
              const cachedSection = await readSectionDictationsCache(id);
              if (cachedSection && cachedSection.length) {
                renderBookContentTo(dictationsContainer, [], cachedSection, true);
                (async () => {
                  try {
                    const dictationsData = await apiRequest(`/library/api/book/${encodeURIComponent(String(id))}/dictations`);
                    const freshDictations = dictationsData && dictationsData.success ? (dictationsData.dictations || []) : [];
                    if (JSON.stringify(freshDictations) !== JSON.stringify(cachedSection)) {
                      renderBookContentTo(dictationsContainer, [], freshDictations, true);
                    }
                    await writeSectionDictationsCache(id, freshDictations);
                  } catch (err) {
                  }
                })();
                return;
              }
            } catch (e) {
            }

            dictationsContainer.innerHTML = '<div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>';

            try {
              const dictationsData = await apiRequest(`/library/api/book/${encodeURIComponent(String(id))}/dictations`);
              const dictations = dictationsData && dictationsData.success ? (dictationsData.dictations || []) : [];
              renderBookContentTo(dictationsContainer, [], dictations, true);
              await writeSectionDictationsCache(id, dictations);
            } catch (err) {
              dictationsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки</div>';
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

      const wbFlag = !!isWorkbook;

      // Принцип «сначала кеш»: если данные книги уже есть в IndexedDB —
      // отрисовываем мгновенно БЕЗ спиннера, а свежие данные подтягиваем в фоне.
      const cached = await readBookViewCache(idNum, wbFlag);
      let renderedFromCache = false;
      if (cached && cached.book) {
        try {
          const titleEl = document.getElementById('book-view-title');
          if (titleEl) titleEl.textContent = cached.book.title || 'Книга';
          renderActiveBookCard(cached.book, card, { onClose: closeBookViewModal });
          renderBookContentTo(structure, cached.sections || [], cached.dictations || [], wbFlag);
          renderedFromCache = true;
        } catch (e) {
          renderedFromCache = false;
        }
      }

      if (!renderedFromCache) {
        showLoadingIndicator('Загрузка книги...');
      }

      try {
        const bookData = await apiRequest(`/library/api/book/${idNum}`);
        const freshBook = (bookData && bookData.success && bookData.book) ? bookData.book : null;

        let sections = [];
        let dictations = [];
        if (wbFlag) {
          const dictationsData = await apiRequest(`/library/api/book/${idNum}/dictations`);
          dictations = dictationsData && dictationsData.success ? (dictationsData.dictations || []) : [];
        } else {
          const sectionsData = await apiRequest(`/library/api/book/${idNum}/sections-tree`);
          const dictationsData = await apiRequest(`/library/api/book/${idNum}/dictations`);
          sections = sectionsData && sectionsData.success ? (sectionsData.sections || []) : [];
          dictations = dictationsData && dictationsData.success ? (dictationsData.dictations || []) : [];
        }

        const fresh = { book: freshBook, sections, dictations };
        const cachedStr = cached
          ? JSON.stringify({ book: cached.book, sections: cached.sections || [], dictations: cached.dictations || [] })
          : '';
        const freshStr = JSON.stringify(fresh);

        // Перерисовываем DOM только если данных ещё нет на экране или они изменились.
        if (!renderedFromCache || freshStr !== cachedStr) {
          if (freshBook) {
            const titleEl = document.getElementById('book-view-title');
            if (titleEl) titleEl.textContent = freshBook.title || 'Книга';
            renderActiveBookCard(freshBook, card, { onClose: closeBookViewModal });
          }
          renderBookContentTo(structure, sections, dictations, wbFlag);
        }

        if (freshBook || dictations.length || sections.length) {
          await writeBookViewCache(idNum, wbFlag, fresh);
        }
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
      initStaticTexts();

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

      const sectionClose = document.getElementById('section-edit-close');
      if (sectionClose && sectionClose.dataset.bound !== '1') {
        sectionClose.dataset.bound = '1';
        sectionClose.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeSectionModal();
        });
      }

      const sectionModal = document.getElementById('section-edit-modal');
      if (sectionModal && sectionModal.dataset.bound !== '1') {
        sectionModal.dataset.bound = '1';
        sectionModal.addEventListener('click', (e) => {
          if (e && e.target === sectionModal) closeSectionModal();
        });
      }

      const sectionForm = document.getElementById('section-edit-form');
      if (sectionForm && sectionForm.dataset.bound !== '1') {
        sectionForm.dataset.bound = '1';
        sectionForm.addEventListener('submit', handleSaveSection);
      }

      const sectionSaveBtn = document.getElementById('section-edit-save');
      if (sectionSaveBtn && sectionSaveBtn.dataset.bound !== '1') {
        sectionSaveBtn.dataset.bound = '1';
        sectionSaveBtn.addEventListener('click', handleSaveSection);
      }

      const moveCloseBtn = document.getElementById('move-dictation-close');
      if (moveCloseBtn && moveCloseBtn.dataset.bound !== '1') {
        moveCloseBtn.dataset.bound = '1';
        moveCloseBtn.addEventListener('click', closeMoveDictationModal);
      }

      const moveForm = document.getElementById('move-dictation-form');
      if (moveForm && moveForm.dataset.bound !== '1') {
        moveForm.dataset.bound = '1';
        moveForm.addEventListener('submit', handleMoveDictation);
      }

      const moveModal = document.getElementById('move-dictation-modal');
      if (moveModal && moveModal.dataset.bound !== '1') {
        moveModal.dataset.bound = '1';
        moveModal.addEventListener('click', (e) => {
          if (e && e.target === moveModal) closeMoveDictationModal();
        });
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
      openMoveDictation: (dictationId) => openMoveDictationModal(dictationId),
      closeView: () => closeBookViewModal(),
      closeEdit: () => closeBookModal(),
    };
  } catch (e) {
  }
})();
