/**
 * dictation_editor_modal.js — Редактор диктанта в модальном окне
 * IIFE-паттерн, как dictation_modal.js
 */
(function () {
  'use strict';

  const MODAL_ID = 'dictationEditorModal';
  const BODY_ID = 'dictationEditorModalBody';

  const state = {
    isOpen: false,
    config: null, // { dictationId, originalLanguage, translationLanguage, title, level, authorMaterialsUrl, coverUrl }
    headerLangPairSelector: null,
  };

  /* ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===== */

  function _normalizeLangCode(code) {
    if (!code) return '';
    return String(code).toLowerCase().trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ===== ИНИЦИАЛИЗАЦИЯ ПОЛЕЙ ===== */

  function _setupCloseButton() {
    const closeBtn = document.getElementById('dictationEditorModalCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }
  }

  function _setupOverlayClose() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          close();
        }
      });
    }
  }

  function _setupUserSection() {
    try {
      // Аватар — копируем из .user-avatar-small в topbar
      const avatarEl = document.getElementById('dictationEditorModalAvatar');
      if (avatarEl) {
        const sourceAvatar = document.querySelector('.user-avatar-small');
        if (sourceAvatar) {
          const bg = sourceAvatar.style.backgroundImage || '';
          if (bg) avatarEl.style.backgroundImage = bg;
        }
      }

      // Имя — копируем из .username-text в topbar
      const usernameEl = document.getElementById('dictationEditorModalUsername');
      if (usernameEl) {
        const sourceName = document.querySelector('.username-text');
        usernameEl.textContent = sourceName ? (sourceName.textContent || '').trim() : '';
      }
    } catch (e) {
      console.warn('[dictationEditorModal] userSection error', e);
    }
  }

  function _initLanguageFlags() {
    try {
      const container = document.getElementById('editorModalLangPair');
      if (!container) return;
      if (!window.LanguageManager || typeof window.initLanguageSelector !== 'function') return;

      const languageData = window.LanguageManager.getLanguageData();
      if (!languageData || !state.config) return;

      const orig = _normalizeLangCode(state.config.originalLanguage);
      const tr = _normalizeLangCode(state.config.translationLanguage);

      const validOrig = languageData[orig] ? orig : '';
      const validTr = languageData[tr] ? tr : '';

      container.innerHTML = '';

      if (!validOrig && !validTr) {
        console.warn('[dictationEditorModal] No valid language codes for flags', { orig, tr });
        return;
      }

      if (validOrig && validTr) {
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-pair-fixed',
          currentLearning: validOrig,
          nativeLanguage: validTr,
          languageData: languageData
        });
      } else if (validOrig) {
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-single',
          currentLearning: validOrig,
          nativeLanguage: validOrig,
          languageData: languageData
        });
      }
    } catch (e) {
      console.warn('[dictationEditorModal] _initLanguageFlags error', e);
    }
  }

  function _initFormFields() {
    if (!state.config) return;

    // Title
    const titleEl = document.getElementById('dictationEditorModalTitle');
    const titleInput = document.getElementById('dictationEditorModalTitleInput');
    if (titleEl && state.config.title) {
      titleEl.textContent = state.config.title;
    }
    if (titleInput && state.config.title) {
      titleInput.value = state.config.title;
    }

    // Dictation ID
    const idEl = document.getElementById('dictation-editor-modal-id');
    if (idEl && state.config.dictationId) {
      idEl.textContent = '#' + state.config.dictationId;
    }

    // Author materials URL
    const authorUrlInput = document.getElementById('dictationEditorModalAuthorUrl');
    if (authorUrlInput && state.config.authorMaterialsUrl) {
      authorUrlInput.value = state.config.authorMaterialsUrl;
    }

    // Cover
    const coverImg = document.getElementById('dictationEditorModalCoverImage');
    const modalCover = document.getElementById('dictationEditorModalCover');
    if (state.config.coverUrl) {
      if (coverImg) coverImg.src = state.config.coverUrl;
      if (modalCover) modalCover.src = state.config.coverUrl;
    }
  }

  function _initLevelSelector() {
    const control = document.getElementById('dictationEditorModalLevelSelect');
    if (!control) return;

    const button = control.querySelector('.speed-select-button');
    const valueSpan = control.querySelector('.level-select-value');
    const options = control.querySelectorAll('.speed-options li');

    if (!button || !valueSpan) return;

    const savedLevel = (state.config && state.config.level) || 'A1';
    valueSpan.textContent = savedLevel;

    options.forEach(function (opt) {
      if (opt.getAttribute('data-value') === savedLevel) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });

    button.addEventListener('click', function (e) {
      e.stopPropagation();
      control.classList.toggle('open');
    });

    options.forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        const value = opt.getAttribute('data-value');
        valueSpan.textContent = value;
        options.forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        control.classList.remove('open');
      });
    });

    document.addEventListener('click', function () {
      control.classList.remove('open');
    });
  }

  function _initVoiceModeRadios() {
    const radios = document.querySelectorAll('input[name="editorModalVoiceMode"]');
    if (!radios.length) return;

    const updateTabVisibility = function (selectedValue) {
      document.querySelectorAll('.dictation-editor-modal__tab-btn[data-voice-mode]').forEach(function (btn) {
        const mode = btn.getAttribute('data-voice-mode');
        btn.style.display = (mode === selectedValue) ? '' : 'none';
      });

      const activeTab = document.querySelector('.dictation-editor-modal__tab-btn.active');
      if (activeTab && activeTab.style.display === 'none') {
        const generalTab = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="general"]');
        if (generalTab) {
          generalTab.click();
        }
      }
    };

    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (this.checked) {
          updateTabVisibility(this.value);
        }
      });
    });

    const checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
    if (checkedRadio) {
      updateTabVisibility(checkedRadio.value);
    }
  }

  function _initCoverUpload() {
    const uploadBtn = document.getElementById('dictationEditorModalCoverUploadBtn');
    const fileInput = document.getElementById('dictationEditorModalCoverFile');
    const coverImage = document.getElementById('dictationEditorModalCoverImage');
    const modalCover = document.getElementById('dictationEditorModalCover');

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (ev) {
        if (coverImage) coverImage.src = ev.target.result;
        if (modalCover) modalCover.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function _setupTabs() {
    const panel = document.querySelector('.dictation-editor-modal__tabs-panel');
    if (!panel) return;

    panel.querySelectorAll('.dictation-editor-modal__tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tabName = btn.getAttribute('data-tab');

        panel.querySelectorAll('.dictation-editor-modal__tab-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        panel.querySelectorAll('.dictation-editor-modal__tab-content').forEach(function (c) {
          c.classList.remove('active');
        });

        btn.classList.add('active');
        var tabContent = document.getElementById('tab-' + tabName);
        if (tabContent) {
          tabContent.classList.add('active');
        }

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      });
    });
  }

  /* ===== OPEN / CLOSE ===== */

  function open(config) {
    if (state.isOpen) return;

    state.config = config || {};
    state.isOpen = true;

    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    modal.style.display = 'flex';

    // Инициализация
    _setupUserSection();
    _initLanguageFlags();
    _initFormFields();
    _initLevelSelector();
    _initVoiceModeRadios();
    _initCoverUpload();
    _setupTabs();

    // Обновляем иконки Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Блокируем скролл body
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!state.isOpen) return;

    state.isOpen = false;
    state.config = null;
    state.headerLangPairSelector = null;

    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'none';
    }

    document.body.style.overflow = '';
  }

  /* ===== INIT ===== */

  function init() {
    _setupCloseButton();
    _setupOverlayClose();
  }

  // Экспортируем в глобальную область
  window.DictationEditorModal = {
    open: open,
    close: close,
    init: init,
  };

  // Авто-инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
