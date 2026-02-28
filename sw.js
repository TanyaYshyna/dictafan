const CACHE_VERSION = 'v5';
const RUNTIME_CACHE_BOUNDED = `dictafan-runtime-bounded-${CACHE_VERSION}`;
const RUNTIME_CACHE_UNBOUNDED = `dictafan-runtime-unbounded-${CACHE_VERSION}`;

// Persistent cache for dictation media. Must survive SW updates so offline dictations
// (IndexedDB tables + audio/covers) are not lost when updating HTML/JS/CSS.
const MEDIA_CACHE_PERSIST = 'dictafan-media';

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

    // Cache external ASR assets (Transformers.js + Whisper model files) ignoring query params.
    if (url.hostname === 'huggingface.co' || url.hostname === 'cdn.jsdelivr.net') {
      return `${url.origin}${path}`;
    }

    // For JS/CSS assets we MUST respect cache-busting query params (?v=...) so deploys can
    // reliably ship new code even with SW runtime caching.
    if (path.startsWith('/static/')) {
      const isJs = path.endsWith('.js');
      const isCss = path.endsWith('.css');
      if (isJs || isCss) {
        return `${url.origin}${path}${url.search}`;
      }
      // Other static assets can ignore query params.
      return `${url.origin}${path}`;
    }

    // App shell: ignore query params.
    if (path === '/' || path.startsWith('/dictation/')) {
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

function isMediaUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname;
    if (path.startsWith('/api/dictations/')) return true;
    if (path.startsWith('/temp/dictations/')) return true;
    if (path.startsWith('/api/temp/')) return true;
    if (path === '/api/cover') return true;
    if (path === '/library/api/book-cover') return true;
    if (path === '/user/api/avatar') return true;
    return false;
  } catch (e) {
    return false;
  }
}

