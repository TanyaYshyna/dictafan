(function () {
  try {
    const state = {
      onStay: null,
      onDiscard: null,
      onSave: null,
    };

    function _getEl(id) {
      try { return document.getElementById(id); } catch (e) { return null; }
    }

    function _hide() {
      const modal = _getEl('desktopConfirmModal');
      if (!modal) return;
      modal.style.display = 'none';
      state.onStay = null;
      state.onDiscard = null;
      state.onSave = null;
    }

    function open(opts) {
      const modal = _getEl('desktopConfirmModal');
      if (!modal) return;

      const titleEl = _getEl('desktopConfirmModalTitle');
      const msgEl = _getEl('desktopConfirmModalMessage');
      const saveBtn = _getEl('desktopConfirmSaveBtn');

      const title = opts && opts.title != null ? String(opts.title) : 'Сохранить изменения?';
      const message = opts && opts.message != null ? String(opts.message) : 'Что сделать с текущими изменениями?';
      const showSave = !!(opts && opts.showSave);

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (saveBtn) saveBtn.style.display = showSave ? '' : 'none';

      state.onStay = (opts && typeof opts.onStay === 'function') ? opts.onStay : null;
      state.onDiscard = (opts && typeof opts.onDiscard === 'function') ? opts.onDiscard : null;
      state.onSave = (opts && typeof opts.onSave === 'function') ? opts.onSave : null;

      modal.style.display = 'flex';

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons(modal ? { root: modal } : undefined);
        }
      } catch (e) {
      }

      const stayBtn = _getEl('desktopConfirmStayBtn');
      if (stayBtn) stayBtn.focus();
    }

    function _bindOnce() {
      const modal = _getEl('desktopConfirmModal');
      if (!modal || modal.dataset.bound === '1') return;
      modal.dataset.bound = '1';

      const closeX = _getEl('desktopConfirmModalClose');
      const stayBtn = _getEl('desktopConfirmStayBtn');
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

      if (stayBtn) {
        stayBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const fn = state.onStay;
          _hide();
          await safeCall(fn);
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

      modal.addEventListener('click', (e) => {
        try {
          if (e.target === modal) {
            _hide();
          }
        } catch (e2) {
        }
      });

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
