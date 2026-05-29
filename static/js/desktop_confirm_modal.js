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

      const title = opts && opts.title != null
        ? String(opts.title)
        : t('desktop.confirm.title', 'Сохранить изменения?');
      const showSave = !!(opts && opts.showSave);

      if (titleEl) titleEl.textContent = title;
      if (saveBtn) saveBtn.style.display = showSave ? '' : 'none';

      try {
        const label = t('desktop.confirm.save', 'Сохранить');
        if (discardLabel) discardLabel.textContent = label;
      } catch (e) {
      }

      try {
        const label = t('desktop.confirm.save', 'Сохранить');
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
        if (showSave && saveBtn) saveBtn.focus();
        else if (discardBtn) discardBtn.focus();
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
  } catch (e) {
  }
})();
