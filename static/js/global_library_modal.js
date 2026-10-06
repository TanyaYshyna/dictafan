(function () {
  try {
    if (window.GlobalLibraryModal) return;

    var __APP_BUILD_LOCAL = (window && window.__APP_BUILD) ? String(window.__APP_BUILD || '').trim() : '';

    const state = {
      publicBooks: [],
      publicBooksLoadedAt: 0,
      activeBookId: null,
    };

    // Язык оригинала берём из флага в шапке рабочего стола (window.Desktop._activeLanguage),
    // а не из отдельного селектора в модалке. Фолбэк — на данные пользователя.
    function _resolveCurrentLearning() {
      try {
        if (window.Desktop && window.Desktop._activeLanguage) {
          const v = String(window.Desktop._activeLanguage).trim().toLowerCase();
          if (v) return v;
        }
      } catch (e) { }
      try {
        const ud = window.UM && window.UM.userData ? window.UM.userData : null;
        if (ud && ud.current_learning) {
          return String(ud.current_learning).trim().toLowerCase();
        }
      } catch (e) { }
      try {
        if (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.currentLearning) {
          return String(window.USER_LANGUAGE_DATA.currentLearning).trim().toLowerCase();
        }
      } catch (e) { }
      return null;
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

      const response = await fetch(url, Object.assign({}, opts, { headers, cache: 'no-store', credentials: 'include' }));

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
      const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 3500;

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
      el._hideTimer = window.setTimeout(() => {
        try { el.style.display = 'none'; } catch (e) { }
      }, Math.max(0, durationMs));
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

    function hydrateMiniBookCardImages(root) {
      if (!root) return;
      root.querySelectorAll('img[data-src]').forEach(img => {
        const src = img.getAttribute('data-src');
        if (!src) return;
        img.setAttribute('src', src);
        img.removeAttribute('data-src');
      });
    }

    const PUBLIC_BOOKS_CACHE_KEY = 'library:public_books';

    async function readPublicBooksCache() {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbGet !== 'function') return null;
        const row = await idb.idbGet('book_view', PUBLIC_BOOKS_CACHE_KEY);
        return (row && Array.isArray(row.data)) ? row.data : null;
      } catch (e) {
        return null;
      }
    }

    async function writePublicBooksCache(books) {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbPut !== 'function') return;
        await idb.idbPut('book_view', {
          key: PUBLIC_BOOKS_CACHE_KEY,
          data: books,
          updatedAt: Date.now(),
        });
      } catch (e) {
      }
    }

    function createMiniBookCard(book) {
      const isOwn = !!(book && (book.isOwn === true || book.is_own === true));
      const foreignClass = isOwn ? '' : 'foreign';
      const activeClass = state.activeBookId === (book && book.id) ? 'active' : '';
      const blankImg = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

      let creatorAvatarHtml = '';
      if (book && book.creator_user_id) {
        const avatarUrl = withCacheBust(`/user/api/avatar?user_id=${book.creator_user_id}&size=small`);
        creatorAvatarHtml = `<img src="${blankImg}" data-src="${avatarUrl}" alt="Creator" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`;
      } else {
        creatorAvatarHtml = '<i data-lucide="user"></i>';
      }

      const creatorName = (book && (book.creator_username || book.creator_name)) ? (book.creator_username || book.creator_name) : 'Неизвестный';

      let coverHtml;
      if (book && book.cover_url) {
        const coverV = (String(book.cover_url).includes('/library/api/book-cover'))
          ? (book.updated_at || Date.now())
          : (__APP_BUILD_LOCAL || '1');
        coverHtml = `<img class="book-card-mini-cover" src="${blankImg}" data-src="${withCacheBustVersion(book.cover_url, coverV)}" alt="${String(book.title || '')}">`;
      } else {
        coverHtml = `<div class="book-card-mini-cover-placeholder"><i data-lucide="book"></i></div>`;
      }

      return `
        <div class="book-card-mini ${foreignClass} ${activeClass}" data-book-id="${book && book.id != null ? book.id : ''}">
          <div class="book-card-mini-cover-wrapper">
            ${coverHtml}
            <div class="book-card-mini-creator-bar">
              <div class="book-card-mini-creator">${creatorAvatarHtml}</div>
              <div class="book-card-mini-creator-name">${String(creatorName)}</div>
            </div>
          </div>
          <div class="book-card-mini-title">${String(book && book.title != null ? book.title : '')}</div>
        </div>
      `;
    }

    function setActiveBook(bookId, root = document) {
      state.activeBookId = bookId;
      root.querySelectorAll('.book-card-mini').forEach(card => {
        if (parseInt(card.getAttribute('data-book-id')) === bookId) card.classList.add('active');
        else card.classList.remove('active');
      });
    }

    // Отдельного селектора языка в модалке больше нет — фильтр берёт язык
    // оригинала из флага в шапке. Оставляем заглушку для совместимости.
    function initializePublicBooksLanguageSelector() {
      try {
        const container = document.getElementById('publicBooksLanguageSelector');
        if (container) container.innerHTML = '';
      } catch (e) {
      }
    }

    function renderPublicBooksList() {
      const list = document.getElementById('publicBooksList');
      if (!list) return;

      // Язык оригинала берётся из флага в шапке рабочего стола.
      const filterLang = _resolveCurrentLearning();

      const normalizeBookLang = (b) => {
        if (!b) return '';
        return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
      };

      const items = filterLang
        ? state.publicBooks.filter(b => {
          const lang = normalizeBookLang(b);
          return !!lang && lang === String(filterLang).toLowerCase();
        })
        : state.publicBooks;

      if (!items.length) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Публичных книг пока нет</div>';
        return;
      }

      list.innerHTML = items.map(book => createMiniBookCard(book)).join('');
      hydrateMiniBookCardImages(list);

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(list ? { root: list } : undefined);
        }
      } catch (e) {
      }

      list.querySelectorAll('.book-card-mini').forEach(card => {
        const bookId = parseInt(card.getAttribute('data-book-id'));
        const book = items.find(b => Number(b.id) === Number(bookId)) || state.publicBooks.find(b => Number(b.id) === Number(bookId));

        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setActiveBook(bookId, list);
        });

        card.addEventListener('dblclick', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            setActiveBook(bookId, list);
            if (window.BookModal && typeof window.BookModal.openBook === 'function') {
              await window.BookModal.openBook(bookId, !!(book && book.is_workbook));
            }
          } catch (e2) {
          }
        });
      });
    }

    async function loadPublicBooks(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const silent = opts.silent === true;
      const list = document.getElementById('publicBooksList');
      if (!list) return;

      try {
        if (!silent) {
          list.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';
        }

        const data = await apiRequest('/library/api/public-books?limit=200');
        if (data && data.success && data.books) {
          state.publicBooks = data.books;
          state.publicBooksLoadedAt = Date.now();
          await writePublicBooksCache(data.books);

          renderPublicBooksList();
          return;
        }

        if (!silent) {
          list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
        }
      } catch (e) {
        if (!silent) {
          list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
        }
      }
    }

    async function open() {
      const modal = document.getElementById('public-library-modal');
      if (!modal) {
        try { showToast('Не найдено окно публичной библиотеки (public-library-modal)'); } catch (e) { }
        return;
      }

      modal.style.display = 'flex';
      initializePublicBooksLanguageSelector();

      if (Array.isArray(state.publicBooks) && state.publicBooks.length > 0 && (Date.now() - state.publicBooksLoadedAt) < 5 * 60 * 1000) {
        renderPublicBooksList();
      } else {
        const cached = await readPublicBooksCache();
        if (Array.isArray(cached) && cached.length > 0) {
          state.publicBooks = cached;
          state.publicBooksLoadedAt = Date.now();
          renderPublicBooksList();
          loadPublicBooks({ silent: true }).catch(() => { });
        } else {
          await loadPublicBooks();
        }
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }
    }

    function close() {
      const modal = document.getElementById('public-library-modal');
      if (modal) modal.style.display = 'none';
    }

    function _bindOnce() {
      // При смене языка оригинала в шапке (если модалка открыта) перерисовываем список.
      window.addEventListener('desktop:learning-language-changed', () => {
        try {
          const modal = document.getElementById('public-library-modal');
          if (!modal || modal.style.display === 'none') return;
          renderPublicBooksList();
        } catch (e) {
        }
      });

      const closeBtn = document.getElementById('public-library-close');
      if (closeBtn && closeBtn.dataset.bound !== '1') {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        });
      }

      const reloadBtn = document.getElementById('public-library-reload');
      if (reloadBtn && reloadBtn.dataset.bound !== '1') {
        reloadBtn.dataset.bound = '1';
        reloadBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          loadPublicBooks().catch(() => { });
        });
      }

      const modal = document.getElementById('public-library-modal');
      if (modal && modal.dataset.bound !== '1') {
        modal.dataset.bound = '1';
        modal.addEventListener('click', (event) => {
          if (event && event.target === modal) close();
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

    window.GlobalLibraryModal = {
      open,
      close,
      reload: () => loadPublicBooks(),
    };
  } catch (e) {
  }
})();
