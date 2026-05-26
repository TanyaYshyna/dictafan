window.DictationKart = window.DictationKart || {
  _createElementFromHtml(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(html || '').trim();
    return wrap.firstElementChild;
  },

  _renderLucide(root) {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons(root ? { root: root } : undefined);
      }
    } catch (e) {
    }
  },

  _bindHandlers(cardEl) {
    if (!cardEl) return;

    const thumb = cardEl.querySelector('.short-thumb');
    if (thumb && thumb.hasAttribute('data-href')) {
      const open = (e) => {
        try {
          const href = thumb.getAttribute('data-href');
          if (!href) return;
          e.preventDefault();
          e.stopPropagation();
          window.location.href = href;
        } catch (e2) {
        }
      };
      thumb.addEventListener('click', open);
      thumb.addEventListener('keydown', (e) => {
        if (!e || (e.key !== 'Enter' && e.key !== ' ')) return;
        open(e);
      });
    }

    const kebabBtn = cardEl.querySelector('[data-action="toggle-card-actions"]');
    const menu = cardEl.querySelector('.short-card-actions-menu');
    if (!kebabBtn || !menu) return;

    const closeMenu = () => {
      try {
        menu.classList.remove('show');
        menu.style.display = 'none';
        cardEl.classList.remove('short-card--menu-open');
      } catch (e) {
      }
    };

    const openMenu = () => {
      try {
        document.querySelectorAll('.short-card-actions-menu').forEach((m) => {
          try {
            if (m !== menu) {
              m.classList.remove('show');
              m.style.display = 'none';
            }
          } catch (e0) {
          }
        });
        document.querySelectorAll('.short-card.short-card--menu-open').forEach((c) => {
          try {
            if (c !== cardEl) c.classList.remove('short-card--menu-open');
          } catch (e0) {
          }
        });

        menu.classList.add('show');
        menu.style.display = 'block';
        cardEl.classList.add('short-card--menu-open');
        this._renderLucide(menu);
      } catch (e) {
      }
    };

    kebabBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('show');
      if (isOpen) closeMenu();
      else openMenu();
    });

    document.addEventListener('click', (e) => {
      try {
        if (menu.contains(e.target) || kebabBtn.contains(e.target)) return;
      } catch (e2) {
      }
      closeMenu();
    });

    menu.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        if (!action) return;

        if (action === 'edit-dictation') {
          const editUrl = String(btn.getAttribute('data-edit-url') || '').trim();
          if (editUrl) {
            closeMenu();
            window.location.href = editUrl;
            return;
          }
        }

        closeMenu();

        try {
          if (action === 'remove-from-desk' && typeof window.removeFromDesk === 'function') {
            const itemId = btn.getAttribute('data-desk-item-id');
            const dictationId = btn.getAttribute('data-dictation-id');
            if (itemId && dictationId) {
              await window.removeFromDesk(itemId, dictationId);
              return;
            }
          }
        } catch (e2) {
        }

        try {
          if (action === 'create-assignment' && typeof window.openCreateAssignmentModal === 'function') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (dictationId) window.openCreateAssignmentModal(dictationId);
            return;
          }
        } catch (e2) {
        }

        try {
          if (action === 'plan-tasks' && typeof window.openPlanTasksModal === 'function') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (dictationId) window.openPlanTasksModal(dictationId);
            return;
          }
        } catch (e2) {
        }

        try {
          console.log('[dictation_kart] menu action', action);
        } catch (e2) {
        }
      });
    });
  },

  buildMenuItems(context) {
    if (context === 'desk') {
      return [
        { action: 'create-assignment', icon: 'clipboard-list', labelKey: 'private_library.dictation_card_actions.create_assignment_new', labelFallback: 'Создать задание' },
        { action: 'plan-tasks', icon: 'calendar-plus', labelKey: 'private_library.dictation_card_actions.plan', labelFallback: 'Запланировать' },
        { action: 'prefetch-dictation-cache', icon: 'download', labelKey: 'private_library.dictation_card_actions.cache', labelFallback: 'Скачать в кэш' },
        { action: 'edit-dictation', icon: 'pencil-ruler', labelKey: 'private_library.dictation_card_actions.edit', labelFallback: 'Редактировать' },
        { action: 'show-in-book', icon: 'book-marked', labelKey: 'private_library.dictation_card_actions.show_in_book', labelFallback: 'Показать в книге' },
        { action: 'remove-from-desk', icon: 'arrow-big-down-dash', labelKey: 'private_library.dictation_card_actions.remove_from_desk', labelFallback: 'Убрать со стола' },
      ];
    }

    return [
      { action: 'edit-dictation', icon: 'pencil-ruler', labelKey: 'private_library.dictation_card_actions.edit', labelFallback: 'Редактировать' },
      { action: 'create-assignment', icon: 'clipboard-list', labelKey: 'private_library.dictation_card_actions.create_assignment', labelFallback: 'Создать задание' },
      { action: 'plan-tasks', icon: 'calendar-plus', labelKey: 'private_library.dictation_card_actions.plan', labelFallback: 'Запланировать' },
      { action: 'move-dictation', icon: 'folder-symlink', labelKey: 'private_library.dictation_card_actions.move', labelFallback: 'Переместить' },
      { action: 'delete-dictation', icon: 'trash-2', labelKey: 'private_library.dictation_card_actions.delete', labelFallback: 'Удалить', danger: true },
    ];
  },

  renderMenuHtml({ context, dictationId, deskItemId, editUrl, langOriginal, coverUrl, availableTranslations }) {
    const items = this.buildMenuItems(context);

    const t = (key, fallback) => {
      try {
        if (typeof window.libT === 'function') return window.escapeHtml(window.libT(key, null, fallback));
      } catch (e) {
      }
      try {
        return window.escapeHtml(fallback);
      } catch (e2) {
        return String(fallback);
      }
    };

    return `
      <div class="dropdown-menu-wrapper short-actions-menu-wrapper">
        <button class="short-action-btn short-action-btn--kebab" data-action="toggle-card-actions" title="${t('private_library.dictation_card_actions.title', 'Действия')}" aria-label="${t('private_library.dictation_card_actions.title', 'Действия')}">
          <i data-lucide="more-vertical"></i>
        </button>
        <div class="dropdown-menu short-card-actions-menu" style="display: none;">
          ${items
            .map((it) => {
              const cls = it.danger ? 'dropdown-menu-item dropdown-menu-item-danger' : 'dropdown-menu-item';
              const attrs = [];
              attrs.push(`class="${cls}"`);
              attrs.push(`data-action="${it.action}"`);

              if (it.action === 'edit-dictation') {
                attrs.push(`type="button"`);
                attrs.push(`data-edit-url="${window.escapeHtml(String(editUrl || ''))}"`);
              } else if (it.action === 'remove-from-desk') {
                attrs.push(`data-desk-item-id="${window.escapeHtml(String(deskItemId || ''))}"`);
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
              } else if (it.action === 'prefetch-dictation-cache') {
                attrs.push(`type="button"`);
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
                attrs.push(`data-lang-original="${window.escapeHtml(String(langOriginal || ''))}"`);
                attrs.push(`data-cover-url="${window.escapeHtml(String(coverUrl || ''))}"`);
                attrs.push(`data-translation-langs="${window.escapeHtml(String((availableTranslations || []).join(','))) }"`);
              } else {
                attrs.push(`data-dictation-id="${window.escapeHtml(String(dictationId || ''))}"`);
              }

              return `
                <button ${attrs.join(' ')}>
                  <i data-lucide="${it.icon}"></i>
                  <span>${t(it.labelKey, it.labelFallback)}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },

  renderDeskCard(item) {
    const dictationId = item.dictation_id;
    const dictationIdFormatted = `dict_${dictationId}`;

    const langOriginal = item.language_original || item.language_code || 'en';
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    const availableTranslations = Array.isArray(item.translation_languages)
      ? item.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const pick = window._pickTranslationLanguageForOpen
      ? window._pickTranslationLanguageForOpen({
          preferredNative: nativeLang,
          availableTranslations,
          fallbackLang: item.language_translation || nativeLang || langOriginal || 'en',
        })
      : { lang: item.language_translation || nativeLang || langOriginal || 'en', reason: '' };

    const langTranslation = pick.lang;
    const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editUrl = `/dictation_editor/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;

    const coverUrl = window.maybeCacheBustDictationCover ? window.maybeCacheBustDictationCover(item.cover_url) : (item.cover_url || '');

    const sentencesCount = typeof item.sentences_count === 'number' ? item.sentences_count : (parseInt(item.sentences_count, 10) || 0);
    const langPair = `${langOriginal}`;

    const isCachedRender = !!(item && item.__desk_cached_render);
    const coverSrc = isCachedRender
      ? (coverUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
      : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const coverLoading = isCachedRender ? 'eager' : 'lazy';

    const noticeMessage = pick && pick.reason ? String(pick.reason) : '';

    const menu = this.renderMenuHtml({
      context: 'desk',
      dictationId,
      deskItemId: item.id,
      editUrl,
      langOriginal,
      coverUrl,
      availableTranslations,
    });

    return `
      <div class="short-card dictation-kart desk-card" data-dictation-id="${dictationId}" data-desk-item-id="${item.id}">
        <div class="short-thumb" data-href="${openUrl}" data-lang-notice="${window.escapeHtml(noticeMessage)}" role="link" tabindex="0">
          <img src="${coverSrc}" data-cover-url="${coverUrl || ''}" alt="" class="short-cover" loading="${coverLoading}" decoding="async" draggable="false">
          <div class="card-progress-stats"></div>
        </div>
        <h3 class="short-title">${item.title || 'Без названия'}</h3>

        <div class="short-meta short-meta--row">
          <div class="short-meta-left">
            <span class="short-lang-flags">${langPair}</span>
            <span class="short-level">${item.level || '—'}</span>
          </div>
          <div class="short-meta-right">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${sentencesCount}</span>
            </div>
          </div>
        </div>

        <div class="short-stats" data-dictation-id="${dictationId}">
          <div class="stats-placeholder"></div>
        </div>

        <div class="short-footer">
          <div class="short-dikt-number">${dictationIdFormatted}</div>
          ${menu}
        </div>
      </div>
    `;
  },

  renderBookCard(item) {
    const d = item;
    const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';

    const langOriginal = d.language_original || d.language_code || 'en';
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    const availableTranslations = Array.isArray(d.translation_languages)
      ? d.translation_languages.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = nativeLang && availableTranslations.includes(nativeLang) ? nativeLang : '';
    const langTranslation = preferredNative || d.language_translation || nativeLang || d.language_code || 'en';

    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;

    const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;

    const isOnDesk = window.isDictationOnDesk ? window.isDictationOnDesk(dbId) : false;

    const langPair = `${langOriginal}`;
    const sentencesCount = typeof d.sentences_count === 'number' ? d.sentences_count : (parseInt(d.sentences_count, 10) || 0);

    const menu = this.renderMenuHtml({
      context: 'book',
      dictationId: dbId,
      deskItemId: null,
      editUrl,
      langOriginal,
      coverUrl,
      availableTranslations,
    });

    return `
      <div class="short-card dictation-kart ${isOnDesk ? 'short-card--on-desk' : 'short-card--off-desk'}" data-dictation-id="${dbId}" data-action="toggle-desk" data-edit-url="${editUrl}">
        <div class="short-thumb">
          <img src="${coverUrl}" alt="${d.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
        </div>
        <h3 class="short-title">${d.title || 'Без названия'}</h3>

        <div class="short-meta short-meta--row">
          <div class="short-meta-left">
            <span class="short-lang-flags">${langPair}</span>
            <span class="short-level">${d.level || '—'}</span>
          </div>
          <div class="short-meta-right">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${sentencesCount}</span>
            </div>
          </div>
        </div>

        <div class="short-footer">
          <button class="short-action-btn short-action-btn--kebab short-desk-toggle-btn" data-action="toggle-desk-explicit" data-dictation-id="${dbId}" title="" aria-label="">
            <i data-lucide="${isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash'}"></i>
          </button>
          <div class="short-dikt-number">${dictationId}</div>
          ${menu}
        </div>
      </div>
    `;
  },

  render(item, opts = {}) {
    const context = opts && opts.context ? String(opts.context) : 'book';
    if (context === 'desk') return this.renderDeskCard(item);
    return this.renderBookCard(item);
  },

  createDeskCardElement(item) {
    const el = this._createElementFromHtml(this.renderDeskCard(item));
    this._bindHandlers(el);
    this._renderLucide(el);
    return el;
  },

  createBookCardElement(item) {
    const el = this._createElementFromHtml(this.renderBookCard(item));
    this._bindHandlers(el);
    this._renderLucide(el);
    return el;
  },
};
