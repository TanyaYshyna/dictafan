(function () {
  try {
    if (window.AllDictationsModal) return;

    const PAGE_SIZE = 10;

    const state = {
      items: [],
      page: 1,
      hasMore: false,
      loading: false,
      sort: 'rating',
      language: null,
      loaded: false,
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

    function t(key, fallback) {
      try {
        if (window.I18n && typeof window.I18n.t === 'function') {
          const v = window.I18n.t(key);
          if (v && v !== key) return String(v);
        }
      } catch (e) {
      }
      return fallback;
    }

    function escapeHtml(s) {
      try {
        if (window.escapeHtml) return window.escapeHtml(s);
      } catch (e) {
      }
      return String(s == null ? '' : s)
        .replace(/&/g, '&' + 'amp;')
        .replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;')
        .replace(/"/g, '&' + 'quot;')
        .replace(/'/g, '&' + '#39;');
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
      const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 3000;
      let el = document.getElementById('auto-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'auto-toast';
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.top = '24px';
        el.style.transform = 'translateX(-50%)';
        el.style.zIndex = '200500';
        el.style.background = 'rgba(0,0,0,0.78)';
        el.style.color = '#fff';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '12px';
        el.style.fontSize = '14px';
        el.style.maxWidth = 'min(92vw, 520px)';
        el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      el.textContent = message || '';
      el.style.display = 'block';
      if (el._hideTimer) window.clearTimeout(el._hideTimer);
      el._hideTimer = window.setTimeout(() => {
        try { el.style.display = 'none'; } catch (e) { }
      }, durationMs);
    }

    function _resolveCurrentLearning() {
      try {
        if (window.Desktop && window.Desktop._activeLanguage) {
          const v = String(window.Desktop._activeLanguage).trim().toLowerCase();
          if (v) return v;
        }
      } catch (e) {
      }
      try {
        const ud = window.UM && window.UM.userData ? window.UM.userData : null;
        if (ud && ud.current_learning) {
          return String(ud.current_learning).trim().toLowerCase();
        }
      } catch (e) {
      }
      try {
        if (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.currentLearning) {
          return String(window.USER_LANGUAGE_DATA.currentLearning).trim().toLowerCase();
        }
      } catch (e) {
      }
      return null;
    }

    function formatRatingValue(value) {
      if (window.DictationKart && typeof window.DictationKart._formatRatingValue === 'function') {
        return window.DictationKart._formatRatingValue(value);
      }
      return String(Math.round(value * 10) / 10);
    }

    function ratingStarsHtml() {
      let stars = '';
      for (let i = 1; i <= 10; i += 1) {
        stars += `<button type="button" class="card-rating-star" data-rating-value="${i}" title="${i}">☆</button>`;
      }
      return stars;
    }

    function cardHtml(item) {
      const dictationId = item.dictation_id != null ? item.dictation_id : item.id;
      const dictationIdFormatted = `dict_${dictationId}`;
      const langOriginal = item.language_original || item.language_code || 'en';
      const nativeLang = _getUserNativeLangSafe();

      const availableTranslations = Array.isArray(item.translation_languages)
        ? item.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];

      const sentencesCount = typeof item.sentences_count === 'number'
        ? item.sentences_count
        : (parseInt(item.sentences_count, 10) || 0);

      const points = Number(item.points) || 0;
      const pointsMax = Number(item.points_max) || 0;
      const ratingScoreText = pointsMax > 0 ? formatRatingValue(points * 10 / pointsMax) : '–';

      const coverUrl = window.maybeCacheBustDictationCover
        ? window.maybeCacheBustDictationCover(item.cover_url)
        : (item.cover_url || '');
      const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';

      const isOnDesk = window.isDictationOnDesk ? window.isDictationOnDesk(dictationId) : false;
      const onDeskClass = isOnDesk ? 'all-dictations-card--on-desk' : '';

      const viewTextTitle = t('desktop.all_dictations.view_text', 'Просмотр текста и перевода');
      const addTitle = isOnDesk
        ? t('desktop.all_dictations.on_desk', 'Уже на рабочем столе')
        : t('desktop.all_dictations.add_to_desk', 'Добавить на рабочий стол');

      return `
        <div class="short-card dictation-kart all-dictations-card ${onDeskClass}" data-dictation-id="${dictationId}" data-lang-original="${escapeHtml(langOriginal)}">
          <div class="short-thumb">
            <img src="${coverSrc}" alt="" class="short-cover" loading="lazy" decoding="async" draggable="false" onerror="this.onerror=null;this.src='/static/data/covers/cover_en.webp'">
            <button type="button" class="card-rating-badge" data-action="rating-toggle" data-dictation-id="${dictationId}" data-points="${points}" data-points-max="${pointsMax}" title="${escapeHtml(t('desktop.all_dictations.rate', 'Оценить'))}" aria-label="${escapeHtml(t('desktop.all_dictations.rate', 'Оценить'))}">
              <i data-lucide="star" style="width:13px;height:13px;"></i>
              <span class="card-rating-score">${escapeHtml(ratingScoreText)}</span>
            </button>
            <div class="card-rating-popup" data-dictation-id="${dictationId}" style="display:none;">
              <div class="card-rating-popup__stars">${ratingStarsHtml()}</div>
              <div class="card-rating-popup__hint"></div>
            </div>
          </div>

          <h3 class="short-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Без названия')}</h3>

          <div class="short-meta short-meta--row">
            <div class="short-meta-left">
              <span class="short-lang-flags">${escapeHtml(langOriginal)}</span>
              <span class="short-level">${escapeHtml(item.level || '—')}</span>
            </div>
            <div class="short-meta-right">
              <div class="short-sentences-count" title="${escapeHtml(t('desktop.all_dictations.sentences_count', 'Количество предложений'))}">
                <i data-lucide="layers"></i><span>${sentencesCount}</span>
              </div>
            </div>
          </div>

          <div class="short-footer all-dictations-card-footer">
            <button type="button" class="short-action-btn all-dictations-view-btn" data-action="view-text" data-dictation-id="${dictationId}" title="${escapeHtml(viewTextTitle)}" aria-label="${escapeHtml(viewTextTitle)}">
              <i data-lucide="book-open-text"></i>
            </button>
            <button type="button" class="short-action-btn all-dictations-add-btn" data-action="add-to-desk" data-dictation-id="${dictationId}" title="${escapeHtml(addTitle)}" aria-label="${escapeHtml(addTitle)}" ${isOnDesk ? 'disabled' : ''}>
              <i data-lucide="${isOnDesk ? 'check' : 'arrow-big-down-dash'}"></i>
            </button>
            <div class="short-dikt-number">${escapeHtml(dictationIdFormatted)}</div>
          </div>
        </div>
      `;
    }

    function _getUserNativeLangSafe() {
      try {
        if (window.DictationKart && typeof window.DictationKart._getUserNativeLang === 'function') {
          return window.DictationKart._getUserNativeLang();
        }
      } catch (e) {
      }
      return null;
    }

    function listEl() {
      return document.getElementById('allDictationsList');
    }

    function moreBtnEl() {
      return document.getElementById('all-dictations-more');
    }

    function renderEmpty(message) {
      const list = listEl();
      if (list) list.innerHTML = `<div class="all-dictations-empty">${escapeHtml(message || t('desktop.all_dictations.empty', 'Диктантов не найдено'))}</div>`;
    }

    function renderLoading() {
      const list = listEl();
      if (list) list.innerHTML = `<div class="all-dictations-empty">${escapeHtml(t('desktop.all_dictations.loading', 'Загрузка...'))}</div>`;
    }

    function renderItems(items) {
      const list = listEl();
      if (!list) return;
      if (!items.length) {
        renderEmpty();
        updateMoreButton();
        return;
      }

      const html = items.map(cardHtml).join('');
      const container = document.createElement('div');
      container.innerHTML = html;

      const cards = Array.prototype.slice.call(container.children);
      cards.forEach((card) => {
        list.appendChild(card);

        // Привязываем виджет рейтинга через существующий модуль карточек.
        try {
          if (window.DictationKart && typeof window.DictationKart._bindRatingHandlers === 'function') {
            window.DictationKart._bindRatingHandlers(card);
          }
        } catch (e) {
        }

        // Действия карточки: просмотр текста и добавление на стол.
        card.querySelectorAll('[data-action]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = btn.getAttribute('data-action');
            const id = Number(btn.getAttribute('data-dictation-id')) || 0;
            if (action === 'view-text') {
              openTextModal(id, card);
            } else if (action === 'add-to-desk') {
              addToDesk(id, card);
            }
          });
        });
      });

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: list });
        }
      } catch (e) {
      }

      updateMoreButton();
    }

    function updateMoreButton() {
      const btn = moreBtnEl();
      if (!btn) return;
      if (!state.hasMore) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'inline-flex';
      }
      const label = btn.querySelector('span');
      if (label) {
        label.textContent = t('desktop.all_dictations.next', 'Далее');
      }
    }

    async function loadPage(reset) {
      if (state.loading) return;
      state.loading = true;

      if (reset) {
        state.page = 1;
        state.items = [];
        const list = listEl();
        if (list) list.innerHTML = '';
        renderLoading();
      }

      const btn = moreBtnEl();
      if (btn) btn.disabled = true;

      try {
        const params = new URLSearchParams();
        params.set('sort', state.sort);
        params.set('page', String(state.page));
        params.set('page_size', String(PAGE_SIZE));
        if (state.language) params.set('language', state.language);

        const resp = await fetch('/api/dictations?' + params.toString(), {
          method: 'GET',
          headers: Object.assign({}, getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
          cache: 'no-store',
          credentials: 'include',
        });

        if (resp.status === 401 || resp.status === 422) {
          try {
            if (window.UM) window.UM.requireAuth();
          } catch (e) {
          }
          throw new Error('Требуется авторизация');
        }

        const data = await resp.json();
        if (!data || !data.success) {
          throw new Error((data && data.error) || 'Ошибка загрузки');
        }

        const items = Array.isArray(data.items) ? data.items : [];
        state.items = state.items.concat(items);
        state.hasMore = !!(data.has_more === true);
        state.page += 1;
        state.loaded = true;

        // Первая страница — полностью перерисовываем, иначе добавляем.
        if (reset) {
          const list = listEl();
          if (list) list.innerHTML = '';
          renderItems(items);
        } else {
          renderItems(items);
        }
      } catch (e) {
        if (reset) {
          renderEmpty(t('desktop.all_dictations.error', 'Ошибка загрузки'));
        } else {
          showToast((e && e.message) || 'Ошибка загрузки', { durationMs: 3000 });
        }
      } finally {
        state.loading = false;
        if (btn) btn.disabled = false;
      }
    }

    async function addToDesk(dbId, card) {
      if (!dbId) return;
      try {
        if (window.DictationKart && typeof window.DictationKart.addToDesk === 'function') {
          await window.DictationKart.addToDesk(dbId);
        } else if (window.addToDesk && typeof window.addToDesk === 'function') {
          await window.addToDesk(dbId);
        } else {
          const token = getToken();
          if (!token) throw new Error('No auth token');
          const resp = await fetch('/desk/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ dictation_id: Number(dbId) }),
          });
          const data = await resp.json();
          if (!data || !data.success) throw new Error((data && data.error) || 'Failed to add');
        }

        // Обновляем UI карточки на «на столе».
        if (card) {
          card.classList.add('all-dictations-card--on-desk');
          const btn = card.querySelector('[data-action="add-to-desk"]');
          if (btn) {
            btn.disabled = true;
            btn.title = t('desktop.all_dictations.on_desk', 'Уже на рабочем столе');
            btn.setAttribute('aria-label', btn.title);
            const icon = btn.querySelector('i[data-lucide]');
            if (icon) icon.setAttribute('data-lucide', 'check');
          }
          try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons({ root: card });
            }
          } catch (e) {
          }
        }
      } catch (e) {
        const msg = (e && e.message === 'desk_limit_reached')
          ? t('desktop.all_dictations.desk_limit', 'Достигнут лимит карточек на рабочем столе')
          : ((e && e.message) || 'Ошибка добавления');
        showToast(msg, { durationMs: 4000 });
      }
    }

    // ==================== Модалка текста и перевода ====================

    function openTextModal(dictationId, card) {
      const modal = document.getElementById('all-dictations-text-modal');
      if (!modal) return;

      const titleEl = document.getElementById('all-dictations-text-title');
      if (titleEl) {
        const title = card ? (card.querySelector('.short-title') || {}).textContent : '';
        titleEl.textContent = title || 'Текст диктанта';
      }

      const columns = document.getElementById('all-dictations-text-columns');
      const loading = document.getElementById('all-dictations-text-loading');
      if (columns) columns.innerHTML = '';
      if (loading) loading.style.display = 'flex';

      modal.style.display = 'flex';

      fetch('/api/dictation/' + Number(dictationId) + '/sentences', {
        method: 'GET',
        headers: Object.assign({}, getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
        cache: 'no-store',
        credentials: 'include',
      })
        .then((resp) => {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.json();
        })
        .then((data) => {
          if (loading) loading.style.display = 'none';
          if (!data || !data.success) {
            if (columns) columns.innerHTML = `<div class="all-dictations-text-empty">${escapeHtml('Ошибка загрузки текста')}</div>`;
            return;
          }
          renderTextModal(data.sentences || [], dictationId, card);
        })
        .catch(() => {
          if (loading) loading.style.display = 'none';
          if (columns) columns.innerHTML = `<div class="all-dictations-text-empty">${escapeHtml('Ошибка загрузки текста')}</div>`;
        });
    }

    function renderTextModal(sentences, dictationId, card) {
      const columns = document.getElementById('all-dictations-text-columns');
      if (!columns) return;

      const originalLang = (card && card.getAttribute('data-lang-original'))
        ? card.getAttribute('data-lang-original').trim().toLowerCase()
        : null;

      // Группируем предложения по языку, сортируем по position.
      const byLang = {};
      sentences.forEach((s) => {
        const lang = String((s && s.language_code) || '').trim().toLowerCase();
        if (!lang) return;
        if (!byLang[lang]) byLang[lang] = [];
        byLang[lang].push(s);
      });

      const langOrder = Object.keys(byLang).sort((a, b) => {
        if (originalLang && a === originalLang) return -1;
        if (originalLang && b === originalLang) return 1;
        return a.localeCompare(b);
      });

      const sortByPos = (arr) => arr.sort((a, b) => {
        const pa = Number(a && a.position);
        const pb = Number(b && b.position);
        if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
        return 0;
      });

      const langNames = {
        en: 'English', uk: 'Українська', ru: 'Русский', sv: 'Svenska', be: 'Беларуская',
        de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', tr: 'Türkçe',
        ar: 'العربية', pl: 'Polski', nl: 'Nederlands', no: 'Norsk',
      };

      let html = '';
      langOrder.forEach((lang) => {
        const rows = sortByPos(byLang[lang]);
        const isOriginal = originalLang && lang === originalLang;
        const header = `<div class="all-dictations-text-col-header">
          <span>${escapeHtml(langNames[lang] || lang)}</span>
          ${isOriginal ? `<span class="all-dictations-text-original-badge">${escapeHtml(t('desktop.all_dictations.original', 'оригинал'))}</span>` : ''}
        </div>`;
        const body = rows.map((s) => {
          const text = (s && s.text) ? String(s.text) : '';
          const explanation = (s && s.explanation) ? String(s.explanation) : '';
          const explanationHtml = explanation
            ? `<div class="all-dictations-text-explanation">${escapeHtml(explanation)}</div>`
            : '';
          return `<div class="all-dictations-text-row">
            <div class="all-dictations-text-sentence">${escapeHtml(text)}</div>
            ${explanationHtml}
          </div>`;
        }).join('');
        html += `<div class="all-dictations-text-col">${header}${body}</div>`;
      });

      columns.innerHTML = html || `<div class="all-dictations-text-empty">${escapeHtml('Нет текста')}</div>`;
    }

    function closeTextModal() {
      const modal = document.getElementById('all-dictations-text-modal');
      if (modal) modal.style.display = 'none';
    }

    // ==================== Открытие/закрытие главной модалки ====================

    async function open() {
      const modal = document.getElementById('all-dictations-modal');
      if (!modal) {
        try { showToast('Не найдено окно всех диктантов (all-dictations-modal)'); } catch (e) { }
        return;
      }

      applyStaticI18n();

      const sortSel = document.getElementById('all-dictations-sort-select');
      if (sortSel && sortSel.value !== state.sort) sortSel.value = state.sort;

      const newLanguage = _resolveCurrentLearning();
      const languageChanged = newLanguage !== state.language;
      state.language = newLanguage;

      modal.style.display = 'flex';

      // Перезагружаем только если язык сменился или ещё ничего не загружено.
      if (!state.loaded || languageChanged) {
        await loadPage(true);
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {
      }
    }

    function close() {
      const modal = document.getElementById('all-dictations-modal');
      if (modal) modal.style.display = 'none';
    }

    // Применяет переводы к статичным элементам модалки (заголовок, сортировка, кнопка «Далее»).
    function applyStaticI18n() {
      try {
        const modal = document.getElementById('all-dictations-modal');
        if (!modal) return;
        modal.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.getAttribute('data-i18n');
          if (!key) return;
          const value = t(key, null);
          if (value && value !== key) el.textContent = value;
        });
      } catch (e) {
      }
    }

    function _bindOnce() {
      // Смена языка интерфейса — обновляем подписи и, при открытой модалке, перерисовываем карточки.
      window.addEventListener('ui-language-changed', () => {
        try {
          applyStaticI18n();
          const modal = document.getElementById('all-dictations-modal');
          if (modal && modal.style.display !== 'none' && state.loaded) {
            // Пересобираем уже загруженные карточки, чтобы перевести кнопки/подсказки.
            const list = listEl();
            if (list) list.innerHTML = '';
            renderItems(state.items);
          }
        } catch (e) {
        }
      });
      // Смена языка оригинала в шапке — перезагружаем список.
      window.addEventListener('desktop:learning-language-changed', () => {
        try {
          const modal = document.getElementById('all-dictations-modal');
          if (!modal || modal.style.display === 'none') return;
          const newLanguage = _resolveCurrentLearning();
          if (newLanguage !== state.language) {
            state.language = newLanguage;
            loadPage(true).catch(() => { });
          }
        } catch (e) {
        }
      });

      const closeBtn = document.getElementById('all-dictations-close');
      if (closeBtn && closeBtn.dataset.bound !== '1') {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        });
      }

      const moreBtn = document.getElementById('all-dictations-more');
      if (moreBtn && moreBtn.dataset.bound !== '1') {
        moreBtn.dataset.bound = '1';
        moreBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          loadPage(false).catch(() => { });
        });
      }

      const sortSel = document.getElementById('all-dictations-sort-select');
      if (sortSel && sortSel.dataset.bound !== '1') {
        sortSel.dataset.bound = '1';
        sortSel.addEventListener('change', () => {
          state.sort = String(sortSel.value || 'rating').trim() || 'rating';
          loadPage(true).catch(() => { });
        });
      }

      const modal = document.getElementById('all-dictations-modal');
      if (modal && modal.dataset.bound !== '1') {
        modal.dataset.bound = '1';
        modal.addEventListener('click', (event) => {
          if (event && event.target === modal) close();
        });
      }

      const textModal = document.getElementById('all-dictations-text-modal');
      const textClose = document.getElementById('all-dictations-text-close');
      if (textClose && textClose.dataset.bound !== '1') {
        textClose.dataset.bound = '1';
        textClose.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeTextModal();
        });
      }
      if (textModal && textModal.dataset.bound !== '1') {
        textModal.dataset.bound = '1';
        textModal.addEventListener('click', (event) => {
          if (event && event.target === textModal) closeTextModal();
        });
      }
    }

    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          _bindOnce();
          applyStaticI18n();
        });
      } else {
        _bindOnce();
        applyStaticI18n();
      }
    } catch (e) {
    }

    window.AllDictationsModal = {
      open,
      close,
      reload: () => loadPage(true),
    };
  } catch (e) {
  }
})();
