// Скрипт для новой страницы приватной библиотеки

var __APP_BUILD_LOCAL = (window && window.__APP_BUILD) ? String(window.__APP_BUILD || '').trim() : '';

let bookEditDirty = false;

function setBookEditDirty(nextDirty) {
  bookEditDirty = !!nextDirty;
  const star = document.getElementById('book-edit-unsaved-star');
  if (star) {
    star.style.display = bookEditDirty ? 'inline' : 'none';
  }
}

let __selectedBookDictationCard = null;

function getDefaultOriginalLanguageForNewBook() {
  try {
    const fromFilter = (typeof currentBooksFilterLanguage !== 'undefined')
      ? currentBooksFilterLanguage
      : null;
    const fromSelector = (booksLanguageSelectorInstance && typeof booksLanguageSelectorInstance.getValues === 'function')
      ? (booksLanguageSelectorInstance.getValues() || {}).currentLearning
      : null;
    const fromUser = window.USER_LANGUAGE_DATA?.currentLearning || null;
    const raw = fromFilter || fromSelector || fromUser || null;
    if (!raw) return null;
    const v = String(raw).trim().toLowerCase();
    if (!v || v === 'all') return null;
    return v;
  } catch (e) {
    return null;
  }
}

// Debug helper: capture clicks globally to understand if modal buttons are actually receiving events.
// (Useful when something overlays the button or stops propagation.)
// Вспомогательная функция отладки: глобально перехватывает клики, чтобы понять, получают ли кнопки модального окна события.
// (Полезно, когда что-то перекрывает кнопку или препятствует распространению событий.)
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

let bookLanguageSelector = null;
let booksLanguageSelectorInstance = null;
let publicBooksLanguageSelectorInstance = null;
let activeBookId = null;
let activeBookIsWorkbook = false;
let bookViewActiveBookId = null;
let currentView = 'cards'; // 'cards' or 'list'
let deskItems = []; // Список диктантов на столе
let deskLoadSeq = 0;
let deskLoadInFlight = null;
let pendingDeleteDictationId = null;

let lastOwnBooks = [];
let lastShelfBooks = [];
let currentBooksFilterLanguage = null;
let currentPublicBooksFilterLanguage = null;
let pendingDeleteSectionId = null;

function getToken() {
  return localStorage.getItem("jwt_token");
}

function getBookCroppedCoverBlob() {
  try {
    const m = window.CoverManager;
    if (m && typeof m.getCroppedBlob === 'function') {
      return m.getCroppedBlob();
    }
  } catch (e) {
  }
  return null;
}

function clearBookCroppedCoverBlob() {
  try {
    const m = window.CoverManager;
    if (m && typeof m.clearCroppedBlob === 'function') {
      m.clearCroppedBlob();
      return;
    }
  } catch (e) {
  }
}

function bindCoverHandlers() {
  try {
    const m = window.CoverManager;
    if (!m || typeof m.bind !== 'function') return;

    m.bind({
      fileInputId: 'book-cover-upload',
      uploadBtnId: 'book-cover-upload-btn',
      clickableId: 'book-cover-clickable',
      previewImgId: 'book-cover-preview',
      placeholderId: 'book-cover-placeholder',
      aspectRatio: 1,
      outputWidth: 200,
      outputHeight: 200,
      outputType: 'image/webp',
      outputQuality: 0.95,
      maxFileSizeBytes: 5 * 1024 * 1024,
      successToast: 'Обложка готова к сохранению',
      onDirty: () => {
        try { setBookEditDirty(true); } catch (e) {}
      },
      onConfirm: () => {
        try { setBookEditDirty(true); } catch (e) {}
      },
    });
  } catch (e) {
  }
}

async function idbPut(storeName, value) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbPut === 'function') {
    return idb.idbPut(storeName, value);
  }
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
  const idb = window.IdbManager;
  if (idb && typeof idb.idbDelete === 'function') {
    return idb.idbDelete(storeName, key);
  }
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

async function idbDeleteDictationCache(dictationId) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbDeleteDictationCache === 'function') {
    return idb.idbDeleteDictationCache(dictationId);
  }
  try {
    const dictId = String(dictationId || '').trim();
    if (!dictId) return;
    const rows = await idbGetAll('dictations');
    for (const row of rows || []) {
      try {
        if (row && String(row.dictationId || '') === dictId && row.key) {
          await idbDelete('dictations', row.key);
        }
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

async function idbGetAll(storeName) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbGetAll === 'function') {
    return idb.idbGetAll(storeName);
  }
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
  if (window && window.BuildHelpers && typeof window.BuildHelpers.withCacheBust === 'function') {
    return window.BuildHelpers.withCacheBust(url, __APP_BUILD_LOCAL);
  }
  return url;
}

function withCacheBustVersion(url, version) {
  if (window && window.BuildHelpers && typeof window.BuildHelpers.withCacheBustVersion === 'function') {
    return window.BuildHelpers.withCacheBustVersion(url, version, __APP_BUILD_LOCAL);
  }
  return url;
}

function maybeCacheBustDictationCover(url) {
  try {
    const u = String(url || '');
    if (!u) return u;
    if (u.startsWith('/api/dictations_covers/')) {
      return withCacheBust(u);
    }
    return u;
  } catch (e) {
    return url;
  }
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
      a.play().catch(() => { });
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
    const old = document.getElementById('swStatusBar');
    if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }
  } catch (e) {
  }
  return null;
}

