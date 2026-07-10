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

  getDeskZoneEl() {
    try {
      return document.getElementById('desktopDeskZone') || document.querySelector('.desk-zone');
    } catch (e) {
      return null;
    }
  },

  applyDeskZoom(zoom) {
    try {
      const deskZone = this.getDeskZoneEl();
      if (!deskZone) return;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const z = clamp(Number(zoom) || 1, 0.6, 1.8);
      deskZone.style.setProperty('--desk-zoom', String(z));
      try {
        localStorage.setItem('desk_zoom', String(z));
      } catch (e2) {
      }
    } catch (e) {
    }
  },

  loadSavedDeskZoom() {
    try {
      const saved = localStorage.getItem('desk_zoom');
      if (saved) this.applyDeskZoom(saved);
    } catch (e) {
    }
  },

  getDeskCardPosStorageKey(deskItemId) {
    return `dictafan:desk:pos:${String(deskItemId || '')}`;
  },

  readDeskCardPos(deskItemId) {
    try {
      const raw = localStorage.getItem(this.getDeskCardPosStorageKey(deskItemId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const x = Number(parsed.x);
      const y = Number(parsed.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch (e) {
      return null;
    }
  },

  writeDeskCardPos(deskItemId, x, y) {
    try {
      const payload = { x: Number(x) || 0, y: Number(y) || 0, updatedAt: Date.now() };
      localStorage.setItem(this.getDeskCardPosStorageKey(deskItemId), JSON.stringify(payload));
    } catch (e) {
    }
  },

  isDeskFreeLayoutEnabled() {
    try {
      return String(localStorage.getItem('dictafan:desk:layout') || '') === 'free';
    } catch (e) {
      return false;
    }
  },

  setDeskFreeLayoutEnabled(enabled) {
    try {
      localStorage.setItem('dictafan:desk:layout', enabled ? 'free' : 'grid');
    } catch (e) {
    }
  },

  hasAnyDeskCardPositions(container) {
    try {
      const cards = container.querySelectorAll('.desk-card[data-desk-item-id]');
      for (const card of cards) {
        const deskItemId = card.getAttribute('data-desk-item-id');
        if (!deskItemId) continue;
        if (this.readDeskCardPos(deskItemId)) return true;
      }
    } catch (e) {
    }
    return false;
  },

  updateDeskLayoutToggleButtonState(btn) {
    try {
      if (!btn) return;
      const enabled = this.isDeskFreeLayoutEnabled();
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.title = enabled
        ? 'Свободный стол: можно таскать карточки'
        : 'Обычный стол: карточки в ряд (таскать нельзя)';

      const iconName = enabled ? 'move' : 'grip-vertical';
      btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
      this.renderLucide(btn);

      if (enabled) {
        btn.classList.add('active');
        btn.style.background = 'rgba(0,0,0,0.08)';
        btn.style.border = '1px solid rgba(0,0,0,0.18)';
      } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.border = '';
      }
    } catch (e) {
    }
  },

  enableDeskFreeLayout(container) {
    try {
      const grid = container.querySelector('.shorts-grid');
      if (!grid) return null;
      grid.dataset.deskLayoutMode = 'free';
      grid.style.position = 'relative';
      grid.style.display = 'block';
      grid.style.minHeight = grid.style.minHeight || '240px';

      const cards = grid.querySelectorAll('.desk-card[data-desk-item-id]');
      let maxBottom = 0;

      cards.forEach((card, idx) => {
        const deskItemId = card.getAttribute('data-desk-item-id');
        const pos = deskItemId ? this.readDeskCardPos(deskItemId) : null;

        const x = pos ? pos.x : (idx * 220);
        const y = pos ? pos.y : 0;

        card.style.position = 'absolute';
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        card.style.willChange = 'transform';
        card.dataset.deskX = String(x);
        card.dataset.deskY = String(y);
        card.style.touchAction = 'none';

        try {
          const rect = card.getBoundingClientRect();
          const h = rect && rect.height ? rect.height : 220;
          maxBottom = Math.max(maxBottom, y + h);
        } catch (e) {
          maxBottom = Math.max(maxBottom, y + 220);
        }
      });

      if (maxBottom > 0) {
        grid.style.minHeight = `${Math.ceil(maxBottom + 40)}px`;
      }

      return grid;
    } catch (e) {
      return null;
    }
  },

  installDeskDragAndDrop(container) {
    try {
      const grid = container.querySelector('.shorts-grid');
      if (!grid) return;
      if (grid.dataset.deskDndInstalled === '1') return;
      if (grid.dataset.deskLayoutMode !== 'free') return;
      grid.dataset.deskDndInstalled = '1';

      try {
        grid.querySelectorAll('img').forEach((img) => {
          if (img.dataset && img.dataset.deskNoNativeDrag === '1') return;
          if (img.dataset) img.dataset.deskNoNativeDrag = '1';
          img.addEventListener('dragstart', (ev) => {
            try {
              ev.preventDefault();
            } catch (e2) {
            }
            return false;
          });
        });
      } catch (e) {
      }

      let dragging = null;

      const onPointerDown = (e) => {
        try {
          if (!e || (e.button !== undefined && e.button !== 0)) return;
          const thumb = e.target && e.target.closest ? e.target.closest('.desk-card .short-thumb') : null;
          if (!thumb) return;
          const card = thumb.closest('.desk-card[data-desk-item-id]');
          if (!card) return;
          if (e.target.closest('button')) return;

          const deskItemId = card.getAttribute('data-desk-item-id');
          if (!deskItemId) return;

          const gridRect = grid.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          const startX = Number(card.dataset.deskX) || 0;
          const startY = Number(card.dataset.deskY) || 0;
          const pointerX = (e.clientX - gridRect.left);
          const pointerY = (e.clientY - gridRect.top);
          const cardLeft = (cardRect.left - gridRect.left);
          const cardTop = (cardRect.top - gridRect.top);
          const offsetX = pointerX - cardLeft;
          const offsetY = pointerY - cardTop;

          dragging = {
            deskItemId,
            card,
            gridRect,
            offsetX,
            offsetY,
            startX,
            startY,
            moved: false,
            active: false,
            pointerId: e.pointerId,
          };

          card.style.zIndex = '999';
        } catch (err) {
        }
      };

      const onPointerMove = (e) => {
        try {
          if (!dragging) return;
          const gridRect = dragging.gridRect || grid.getBoundingClientRect();
          const x = (e.clientX - gridRect.left) - dragging.offsetX;
          const y = (e.clientY - gridRect.top) - dragging.offsetY;
          const nx = Math.max(-2000, Math.min(20000, x));
          const ny = Math.max(-2000, Math.min(20000, y));
          if (Math.abs(nx - dragging.startX) > 3 || Math.abs(ny - dragging.startY) > 3) {
            dragging.moved = true;
          }
          if (dragging.moved) {
            if (!dragging.active) {
              dragging.active = true;
              if (dragging.card && dragging.card.setPointerCapture) {
                try { dragging.card.setPointerCapture(dragging.pointerId); } catch (err) { }
              }
            }
            dragging.card.style.transform = `translate(${Math.round(nx)}px, ${Math.round(ny)}px)`;
            dragging.card.dataset.deskX = String(nx);
            dragging.card.dataset.deskY = String(ny);
            e.preventDefault();
          }
        } catch (err) {
        }
      };

      const onPointerUp = (e) => {
        try {
          if (!dragging) return;
          if (!dragging.active) {
            dragging.card.style.zIndex = '';
            dragging = null;
            return;
          }
          const x = Number(dragging.card.dataset.deskX) || 0;
          const y = Number(dragging.card.dataset.deskY) || 0;
          this.writeDeskCardPos(dragging.deskItemId, x, y);
          if (dragging.moved) {
            dragging.card.dataset.deskJustDragged = '1';
          }
          dragging.card.style.zIndex = '';
          dragging = null;
          e.preventDefault();
        } catch (err) {
          dragging = null;
        }
      };

      const onClickCapture = (e) => {
        try {
          const card = e.target && e.target.closest ? e.target.closest('.desk-card[data-desk-item-id]') : null;
          if (!card) return;
          const moved = card.dataset && card.dataset.deskJustDragged === '1';
          if (moved) {
            card.dataset.deskJustDragged = '';
            e.preventDefault();
            e.stopPropagation();
          }
        } catch (err) {
        }
      };

      grid.addEventListener('pointerdown', onPointerDown, { passive: false });
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { passive: false });
      grid.addEventListener('click', onClickCapture, true);
    } catch (e) {
    }
  },

  applyDeskLayoutIfNeeded() {
    try {
      const container = document.getElementById('deskCardsContainer');
      if (!container) return;

      const btn = document.getElementById('btnDeskFreeLayoutToggle');
      if (btn) this.updateDeskLayoutToggleButtonState(btn);

      if (this.isDeskFreeLayoutEnabled() || this.hasAnyDeskCardPositions(container)) {
        this.enableDeskFreeLayout(container);
        this.installDeskDragAndDrop(container);
      }
    } catch (e) {
    }
  },

  stubAction(name) {
    try {
      if (name === 'desktop-menu-profile') {
        try {
          const modal = document.getElementById('user-profile-modal');
          if (!modal) return;

          const close = () => {
            try { modal.style.display = 'none'; } catch (e0) {}
            try { modal.classList.remove('show'); } catch (e1) {}
          };

          modal.style.display = 'flex';
          modal.classList.add('show');

          try {
            const closeBtn = document.getElementById('userProfileModalClose');
            if (closeBtn && closeBtn.dataset.boundClick !== '1') {
              closeBtn.dataset.boundClick = '1';
              closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
              });
            }
          } catch (e2) {
          }

          try {
            if (modal.dataset.boundOverlay !== '1') {
              modal.dataset.boundOverlay = '1';
              modal.addEventListener('click', (e) => {
                if (e && e.target === modal) close();
              });
              document.addEventListener('keydown', (e) => {
                if (e && e.key === 'Escape') close();
              });
            }
          } catch (e3) {
          }

          this.renderLucide(modal);

          // Инициализируем профиль при каждом открытии модалки
          try {
            if (window.UserProfile && typeof window.UserProfile.init === 'function') {
              window.UserProfile.init();
            }
          } catch (e4) {
          }

          return;
        } catch (e) {
          return;
        }
      }
      if (name === 'desktop-admin-active-dictations') {
        try {
          if (window.ActiveDictationsModal && typeof window.ActiveDictationsModal.open === 'function') {
            window.ActiveDictationsModal.open();
            return;
          }
        } catch (e) {
        }
        console.log('[desktop] action', name);
        return;
      }
      if (name === 'desktop-admin-audio-cache') {
        try {
          if (window.AudioCacheModal && typeof window.AudioCacheModal.open === 'function') {
            window.AudioCacheModal.open();
            return;
          }
        } catch (e) {
        }
        console.log('[desktop] action', name);
        return;
      }
      if (name === 'desktop-menu-tracker') {
        (async () => {
          try {
            if (typeof ActivityTrackerReport === 'undefined') {
              console.warn('[desktop] ActivityTrackerReport not available');
              return;
            }
            if (!window.__activityTrackerReport) {
              window.__activityTrackerReport = new ActivityTrackerReport(null);
            }
            await window.__activityTrackerReport.show();
          } catch (e) {
            console.error('[desktop] tracker error', e);
          }
        })();
        return;
      }
      if (name === 'desktop-menu-ratings') {
        (async () => {
          try {
            if (typeof RatingReport === 'undefined') {
              console.warn('[desktop] RatingReport not available');
              return;
            }
            await RatingReport.open();
          } catch (e) {
            console.error('[desktop] rating error', e);
          }
        })();
        return;
      }
      if (name === 'desktop-menu-dictation-report') {
        (async () => {
          try {
            if (typeof DictationReport === 'undefined') {
              console.warn('[desktop] DictationReport not available');
              return;
            }
            if (!window.__dictationReport) {
              window.__dictationReport = new DictationReport();
            }
            await window.__dictationReport.show();
          } catch (e) {
            console.error('[desktop] dictation report error', e);
          }
        })();
        return;
      }
      if (name === 'desktop-new') {
        (async () => {
          try {
            // Знайти workbook (робочу зошит) користувача
            let wbId = window.__desktopWorkbookId;
            if (!wbId) {
              try {
                const token = window.UM && window.UM.token ? window.UM.token : localStorage.getItem('jwt_token');
                if (token) {
                  const resp = await fetch('/library/api/user-books', {
                    headers: { 'Authorization': 'Bearer ' + token }
                  });
                  const j = await resp.json();
                  const own = (j && j.success) ? (j.own_books || []) : [];
                  const wb = Array.isArray(own) ? own.find(function(b) { return b && b.is_workbook; }) : null;
                  wbId = wb && wb.id ? Number(wb.id) : null;
                  if (wbId) window.__desktopWorkbookId = wbId;
                }
              } catch (e0) {}
            }
            if (wbId) {
              try {
                sessionStorage.setItem('dictationTargetBook', JSON.stringify({ book_id: wbId }));
              } catch (e1) {}
            }
            // Відкрити редактор для нового диктанта
            if (window.DictationEditorModal && typeof window.DictationEditorModal.open === 'function') {
              window.DictationEditorModal.open({
                isNewDictation: true,
                dictationId: '',
                originalLanguage: '',
                translationLanguage: '',
                title: '',
                level: '',
                coverUrl: '',
                sentences: [],
                audio_user_shared: null,
                audio_order: '',
              });
            }
          } catch (e) {
            console.error('[desktop] desktop-new error', e);
          }
        })();
        return;
      }
      console.log('[desktop] action', name);
    } catch (e) {
    }
  },

  initAdminMenu() {
    const toggle = document.getElementById('desktopAdminMenuToggle');
    const dropdown = document.getElementById('desktopAdminMenuDropdown');
    const wrapper = document.getElementById('desktopAdminMenuWrapper');
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

  initToolPalette() {
    this.loadSavedDeskZoom();
    this.applyDeskLayoutIfNeeded();

    document.querySelectorAll('[data-action^="desktop-"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');

        if (action === 'desktop-home') {
          try {
            if (window.PrivateLibraryModal && typeof window.PrivateLibraryModal.open === 'function') {
              window.PrivateLibraryModal.open();
              return;
            }
          } catch (e2) {
          }
        }

        if (action === 'desktop-public') {
          try {
            if (window.GlobalLibraryModal && typeof window.GlobalLibraryModal.open === 'function') {
              window.GlobalLibraryModal.open();
              return;
            }
          } catch (e2) {
          }
        }

        if (action === 'desktop-zoom-in' || action === 'desktop-zoom-out') {
          const deskZone = this.getDeskZoneEl();
          if (!deskZone) return;
          const current = Number(getComputedStyle(deskZone).getPropertyValue('--desk-zoom')) || 1;
          const step = 0.1;
          this.applyDeskZoom(action === 'desktop-zoom-in' ? (current + step) : (current - step));
          return;
        }

        if (action === 'desktop-layout-toggle') {
          const enabled = !this.isDeskFreeLayoutEnabled();
          this.setDeskFreeLayoutEnabled(enabled);
          this.applyDeskLayoutIfNeeded();
          return;
        }

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

    this.ensureDictationKartDeps();

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
            continue;
          }
        }
      } catch (e) {
      }

      try {
        const dictationId = (item && (item.dictation_id != null)) ? String(item.dictation_id) : '';
        const title = (item && item.title != null) ? String(item.title) : 'Без названия';
        grid.insertAdjacentHTML(
          'beforeend',
          `<div class="short-card desk-card" data-dictation-id="${window.escapeHtml(dictationId)}"><div style="padding:12px;">${window.escapeHtml(title)}</div></div>`
        );
      } catch (e2) {
      }
    }

    container.appendChild(grid);
    this.renderLucide(container);
    this.applyDeskLayoutIfNeeded();
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
        this.renderDeskCards(data.items);
        try {
          if (typeof window.idbPut === 'function') {
            await window.idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: data.items });
          }
        } catch (e2) {
        }

        // Prefetch коверы диктантов в SW кеш для офлайн-доступа
        try {
          const coverUrls = data.items
            .map(item => item.cover_url ? String(item.cover_url).trim() : '')
            .filter(Boolean);
          if (coverUrls.length > 0 && navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              action: 'prefetch',
              urls: coverUrls,
            });
          }
        } catch (e3) {
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
      try {
        const a = document.querySelector('#user-section .user-avatar-small');
        if (a && !a.style.backgroundImage) a.style.backgroundImage = 'url(/static/icons/default-avatar-small.svg)';
      } catch (e) {
      }
      this.loadDeskItems().catch(() => { });
    });
  },

  initStatsPanel() {
    const tryInit = () => {
      try {
        if (!window.DesktopStatsPanel || typeof window.DesktopStatsPanel.init !== 'function') return false;
        const container = document.querySelector('.desk-zone');
        if (!container) return false;
        window.DesktopStatsPanel.init(container);
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!tryInit()) {
      const t = setInterval(() => {
        if (tryInit()) clearInterval(t);
      }, 200);
    }
  },

  init() {
    this.initUserMenu();
    this.initAdminMenu();
    this.initToolPalette();
    this.initDeskLoad();
    this.initStatsPanel();
    this.ensureDictationKartDeps();
    this.renderLucide(document.body);

    // Предзагружаем таблицы чисел для языков пользователя
    this._preloadNumberTables();
  },

  /**
   * Предзагружает JSON-таблицы чисел для языков пользователя.
   * Загружает currentLearning (изучаемый) и nativeLanguage (родной),
   * чтобы при первом диктанте не было задержки на загрузку.
   */
  _preloadNumberTables() {
    try {
      const mgr = window.__numberTableManager;
      if (!mgr) return;
      const langData = window.USER_LANGUAGE_DATA;
      if (!langData) return;

      const langs = new Set();
      if (langData.currentLearning) langs.add(langData.currentLearning);
      if (langData.nativeLanguage) langs.add(langData.nativeLanguage);

      if (langs.size > 0) {
        // Загружаем все языки пользователя параллельно
        Promise.all(
          Array.from(langs).map(code => mgr.ensureLanguage(code).catch(() => {}))
        ).catch(() => {});
      }
    } catch (e) {
      // Предзагрузка не критична
    }
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
