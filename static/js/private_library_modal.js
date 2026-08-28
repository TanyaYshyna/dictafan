(function () {
  try {
    if (window.PrivateLibraryModal) return;

    var __APP_BUILD_LOCAL = (window && window.__APP_BUILD) ? String(window.__APP_BUILD || '').trim() : '';

    const state = {
      lastOwnBooks: [],
      lastShelfBooks: [],
      currentBooksFilterLanguage: null,
      activeBookId: null,
      booksLanguageSelectorInstance: null,
      _loadedAt: 0,
    };

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

    const USER_BOOKS_CACHE_KEY = 'library:user_books';

    async function readBooksCache() {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbGet !== 'function') return null;
        const row = await idb.idbGet('book_view', USER_BOOKS_CACHE_KEY);
        if (row && row.data && (Array.isArray(row.data.ownBooks) || Array.isArray(row.data.own_books))) {
          return {
            ownBooks: Array.isArray(row.data.ownBooks) ? row.data.ownBooks : (row.data.own_books || []),
            shelfBooks: Array.isArray(row.data.shelfBooks) ? row.data.shelfBooks : (row.data.shelf_books || []),
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    async function writeBooksCache(ownBooks, shelfBooks) {
      try {
        const idb = window.IdbManager;
        if (!idb || typeof idb.idbPut !== 'function') return;
        await idb.idbPut('book_view', {
          key: USER_BOOKS_CACHE_KEY,
          data: { ownBooks, shelfBooks },
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

    function renderBooksList(ownBooks, shelfBooks) {
      const container = document.getElementById('booksList');
      if (!container) return;

      const rawFilterLang = state.currentBooksFilterLanguage
        || window.USER_LANGUAGE_DATA?.currentLearning
        || null;
      const filterLang = rawFilterLang && String(rawFilterLang) === 'all' ? null : rawFilterLang;

      const normalizeBookLang = (b) => {
        if (!b) return '';
        return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
      };

      const allBooksRaw = [
        ...(ownBooks || []).map(book => Object.assign({}, book, { isOwn: true })),
        ...(shelfBooks || []).map(book => Object.assign({}, book, { isOwn: false })),
      ];

      const byId = new Map();
      allBooksRaw.forEach(b => {
        if (!b || b.id == null) return;
        const id = Number(b.id);
        if (!isFinite(id)) return;
        const prev = byId.get(id);
        if (!prev) {
          byId.set(id, b);
          return;
        }
        if (prev.isOwn) return;
        if (b.isOwn) byId.set(id, b);
      });

      const allBooksDeduped = Array.from(byId.values());

      const allBooks = filterLang
        ? allBooksDeduped.filter(b => {
          if (b && b.is_workbook) return true;
          const lang = normalizeBookLang(b);
          return !lang || lang === String(filterLang).toLowerCase();
        })
        : allBooksDeduped;

      if (allBooks.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Нет книг</div>';
        return;
      }

      container.innerHTML = allBooks.map(book => createMiniBookCard(book)).join('');
      hydrateMiniBookCardImages(container);

      container.querySelectorAll('.book-card-mini').forEach(card => {
        const bookId = parseInt(card.getAttribute('data-book-id'));
        const book = allBooks.find(b => Number(b.id) === Number(bookId));

        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setActiveBook(bookId, container);
        });

        card.addEventListener('dblclick', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            setActiveBook(bookId, container);
            if (window.BookModal && typeof window.BookModal.openBook === 'function') {
              await window.BookModal.openBook(bookId, !!(book && book.is_workbook));
            }
          } catch (e2) {
          }
        });
      });

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(container ? { root: container } : undefined);
        }
      } catch (e) {
      }
    }

    async function loadBooksFromAPI(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const silent = opts.silent === true;
      try {
        const token = getToken();
        if (!token) {
          try { if (window.UM) window.UM.requireAuth(); } catch (e) { }
          return;
        }

        if (!silent) {
          const container = document.getElementById('booksList');
          if (container) container.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';
        }

        const response = await fetch('/library/api/user-books', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          cache: 'no-store',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (data && data.success) {
            state.lastOwnBooks = Array.isArray(data.own_books) ? data.own_books : [];
            state.lastShelfBooks = Array.isArray(data.shelf_books) ? data.shelf_books : [];
            await writeBooksCache(state.lastOwnBooks, state.lastShelfBooks);
            renderBooksList(state.lastOwnBooks, state.lastShelfBooks);
            return;
          }
          if (!silent) showToast('Ошибка загрузки книг');
          return;
        }

        if (response.status === 401 || response.status === 422) {
          try { if (window.UM) window.UM.requireAuth(); } catch (e) { }
          return;
        }

        if (!silent) showToast('Ошибка загрузки книг');
      } catch (e) {
        if (!silent) showToast('Ошибка загрузки книг');
      }
    }

    function initializeBooksLanguageSelector() {
      try {
        const container = document.getElementById('booksLanguageSelector');
        if (!container) return;

        container.innerHTML = '';
        const userSettings = window.USER_LANGUAGE_DATA;
        if (!userSettings) return;

        if (typeof window.initLanguageSelector === 'function') {
          const baseLanguageData = window.LanguageManager && typeof window.LanguageManager.getLanguageData === 'function'
            ? window.LanguageManager.getLanguageData()
            : {};

          const languageData = Object.assign({
            all: { language_ru: 'Все языки', language_en: 'All languages', country_cod: '' },
          }, baseLanguageData || {});

          const options = {
            mode: 'learning-selector-compact',
            currentLearning: (state.currentBooksFilterLanguage != null
              ? state.currentBooksFilterLanguage
              : (userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en')),
            learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
            languageData,
            onLanguageChange: function (values) {
              const v = values && values.currentLearning ? String(values.currentLearning) : '';
              state.currentBooksFilterLanguage = v || 'all';
              renderBooksList(state.lastOwnBooks, state.lastShelfBooks);
            }
          };

          state.booksLanguageSelectorInstance = window.initLanguageSelector('booksLanguageSelector', options);

          if (!state.currentBooksFilterLanguage) {
            const v = String(options.currentLearning || '');
            state.currentBooksFilterLanguage = v || 'all';
          }
        }
      } catch (e) {
      }
    }

    function open() {
      const modal = document.getElementById('home-library-modal');
      if (!modal) {
        try { showToast('Не найдено окно библиотеки (home-library-modal)'); } catch (e) { }
        return;
      }
      modal.style.display = 'flex';
      state._loadedAt = Date.now();
      initializeBooksLanguageSelector();

      readBooksCache()
        .then((cached) => {
          if (cached && (Array.isArray(cached.ownBooks) || Array.isArray(cached.shelfBooks))) {
            state.lastOwnBooks = Array.isArray(cached.ownBooks) ? cached.ownBooks : [];
            state.lastShelfBooks = Array.isArray(cached.shelfBooks) ? cached.shelfBooks : [];
            renderBooksList(state.lastOwnBooks, state.lastShelfBooks);
          }
          loadBooksFromAPI({ silent: !!cached }).catch(() => { });
        })
        .catch(() => {
          loadBooksFromAPI({ silent: false }).catch(() => { });
        });

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }
    }

    function close() {
      const modal = document.getElementById('home-library-modal');
      if (!modal) return;
      modal.style.display = 'none';
    }

    function _bindOnce() {
      const closeBtn = document.getElementById('home-library-close');
      if (closeBtn && closeBtn.dataset.bound !== '1') {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        });
      }

      const modal = document.getElementById('home-library-modal');
      if (modal && modal.dataset.bound !== '1') {
        modal.dataset.bound = '1';
        modal.addEventListener('click', (event) => {
          if (event && event.target === modal) close();
        });
      }

      const reloadBtn = document.getElementById('home-library-reload');
      if (reloadBtn && reloadBtn.dataset.bound !== '1') {
        reloadBtn.dataset.bound = '1';
        reloadBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          loadBooksFromAPI({ silent: false }).catch(() => { });
        });
      }

      const newBookBtn = document.getElementById('btnNewBookInZone');
      if (newBookBtn && newBookBtn.dataset.bound !== '1') {
        newBookBtn.dataset.bound = '1';
        newBookBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            if (window.BookModal && typeof window.BookModal.openEdit === 'function') {
              window.BookModal.openEdit(null);
            }
          } catch (e2) {
          }
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

    window.PrivateLibraryModal = {
      open,
      close,
      reload: () => loadBooksFromAPI(),
    };
  } catch (e) {
  }
})();