function setSwStatus(message, opts = {}) {
  try {
    // Route to the global status bar (sw_status_bar.js)
    if (typeof window.setSwStatus === 'function') {
      window.setSwStatus(message, opts);
      return;
    }
  } catch (e) {
  }
  // If global bar is not available, ensure we don't show legacy bar.
  try { ensureSwStatusBar(); } catch (e2) { }
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
  const idb = window.IdbManager;
  if (idb && typeof idb.openDraftDb === 'function') {
    return idb.openDraftDb();
  }
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open('dictafan_drafts');
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
      if (!db.objectStoreNames.contains('media_manifest')) {
        db.createObjectStore('media_manifest', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, key) {
  const idb = window.IdbManager;
  if (idb && typeof idb.idbGet === 'function') {
    return idb.idbGet(storeName, key);
  }
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
  try {
    if (typeof window.setSwBarProgress === 'function') {
      window.setSwBarProgress('', null, 'cache');
    }
  } catch (e0) {
  }
  try {
    const res = await swRequest('cacheStats');
    const bytes = res.stats?.totalBytes || 0;
    const entries = res.stats?.entries || 0;
    const maxBytes = res.stats?.maxBytes || 0;

    try {
      if (typeof window.setSwBarProgress === 'function') {
        const mb = 1024 * 1024;
        const usedMb = Math.max(0, bytes) / mb;
        const maxMb = Math.max(0, maxBytes) / mb;
        const usedText = (usedMb >= 10) ? String(Math.round(usedMb)) : usedMb.toFixed(1);
        const maxText = maxMb > 0 ? String(Math.round(maxMb)) : '0';
        const label = `${usedText}/${maxText}`;
        const pct = maxBytes > 0 ? Math.max(0, Math.min(100, (bytes / maxBytes) * 100)) : null;
        window.setSwBarProgress(label, pct, 'cache');
      }
    } catch (e1) {
    }
  } catch (e) {
    try {
      if (typeof window.setSwBarProgress === 'function') {
        window.setSwBarProgress('', null, 'cache');
      }
    } catch (e2) {
    }
  }
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

function openBookViewModal() {
  const modal = document.getElementById('book-view-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function closeBookViewModal() {
  const modal = document.getElementById('book-view-modal');
  if (!modal) return;
  modal.style.display = 'none';
  bookViewActiveBookId = null;
  activeBookId = null;
  activeBookIsWorkbook = false;
  const card = document.getElementById('bookViewCard');
  const structure = document.getElementById('bookViewStructure');
  if (card) card.innerHTML = '';
  if (structure) structure.innerHTML = '';
}

async function openBookViewBook(bookId, isWorkbook = false) {
  const idNum = parseInt(String(bookId || ''), 10);
  if (!idNum || !isFinite(idNum)) return;

  openBookViewModal();

  bookViewActiveBookId = idNum;
  activeBookId = idNum;
  activeBookIsWorkbook = !!isWorkbook;

  const card = document.getElementById('bookViewCard');
  const structure = document.getElementById('bookViewStructure');
  if (!card || !structure) return;

  // Загружаем книгу
  const bookData = await apiRequest(`/library/api/book/${idNum}`);
  if (bookData && bookData.success && bookData.book) {
    const titleEl = document.getElementById('book-view-title');
    if (titleEl) titleEl.textContent = bookData.book.title || 'Книга';
    renderActiveBookCard(bookData.book, card, { onClose: closeBookViewModal });
  }

  // Загружаем структуру
  let sections = [];
  let dictations = [];
  if (isWorkbook) {
    const orphanData = await apiRequest(`/library/api/orphan-dictations`);
    dictations = orphanData.success ? orphanData.dictations : [];
  } else {
    const sectionsData = await apiRequest(`/library/api/book/${idNum}/sections`);
    const dictationsData = await apiRequest(`/library/api/book/${idNum}/dictations`);
    sections = sectionsData.success ? sectionsData.sections : [];
    dictations = dictationsData.success ? dictationsData.dictations : [];
    window.currentBookSections = sections;
  }

  renderBookContentTo(structure, sections, dictations, isWorkbook);
}

async function toggleSectionInContainer(sectionId, rootContainer) {
  if (!rootContainer) return;
  const sectionItem = rootContainer.querySelector(`.structure-section[data-section-id="${String(sectionId)}"]`);
  if (!sectionItem) return;

  const toggleBtn = sectionItem.querySelector('.structure-item-toggle');
  const contentDiv = sectionItem.querySelector(`.structure-item-content[data-section-content-id="${String(sectionId)}"]`);
  if (!toggleBtn || !contentDiv) return;

  const icon = toggleBtn.querySelector('i[data-lucide]');
  const expanded = contentDiv.style.display !== 'none';

  if (expanded) {
    contentDiv.style.display = 'none';
    if (icon) icon.setAttribute('data-lucide', 'chevron-right');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  contentDiv.style.display = 'block';
  if (icon) icon.setAttribute('data-lucide', 'chevron-down');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const existingContent = contentDiv.querySelector('.section-dictations-grid, .section-dictations-empty');
  if (existingContent) return;

  try {
    await loadSectionDictations(sectionId, contentDiv);
  } catch (e) {
    console.warn('[toggleSectionInContainer] loadSectionDictations failed', e);
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
function normalizeUrlForSwPrefetch(rawUrl) {
  try {
    let v = String(rawUrl || '').trim();
    if (!v) return '';
    if (v.startsWith('blob:')) return v;

    // Normalize absolute URLs: enforce https on https pages and prefer same-origin relative path.
    try {
      if (v.startsWith('http://') || v.startsWith('https://')) {
        const u = new URL(v);
        const desiredProtocol = (typeof location !== 'undefined' && location && location.protocol)
          ? location.protocol
          : u.protocol;
        if (desiredProtocol === 'https:' && u.protocol === 'http:') {
          u.protocol = 'https:';
        }
        try {
          if (typeof location !== 'undefined' && location && u.origin === location.origin) {
            v = `${u.pathname}${u.search || ''}`;
          } else {
            v = u.toString();
          }
        } catch (e) {
          v = `${u.pathname}${u.search || ''}`;
        }
      }
    } catch (e) {
    }

    // Safety: never keep plain http URL on an https page.
    try {
      if (v.startsWith('http://') && typeof location !== 'undefined' && location && location.protocol === 'https:') {
        v = `https://${v.slice('http://'.length)}`;
      }
    } catch (e) {
    }

    // Ensure leading slash for same-origin relative requests.
    if (!v.startsWith('/') && (v.startsWith('api/') || v.startsWith('api\\'))) {
      v = `/${v}`;
    }

    return v;
  } catch (e) {
    return String(rawUrl || '').trim();
  }
}

function areDeskItemEffectivelyEqual(a, b) {
  const x = a || {};
  const y = b || {};
  return (
    String(x.id || '') === String(y.id || '')
    && String(x.dictation_id || '') === String(y.dictation_id || '')
    && String(x.cover_url || '') === String(y.cover_url || '')
    && String(x.title || '') === String(y.title || '')
    && String(x.language_code || '') === String(y.language_code || '')
    && String(x.language_translation || '') === String(y.language_translation || '')
    && String(x.level || '') === String(y.level || '')
    && String(x.sentences_count || '') === String(y.sentences_count || '')
  );
}

function applyDeskItemsIncremental(prevItems, nextItems) {
  const container = document.getElementById('deskCardsContainer');
  if (!container) return { applied: false };

  const grid = container.querySelector('.shorts-grid');
  if (!grid) return { applied: false };

  const prev = Array.isArray(prevItems) ? prevItems : [];
  const next = Array.isArray(nextItems) ? nextItems : [];

  const prevById = new Map(prev.map(x => [String(x && x.id), x]));
  const nextById = new Map(next.map(x => [String(x && x.id), x]));

  const removed = [];
  const added = [];
  const updated = [];

  for (const item of prev) {
    const id = String(item && item.id);
    if (!nextById.has(id)) removed.push(item);
  }
  for (const item of next) {
    const id = String(item && item.id);
    if (!prevById.has(id)) {
      added.push(item);
    } else {
      const prevItem = prevById.get(id);
      if (!areDeskItemEffectivelyEqual(prevItem, item)) {
        updated.push(item);
      }
    }
  }

  for (const item of removed) {
    try {
      const card = grid.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
      if (card) card.remove();
    } catch (e) {
    }
    try {
      localStorage.removeItem(getDeskCardPosStorageKey(String(item.id)));
    } catch (e) {
    }
  }

  for (const item of updated) {
    try {
      const existing = grid.querySelector(`.desk-card[data-desk-item-id="${String(item.id)}"]`);
      if (!existing) continue;
      const wrap = document.createElement('div');
      wrap.innerHTML = createDictationCard(item, true);
      const fresh = wrap.firstElementChild;
      if (fresh) {
        existing.replaceWith(fresh);
      }
    } catch (e) {
    }
  }

  for (const item of added) {
    insertDeskCardElement(item, 'start');
  }

  try {
    const remaining = grid.querySelectorAll('.desk-card').length;
    if (!remaining) {
      container.innerHTML = '<div style="padding: 20px; color: var(--color-text-secondary);">Рабочий стол пуст</div>';
    }
  } catch (e) {
  }

  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (e) {
  }

  try {
    if (isDeskFreeLayoutEnabled() || hasAnyDeskCardPositions(container)) {
      enableDeskFreeLayout(container);
      installDeskDragAndDrop(container);
    }
  } catch (e) {
  }

  requestAnimationFrame(() => {
    (async () => {
      try {
        await applyDeskCovers(container);
        updateDictationCardsStats(container);
        await updateCompletionBadges(container);
      } catch (e) {
      }
    })().catch(() => { });
  });

  return { applied: true, added: added.length, removed: removed.length, updated: updated.length };
}

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
  let cachedItemsSnapshot = [];

  try {
    const cached = await idbGet('desk_items', 'latest');
    const items = cached && Array.isArray(cached.items) ? cached.items : [];
    if (items.length) {
      if (seq !== deskLoadSeq) {
        resolveInFlight();
        return;
      }
      deskItems = items;
      cachedItemsSnapshot = items;
      if (typeof renderDeskCards === 'function' && deskItems.length > 0) {
        renderDeskCards(deskItems);
      }
      updateInWorkIndicators();
      try {
        if (typeof refreshDeskOutboxIndicator === 'function') {
          refreshDeskOutboxIndicator().catch(() => { });
        }
      } catch (e) {
      }
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

      const prevSnapshot = Array.isArray(cachedItemsSnapshot) ? cachedItemsSnapshot : [];
      const nextSnapshot = Array.isArray(data.items) ? data.items : [];

      // If desk was rendered from cache, reconcile removed items and purge their cached dictation media.
      // This is important for cross-tab/cross-device cleanup after a dictation is deleted on the server.
      try {
        const prev = Array.isArray(cachedItemsSnapshot) ? cachedItemsSnapshot : [];
        const next = Array.isArray(data.items) ? data.items : [];
        if (renderedFromCache && prev.length) {
          const nextSet = new Set(next.map(x => String(x && x.dictation_id)));
          const removed = prev.filter(x => x && !nextSet.has(String(x.dictation_id)));
          for (const item of removed) {
            try {
              const did = item && item.dictation_id ? String(item.dictation_id) : '';
              if (!did) continue;
              try {
                await swRequest('purgeDictation', { dictationId: did, timeoutMs: 60000 });
              } catch (e) {
              }
              try {
                await idbDeleteDictationCache(`dict_${did}`);
              } catch (e) {
              }
            } catch (e) {
            }
          }
        }
      } catch (e) {
      }

      // Merge with locally cached items to avoid wiping the desk if the server
      // temporarily returns an incomplete list (e.g. dictations missing in JOIN,
      // offline-only cached items, etc.).
      const serverItems = Array.isArray(data.items) ? data.items : [];
      const prevItems = Array.isArray(deskItems) ? deskItems : [];
      const merged = (() => {
        try {
          const byDictationId = new Map();
          // Prefer server items first (authoritative), then keep any local-only items.
          for (const it of serverItems) {
            if (!it) continue;
            const k = String(it.dictation_id ?? it.id ?? '');
            if (!k) continue;
            byDictationId.set(k, it);
          }
          for (const it of prevItems) {
            if (!it) continue;
            const k = String(it.dictation_id ?? it.id ?? '');
            if (!k) continue;
            if (!byDictationId.has(k)) {
              byDictationId.set(k, { ...it, __local_only: true });
            }
          }
          return Array.from(byDictationId.values());
        } catch (e) {
          return serverItems.length ? serverItems : prevItems;
        }
      })();

      deskItems = merged;
      try {
        await idbPut('desk_items', { key: 'latest', updatedAt: Date.now(), items: deskItems });
      } catch (e) {
      }

      if (renderedFromCache && prevSnapshot.length) {
        const res = applyDeskItemsIncremental(prevSnapshot, nextSnapshot);
        if (!res || !res.applied) {
          if (typeof renderDeskCards === 'function') {
            renderDeskCards(deskItems);
          }
        }
      } else {
        if (typeof renderDeskCards === 'function') {
          renderDeskCards(deskItems);
        }
      }
      // Обновляем индикаторы "в работе" в карточках диктантов
      updateInWorkIndicators();
      try {
        if (typeof refreshDeskOutboxIndicator === 'function') {
          refreshDeskOutboxIndicator().catch(() => { });
        }
      } catch (e) {
      }
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
  // Синхронизируем состояние карточек в книге с тем, на столе диктант или нет:
  // - фон карточки
  // - кнопка add/remove desk (стрелка вверх/вниз) в левом нижнем углу
  document.querySelectorAll('.short-card[data-dictation-id]:not(.desk-card)').forEach(card => {
    const dictationId = card.dataset.dictationId;
    if (!dictationId) return;

    const isOnDesk = isDictationOnDesk(dictationId);
    card.classList.toggle('short-card--on-desk', !!isOnDesk);
    card.classList.toggle('short-card--off-desk', !isOnDesk);

    const btn = card.querySelector('[data-action="toggle-desk-explicit"]');
    if (btn) {
      btn.setAttribute('title', isOnDesk ? 'Убрать со стола' : 'Добавить на стол');
      btn.setAttribute('aria-label', isOnDesk ? 'Убрать со стола' : 'Добавить на стол');
      const icon = btn.querySelector('i[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash');
      }
      try {
        if (window.lucide) lucide.createIcons();
      } catch (e) {
      }
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
        await idbDeleteDictationCache(`dict_${dictationId}`);
      } catch (e) {
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

  // Same safety merge as in loadDeskItems(): keep local cached items that are missing
  // from server response, so desk UI won't suddenly lose cards.
  const nextMerged = (() => {
    try {
      const byDictationId = new Map();
      for (const it of next) {
        if (!it) continue;
        const k = String(it.dictation_id ?? it.id ?? '');
        if (!k) continue;
        byDictationId.set(k, it);
      }
      for (const it of prev) {
        if (!it) continue;
        const k = String(it.dictation_id ?? it.id ?? '');
        if (!k) continue;
        if (!byDictationId.has(k)) {
          byDictationId.set(k, { ...it, __local_only: true });
        }
      }
      return Array.from(byDictationId.values());
    } catch (e) {
      return next;
    }
  })();

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

  deskItems = nextMerged;
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
  try {
    if (typeof refreshDeskOutboxIndicator === 'function') {
      refreshDeskOutboxIndicator().catch(() => { });
    }
  } catch (e) {
  }
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
      showLoadingIndicator('Добавляю на рабочий стол…');

      console.log('===DESK_TOGGLE=== add flow: fast path (no prefetch)', { dictationId: String(dictationId) });

      // Жёсткое правило: диктант можно добавить на стол только если ассеты влезают в оффлайн-лимит
      // (HTML страница диктанта + JS/CSS + аудио + обложка). Если не влезает — не добавляем.
      // NOTE: перенесено в отдельный flow "обновить кеш" (см. TODO). Здесь мы работаем только с базой данных.

      const addData = await apiRequest(`/library/api/dictation/${dictationId}/add-to-desk`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      console.log('===DESK_TOGGLE=== add-to-desk response', {
        dictationId: String(dictationId),
        success: Boolean(addData && addData.success),
        error: addData && (addData.error || addData.message) ? String(addData.error || addData.message) : '',
      });

      // Treat "added: false" (already exists) as non-error, but don't claim it was added.
      const wasAdded = !!(addData && addData.success && (addData.added === true || addData.added === 1));

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
        // NOTE: отключено. Добавление на рабочий стол работает только с базой данных.

        refreshOfflineCacheStatus();
        completeLoadingIndicator(wasAdded ? 'Диктант добавлен на рабочий стол' : 'Диктант уже на рабочем столе', 1000);
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

// Создает карточку диктанта (для стола или для книги)
// item - объект с данными диктанта
// isDeskCard - true для карточки на столе, false для карточки в книге
function createDictationCard(item, isDeskCard = false) {
  if (isDeskCard) {
    // Карточка для рабочего стола
    const dictationId = item.dictation_id;
    const dictationIdFormatted = `dict_${dictationId}`;
    const langOriginal = item.language_code || 'en';
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    const availableTranslations = Array.isArray(item.translation_languages)
      ? item.translation_languages.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = (nativeLang && availableTranslations.includes(nativeLang))
      ? nativeLang
      : '';

    const langTranslation = preferredNative || item.language_translation || nativeLang || item.language_code || 'en';
    const openUrl = `/dictation/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const editUrl = `/dictation_editor/${dictationIdFormatted}/${langOriginal}/${langTranslation}`;
    const coverUrl = maybeCacheBustDictationCover(item.cover_url);

    const sentencesCount = typeof item.sentences_count === 'number'
      ? item.sentences_count
      : (parseInt(item.sentences_count, 10) || 0);

    const langPair = `${langOriginal}`;

    return `
        <div class="short-card desk-card" data-dictation-id="${dictationId}" data-desk-item-id="${item.id}">
          <div class="short-thumb" data-href="${openUrl}" role="link" tabindex="0">
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-cover-url="${coverUrl || ''}" alt="" class="short-cover" loading="lazy">
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
            <div class="dropdown-menu-wrapper short-actions-menu-wrapper">
              <button class="short-action-btn short-action-btn--kebab" data-action="toggle-card-actions" title="Действия" aria-label="Действия">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu short-card-actions-menu" style="display: none;">
                <a class="dropdown-menu-item" href="${editUrl}" onclick="event.stopPropagation();">
                  <i data-lucide="pencil-ruler"></i>
                  <span>Редактировать</span>
                </a>
                <button class="dropdown-menu-item" data-action="show-in-book" data-dictation-id="${dictationId}">
                  <i data-lucide="book-marked"></i>
                  <span>Показать в книге</span>
                </button>
                <button class="dropdown-menu-item" data-action="remove-from-desk" data-desk-item-id="${item.id}" data-dictation-id="${dictationId}">
                  <i data-lucide="arrow-big-down-dash"></i>
                  <span>Убрать со стола</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
  } else {
    // Карточка для книги
    const d = item;
    const coverUrl = d.cover_url || '/static/data/covers/cover_en.webp';

    // Определяем языки для URL
    const langOriginal = d.language_original || d.language_code || 'en';
    const nativeLang = (window.USER_LANGUAGE_DATA && window.USER_LANGUAGE_DATA.nativeLanguage)
      ? String(window.USER_LANGUAGE_DATA.nativeLanguage).toLowerCase()
      : '';

    const availableTranslations = Array.isArray(d.translation_languages)
      ? d.translation_languages.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const preferredNative = (nativeLang && availableTranslations.includes(nativeLang))
      ? nativeLang
      : '';

    const langTranslation = preferredNative || d.language_translation || nativeLang || d.language_code || 'en';

    // ID в формате dict_X для URL
    const dictationId = d.dictation_id || `dict_${d.id}`;
    const dbId = d.db_id || d.id;

    // URL для редактирования (используем формат dict_X)
    const editUrl = `/dictation_editor/${dictationId}/${langOriginal}/${langTranslation}`;

    // Проверяем, находится ли диктант на столе
    const isOnDesk = isDictationOnDesk(dbId);

    const langPair = `${langOriginal}`;
    const sentencesCount = typeof d.sentences_count === 'number'
      ? d.sentences_count
      : (parseInt(d.sentences_count, 10) || 0);

    // Медалька будет добавлена асинхронно через updateCompletionBadges
    // Статистика (звезды/полузвезды/микрофон) убрана - она только на столе

    return `
        <div class="short-card ${isOnDesk ? 'short-card--on-desk' : 'short-card--off-desk'}" data-dictation-id="${dbId}" data-action="toggle-desk" data-edit-url="${editUrl}">
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
            <button class="short-action-btn short-action-btn--kebab short-desk-toggle-btn" data-action="toggle-desk-explicit" data-dictation-id="${dbId}" title="${isOnDesk ? 'Убрать со стола' : 'Добавить на стол'}" aria-label="${isOnDesk ? 'Убрать со стола' : 'Добавить на стол'}">
              <i data-lucide="${isOnDesk ? 'arrow-big-down-dash' : 'arrow-big-up-dash'}"></i>
            </button>
            <div class="short-dikt-number">${dictationId}</div>
            <div class="dropdown-menu-wrapper short-actions-menu-wrapper">
              <button class="short-action-btn short-action-btn--kebab" data-action="toggle-card-actions" title="Действия" aria-label="Действия">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu short-card-actions-menu" style="display: none;">
                <a class="dropdown-menu-item" href="${editUrl}" onclick="event.stopPropagation();">
                  <i data-lucide="pencil-ruler"></i>
                  <span>Редактировать</span>
                </a>
                <button class="dropdown-menu-item" data-action="move-dictation" data-dictation-id="${dbId}">
                  <i data-lucide="folder-symlink"></i>
                  <span>Переместить</span>
                </button>
                <button class="dropdown-menu-item dropdown-menu-item-danger" data-action="delete-dictation" data-dictation-id="${dbId}">
                  <i data-lucide="trash-2"></i>
                  <span>Удалить</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
  }
}

async function applyDeskCovers(container) {
  try {
    const imgs = container.querySelectorAll('.desk-card .short-cover[data-cover-url]');

    for (const img of imgs) {
      if (img.dataset.coverApplied === '1') continue;
      const url = img.dataset.coverUrl;
      if (!url) continue;

      img.dataset.coverApplied = '1';

      const src = maybeCacheBustDictationCover(url);

      img.src = src;
    }
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
  console.log('[desk-render] stage1 cards:', {
    ms: Math.round(t1 - t0),
    items: items.length,
  });

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
    (async () => {
      const t2Start = performance.now();
      await applyDeskCovers(container);
      const t2End = performance.now();
      console.log('[desk-render] stage2 covers applied:', { ms: Math.round(t2End - t2Start) });

      setTimeout(async () => {
        const t3Start = performance.now();
        try {
          updateDictationCardsStats(container);
          await updateCompletionBadges(container);
        } finally {
          const t3End = performance.now();
          console.log('[desk-render] stage3 stats/badges:', { ms: Math.round(t3End - t3Start) });
        }
      }, 0);
    })().catch(() => { });
  });
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
        lastOwnBooks = Array.isArray(data.own_books) ? data.own_books : [];
        lastShelfBooks = Array.isArray(data.shelf_books) ? data.shelf_books : [];
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

  const rawFilterLang = currentBooksFilterLanguage
    || window.USER_LANGUAGE_DATA?.currentLearning
    || null;
  const filterLang = rawFilterLang && String(rawFilterLang) === 'all' ? null : rawFilterLang;

  const normalizeBookLang = (b) => {
    if (!b) return '';
    return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
  };

  const allBooksRaw = [
    ...(ownBooks || []).map(book => ({ ...book, isOwn: true })),
    ...(shelfBooks || []).map(book => ({ ...book, isOwn: false }))
  ];

  const allBooks = filterLang
    ? allBooksRaw.filter(b => {
      const lang = normalizeBookLang(b);
      return !lang || lang === String(filterLang).toLowerCase();
    })
    : allBooksRaw;

  if (allBooks.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Нет книг</div>';
    return;
  }

  container.innerHTML = allBooks.map(book => createMiniBookCard(book)).join('');

  hydrateMiniBookCardImages(container);

  // Обработчики событий
  container.querySelectorAll('.book-card-mini').forEach(card => {
    const bookId = parseInt(card.getAttribute('data-book-id'));
    const book = allBooks.find(b => b.id === bookId);

    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveBook(bookId, container);
    });

    card.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        setActiveBook(bookId, container);
        await openBookViewBook(bookId, !!(book && book.is_workbook));
      } catch (err) {
      }
    });
  });
}

function hydrateMiniBookCardImages(root) {
  if (!root) return;
  root.querySelectorAll('img[data-src]').forEach(img => {
    const src = img.getAttribute('data-src');
    if (!src) return;
    img.setAttribute('src', src);
    img.removeAttribute('data-src');
  });
}

function createMiniBookCard(book) {
  const foreignClass = book.isOwn ? '' : 'foreign';
  const activeClass = activeBookId === book.id ? 'active' : '';
  const blankImg = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  // Формируем URL аватара создателя
  let creatorAvatarHtml = '';
  if (book.creator_user_id) {
    const avatarUrl = withCacheBust(`/user/api/avatar?user_id=${book.creator_user_id}&size=small`);
    creatorAvatarHtml = `<img src="${blankImg}" data-src="${avatarUrl}" alt="Creator" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'user\\'></i>'; if (window.lucide) lucide.createIcons();">`;
  } else {
    creatorAvatarHtml = '<i data-lucide="user"></i>';
  }

  const creatorName = book.creator_username || 'Неизвестный';

  // Формируем HTML обложки
  let coverHtml;
  if (book.cover_url) {
    const coverV = (book.cover_url && String(book.cover_url).includes('/library/api/book-cover'))
      ? (book.updated_at || Date.now())
      : (__APP_BUILD_LOCAL || '1');
    coverHtml = `<img class="book-card-mini-cover" src="${blankImg}" data-src="${withCacheBustVersion(book.cover_url, coverV)}" alt="${book.title}">`;
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

function setActiveBook(bookId, root = document) {
  activeBookId = bookId;

  // Обновляем выделение в списке
  root.querySelectorAll('.book-card-mini').forEach(card => {
    if (parseInt(card.getAttribute('data-book-id')) === bookId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}

// ==================== ЗОНА 3: Активная книга (устарело, заменено на book-view-modal) ====================
async function openActiveBookZone(book) {
  const bookId = book && typeof book === 'object' ? (book.id || null) : book;
  if (bookId) {
    await openBookViewBook(bookId, !!(book && book.is_workbook));
  }
}

function closeActiveBookZone() {
  closeBookViewModal();
}

async function loadActiveBook(bookId, isWorkbook = false) {
  try {
    activeBookIsWorkbook = !!isWorkbook;
    // Загружаем информацию о книге
    const bookData = await apiRequest(`/library/api/book/${bookId}`);

    if (bookData.success && bookData.book) {
      const viewCard = document.getElementById('bookViewCard');
      const viewStructure = document.getElementById('bookViewStructure');

      if (viewCard && viewStructure) {
        openBookViewModal();
        bookViewActiveBookId = bookId;
        renderActiveBookCard(bookData.book, viewCard, { onClose: closeBookViewModal });
      } else {
        renderActiveBookCard(bookData.book);
      }
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

    const viewStructure = document.getElementById('bookViewStructure');
    if (viewStructure) {
      renderBookContentTo(viewStructure, sections, dictations, isWorkbook);
    }
  } catch (error) {
    console.error("Ошибка загрузки активной книги:", error);
  }
}

function renderBookContentTo(container, sections, dictations, isWorkbook = false) {
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

function renderActiveBookCard(book, targetContainer = null, options = {}) {
  const container = targetContainer
    || document.getElementById("bookViewCard")
    ;
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
  const coverV = (book.cover_url && String(book.cover_url).includes('/library/api/book-cover'))
    ? (book.updated_at || Date.now())
    : (__APP_BUILD_LOCAL || '1');
  const coverImage = book.cover_url
    ? `<img src="${withCacheBustVersion(book.cover_url, coverV)}" alt="${book.title}">`
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
      <button class="book-card-max-close-btn btn-close-active-book" title="Закрыть книгу">
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
              <button class="book-card-max-btn dropdown-toggle btn-book-actions" title="Действия">
                <i data-lucide="more-vertical"></i>
              </button>
              <div class="dropdown-menu book-actions-menu" style="display: none;">
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
  const closeBtn = container.querySelector(".btn-close-active-book");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof options.onClose === 'function') {
        options.onClose();
      } else {
        closeActiveBookZone();
      }
    });
  }

  // Обработчики выпадающего меню действий книги
  const bookActionsBtn = container.querySelector(".btn-book-actions");
  const bookActionsMenu = container.querySelector(".book-actions-menu");

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
          const closeMenuHandler = function (e) {
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

      switch (action) {
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
  setBookEditDirty(false);

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

  const defaultLang = book ? book.original_language : getDefaultOriginalLanguageForNewBook();
  initBookLanguageSelector(defaultLang);

  // Track unsaved edits in inputs/selects.
  try {
    const trackIds = [
      'book-title-input',
      'book-author-text-input',
      'book-author-materials-url-input',
      'book-theme-input',
      'book-visibility-input',
      'book-description-input'
    ];
    trackIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.dataset && el.dataset.bookDirtyBound === '1') return;
      if (el.dataset) el.dataset.bookDirtyBound = '1';
      el.addEventListener('input', () => setBookEditDirty(true));
      el.addEventListener('change', () => setBookEditDirty(true));
    });
  } catch (e) {
  }

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

  setBookEditDirty(false);
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
  const parentIdRaw = parentIdInput ? String(parentIdInput.value || '').trim() : '';
  const parentId = parentIdRaw ? parseInt(parentIdRaw, 10) : null;
  const sectionNumber = numberInput.value ? parseInt(numberInput.value, 10) : null;

  if (!titleInput.value.trim()) {
    showToast("Введите название раздела");
    return;
  }

  // Safety: section must have a valid parent book/section.
  // If parentId is invalid, JSON.stringify(NaN) becomes null and server will create a top-level book,
  // which looks like "section didn't add".
  if (!parentId || Number.isNaN(parentId)) {
    showToast("Ошибка: не выбрана книга для раздела", { durationMs: 2500 });
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
        onLanguageChange: function (values) { }
      });
    }
  };

  initSelector();
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
    const croppedBlob = getBookCroppedCoverBlob();
    const hasCover = croppedBlob || coverUploadInput?.files[0];

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
      if (croppedBlob) {
        formData.append("cover", croppedBlob, "cover.webp");
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

    setBookEditDirty(false);

    // Очищаем cropped blob
    clearBookCroppedCoverBlob();

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

  // Закрытие модального окна публичной библиотеки
  const publicLibraryCloseBtn = document.getElementById("public-library-close");
  if (publicLibraryCloseBtn) {
    publicLibraryCloseBtn.addEventListener("click", closePublicLibraryModal);
  }

  const bookViewCloseBtn = document.getElementById('book-view-close');
  if (bookViewCloseBtn) {
    bookViewCloseBtn.addEventListener('click', closeBookViewModal);
  }

  const bookViewModal = document.getElementById('book-view-modal');
  if (bookViewModal) {
    bookViewModal.addEventListener('click', (event) => {
      if (event.target === bookViewModal) {
        closeBookViewModal();
      }
    });
  }

  const publicLibraryModal = document.getElementById("public-library-modal");
  if (publicLibraryModal) {
    publicLibraryModal.addEventListener("click", (event) => {
      if (event.target === publicLibraryModal) {
        closePublicLibraryModal();
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

  if (window.CoverManager) {
    bindCoverHandlers();
  } else {
    try {
      if (coverUploadBtn) coverUploadBtn.disabled = true;
    } catch (e) {
    }
    try {
      if (coverClickable) coverClickable.style.pointerEvents = 'none';
    } catch (e) {
    }
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
      const href = deskThumb.getAttribute('data-href') || deskThumb.getAttribute('href');
      if (href) {
        window.location.href = href;
      }
    } catch (err) {
    }
  }, true);

  // dblclick по диктанту в книге: открываем редактор, НЕ toggle-desk
  document.addEventListener('dblclick', (e) => {
    try {
      const card = e.target && e.target.closest ? e.target.closest('.short-card[data-action="toggle-desk"]') : null;
      if (!card) return;
      if (card.classList.contains('desk-card')) return;

      // Игнорируем dblclick по кнопкам/ссылкам, чтобы не мешать действиям
      if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.dropdown-menu')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const editUrl = card.getAttribute('data-edit-url') || '';
      if (editUrl) {
        window.location.href = editUrl;
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

    // Выпадающее меню действий карточки диктанта (desk/book)
    if (e.target.closest('[data-action="toggle-card-actions"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="toggle-card-actions"]');
      const wrap = btn ? btn.closest('.short-actions-menu-wrapper') : null;
      const card = btn ? btn.closest('.short-card') : null;
      const menu = wrap ? wrap.querySelector('.short-card-actions-menu') : null;
      if (!menu) return;

      // Закрываем все другие меню карточек
      document.querySelectorAll('.short-card-actions-menu').forEach(m => {
        if (m !== menu) {
          m.classList.remove('show');
          m.style.display = 'none';
        }
      });

      document.querySelectorAll('.short-card.short-card--menu-open').forEach(c => {
        if (c !== card) c.classList.remove('short-card--menu-open');
      });

      const isVisible = menu.classList.contains('show');
      if (isVisible) {
        menu.classList.remove('show');
        menu.style.display = 'none';
        if (card) card.classList.remove('short-card--menu-open');
      } else {
        menu.classList.add('show');
        menu.style.display = 'block';
        if (card) card.classList.add('short-card--menu-open');

        setTimeout(() => {
          const closeMenuHandler = function (ev) {
            try {
              if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
                menu.classList.remove('show');
                menu.style.display = 'none';
                if (card) card.classList.remove('short-card--menu-open');
                document.removeEventListener('click', closeMenuHandler);
              }
            } catch (e2) {
              try {
                menu.classList.remove('show');
                menu.style.display = 'none';
                if (card) card.classList.remove('short-card--menu-open');
              } catch {
              }
              document.removeEventListener('click', closeMenuHandler);
            }
          };
          document.addEventListener('click', closeMenuHandler);
        }, 0);
      }

      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      } catch (e3) {
      }

      return;
    }

    // Явное добавление/убирание со стола из меню карточки
    if (e.target.closest('[data-action="toggle-desk-explicit"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="toggle-desk-explicit"]');
      const dictationId = btn ? btn.getAttribute('data-dictation-id') : null;
      const menu = btn ? btn.closest('.short-card-actions-menu') : null;
      if (menu) {
        menu.classList.remove('show');
        menu.style.display = 'none';
        const card = menu.closest ? menu.closest('.short-card') : null;
        if (card) card.classList.remove('short-card--menu-open');
      }
      if (dictationId) {
        toggleDictationOnDesk(dictationId);
      }
      return;
    }

    // Кнопка раскрытия/сворачивания раздела
    if (e.target.closest('.structure-item-toggle')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('.structure-item-toggle');
      const sectionId = btn.getAttribute('data-section-id');
      if (!sectionId) return;

      // Book view overlay
      if (btn.closest && btn.closest('#bookViewStructure')) {
        await toggleSectionInContainer(sectionId, document.getElementById('bookViewStructure'));
        return;
      }

      // Default: book view modal
      if (container && container.id === 'bookViewStructure') {
        await toggleSectionInContainer(String(sectionId), container);
        return;
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
        document.querySelectorAll('.book-actions-menu').forEach(m => {
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
            const closeMenuHandler = function (e) {
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

      switch (action) {
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

      switch (action) {
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
        // Одиночный клик по диктанту в книге: только визуально выделяем карточку.
        e.preventDefault();
        e.stopPropagation();

        try {
          if (__selectedBookDictationCard && __selectedBookDictationCard !== card) {
            __selectedBookDictationCard.classList.remove('short-card--selected');
          }
          card.classList.add('short-card--selected');
          __selectedBookDictationCard = card;
        } catch (e2) {
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

    if (e.target.closest('[data-action="show-in-book"]')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.target.closest('[data-action="show-in-book"]');
      const dictationId = btn.getAttribute('data-dictation-id');
      if (dictationId) {
        await showDeskDictationInBook(dictationId);
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
  bookSelect.onchange = async function () {
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
      if (String(bookViewActiveBookId || '') === String(bookId || '') || String(activeBookId || '') === String(bookId || '')) {
        closeBookViewModal();
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

    const dictIdStr = `dict_${idStr}`;
    const deleteUrl = `/api/dictations/${encodeURIComponent(dictIdStr)}`;
    console.log('🗑️ global delete request', { url: deleteUrl, dictationId: dictIdStr });
    const token = getToken();
    const response = await fetch(deleteUrl, {
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

    console.log('🗑️ global delete response', {
      status: response.status,
      ok: response.ok,
      data
    });

    if (response.ok && data && data.success) {
      closeDeleteDictationModal();
      showToast('Диктант удалён');

      try {
        await swRequest('purgeDictation', { dictationId: idStr, timeoutMs: 60000 });
      } catch (e) {
      }

      try {
        await idbDeleteDictationCache(`dict_${idStr}`);
      } catch (e) {
      }

      try {
        const card = document.querySelector(`.short-card[data-dictation-id="${CSS.escape(String(idStr))}"]`);
        if (card) {
          card.remove();
        }
      } catch (e) {
      }

      // If dictation is on desk, remove it from desk list as well.
      try {
        const itemId = typeof getDeskItemId === 'function' ? getDeskItemId(idStr) : null;
        if (itemId) {
          await removeFromDesk(itemId, idStr);
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
      const userId = getDraftUserIdForKey();
      const rawId = dictationId ? String(dictationId) : '';
      if (!rawId) return { perfect: 0, corrected: 0, audio: 0, hasDraft: false };

      const numericId = parseInt(rawId.replace(/^dict_/, ''), 10);
      const variants = [];
      variants.push(rawId);
      if (!rawId.startsWith('dict_')) variants.push(`dict_${rawId}`);
      if (Number.isFinite(numericId)) {
        variants.push(String(numericId));
        variants.push(`dict_${numericId}`);
      }

      const tried = new Set();
      for (const v of variants) {
        if (!v) continue;
        const k = `${userId}:${v}`;
        if (tried.has(k)) continue;
        tried.add(k);
        const local = await idbGet('drafts', k);
        const state = local && local.state ? local.state : null;
        if (state) {
          const draftStats = computeDraftStatistics(state);
          draftStats.hasDraft = true;
          return draftStats;
        }
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

  initializePublicBooksLanguageSelector();

  // Загружаем публичные книги
  if (Array.isArray(publicBooks) && publicBooks.length > 0 && (Date.now() - publicBooksLoadedAt) < 5 * 60 * 1000) {
    renderPublicBooksList();
  } else {
    await loadPublicBooks();
  }

  // Обновляем иконки Lucide
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

function closePublicLibraryModal() {
  const modal = document.getElementById("public-library-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

let publicBooks = []; // Список публичных книг
let publicBooksLoadedAt = 0;

function initializePublicBooksLanguageSelector() {
  try {
    const container = document.getElementById('publicBooksLanguageSelector');
    if (!container) return;

    container.innerHTML = '';

    const userSettings = window.USER_LANGUAGE_DATA;
    if (!userSettings) return;

    const baseLanguageData = window.LanguageManager.getLanguageData();
    const languageData = {
      all: { language_ru: 'Все языки', language_en: 'All languages', country_cod: '' },
      ...(baseLanguageData || {})
    };

    if (typeof window.initLanguageSelector === 'function') {
      const options = {
        mode: 'learning-selector-compact',
        currentLearning: (currentPublicBooksFilterLanguage != null ? currentPublicBooksFilterLanguage : (userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en')),
        learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
        languageData,
        onLanguageChange: function (values) {
          const v = values && values.currentLearning ? String(values.currentLearning) : '';
          currentPublicBooksFilterLanguage = v || 'all';
          renderPublicBooksList();
        }
      };

      publicBooksLanguageSelectorInstance = window.initLanguageSelector('publicBooksLanguageSelector', options);
      if (!currentPublicBooksFilterLanguage) {
        const v = String(options.currentLearning || '');
        currentPublicBooksFilterLanguage = v || 'all';
      }
    }
  } catch (e) {
  }
}

function renderPublicBooksList() {
  const list = document.getElementById('publicBooksList');
  if (!list) return;

  const rawFilterLang = currentPublicBooksFilterLanguage
    || window.USER_LANGUAGE_DATA?.currentLearning
    || null;
  const filterLang = rawFilterLang && String(rawFilterLang) === 'all' ? null : rawFilterLang;

  const normalizeBookLang = (b) => {
    if (!b) return '';
    return String(b.original_language || b.language_code || b.language || '').trim().toLowerCase();
  };

  const items = filterLang
    ? publicBooks.filter(b => {
      const lang = normalizeBookLang(b);
      return !lang || lang === String(filterLang).toLowerCase();
    })
    : publicBooks;

  if (!items.length) {
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Публичных книг пока нет</div>';
    return;
  }

  list.innerHTML = items.map(book => createMiniBookCard(book)).join('');
  hydrateMiniBookCardImages(list);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  list.querySelectorAll('.book-card-mini').forEach(card => {
    const bookId = parseInt(card.getAttribute('data-book-id'));
    const book = items.find(b => b.id === bookId) || publicBooks.find(b => b.id === bookId);

    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveBook(bookId, list);
    });

    card.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        setActiveBook(bookId, list);
        await openBookViewBook(bookId, !!(book && book.is_workbook));
      } catch (e2) {
      }
    });
  });
}

async function loadPublicBooks() {
  const list = document.getElementById("publicBooksList");
  if (!list) return;

  try {
    list.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';

    const data = await apiRequest("/library/api/public-books?limit=200");
    if (data.success && data.books) {
      publicBooks = data.books;
      publicBooksLoadedAt = Date.now();
      console.log('📚 Загружены публичные книги:', data.books.length);
      if (data.books.length > 0) {
        console.log('📚 Первая книга:', {
          id: data.books[0].id,
          creator_user_id: data.books[0].creator_user_id,
          creator_username: data.books[0].creator_username
        });
      }

      if (!currentPublicBooksFilterLanguage) {
        currentPublicBooksFilterLanguage = window.USER_LANGUAGE_DATA?.currentLearning || null;
      }

      renderPublicBooksList();
    } else {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
    }
  } catch (error) {
    console.error("Ошибка загрузки публичных книг:", error);
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">Ошибка загрузки публичных книг</div>';
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
      try {
        setActiveBook(bookId);
        await openBookViewBook(bookId);
      } catch (e) {
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

    container.innerHTML = '';

    const userSettings = window.USER_LANGUAGE_DATA;

    if (!userSettings) {
      console.warn('⚠️ USER_LANGUAGE_DATA не загружен');
      return;
    }

    if (typeof window.initLanguageSelector === 'function') {
      const baseLanguageData = window.LanguageManager.getLanguageData();
      const languageData = {
        all: { language_ru: 'Все языки', language_en: 'All languages', country_cod: '' },
        ...(baseLanguageData || {})
      };
      const options = {
        mode: 'learning-selector-compact',
        currentLearning: (currentBooksFilterLanguage != null ? currentBooksFilterLanguage : (userSettings.currentLearning || userSettings.learningLanguages?.[0] || 'en')),
        learningLanguages: userSettings.learningLanguages || [userSettings.currentLearning || 'en'],
        languageData,
        onLanguageChange: function (values) {
          console.log('🔄 Изменение языка изучения в панели "Мои книги":', values);
          const v = values && values.currentLearning ? String(values.currentLearning) : '';
          currentBooksFilterLanguage = v || 'all';
          renderBooksList(lastOwnBooks, lastShelfBooks);
        }
      };

      console.log('🎯 Создаем LanguageSelector для панели "Мои книги"');
      booksLanguageSelectorInstance = window.initLanguageSelector('booksLanguageSelector', options);

      if (!currentBooksFilterLanguage) {
        const v = String(options.currentLearning || '');
        currentBooksFilterLanguage = v || 'all';
      }

      if (booksLanguageSelectorInstance) {
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
let __initialDeskLoadTriggered = false;
let __initialBooksLoadTriggered = false;

function triggerDeskLoadOnce() {
  if (__initialDeskLoadTriggered) return;
  try {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('jwt_token') : null;
    if (!token) {
      return;
    }
  } catch (e) {
    return;
  }
  __initialDeskLoadTriggered = true;
  try {
    const p = loadDeskItems();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { });
    }
  } catch (e) {
  }
}

function triggerBooksLoadOnce() {
  if (__initialBooksLoadTriggered) return;
  __initialBooksLoadTriggered = true;
  loadBooksFromAPI();
}

function loadLibraryData() {
  refreshOfflineCacheStatus();
  triggerDeskLoadOnce();
  triggerBooksLoadOnce();
}

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", async () => {
  installEventHandlers();

  checkAppCacheRevision().catch(() => { });

  // Ранний auth-gate: если токена нет, не дергаем защищенные API (например, /desk/api/items)
  // до момента успешного логина.
  try {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
      console.log('⚠️ Нет токена на старте страницы, ждём логин');
    }
  } catch (e) {
  }

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
        try {
          if (typeof syncOfflineOutboxes === 'function') {
            syncOfflineOutboxes().catch(() => { });
          }
        } catch (e) {
        }

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

        // Загружаем данные только если пользователь авторизован
        if (isAuthenticated) {
          // Инициализируем селектор языка после загрузки данных пользователя
          // Используем setTimeout для гарантии готовности DOM
          setTimeout(() => {
            initializeBooksLanguageSelector();
          }, 100);

          console.log('📚 Пользователь авторизован, загружаем данные библиотеки');
          refreshOfflineCacheStatus();
          triggerDeskLoadOnce();
          triggerBooksLoadOnce();
          try {
            if (typeof syncOfflineOutboxes === 'function') {
              syncOfflineOutboxes().catch(() => { }); // Trigger offline outbox sync on page load after UserManager initialization
            }
          } catch (e) {
          }
        } else {
          console.log('⚠️ Пользователь не авторизован, данные не загружаются');
          refreshOfflineCacheStatus();
          // Важно: не вызываем loadDeskItems без токена (иначе 401 и __initialDeskLoadTriggered=true,
          // а после логина повторная загрузка уже не произойдет)
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

  // ВРЕМЕННО ОТКЛЮЧЕНО (диагностика двойной инициализации стола/книг).
  // Если после нескольких деплоев все стабильно (нет "очистилось и по новой" и нет зависаний),
  // этот watchdog можно удалить при чистке кода.
  // setTimeout(() => {
  //   clearInterval(waitForUserManager);
  //   ...
  // }, 5000);
});
