window.Desktop = window.Desktop || {
  ensureDictationKartDeps() {
    try {
      if (typeof window.escapeHtml !== 'function') {
        window.escapeHtml = (s) => {
          try {
            return String(s ?? '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          } catch (e) {
            return '';
          }
        };
      }
    } catch (e) {
    }

    try {
      if (typeof window.libT !== 'function') {
        window.libT = (key, _params, fallback) => {
          try {
            return fallback != null ? String(fallback) : String(key || '');
          } catch (e) {
            return '';
          }
        };
      }
    } catch (e) {
    }

    try {
      if (typeof window.maybeCacheBustDictationCover !== 'function') {
        window.maybeCacheBustDictationCover = (url) => {
          try {
            return String(url || '');
          } catch (e) {
            return '';
          }
        };
      }
    } catch (e) {
    }
  },

  renderLucide(root) {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons(root ? { root: root } : undefined);
      }
    } catch (e) {
    }
  },

  stubAction(name) {
    try {
      console.log('[desktop] action', name);
    } catch (e) {
    }
  },

  initUserMenu() {
    const toggle = document.getElementById('desktopUserMenuToggle');
    const dropdown = document.getElementById('desktopUserMenuDropdown');
    const wrapper = document.getElementById('desktopUserMenuWrapper');
    if (!toggle || !dropdown) return;

    const close = () => {
      try { dropdown.classList.remove('show'); } catch (e0) {}
      try {
        toggle.setAttribute('aria-expanded', 'false');
      } catch (e) {
      }
    };

    const open = () => {
      try { dropdown.classList.add('show'); } catch (e0) {}
      try {
        toggle.setAttribute('aria-expanded', 'true');
      } catch (e) {
      }
      this.renderLucide(dropdown);
    };

    const isOpen = () => {
      try { return dropdown.classList.contains('show'); } catch (e) { return false; }
    };

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen()) close();
      else open();
    });

    document.addEventListener('click', (e) => {
      try {
        if (wrapper && wrapper.contains(e.target)) return;
      } catch (e2) {
      }
      close();
    });

    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape') close();
    });

    dropdown.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        close();
        this.stubAction(action);
      });
    });
  },

  initStubButtons() {
    document.querySelectorAll('[data-action^="desktop-"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        this.stubAction(action);
      });
    });
  },

  renderDeskCards(items) {
    const container = document.getElementById('deskCardsContainer');
    if (!container) return;

    try {
      console.log('[desktop] renderDeskCards: start, items:', Array.isArray(items) ? items.length : 'not-array');
    } catch (e) {
    }

    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
      return;
    }

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'shorts-grid';

    for (const item of items) {
      try {
        const title = (item && item.title != null) ? String(item.title) : 'Без названия';
        const dictationId = (item && item.dictation_id != null) ? String(item.dictation_id) : '';
        grid.insertAdjacentHTML(
          'beforeend',
          `<div class="short-card desk-card" data-dictation-id="${dictationId}"><div style="padding:12px;">${title}</div></div>`
        );
      } catch (e) {
      }
    }

    container.appendChild(grid);

    try {
      const rendered = grid && grid.children ? grid.children.length : 0;
      console.log('[desktop] renderDeskCards: end, rendered:', rendered);
      if (!rendered) {
        container.insertAdjacentHTML(
          'beforeend',
          '<div style="padding: 16px; color: var(--color-text-secondary);">Карточки не отрисовались (0 элементов)</div>'
        );
      }
    } catch (e) {
    }
    this.renderLucide(container);
  },

  async loadDeskItems() {
    const token = (() => {
      try { return localStorage.getItem('jwt_token'); } catch (e) { return null; }
    })();
    if (!token) return;

    try {
      console.log('[desktop] loadDeskItems: start');
    } catch (e) {
    }

    // stage 0: IDB cache
    try {
      if (typeof window.idbGet === 'function') {
        const cached = await window.idbGet('desk_items', 'latest');
        const items = cached && Array.isArray(cached.items) ? cached.items : [];
        if (items.length) {
          this.renderDeskCards(items);
        }
      }
    } catch (e) {
    }

    // stage 1: server
    try {
      const data = await (async () => {
        const res = await fetch('/desk/api/items', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        try {
          return await res.json();
        } catch (e) {
          return null;
        }
      })();
      if (data && data.success && Array.isArray(data.items)) {
        try {
          console.log('[desktop] /desk/api/items ok, items:', data.items.length);
        } catch (e0) {
        }
        this.renderDeskCards(data.items);
        try {
          if (typeof window.idbPut === 'function') {
            await window.idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: data.items });
          }
        } catch (e2) {
        }
      }
    } catch (e) {
      // keep cache render
    }

    try {
      console.log('[desktop] loadDeskItems: end');
    } catch (e) {
    }
  },

  initDeskLoad() {
    const tryLoad = () => {
      try {
        if (!window.UM || typeof window.UM.isAuthenticated !== 'function') return false;
        if (!window.UM.isInitialized) return false;
        if (!window.UM.isAuthenticated()) return false;
        this.loadDeskItems().catch(() => { });
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!tryLoad()) {
      const t = setInterval(() => {
        if (tryLoad()) clearInterval(t);
      }, 100);
    }

    window.addEventListener('user-logged-in', () => {
      try {
        const a = document.querySelector('#user-section .user-avatar-small');
        if (a && !a.style.backgroundImage) a.style.backgroundImage = 'url(/static/icons/default-avatar-small.svg)';
      } catch (e) {
      }
      this.loadDeskItems().catch(() => { });
    });
  },

  init() {
    this.initUserMenu();
    this.initStubButtons();
    this.initDeskLoad();
    this.ensureDictationKartDeps();
    this.renderLucide(document.body);
  },
};

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Desktop.init());
  } else {
    window.Desktop.init();
  }
} catch (e) {
}
