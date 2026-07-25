(function () {
  try {
    function escapeHtml(s) {
      try {
        return String(s ?? '')
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, '&#x27;');
      } catch (e) {
        return '';
      }
    }

    function getLanguageDisplayName(langCode) {
      try {
        if (window.LanguageManager && typeof window.LanguageManager.getNativeLanguageName === 'function') {
          const native = window.LanguageManager.getNativeLanguageName(langCode);
          if (native && native !== langCode) return native;
        }
        if (window.LanguageManager && typeof window.LanguageManager.getLanguageName === 'function') {
          return window.LanguageManager.getLanguageName(langCode);
        }
      } catch (e) {}
      return langCode.toUpperCase();
    }

    function getFlagFilename(langCode) {
      try {
        if (window.LanguageManager && typeof window.LanguageManager.getCountryCode === 'function') {
          const cc = window.LanguageManager.getCountryCode(langCode);
          return cc ? cc + '.svg' : '';
        }
      } catch (e) {}
      return '';
    }

    function createFlagHtml(langCode, size) {
      var fn = getFlagFilename(langCode);
      if (!fn) return '';
      var w = size === 'small' ? 24 : 36;
      var h = size === 'small' ? 18 : 27;
      return '<img src="/static/flags/' + encodeURIComponent(fn) + '" alt="' + escapeHtml(getLanguageDisplayName(langCode)) + '" style="width:' + w + 'px;height:' + h + 'px;border-radius:2px;object-fit:cover;flex-shrink:0;">';
    }

    var _modalEl = null;

    function ensureModal() {
      if (_modalEl && document.body.contains(_modalEl)) return _modalEl;
      _modalEl = document.createElement('div');
      _modalEl.id = 'dictation-language-modal';
      _modalEl.innerHTML = `
        <div class="dictation-language-modal-content">
          <div class="dictation-language-modal-header">
            <div class="dictation-language-modal-title">${escapeHtml(window.DictationLanguageModal && window.DictationLanguageModal._t ? window.DictationLanguageModal._t('dictation_language_modal.title', 'Язык перевода') : 'Язык перевода')}</div>
            <button type="button" id="dictation-language-modal-close" class="dictation-language-modal-close" title="Закрыть">
              <i data-lucide="x" class="dictation-language-modal-close-icon"></i>
            </button>
          </div>
          <div class="dictation-language-modal-body">
            <div class="dictation-language-modal-hint">${escapeHtml(window.DictationLanguageModal && window.DictationLanguageModal._t ? window.DictationLanguageModal._t('dictation_language_modal.hint', 'Выберите язык перевода для этого диктанта') : 'Выберите язык перевода для этого диктанта')}</div>
            <div id="dictation-language-list"></div>
          </div>
        </div>
      `;
      document.body.appendChild(_modalEl);

      _modalEl.addEventListener('click', function (e) {
        if (e.target === _modalEl) closeModal();
      });

      var closeBtn = _modalEl.querySelector('#dictation-language-modal-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: _modalEl });
        }
      } catch (e) {}

      return _modalEl;
    }

    function closeModal() {
      try {
        if (_modalEl) {
          _modalEl.style.display = 'none';
          _modalEl.style.visibility = '';
          _modalEl.style.opacity = '';
        }
      } catch (e) {}
    }

    /**
     * Открыть модалку выбора языка перевода.
     * @param {object} options
     * @param {string} options.dictationId - ID диктанта (dict_N)
     * @param {string} options.langOriginal - код языка оригинала
     * @param {string[]} options.translationLanguages - доступные языки перевода
     * @param {HTMLElement} options.cardEl - элемент карточки
     * @param {function} [options.onSelect] - callback при выборе языка (вместо auto-open)
     */
    function openLanguageModal(options) {
      var opts = options || {};
      var dictationId = String(opts.dictationId || '');
      var langOriginal = String(opts.langOriginal || 'en');
      var translationLanguages = Array.isArray(opts.translationLanguages) ? opts.translationLanguages : [];
      var cardEl = opts.cardEl || null;
      var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;

      if (!translationLanguages.length) return;

      var modal = ensureModal();

      // Показываем
      try {
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.removeAttribute('hidden');
      } catch (e) {}

      var listEl = modal.querySelector('#dictation-language-list');
      if (!listEl) return;

      var nativeLang = '';
      try {
        if (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage) {
          nativeLang = String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase();
        }
      } catch (e) {}

      // Сортируем: родной язык (если есть среди доступных) — первым
      var sorted = translationLanguages.slice().sort(function (a, b) {
        if (a === nativeLang) return -1;
        if (b === nativeLang) return 1;
        return 0;
      });

      var html = sorted.map(function (lang) {
        var name = getLanguageDisplayName(lang);
        var isNative = lang === nativeLang;
        return '<button type="button" class="dictation-language-item" data-lang="' + escapeHtml(lang) + '">' +
          createFlagHtml(lang, 'small') +
          '<span class="dictation-language-item-label">' + escapeHtml(name) + (isNative ? ' <span class="dictation-language-item-note">(родной)</span>' : '') + '</span>' +
          '</button>';
      }).join('');

      listEl.innerHTML = html;

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: modal });
        }
      } catch (e) {}

      // Обработчики клика
      var btns = listEl.querySelectorAll('.dictation-language-item');
      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var langTr = btn.getAttribute('data-lang');
          closeModal();
          if (onSelect) {
            onSelect(langTr);
          } else if (langOriginal && langTr && dictationId) {
            var url = '/dictation/' + encodeURIComponent(dictationId) + '/' + encodeURIComponent(langOriginal) + '/' + encodeURIComponent(langTr);
            if (typeof window.openDictationLaunch === 'function') {
              window.openDictationLaunch(Number(dictationId.replace('dict_', '')), url, cardEl, '');
            } else if (window.DictationModal && typeof window.DictationModal.open === 'function') {
              window.DictationModal.open(url, { cardEl, subsetPositions: null });
            }
          }
        });
      });
    }

    // Экспорт
    window.DictationLanguageModal = {
      open: openLanguageModal,
      close: closeModal,
      _t: function (key, fallback) {
        try {
          if (window.I18n && typeof window.I18n.t === 'function') {
            var v = window.I18n.t(key);
            if (v && v !== key) return v;
          }
        } catch (e) {}
        return fallback;
      },
    };
  } catch (e) {
    try {
      console.error('[dictation_language_modal] init error:', e);
    } catch (e2) {}
  }
})();
