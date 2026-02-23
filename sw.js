const CACHE_VERSION = 'v4';
const RUNTIME_CACHE_BOUNDED = `dictafan-runtime-bounded-${CACHE_VERSION}`;
const RUNTIME_CACHE_UNBOUNDED = `dictafan-runtime-unbounded-${CACHE_VERSION}`;

const DEFAULT_MAX_BYTES = 300 * 1024 * 1024;

function openMetaDb() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('dictafan-sw-meta', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function getMaxBytes() {
  try {
    const db = await openMetaDb();
    return await new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('maxBytes');
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === 'number' && isFinite(v) && v > 0 ? v : DEFAULT_MAX_BYTES);
      };
      req.onerror = () => resolve(DEFAULT_MAX_BYTES);
    });
  } catch (e) {
    return DEFAULT_MAX_BYTES;
  }
}

function normalizeCacheKey(requestOrUrl) {
  try {
    const raw = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
    const url = new URL(raw);
    const path = url.pathname;

    // For app shell + static assets, ignore cache-busting query params like ?v=...
    if (path === '/' || path.startsWith('/dictation/') || path.startsWith('/static/')) {
      return `${url.origin}${path}`;
    }

    return typeof requestOrUrl === 'string' ? raw : requestOrUrl;
  } catch (e) {
    return typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl;
  }
}

function shouldIgnoreSearchFallbackForRequest(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    return path === '/' || path.startsWith('/dictation/') || path.startsWith('/static/');
  } catch (e) {
    return false;
  }
}

function isUnboundedUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname;
    if (path === '/library/api/book-cover') return true;
    if (path === '/user/api/avatar') return true;
    return false;
  } catch (e) {
    return false;
  }
}

async function setMaxBytes(value) {
  const parsed = Number(value);
  const maxBytes = isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_BYTES;
  try {
    const db = await openMetaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put(maxBytes, 'maxBytes');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // ignore
  }
  return { maxBytes };
}

async function getResponseSizeBytes(response) {
  try {
    const len = response && response.headers ? response.headers.get('content-length') : null;
    if (len) {
      const parsed = parseInt(len, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch (e) {
    // ignore
  }

  try {
    const blob = await response.clone().blob();
    return blob.size || 0;
  } catch (e) {
    return 0;
  }
}

function shouldHandleRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname;

    if (path.startsWith('/api/audio/')) return true;
    if (path.startsWith('/api/temp-audio/')) return true;
    if (path === '/api/cover') return true;
    if (path === '/library/api/book-cover') return true;
    if (path === '/user/api/avatar') return true;

    // Offline-first dictation pages + required static assets.
    // Dictation page loads sentences from IndexedDB; this caches only HTML/JS/CSS/media.
    if (path.startsWith('/dictation/')) return true;
    if (path.startsWith('/static/')) return true;

    // Home page is the main desk; allow opening it offline.
    if (path === '/') return true;

    return false;
  } catch (e) {
    return false;
  }
}

async function cacheFirstBounded(request) {
  try {
    const cache = await caches.open(RUNTIME_CACHE_BOUNDED);

    const hasRange = request.headers && request.headers.has('range');
    const cacheKey = hasRange ? request.url : normalizeCacheKey(request);

    let cached = await cache.match(cacheKey);
    if (!cached && !hasRange && shouldIgnoreSearchFallbackForRequest(request)) {
      cached = await cache.match(request, { ignoreSearch: true });
    }
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok && !hasRange) {
      const [stats, maxBytes] = await Promise.all([computeCacheStats(), getMaxBytes()]);
      const size = await getResponseSizeBytes(response);
      if ((stats.totalBytes + size) <= maxBytes) {
        await cache.put(cacheKey, response.clone());
      }
    }
    return response;
  } catch (e) {
    return fetch(request);
  }
}

async function cacheFirstUnbounded(request) {
  try {
    const cache = await caches.open(RUNTIME_CACHE_UNBOUNDED);

    const cacheKey = normalizeCacheKey(request);
    let cached = await cache.match(cacheKey);
    if (!cached && shouldIgnoreSearchFallbackForRequest(request)) {
      cached = await cache.match(request, { ignoreSearch: true });
    }
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (e) {
    return fetch(request);
  }
}

async function cacheAudioFullFileInBackground(url) {
  try {
    const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
    const cached = await cache.match(url);
    if (cached) return;

    const response = await fetch(new Request(url, { method: 'GET' }));
    if (response && response.ok) {
      const [stats, maxBytes] = await Promise.all([computeCacheStats(), getMaxBytes()]);
      const size = await getResponseSizeBytes(response);
      if ((stats.totalBytes + size) <= maxBytes) {
        await cache.put(url, response.clone());
      }
    }
  } catch (e) {
    // ignore
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key.startsWith('dictafan-runtime-') && key !== RUNTIME_CACHE_BOUNDED && key !== RUNTIME_CACHE_UNBOUNDED) {
        return caches.delete(key);
      }
      return undefined;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (!shouldHandleRequest(request.url)) return;

  // For Range requests (common for <audio>), return the original network Range response,
  // but cache the full file in background using the URL as a normalized cache key.
  const hasRange = request.headers && request.headers.has('range');
  if (hasRange && request.url.includes('/api/audio/')) {
    event.waitUntil(cacheAudioFullFileInBackground(request.url));
    event.respondWith((async () => {
      try {
        const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
        const cached = await cache.match(request.url);
        if (cached) return cached;
      } catch (e) {
        // ignore
      }
      return fetch(request);
    })());
    return;
  }

  if (isUnboundedUrl(request.url)) {
    event.respondWith(cacheFirstUnbounded(request));
  } else {
    event.respondWith(cacheFirstBounded(request));
  }
});

