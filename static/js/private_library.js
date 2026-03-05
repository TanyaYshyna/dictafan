// Скрипт для новой страницы приватной библиотеки

(function () {
  window.__PRIVATE_LIBRARY_BUILD = '2026-03-03_0140';
  console.warn('[PRIVATE LIBRARY BUILD]', window.__PRIVATE_LIBRARY_BUILD);

  // Debug helper: capture clicks globally to understand if modal buttons are actually receiving events.
  // (Useful when something overlays the button or stops propagation.)
  try {
    if (!window.__deleteModalClickDebugInstalled) {
      window.__deleteModalClickDebugInstalled = true;
      document.addEventListener('click', (event) => {
        try {
          const t = event.target;
          if (!t) return;
          const confirmBtn = t.closest ? t.closest('#delete-dictation-confirm') : null;
          const closeBtn = t.closest ? t.closest('#delete-dictation-close') : null;
          const modal = t.closest ? t.closest('#delete-dictation-modal') : null;
          if (confirmBtn || closeBtn || (modal && t.id === 'delete-dictation-modal')) {
            console.log('🗑️ [capture] click', {
              targetTag: t.tagName,
              targetId: t.id || null,
              targetClass: (typeof t.className === 'string') ? t.className : null,
              isConfirm: !!confirmBtn,
              isClose: !!closeBtn,
              isModalBackdrop: !!(modal && t.id === 'delete-dictation-modal'),
              pendingDeleteDictationId: (typeof pendingDeleteDictationId !== 'undefined') ? pendingDeleteDictationId : null
            });
          }
        } catch (e) {
          // ignore
        }
      }, true);
    }
  } catch (e) {
    // ignore
  }

  function installBuildAutoReloader(buildValue, storageKey) {
    try {
      const v = String(buildValue || '');
      if (!v) return;
      const k = String(storageKey || 'dictafan:build');
      const prev = String(localStorage.getItem(k) || '');
      const onceKey = `${k}:reloaded:${v}`;
      const alreadyReloaded = String(sessionStorage.getItem(onceKey) || '') === 'true';
      if (prev && prev !== v && !alreadyReloaded) {
        try {
          sessionStorage.setItem(onceKey, 'true');
        } catch (e) {
        }
        try {
          localStorage.setItem(k, v);
        } catch (e) {
        }
        location.reload();
        return;
      }
      if (!prev) {
        try {
          localStorage.setItem(k, v);
        } catch (e) {
        }
      }
    } catch (e) {
    }
  }

  installBuildAutoReloader(window.__PRIVATE_LIBRARY_BUILD, 'dictafan:build:private_library');

  function installPrivateLibraryBuildBadge() {
    try {
      if (window.__privateLibraryBuildBadgeInstalled) return;
      window.__privateLibraryBuildBadgeInstalled = true;

      const mount = () => {
        try {
          const id = 'private-library-build-badge';
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.setAttribute('aria-hidden', 'true');
            el.style.position = 'fixed';
            el.style.left = '6px';
            el.style.bottom = '6px';
            el.style.zIndex = '2147483647';
            el.style.fontSize = '10px';
            el.style.lineHeight = '1.2';
            el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
            el.style.color = 'rgba(255,255,255,0.75)';
            el.style.background = 'rgba(0,0,0,0.35)';
            el.style.padding = '2px 6px';
            el.style.borderRadius = '6px';
            el.style.pointerEvents = 'none';
            el.style.userSelect = 'none';
            document.body.appendChild(el);
          }
          const v = String(window.__PRIVATE_LIBRARY_BUILD || 'unknown');
          el.textContent = `build: ${v}`;
        } catch (e) {
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
      } else {
        mount();
      }
    } catch (e) {
    }
  }

  installPrivateLibraryBuildBadge();

  let bookLanguageSelector = null;
  let activeBookId = null;
  let activeBookIsWorkbook = false;
  let currentView = 'cards'; // 'cards' or 'list'
  let cropper = null;
  let croppedImageBlob = null;
  let deskItems = []; // Список диктантов на столе
  let deskLoadSeq = 0;
  let deskLoadInFlight = null;
  let pendingDeleteDictationId = null;
  let pendingDeleteSectionId = null;

  function getToken() {
    return localStorage.getItem("jwt_token");
  }

  async function idbPut(storeName, value) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbDelete(storeName, key) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbGetAll(storeName) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  function withCacheBust(url) {
    if (!url || typeof url !== 'string') return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${Date.now()}`;
  }

  async function apiRequest(url, options = {}) {
    const token = getToken();
    const headers = options.headers || {};

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 422) {
      if (window.UM) {
        window.UM.requireAuth();
      }
      throw new Error("Требуется авторизация");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  function showToast(message, opts = {}) {
    const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 1000;
    const beepUrl = typeof opts.beepUrl === 'string' ? opts.beepUrl : null;

    let el = document.getElementById('auto-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auto-toast';
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.top = '24px';
      el.style.transform = 'translateX(-50%)';
      el.style.zIndex = '100000';
      el.style.background = 'rgba(0,0,0,0.78)';
      el.style.color = '#fff';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '12px';
      el.style.fontSize = '14px';
      el.style.maxWidth = 'min(92vw, 520px)';
      el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
      el.style.display = 'none';
      document.body.appendChild(el);
    }

    el.textContent = message || '';
    el.style.display = 'block';

    if (beepUrl) {
      try {
        const a = new Audio(beepUrl);
        a.volume = 0.7;
        a.play().catch(() => {});
      } catch (e) {
      }
    }

    if (el._hideTimer) window.clearTimeout(el._hideTimer);
    el._hideTimer = window.setTimeout(() => {
      try {
        const node = document.getElementById('auto-toast');
        if (node) node.style.display = 'none';
      } catch (e) {
      }
    }, Math.max(0, durationMs));
  }

  const deskToggleInFlight = new Set();

  function ensureSwStatusBar() {
    try {
      const id = 'swStatusBar';
      let el = document.getElementById(id);
      if (el) return el;
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.right = '0';
      el.style.bottom = '0';
      el.style.zIndex = '2147483647';
      el.style.padding = '6px 10px';
      el.style.fontSize = '12px';
      el.style.lineHeight = '1.2';
      el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      el.style.color = 'rgba(255,255,255,0.85)';
      el.style.background = 'rgba(0,0,0,0.55)';
      el.style.backdropFilter = 'blur(6px)';
      el.style.webkitBackdropFilter = 'blur(6px)';
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.textContent = '';
      document.body.appendChild(el);
      return el;
    } catch (e) {
      return null;
    }
  }

  function setSwStatus(message, opts = {}) {
    try {
      const el = ensureSwStatusBar();
      if (!el) return;
      el.textContent = String(message || '');
      el.style.display = message ? 'block' : 'none';
      if (el._hideTimer) {
        clearTimeout(el._hideTimer);
        el._hideTimer = null;
      }
      const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 1500;
      if (message && durationMs > 0) {
        el._hideTimer = setTimeout(() => {
          try {
            el.style.display = 'none';
          } catch (e) {
          }
        }, durationMs);
      }
    } catch (e) {
    }
  }

  const PAGE_NAME = 'private_library';
  (async () => {
    try {
      const res = await fetch('/api/app-cache-revision', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rev = data && (data.revision || data.app_cache_revision || data.value);
      console.log('[Version]', `${PAGE_NAME}__${rev || 'unknown'}`);
    } catch (e) {
      console.log('[Version]', `${PAGE_NAME}__unknown`);
    }
  })();

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    const value = n / Math.pow(k, i);
    const decimals = i === 0 ? 0 : (i === 1 ? 0 : 1);
    return `${value.toFixed(decimals)} ${units[i]}`;
  }

  function formatMbValue(bytes) {
    const b = Number(bytes);
    if (!isFinite(b) || b <= 0) return 300;
    return Math.max(10, Math.round(b / (1024 * 1024)));
  }

  async function swRequest(action, payload = {}) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      throw new Error('Service Worker не активен');
    }

    try {
      setSwStatus(`SW: ${String(action)} …`, { durationMs: 0 });
    } catch (e) {
    }

    const timeoutMs = typeof payload.timeoutMs === 'number' ? payload.timeoutMs : 15000;
    const message = { action, ...payload };
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
            setSwStatus(`SW: ${String(action)} ok`);
          } catch (e) {
          }
          resolve(data);
        } else {
          try {
            const err = new Error(data && data.error ? data.error : 'sw_error');
            err.swAction = action;
            err.swError = data && data.error ? data.error : 'sw_error';
            err.swResult = data && data.result ? data.result : null;
            err.swPayload = payload || null;
            try {
              setSwStatus(`SW: ${String(action)} error`);
            } catch (e2) {
            }
            reject(err);
          } catch (e) {
            try {
              setSwStatus(`SW: ${String(action)} error`);
            } catch (e2) {
            }
            reject(new Error(data && data.error ? data.error : 'sw_error'));
          }
        }
      };

      navigator.serviceWorker.controller.postMessage({ ...message, requestId }, [channel.port2]);
    });
  }

  function chunkArray(arr, size) {
    const n = Array.isArray(arr) ? arr : [];
    const s = Math.max(1, Number(size) || 1);
    const out = [];
    for (let i = 0; i < n.length; i += s) {
      out.push(n.slice(i, i + s));
    }
    return out;
  }

  async function openDraftDb() {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.open('dictafan_drafts', 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('activity_outbox')) {
          db.createObjectStore('activity_outbox', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('success_outbox')) {
          db.createObjectStore('success_outbox', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('dictations')) {
          db.createObjectStore('dictations', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('desk_items')) {
          db.createObjectStore('desk_items', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function syncOfflineActivityOutbox() {
    try {
      const token = window.UM?.token || localStorage.getItem('jwt_token');
      if (!token) return false;
      if (!navigator.onLine) return false;

      const rows = await idbGetAll('activity_outbox');
      if (!rows.length) return true;

      for (const row of rows) {
        if (!row || !row.dictation_id) {
          // Старые/некорректные записи: не отправляем на сервер (иначе будет 400/500)
          continue;
        }
        const toSend = [];
        if (row.perfect_count) toSend.push({ type_activity: 'perfect', number: row.perfect_count });
        if (row.corrected_count) toSend.push({ type_activity: 'corrected', number: row.corrected_count });
        if (row.audio_count) toSend.push({ type_activity: 'audio', number: row.audio_count });

        let sentAll = true;
        for (const item of toSend) {
          const response = await fetch('/api/statistics/activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              dictation_id: row.dictation_id,
              date: row.date,
              type_activity: item.type_activity,
              number: item.number
            })
          });
          if (!response.ok) {
            sentAll = false;
            break;
          }
        }

        if (sentAll) {
          await idbDelete('activity_outbox', row.key);
        } else {
          return false;
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  async function syncOfflineSuccessOutbox() {
    try {
      const token = window.UM?.token || localStorage.getItem('jwt_token');
      if (!token) return false;
      if (!navigator.onLine) return false;

      const rows = await idbGetAll('success_outbox');
      if (!rows.length) return true;

      for (const row of rows) {
        const response = await fetch('/api/statistics/success', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(row.payload)
        });
        if (!response.ok) {
          return false;
        }
        await idbDelete('success_outbox', row.key);
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  async function syncOfflineOutboxes() {
    const [aOk, sOk] = await Promise.all([
      syncOfflineActivityOutbox(),
      syncOfflineSuccessOutbox()
    ]);
    refreshDeskOutboxIndicator().catch(() => {});
    return !!aOk && !!sOk;
  }

  window.addEventListener('online', () => {
    syncOfflineOutboxes().catch(() => {});
  });

  function ensureDeskOutboxIndicator() {
    if (document.getElementById('deskOutboxIndicator')) return;
    const deskZone = document.querySelector('.desk-zone');
    if (!deskZone) return;

    const el = document.createElement('div');
    el.id = 'deskOutboxIndicator';
    el.style.position = 'absolute';
    el.style.top = '8px';
    el.style.right = '8px';
    el.style.zIndex = '5';
    el.style.background = 'rgba(0,0,0,0.55)';
    el.style.color = '#fff';
    el.style.fontSize = '12px';
    el.style.lineHeight = '1.2';
    el.style.padding = '6px 8px';
    el.style.borderRadius = '10px';
    el.style.cursor = 'pointer';
    el.style.userSelect = 'none';
    el.style.display = 'none';
    el.textContent = '';

    el.addEventListener('click', async () => {
      try {
        const [activities, successes] = await Promise.all([
          idbGetAll('activity_outbox'),
          idbGetAll('success_outbox')
        ]);

        const lines = [];
        lines.push(`Очередь синка:`);
        lines.push(`Успехи: ${successes.length}`);
        for (const s of successes.slice(0, 20)) {
          const d = s?.payload?.dictation_id;
          const t = s?.createdAt ? new Date(s.createdAt).toLocaleString() : '';
          lines.push(`- ${d || 'dictation'} ${t}`);
        }
        if (successes.length > 20) lines.push(`…и еще ${successes.length - 20}`);

        lines.push(``);
        lines.push(`Активность (дни): ${activities.length}`);
        for (const a of activities.slice(0, 40)) {
          const p = Number(a?.perfect_count) || 0;
          const c = Number(a?.corrected_count) || 0;
          const au = Number(a?.audio_count) || 0;
          lines.push(`- ${a?.date || ''}: perfect=${p}, corrected=${c}, audio=${au}`);
        }
        if (activities.length > 40) lines.push(`…и еще ${activities.length - 40}`);

        alert(lines.join('\n'));
      } catch (e) {
        alert('Не удалось прочитать очередь синка');
      }
    });

    deskZone.style.position = 'relative';
    deskZone.appendChild(el);
  }

  async function refreshDeskOutboxIndicator() {
    ensureDeskOutboxIndicator();
    const el = document.getElementById('deskOutboxIndicator');
    if (!el) return;

    try {
      const [activities, successes] = await Promise.all([
        idbGetAll('activity_outbox'),
        idbGetAll('success_outbox')
      ]);
      const aCount = Array.isArray(activities) ? activities.length : 0;
      const sCount = Array.isArray(successes) ? successes.length : 0;
      if (aCount === 0 && sCount === 0) {
        el.style.display = 'none';
        el.textContent = '';
        el.title = '';
        return;
      }

      el.style.display = '';
      el.textContent = `Очередь: успехи ${sCount}, активность ${aCount}`;
      el.title = 'Неотправленные данные (клик — детали)';
    } catch (e) {
      el.style.display = 'none';
    }
  }

  function getDraftUserIdForKey() {
    try {
      const um = window.UM;
      const id = um?.userData?.id;
      return id ? String(id) : 'anon';
    } catch {
      return 'anon';
    }
  }

  function getDraftKey(dictationId) {
    const id = dictationId ? String(dictationId) : '';
    if (!id) return null;
    return `${getDraftUserIdForKey()}:${id}`;
  }

  async function refreshOfflineCacheStatus() {
    const statusEl = document.getElementById('offlineCacheStatus');
    if (!statusEl) return;
    statusEl.textContent = 'Обновляю…';
    try {
      const res = await swRequest('cacheStats');
      const bytes = res.stats?.totalBytes || 0;
      const entries = res.stats?.entries || 0;
      const maxBytes = res.stats?.maxBytes || 0;

      const progressUsedEl = document.getElementById('deskCacheUsedText');
      const progressMaxEl = document.getElementById('deskCacheMaxText');
      const progressBarEl = document.getElementById('deskCacheProgressBar');
      if (progressUsedEl) progressUsedEl.textContent = formatBytes(bytes);
      if (progressMaxEl) progressMaxEl.textContent = formatBytes(maxBytes);
      if (progressBarEl) {
        const pct = maxBytes > 0 ? Math.max(0, Math.min(100, Math.round((bytes / maxBytes) * 100))) : 0;
        progressBarEl.style.width = `${pct}%`;
      }

      const limitInput = document.getElementById('offlineCacheLimitMb');
      if (limitInput && maxBytes) {
        limitInput.value = String(formatMbValue(maxBytes));
      }

      if (maxBytes) {
        statusEl.textContent = `Записей: ${entries}. Размер: ${formatBytes(bytes)} / ${formatBytes(maxBytes)}.`;
      } else {
      statusEl.textContent = `Записей: ${entries}. Размер: ${formatBytes(bytes)}.`;
      }
    } catch (e) {
      statusEl.textContent = `Ошибка: ${e && e.message ? e.message : String(e)}`;
    }
  }

  function openOfflineCacheModal() {
    const modal = document.getElementById('offline-cache-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    refreshOfflineCacheStatus();
    if (window.lucide) lucide.createIcons();
  }

  function closeOfflineCacheModal() {
    const modal = document.getElementById('offline-cache-modal');
    if (!modal) return;
    modal.style.display = 'none';
  }

  function openHomeLibraryModal() {
    const modal = document.getElementById('home-library-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }

  function closeHomeLibraryModal() {
    const modal = document.getElementById('home-library-modal');
    if (!modal) return;
    modal.style.display = 'none';
  }

  async function prefetchDeskAssets() {
    if (!deskItems || !deskItems.length) {
      showToast('На столе пока нет диктантов');
      return;
    }

    const urls = [];

    for (const item of deskItems) {
      try {
        if (item.cover_url) urls.push(item.cover_url);

        const dictId = `dict_${item.dictation_id}`;
        const langOrig = item.language_code || 'en';
        const langTr = item.language_translation || langOrig;
        const apiUrl = `/api/dictation/${dictId}/${langOrig}/${langTr}/sentences`;

        const sentencesRes = await fetch(apiUrl);
        if (!sentencesRes.ok) {
          continue;
        }
        const sentencesData = await sentencesRes.json();
        const sentences = sentencesData && sentencesData.sentences ? sentencesData.sentences : [];
        for (const s of sentences) {
          if (!s) continue;
          const candidates = [s.audio, s.audio_a, s.audio_f, s.audio_m, s.audio_tr];
          for (const u of candidates) {
            if (u && typeof u === 'string') urls.push(u);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const unique = Array.from(new Set(urls));
    const statusEl = document.getElementById('offlineCacheStatus');
    const progressWrap = document.getElementById('offlineCacheProgressWrap');
    const progressBar = document.getElementById('offlineCacheProgressBar');
    const progressText = document.getElementById('offlineCacheProgressText');

    if (statusEl) statusEl.textContent = `Скачиваю… (0/${unique.length})`;
    if (progressWrap) progressWrap.style.display = 'flex';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    try {
      const chunks = chunkArray(unique, 25);
      let fetched = 0;
      let skipped = 0;
      let failed = 0;
      let done = 0;

      for (const chunk of chunks) {
        if (statusEl) statusEl.textContent = `Скачиваю… (${done}/${unique.length})`;
        const percent = unique.length > 0 ? Math.round((done / unique.length) * 100) : 0;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${percent}%`;

        const res = await swRequest('prefetch', { urls: chunk, timeoutMs: 120000 });
        const result = res.result || {};
        fetched += result.fetched || 0;
        skipped += result.skipped || 0;
        failed += result.failed || 0;
        done += chunk.length;
      }

      const finalPercent = unique.length > 0 ? 100 : 0;
      if (progressBar) progressBar.style.width = `${finalPercent}%`;
      if (progressText) progressText.textContent = `${finalPercent}%`;

      showToast(`Готово. Скачано: ${fetched}. Уже было: ${skipped}. Ошибок: ${failed}.`);
    } catch (e) {
      showToast(`Ошибка prefetch: ${e && e.message ? e.message : String(e)}`);
    } finally {
      if (progressWrap) progressWrap.style.display = 'none';
      refreshOfflineCacheStatus();
    }
  }
  
  /**
   * Сохраняем целевую книгу/раздел для нового диктанта в sessionStorage,
   * чтобы редактор диктанта мог после сохранения привязать его к книге.
   */
  function setDictationTargetBook(bookId) {
    try {
      if (!bookId) return;
      const payload = { book_id: Number(bookId) || null };
      sessionStorage.setItem('dictationTargetBook', JSON.stringify(payload));
      console.log('📚 dictationTargetBook сохранён в sessionStorage:', payload);
    } catch (e) {
      console.warn('⚠️ Не удалось сохранить dictationTargetBook в sessionStorage:', e);
    }
  }

  // Функции для показа/скрытия индикатора загрузки
  function showLoadingIndicator(message = 'Сохранение...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text">${message}</div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.zIndex = '99999';
      overlay.style.pointerEvents = 'auto';
    } else {
      overlay.querySelector('.loading-text').textContent = message;
    }
    overlay.style.display = 'flex';
    overlay.dataset.autoclosing = '';
  }

  function hideLoadingIndicator() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.dataset.autoclosing = '';
    }
  }

  function completeLoadingIndicator(message = 'Загрузка закончена', delayMs = 1000) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const text = overlay.querySelector('.loading-text');
    if (text) text.textContent = message;
    overlay.dataset.autoclosing = '1';
    window.setTimeout(() => {
      try {
        const ov = document.getElementById('loading-overlay');
        if (!ov) return;
        ov.style.display = 'none';
        ov.dataset.autoclosing = '';
      } catch (e) {
      }
    }, Math.max(0, Number(delayMs) || 0));
  }

  async function checkAppCacheRevision() {
    try {
      const res = await fetch('/api/app-cache-revision', { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data || !data.success || !data.revision) return;

      const serverRev = String(data.revision);
      const localRev = localStorage.getItem('app_cache_revision');

      if (!localRev) {
        localStorage.setItem('app_cache_revision', serverRev);
        return;
      }

      if (localRev === serverRev) return;

      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          await swRequest('cacheClearAppShell', { timeoutMs: 60000 });
        }
      } catch (e) {
      }

      localStorage.setItem('app_cache_revision', serverRev);
      location.reload();
    } catch (e) {
      // ignore
    }
  }

  // ==================== ЗОНА 1: Рабочий стол ====================
  
  async function loadDeskItems() {
    const seq = ++deskLoadSeq;
    if (deskLoadInFlight) {
      try {
        await deskLoadInFlight;
      } catch (e) {
      }
    }

    let resolveInFlight;
    let rejectInFlight;
    deskLoadInFlight = new Promise((resolve, reject) => {
      resolveInFlight = resolve;
      rejectInFlight = reject;
    });

    const t0 = performance.now();
    let renderedFromCache = false;

    try {
      const cached = await idbGet('desk_items', 'latest');
      const items = cached && Array.isArray(cached.items) ? cached.items : [];
      if (items.length) {
        if (seq !== deskLoadSeq) {
          resolveInFlight();
          return;
        }
        deskItems = items;
        if (typeof renderDeskCards === 'function') {
          renderDeskCards(deskItems);
        }
        updateInWorkIndicators();
        refreshDeskOutboxIndicator().catch(() => {});
        renderedFromCache = true;
        const tCache = performance.now();
        console.log('[desk-render] stage0 cached items:', items.length, 'time:', Math.round(tCache - t0), 'ms');
      }
    } catch (e) {
    }

    try {
      const tNetStart = performance.now();
      const data = await apiRequest("/desk/api/items");
      const tNetEnd = performance.now();
      console.log('[desk-render] stage0 network fetch:', Math.round(tNetEnd - tNetStart), 'ms');

      if (data.success && data.items) {
        if (seq !== deskLoadSeq) {
          resolveInFlight();
          return;
        }
        deskItems = data.items;
        try {
          await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
        } catch (e) {
        }
        if (typeof renderDeskCards === 'function') {
          renderDeskCards(deskItems);
        }
        // Обновляем индикаторы "в работе" в карточках диктантов
        updateInWorkIndicators();
        refreshDeskOutboxIndicator().catch(() => {});
        resolveInFlight();
        return;
      }
      resolveInFlight();
    } catch (error) {
      rejectInFlight(error);
      if (!renderedFromCache) {
        console.error("Ошибка загрузки диктантов на столе:", error);
      } else {
        console.warn("Ошибка обновления диктантов на столе (показан кеш):", error);
      }
    }
  }
  
  // Проверяет, находится ли диктант на столе
  function isDictationOnDesk(dictationId) {
    return deskItems.some(item => item.dictation_id === parseInt(dictationId));
  }
  
  // Получает item_id диктанта на столе
  function getDeskItemId(dictationId) {
    const item = deskItems.find(item => item.dictation_id === parseInt(dictationId));
    return item ? item.id : null;
  }
  
  // Обновляет индикаторы "в работе" во всех карточках диктантов
  function updateInWorkIndicators() {
    // Не добавляем индикатор "в работе" для карточек на столе (desk-card)
    document.querySelectorAll('.short-card[data-dictation-id]:not(.desk-card)').forEach(card => {
      const dictationId = card.dataset.dictationId;
      if (!dictationId) return;
      
      let indicator = card.querySelector('.short-in-work-indicator');
      const isOnDesk = isDictationOnDesk(dictationId);
      const thumb = card.querySelector('.short-thumb');
      
      if (isOnDesk && !indicator && thumb) {
        // Добавляем индикатор
        indicator = document.createElement('div');
        indicator.className = 'short-in-work-indicator';
        indicator.title = 'В работе';
        indicator.innerHTML = '<i data-lucide="pen-tool"></i>';
        thumb.appendChild(indicator);
        if (window.lucide) lucide.createIcons();
      } else if (!isOnDesk && indicator) {
        // Удаляем индикатор
        indicator.remove();
      }
    });
  }
  
  // Удаляет диктант со стола (используется кнопкой "убрать со стола")
  async function removeFromDesk(itemId, dictationId) {
    try {
      // Удаляем со стола
      const removeData = await apiRequest(`/desk/api/item/${itemId}`, {
        method: 'DELETE'
      });
      
      if (removeData.success) {
        try {
          await swRequest('purgeDictation', { dictationId });
        } catch (e) {
          // ignore
        }

        try {
          const container = document.getElementById('deskCardsContainer');
          const card = container ? container.querySelector(`.desk-card[data-desk-item-id="${String(itemId)}"]`) : null;
          if (card) {
            card.remove();
          }
        } catch (e) {
        }

        try {
          const before = Array.isArray(deskItems) ? deskItems.length : 0;
          deskItems = Array.isArray(deskItems)
            ? deskItems.filter(x => String(x.id) !== String(itemId))
            : [];
          const after = Array.isArray(deskItems) ? deskItems.length : 0;
          if (before !== after) {
            try {
              await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
            } catch (e) {
            }
          }
        } catch (e) {
        }

        try {
          localStorage.removeItem(getDeskCardPosStorageKey(String(itemId)));
        } catch (e) {
        }

        try {
          const container = document.getElementById('deskCardsContainer');
          if (container) {
            const grid = container.querySelector('.shorts-grid');
            const remaining = grid ? grid.querySelectorAll('.desk-card').length : 0;
            if (!remaining) {
              container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
            }
          }
        } catch (e) {
        }

        showToast('Диктант убран со стола', { durationMs: 1000, beepUrl: '/static/sounds/victory/beep2.mp3' });
        refreshOfflineCacheStatus();
      } else {
        showToast('Ошибка при удалении диктанта со стола');
      }
    } catch (error) {
      console.error('❌ Ошибка удаления диктанта со стола:', error);
      showToast('Ошибка при удалении диктанта со стола');
    }
  }

  function ensureDeskGridContainer() {
    const container = document.getElementById('deskCardsContainer');
    if (!container) return null;
    let grid = container.querySelector('.shorts-grid');
    if (grid) return grid;

    container.innerHTML = '';
    grid = document.createElement('div');
    grid.className = 'shorts-grid';
    container.appendChild(grid);
    return grid;
  }

  function insertDeskCardElement(item, position = 'start') {
    const grid = ensureDeskGridContainer();
    if (!grid) return null;
    const html = createDictationCard(item, true);
    if (position === 'end') {
      grid.insertAdjacentHTML('beforeend', html);
    } else {
      grid.insertAdjacentHTML('afterbegin', html);
    }

    const el = grid.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
    if (!el) return null;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    try {
      const container = document.getElementById('deskCardsContainer');
      if (container && (isDeskFreeLayoutEnabled() || hasAnyDeskCardPositions(container))) {
        enableDeskFreeLayout(container);
        installDeskDragAndDrop(container);
      }
    } catch (e) {
    }

    try {
      applyDeskCovers(document.getElementById('deskCardsContainer'));
    } catch (e) {
    }

    try {
      const tmpWrap = document.createElement('div');
      tmpWrap.appendChild(el.cloneNode(true));
      updateDictationCardsStats(tmpWrap);
      updateCompletionBadges(tmpWrap);
      const fresh = tmpWrap.firstElementChild;
      if (fresh) {
        el.replaceWith(fresh);
        return fresh;
      }
    } catch (e) {
    }

    return el;
  }

  async function syncDeskFromServerIncremental() {
    const data = await apiRequest('/desk/api/items');
    if (!data || !data.success || !Array.isArray(data.items)) {
      return { success: false };
    }

    const next = data.items;
    const prev = Array.isArray(deskItems) ? deskItems : [];

    const prevById = new Map(prev.map(x => [String(x.id), x]));
    const nextById = new Map(next.map(x => [String(x.id), x]));

    const added = [];
    const removed = [];

    for (const item of next) {
      if (!prevById.has(String(item.id))) {
        added.push(item);
      }
    }
    for (const item of prev) {
      if (!nextById.has(String(item.id))) {
        removed.push(item);
      }
    }

    deskItems = next;
    try {
      await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
    } catch (e) {
    }

    const container = document.getElementById('deskCardsContainer');
    if (!container) {
      return { success: true, added: added.length, removed: removed.length };
    }

    // Remove cards first
    for (const item of removed) {
      try {
        const card = container.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
        if (card) card.remove();
      } catch (e) {
      }
      try {
        localStorage.removeItem(getDeskCardPosStorageKey(String(item.id)));
      } catch (e) {
      }
    }

    // Add new cards
    for (const item of added) {
      insertDeskCardElement(item, 'start');
    }

    // If container is empty now, render empty state
    try {
      const grid = container.querySelector('.shorts-grid');
      const remaining = grid ? grid.querySelectorAll('.desk-card').length : 0;
      if (!remaining) {
        container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
      }
    } catch (e) {
    }

    updateInWorkIndicators();
    refreshDeskOutboxIndicator().catch(() => {});
    return { success: true, added: added.length, removed: removed.length };
  }
  
  // Добавляет или удаляет диктант со стола (используется кликом на карточку в библиотеке)
  async function toggleDictationOnDesk(dictationId) {
    if (!dictationId) return;
    const key = String(dictationId);
    if (deskToggleInFlight.has(key)) return;
    deskToggleInFlight.add(key);

    console.log('===DESK_TOGGLE=== start', { dictationId: String(dictationId) });

    const isOnDesk = isDictationOnDesk(dictationId);
    
    if (isOnDesk) {
      // Удаляем со стола
      try {
        const ok = confirm('Вы точно хотите убрать диктант с рабочего стола?');
        if (!ok) {
          deskToggleInFlight.delete(key);
          return;
        }
      } catch (e) {
      }

      const itemId = getDeskItemId(dictationId);
      if (!itemId) {
        console.error('❌ Не найден item_id для диктанта на столе:', dictationId);
        deskToggleInFlight.delete(key);
        return;
      }
      
      try {
        await removeFromDesk(itemId, dictationId);
      } finally {
        deskToggleInFlight.delete(key);
      }
    } else {
      // Добавляем на стол
      try {
        showLoadingIndicator('Скачиваю диктант для оффлайна…');

        console.log('===DESK_TOGGLE=== add flow: prefetch start', { dictationId: String(dictationId) });

        // Жёсткое правило: диктант можно добавить на стол только если ассеты влезают в оффлайн-лимит
        // (HTML страница диктанта + JS/CSS + аудио + обложка). Если не влезает — не добавляем.
        try {
          const requiredUrls = [];

          const metaRes = await apiRequest(`/api/dictation/${dictationId}`);
          console.log('===DESK_TOGGLE=== meta loaded', {
            dictationId: String(dictationId),
            success: Boolean(metaRes && metaRes.success),
            hasDictation: Boolean(metaRes && metaRes.dictation),
          });
          if (metaRes && metaRes.success && metaRes.dictation && metaRes.dictation.cover_url) {
            requiredUrls.push(metaRes.dictation.cover_url);
          }

          // HTML страница диктанта (нужна для оффлайн-навигации)
          // Языки берем так же, как формируется openUrl на desk карточке.
          const dictIdForUrl = `dict_${dictationId}`;
          const langOrigForUrl = (metaRes && metaRes.success && metaRes.dictation && metaRes.dictation.language_code)
            ? metaRes.dictation.language_code
            : 'en';
          const langTrForUrl = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
            ? window.USER_LANGUAGE_DATA.nativeLanguage
            : langOrigForUrl;
          // Домашняя страница — это рабочий стол, тоже нужна оффлайн
          requiredUrls.push('/');
          requiredUrls.push(`/dictation/${dictIdForUrl}/${langOrigForUrl}/${langTrForUrl}`);

          // Ключевые статические ассеты страницы диктанта.
          // (Service Worker кеширует /static/*; здесь мы принудительно префетчим минимально нужное)
          requiredUrls.push('/static/css/style_dictation.css');
          requiredUrls.push('/static/js/utils.js');
          requiredUrls.push('/static/js/language_manager.js');
          requiredUrls.push('/static/js/model_manager.js');
          requiredUrls.push('/static/js/user_manager.js');
          requiredUrls.push('/static/js/auth_interceptor.js');
          requiredUrls.push('/static/js/login_modal.js');
          requiredUrls.push('/static/js/sw_register.js');
          requiredUrls.push('/static/js/audio_manager.js');
          requiredUrls.push('/static/js/audio_player_visual.js');
          requiredUrls.push('/static/js/user_activity_history.js');
          requiredUrls.push('/static/js/dictation_statistics.js');
          requiredUrls.push('/static/js/progress_panel.js');
          requiredUrls.push('/static/js/audio_settings_panel.js');
          requiredUrls.push('/static/js/statistics_report.js');
          requiredUrls.push('/static/js/whisper-model-manager.js');
          requiredUrls.push('/static/js/speech_recognition_unified.js');
          requiredUrls.push('/static/js/script_dictation.js');

          // Звуки (нужны даже оффлайн: прогресс/победа)
          requiredUrls.push('/static/sounds/success.mp3');
          requiredUrls.push('/static/sounds/timer/timer_sounds.json');
          requiredUrls.push('/static/sounds/victory/victory_sounds.json');
          requiredUrls.push('/static/sounds/timer/beep1.mp3');
          requiredUrls.push('/static/sounds/timer/beep3.mp3');
          requiredUrls.push('/static/sounds/victory/beep2.mp3');
          requiredUrls.push('/static/sounds/victory/beep4.mp3');

          const sentencesRes = await apiRequest(`/api/dictation/${dictationId}/sentences`);
          console.log('===DESK_TOGGLE=== sentences list loaded', {
            dictationId: String(dictationId),
            success: Boolean(sentencesRes && sentencesRes.success),
            count: (sentencesRes && Array.isArray(sentencesRes.sentences)) ? sentencesRes.sentences.length : null,
          });
          const sentences = sentencesRes && sentencesRes.success && Array.isArray(sentencesRes.sentences)
            ? sentencesRes.sentences
            : [];
          for (const s of sentences) {
            if (s && s.audio) requiredUrls.push(s.audio);
          }

          const uniqueRequired = Array.from(new Set(requiredUrls)).filter(Boolean);
          if (!uniqueRequired.length) {
            showToast('Не удалось определить ассеты диктанта для оффлайн-режима');
            hideLoadingIndicator();
            deskToggleInFlight.delete(key);
            return;
          }

          await swRequest('prefetchStrict', { urls: uniqueRequired, timeoutMs: 180000 });
          console.log('===DESK_TOGGLE=== prefetchStrict done', { dictationId: String(dictationId), urls: uniqueRequired.length });
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          try {
            const res = e && e.swResult ? e.swResult : null;
            console.log('===DESK_TOGGLE=== prefetchStrict failed', {
              dictationId: String(dictationId),
              msg,
              failed: res && typeof res.failed === 'number' ? res.failed : null,
              overLimit: res && typeof res.overLimit === 'number' ? res.overLimit : null,
              failedUrls: res && Array.isArray(res.failedUrls) ? res.failedUrls : null,
              overLimitUrls: res && Array.isArray(res.overLimitUrls) ? res.overLimitUrls : null,
            });
          } catch (e2) {
            console.log('===DESK_TOGGLE=== prefetchStrict failed', { dictationId: String(dictationId), msg });
          }
          if (msg === 'cache_limit_exceeded' || msg.includes('cache_limit_exceeded')) {
            showToast('Не хватает места в оффлайн-кеше. Увеличь лимит или убери диктанты со стола.');
          } else if (msg.includes('Service Worker не активен')) {
            showToast('Оффлайн режим не активен. Обнови страницу или включи Service Worker.');
          } else {
            showToast(`Не удалось скачать диктант в оффлайн: ${msg}`);
          }
          hideLoadingIndicator();
          deskToggleInFlight.delete(key);
          return;
        }

        const addData = await apiRequest(`/library/api/dictation/${dictationId}/add-to-desk`, {
          method: 'POST',
          body: JSON.stringify({})
        });

        console.log('===DESK_TOGGLE=== add-to-desk response', {
          dictationId: String(dictationId),
          success: Boolean(addData && addData.success),
          error: addData && (addData.error || addData.message) ? String(addData.error || addData.message) : '',
        });
        
        if (addData && addData.success) {
          try {
            const syncRes = await syncDeskFromServerIncremental();
            console.log('===DESK_TOGGLE=== desk sync incremental done', {
              dictationId: String(dictationId),
              success: Boolean(syncRes && syncRes.success),
              added: syncRes && typeof syncRes.added === 'number' ? syncRes.added : null,
              removed: syncRes && typeof syncRes.removed === 'number' ? syncRes.removed : null,
            });
          } catch (e) {
            await loadDeskItems();
            console.log('===DESK_TOGGLE=== loadDeskItems fallback done', { dictationId: String(dictationId) });
          }

          // Сохраняем контент диктанта (предложения) в IndexedDB, чтобы страница диктанта работала только из IDB
          try {
            console.log('===DESK_TOGGLE=== idb save start', { dictationId: String(dictationId) });
            const dictId = `dict_${dictationId}`;
            const userId = getDraftUserIdForKey();
            const metaRes = await apiRequest(`/api/dictation/${dictationId}`);
            const dictMeta = metaRes && metaRes.success ? metaRes.dictation : null;
            const deskItem = Array.isArray(deskItems) ? deskItems.find(x => String(x.dictation_id) === String(dictationId)) : null;
            const langOrig = (deskItem && (deskItem.language_code || deskItem.language_original)) || (dictMeta && dictMeta.language_code) || 'en';
            const langTr = (deskItem && deskItem.language_translation) || langOrig;

            const sentencesRes2 = await apiRequest(`/api/dictation/${dictId}/${langOrig}/${langTr}/sentences`);
            const sentences2 = sentencesRes2 && sentencesRes2.success && Array.isArray(sentencesRes2.sentences) ? sentencesRes2.sentences : [];

            const basePayload = {
              dictationId: dictId,
              langOrig,
              langTr,
              updatedAt: Date.now(),
              meta: dictMeta,
              sentences: sentences2
            };

            // Store both under userId and under anon to survive offline token validation issues.
            const idbKeyUser = `${userId}:${dictId}:${langOrig}:${langTr}`;
            await idbPut('dictations', {
              key: idbKeyUser,
              userId,
              ...basePayload
            });
            console.log('===DESK_TOGGLE=== idb save user ok', { dictationId: String(dictationId), key: idbKeyUser });

            const idbKeyAnon = `anon:${dictId}:${langOrig}:${langTr}`;
            await idbPut('dictations', {
              key: idbKeyAnon,
              userId: 'anon',
              ...basePayload
            });
            console.log('===DESK_TOGGLE=== idb save anon ok', { dictationId: String(dictationId), key: idbKeyAnon });
          } catch (e) {
            console.log('===DESK_TOGGLE=== idb save failed', { dictationId: String(dictationId), err: (e && e.message) ? e.message : String(e) });
          }

          refreshOfflineCacheStatus();
          completeLoadingIndicator('Диктант добавлен на рабочий стол', 1000);
          console.log('===DESK_TOGGLE=== done ok', { dictationId: String(dictationId) });
        } else {
          const apiMsg = (addData && (addData.error || addData.message))
            ? String(addData.error || addData.message)
            : '';
          console.warn('[toggleDictationOnDesk] add-to-desk failed', { dictationId, addData });
          showToast(apiMsg ? `Не удалось добавить диктант на стол: ${apiMsg}` : 'Ошибка при добавлении диктанта на стол');
        }
      } catch (error) {
        const msg = error && error.message ? error.message : String(error);
        console.error('❌ Ошибка добавления диктанта на стол:', error);
        showToast(`Ошибка при добавлении диктанта на стол: ${msg}`);
        console.log('===DESK_TOGGLE=== failed', { dictationId: String(dictationId), msg });
      } finally {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay || overlay.dataset.autoclosing !== '1') {
          hideLoadingIndicator();
        }
        console.log('===DESK_TOGGLE=== finally', { dictationId: String(dictationId) });
        deskToggleInFlight.delete(key);
      }
    }
  }

  function ensureDeskCacheIndicator() {
    if (document.getElementById('deskCacheIndicator')) return;

    const deskZone = document.querySelector('.desk-zone');
    if (!deskZone) return;

    const el = document.createElement('div');
    el.id = 'deskCacheIndicator';
    el.className = 'desk-cache-indicator';
    el.innerHTML = `
      <div class="desk-cache-text">
        <span id="deskCacheUsedText">0 B</span>
        <span class="desk-cache-sep">/</span>
        <span id="deskCacheMaxText">300 MB</span>
      </div>
      <div class="desk-cache-bar">
        <div id="deskCacheProgressBar" class="desk-cache-bar-fill" style="width:0%;"></div>
      </div>
    `;
    deskZone.appendChild(el);
  }

  // Создает карточку диктанта для публичной библиотеки
  // item - объект с данными диктанта
  // book - объект с данными книги (для проверки, является ли книга своей)
  function createPublicDictationCard(item, book) {
    const d = item;
    const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';
    
    const langOriginal = d.language_original || d.language_code || 'en';
    const langTranslation = d.language_translation || d.language_code || 'en';
    
    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;
    
    // Проверяем, является ли книга своей
    let isOwnBook = false;
    if (window.UM && window.UM.isAuthenticated()) {
      const currentUser = window.UM.getCurrentUser();
      if (currentUser && book && book.creator_user_id) {
        isOwnBook = currentUser.id === book.creator_user_id;
      }
    }
    
    // Проверяем, есть ли книга в библиотеке пользователя
    // Для публичной библиотеки всегда считаем, что книги чужие (кроме своих)
    // Проверку наличия в библиотеке можно добавить через API, но пока используем простую логику
    let isBookInLibrary = false;
    if (!isOwnBook && window.UM && window.UM.isAuthenticated()) {
      // TODO: можно добавить проверку через API /library/api/user-books
      // Пока используем простую логику - если книга не своя, считаем что её нет в библиотеке
      isBookInLibrary = false;
    }
    
    // Кнопки для публичной библиотеки
    const actionButtons = [];
    
    // Кнопка "Взять в работу" - только для чужих книг
    if (!isOwnBook && book && book.id) {
      const notebookIcon = isBookInLibrary ? 'notebook-pen' : 'notebook';
      actionButtons.push(`
        <button class="short-action-btn" data-action="add-to-work" data-dictation-id="${dbId}" data-book-id="${book.id}" title="Взять в работу">
          <i data-lucide="${notebookIcon}"></i>
        </button>
      `);
    }
    
    // Кнопка "Просмотреть диктант" - для всех
    actionButtons.push(`
      <button class="short-action-btn" data-action="view-dictation" data-dictation-id="${dbId}" data-book-id="${book ? book.id : ''}" title="Просмотреть диктант">
        <i data-lucide="eye"></i>
      </button>
    `);
    
    return `
      <div class="short-card" data-dictation-id="${dbId}">
        <div class="short-thumb">
          <img src="${coverUrl}" alt="${d.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
        </div>
        <h3 class="short-title">${d.title || 'Без названия'}</h3>
        <div class="short-id-container">
          <div class="short-sentences-count" title="Количество предложений">
            <i data-lucide="layers"></i><span>${d.sentences_count || 0}</span>
          </div>
          <div class="short-dikt-number">${dictationId}</div>
        </div>
        <div class="short-meta">
          <span class="short-lang-flags">${langOriginal}${langTranslation !== langOriginal ? ' → ' + langTranslation : ''}</span>
          <span class="short-level">${d.level || '—'}</span>
        </div>
        <div class="short-actions">
          ${actionButtons.join('')}
        </div>
      </div>
    `;
  }

  // Создает карточку диктанта (для стола или для книги)
  // item - объект с данными диктанта
  // isDeskCard - true для карточки на столе, false для карточки в книге
  function createDictationCard(item, isDeskCard = false) {
    if (isDeskCard) {
      // Карточка для рабочего стола
      const dictationId = item.dictation_id;
      const dictationIdFormatted = `dict_${dictationId}`;
      const langOriginal = item.language_code || 'en';
      const langTranslation = item.language_translation || item.language_code || 'en';
      const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
      const coverUrl = item.cover_url || `/static/data/covers/cover_${langOriginal || 'en'}.webp`;

      const sentencesCount = typeof item.sentences_count === 'number'
        ? item.sentences_count
        : (parseInt(item.sentences_count, 10) || 0);

      return `
        <div class="short-card desk-card" data-dictation-id="${dictationId}" data-desk-item-id="${item.id}">
          <a class="short-thumb" href="${openUrl}">
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-cover-url="${coverUrl}" alt="" class="short-cover" loading="lazy">
            <div class="card-progress-stats"></div>
          </a>
          <h3 class="short-title">${item.title || 'Без названия'}</h3>
          <div class="short-id-container">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${sentencesCount}</span>
            </div>
            <div class="short-dikt-number">${dictationIdFormatted}</div>
          </div>
          <div class="short-stats" data-dictation-id="${dictationId}">
            <div class="stats-placeholder"></div>
          </div>
          <div class="short-meta">
            <span class="short-lang-flags">${langOriginal}${langTranslation !== langOriginal ? ' → ' + langTranslation : ''}</span>
            <span class="short-level">${item.level || '—'}</span>
            <button class="short-action-btn" data-action="remove-from-desk" data-desk-item-id="${item.id}" data-dictation-id="${dictationId}" title="Убрать со стола">
              <i data-lucide="arrow-big-down-dash"></i>
            </button>
          </div>
        </div>
      `;
    } else {
      // Карточка для книги
      const d = item;
      const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';
      
      // Определяем языки для URL
      const langOriginal = d.language_original || d.language_code || 'en';
      const langTranslation = d.language_translation || d.language_code || 'en';
      
      // ID в формате dict_X для URL
      const dictationId = d.dictation_id || `dict_${d.id}`;
      const dbId = d.db_id || d.id;
      
      // URL для редактирования (используем формат dict_X)
      const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;
      
      // Проверяем, находится ли диктант на столе
      const isOnDesk = isDictationOnDesk(dbId);
      const inWorkIndicator = isOnDesk ? `
        <div class="short-in-work-indicator" title="В работе">
          <i data-lucide="pen-tool"></i>
        </div>
      ` : '';
      
      // Кнопки для карточки в книге (правый нижний угол)
      const actionButtons = `
        <a href="${editUrl}" class="short-action-btn" title="Редактировать">
          <i data-lucide="pencil-ruler"></i>
        </a>
        <button class="short-action-btn" data-action="move-dictation" data-dictation-id="${dbId}" title="Переместить в книгу">
          <i data-lucide="folder-symlink"></i>
        </button>
        <button class="short-action-btn danger" data-action="delete-dictation" data-dictation-id="${dbId}" title="Удалить">
          <i data-lucide="trash-2"></i>
        </button>
      `;
      
      // Медалька будет добавлена асинхронно через updateCompletionBadges
      // Статистика (звезды/полузвезды/микрофон) убрана - она только на столе
      
      return `
        <div class="short-card" data-dictation-id="${dbId}" data-action="toggle-desk">
          <div class="short-thumb">
            <img src="${coverUrl}" alt="${d.title || 'Обложка диктанта'}" loading="lazy" onerror="this.src='/static/data/covers/cover_en.webp'">
            ${inWorkIndicator}
          </div>
          <h3 class="short-title">${d.title || 'Без названия'}</h3>
          <div class="short-id-container">
            <div class="short-sentences-count" title="Количество предложений">
              <i data-lucide="layers"></i><span>${d.sentences_count || 0}</span>
            </div>
            <div class="short-dikt-number">${dictationId}</div>
          </div>
          <div class="short-meta">
            <span class="short-lang-flags">${langOriginal}${langTranslation !== langOriginal ? ' → ' + langTranslation : ''}</span>
            <span class="short-level">${d.level || '—'}</span>
            ${d.author_materials_url ? `<button class="short-action-btn" title="Открыть материалы автора" onclick="event.stopPropagation(); window.open('${d.author_materials_url}', '_blank');">
              <i data-lucide="external-link"></i>
            </button>` : ''}
          </div>
          <div class="short-actions">
            ${actionButtons}
          </div>
        </div>
      `;
    }
  }

  function applyDeskCovers(container) {
    try {
      const imgs = container.querySelectorAll('.desk-card .short-cover[data-cover-url]');
      imgs.forEach(img => {
        if (img.dataset.coverApplied === '1') return;
        const url = img.dataset.coverUrl;
        if (!url) return;
        img.dataset.coverApplied = '1';
        img.src = url;
      });
    } catch (e) {
      console.warn('[desk-render] applyDeskCovers failed', e);
    }
  }

  function getDeskCardPosStorageKey(deskItemId) {
    return `dictafan:desk:pos:${String(deskItemId || '')}`;
  }

  function readDeskCardPos(deskItemId) {
    try {
      const raw = localStorage.getItem(getDeskCardPosStorageKey(deskItemId));
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
  }

  function writeDeskCardPos(deskItemId, x, y) {
    try {
      const payload = { x: Number(x) || 0, y: Number(y) || 0, updatedAt: Date.now() };
      localStorage.setItem(getDeskCardPosStorageKey(deskItemId), JSON.stringify(payload));
    } catch (e) {
    }
  }

  function isDeskFreeLayoutEnabled() {
    try {
      return String(localStorage.getItem('dictafan:desk:layout') || '') === 'free';
    } catch (e) {
      return false;
    }
  }

  function setDeskFreeLayoutEnabled(enabled) {
    try {
      if (enabled) {
        localStorage.setItem('dictafan:desk:layout', 'free');
      } else {
        localStorage.setItem('dictafan:desk:layout', 'grid');
      }
    } catch (e) {
    }
  }

  function updateDeskLayoutToggleButtonState(btn) {
    try {
      if (!btn) return;
      const enabled = isDeskFreeLayoutEnabled();
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.title = enabled
        ? 'Свободный стол: можно таскать карточки'
        : 'Обычный стол: карточки в ряд (таскать нельзя)';

      const iconName = enabled ? 'move' : 'grip-vertical';
      btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }

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
  }

  function ensureDeskLayoutToggleButton() {
    try {
      const palette = document.getElementById('toolPalette');
      if (!palette) return;
      if (document.getElementById('btnDeskFreeLayoutToggle')) return;

      const btn = document.createElement('button');
      btn.id = 'btnDeskFreeLayoutToggle';
      btn.className = 'tool-palette-btn';
      btn.addEventListener('click', () => {
        const enabled = !isDeskFreeLayoutEnabled();
        setDeskFreeLayoutEnabled(enabled);
        updateDeskLayoutToggleButtonState(btn);
        try {
          loadDeskItems();
        } catch (e) {
        }
      });

      const sep = palette.querySelector('.tool-palette-separator');
      if (sep && sep.parentNode === palette) {
        palette.insertBefore(btn, sep);
      } else {
        palette.appendChild(btn);
      }

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }

      updateDeskLayoutToggleButtonState(btn);
    } catch (e) {
    }
  }

  function hasAnyDeskCardPositions(container) {
    try {
      const cards = container.querySelectorAll('.desk-card[data-desk-item-id]');
      for (const card of cards) {
        const deskItemId = card.getAttribute('data-desk-item-id');
        if (!deskItemId) continue;
        if (readDeskCardPos(deskItemId)) return true;
      }
    } catch (e) {
    }
    return false;
  }

  function enableDeskFreeLayout(container) {
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
        const pos = deskItemId ? readDeskCardPos(deskItemId) : null;

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
      console.warn('[desk-render] enableDeskFreeLayout failed', e);
      return null;
    }
  }

  function installDeskDragAndDrop(container) {
    try {
      const grid = container.querySelector('.shorts-grid');
      if (!grid) return;
      if (grid.dataset.deskDndInstalled === '1') return;
      if (grid.dataset.deskLayoutMode !== 'free') return;
      grid.dataset.deskDndInstalled = '1';

      let dragging = null;

      const onPointerDown = (e) => {
        try {
          if (!e || e.button !== undefined && e.button !== 0) return;
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
            pointerId: e.pointerId
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
                try { dragging.card.setPointerCapture(dragging.pointerId); } catch (err) {}
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
          writeDeskCardPos(dragging.deskItemId, x, y);
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
      console.warn('[desk-render] installDeskDragAndDrop failed', e);
    }
  }

  function renderDeskCards(items) {
    const container = document.getElementById("deskCardsContainer");
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
      return;
    }

    const t0 = performance.now();

    // Очищаем контейнер перед рендерингом, чтобы избежать дублирования
    container.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = 'shorts-grid';
    
    items.forEach(item => {
      const cardHtml = createDictationCard(item, true); // true = карточка для стола
      grid.insertAdjacentHTML('beforeend', cardHtml);
    });
    
    container.appendChild(grid);

    const t1 = performance.now();
    console.log('[desk-render] stage1 cards (no covers/reports):', Math.round(t1 - t0), 'ms', 'items:', items.length);

    // Обновляем иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      lucide.createIcons();
    }

    ensureDeskLayoutToggleButton();

    if (isDeskFreeLayoutEnabled() || hasAnyDeskCardPositions(container)) {
      enableDeskFreeLayout(container);
      installDeskDragAndDrop(container);
    }

    requestAnimationFrame(() => {
      const t2Start = performance.now();
      applyDeskCovers(container);
      const t2End = performance.now();
      console.log('[desk-render] stage2 covers applied:', Math.round(t2End - t2Start), 'ms');

      setTimeout(async () => {
        const t3Start = performance.now();
        try {
          updateDictationCardsStats(container);
          await updateCompletionBadges(container);
        } finally {
          const t3End = performance.now();
          console.log('[desk-render] stage3 reports (stats/badges):', Math.round(t3End - t3Start), 'ms');
        }
      }, 0);
    });

    ensureDeskCacheIndicator();
  }


  // ==================== ЗОНА 2: Список книг ====================
  
  async function loadBooks() {
    try {
      const response = await fetch('/');
      // Здесь нужно получить данные из серверного рендера или через API
      // Пока используем существующий endpoint
      await loadBooksFromAPI();
    } catch (error) {
      console.error("Ошибка загрузки книг:", error);
    }
  }

  async function loadBooksFromAPI() {
    // Временно: загружаем книги через существующую логику
    // TODO: создать отдельный API endpoint для получения всех книг
    try {
      const token = getToken();
      if (!token) {
        console.warn("⚠️ Нет токена для загрузки книг");
        return;
      }
      
      const response = await fetch('/library/api/user-books', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📦 Данные книг получены от API:', data);
        if (data.success) {
          renderBooksList(data.own_books, data.shelf_books);
        } else {
          console.error("❌ Ошибка загрузки книг:", data.error);
        }
      } else {
        const errorText = await response.text();
        console.error("❌ Ошибка загрузки книг:", response.status, errorText);
        if (response.status === 401 || response.status === 422) {
          // Токен невалидный, нужно авторизоваться
          if (window.UM) {
            window.UM.requireAuth();
          }
        }
      }
    } catch (error) {
      console.error("❌ Ошибка загрузки книг:", error);
    }
  }

  function renderBooksList(ownBooks, shelfBooks) {
    const container = document.getElementById("booksList");
    if (!container) return;

    const allBooks = [
      ...(ownBooks || []).map(book => ({ ...book, isOwn: true })),
      ...(shelfBooks || []).map(book => ({ ...book, isOwn: false }))
    ];

    if (allBooks.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Нет книг</div>';
      return;
    }

    container.innerHTML = allBooks.map(book => createMiniBookCard(book)).join('');

    // Обработчики событий
    container.querySelectorAll('.book-card-mini').forEach(card => {
      const bookId = parseInt(card.getAttribute('data-book-id'));
      const book = allBooks.find(b => b.id === bookId);
      
      // Одиночный клик - выделить
      card.addEventListener('click', (e) => {
        setActiveBook(bookId);
      });
      
      // Двойной клик - открыть зону 3
      card.addEventListener('dblclick', (e) => {
        setActiveBook(bookId);
        openActiveBookZone(book);
      });
    });
  }

  function createMiniBookCard(book) {
    const foreignClass = book.isOwn ? '' : 'foreign';
    const activeClass = activeBookId === book.id ? 'active' : '';
    
    // Формируем URL аватара создателя
    let creatorAvatarHtml = '';
    if (book.creator_user_id) {
      const avatarUrl = `/user/api/avatar?user_id=${book.creator_user_id}&size=small&t=${Date.now()}`;
      creatorAvatarHtml = `<img src="${avatarUrl}" alt="Creator" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`;
    } else {
      creatorAvatarHtml = '<i data-lucide="user"></i>';
    }
    
    const creatorName = book.creator_username || 'Неизвестный';
    
    // Формируем HTML обложки
    let coverHtml;
    if (book.cover_url) {
      coverHtml = `<img class="book-card-mini-cover" src="${withCacheBust(book.cover_url)}" alt="${book.title}">`;
    } else {
      coverHtml = `<div class="book-card-mini-cover-placeholder"><i data-lucide="book"></i></div>`;
    }
    
    return `
      <div class="book-card-mini ${foreignClass} ${activeClass}" data-book-id="${book.id}">
        <div class="book-card-mini-cover-wrapper">
          ${coverHtml}
          <div class="book-card-mini-creator-bar">
            <div class="book-card-mini-creator">
              ${creatorAvatarHtml}
            </div>
            <div class="book-card-mini-creator-name">${creatorName}</div>
          </div>
        </div>
        <div class="book-card-mini-title">${book.title}</div>
      </div>
    `;
  }

  function setActiveBook(bookId) {
    activeBookId = bookId;
    
    // Обновляем выделение в списке
    document.querySelectorAll('.book-card-mini').forEach(card => {
      if (parseInt(card.getAttribute('data-book-id')) === bookId) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  // ==================== ЗОНА 3: Активная книга ====================
  
  async function openActiveBookZone(book) {
    const zone = document.getElementById("activeBookZone");
    if (!zone) return;

    zone.style.display = 'flex';
    
    // Показываем разделитель и добавляем класс для изменения стилей
    const libraryContent = document.querySelector('.library-content');
    const resizer = document.getElementById('zoneResizer');
    if (libraryContent) {
      libraryContent.classList.add('has-active-book');
    }
    if (resizer) {
      resizer.style.display = 'block';
    }
    
    // Загружаем информацию о книге
    const bookId = book.id || book;
    const isWorkbook = book.is_workbook || false;
    await loadActiveBook(bookId, isWorkbook);
    
    // Обновляем иконки
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  function closeActiveBookZone() {
    const zone = document.getElementById("activeBookZone");
    if (zone) {
      zone.style.display = 'none';
      activeBookId = null;
      activeBookIsWorkbook = false;
      
      // Скрываем разделитель и убираем класс
      const libraryContent = document.querySelector('.library-content');
      const resizer = document.getElementById('zoneResizer');
      if (libraryContent) {
        libraryContent.classList.remove('has-active-book');
      }
      if (resizer) {
        resizer.style.display = 'none';
      }
      
      // Убираем выделение
      document.querySelectorAll('.book-card-mini').forEach(card => {
        card.classList.remove('active');
      });
    }
  }

  async function loadActiveBook(bookId, isWorkbook = false) {
    try {
      activeBookIsWorkbook = !!isWorkbook;
      // Загружаем информацию о книге
      const bookData = await apiRequest(`/library/api/book/${bookId}`);
      
      if (bookData.success && bookData.book) {
        renderActiveBookCard(bookData.book, isWorkbook);
      }
      
      let sections = [];
      let dictations = [];
      
      if (isWorkbook) {
        // Для рабочей тетради загружаем бесхозные диктанты
        const orphanData = await apiRequest(`/library/api/orphan-dictations`);
        dictations = orphanData.success ? orphanData.dictations : [];
      } else {
        // Для обычных книг загружаем разделы и диктанты
        const sectionsData = await apiRequest(`/library/api/book/${bookId}/sections`);
        const dictationsData = await apiRequest(`/library/api/book/${bookId}/dictations`);
        
        sections = sectionsData.success ? sectionsData.sections : [];
        dictations = dictationsData.success ? dictationsData.dictations : [];
        
        console.log('📚 Загружены разделы:', sections);
        sections.forEach(s => {
          console.log(`  - Раздел ${s.id}: "${s.title}", section_number: ${s.section_number}`);
        });
        
        // Сохраняем разделы в глобальной переменной для доступа при редактировании
        window.currentBookSections = sections;
      }
      
      renderBookContent(sections, dictations, isWorkbook);
    } catch (error) {
      console.error("Ошибка загрузки активной книги:", error);
    }
  }

  function renderBookContent(sections, dictations, isWorkbook = false) {
    const container = document.getElementById("bookStructure");
    if (!container) return;

    if ((!sections || sections.length === 0) && (!dictations || dictations.length === 0)) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этой книге нет разделов и диктантов</div>';
      return;
    }

    let html = '';

    if (!isWorkbook && sections && sections.length > 0) {
      html += '<div class="book-structure-list">';
      sections.forEach(section => {
        const sectionNumber = section.section_number ? `§ ${section.section_number}. ` : '§ ';

        html += `
          <div class="structure-item structure-section" data-section-id="${section.id}">
            <div class="structure-item-header">
              <button class="structure-item-toggle" data-section-id="${section.id}" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
              <span class="structure-item-title">${sectionNumber}${section.title}</span>
              <button class="structure-item-actions" data-action="section-actions" data-section-id="${section.id}" title="Действия">
                <i data-lucide="more-horizontal"></i>
              </button>
              <div class="section-actions-menu" data-section-id="${section.id}" style="display: none;">
                <button class="dropdown-menu-item" data-action="add-subsection" data-section-id="${section.id}">
                  <i data-lucide="folder-plus"></i><span>Добавить подраздел</span>
                </button>
                <button class="dropdown-menu-item" data-action="add-dictation" data-section-id="${section.id}">
                  <i data-lucide="plus"></i><span>Добавить диктант</span>
                </button>
                <button class="dropdown-menu-item" data-action="edit-section" data-section-id="${section.id}">
                  <i data-lucide="edit-3"></i><span>Редактировать</span>
                </button>
                <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-section" data-section-id="${section.id}">
                  <i data-lucide="trash-2"></i><span>Удалить</span>
                </button>
              </div>
            </div>
            <div class="structure-item-content" data-section-content-id="${section.id}" style="display: none;">
              <div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    if (dictations && dictations.length > 0) {
      html += '<div class="shorts-grid">';
      dictations.forEach(d => {
        html += createDictationCard(d, false);
      });
      html += '</div>';
    }

    container.innerHTML = html;

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    setTimeout(() => {
      updateCompletionBadges(container);
    }, 100);
  }

  async function loadSectionForEdit(sectionId) {
    try {
      console.log('📚 Загружаю раздел для редактирования:', sectionId);
      const sectionData = await apiRequest(`/library/api/book/${sectionId}`);
      if (sectionData.success && sectionData.book) {
        console.log('📚 Данные раздела загружены:', sectionData.book);
        openSectionModal(sectionData.book, sectionData.book.parent_id);
      } else {
        // Если не получилось загрузить через API, ищем в текущих разделах
        const sections = window.currentBookSections || [];
        const section = sections.find(s => s.id === parseInt(sectionId));
        if (section) {
          console.log('📚 Раздел найден в текущих разделах:', section);
          openSectionModal(section, section.parent_id);
        } else {
          console.error('📚 Раздел не найден');
          showToast("Не удалось загрузить данные раздела", "error");
        }
      }
    } catch (error) {
      console.error("Ошибка загрузки раздела для редактирования:", error);
      showToast("Ошибка загрузки раздела", "error");
    }
  }

  function renderActiveBookCard(book, targetContainer = null) {
    const container = targetContainer || document.getElementById("activeBookCard");
    if (!container) return;

    console.log('📖 Рендерю большую карточку книги:', {
      id: book.id,
      title: book.title,
      creator_user_id: book.creator_user_id,
      creator_username: book.creator_username
    });

    const avatarUrl = book.creator_user_id 
      ? `/user/api/avatar?user_id=${book.creator_user_id}&size=small&t=${Date.now()}`
      : '';
    // Проверяем все возможные варианты имени создателя
    const creatorName = book.creator_username || 
                        (book.creator_user_id ? 'Загрузка...' : 'Неизвестный') || 
                        'Неизвестный';
    
    console.log('👤 Имя создателя:', creatorName);
    console.log('👤 book.creator_username:', book.creator_username);
    console.log('👤 book.creator_user_id:', book.creator_user_id);
    console.log('👤 Все поля book:', Object.keys(book));
    
    // Если creator_user_id отсутствует, пытаемся найти его в массиве publicBooks
    let finalCreatorUserId = book.creator_user_id;
    if (!finalCreatorUserId && book.id && typeof publicBooks !== 'undefined') {
      const bookFromList = publicBooks.find(b => b.id === book.id);
      if (bookFromList && bookFromList.creator_user_id) {
        finalCreatorUserId = bookFromList.creator_user_id;
        book.creator_user_id = finalCreatorUserId;
        console.log('👤 Найден creator_user_id из списка:', finalCreatorUserId);
      }
    }
    
    // Используем обновленный avatarUrl или исходный
    const finalAvatarUrl = finalCreatorUserId 
      ? `/user/api/avatar?user_id=${finalCreatorUserId}&size=small&t=${Date.now()}`
      : '';

    // Если есть ссылка на материалы автора, делаем картинку кликабельной
    const coverImage = book.cover_url 
      ? `<img src="${withCacheBust(book.cover_url)}" alt="${book.title}">`
      : `<div class="book-card-max-cover-placeholder"><i data-lucide="book-open"></i></div>`;
    
    const coverContent = book.author_materials_url
      ? `<a href="${book.author_materials_url}" target="_blank" title="${book.author_materials_url}" style="display: block; width: 100%; height: 100%;">${coverImage}</a>`
      : coverImage;
    
    // Индикатор видимости (перемещен в заголовок, перед названием)
    const isPublic = book.visibility === 'public' || book.is_public === true;
    const visibilityBadge = `
      <div class="book-card-max-visibility-badge" title="${isPublic ? 'Публичная книга (видна всем)' : 'Вижу только я'}">
        <i data-lucide="${isPublic ? 'globe' : 'home'}"></i>
      </div>
    `;
    
    // Кнопка закрытия книги
    const closeButton = `
      <button class="book-card-max-close-btn" id="btnCloseActiveBook" title="Закрыть книгу">
        <i data-lucide="arrow-left-to-line"></i>
      </button>
    `;
    
    container.innerHTML = `
      <div class="book-card-max">
        ${closeButton}
        <div class="book-card-max-cover-wrapper">
          <div class="book-card-max-cover" ${book.author_materials_url ? 'style="cursor: pointer;"' : ''}>
            ${coverContent}
          </div>
          <div class="book-card-max-creator">
            <div class="book-card-max-creator-avatar">
              ${finalAvatarUrl 
                ? `<img src="${finalAvatarUrl}" alt="${creatorName}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">` 
                : '<i data-lucide="user"></i>'
              }
            </div>
            <div class="book-card-max-creator-name">${creatorName}</div>
          </div>
        </div>
        <div class="book-card-max-info">
          <div class="book-card-max-header">
            <div class="book-card-max-header-left">
              ${visibilityBadge}
              <div class="book-card-max-title-author-wrapper">
                <h2 class="book-card-max-title">${book.title}</h2>
                ${book.author_text ? `<p class="book-card-max-author">${book.author_text}</p>` : ''}
              </div>
            </div>
          </div>
          ${book.short_description ? `<p class="book-card-max-description">${book.short_description}</p>` : ''}
          <div class="book-card-max-actions">
            <div class="dropdown-menu-wrapper">
              <button class="book-card-max-btn dropdown-toggle" id="btnBookActions" title="Действия">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu" id="bookActionsMenu" style="display: none;">
                <button class="dropdown-menu-item" data-action="add-section">
                  <i data-lucide="plus"></i>
                  <span>Добавить раздел</span>
                </button>
                <button class="dropdown-menu-item" data-action="add-dictation">
                  <i data-lucide="plus"></i>
                  <span>Добавить диктант</span>
                </button>
                <button class="dropdown-menu-item" data-action="edit-book">
                  <i data-lucide="edit-3"></i>
                  <span>Редактировать книгу</span>
                </button>
                <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-book">
                  <i data-lucide="trash-2"></i>
                  <span>Удалить книгу</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Обработчик кнопки закрытия книги
    const closeBtn = document.getElementById("btnCloseActiveBook");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeActiveBookZone();
      });
    }

    // Обработчики выпадающего меню действий книги
    const bookActionsBtn = document.getElementById("btnBookActions");
    const bookActionsMenu = document.getElementById("bookActionsMenu");
    
    if (bookActionsBtn && bookActionsMenu) {
      // Открытие/закрытие меню
      bookActionsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Закрываем все другие меню
        document.querySelectorAll('.section-actions-menu').forEach(m => {
          m.classList.remove('show');
          m.style.display = 'none';
        });
        
        const isVisible = bookActionsMenu.classList.contains('show');
        if (isVisible) {
          bookActionsMenu.classList.remove('show');
          bookActionsMenu.style.display = 'none';
        } else {
          bookActionsMenu.classList.add('show');
          bookActionsMenu.style.display = 'block';
          
          // Закрываем меню при клике вне его
          setTimeout(() => {
            const closeMenuHandler = function(e) {
              if (!bookActionsMenu.contains(e.target) && !bookActionsBtn.contains(e.target)) {
                bookActionsMenu.classList.remove('show');
                bookActionsMenu.style.display = 'none';
                document.removeEventListener('click', closeMenuHandler);
              }
            };
            document.addEventListener('click', closeMenuHandler);
          }, 0);
        }
      });
      
      // Обработчики пунктов меню
      bookActionsMenu.addEventListener("click", (e) => {
        const item = e.target.closest('.dropdown-menu-item');
        if (!item) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const action = item.getAttribute('data-action');
        bookActionsMenu.classList.remove('show');
        bookActionsMenu.style.display = 'none';
        
        switch(action) {
          case 'add-section':
            openSectionModal(null, activeBookId);
            break;
          case 'add-dictation':
            if (activeBookId) {
              setDictationTargetBook(activeBookId);
            }
            window.location.href = '/dictation_editor/new';
            break;
          case 'edit-book':
            openBookModal(book);
            break;
          case 'delete-book':
            if (confirm(`Вы уверены, что хотите удалить книгу "${book.title}"?`)) {
              deleteBook(book.id);
            }
            break;
        }
      });
    }

    // Обновляем иконки
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  async function toggleSection(sectionId) {
    console.log('🔄 toggleSection вызвана для раздела:', sectionId);
    const sectionItem = document.querySelector(`.structure-section[data-section-id="${sectionId}"]`);
    if (!sectionItem) {
      console.error('❌ Раздел не найден в DOM:', sectionId);
      return;
    }

    const toggleBtn = sectionItem.querySelector('.structure-item-toggle');
    const contentDiv = sectionItem.querySelector(`.structure-item-content[data-section-content-id="${sectionId}"]`);
    
    console.log('🔍 Элементы раздела:', { 
      sectionItem: !!sectionItem, 
      toggleBtn: !!toggleBtn, 
      contentDiv: !!contentDiv
    });
    
    if (!contentDiv) {
      console.error('❌ contentDiv не найден для раздела:', sectionId);
      return;
    }
    if (!toggleBtn) {
      console.error('❌ toggleBtn не найден для раздела:', sectionId);
      return;
    }

    const isExpanded = contentDiv.style.display !== 'none';
    
    // Ищем иконку - может быть внутри кнопки или как дочерний элемент
    let icon = toggleBtn.querySelector('i[data-lucide]');
    if (!icon) {
      // Если иконка не найдена, создаем её
      icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'chevron-right');
      toggleBtn.innerHTML = '';
      toggleBtn.appendChild(icon);
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
    
    if (isExpanded) {
      // Сворачиваем
      contentDiv.style.display = 'none';
      icon.setAttribute('data-lucide', 'chevron-right');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      // Раскрываем и загружаем диктанты
      contentDiv.style.display = 'block';
      icon.setAttribute('data-lucide', 'chevron-down');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      // Проверяем, загружены ли уже диктанты
      const existingContent = contentDiv.querySelector('.section-dictations-grid, .section-dictations-empty');
      if (!existingContent || existingContent.classList.contains('section-dictations-loading')) {
        await loadSectionDictations(sectionId, contentDiv);
      }
    }
  }

  async function loadSectionDictations(sectionId, container) {
    try {
      console.log('📚 Загружаю диктанты для раздела:', sectionId);
      console.log('📚 URL запроса:', `/library/api/book/${sectionId}/dictations`);
      const dictationsData = await apiRequest(`/library/api/book/${sectionId}/dictations`);
      console.log('📚 Полный ответ API для раздела', sectionId, ':', JSON.stringify(dictationsData, null, 2));
      const dictations = dictationsData.success ? dictationsData.dictations : [];
      console.log('📚 Загружено диктантов:', dictations.length);
      if (dictations.length > 0) {
        console.log('📚 Список диктантов:', dictations.map(d => ({ id: d.id, title: d.title })));
      }
      
      // Удаляем индикатор загрузки
      const loadingDiv = container.querySelector('.section-dictations-loading');
      if (loadingDiv) {
        loadingDiv.remove();
      }
      
      if (dictations.length === 0) {
        console.log('📚 Раздел пуст, показываю сообщение');
        container.innerHTML = '<div class="section-dictations-empty" style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этом разделе нет диктантов</div>';
      } else {
        console.log('📚 Рендерю', dictations.length, 'диктантов');
        let html = '<div class="section-dictations-grid shorts-grid">';
        dictations.forEach(d => {
          html += createDictationCard(d, false); // false = карточка для книги
        });
        html += '</div>';
        container.innerHTML = html;
        
        // Создаём иконки Lucide для новых карточек
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        
        // Загружаем статистику и медальки для карточек диктантов
        setTimeout(() => {
          // Статистика (звезды/полузвезды/микрофон) только на столе, не в библиотеке
          updateCompletionBadges(container); // Медальки остаются
        }, 100);
      }
    } catch (error) {
      console.error("Ошибка загрузки диктантов раздела:", error);
      container.innerHTML = '<div class="section-dictations-error" style="padding: 20px; text-align: center; color: var(--color-error);">Ошибка загрузки диктантов</div>';
    }
  }


  function renderDictationsAsCards(dictations, container) {
    container.innerHTML = `
      <div class="shorts-grid">
        ${dictations.map(d => `
          <div class="short-card" data-dictation-id="${d.id}">
            <div class="short-title">${d.title}</div>
            <div class="short-meta">
              <span>Язык: ${d.language_code || ''}</span>
              ${d.level ? `<span>Уровень: ${d.level}</span>` : ''}
            </div>
            <div class="short-actions">
              <a href="/editor/${d.id}" class="btn-outline">Открыть</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderDictationsAsList(dictations, container) {
    container.innerHTML = `
      <ul class="dictations-list">
        ${dictations.map(d => `
          <li class="dictation-list-item">
            <span class="dictation-list-title">${d.title}</span>
            <span class="dictation-list-meta">${d.language_code || ''} ${d.level ? `• ${d.level}` : ''}</span>
            <a href="/editor/${d.id}" class="btn-outline">Открыть</a>
          </li>
        `).join('')}
      </ul>
    `;
  }

  // ==================== Модальное окно книги ====================

  function openBookModal(book) {
    // Очищаем предыдущий cropped blob
    croppedImageBlob = null;
    
    const modal = document.getElementById("book-edit-modal");
    const titleEl = document.getElementById("book-edit-title");
    const idInput = document.getElementById("book-id-input");
    const titleInput = document.getElementById("book-title-input");
    const authorInput = document.getElementById("book-author-text-input");
    const themeInput = document.getElementById("book-theme-input");
    const visibilityInput = document.getElementById("book-visibility-input");
    const descInput = document.getElementById("book-description-input");
    const authorMaterialsUrlInput = document.getElementById("book-author-materials-url-input");
    const coverPreview = document.getElementById("book-cover-preview");
    const coverPlaceholder = document.getElementById("book-cover-placeholder");
    const coverUploadInput = document.getElementById("book-cover-upload");

    if (!modal) return;

    if (book) {
      titleEl.textContent = "Редактирование книги";
      idInput.value = book.id;
      titleInput.value = book.title || "";
      authorInput.value = book.author_text || "";
      themeInput.value = book.theme || "";
      visibilityInput.value = book.visibility || "private";
      descInput.value = book.short_description || "";
      if (authorMaterialsUrlInput) {
        authorMaterialsUrlInput.value = book.author_materials_url || "";
      }
      
      if (book.cover_url) {
        coverPreview.src = book.cover_url;
        coverPreview.style.display = "block";
        coverPlaceholder.style.display = "none";
      } else {
        coverPreview.style.display = "none";
        coverPlaceholder.style.display = "flex";
      }
    } else {
      titleEl.textContent = "Новая книга";
      idInput.value = "";
      titleInput.value = "";
      authorInput.value = "";
      themeInput.value = "";
      visibilityInput.value = "private";
      descInput.value = "";
      if (authorMaterialsUrlInput) {
        authorMaterialsUrlInput.value = "";
      }
      coverPreview.style.display = "none";
      coverPlaceholder.style.display = "flex";
      coverPreview.src = "";
      if (coverUploadInput) {
        coverUploadInput.value = "";
      }
    }

    modal.style.display = "flex";
    modal.classList.add("show");
    
    initBookLanguageSelector(book ? book.original_language : null);
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  function closeBookModal() {
    const modal = document.getElementById("book-edit-modal");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("show");
    }
  }

  // ==================== Модальное окно раздела ====================

  async function openSectionModal(section, parentId) {
    const modal = document.getElementById("section-edit-modal");
    const titleEl = document.getElementById("section-edit-title");
    const idInput = document.getElementById("section-id-input");
    const parentIdInput = document.getElementById("section-parent-id-input");
    const numberInput = document.getElementById("section-number-input");
    const titleInput = document.getElementById("section-title-input");

    if (!modal) return;

    if (section) {
      // Редактирование существующего раздела
      titleEl.textContent = "Редактирование раздела";
      idInput.value = section.id;
      parentIdInput.value = section.parent_id || '';
      numberInput.value = section.section_number || '';
      titleInput.value = section.title || "";
    } else {
      // Создание нового раздела
      titleEl.textContent = "Новый раздел";
      idInput.value = "";
      parentIdInput.value = parentId || activeBookId;
      titleInput.value = "";
      
      // Автоматически определяем номер для нового раздела
      const bookId = parentId || activeBookId;
      if (bookId) {
        try {
          const sectionsData = await apiRequest(`/library/api/book/${bookId}/sections`);
          const sections = sectionsData.success ? sectionsData.sections : [];
          
          if (sections.length === 0) {
            // Первый раздел - номер 1
            numberInput.value = "1";
          } else {
            // Находим максимальный номер и прибавляем 1
            const maxNumber = Math.max(
              ...sections
                .map(s => s.section_number)
                .filter(n => n !== null && n !== undefined)
                .concat([0]) // Если все номера null, начинаем с 0
            );
            numberInput.value = String(maxNumber + 1);
          }
        } catch (error) {
          console.error("Ошибка загрузки разделов для определения номера:", error);
          // В случае ошибки ставим 1
          numberInput.value = "1";
        }
      } else {
        numberInput.value = "1";
      }
    }

    modal.style.display = "flex";
    modal.classList.add("show");
    titleInput.focus();
  }

  function closeSectionModal() {
    const modal = document.getElementById("section-edit-modal");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("show");
    }
  }

  async function handleSaveSection(event) {
    event.preventDefault();

    const idInput = document.getElementById("section-id-input");
    const parentIdInput = document.getElementById("section-parent-id-input");
    const numberInput = document.getElementById("section-number-input");
    const titleInput = document.getElementById("section-title-input");

    const sectionId = idInput.value ? parseInt(idInput.value, 10) : null;
    const parentId = parseInt(parentIdInput.value, 10);
    const sectionNumber = numberInput.value ? parseInt(numberInput.value, 10) : null;

    if (!titleInput.value.trim()) {
      showToast("Введите название раздела");
      return;
    }

    showLoadingIndicator("Сохранение раздела...");
    
    try {
      const payload = {
        title: titleInput.value.trim(),
        parent_id: parentId,
        section_number: sectionNumber,
        // Разделы не имеют обложек, авторов и описаний
        author_text: null,
        short_description: null,
        original_language: null,
        visibility: 'private',
        theme: null,
        order_index: 0
      };

      console.log('💾 Сохраняю раздел с payload:', payload);
      console.log('💾 section_number в payload:', payload.section_number, 'тип:', typeof payload.section_number);

      let data;
      if (sectionId) {
        // Обновление раздела
        data = await apiRequest(`/library/api/book/${sectionId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        // Создание нового раздела
        data = await apiRequest("/library/api/book", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (!data.success) {
        hideLoadingIndicator();
        showToast(data.error || "Ошибка сохранения раздела");
        return;
      }

      console.log('✅ Раздел сохранен, ответ сервера:', data);
      if (data.book) {
        console.log('📚 Сохраненный раздел:', data.book);
        console.log('📚 section_number:', data.book.section_number);
      }

      closeSectionModal();
      
      // Перезагружаем активную книгу чтобы показать новые разделы
      if (activeBookId) {
        console.log('🔄 Перезагружаю активную книгу:', activeBookId);
        await loadActiveBook(activeBookId);
      }
      
      hideLoadingIndicator();
    } catch (error) {
      console.error("Ошибка сохранения раздела:", error);
      hideLoadingIndicator();
      showToast("Ошибка сохранения раздела");
    }
  }

  // ==================== Crop Modal ====================
  
  function handleCoverSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Проверяем, что это изображение
    if (!file.type.startsWith('image/')) {
      showToast('Пожалуйста, выберите изображение');
      return;
    }
    
    // Открываем crop modal
    const reader = new FileReader();
    reader.onload = (e) => {
      openCropModal(e.target.result);
    };
    reader.readAsDataURL(file);
  }
  
  function openCropModal(imageSrc) {
    const modal = document.getElementById("crop-modal");
    const image = document.getElementById("crop-image");
    
    if (!modal || !image) return;
    
    // Устанавливаем изображение
    image.src = imageSrc;
    
    // Показываем модальное окно
    modal.style.display = "flex";
    modal.classList.add("show");
    
    // Уничтожаем предыдущий cropper если есть
    if (cropper) {
      cropper.destroy();
    }
    
    // Инициализируем cropper с квадратным crop box 200x200
    cropper = new Cropper(image, {
      aspectRatio: 1, // Квадрат
      viewMode: 2,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      minCropBoxWidth: 100,
      minCropBoxHeight: 100,
    });
  }
  
  function closeCropModal(clearBlob = true) {
    const modal = document.getElementById("crop-modal");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("show");
    }
    
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    
    // Очищаем blob только при отмене, НЕ при применении
    if (clearBlob) {
      croppedImageBlob = null;
      
      // Очищаем input только при отмене
      const coverUploadInput = document.getElementById("book-cover-upload");
      if (coverUploadInput) {
        coverUploadInput.value = '';
      }
    }
  }
  
  function handleCropConfirm() {
    if (!cropper) return;
    
    // Получаем canvas с обрезанным изображением (200x200)
    const canvas = cropper.getCroppedCanvas({
      width: 200,
      height: 200,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });
    
    if (!canvas) {
      showToast('Ошибка обрезки изображения');
      return;
    }
    
    // Конвертируем canvas в blob (webp)
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('Ошибка создания изображения');
        return;
      }
      
      croppedImageBlob = blob;
      
      // Показываем preview в модальном окне книги
      const preview = document.getElementById("book-cover-preview");
      const placeholder = document.getElementById("book-cover-placeholder");
      
      if (preview && placeholder) {
        const url = URL.createObjectURL(blob);
        preview.src = url;
        preview.style.display = "block";
        placeholder.style.display = "none";
      }
      
      // Закрываем crop modal БЕЗ очистки blob
      closeCropModal(false);
      
      showToast('Обложка готова к сохранению');
    }, 'image/webp', 0.95);
  }

  function initBookLanguageSelector(selectedLanguage) {
    const container = document.getElementById("book-language-selector");
    if (!container) return;

    container.innerHTML = '';

    const initSelector = () => {
      if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
        setTimeout(initSelector, 100);
        return;
      }

      const languageData = window.LanguageManager.getLanguageData();
      if (!languageData) {
        console.warn("Данные языков недоступны");
        return;
      }

      const defaultLanguage = selectedLanguage || (window.USER_LANGUAGE_DATA?.nativeLanguage) || 'en';

      if (typeof window.initLanguageSelector === 'function') {
        bookLanguageSelector = window.initLanguageSelector('book-language-selector', {
          mode: 'native-selector',
          nativeLanguage: defaultLanguage,
          languageData: languageData,
          onLanguageChange: function(values) {}
        });
      }
    };

    initSelector();
  }

  function handleCoverUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Выберите изображение");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const coverPreview = document.getElementById("book-cover-preview");
      const coverPlaceholder = document.getElementById("book-cover-placeholder");
      if (coverPreview && coverPlaceholder) {
        coverPreview.src = e.target.result;
        coverPreview.style.display = "block";
        coverPlaceholder.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveBook(event) {
    event.preventDefault();

    const idInput = document.getElementById("book-id-input");
    const titleInput = document.getElementById("book-title-input");
    const authorInput = document.getElementById("book-author-text-input");
    const themeInput = document.getElementById("book-theme-input");
    const visibilityInput = document.getElementById("book-visibility-input");
    const descInput = document.getElementById("book-description-input");
    const authorMaterialsUrlInput = document.getElementById("book-author-materials-url-input");
    const coverUploadInput = document.getElementById("book-cover-upload");

    const bookId = idInput.value ? parseInt(idInput.value, 10) : null;

    if (!titleInput.value.trim()) {
      showToast("Введите название книги");
      return;
    }

    let originalLanguage = '';
    if (bookLanguageSelector && typeof bookLanguageSelector.getValues === 'function') {
      const values = bookLanguageSelector.getValues();
      originalLanguage = values.nativeLanguage || '';
    }

    showLoadingIndicator("Сохранение книги...");

    try {
      let data;
      const token = getToken();
      
      // Используем cropped blob если есть, иначе оригинальный файл
      const hasCover = croppedImageBlob || coverUploadInput?.files[0];
      
      if (hasCover) {
          const formData = new FormData();
          formData.append("title", titleInput.value.trim());
          formData.append("author_text", authorInput.value.trim());
          formData.append("original_language", originalLanguage);
          formData.append("theme", themeInput.value.trim());
          formData.append("visibility", visibilityInput.value);
          formData.append("short_description", descInput.value.trim());
          if (authorMaterialsUrlInput) {
            formData.append("author_materials_url", authorMaterialsUrlInput.value.trim());
          }
        
        // Используем cropped blob или оригинальный файл
        if (croppedImageBlob) {
          formData.append("cover", croppedImageBlob, "cover.webp");
        } else {
          formData.append("cover", coverUploadInput.files[0]);
        }

        const headers = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        if (bookId) {
          const response = await fetch(`/library/api/book/${bookId}`, {
            method: "PATCH",
            headers,
            body: formData,
          });
          data = await response.json();
        } else {
          const response = await fetch("/library/api/book", {
            method: "POST",
            headers,
            body: formData,
          });
          data = await response.json();
        }
      } else {
        const payload = {
          title: titleInput.value.trim(),
          author_text: authorInput.value.trim(),
          original_language: originalLanguage,
          theme: themeInput.value.trim(),
          visibility: visibilityInput.value,
          short_description: descInput.value.trim(),
        };
        
        if (authorMaterialsUrlInput) {
          payload.author_materials_url = authorMaterialsUrlInput.value.trim() || null;
        }

        if (bookId) {
          data = await apiRequest(`/library/api/book/${bookId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        } else {
          data = await apiRequest("/library/api/book", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }

      if (!data.success) {
        hideLoadingIndicator();
        showToast(data.error || "Ошибка сохранения книги");
        return;
      }

      // Очищаем cropped blob
      croppedImageBlob = null;
      
      closeBookModal();
      // Перезагружаем список книг
      await loadBooksFromAPI();
      
      // Если это активная книга, обновляем её
      if (bookId && bookId === activeBookId) {
        await loadActiveBook(bookId);
      }
      
      hideLoadingIndicator();
    } catch (error) {
      console.error("Ошибка сохранения книги:", error);
      hideLoadingIndicator();
      showToast("Ошибка сохранения книги");
    }
  }

  // ==================== Разделитель между зонами ====================
  
  function initZoneResizer() {
    const resizer = document.getElementById('zoneResizer');
    const booksZone = document.getElementById('booksZone');
    const libraryContent = document.querySelector('.library-content');
    
    if (!resizer || !booksZone || !libraryContent) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Восстанавливаем сохраненную ширину
    const savedWidth = localStorage.getItem('books-zone-width');
    if (savedWidth) {
      document.documentElement.style.setProperty('--books-zone-width', savedWidth + 'px');
    }

    const startResize = (e) => {
      isResizing = true;
      startX = e.clientX || e.touches[0].clientX;
      startWidth = booksZone.offsetWidth;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const doResize = (e) => {
      if (!isResizing) return;
      
      const currentX = e.clientX || e.touches[0].clientX;
      const diff = currentX - startX;
      const newWidth = Math.max(200, Math.min(startWidth + diff, libraryContent.offsetWidth * 0.5));
      
      document.documentElement.style.setProperty('--books-zone-width', newWidth + 'px');
      localStorage.setItem('books-zone-width', newWidth.toString());
    };

    const stopResize = () => {
      if (!isResizing) return;
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('touchmove', doResize, { passive: false });
    
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);
  }

  // ==================== Инициализация ====================
  
  function installEventHandlers() {
    // Кнопка "Новая книга" в верхней панели
    const newBookBtn = document.getElementById("btnNewBook");
    if (newBookBtn) {
      newBookBtn.addEventListener("click", () => openBookModal(null));
    }
    
    // Кнопка "Новая книга" в панели "Мои книги"
    const newBookBtnInZone = document.getElementById("btnNewBookInZone");
    if (newBookBtnInZone) {
      newBookBtnInZone.addEventListener("click", () => openBookModal(null));
    }

    const homeLibraryBtn = document.getElementById('btnHomeLibrary');
    if (homeLibraryBtn) {
      homeLibraryBtn.addEventListener('click', () => openHomeLibraryModal());
    }

    const homeLibraryCloseBtn = document.getElementById('home-library-close');
    if (homeLibraryCloseBtn) {
      homeLibraryCloseBtn.addEventListener('click', closeHomeLibraryModal);
    }

    const homeLibraryModal = document.getElementById('home-library-modal');
    if (homeLibraryModal) {
      homeLibraryModal.addEventListener('click', (event) => {
        if (event.target === homeLibraryModal) {
          closeHomeLibraryModal();
        }
      });
    }

    // Кнопка публичной библиотеки
    const publicLibraryBtn = document.getElementById("btnPublicLibrary");
    if (publicLibraryBtn) {
      publicLibraryBtn.addEventListener("click", () => openPublicLibraryModal());
    }

    const offlineCacheBtn = document.getElementById('btnOfflineCache');
    if (offlineCacheBtn) {
      offlineCacheBtn.addEventListener('click', () => openOfflineCacheModal());
    }

    // ==================== Desk zoom controls ====================
    const deskZone = document.querySelector('.desk-zone');
    const zoomInBtn = document.getElementById('btnDeskZoomIn');
    const zoomOutBtn = document.getElementById('btnDeskZoomOut');
    const zoomStorageKey = 'desk_zoom';

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const applyDeskZoom = (zoom) => {
      if (!deskZone) return;
      const z = clamp(Number(zoom) || 1, 0.6, 1.8);
      deskZone.style.setProperty('--desk-zoom', String(z));
      try {
        localStorage.setItem(zoomStorageKey, String(z));
      } catch (e) {
      }
    };

    // Apply saved zoom on load
    try {
      const saved = localStorage.getItem(zoomStorageKey);
      if (saved) {
        applyDeskZoom(saved);
      }
    } catch (e) {
    }

    const step = 0.1;
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        const current = Number(getComputedStyle(deskZone).getPropertyValue('--desk-zoom')) || 1;
        applyDeskZoom(current + step);
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        const current = Number(getComputedStyle(deskZone).getPropertyValue('--desk-zoom')) || 1;
        applyDeskZoom(current - step);
      });
    }

    const offlineCacheCloseBtn = document.getElementById('offline-cache-close');
    if (offlineCacheCloseBtn) {
      offlineCacheCloseBtn.addEventListener('click', closeOfflineCacheModal);
    }

    const offlineCacheModal = document.getElementById('offline-cache-modal');
    if (offlineCacheModal) {
      offlineCacheModal.addEventListener('click', (event) => {
        if (event.target === offlineCacheModal) {
          closeOfflineCacheModal();
        }
      });
    }

    const offlineCacheRefreshBtn = document.getElementById('offlineCacheRefreshBtn');
    if (offlineCacheRefreshBtn) {
      offlineCacheRefreshBtn.addEventListener('click', refreshOfflineCacheStatus);
    }

    const offlineCacheClearBtn = document.getElementById('offlineCacheClearBtn');
    if (offlineCacheClearBtn) {
      offlineCacheClearBtn.addEventListener('click', async () => {
        if (!confirm('Очистить оффлайн кеш?')) return;
        try {
          await swRequest('cacheClear');
          showToast('Кеш очищен');
        } catch (e) {
          showToast(`Ошибка очистки: ${e && e.message ? e.message : String(e)}`);
        } finally {
          refreshOfflineCacheStatus();
        }
      });
    }

    const offlineCachePrefetchDeskBtn = document.getElementById('offlineCachePrefetchDeskBtn');
    if (offlineCachePrefetchDeskBtn) {
      offlineCachePrefetchDeskBtn.addEventListener('click', prefetchDeskAssets);
    }

    const offlineCacheLimitSaveBtn = document.getElementById('offlineCacheLimitSaveBtn');
    if (offlineCacheLimitSaveBtn) {
      offlineCacheLimitSaveBtn.addEventListener('click', async () => {
        const input = document.getElementById('offlineCacheLimitMb');
        const raw = input ? Number(input.value) : 300;
        const mb = isFinite(raw) ? Math.max(10, Math.floor(raw)) : 300;
        try {
          await swRequest('setMaxBytes', { maxBytes: mb * 1024 * 1024 });
          showToast('Лимит сохранён');
        } catch (e) {
          showToast(`Ошибка сохранения лимита: ${e && e.message ? e.message : String(e)}`);
        } finally {
          refreshOfflineCacheStatus();
        }
      });
    }

    // Инициализация перетаскивания разделителя между зонами
    initZoneResizer();

    // Закрытие модального окна публичной библиотеки
    const publicLibraryCloseBtn = document.getElementById("public-library-close");
    if (publicLibraryCloseBtn) {
      publicLibraryCloseBtn.addEventListener("click", closePublicLibraryModal);
    }

    const publicLibraryModal = document.getElementById("public-library-modal");
    if (publicLibraryModal) {
      publicLibraryModal.addEventListener("click", (event) => {
        if (event.target === publicLibraryModal) {
          closePublicLibraryModal();
        }
      });
    }

    // Закрытие модального окна просмотра диктанта
    const viewDictationCloseBtn = document.getElementById("view-dictation-close");
    if (viewDictationCloseBtn) {
      viewDictationCloseBtn.addEventListener("click", () => {
        const modal = document.getElementById("view-dictation-modal");
        if (modal) {
          modal.style.display = "none";
        }
      });
    }

    const viewDictationModal = document.getElementById("view-dictation-modal");
    if (viewDictationModal) {
      viewDictationModal.addEventListener("click", (event) => {
        if (event.target === viewDictationModal) {
          viewDictationModal.style.display = "none";
        }
      });
    }

    // Переключатель вида диктантов удален - всегда используем вид "cards"
    currentView = 'cards';

    // Закрыть модальное окно
    const modalCloseBtn = document.getElementById("book-edit-close");
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener("click", closeBookModal);
    }

    // Форма сохранения книги
    const form = document.getElementById("book-edit-form");
    if (form) {
      form.addEventListener("submit", handleSaveBook);
    }

    // Загрузка обложки
    const coverUploadBtn = document.getElementById("book-cover-upload-btn");
    const coverUploadInput = document.getElementById("book-cover-upload");
    const coverClickable = document.getElementById("book-cover-clickable");
    
    if (coverUploadBtn && coverUploadInput) {
      coverUploadBtn.addEventListener("click", () => {
        coverUploadInput.click();
      });
      coverUploadInput.addEventListener("change", handleCoverSelect);
    }
    
    if (coverClickable && coverUploadInput) {
      coverClickable.addEventListener("click", () => {
        coverUploadInput.click();
      });
    }
    
    // Crop modal controls
    const cropCloseBtn = document.getElementById("crop-close");
    const cropCancelBtn = document.getElementById("crop-cancel");
    const cropConfirmBtn = document.getElementById("crop-confirm");
    
    if (cropCloseBtn) {
      cropCloseBtn.addEventListener("click", closeCropModal);
    }
    if (cropCancelBtn) {
      cropCancelBtn.addEventListener("click", closeCropModal);
    }
    if (cropConfirmBtn) {
      cropConfirmBtn.addEventListener("click", handleCropConfirm);
    }

    // Закрытие модального окна при клике вне его
    const bookModal = document.getElementById("book-edit-modal");
    if (bookModal) {
      bookModal.addEventListener("click", (event) => {
        if (event.target === bookModal) {
          closeBookModal();
        }
      });
    }

    // Модальное окно раздела
    const sectionCloseBtn = document.getElementById("section-edit-close");
    if (sectionCloseBtn) {
      sectionCloseBtn.addEventListener("click", closeSectionModal);
    }

    const sectionForm = document.getElementById("section-edit-form");
    if (sectionForm) {
      sectionForm.addEventListener("submit", handleSaveSection);
    }

    const sectionModal = document.getElementById("section-edit-modal");
    if (sectionModal) {
      sectionModal.addEventListener("click", (event) => {
        if (event.target === sectionModal) {
          closeSectionModal();
        }
      });
    }

    // Инициализируем прокрутку desk
    // Обработчики для кнопок в карточках диктантов (делегирование событий)
    document.addEventListener('dblclick', (e) => {
      try {
        const deskThumb = e.target && e.target.closest ? e.target.closest('.desk-card .short-thumb') : null;
        if (!deskThumb) return;
        e.preventDefault();
        e.stopPropagation();
        const href = deskThumb.getAttribute('href');
        if (href) {
          window.location.href = href;
        }
      } catch (err) {
      }
    }, true);

    document.addEventListener('click', async (e) => {
      try {
        const deskThumb = e.target && e.target.closest ? e.target.closest('.desk-card .short-thumb') : null;
        if (deskThumb) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      } catch (err) {
      }

      // Кнопка раскрытия/сворачивания раздела
      if (e.target.closest('.structure-item-toggle')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('.structure-item-toggle');
        const sectionId = btn.getAttribute('data-section-id');
        if (sectionId) {
          await toggleSection(sectionId);
        }
      }

      // Выпадающее меню действий раздела
      if (e.target.closest('[data-action="section-actions"]')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-action="section-actions"]');
        const sectionId = btn.getAttribute('data-section-id');
        const menu = document.querySelector(`.section-actions-menu[data-section-id="${sectionId}"]`);
        
        if (menu) {
          // Закрываем все другие меню
          document.querySelectorAll('.section-actions-menu').forEach(m => {
            if (m !== menu) {
              m.classList.remove('show');
              m.style.display = 'none';
            }
          });
          document.querySelectorAll('#bookActionsMenu').forEach(m => {
            m.classList.remove('show');
            m.style.display = 'none';
          });
          
          const isVisible = menu.classList.contains('show');
          if (isVisible) {
            menu.classList.remove('show');
            menu.style.display = 'none';
          } else {
            menu.classList.add('show');
            menu.style.display = 'block';
            
            // Закрываем меню при клике вне его
            setTimeout(() => {
              const closeMenuHandler = function(e) {
                if (!menu.contains(e.target) && !btn.contains(e.target)) {
                  menu.classList.remove('show');
                  menu.style.display = 'none';
                  document.removeEventListener('click', closeMenuHandler);
                }
              };
              document.addEventListener('click', closeMenuHandler);
            }, 0);
          }
        }
      }
      
      // Обработчики пунктов меню маленькой карточки книги
      if (e.target.closest('.mini-book-actions-menu .dropdown-menu-item')) {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest('.dropdown-menu-item');
        const action = item.getAttribute('data-action');
        const bookId = item.getAttribute('data-book-id');
        const menu = item.closest('.mini-book-actions-menu');
        
        if (menu) {
          menu.classList.remove('show');
          menu.style.display = 'none';
        }
        
        switch(action) {
          case 'edit-mini-book':
            console.log('✏️ Редактирую книгу из маленькой карточки:', bookId);
            if (bookId) {
              const bookData = await apiRequest(`/library/api/book/${bookId}`);
              if (bookData.success && bookData.book) {
                openBookModal(bookData.book);
              }
            }
            break;
          case 'delete-mini-book':
            console.log('🗑️ Удаляю книгу из маленькой карточки:', bookId);
            if (bookId) {
              const bookData = await apiRequest(`/library/api/book/${bookId}`);
              if (bookData.success && bookData.book) {
                const bookTitle = bookData.book.title || 'книгу';
                if (confirm(`Вы уверены, что хотите удалить книгу "${bookTitle}"?`)) {
                  await deleteBook(bookId);
                }
              }
            }
            break;
        }
      }
      
      // Обработчики пунктов меню раздела
      if (e.target.closest('.section-actions-menu .dropdown-menu-item')) {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest('.dropdown-menu-item');
        const action = item.getAttribute('data-action');
        const sectionId = item.getAttribute('data-section-id');
        const menu = item.closest('.section-actions-menu');
        
        if (menu) {
          menu.classList.remove('show');
          menu.style.display = 'none';
        }
        
        switch(action) {
          case 'add-subsection':
            console.log('➕ Создаю подраздел для раздела:', sectionId);
            if (sectionId) {
              openSectionModal(null, sectionId);
            }
            break;
          case 'add-dictation':
            console.log('➕ Создаю диктант для раздела:', sectionId);
            if (sectionId) {
              setDictationTargetBook(sectionId);
            }
            window.location.href = '/dictation_editor/new';
            break;
          case 'edit-section':
            console.log('✏️ Редактирую раздел:', sectionId);
            if (activeBookId) {
              loadSectionForEdit(sectionId);
            }
            break;
          case 'delete-section':
            const section = window.currentBookSections?.find(s => s.id === parseInt(sectionId));
            const sectionTitle = section?.title || 'раздел';
            if (confirm(`Вы уверены, что хотите удалить раздел "${sectionTitle}"?`)) {
              deleteSection(sectionId);
            }
            break;
        }
      }

      // Клик на карточку диктанта для добавления/удаления со стола (только в библиотеке, не на столе)
      if (e.target.closest('.short-card[data-action="toggle-desk"]')) {
        const card = e.target.closest('.short-card[data-action="toggle-desk"]');
        // Игнорируем клики на кнопки действий и ссылки
        if (e.target.closest('.short-actions') || e.target.closest('a') || e.target.closest('button')) {
          // Do not handle as toggle-desk, but allow other handlers below (move/delete/etc)
        } else {
          // Игнорируем карточки на столе (они открываются для работы)
          if (card.classList.contains('desk-card')) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          const dictationId = card.getAttribute('data-dictation-id');
          if (dictationId) {
            toggleDictationOnDesk(dictationId);
          }
          return;
        }
      }

      // Кнопка "Переместить в книгу"
      if (e.target.closest('[data-action="move-dictation"]')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-action="move-dictation"]');
        const dictationId = btn.getAttribute('data-dictation-id');
        console.log('🔄 Открываю модальное окно перемещения для диктанта:', dictationId);
        openMoveDictationModal(dictationId);
      }

      // Удалить (на карточке диктанта)
      if (e.target.closest('[data-action="delete-dictation"]')) {
        const btn = e.target.closest('[data-action="delete-dictation"]');
        const dictationId = btn.getAttribute('data-dictation-id');
        console.log('🗑️ click delete-dictation', {
          dictationId,
          activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
        });
        deleteDictation(dictationId);
      }

      // Кнопка "Убрать со стола" (на карточке на столе)
      if (e.target.closest('[data-action="remove-from-desk"]')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-action="remove-from-desk"]');
        const itemId = btn.getAttribute('data-desk-item-id');
        const dictationId = btn.getAttribute('data-dictation-id');
        if (itemId && dictationId) {
          removeFromDesk(itemId, dictationId);
        }
      }

      // Кнопка "Добавить диктант" в разделе (старый обработчик, оставляем для совместимости)
      if (e.target.closest('[data-action="add-dictation"]:not(.dropdown-menu-item)')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-action="add-dictation"]');
        const sectionId = btn.getAttribute('data-section-id');
        console.log('➕ Создаю новый диктант для раздела:', sectionId);
        // Сохраняем целевой раздел (он же книга-узел) и открываем редактор
        if (sectionId) {
          setDictationTargetBook(sectionId);
        } else if (activeBookId) {
          setDictationTargetBook(activeBookId);
        }
        window.location.href = '/dictation_editor/new';
      }

      // Кнопка "Редактировать раздел" (старый обработчик, оставляем для совместимости)
      if (e.target.closest('[data-action="edit-section"]:not(.dropdown-menu-item)')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-action="edit-section"]');
        const sectionId = btn.getAttribute('data-section-id');
        console.log('✏️ Редактирую раздел:', sectionId);
        
        // Находим данные раздела из списка разделов
        if (activeBookId) {
          loadSectionForEdit(sectionId);
        }
      }
    });

    // Модальное окно перемещения диктанта
    const moveDictationCloseBtn = document.getElementById("move-dictation-close");
    if (moveDictationCloseBtn) {
      moveDictationCloseBtn.addEventListener("click", closeMoveDictationModal);
    }

    const moveDictationForm = document.getElementById("move-dictation-form");
    if (moveDictationForm) {
      moveDictationForm.addEventListener("submit", handleMoveDictation);
    }

    const moveDictationModal = document.getElementById("move-dictation-modal");
    if (moveDictationModal) {
      moveDictationModal.addEventListener("click", (event) => {
        if (event.target === moveDictationModal) {
          closeMoveDictationModal();
        }
      });
    }

    const deleteDictationModal = document.getElementById('delete-dictation-modal');
    const deleteDictationCloseBtn = document.getElementById('delete-dictation-close');
    const deleteDictationConfirmBtn = document.getElementById('delete-dictation-confirm');
    console.log('🗑️ delete modal bind', {
      hasModal: !!deleteDictationModal,
      hasCloseBtn: !!deleteDictationCloseBtn,
      hasConfirmBtn: !!deleteDictationConfirmBtn
    });
    if (deleteDictationCloseBtn) {
      deleteDictationCloseBtn.addEventListener('click', closeDeleteDictationModal);
    }
    if (deleteDictationConfirmBtn) {
      deleteDictationConfirmBtn.addEventListener('click', async () => {
        const id = pendingDeleteDictationId;
        console.log('🗑️ delete confirm click', {
          pendingDeleteDictationId: id,
          activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
        });
        if (!id) return;
        await performDeleteDictation(id);
      });
    }
    if (deleteDictationModal) {
      deleteDictationModal.addEventListener('click', (event) => {
        if (event.target === deleteDictationModal) {
          closeDeleteDictationModal();
        }
      });
    }
  }

  // ==================== Перемещение диктанта ====================

  function openMoveDictationModal(dictationId) {
    console.log('📖 openMoveDictationModal вызвана для диктанта:', dictationId);
    const modal = document.getElementById("move-dictation-modal");
    const dictIdInput = document.getElementById("move-dictation-id");
    const bookSelect = document.getElementById("move-target-book");
    const sectionsContainer = document.getElementById("move-dictation-sections-container");
    const sectionsList = document.getElementById("move-dictation-sections-list");
    const sectionInput = document.getElementById("move-target-section");

    console.log('Элементы модального окна:', { modal, dictIdInput, bookSelect });

    if (!modal || !dictIdInput || !bookSelect) {
      console.error('❌ Не найдены элементы модального окна!');
      return;
    }

    // Сохраняем ID диктанта
    dictIdInput.value = dictationId;
    if (sectionInput) sectionInput.value = '';

    // Скрываем контейнер разделов
    if (sectionsContainer) sectionsContainer.style.display = 'none';
    if (sectionsList) sectionsList.innerHTML = '';

    // Загружаем список книг (кроме рабочей тетради)
    const booksList = document.getElementById("booksList");
    if (booksList) {
      const bookCards = booksList.querySelectorAll('.book-card-mini');
      bookSelect.innerHTML = '<option value="">-- Выберите книгу --</option>';
      
      bookCards.forEach(card => {
        const bookId = card.getAttribute('data-book-id');
        const bookTitle = card.querySelector('.book-card-mini-title')?.textContent || 'Без названия';
        const isWorkbook = bookTitle === 'Рабочая тетрадь';
        
        if (!isWorkbook && bookId) {
          const option = document.createElement('option');
          option.value = bookId;
          option.textContent = bookTitle;
          bookSelect.appendChild(option);
        }
      });
    }

    // Обработчик изменения выбора книги
    bookSelect.onchange = async function() {
      const selectedBookId = this.value;
      const selectedBookIdInt = parseInt(selectedBookId);
      console.log('📖 Выбрана книга, ID:', selectedBookId, 'как число:', selectedBookIdInt);
      
      if (sectionInput) sectionInput.value = '';
      
      if (!selectedBookId) {
        if (sectionsContainer) sectionsContainer.style.display = 'none';
        if (sectionsList) sectionsList.innerHTML = '';
        return;
      }

      // Загружаем разделы книги
      try {
        const token = getToken();
        console.log('🔍 Запрашиваю разделы для книги:', selectedBookIdInt);
        const response = await fetch(`/library/api/book/${selectedBookIdInt}/sections`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          console.error('❌ Ошибка ответа сервера:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('❌ Текст ошибки:', errorText);
        }
        
        const data = await response.json();
        
        console.log('📚 Загружены разделы:', data);
        console.log('📚 Количество разделов:', data.sections ? data.sections.length : 0);
        console.log('📚 ID выбранной книги:', selectedBookId);
        if (data.sections && data.sections.length > 0) {
          console.log('📚 Все разделы:', data.sections);
          data.sections.forEach((s, idx) => {
            console.log(`  Раздел ${idx}: id=${s.id}, title=${s.title}, parent_id=${s.parent_id}, bookId=${selectedBookId}`);
          });
        }
        
        if (data.success && data.sections && data.sections.length > 0) {
          // Показываем контейнер разделов и рендерим дерево
          if (sectionsContainer) {
            sectionsContainer.style.display = 'block';
            console.log('✅ Показываю контейнер разделов');
          }
          if (sectionsList) {
            sectionsList.innerHTML = '';
            console.log('🌳 Рендерю дерево разделов, количество:', data.sections.length);
            // Передаем bookId как parentId для первого уровня (используем число)
            renderSectionsTree(data.sections, sectionsList, selectedBookIdInt, selectedBookIdInt, 0);
            // Обновляем иконки Lucide после рендеринга
            setTimeout(() => {
              if (window.lucide) {
                lucide.createIcons();
              }
              console.log('📋 Элементов в списке разделов:', sectionsList.children.length);
            }, 100);
          }
        } else {
          // Нет разделов - скрываем контейнер
          console.log('ℹ️ Разделов нет, скрываю контейнер. data.success:', data.success, 'sections:', data.sections);
          if (sectionsContainer) sectionsContainer.style.display = 'none';
          if (sectionsList) sectionsList.innerHTML = '';
        }
      } catch (error) {
        console.error('Ошибка загрузки разделов:', error);
        if (sectionsContainer) sectionsContainer.style.display = 'none';
      }
    };

    // Показываем модальное окно
    console.log('📋 Книг в списке:', bookSelect.options.length);
    console.log('🎭 Показываю модальное окно...');
    modal.classList.add('show');
    modal.style.display = 'flex';
    console.log('✅ Модальное окно должно быть видно. Стили:', {
      display: modal.style.display,
      classList: Array.from(modal.classList)
    });
  }

  function renderSectionsTree(sections, container, bookId, parentId = null, level = 0) {
    console.log(`🌳 renderSectionsTree вызвана: level=${level}, parentId=${parentId}, bookId=${bookId}, sections.length=${sections.length}`);
    
    // Фильтруем разделы по родителю
    const filteredSections = sections.filter(s => {
      // Для первого уровня (level 0) показываем разделы с parent_id === bookId
      if (level === 0 && parentId === bookId) {
        // Приводим к числам для сравнения
        const sectionParentId = parseInt(s.parent_id);
        const bookIdNum = parseInt(bookId);
        const matches = sectionParentId === bookIdNum;
        console.log(`  Проверка уровня 0: раздел "${s.title}" parent_id=${s.parent_id} (${sectionParentId}) === bookId=${bookId} (${bookIdNum})? ${matches}`);
        return matches;
      }
      // Для остальных уровней фильтруем по parentId
      if (parentId === null) {
        return !s.parent_id || s.parent_id === null;
      }
      const sectionParentId = parseInt(s.parent_id);
      const parentIdNum = parseInt(parentId);
      const matches = sectionParentId === parentIdNum;
      console.log(`  Проверка уровня ${level}: раздел "${s.title}" parent_id=${s.parent_id} (${sectionParentId}) === parentId=${parentId} (${parentIdNum})? ${matches}`);
      return matches;
    });

    console.log(`🌳 renderSectionsTree: level=${level}, parentId=${parentId}, filtered=${filteredSections.length}`);
    if (filteredSections.length === 0) {
      console.warn('⚠️ Нет разделов после фильтрации!');
    }

    // Сортируем по order_index
    filteredSections.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    filteredSections.forEach(section => {
      console.log(`  📄 Рендерю раздел: ${section.title} (id=${section.id}, parent_id=${section.parent_id})`);
      const hasChildren = sections.some(s => s.parent_id === section.id);
      
      const item = document.createElement('div');
      item.className = 'move-dictation-section-item';
      item.setAttribute('data-level', level);
      item.setAttribute('data-section-id', section.id);
      item.setAttribute('data-book-id', bookId);
      
      item.innerHTML = `
        ${hasChildren ? `
          <div class="move-dictation-section-toggle" data-section-id="${section.id}">
            <i data-lucide="chevron-right"></i>
          </div>
        ` : '<div style="width: 20px;"></div>'}
        <span class="move-dictation-section-title">${section.title || 'Без названия'}</span>
      `;
      
      // Обработчик клика на раздел
      item.addEventListener('click', (e) => {
        if (e.target.closest('.move-dictation-section-toggle')) {
          e.stopPropagation();
          toggleSectionChildren(section.id, item);
          return;
        }
        
        // Выбираем раздел
        document.querySelectorAll('.move-dictation-section-item').forEach(el => {
          el.classList.remove('selected');
        });
        item.classList.add('selected');
        
        const sectionInput = document.getElementById("move-target-section");
        if (sectionInput) {
          sectionInput.value = section.id;
        }
      });
      
      container.appendChild(item);
      console.log(`  ✅ Раздел добавлен в DOM: ${section.title}`);
      
      // Если есть дети, создаем контейнер для них
      if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'move-dictation-section-children';
        childrenContainer.setAttribute('data-parent-id', section.id);
        container.appendChild(childrenContainer);
        
        // Рекурсивно рендерим детей
        renderSectionsTree(sections, childrenContainer, bookId, section.id, level + 1);
      }
    });
    
    // Инициализируем иконки Lucide после рендеринга всех элементов уровня
    if (window.lucide && filteredSections.length > 0) {
      setTimeout(() => {
        lucide.createIcons();
        console.log(`  🎨 Иконки Lucide обновлены для уровня ${level}`);
      }, 0);
    }
  }

  function toggleSectionChildren(sectionId, itemElement) {
    const toggle = itemElement.querySelector('.move-dictation-section-toggle');
    const childrenContainer = itemElement.nextElementSibling;
    
    if (!childrenContainer || !childrenContainer.classList.contains('move-dictation-section-children')) {
      return;
    }
    
    const isExpanded = childrenContainer.classList.contains('expanded');
    
    if (isExpanded) {
      childrenContainer.classList.remove('expanded');
      toggle.classList.remove('expanded');
    } else {
      childrenContainer.classList.add('expanded');
      toggle.classList.add('expanded');
    }
    
    // Обновляем иконки
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function closeMoveDictationModal() {
    const modal = document.getElementById("move-dictation-modal");
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
      // Очищаем форму
      const form = document.getElementById("move-dictation-form");
      if (form) form.reset();
      
      // Очищаем контейнер разделов
      const sectionsContainer = document.getElementById("move-dictation-sections-container");
      const sectionsList = document.getElementById("move-dictation-sections-list");
      if (sectionsContainer) sectionsContainer.style.display = 'none';
      if (sectionsList) sectionsList.innerHTML = '';
      
      // Снимаем выделение с разделов
      document.querySelectorAll('.move-dictation-section-item').forEach(el => {
        el.classList.remove('selected');
      });
    }
  }

  async function handleMoveDictation(e) {
    e.preventDefault();

    const dictationId = document.getElementById("move-dictation-id").value;
    const bookId = document.getElementById("move-target-book").value;
    const sectionId = document.getElementById("move-target-section")?.value || null;
    const sectionsContainer = document.getElementById("move-dictation-sections-container");

    if (!dictationId || !bookId) {
      showToast("Выберите книгу", "error");
      return;
    }

    // Если есть разделы и контейнер виден, но раздел не выбран - можно переместить в саму книгу
    // Используем раздел, если выбран, иначе саму книгу
    const targetId = sectionId || bookId;

    try {
      const token = getToken();
      const response = await fetch(`/library/api/dictation/${dictationId}/move-to-book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ book_id: parseInt(targetId) })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Диктант перемещён");
        closeMoveDictationModal();
        
        // Определяем ID целевой книги (если выбран раздел, это родительская книга)
        const targetBookIdNum = parseInt(bookId);
        
        // Перезагружаем активную книгу, если она открыта
        if (activeBookId) {
          const currentBookId = parseInt(activeBookId);
          
          // Определяем, является ли текущая открытая книга рабочей тетрадью
          const bookCards = document.querySelectorAll('.book-card-mini');
          let isCurrentWorkbook = false;
          bookCards.forEach(card => {
            if (parseInt(card.getAttribute('data-book-id')) === currentBookId) {
              const title = card.querySelector('.book-card-mini-title')?.textContent;
              if (title === 'Рабочая тетрадь') {
                isCurrentWorkbook = true;
              }
            }
          });
          
          // Если открыта рабочая тетрадь - обновляем её (диктант оттуда ушёл)
          if (isCurrentWorkbook) {
            await loadActiveBook(currentBookId, true);
          }
          // Если открыта целевая книга - обновляем её (диктант туда пришёл)
          else if (currentBookId === targetBookIdNum) {
            await loadActiveBook(currentBookId, false);
            
            // Если диктант перемещён в раздел, и этот раздел открыт - обновляем его
            if (sectionId) {
              const sectionContent = document.querySelector(`.structure-item-content[data-section-content-id="${sectionId}"]`);
              if (sectionContent && sectionContent.style.display !== 'none') {
                await loadSectionDictations(sectionId, sectionContent);
              }
            }
          }
        }
      } else {
        showToast(data.error || "Ошибка при перемещении", "error");
      }
    } catch (error) {
      console.error("Ошибка перемещения диктанта:", error);
      showToast("Ошибка при перемещении", "error");
    }
  }

  // ==================== Удаление диктанта ====================

  async function deleteBook(bookId) {
    try {
      const data = await apiRequest(`/library/api/book/${bookId}`, {
        method: "DELETE",
      });

      if (data.success) {
        showToast("Книга удалена");
        // Перезагружаем список книг
        await loadBooksFromAPI();
        // Очищаем активную книгу
        activeBookId = null;
        const container = document.getElementById("activeBookCard");
        if (container) {
          container.innerHTML = '';
        }
        const structureContainer = document.getElementById("bookStructure");
        if (structureContainer) {
          structureContainer.innerHTML = '';
        }
      } else {
        showToast(data.error || "Ошибка при удалении книги", "error");
      }
    } catch (error) {
      console.error("Ошибка удаления книги:", error);
      showToast("Ошибка при удалении книги", "error");
    }
  }

  async function deleteSection(sectionId) {
    try {
      const data = await apiRequest(`/library/api/book/${sectionId}`, {
        method: "DELETE",
      });

      if (data.success) {
        showToast("Раздел удалён");
        // Перезагружаем активную книгу
        if (activeBookId) {
          await loadActiveBook(activeBookId);
        }
      } else {
        showToast(data.error || "Ошибка при удалении раздела", "error");
      }
    } catch (error) {
      console.error("Ошибка удаления раздела:", error);
      showToast("Ошибка при удалении раздела", "error");
    }
  }

  async function deleteDictation(dictationId) {
    console.log('🗑️ deleteDictation()', { dictationId });
    openDeleteDictationModal(dictationId);
  }

  function openDeleteDictationModal(dictationId) {
    const modal = document.getElementById('delete-dictation-modal');
    if (!modal) {
      console.warn('🗑️ openDeleteDictationModal: modal not found');
      return;
    }
    pendingDeleteDictationId = String(dictationId || '');
    pendingDeleteSectionId = null;

    console.log('🗑️ openDeleteDictationModal', {
      dictationId: pendingDeleteDictationId,
      activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
    });

    const nameEl = document.getElementById('delete-dictation-name');
    const deskWarnEl = document.getElementById('delete-dictation-desk-warning');
    try {
      const card = document.querySelector(`.short-card[data-dictation-id="${CSS.escape(String(dictationId))}"]`);
      const title = card ? (card.querySelector('.short-title')?.textContent || '') : '';
      if (nameEl) {
        nameEl.textContent = title ? `«${title.trim()}»` : '';
      }

      // If delete was triggered from a section (paragraph) view, remember that sectionId.
      // Otherwise we fall back to activeBookId.
      try {
        const sectionContent = card ? card.closest('.structure-item-content[data-section-content-id]') : null;
        const sectionIdAttr = sectionContent ? sectionContent.getAttribute('data-section-content-id') : '';
        const sectionIdNum = sectionIdAttr ? parseInt(String(sectionIdAttr), 10) : NaN;
        if (sectionIdNum && isFinite(sectionIdNum) && sectionIdNum > 0) {
          pendingDeleteSectionId = String(sectionIdNum);
        }
      } catch (e2) {
        pendingDeleteSectionId = null;
      }
    } catch (e) {
      if (nameEl) nameEl.textContent = '';
    }

    try {
      const isOnDesk = typeof isDictationOnDesk === 'function' ? !!isDictationOnDesk(String(dictationId)) : false;
      if (deskWarnEl) {
        if (isOnDesk) {
          deskWarnEl.style.display = 'block';
          deskWarnEl.textContent = 'Внимание: диктант лежит на рабочем столе. При удалении он будет убран и со стола.';
        } else {
          deskWarnEl.style.display = 'none';
          deskWarnEl.textContent = '';
        }
      }
    } catch (e) {
      if (deskWarnEl) {
        deskWarnEl.style.display = 'none';
        deskWarnEl.textContent = '';
      }
    }

    console.log('🗑️ delete modal show', {
      displayBefore: modal.style.display,
      classBefore: modal.className,
      hasNameEl: !!nameEl,
      nameText: nameEl ? nameEl.textContent : null
    });

    modal.style.display = 'flex';
    modal.classList.add('show');
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function closeDeleteDictationModal() {
    const modal = document.getElementById('delete-dictation-modal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.style.display = 'none';
    pendingDeleteDictationId = null;
    pendingDeleteSectionId = null;
  }

  async function performDeleteDictation(dictationId) {
    try {
      const idStr = String(dictationId || '');
      if (!idStr) return;

      console.log('🗑️ performDeleteDictation start', {
        dictationId: idStr,
        activeBookId: (typeof activeBookId !== 'undefined') ? activeBookId : null
      });

      // If a book/section is currently open, trash means "remove from this book", not delete dictation.
      // Workbook is a special virtual view of orphan dictations (not based on book_dictations), so here we delete globally.
      try {
        const sectionIdRaw = pendingDeleteSectionId ? String(pendingDeleteSectionId) : '';
        const sectionIdNum = sectionIdRaw ? parseInt(sectionIdRaw, 10) : NaN;

        const bookIdRaw = (typeof activeBookId !== 'undefined' && activeBookId) ? String(activeBookId) : '';
        const bookIdNum = bookIdRaw ? parseInt(bookIdRaw, 10) : NaN;

        const targetBookIdNum = (sectionIdNum && isFinite(sectionIdNum) && sectionIdNum > 0)
          ? sectionIdNum
          : bookIdNum;

        const isWorkbookActive = (typeof activeBookIsWorkbook !== 'undefined') ? !!activeBookIsWorkbook : false;
        if (!isWorkbookActive && targetBookIdNum && isFinite(targetBookIdNum) && targetBookIdNum > 0) {
          const token = getToken();
          const url = `/library/api/book/${targetBookIdNum}/dictation/${encodeURIComponent(idStr)}`;
          console.log('🗑️ remove-from-book request', { url, bookIdNum: targetBookIdNum, dictationId: idStr, sectionId: sectionIdRaw || null, activeBookId: bookIdRaw || null });
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            cache: 'no-store'
          });

          let data = null;
          try {
            data = await response.json();
          } catch (e) {
            data = null;
          }

          console.log('🗑️ remove-from-book response', {
            status: response.status,
            ok: response.ok,
            data
          });

          if (response.ok && data && data.success) {
            closeDeleteDictationModal();
            showToast('Диктант убран из книги');

            // If dictation is on desk, remove it from desk as well to avoid it becoming an orphan/workbook entry.
            try {
              const itemId = typeof getDeskItemId === 'function' ? getDeskItemId(idStr) : null;
              if (itemId) {
                await removeFromDesk(itemId, idStr);
              }
            } catch (e) {
            }

            try {
              const card = document.querySelector(`.short-card[data-dictation-id="${CSS.escape(String(idStr))}"]`);
              if (card) {
                card.remove();
              }
            } catch (e) {
            }
            if (activeBookId) {
              try {
                await loadActiveBook(activeBookId, activeBookIsWorkbook);
              } catch (e) {
              }
            }

            // If deletion happened inside a section, refresh that section's list as well.
            try {
              const sid = sectionIdRaw ? parseInt(sectionIdRaw, 10) : NaN;
              if (sid && isFinite(sid) && sid > 0) {
                const content = document.querySelector(`.structure-item-content[data-section-content-id="${CSS.escape(String(sid))}"]`);
                if (content && content.style.display !== 'none') {
                  await loadSectionDictations(String(sid), content);
                }
              }
            } catch (e) {
            }
            return;
          }

          showToast((data && data.error) ? data.error : 'Ошибка при удалении из книги', 'error');
          return;
        }
      } catch (e) {
      }

      const dictIdStr = `dict_${idStr}`;
      const deleteUrl = `/api/dictations/${encodeURIComponent(dictIdStr)}`;
      console.log('🗑️ global delete request', { url: deleteUrl, dictationId: dictIdStr });
      const response = await fetch(deleteUrl, {
        method: 'DELETE'
      });

      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }

      console.log('🗑️ global delete response', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (response.ok && data && data.success) {
        closeDeleteDictationModal();
        showToast('Диктант удалён');

        try {
          const card = document.querySelector(`.short-card[data-dictation-id="${CSS.escape(String(idStr))}"]`);
          if (card) {
            card.remove();
          }
        } catch (e) {
        }

        if (activeBookId) {
          try {
            await loadActiveBook(activeBookId, activeBookIsWorkbook);
          } catch (e) {
          }
        }
      } else {
        showToast((data && data.error) ? data.error : 'Ошибка при удалении', 'error');
      }
    } catch (error) {
      console.error('Ошибка удаления диктанта:', error);
      showToast('Ошибка при удалении', 'error');
    }
  }

  // ==================== Статистика и медальки диктантов ====================

  // Загрузка статистики диктанта (звезды, полузвезды, микрофон)
  async function getDictationStats(dictationId) {
    if (!dictationId) {
      return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
    }

    const loadDraftStatistics = async (dictationId) => {
      try {
        const key = getDraftKey(dictationId);
        if (!key) return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
        const local = await idbGet('drafts', key);
        const state = local && local.state ? local.state : null;
        if (state) {
          const draftStats = computeDraftStatistics(state);
          draftStats.hasDraft = true;
          return draftStats;
        }
      } catch (error) {
        console.warn('Ошибка загрузки статистики диктанта:', dictationId, error);
      }

      return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };
    };

    return loadDraftStatistics(dictationId);
  }

  // Вычисление статистики из состояния диктанта
  function computeDraftStatistics(state) {
    const perSentence = state.per_sentence || {};
    let perfect = 0;
    let corrected = 0;
    let audio = 0;

    const toNumber = (value) => Number(value) || 0;

    const values = Object.values(perSentence);
    if (values.length) {
      values.forEach(sentence => {
        perfect += toNumber(sentence.number_of_perfect);
        corrected += toNumber(sentence.number_of_corrected);
        audio += toNumber(sentence.number_of_audio);
      });
    } else {
      // fallback (если черновик сохранён без per_sentence)
      perfect = toNumber(state.number_of_perfect);
      corrected = toNumber(state.number_of_corrected);
      audio = toNumber(state.number_of_audio);
    }

    return {
      perfect,
      corrected,
      audio,
      hasDraft: false
    };
  }

  // Обновление статистики для всех карточек диктантов
  async function updateDictationCardsStats(container = null) {
    const targetContainer = container || document;
    const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');
    
    cards.forEach(async (card) => {
      const dictationId = card.dataset.dictationId;
      if (!dictationId) return;

      const statsContainer = card.querySelector('.short-stats[data-dictation-id]');
      if (!statsContainer) return;

      const stats = await getDictationStats(dictationId);
      renderStatsIcons(statsContainer, stats);
    });
  }

  // Рендеринг иконок статистики
  function renderStatsIcons(container, stats = {}) {
    const metrics = [
      {
        className: 'stat-icon stat-icon-perfect',
        icon: 'star',
        value: Number(stats.perfect) || 0,
        title: 'Звезд'
      },
      {
        className: 'stat-icon stat-icon-corrected',
        icon: 'star-half',
        value: Number(stats.corrected) || 0,
        title: 'Полузвезд'
      },
      {
        className: 'stat-icon stat-icon-audio',
        icon: 'mic',
        value: Number(stats.audio) || 0,
        title: 'Аудио'
      }
    ];

    const hasProgress = metrics.some(metric => metric.value > 0);

    if (!hasProgress) {
      container.innerHTML = '<div class="stats-placeholder"></div>';
      return;
    }

    container.innerHTML = '';
    const statsIcons = document.createElement('div');
    statsIcons.className = 'stats-icons';

    metrics.forEach(metric => {
      const el = document.createElement('div');
      el.className = metric.className;
      el.title = `${metric.title}: ${metric.value}`;
      el.innerHTML = `<i data-lucide="${metric.icon}"></i><span>${metric.value}</span>`;
      statsIcons.appendChild(el);
    });

    container.appendChild(statsIcons);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Кеш для количества выполнений
  let completionCountsCache = {};

  // Загрузка количества выполнений из БД
  async function loadCompletionCounts(container = null) {
    const targetContainer = container || document;
    const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');
    if (cards.length === 0) {
      return;
    }
    
    // Собираем все ID диктантов
    const dictationIds = Array.from(cards)
      .map(card => card.dataset.dictationId)
      .filter(id => id);
    
    if (dictationIds.length === 0) {
      return;
    }
    
    // Получаем токен
    const token = window.UM?.token || localStorage.getItem('jwt_token');
    if (!token) {
      console.warn('[loadCompletionCounts] Нет токена, пропускаем загрузку');
      return;
    }
    
    try {
      const response = await fetch('/api/statistics/success/count', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dictation_ids: dictationIds })
      });
      
      if (response.ok) {
        const result = await response.json();
        // Обновляем кеш, добавляя новые данные (не заменяя полностью)
        if (result.counts) {
          Object.assign(completionCountsCache, result.counts);
        }
      } else {
        console.error('[loadCompletionCounts] Ошибка загрузки:', await response.text());
      }
    } catch (error) {
      console.error('[loadCompletionCounts] Ошибка при загрузке:', error);
    }
  }

  // Подсчет выполнений для конкретного диктанта
  function countDictationCompletions(dictationId) {
    if (!dictationId) return 0;
    
    // Пробуем разные форматы ключа
    const formats = [
      dictationId,
      `dict_${dictationId}`,
      String(dictationId),
      `dict_${String(dictationId)}`
    ];
    
    for (const key of formats) {
      if (completionCountsCache[key] !== undefined) {
        return completionCountsCache[key];
      }
    }
    
    return 0;
  }

  // Обновление медалек на всех карточках
  async function updateCompletionBadges(container = null) {
    const targetContainer = container || document;
    const cards = targetContainer.querySelectorAll('.short-card[data-dictation-id]');
    
    if (cards.length === 0) {
      return;
    }
    
    // Всегда загружаем данные из БД для всех карточек в контейнере
    // Это гарантирует, что медальки появятся даже для старых диктантов
    await loadCompletionCounts(targetContainer);
    
    cards.forEach(card => {
      const dictationId = card.dataset.dictationId;
      if (!dictationId) return;
      
      const completionCount = countDictationCompletions(dictationId);
      let badge = card.querySelector('.short-completion-badge');
      
      if (completionCount > 0) {
        if (!badge) {
          // Создаем новую медальку
          badge = document.createElement('div');
          badge.className = 'short-completion-badge';
          badge.dataset.dictationId = dictationId;
          card.appendChild(badge);
          
          // Добавляем обработчик клика
          badge.style.cursor = 'pointer';
          badge.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const clickedDictationId = e.currentTarget.dataset.dictationId;
            if (clickedDictationId && typeof DictationsReport !== 'undefined') {
              await DictationsReport.open(clickedDictationId);
            }
          });
        }
        badge.title = `Выполнено полностью: ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`;
        badge.setAttribute('aria-label', `Выполнено полностью: ${completionCount} раз. Кликните, чтобы открыть отчет по этому диктанту`);
        badge.innerHTML = `<i data-lucide="award"></i><span class="completion-count">${completionCount}</span>`;
      } else if (badge) {
        // Удаляем медальку, если выполнений нет
        badge.remove();
      }
    });
    
    // Обновить иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // ==================== Модальное окно публичной библиотеки ====================
  
  async function openPublicLibraryModal() {
    const modal = document.getElementById("public-library-modal");
    if (!modal) return;
    
    modal.style.display = "flex";
    
    // Закрываем активную книгу, если она была открыта
    closePublicActiveBookZone();
    
    // Загружаем публичные книги
    await loadPublicBooks();
    
    // Инициализация перетаскивания разделителя для публичной библиотеки
    initPublicZoneResizer();
    
    // Обновляем иконки Lucide
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }

  function initPublicZoneResizer() {
    const resizer = document.getElementById('publicZoneResizer');
    const libraryContent = document.querySelector('.public-library-content');
    if (!resizer || !libraryContent) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    const startResize = (e) => {
      isResizing = true;
      startX = e.clientX || (e.touches && e.touches[0].clientX);
      const booksZone = libraryContent.querySelector('.public-books-zone');
      if (booksZone) {
        startWidth = booksZone.offsetWidth;
      }
      libraryContent.classList.add('resizing');
      resizer.classList.add('resizing');
      e.preventDefault();
    };
    
    const doResize = (e) => {
      if (!isResizing) return;
      const currentX = e.clientX || (e.touches && e.touches[0].clientX);
      const diff = startX - currentX;
      const newWidth = startWidth + diff;
      const minWidth = 200;
      const maxWidth = libraryContent.offsetWidth * 0.7;
      const finalWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      libraryContent.style.setProperty('--public-books-zone-width', `${finalWidth}px`);
      e.preventDefault();
    };
    
    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        libraryContent.classList.remove('resizing');
        resizer.classList.remove('resizing');
        
        // Сохраняем ширину в localStorage
        const booksZone = libraryContent.querySelector('.public-books-zone');
        if (booksZone) {
          localStorage.setItem('publicBooksZoneWidth', booksZone.offsetWidth.toString());
        }
      }
    };
    
    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('touchmove', doResize, { passive: false });
    
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);
    
    // Восстанавливаем сохраненную ширину
    const savedWidth = localStorage.getItem('publicBooksZoneWidth');
    if (savedWidth) {
      libraryContent.style.setProperty('--public-books-zone-width', `${savedWidth}px`);
    } else {
      libraryContent.style.setProperty('--public-books-zone-width', '280px');
    }
  }

  function closePublicLibraryModal() {
    const modal = document.getElementById("public-library-modal");
    if (modal) {
      modal.style.display = "none";
    }
    // Закрываем активную книгу при закрытии модального окна
    closePublicActiveBookZone();
  }

  let publicBooks = []; // Список публичных книг

  async function loadPublicBooks() {
    const list = document.getElementById("publicBooksList");
    if (!list) return;
    
    try {
      list.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';
      
      const data = await apiRequest("/library/api/public-books?limit=200");
      if (data.success && data.books) {
        publicBooks = data.books;
        console.log('📚 Загружены публичные книги:', data.books.length);
        if (data.books.length > 0) {
          console.log('📚 Первая книга:', {
            id: data.books[0].id,
            creator_user_id: data.books[0].creator_user_id,
            creator_username: data.books[0].creator_username
          });
        }
        
        if (data.books.length === 0) {
          list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Публичных книг пока нет</div>';
          return;
        }
        
        // Используем функцию createMiniBookCard для единообразия
        list.innerHTML = data.books.map(book => createMiniBookCard(book)).join('');
        
        // Обновляем иконки Lucide
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          lucide.createIcons();
        }
        
        // Добавляем обработчики кликов на карточки
        list.querySelectorAll('.book-card-mini').forEach(card => {
          const bookId = parseInt(card.getAttribute('data-book-id'));
          const book = data.books.find(b => b.id === bookId);
          
          // Одиночный клик - выделить и показать детали
          card.addEventListener('click', async (e) => {
            if (e.target.closest('button')) return; // Игнорируем клики на кнопки
            setPublicActiveBook(bookId);
            // Загружаем полные данные книги через API
            try {
              const bookData = await apiRequest(`/library/api/book/${bookId}`);
              if (bookData.success && bookData.book) {
                openPublicActiveBookZone(bookData.book);
              } else if (book) {
                // Fallback на данные из списка
                openPublicActiveBookZone(book);
              }
            } catch (error) {
              console.error("Ошибка загрузки данных книги:", error);
              // Fallback на данные из списка
              if (book) {
                openPublicActiveBookZone(book);
              }
            }
          });
        });
      } else {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
      }
    } catch (error) {
      console.error("Ошибка загрузки публичных книг:", error);
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
    }
  }

  function setPublicActiveBook(bookId) {
    // Обновляем выделение в списке
    const list = document.getElementById("publicBooksList");
    if (list) {
      list.querySelectorAll('.book-card-mini').forEach(card => {
        if (parseInt(card.getAttribute('data-book-id')) === bookId) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }
  }

  async function openPublicActiveBookZone(book) {
    const zone = document.getElementById("publicActiveBookZone");
    const container = document.getElementById("publicActiveBookCard");
    if (!zone || !container) return;

    zone.style.display = 'flex';
    
    // Показываем разделитель
    const libraryContent = document.querySelector('.public-library-content');
    const resizer = document.getElementById('publicZoneResizer');
    if (libraryContent) {
      libraryContent.classList.add('has-active-book');
    }
    if (resizer) {
      resizer.style.display = 'block';
    }
    
    // Сохраняем данные книги в глобальной переменной для использования в карточках диктантов
    window.currentPublicBook = book;
    
    // Используем существующую функцию renderActiveBookCard для единообразия
    await renderActiveBookCard(book, container);
    
    // Загружаем разделы и диктанты
    await loadPublicBookContent(book.id);
    
    // Меняем обработчик кнопки закрытия - закрываем только активную книгу в модальном окне
    const closeBtn = container.querySelector('#btnCloseActiveBook');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePublicActiveBookZone();
      };
    }
    
    // Заменяем меню действий на кнопку "Добавить на полку"
    const actionsBtn = container.querySelector('#btnBookActions');
    const actionsMenu = container.querySelector('#bookActionsMenu');
    if (actionsBtn && actionsMenu) {
      // Удаляем старое меню и создаем простое
      actionsBtn.onclick = null;
      actionsMenu.innerHTML = '';
      
      const addToShelfBtn = document.createElement('button');
      addToShelfBtn.className = 'dropdown-menu-item';
      addToShelfBtn.innerHTML = '<i data-lucide="plus"></i><span>Добавить на мою полку</span>';
      addToShelfBtn.addEventListener('click', async () => {
        await addPublicBookToShelf(book.id);
      });
      actionsMenu.appendChild(addToShelfBtn);
      
      // Восстанавливаем обработчик меню
      actionsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = actionsMenu.style.display === 'block';
        actionsMenu.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
          setTimeout(() => {
            const closeMenuHandler = function(e) {
              if (!actionsMenu.contains(e.target) && !actionsBtn.contains(e.target)) {
                actionsMenu.style.display = 'none';
                document.removeEventListener('click', closeMenuHandler);
              }
            };
            document.addEventListener('click', closeMenuHandler);
          }, 0);
        }
      });
    }
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  async function loadPublicBookContent(bookId) {
    try {
      // Загружаем разделы и диктанты
      const sectionsData = await apiRequest(`/library/api/book/${bookId}/sections`);
      const dictationsData = await apiRequest(`/library/api/book/${bookId}/dictations`);
      
      const sections = sectionsData.success ? sectionsData.sections : [];
      const dictations = dictationsData.success ? dictationsData.dictations : [];
      
      // Используем функцию renderBookContent, но с другим контейнером
      renderPublicBookContent(sections, dictations);
    } catch (error) {
      console.error("Ошибка загрузки содержимого публичной книги:", error);
    }
  }

  function renderPublicBookContent(sections, dictations) {
    const container = document.getElementById("publicBookStructure");
    if (!container) return;
    
    // Используем ту же логику, что и в renderBookContent, но без кнопок редактирования
    if ((!sections || sections.length === 0) && (!dictations || dictations.length === 0)) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">В этой книге нет разделов и диктантов</div>';
      return;
    }

    let html = '<div class="book-structure-list">';
    
    // Отображаем разделы (без кнопок редактирования)
    if (sections && sections.length > 0) {
      sections.forEach(section => {
        const sectionNumber = section.section_number ? `§ ${section.section_number}. ` : '§ ';
        
        const toggleButton = `
              <button class="structure-item-toggle" data-section-id="${section.id}" title="Развернуть/свернуть">
                <i data-lucide="chevron-right"></i>
              </button>
        `;
        
        html += `
          <div class="structure-item structure-section" data-section-id="${section.id}">
            <div class="structure-item-header">
              ${toggleButton}
              <span class="structure-item-title">${sectionNumber}${section.title}</span>
            </div>
            <div class="structure-item-content" data-section-content-id="${section.id}" style="display: none;">
              <div class="section-dictations-loading" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">Загрузка...</div>
            </div>
          </div>
        `;
      });
    }
    
    // Отображаем диктанты
    if (dictations && dictations.length > 0) {
      html += '</div>'; // Закрываем book-structure-list
      html += '<div class="shorts-grid">';
      // Получаем данные книги из контекста
      const bookData = window.currentPublicBook || null;
      dictations.forEach(d => {
        html += createPublicDictationCard(d, bookData);
      });
      html += '</div>';
    } else {
      html += '</div>';
    }
    
    container.innerHTML = html;
    
    // Создаём иконки Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Добавляем обработчики для раскрытия разделов
    container.querySelectorAll('.structure-item-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sectionId = parseInt(btn.getAttribute('data-section-id'));
        await togglePublicSection(sectionId);
      });
    });
    
    // Добавляем обработчики для кнопок карточек диктантов
    attachPublicDictationCardHandlers(container);
    
    // Загружаем статистику и медальки для всех карточек диктантов
    setTimeout(() => {
      updateCompletionBadges(container);
    }, 100);
  }

  async function togglePublicSection(sectionId) {
    const sectionItem = document.querySelector(`#publicBookStructure .structure-section[data-section-id="${sectionId}"]`);
    if (!sectionItem) return;

    const toggleBtn = sectionItem.querySelector('.structure-item-toggle');
    const contentDiv = sectionItem.querySelector(`.structure-item-content[data-section-content-id="${sectionId}"]`);
    
    if (!contentDiv || !toggleBtn) return;

    const isExpanded = contentDiv.style.display !== 'none';
    
    let icon = toggleBtn.querySelector('i[data-lucide]');
    if (!icon) {
      icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'chevron-right');
      toggleBtn.innerHTML = '';
      toggleBtn.appendChild(icon);
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
    
    if (isExpanded) {
      contentDiv.style.display = 'none';
      icon.setAttribute('data-lucide', 'chevron-right');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      contentDiv.style.display = 'block';
      icon.setAttribute('data-lucide', 'chevron-down');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      const existingContent = contentDiv.querySelector('.section-dictations-grid, .section-dictations-empty');
      if (!existingContent || existingContent.classList.contains('section-dictations-loading')) {
        await loadPublicSectionDictations(sectionId, contentDiv);
      }
    }
  }

  async function loadPublicSectionDictations(sectionId, container) {
    try {
      const dictationsData = await apiRequest(`/library/api/book/${sectionId}/dictations`);
      const dictations = dictationsData.success ? dictationsData.dictations : [];
      
      const loadingDiv = container.querySelector('.section-dictations-loading');
      if (loadingDiv) {
        loadingDiv.remove();
      }
      
      if (dictations.length === 0) {
        container.innerHTML = '<div class="section-dictations-empty" style="padding: 10px; text-align: center; color: var(--color-text-secondary);">В этом разделе нет диктантов</div>';
        return;
      }
      
      // Рендерим диктанты как карточки (используем функцию для публичной библиотеки)
      let html = '<div class="section-dictations-grid shorts-grid">';
      // Получаем данные книги из контекста
      const bookData = window.currentPublicBook || null;
      dictations.forEach(d => {
        html += createPublicDictationCard(d, bookData);
      });
      html += '</div>';
      
      container.innerHTML = html;
      
      // Обновляем иконки и медальки
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      setTimeout(() => {
        updateCompletionBadges(container);
      }, 100);
    } catch (error) {
      console.error("Ошибка загрузки диктантов раздела:", error);
      container.innerHTML = '<div class="section-dictations-error" style="padding: 20px; text-align: center; color: var(--color-error);">Ошибка загрузки диктантов</div>';
    }
  }

  function attachPublicDictationCardHandlers(container) {
    // Обработчик кнопки "Взять в работу"
    container.querySelectorAll('[data-action="add-to-work"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dictationId = parseInt(btn.getAttribute('data-dictation-id'));
        const bookId = parseInt(btn.getAttribute('data-book-id'));
        await addDictationToWork(dictationId, bookId);
      });
    });
    
    // Обработчик кнопки "Просмотреть диктант"
    container.querySelectorAll('[data-action="view-dictation"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dictationId = parseInt(btn.getAttribute('data-dictation-id'));
        const bookIdAttr = btn.getAttribute('data-book-id');
        const bookId = bookIdAttr && bookIdAttr !== '' ? parseInt(bookIdAttr) : null;
        await openViewDictationModal(dictationId, bookId);
      });
    });
  }

  async function addDictationToWork(dictationId, bookId) {
    try {
      // Сначала добавляем книгу в библиотеку, если её там нет
      const bookData = await apiRequest(`/library/api/book/${bookId}/add-to-my`, {
        method: "POST",
        body: JSON.stringify({})
      });
      
      if (bookData.success) {
        // Теперь добавляем диктант на стол
        const deskData = await apiRequest(`/library/api/dictation/${dictationId}/add-to-desk`, {
          method: "POST",
          body: JSON.stringify({})
        });
        
        if (deskData.success) {
          showToast('Диктант добавлен в работу');
          // Обновляем иконку кнопки
          const btn = document.querySelector(`[data-action="add-to-work"][data-dictation-id="${dictationId}"]`);
          if (btn) {
            const icon = btn.querySelector('i[data-lucide]');
            if (icon) {
              icon.setAttribute('data-lucide', 'notebook-pen');
              if (typeof lucide !== 'undefined') {
                lucide.createIcons();
              }
            }
          }
        } else {
          showToast('Ошибка при добавлении диктанта в работу', 'error');
        }
      } else {
        showToast('Ошибка при добавлении книги в библиотеку', 'error');
      }
    } catch (error) {
      console.error("Ошибка добавления диктанта в работу:", error);
      showToast('Ошибка при добавлении диктанта в работу', 'error');
    }
  }

  async function openViewDictationModal(dictationId, bookId = null) {
    const modal = document.getElementById("view-dictation-modal");
    if (!modal) {
      console.error("Модальное окно view-dictation-modal не найдено");
      return;
    }
    
    modal.style.display = "flex";
    
    // Показываем индикатор загрузки
    const tbody = document.getElementById("view-dictation-sentences-tbody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Загрузка...</td></tr>';
    }
    
    try {
      console.log('📖 Загружаю данные диктанта:', dictationId);
      
      // Загружаем данные диктанта
      const dictationData = await apiRequest(`/api/dictation/${dictationId}`);
      console.log('📖 Данные диктанта получены:', dictationData);
      
      if (dictationData.success && dictationData.dictation) {
        const d = dictationData.dictation;
        
        // Устанавливаем заголовок
        const titleEl = document.getElementById("view-dictation-title");
        if (titleEl) {
          titleEl.textContent = d.title || 'Без названия';
        }
        
        // Устанавливаем обложку
        const coverImg = document.getElementById("view-dictation-cover-img");
        if (coverImg) {
          coverImg.src = d.cover_url || '/static/data/covers/cover_en.webp';
          coverImg.alt = d.title || 'Обложка диктанта';
        }
        
        
        // Устанавливаем ссылку на материалы автора
        const materialsLink = document.getElementById("view-dictation-materials-link");
        if (materialsLink) {
          if (d.author_materials_url) {
            materialsLink.href = d.author_materials_url;
            materialsLink.style.display = 'inline-flex';
          } else {
            materialsLink.style.display = 'none';
          }
        }
        
        // Загружаем предложения
        console.log('📖 Загружаю предложения диктанта:', dictationId);
        const sentencesData = await apiRequest(`/api/dictation/${dictationId}/sentences`);
        console.log('📖 Предложения получены:', sentencesData);
        
        if (sentencesData.success && sentencesData.sentences && sentencesData.sentences.length > 0) {
          if (tbody) {
            tbody.innerHTML = sentencesData.sentences.map((sentence, index) => {
              const audioUrl = sentence.audio || '';
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${sentence.text || ''}</td>
                  <td>
                    ${audioUrl ? `
                      <button class="btn-play-audio" data-audio-url="${audioUrl}" title="Проиграть">
                        <i data-lucide="play"></i>
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('');
            
            // Добавляем обработчики для кнопок проигрывания через AudioManager
            // AudioManager доступен глобально после загрузки audio_manager.js
            const audioMgr = typeof audioManager !== 'undefined' ? audioManager : (typeof window.AudioManager !== 'undefined' ? window.AudioManager : null);
            if (audioMgr && typeof audioMgr.play === 'function') {
              tbody.querySelectorAll('.btn-play-audio').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const audioUrl = btn.getAttribute('data-audio-url');
                  if (audioUrl) {
                    audioMgr.play(btn, audioUrl);
                  }
                });
              });
            } else {
              console.warn('AudioManager не найден, используем стандартное воспроизведение');
              tbody.querySelectorAll('.btn-play-audio').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  const audioUrl = btn.getAttribute('data-audio-url');
                  if (audioUrl) {
                    const audio = new Audio(audioUrl);
                    audio.play().catch(err => console.error("Ошибка воспроизведения:", err));
                  }
                });
              });
            }
          }
        } else {
          if (tbody) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--color-text-secondary);">В диктанте нет предложений</td></tr>';
          }
        }
        
        // Обновляем иконки
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      } else {
        console.error("Некорректные данные диктанта:", dictationData);
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--color-error);">Ошибка загрузки данных диктанта</td></tr>';
        }
        showToast('Ошибка загрузки данных диктанта', 'error');
      }
    } catch (error) {
      console.error("Ошибка загрузки данных диктанта:", error);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--color-error);">Ошибка: ${error.message || 'Неизвестная ошибка'}</td></tr>`;
      }
      showToast(`Ошибка загрузки данных диктанта: ${error.message || 'Неизвестная ошибка'}`, 'error');
    }
  }

  function closePublicActiveBookZone() {
    const zone = document.getElementById("publicActiveBookZone");
    if (zone) {
      zone.style.display = 'none';
    }
    
    const libraryContent = document.querySelector('.public-library-content');
    const resizer = document.getElementById('publicZoneResizer');
    if (libraryContent) {
      libraryContent.classList.remove('has-active-book');
    }
    if (resizer) {
      resizer.style.display = 'none';
    }
    
    // Убираем выделение
    const list = document.getElementById("publicBooksList");
    if (list) {
      list.querySelectorAll('.book-card-mini').forEach(card => {
        card.classList.remove('active');
      });
    }
  }

  async function addPublicBookToShelf(bookId) {
    try {
      const data = await apiRequest(`/library/api/book/${bookId}/add-to-my`, {
        method: "POST",
        body: JSON.stringify({})
      });
      
      if (data.success) {
        // Закрываем модальное окно публичной библиотеки
        closePublicLibraryModal();
        // Обновляем список книг
        await loadBooksFromAPI();
        // Открываем книгу в основной библиотеке
        const bookData = await apiRequest(`/library/api/book/${bookId}`);
        if (bookData.success && bookData.book) {
          setActiveBook(bookId);
          openActiveBookZone(bookData.book);
        }
        showToast('Книга добавлена на вашу полку');
      } else {
        showToast('Ошибка при добавлении книги на полку', 'error');
      }
    } catch (error) {
      console.error("Ошибка добавления книги на полку:", error);
      showToast('Ошибка при добавлении книги на полку');
    }
  }

  // Инициализация селектора языка для панели "Мои книги"
  function initializeBooksLanguageSelector() {
    try {
      const container = document.getElementById('booksLanguageSelector');
      if (!container) {
        console.warn('⚠️ Контейнер booksLanguageSelector не найден, повторная попытка через 100ms');
        setTimeout(initializeBooksLanguageSelector, 100);
        return;
      }

      const userSettings = window.USER_LANGUAGE_DATA;
      
      if (!userSettings) {
        console.warn('⚠️ USER_LANGUAGE_DATA не загружен');
        return;
      }

      if (typeof window.initLanguageSelector === 'function') {
        const options = {
          mode: 'learning-selector-compact',
          currentLearning: userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en',
          learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
          languageData: window.LanguageManager.getLanguageData(),
          onLanguageChange: function (values) {
            console.log('🔄 Изменение языка изучения в панели "Мои книги":', values);
            // Здесь можно добавить логику обновления фильтрации книг по языку
          }
        };

        console.log('🎯 Создаем LanguageSelector для панели "Мои книги"');
        const selector = window.initLanguageSelector('booksLanguageSelector', options);
        
        if (selector) {
          console.log('✅ Селектор языка успешно инициализирован');
        } else {
          console.warn('❌ LanguageSelector не был создан');
        }
      } else {
        console.warn('❌ Функция initLanguageSelector не найдена');
      }
    } catch (error) {
      console.error('❌ Ошибка инициализации языкового селектора:', error);
    }
  }

  // Функция для загрузки данных после авторизации
  function loadLibraryData() {
    ensureDeskCacheIndicator();
    refreshOfflineCacheStatus();
    loadDeskItems();
    loadBooksFromAPI();
  }

  // Инициализация при загрузке страницы
  document.addEventListener("DOMContentLoaded", async () => {
    installEventHandlers();

    checkAppCacheRevision().catch(() => {});

    ensureDeskCacheIndicator();
    refreshOfflineCacheStatus();
    
    // Ждем пока UserManager инициализируется и завершит валидацию токена
    const waitForUserManager = setInterval(() => {
      if (window.UM && typeof window.UM.isAuthenticated === 'function') {
        // КРИТИЧНО: ждем завершения асинхронной инициализации
        // UserManager инициализируется асинхронно через init(), нужно дождаться isInitialized
        if (window.UM.isInitialized) {
          clearInterval(waitForUserManager);

          // Если в оффлайне были накоплены activity/success, пробуем дослать их сразу при загрузке страницы
          // (это позволяет закрыть страницу диктанта, а потом открыть стол и синкнуть данные на сервер)
          syncOfflineOutboxes().catch(() => {});
          
          // Инициализируем USER_LANGUAGE_DATA (как на index странице)
          const isAuthenticated = window.UM.isAuthenticated();
          if (isAuthenticated) {
            const user = window.UM.getCurrentUser();
            if (user) {
              window.USER_LANGUAGE_DATA = {
                nativeLanguage: user.native_language || 'ru',
                learningLanguages: user.learning_languages || ['en'],
                currentLearning: user.current_learning || user.learning_languages?.[0] || 'en',
                isAuthenticated: true
              };
            }
          } else {
            window.USER_LANGUAGE_DATA = {
              nativeLanguage: 'ru',
              learningLanguages: ['en'],
              currentLearning: 'en',
              isAuthenticated: false
            };
          }
          
          // Инициализируем селектор языка после загрузки данных пользователя
          // Используем setTimeout для гарантии готовности DOM
          setTimeout(() => {
            initializeBooksLanguageSelector();
          }, 100);
          
          // Загружаем данные только если пользователь авторизован
          if (isAuthenticated) {
            console.log('📚 Пользователь авторизован, загружаем данные библиотеки');
            ensureDeskCacheIndicator();
            refreshOfflineCacheStatus();
            loadDeskItems();
            loadBooksFromAPI();
            syncOfflineOutboxes().catch(() => {}); // Trigger offline outbox sync on page load after UserManager initialization
          } else {
            console.log('⚠️ Пользователь не авторизован, данные не загружаются');
            ensureDeskCacheIndicator();
            refreshOfflineCacheStatus();
            loadDeskItems();
          }
        }
        // Если UserManager еще не инициализирован, продолжаем ждать
      }
    }, 100);
    
    // Слушаем событие успешного логина/регистрации
    window.addEventListener('user-logged-in', () => {
      console.log('✅ Пользователь авторизован, загружаем данные библиотеки');
      // Обновляем USER_LANGUAGE_DATA
      if (window.UM && window.UM.isAuthenticated()) {
        const user = window.UM.getCurrentUser();
        if (user) {
          window.USER_LANGUAGE_DATA = {
            nativeLanguage: user.native_language || 'ru',
            learningLanguages: user.learning_languages || ['en'],
            currentLearning: user.current_learning || user.learning_languages?.[0] || 'en',
            isAuthenticated: true
          };
          // Перезагружаем селектор языка
          setTimeout(() => {
            initializeBooksLanguageSelector();
          }, 100);
          // Загружаем данные
          loadLibraryData();
        }
      }
    });
    
    // Таймаут на случай, если UserManager не загрузится
    setTimeout(() => {
      clearInterval(waitForUserManager);
      if (!window.USER_LANGUAGE_DATA) {
        window.USER_LANGUAGE_DATA = {
          nativeLanguage: 'ru',
          learningLanguages: ['en'],
          currentLearning: 'en',
          isAuthenticated: false
        };
        setTimeout(() => {
          initializeBooksLanguageSelector();
        }, 100);
        ensureDeskCacheIndicator();
        refreshOfflineCacheStatus();
        loadDeskItems();
        loadBooksFromAPI();
      }
    }, 5000);
  });
})();

