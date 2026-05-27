window.Desktop = window.Desktop || {
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

    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
      return;
    }

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'shorts-grid';

    for (const item of items) {
      try {
        if (window.DictationKart && typeof window.DictationKart.createDeskCardElement === 'function') {
          const el = window.DictationKart.createDeskCardElement(item);
          if (el) {
            grid.appendChild(el);
            continue;
          }
        }
      } catch (e) {
      }

      try {
        if (window.DictationKart && typeof window.DictationKart.render === 'function') {
          const html = window.DictationKart.render(item, { context: 'desk' });
          if (html) {
            grid.insertAdjacentHTML('beforeend', html);
          }
        }
      } catch (e) {
      }
    }

    container.appendChild(grid);
    this.renderLucide(container);
  },

  async loadDeskItems() {
    const token = (() => {
      try { return localStorage.getItem('jwt_token'); } catch (e) { return null; }
    })();
    if (!token) return;

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
      const api = (typeof window.apiRequest === 'function')
        ? window.apiRequest
        : async (url, opts) => {
            const res = await fetch(url, opts || {});
            return await res.json();
          };

      const data = await api('/desk/api/items');
      if (data && data.success && Array.isArray(data.items)) {
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
      this.loadDeskItems().catch(() => { });
    });
  },

  init() {
    this.initUserMenu();
    this.initStubButtons();
    this.initDeskLoad();
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