function pickCacheNameForRequest(requestOrUrl) {
  try {
    const raw = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
    if (isMediaUrl(raw)) return MEDIA_CACHE_PERSIST;
    if (isUnboundedUrl(raw)) return RUNTIME_CACHE_UNBOUNDED;
    return RUNTIME_CACHE_BOUNDED;
  } catch (e) {
    return RUNTIME_CACHE_BOUNDED;
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

    // Allow offline ASR assets from external origins.
    if (url.hostname === 'huggingface.co') return true;
    if (url.hostname === 'cdn.jsdelivr.net') return true;

    if (path.startsWith('/api/dictations/')) return true;
    if (path.startsWith('/temp/dictations/')) return true;
    if (path.startsWith('/api/temp/')) return true;
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
    const cache = await caches.open(pickCacheNameForRequest(request));

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
    try {
      const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
      const cacheKey = normalizeCacheKey(request);
      let cached = await cache.match(cacheKey);
      if (!cached && shouldIgnoreSearchFallbackForRequest(request)) {
        cached = await cache.match(request, { ignoreSearch: true });
      }
      if (cached) return cached;
    } catch (e2) {
      // ignore
    }

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirstUnbounded(request) {
  try {
    const cache = await caches.open(pickCacheNameForRequest(request));

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
    try {
      const cache = await caches.open(RUNTIME_CACHE_UNBOUNDED);
      const cacheKey = normalizeCacheKey(request);
      let cached = await cache.match(cacheKey);
      if (!cached && shouldIgnoreSearchFallbackForRequest(request)) {
        cached = await cache.match(request, { ignoreSearch: true });
      }
      if (cached) return cached;
    } catch (e2) {
      // ignore
    }

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheAudioFullFileInBackground(url) {
  try {
    const cache = await caches.open(MEDIA_CACHE_PERSIST);
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
    // Delete only outdated versioned runtime caches. Keep MEDIA_CACHE_PERSIST.
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

  try {
    const url = new URL(request.url);
    if (url.pathname && url.pathname.endsWith('.map')) {
      const emptyMap = JSON.stringify({
        version: 3,
        sources: [],
        names: [],
        mappings: '',
      });
      event.respondWith(new Response(emptyMap, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      }));
      return;
    }
  } catch (e) {
  }

  if (!shouldHandleRequest(request.url)) return;

  // For Range requests (common for <audio>), serve a 206 Partial Content response from cache.
  const hasRange = request.headers && request.headers.has('range');
  if (hasRange && (request.url.includes('/api/dictations/') || request.url.includes('/temp/dictations/'))) {
    // все аудио должны быть из кеша
    // Range requests for audio are also cache-only.
    event.respondWith((async () => {
      try {
        const cache = await caches.open(MEDIA_CACHE_PERSIST);
        const cached = await cache.match(request.url);
        if (cached) {
          try {
            const rangeHeader = request.headers.get('range');
            if (!rangeHeader) return cached;

            const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
            if (!m) return cached;

            const fullBlob = await cached.clone().blob();
            const size = fullBlob.size || 0;

            let start = m[1] ? parseInt(m[1], 10) : NaN;
            let end = m[2] ? parseInt(m[2], 10) : NaN;

            if (isNaN(start)) {
              // bytes=-N (suffix)
              const suffix = isNaN(end) ? 0 : end;
              start = Math.max(0, size - suffix);
              end = size > 0 ? size - 1 : 0;
            } else {
              if (isNaN(end) || end >= size) end = size > 0 ? size - 1 : 0;
            }

            if (size <= 0 || start < 0 || start >= size || end < start) {
              return new Response('Range Not Satisfiable', {
                status: 416,
                headers: {
                  'Content-Range': `bytes */${size}`,
                  'Content-Type': 'text/plain; charset=utf-8'
                }
              });
            }

            const chunk = fullBlob.slice(start, end + 1);
            const headers = new Headers();
            const ct = cached.headers.get('content-type') || cached.headers.get('Content-Type') || 'audio/mpeg';
            headers.set('Content-Type', ct);
            headers.set('Accept-Ranges', 'bytes');
            headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
            headers.set('Content-Length', String((end - start + 1) || 0));

            return new Response(chunk, { status: 206, headers });
          } catch (e) {
            // Fallback to full cached response
            return cached;
          }
        }

        // If /api/dictations is missing in cache, allow network fallback and cache it for future offline usage.
        try {
          const u = new URL(request.url);
          if (u.pathname && u.pathname.startsWith('/api/dictations/')) {
            const netRes = await fetch(request);
            if (netRes && netRes.ok) {
              try {
                const fullReq = new Request(request.url, {
                  method: 'GET',
                  headers: new Headers({})
                });
                const fullRes = await fetch(fullReq);
                if (fullRes && fullRes.ok) {
                  await cache.put(request.url, fullRes.clone());
                }
              } catch (e) {
              }
              return netRes;
            }
          }
        } catch (e) {
        }
      } catch (e) {
        // ignore
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })());
    return;
  }

  // все аудио должны быть из кеша
  // Dictation must be able to work fully offline.
  try {
    const url = new URL(request.url);
    if (url.pathname && (url.pathname.startsWith('/api/dictations/') || url.pathname.startsWith('/temp/dictations/'))) {
      event.respondWith((async () => {
        try {
          const cache = await caches.open(MEDIA_CACHE_PERSIST);
          const cached = await cache.match(request.url);
          if (cached) return cached;

          // temp/dictations must exist only in cache
          if (url.pathname && url.pathname.startsWith('/temp/dictations/')) {
            return new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          }

          // /api/dictations: if not cached yet, fetch from network and store into cache.
          const netRes = await fetch(request);
          if (netRes && netRes.ok) {
            try {
              await cache.put(request.url, netRes.clone());
            } catch (e) {
            }
            return netRes;
          }
        } catch (e) {
        }
        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })());
      return;
    }
  } catch (e) {
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

async function computeCacheStatsForCache(cacheName) {
  const resolved = cacheName || RUNTIME_CACHE_BOUNDED;
  const cache = await caches.open(resolved);
  const keys = await cache.keys();

  let totalBytes = 0;
  for (const req of keys) {
    try {
      const response = await cache.match(req);
      totalBytes += await getResponseSizeBytes(response);
    } catch (e) {
    }
  }
  return { totalBytes, count: keys.length, cacheName: resolved };
}

async function clearRuntimeCache() {
  await Promise.all([
    caches.delete(RUNTIME_CACHE_BOUNDED),
    caches.delete(RUNTIME_CACHE_UNBOUNDED),
  ]);
  return { cleared: true };
}

async function clearAppShellCacheEntries() {
  const cachesToScan = [RUNTIME_CACHE_BOUNDED, RUNTIME_CACHE_UNBOUNDED];
  let deleted = 0;
  for (const cacheName of cachesToScan) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      for (const req of keys) {
        try {
          const url = new URL(req.url);
          const path = url.pathname;

          const shouldDelete =
            path === '/' ||
            path === '/sw.js' ||
            path === '/manifest.json' ||
            path.startsWith('/static/') ||
            path.startsWith('/private') ||
            path.startsWith('/library') ||
            path.startsWith('/desk') ||
            path.startsWith('/dictation/') ||
            path === '/dictation' ||
            path === '/login' ||
            path === '/logout';

          if (shouldDelete) {
            const ok = await cache.delete(req);
            if (ok) deleted += 1;
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
  }
  return { deleted };
}

async function prefetchUrls(urls) {
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  const maxBytes = await getMaxBytes();
  const cacheTotals = new Map();

  for (const url of urls || []) {
    try {
      if (!url || typeof url !== 'string') {
        failed += 1;
        continue;
      }

      const absolute = new URL(url, self.location.origin).toString();
      const normalizedKey = normalizeCacheKey(absolute);
      const cacheName = pickCacheNameForRequest(absolute);
      const cache = await caches.open(cacheName);

      if (!cacheTotals.has(cacheName)) {
        const stats = await computeCacheStatsForCache(cacheName);
        cacheTotals.set(cacheName, stats.totalBytes || 0);
      }

      let totalBytes = cacheTotals.get(cacheName) || 0;

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
          cacheTotals.set(cacheName, totalBytes);
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
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let overLimit = 0;

  const failedUrls = [];
  const overLimitUrls = [];

  const maxBytes = await getMaxBytes();
  const cacheTotals = new Map();

  for (const url of urls || []) {
    try {
      if (!url || typeof url !== 'string') {
        failed += 1;
        continue;
      }

      const absolute = new URL(url, self.location.origin).toString();
      const normalizedKey = normalizeCacheKey(absolute);
      const cacheName = pickCacheNameForRequest(absolute);
      const cache = await caches.open(cacheName);

      if (!cacheTotals.has(cacheName)) {
        const stats = await computeCacheStatsForCache(cacheName);
        cacheTotals.set(cacheName, stats.totalBytes || 0);
      }

      let totalBytes = cacheTotals.get(cacheName) || 0;

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
          cacheTotals.set(cacheName, totalBytes);
        } else {
          overLimit += 1;
          if (overLimitUrls.length < 10) overLimitUrls.push(absolute);
        }
      } else {
        failed += 1;
        if (failedUrls.length < 10) {
          const status = res ? res.status : 'no_response';
          failedUrls.push(`${absolute} (status ${status})`);
        }
      }
    } catch (e) {
      failed += 1;
      if (failedUrls.length < 10) {
        const msg = e && e.message ? e.message : String(e);
        try {
          const absolute = new URL(url, self.location.origin).toString();
          failedUrls.push(`${absolute} (error ${msg})`);
        } catch (e2) {
          failedUrls.push(`${String(url)} (error ${msg})`);
        }
      }
    }
  }

  let totalBytesAll = 0;
  try {
    for (const v of cacheTotals.values()) {
      const n = Number(v);
      if (isFinite(n) && n > 0) totalBytesAll += n;
    }
  } catch (e) {
  }

  const ok = failed === 0 && overLimit === 0;
  return {
    ok,
    fetched,
    skipped,
    failed,
    overLimit,
    total: (urls || []).length,
    totalBytes: totalBytesAll,
    maxBytes,
    failedUrls,
    overLimitUrls,
  };
}

async function checkUrlsInCache(urls) {
  const missing = [];
  for (const url of urls || []) {
    try {
      if (!url || typeof url !== 'string') {
        missing.push(String(url));
        continue;
      }
      const absolute = new URL(url, self.location.origin).toString();
      const normalizedKey = normalizeCacheKey(absolute);
      const cacheName = pickCacheNameForRequest(absolute);
      const cache = await caches.open(cacheName);
      const cached = (await cache.match(normalizedKey)) || (await cache.match(absolute));
      if (!cached) missing.push(absolute);
    } catch (e) {
      missing.push(String(url));
    }
  }
  return { ok: missing.length === 0, missing, total: (urls || []).length };
}

async function purgeDictationFromBoundedCache(dictationId) {
  // Purge dictation media from the persistent media cache.
  const cache = await caches.open(MEDIA_CACHE_PERSIST);
  const keys = await cache.keys();

  const dictId = String(dictationId || '').trim();
  const dictKey = dictId.startsWith('dict_') ? dictId : `dict_${dictId}`;

  let deleted = 0;
  for (const req of keys) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      // Audio: /api/dictations/dict_123/...
      if (path.startsWith(`/api/dictations/${dictKey}/`)) {
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

      if (action === 'cacheClearAppShell') {
        const res = await clearAppShellCacheEntries();
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
          if (res.overLimit > 0) {
            respond({ success: false, error: 'cache_limit_exceeded', result: res });
          } else {
            respond({ success: false, error: 'prefetch_failed', result: res });
          }
        }
        return;
      }

      if (action === 'checkCached') {
        const urls = Array.isArray(data.urls) ? data.urls : [];
        const res = await checkUrlsInCache(urls);
        respond({ success: true, result: res });
        return;
      }

      respond({ success: false, error: 'unknown_action' });
    } catch (e) {
      respond({ success: false, error: String(e) });
    }
  })();
});
