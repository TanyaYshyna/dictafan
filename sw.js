const CACHE_VERSION = 'v1';
const RUNTIME_CACHE = `dictafan-runtime-${CACHE_VERSION}`;

function shouldHandleRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname;

    if (path.startsWith('/api/audio/')) return true;
    if (path.startsWith('/api/temp-audio/')) return true;
    if (path === '/api/cover') return true;
    if (path === '/library/api/book-cover') return true;
    if (path === '/user/api/avatar') return true;

    return false;
  } catch (e) {
    return false;
  }
}

async function cacheFirst(request) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);

    const hasRange = request.headers && request.headers.has('range');
    const cacheKey = hasRange ? request.url : request;

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok && !hasRange) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (e) {
    return fetch(request);
  }
}

async function cacheAudioFullFileInBackground(url) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(url);
    if (cached) return;

    const response = await fetch(new Request(url, { method: 'GET' }));
    if (response && response.ok) {
      await cache.put(url, response.clone());
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
      if (key.startsWith('dictafan-runtime-') && key !== RUNTIME_CACHE) {
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
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request.url);
        if (cached) return cached;
      } catch (e) {
        // ignore
      }
      return fetch(request);
    })());
    return;
  }

  event.respondWith(cacheFirst(request));
});
