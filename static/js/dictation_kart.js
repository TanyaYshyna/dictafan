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

  _showToast(message, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const durationMs = typeof o.durationMs === 'number' ? o.durationMs : 4000;
    const sticky = o && o.sticky === true;

    let el = document.getElementById('auto-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auto-toast';
      el.addEventListener('click', () => {
        try { el.style.display = 'none'; } catch (e) { }
      });
      document.body.appendChild(el);
    }

    el.textContent = message || '';
    el.style.display = 'block';

    if (el._hideTimer) window.clearTimeout(el._hideTimer);
    if (!sticky) {
      el._hideTimer = window.setTimeout(() => {
        try { el.style.display = 'none'; } catch (e) { }
      }, Math.max(0, durationMs));
    }
  },

  _showLoadingIndicator(message) {
    try {
      if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
        window.DesktopLoadingModal.show(message || 'Загрузка…');
        return;
      }
    } catch (e) {
    }

    try {
      if (typeof window.setSwBarProgress === 'function') {
        const msg = String(message || '').trim();
        window.setSwBarProgress(msg || 'Загрузка…', null, 'cache');
        return;
      }
    } catch (e) {
    }

    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text"></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    try {
      const t = overlay.querySelector('.loading-text');
      if (t) t.textContent = String(message || 'Загрузка…');
    } catch (e) {
    }

    overlay.style.display = 'flex';
  },

  _hideLoadingIndicator() {
    try {
      if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
        window.DesktopLoadingModal.hide();
        return;
      }
    } catch (e) {
    }

    try {
      if (typeof window.setSwBarProgress === 'function') {
        window.setSwBarProgress('', null, '');
      }
    } catch (e) {
    }

    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  _completeLoadingIndicator(message, durationMs) {
    try {
      this._showLoadingIndicator(message);
    } catch (e) {
    }
    const ms = typeof durationMs === 'number' ? durationMs : 1200;
    window.setTimeout(() => {
      try { this._hideLoadingIndicator(); } catch (e) { }
    }, Math.max(0, ms));
  },

  _getDraftUserIdForKey() {
    try {
      const um = window.UM;
      const id = um && um.userData ? um.userData.id : null;
      return id ? String(id) : 'anon';
    } catch (e) {
      return 'anon';
    }
  },

  _normalizeLangCodeSafe(v) {
    try {
      const s = String(v || '').trim().toLowerCase();
      return s || '';
    } catch (e) {
      return '';
    }
  },

  _dictationIdToDictKey(dictationId) {
    const raw = String(dictationId || '').trim();
    if (!raw) return '';
    return raw.startsWith('dict_') ? raw : `dict_${raw}`;
  },

  _buildSentencesUrl(dictKey, langOrig, langTr) {
    const d = this._dictationIdToDictKey(dictKey);
    const lo = this._normalizeLangCodeSafe(langOrig);
    const lt = this._normalizeLangCodeSafe(langTr);
    if (!d || !lo || !lt) return '';
    return `/api/dictation/${encodeURIComponent(d)}/${encodeURIComponent(lo)}/${encodeURIComponent(lt)}/sentences`;
  },

  async _fetchSentencesFromServer(dictKey, langOrig, langTr) {
    const url = this._buildSentencesUrl(dictKey, langOrig, langTr);
    if (!url) throw new Error('bad_sentences_url');
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 502 || res.status === 503) {
        throw new Error(`storage_unavailable_${res.status}`);
      }
      let t = '';
      try { t = await res.text(); } catch (e) { }
      throw new Error(`fetch_sentences_failed_${res.status}_${t}`);
    }
    const data = await res.json();
    const sentences = (data && Array.isArray(data.sentences)) ? data.sentences : [];
    if (!sentences.length) throw new Error('empty_sentences');
    sentences.sort((a, b) => {
      const ap = (a && a.position !== undefined && a.position !== null && isFinite(Number(a.position))) ? Number(a.position) : null;
      const bp = (b && b.position !== undefined && b.position !== null && isFinite(Number(b.position))) ? Number(b.position) : null;
      if (ap !== null && bp !== null) return ap - bp;
      if (ap !== null) return -1;
      if (bp !== null) return 1;
      const ak = a && a.key ? String(a.key) : '';
      const bk = b && b.key ? String(b.key) : '';
      return ak.localeCompare(bk);
    });
    return sentences;
  },

  _collectAudioUrlsFromSentences({ dictKey, langOrig, langTr, sentences, includeOriginal = true, includeTranslation = true }) {
    const urls = [];
    try {
      const am = window.AudioManager;
      if (!am || typeof am.buildDictationAudioUrl !== 'function') {
        return [];
      }
      const dictId = this._dictationIdToDictKey(dictKey);
      const lo = this._normalizeLangCodeSafe(langOrig);
      const lt = this._normalizeLangCodeSafe(langTr);
      const list = Array.isArray(sentences) ? sentences : [];
      for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        const audio = s.audio != null ? String(s.audio || '').trim() : '';
        const audioTr = s.audio_tr != null ? String(s.audio_tr || '').trim() : '';
        if (includeOriginal && audio) urls.push(am.buildDictationAudioUrl(dictId, lo, audio));
        if (includeTranslation && audioTr) urls.push(am.buildDictationAudioUrl(dictId, lt, audioTr));
      }
    } catch (e) {
    }
    return Array.from(new Set(urls.filter(Boolean)));
  },

  async _swRequest(action, payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      throw new Error('Service Worker не активен');
    }

    try {
      if (typeof window.setSwStatus === 'function') {
        window.setSwStatus(`SW: ${String(action)} …`, { durationMs: 0 });
      }
    } catch (e) {
    }

    const timeoutMs = typeof p.timeoutMs === 'number' ? p.timeoutMs : 15000;
    const message = { action, ...p };
    delete message.timeoutMs;

    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const timeout = setTimeout(() => {
        reject(new Error('SW timeout'));
      }, timeoutMs);

      channel.port1.onmessage = (event) => {
        const data = event.data || {};
        if (data.requestId !== requestId) return;
        clearTimeout(timeout);
        if (data && data.success) {
          try {
            if (typeof window.setSwStatus === 'function') {
              window.setSwStatus(`SW: ${String(action)} ok`);
            }
          } catch (e) {
          }
          resolve(data);
        } else {
          try {
            if (typeof window.setSwStatus === 'function') {
              window.setSwStatus(`SW: ${String(action)} error`);
            }
          } catch (e) {
          }
          reject(new Error(data && data.error ? data.error : 'sw_error'));
        }
      };

      navigator.serviceWorker.controller.postMessage({ ...message, requestId }, [channel.port2]);
    });
  },

  async prefetchDictationToCache({ dictationId, langOrig, translationLanguages, coverUrl }) {
    const numericId = String(dictationId || '').trim().replace(/^dict_/, '').trim();
    const dictKey = this._dictationIdToDictKey(numericId);
    const lo = this._normalizeLangCodeSafe(langOrig);
    const langs = Array.isArray(translationLanguages)
      ? translationLanguages.map((x) => this._normalizeLangCodeSafe(x)).filter(Boolean)
      : [];
    const finalLangs = Array.from(new Set([lo, ...langs])).filter(Boolean);
    if (!dictKey || !lo) {
      throw new Error('missing_dictation_params');
    }

    this._showLoadingIndicator('Получаем в кеш…');

    try {
      try {
        await this._swRequest('purgeDictation', { dictationId: dictKey });
      } catch (e) {
      }
      try {
        const idb = window.IdbManager;
        if (idb && typeof idb.idbDeleteDictationCache === 'function') {
          await idb.idbDeleteDictationCache(dictKey);
        }
      } catch (e) {
      }

      const userId = String(this._getDraftUserIdForKey());
      const updatedAt = Date.now();

      const allAudioUrls = [];
      let cachedPairs = 0;

      try {
        const msg = `Текст: ${lo} → ${lo}`;
        try {
          const overlay = document.getElementById('loading-overlay');
          const textEl = overlay ? overlay.querySelector('.loading-text') : null;
          if (textEl) textEl.textContent = msg;
        } catch (e) {
        }

        const sentences = await this._fetchSentencesFromServer(dictKey, lo, lo);
        const keysToWrite = new Set();
        keysToWrite.add(`${userId}:${dictKey}:${lo}:${lo}`);
        keysToWrite.add(`anon:${dictKey}:${lo}:${lo}`);
        try {
          const n = parseInt(dictKey.replace(/^dict_/, ''), 10);
          if (Number.isFinite(n)) {
            keysToWrite.add(`${userId}:${n}:${lo}:${lo}`);
            keysToWrite.add(`${userId}:dict_${n}:${lo}:${lo}`);
            keysToWrite.add(`anon:dict_${n}:${lo}:${lo}`);
          }
        } catch (e) {
        }

        const idb = window.IdbManager;
        if (!idb || typeof idb.idbPut !== 'function') throw new Error('idb_unavailable');
        for (const key of keysToWrite) {
          await idb.idbPut('dictations', {
            key,
            dictationId: dictKey,
            langOrig: lo,
            langTr: lo,
            sentences,
            updatedAt,
          });
        }
        cachedPairs += 1;

        const audioUrls = this._collectAudioUrlsFromSentences({
          dictKey,
          langOrig: lo,
          langTr: lo,
          sentences,
          includeOriginal: true,
          includeTranslation: false,
        });
        for (const u of audioUrls) allAudioUrls.push(u);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        throw new Error(`cache_text_failed_${msg}`);
      }

      for (const lt of finalLangs) {
        if (lt === lo) continue;
        try {
          const msg = `Текст: ${lo} → ${lt}`;
          try {
            const overlay = document.getElementById('loading-overlay');
            const textEl = overlay ? overlay.querySelector('.loading-text') : null;
            if (textEl) textEl.textContent = msg;
          } catch (e) {
          }

          const sentences = await this._fetchSentencesFromServer(dictKey, lo, lt);
          const keysToWrite = new Set();
          keysToWrite.add(`${userId}:${dictKey}:${lo}:${lt}`);
          keysToWrite.add(`anon:${dictKey}:${lo}:${lt}`);
          try {
            const n = parseInt(dictKey.replace(/^dict_/, ''), 10);
            if (Number.isFinite(n)) {
              keysToWrite.add(`${userId}:${n}:${lo}:${lt}`);
              keysToWrite.add(`${userId}:dict_${n}:${lo}:${lt}`);
              keysToWrite.add(`anon:dict_${n}:${lo}:${lt}`);
            }
          } catch (e) {
          }

          const idb = window.IdbManager;
          if (!idb || typeof idb.idbPut !== 'function') throw new Error('idb_unavailable');
          for (const key of keysToWrite) {
            await idb.idbPut('dictations', {
              key,
              dictationId: dictKey,
              langOrig: lo,
              langTr: lt,
              sentences,
              updatedAt,
            });
          }
          cachedPairs += 1;

          const audioUrls = this._collectAudioUrlsFromSentences({
            dictKey,
            langOrig: lo,
            langTr: lt,
            sentences,
            includeOriginal: false,
            includeTranslation: true,
          });
          for (const u of audioUrls) allAudioUrls.push(u);
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          throw new Error(`cache_text_failed_${msg}`);
        }
      }

      const uniqueAudio = Array.from(new Set(allAudioUrls.filter(Boolean)));

      try {
        const coverPath = numericId
          ? `/api/dictations_covers/${encodeURIComponent(numericId)}.webp`
          : '';
        const coverToFetch = coverPath
          ? `${coverPath}${coverPath.includes('?') ? '&' : '?'}ts=${Date.now()}`
          : '';

        try {
          const overlay = document.getElementById('loading-overlay');
          const textEl = overlay ? overlay.querySelector('.loading-text') : null;
          if (textEl) textEl.textContent = 'Обложка…';
        } catch (e) {
        }

        if (coverToFetch) {
          await this._swRequest('prefetchStrict', { urls: [coverToFetch], ignoreLimit: true });
        }
      } catch (e) {
      }

      try {
        if (uniqueAudio.length) {
          try {
            const overlay = document.getElementById('loading-overlay');
            const textEl = overlay ? overlay.querySelector('.loading-text') : null;
            if (textEl) textEl.textContent = `Аудио… (${uniqueAudio.length})`;
          } catch (e) {
          }

          if (window.AudioManager && typeof window.AudioManager.prefetchMediaUrls === 'function') {
            await window.AudioManager.prefetchMediaUrls(uniqueAudio, { concurrency: 4 });
          } else {
            await this._swRequest('prefetchStrict', { urls: uniqueAudio, ignoreLimit: true });
          }
        }
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        throw new Error(`cache_audio_failed_${msg}`);
      }

      this._completeLoadingIndicator(`В кеше: ${cachedPairs} языков, аудио ${uniqueAudio.length}`, 1200);
      return { ok: true, cachedPairs, audio: uniqueAudio.length, coverUrl: coverUrl || '' };
    } finally {
      try { this._hideLoadingIndicator(); } catch (e) { }
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

    try {
      const launchBtn = cardEl.querySelector('[data-action="launch-assignment"]');
      const launchMenu = cardEl.querySelector('.dictation-kart-launch-menu');
      const closeLaunchMenu = () => {
        try {
          if (!launchMenu) return;
          launchMenu.classList.remove('show');
          launchMenu.style.display = 'none';
        } catch (e) {
        }
      };

      const openLaunchMenu = () => {
        try {
          if (!launchMenu) return;
          document.querySelectorAll('.dictation-kart-launch-menu').forEach((m) => {
            try {
              if (m !== launchMenu) {
                m.classList.remove('show');
                m.style.display = 'none';
              }
            } catch (e0) {
            }
          });
          launchMenu.classList.add('show');
          launchMenu.style.display = 'block';
          this._renderLucide(launchMenu);
        } catch (e) {
        }
      };

      const normalizePositions = (pos) => {
        const arr = Array.isArray(pos) ? pos : [];
        const uniq = Array.from(new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
        uniq.sort((a, b) => a - b);
        return uniq;
      };

      const positionsToLabel = (positions) => {
        const arr = normalizePositions(positions);
        if (!arr.length) return 'весь диктант';
        const ranges = [];
        let start = arr[0];
        let prev = arr[0];
        for (let i = 1; i < arr.length; i++) {
          const cur = arr[i];
          if (cur === prev + 1) {
            prev = cur;
            continue;
          }
          ranges.push(start === prev ? String(start) : `${start}-${prev}`);
          start = cur;
          prev = cur;
        }
        ranges.push(start === prev ? String(start) : `${start}-${prev}`);
        return ranges.join(', ');
      };

      const openDictationModal = (subsetPositions) => {
        try {
          const href = thumb ? String(thumb.getAttribute('data-href') || '').trim() : '';
          if (!href) return;
          if (window.DictationModal && typeof window.DictationModal.open === 'function') {
            window.DictationModal.open(href, { cardEl, subsetPositions: subsetPositions && subsetPositions.length ? subsetPositions : null });
            return;
          }
          window.location.href = href;
        } catch (e) {
        }
      };

      if (launchBtn && launchMenu && launchBtn.dataset.boundLaunchAssignment !== '1') {
        launchBtn.dataset.boundLaunchAssignment = '1';
        launchBtn.addEventListener('click', async (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }

          const dictationId = Number(cardEl.getAttribute('data-dictation-id'));
          if (!Number.isFinite(dictationId) || dictationId <= 0) {
            openDictationModal(null);
            return;
          }

          let exercises = [];
          try {
            const url = `/dictation_editor/api/dictation/${encodeURIComponent(String(dictationId))}/exercises`;
            const res = await fetch(url, { method: 'GET', cache: 'no-store' });
            const data = res && res.ok ? await res.json() : null;
            const raw = data && data.success && Array.isArray(data.exercises) ? data.exercises : [];
            exercises = raw.map((x) => {
              const p = x && typeof x.positions === 'string' ? (() => { try { return JSON.parse(x.positions); } catch (e) { return []; } })() : x.positions;
              return { id: x && x.id != null ? x.id : null, positions: normalizePositions(p) };
            });
          } catch (e1) {
            exercises = [];
          }

          const visible = exercises.filter((x) => x && x.id != null);
          const uniqueBySig = new Map();
          for (const ex of visible) {
            const sig = ex.positions && ex.positions.length ? ex.positions.join(',') : '';
            if (!uniqueBySig.has(sig)) uniqueBySig.set(sig, ex);
          }
          const list = Array.from(uniqueBySig.values());

          if (list.length <= 1) {
            const only = list[0];
            const pos = only && Array.isArray(only.positions) ? only.positions : [];
            openDictationModal(pos.length ? pos : null);
            return;
          }

          try {
            launchMenu.innerHTML = list.map((ex) => {
              const pos = Array.isArray(ex.positions) ? ex.positions : [];
              const sig = pos.length ? pos.join(',') : '';
              const label = positionsToLabel(pos);
              return `
                <button class="dropdown-menu-item" type="button" data-action="launch-assignment-item" data-positions="${window.escapeHtml(sig)}">
                  <i data-lucide="play"></i>
                  <span>${window.escapeHtml(label)}</span>
                </button>
              `;
            }).join('');
          } catch (e2) {
          }

          openLaunchMenu();
        });

        launchMenu.addEventListener('click', (e) => {
          try {
            const btn = e.target && e.target.closest ? e.target.closest('[data-action="launch-assignment-item"]') : null;
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();

            const posStr = String(btn.getAttribute('data-positions') || '').trim();
            const positions = posStr
              ? posStr.split(',').map((x) => Number(String(x).trim())).filter((x) => Number.isFinite(x) && x > 0)
              : [];
            closeLaunchMenu();
            openDictationModal(positions.length ? positions : null);
          } catch (e3) {
          }
        });

        document.addEventListener('click', (e) => {
          try {
            if (!launchMenu || !launchBtn) return;
            if (launchMenu.contains(e.target) || launchBtn.contains(e.target)) return;
          } catch (e4) {
          }
          closeLaunchMenu();
        });
      }
    } catch (e) {
    }

    const kebabBtn = cardEl.querySelector('[data-action="toggle-card-actions"]');
    const menu = cardEl.querySelector('.short-card-actions-menu:not(.dictation-kart-launch-menu)');
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
          if (action === 'show-in-book') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (dictationId && window.BookModal && typeof window.BookModal.showDictationInBook === 'function') {
              await window.BookModal.showDictationInBook(dictationId);
              return;
            }
          }
        } catch (e2) {
        }

        try {
          if (action === 'move-dictation') {
            const dictationId = btn.getAttribute('data-dictation-id');
            if (!dictationId) return;

            if (window.BookModal && typeof window.BookModal.openMoveDictation === 'function') {
              await window.BookModal.openMoveDictation(dictationId);
              return;
            }

            if (typeof window.openMoveDictationModal === 'function') {
              window.openMoveDictationModal(dictationId);
              return;
            }

            try {
              console.warn('[dictation_kart] move-dictation: no modal opener found');
            } catch (e0) {
            }
            return;
          }
        } catch (e2) {
        }

        try {
          if (action === 'prefetch-dictation-cache') {
            const dictationId = btn.getAttribute('data-dictation-id');
            const langOriginal = btn.getAttribute('data-lang-original');
            const coverUrl = btn.getAttribute('data-cover-url');
            const trRaw = btn.getAttribute('data-translation-langs');
            const translationLanguages = String(trRaw || '')
              .split(',')
              .map((x) => String(x || '').trim())
              .filter(Boolean);

            const card = btn && btn.closest ? btn.closest('.short-card') : null;
            try {
              if (card) card.classList.remove('short-card--cached');
            } catch (e0) {
            }

            try {
              await this.prefetchDictationToCache({
                dictationId,
                langOrig: langOriginal,
                translationLanguages,
                coverUrl,
              });
              try {
                if (card) card.classList.add('short-card--cached');
              } catch (e1) {
              }
              try {
                this._showToast('Скачано в кэш', { durationMs: 2200 });
              } catch (e3) {
              }
            } catch (err) {
              try {
                const msg = err && err.message ? String(err.message) : 'Не удалось скачать в кэш';
                this._showToast(msg, { durationMs: 3500 });
              } catch (e4) {
              }
            }
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
        { action: 'create-assignment', icon: 'clipboard-list', labelKey: 'private_library.dictation_card_actions.create_assignment_new', labelFallback: 'Задания' },
        { action: 'plan-tasks', icon: 'calendar-plus', labelKey: 'private_library.dictation_card_actions.plan', labelFallback: 'Запланировать' },
        { action: 'prefetch-dictation-cache', icon: 'download', labelKey: 'private_library.dictation_card_actions.cache', labelFallback: 'Скачать в кэш' },
        { action: 'edit-dictation', icon: 'pencil-ruler', labelKey: 'private_library.dictation_card_actions.edit', labelFallback: 'Редактировать' },
        { action: 'show-in-book', icon: 'book-marked', labelKey: 'private_library.dictation_card_actions.show_in_book', labelFallback: 'Показать в книге' },
        { action: 'remove-from-desk', icon: 'arrow-big-down-dash', labelKey: 'private_library.dictation_card_actions.remove_from_desk', labelFallback: 'Убрать со стола' },
      ];
    }

    return [
      { action: 'edit-dictation', icon: 'pencil-ruler', labelKey: 'private_library.dictation_card_actions.edit', labelFallback: 'Редактировать' },
      { action: 'create-assignment', icon: 'clipboard-list', labelKey: 'private_library.dictation_card_actions.create_assignment', labelFallback: 'Задания' },
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

    const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';
    const coverLoading = 'lazy';

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
          <img src="${coverSrc}" data-cover-url="${coverUrl || ''}" alt="" class="short-cover" loading="${coverLoading}" decoding="async" draggable="false" onerror="this.onerror=null;this.src='/static/data/covers/cover_en.webp'">
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
    const tpl = document.getElementById('dictationKartDeskTemplate');
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
      const el = this._createElementFromHtml(this.renderDeskCard(item));
      this._bindHandlers(el);
      this._renderLucide(el);
      return el;
    }

    const node = tpl.content.firstElementChild.cloneNode(true);

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

    const coverUrl = window.maybeCacheBustDictationCover
      ? window.maybeCacheBustDictationCover(item.cover_url)
      : (item.cover_url || '');
    const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';

    const sentencesCount = typeof item.sentences_count === 'number'
      ? item.sentences_count
      : (parseInt(item.sentences_count, 10) || 0);

    const noticeMessage = pick && pick.reason ? String(pick.reason) : '';

    node.setAttribute('data-dictation-id', String(dictationId || ''));
    node.setAttribute('data-desk-item-id', String(item.id || ''));

    const thumb = node.querySelector('.short-thumb');
    if (thumb) {
      thumb.setAttribute('data-href', openUrl);
      thumb.setAttribute('data-lang-notice', noticeMessage);
    }

    const img = node.querySelector('img.short-cover');
    if (img) {
      img.src = coverSrc;
      img.setAttribute('data-cover-url', String(coverUrl || ''));
    }

    const titleSlot = node.querySelector('[data-slot="title"]');
    if (titleSlot) titleSlot.textContent = item.title || 'Без названия';

    const langPairSlot = node.querySelector('[data-slot="langPair"]');
    if (langPairSlot) langPairSlot.textContent = `${langOriginal}`;

    const levelSlot = node.querySelector('[data-slot="level"]');
    if (levelSlot) levelSlot.textContent = item.level || '—';

    const sentencesSlot = node.querySelector('[data-slot="sentencesCount"]');
    if (sentencesSlot) sentencesSlot.textContent = String(sentencesCount);

    const diktNumSlot = node.querySelector('[data-slot="dictationIdFormatted"]');
    if (diktNumSlot) diktNumSlot.textContent = dictationIdFormatted;

    const stats = node.querySelector('.short-stats');
    if (stats) stats.setAttribute('data-dictation-id', String(dictationId || ''));

    const menuSlot = node.querySelector('[data-slot="menu"]');
    if (menuSlot) {
      menuSlot.innerHTML = this.renderMenuHtml({
        context: 'desk',
        dictationId,
        deskItemId: item.id,
        editUrl,
        langOriginal,
        coverUrl,
        availableTranslations,
      });
    }

    this._bindHandlers(node);
    this._renderLucide(node);
    return node;
  },

  createBookCardElement(item) {
    const tpl = document.getElementById('dictationKartBookTemplate');
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
      const el = this._createElementFromHtml(this.renderBookCard(item));
      this._bindHandlers(el);
      this._renderLucide(el);
      return el;
    }

    const node = tpl.content.firstElementChild.cloneNode(true);

    const d = item;
    const coverUrl = d.cover_url || '';
    const coverSrc = coverUrl || '/static/data/covers/cover_en.webp';

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
    const sentencesCount = typeof d.sentences_count === 'number' ? d.sentences_count : (parseInt(d.sentences_count, 10) || 0);

    node.setAttribute('data-dictation-id', String(dbId || ''));
    node.setAttribute('data-edit-url', editUrl);

    const img = node.querySelector('.short-thumb img');
    if (img) {
      img.src = coverSrc;
      img.alt = d.title || 'Обложка диктанта';
    }

    const titleSlot = node.querySelector('[data-slot="title"]');
    if (titleSlot) titleSlot.textContent = d.title || 'Без названия';

    const langPairSlot = node.querySelector('[data-slot="langPair"]');
    if (langPairSlot) langPairSlot.textContent = `${langOriginal}`;

    const levelSlot = node.querySelector('[data-slot="level"]');
    if (levelSlot) levelSlot.textContent = d.level || '—';

    const sentencesSlot = node.querySelector('[data-slot="sentencesCount"]');
    if (sentencesSlot) sentencesSlot.textContent = String(sentencesCount);

    const diktNumSlot = node.querySelector('[data-slot="dictationId"]');
    if (diktNumSlot) diktNumSlot.textContent = String(dictationId || '');

    const toggleBtn = node.querySelector('[data-action="toggle-desk-explicit"]');
    if (toggleBtn) {
      toggleBtn.setAttribute('data-dictation-id', String(dbId || ''));
      const icon = toggleBtn.querySelector('i[data-lucide]');
      if (icon) icon.setAttribute('data-lucide', isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash');
    }

    try {
      if (isOnDesk) {
        node.classList.add('short-card--on-desk');
        node.classList.remove('short-card--off-desk');
      } else {
        node.classList.add('short-card--off-desk');
        node.classList.remove('short-card--on-desk');
      }
    } catch (e) {
    }

    const menuSlot = node.querySelector('[data-slot="menu"]');
    if (menuSlot) {
      menuSlot.innerHTML = this.renderMenuHtml({
        context: 'book',
        dictationId: dbId,
        deskItemId: null,
        editUrl,
        langOriginal,
        coverUrl,
        availableTranslations,
      });
    }

    this._bindHandlers(node);
    this._renderLucide(node);
    return node;
  },
};