async function computeCacheStats() {
  const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
  const keys = await cache.keys();

  let totalBytes = 0;
  for (const req of keys) {
    try {
      const res = await cache.match(req);
      if (!res) continue;

      const len = res.headers.get('content-length');
      if (len) {
        const parsed = parseInt(len, 10);
        if (!isNaN(parsed)) {
          totalBytes += parsed;
          continue;
        }
      }

      const blob = await res.clone().blob();
      totalBytes += blob.size || 0;
    } catch (e) {
      // ignore
    }
  }

  const maxBytes = await getMaxBytes();
  return { entries: keys.length, totalBytes, maxBytes };
}

async function clearRuntimeCache() {
  await Promise.all([
    caches.delete(RUNTIME_CACHE_BOUNDED),
    caches.delete(RUNTIME_CACHE_UNBOUNDED),
  ]);
  return { cleared: true };
}

async function prefetchUrls(urls) {
  const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  const maxBytes = await getMaxBytes();
  let stats = await computeCacheStats();
  let totalBytes = stats.totalBytes || 0;

  for (const url of urls || []) {
    try {
      if (!url || typeof url !== 'string') {
        failed += 1;
        continue;
      }

      const normalizedKey = normalizeCacheKey(new URL(url, self.location.origin).toString());

      const cached = await cache.match(normalizedKey);
      if (cached) {
        skipped += 1;
        continue;
      }

      const res = await fetch(new Request(url, { method: 'GET' }));
      if (res && res.ok) {
        const size = await getResponseSizeBytes(res);
        if ((totalBytes + size) <= maxBytes) {
          await cache.put(normalizedKey, res.clone());
          fetched += 1;
          totalBytes += size;
        } else {
          skipped += 1;
        }
      } else {
        failed += 1;
      }
    } catch (e) {
      failed += 1;
    }
  }

  return { fetched, skipped, failed, total: (urls || []).length };
}

async function prefetchUrlsStrict(urls) {
  const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let overLimit = 0;

  const maxBytes = await getMaxBytes();
  const stats = await computeCacheStats();
  let totalBytes = stats.totalBytes || 0;

  for (const url of urls || []) {
    try {
      if (!url || typeof url !== 'string') {
        failed += 1;
        continue;
      }

      const normalizedKey = normalizeCacheKey(new URL(url, self.location.origin).toString());

      const cached = await cache.match(normalizedKey);
      if (cached) {
        skipped += 1;
        continue;
      }

      const res = await fetch(new Request(url, { method: 'GET' }));
      if (res && res.ok) {
        const size = await getResponseSizeBytes(res);
        if ((totalBytes + size) <= maxBytes) {
          await cache.put(normalizedKey, res.clone());
          fetched += 1;
          totalBytes += size;
        } else {
          overLimit += 1;
        }
      } else {
        failed += 1;
      }
    } catch (e) {
      failed += 1;
    }
  }

  const ok = failed === 0 && overLimit === 0;
  return {
    ok,
    fetched,
    skipped,
    failed,
    overLimit,
    total: (urls || []).length,
    totalBytes,
    maxBytes,
  };
}

async function purgeDictationFromBoundedCache(dictationId) {
  const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
  const keys = await cache.keys();

  const dictId = String(dictationId || '').trim();
  const dictKey = dictId.startsWith('dict_') ? dictId : `dict_${dictId}`;

  let deleted = 0;
  for (const req of keys) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      // Audio: /api/audio/dict_123/...
      if (path.startsWith(`/api/audio/${dictKey}/`)) {
        const ok = await cache.delete(req);
        if (ok) deleted += 1;
        continue;
      }

      // Cover: /api/cover?dictation_id=dict_123
      if (path === '/api/cover') {
        const coverId = url.searchParams.get('dictation_id');
        if (coverId === dictKey) {
          const ok = await cache.delete(req);
          if (ok) deleted += 1;
          continue;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return { deleted, dictationId: dictKey };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const action = data.action;
  const requestId = data.requestId;

  const respond = (payload) => {
    try {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ requestId, ...payload });
      }
    } catch (e) {
      // ignore
    }
  };

  (async () => {
    try {
      if (action === 'cacheStats') {
        const stats = await computeCacheStats();
        respond({ success: true, stats });
        return;
      }

      if (action === 'purgeDictation') {
        const res = await purgeDictationFromBoundedCache(data.dictationId);
        respond({ success: true, result: res });
        return;
      }

      if (action === 'getSettings') {
        const maxBytes = await getMaxBytes();
        respond({ success: true, settings: { maxBytes } });
        return;
      }

      if (action === 'setMaxBytes') {
        const res = await setMaxBytes(data.maxBytes);
        respond({ success: true, settings: res });
        return;
      }

      if (action === 'cacheClear') {
        const res = await clearRuntimeCache();
        respond({ success: true, result: res });
        return;
      }

      if (action === 'prefetch') {
        const urls = Array.isArray(data.urls) ? data.urls : [];
        const res = await prefetchUrls(urls);
        respond({ success: true, result: res });
        return;
      }

      if (action === 'prefetchStrict') {
        const urls = Array.isArray(data.urls) ? data.urls : [];
        const res = await prefetchUrlsStrict(urls);
        if (res.ok) {
          respond({ success: true, result: res });
        } else {
          respond({ success: false, error: 'cache_limit_exceeded', result: res });
        }
        return;
      }

      respond({ success: false, error: 'unknown_action' });
    } catch (e) {
      respond({ success: false, error: String(e) });
    }
  })();
});
