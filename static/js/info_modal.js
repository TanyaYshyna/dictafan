/**
 * info_modal.js — модальное окно «Информация» (полезные ссылки).
 * Используется на desktop.html: пункт меню «Информация» в dropdown пользователя.
 */
(function () {
  function t(key, fallback) {
    try {
      if (window.I18n && typeof window.I18n.t === 'function') {
        const v = window.I18n.t(key);
        if (v && v !== key) return String(v);
      }
    } catch (e) {
    }
    return (fallback != null) ? String(fallback) : String(key || '');
  }

  function applyTexts(modal) {
    const map = {
      infoModalTitle: ['info_modal.title', 'Информация'],
      infoModalMyResourcesTitle: ['info_modal.my_resources', 'Мои ресурсы'],
      infoModalFriendsTitle: ['info_modal.friends', 'Друзья']
    };
    Object.keys(map).forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = t(map[id][0], map[id][1]);
    });

    const closeBtn = document.getElementById('closeInfoModalBtn');
    if (closeBtn) closeBtn.setAttribute('title', t('info_modal.close', 'Закрыть'));
    if (closeBtn) closeBtn.setAttribute('aria-label', t('info_modal.close', 'Закрыть'));
  }

  function ensureModal() {
    const modal = document.getElementById('info-modal');
    if (!modal) return null;

    applyTexts(modal);

    if (!modal.__infoBound) {
      modal.__infoBound = true;

      const hide = function () {
        try { modal.style.display = 'none'; } catch (e) {}
      };

      const closeBtn = document.getElementById('closeInfoModalBtn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          hide();
        });
      }

      modal.addEventListener('click', function (e) {
        if (e && e.target === modal) hide();
      });

      document.addEventListener('keydown', function (e) {
        if (e && e.key === 'Escape') {
          try {
            if (modal.style.display !== 'none') hide();
          } catch (e2) {}
        }
      });
    }

    return modal;
  }

  function renderLucide(modal) {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: modal });
      }
    } catch (e) {
    }
  }

  function open() {
    const modal = ensureModal();
    if (!modal) return;

    try {
      modal.style.display = 'flex';
    } catch (e) {
      modal.style.display = 'block';
    }

    renderLucide(modal);
  }

  window.InfoModal = {
    open: open,
    ensureModal: ensureModal
  };
})();
