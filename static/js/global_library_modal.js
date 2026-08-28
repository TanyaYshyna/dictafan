(function () {
  try {
    if (window.GlobalLibraryModal) return;

    var __APP_BUILD_LOCAL = (window && window.__APP_BUILD) ? String(window.__APP_BUILD || '').trim() : '';

    const state = {
      publicBooks: [],
      publicBooksLoadedAt: 0,
      currentPublicBooksFilterLanguage: null,
      activeBookId: null,
      publicBooksLanguageSelectorInstance: null,
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

    function initializePublicBooksLanguageSelector() {
      try {
        const container = document.getElementById('publicBooksLanguageSelector');
        if (!container) return;

        container.innerHTML = '';

        const userSettings = window.USER_LANGUAGE_DATA;
        if (!userSettings) return;

        const baseLanguageData = window.LanguageManager && typeof window.LanguageManager.getLanguageData === 'function'
          ? window.LanguageManager.getLanguageData()
          : {};

        const languageData = Object.assign({
          all: { language_ru: 'Все языки', language_en: 'All languages', country_cod: '' },
        }, baseLanguageData || {});

        if (typeof window.initLanguageSelector === 'function') {
          const options = {
            mode: 'learning-selector-compact',
            currentLearning: (state.currentPublicBooksFilterLanguage != null
              ? state.currentPublicBooksFilterLanguage
              : (userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en')),
            learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
            languageData,
            onLanguageChange: function (values) {
              const v = values && values.currentLearning ? String(values.currentLearning) : '';
              state.currentPublicBooksFilterLanguage = v || 'all';
              renderPublicBooksList();
            }
          };

          state.publicBooksLanguageSelectorInstance = window.initLanguageSelector('publicBooksLanguageSelector', options);
          if (!state.currentPublicBooksFilterLanguage) {
            const v = String(options.currentLearning || '');
            state.currentPublicBooksFilterLanguage = v || 'all';
          }
        }
      } catch (e) {
      }
    }

    function renderPublicBooksList() {
      const list = document.getElementById('publicBooksList');
      if (!list) return;

      const rawFilterLang = state.currentPublicBooksFilterLanguage
        || window.USER_LANGUAGE_DATA?.currentLearning
        || null;
      const filterLang = rawFilterLang && String(rawFilterLang) === 'all' ? null : rawFilterLang;

      const normalizeBookLang = (b) => {
        if (!b) return '';
        return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
      };

      const items = filterLang
        ? state.publicBooks.filter(b => {
          const lang = normalizeBookLang(b);
          return !lang || lang === String(filterLang).toLowerCase();
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

    async function loadPublicBooks() {
      const list = document.getElementById('publicBooksList');
      if (!list) return;

      try {
        list.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';

        const data = await apiRequest('/library/api/public-books?limit=200');
        if (data && data.success && data.books) {
          state.publicBooks = data.books;
          state.publicBooksLoadedAt = Date.now();

          if (!state.currentPublicBooksFilterLanguage) {
            state.currentPublicBooksFilterLanguage = window.USER_LANGUAGE_DATA?.currentLearning || null;
          }

          renderPublicBooksList();
          return;
        }

        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
      } catch (e) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
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
        await loadPublicBooks();
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
      const closeBtn = document.getElementById('public-library-close');
      if (closeBtn && closeBtn.dataset.bound !== '1') {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
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
