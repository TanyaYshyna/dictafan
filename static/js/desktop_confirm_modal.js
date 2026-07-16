(function () {
  try {
    const state = {
      onDiscard: null,
      onSave: null,
    };

    function t(key, fallback) {
      try {
        if (window.I18n && typeof window.I18n.t === 'function') {
          const v = window.I18n.t(key);
          if (v && v !== key) return String(v);
        }
      } catch (e) {
      }
      return String(fallback || '');
    }

    function _getEl(id) {
      try { return document.getElementById(id); } catch (e) { return null; }
    }

    function _hide() {
      const modal = _getEl('desktopConfirmModal');
      if (!modal) return;
      modal.style.display = 'none';
      state.onDiscard = null;
      state.onSave = null;
    }

    function open(opts) {
      const modal = _getEl('desktopConfirmModal');
      if (!modal) return;

      const titleEl = _getEl('desktopConfirmModalTitle');
      const saveBtn = _getEl('desktopConfirmSaveBtn');
      const discardBtn = _getEl('desktopConfirmDiscardBtn');
      const discardLabel = _getEl('desktopConfirmDiscardLabel');
      const saveLabel = _getEl('desktopConfirmSaveLabel');
      const closeX = _getEl('desktopConfirmModalClose');
      const buttonsContainer = _getEl('desktopConfirmModalButtons');

      // Элементы для обложки, названия и сообщения
      const coverWrap = _getEl('desktopConfirmModalCoverWrap');
      const coverImg = _getEl('desktopConfirmModalCoverImg');
      const dictationTitleEl = _getEl('desktopConfirmModalDictationTitle');
      const messageEl = _getEl('desktopConfirmModalMessage');

      const title = opts && opts.title != null
        ? String(opts.title)
        : t('desktop.confirm.title', 'Сохранить изменения?');
      const showSave = !!(opts && opts.showSave);
      const customButtons = opts && Array.isArray(opts.buttons) ? opts.buttons : null;

      if (titleEl) titleEl.textContent = title;

      // Обложка диктанта
      const coverUrl = opts && opts.coverUrl ? String(opts.coverUrl) : '';
      if (coverWrap && coverImg) {
        if (coverUrl) {
          coverImg.src = coverUrl;
          coverWrap.style.display = 'flex';
        } else {
          coverImg.src = '';
          coverWrap.style.display = 'none';
        }
      }

      // Название диктанта
      const dictationTitle = opts && opts.dictationTitle ? String(opts.dictationTitle) : '';
      if (dictationTitleEl) {
        if (dictationTitle) {
          dictationTitleEl.textContent = dictationTitle;
          dictationTitleEl.style.display = 'block';
        } else {
          dictationTitleEl.textContent = '';
          dictationTitleEl.style.display = 'none';
        }
      }

      // Текст сообщения
      const message = opts && opts.message != null ? String(opts.message) : '';
      if (messageEl) {
        messageEl.textContent = message;
      }

      // Если есть кастомные кнопки — показываем их, скрываем стандартные
      if (customButtons && buttonsContainer) {
        // Удаляем предыдущие кастомные кнопки (если были)
        var existingCustom = buttonsContainer.querySelectorAll('.desktop-confirm-custom-btn');
        existingCustom.forEach(function (el) { el.remove(); });

        // Скрываем стандартные кнопки
        if (saveBtn) saveBtn.style.display = 'none';
        if (discardBtn) discardBtn.style.display = 'none';

        // Создаём кастомные кнопки
        customButtons.forEach(function (btnOpts) {
          var btn = document.createElement('button');
          btn.className = 'desktop-confirm-custom-btn';
          if (btnOpts.type === 'danger') {
            btn.classList.add('button-color-red');
          } else if (btnOpts.type === 'primary') {
            btn.classList.add('button-color-yellow');
          } else {
            btn.classList.add('button-color-lightgreen');
          }
          btn.textContent = btnOpts.text || '';
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            _hide();
            if (typeof btnOpts.onClick === 'function') {
              btnOpts.onClick();
            }
          });
          buttonsContainer.appendChild(btn);
        });
      } else {
        // Стандартное поведение — показываем стандартные кнопки
        if (saveBtn) saveBtn.style.display = showSave ? '' : 'none';
        if (discardBtn) discardBtn.style.display = '';

        // Удаляем предыдущие кастомные кнопки
        if (buttonsContainer) {
          var existingCustom = buttonsContainer.querySelectorAll('.desktop-confirm-custom-btn');
          existingCustom.forEach(function (el) { el.remove(); });
        }
      }

      try {
        const label = t('desktop.confirm.exit', 'Выйти');
        if (discardLabel) discardLabel.textContent = label;
      } catch (e) {
      }

      try {
        const label = t('desktop.confirm.exit', 'Выйти');
        if (saveLabel) saveLabel.textContent = label;
      } catch (e) {
      }

      try {
        if (closeX) closeX.title = t('desktop.confirm.close', 'Закрыть');
      } catch (e) {
      }

      state.onDiscard = (opts && typeof opts.onDiscard === 'function') ? opts.onDiscard : null;
      state.onSave = (opts && typeof opts.onSave === 'function') ? opts.onSave : null;

      modal.style.display = 'flex';

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }

      try {
        if (customButtons) {
          var firstCustom = buttonsContainer && buttonsContainer.querySelector('.desktop-confirm-custom-btn');
          if (firstCustom) firstCustom.focus();
        } else if (showSave && saveBtn) {
          saveBtn.focus();
        } else if (discardBtn) {
          discardBtn.focus();
        }
      } catch (e) {
      }
    }

    function _bindOnce() {
      const modal = _getEl('desktopConfirmModal');
      if (!modal || modal.dataset.bound === '1') return;
      modal.dataset.bound = '1';

      const closeX = _getEl('desktopConfirmModalClose');
      const discardBtn = _getEl('desktopConfirmDiscardBtn');
      const saveBtn = _getEl('desktopConfirmSaveBtn');

      const safeCall = async (fn) => {
        try {
          const res = fn && fn();
          if (res && typeof res.then === 'function') await res;
        } catch (e) {
        }
      };

      if (closeX) {
        closeX.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          _hide();
        });
      }

      if (discardBtn) {
        discardBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const fn = state.onDiscard;
          _hide();
          await safeCall(fn);
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const fn = state.onSave;
          _hide();
          await safeCall(fn);
        });
      }

      document.addEventListener('keydown', (e) => {
        try {
          if (e && e.key === 'Escape' && modal.style.display !== 'none') {
            _hide();
          }
        } catch (e2) {
        }
      });
    }

    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bindOnce);
      } else {
        _bindOnce();
      }
    } catch (e) {
    }

    window.DesktopConfirmModal = window.DesktopConfirmModal || {
      open,
      hide: _hide,
    };

    try {
      const loadingState = {
        visible: false,
      };

      function _getLoadingEl() {
        try { return document.getElementById('desktopLoadingModal'); } catch (e) { return null; }
      }

      function show(message) {
        const modal = _getLoadingEl();
        if (!modal) return;
        const textEl = document.getElementById('desktopLoadingModalText');
        if (textEl) textEl.textContent = String(message || 'Загрузка...');
        modal.style.display = 'flex';
        loadingState.visible = true;
      }

      function hide() {
        const modal = _getLoadingEl();
        if (!modal) return;
        modal.style.display = 'none';
        loadingState.visible = false;
      }

      function isVisible() {
        return !!loadingState.visible;
      }

      window.DesktopLoadingModal = window.DesktopLoadingModal || {
        show,
        hide,
        isVisible,
      };
    } catch (e) {
    }

    try {
      const toastState = {
        container: null,
      };

      function _ensureToastContainer() {
        if (toastState.container && document.body.contains(toastState.container)) return toastState.container;
        const el = document.createElement('div');
        el.id = 'desktopToastContainer';
        el.style.position = 'fixed';
        el.style.top = '16px';
        el.style.right = '16px';
        el.style.zIndex = '2147483647';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.gap = '10px';
        el.style.pointerEvents = 'none';
        document.body.appendChild(el);
        toastState.container = el;
        return el;
      }

      function show(message, type = 'info', duration = 2500) {
        const container = _ensureToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast-notice ${String(type || 'info')}`;
        toast.textContent = String(message || '');
        toast.style.pointerEvents = 'auto';
        container.appendChild(toast);

        const ms = Math.max(300, Number(duration) || 2500);
        setTimeout(() => {
          try {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 250ms ease';
          } catch (e) {
          }
          setTimeout(() => {
            try {
              if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
            } catch (e2) {
            }
          }, 280);
        }, ms);
      }

      window.DesktopToast = window.DesktopToast || {
        show,
      };
    } catch (e) {
    }
  } catch (e) {
  }
})();
