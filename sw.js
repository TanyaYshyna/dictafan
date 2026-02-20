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
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
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

  event.respondWith(cacheFirst(request));
});
