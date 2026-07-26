const CACHE_VERSION = 'v6';
const RUNTIME_CACHE_BOUNDED = `dictafan-runtime-bounded-${CACHE_VERSION}`;
const RUNTIME_CACHE_UNBOUNDED = `dictafan-runtime-unbounded-${CACHE_VERSION}`;

const SW_DEBUG = false;
let __swReqSeq = 0;

function swTimeStart(label) {
  if (!SW_DEBUG) return;
  try {
    console.time(label);
  } catch (e) {
  }
}

async function networkFirstAppShell(request, event) {
  try {
    const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
    const cacheKey = normalizeCacheKey(request);
    try {
      const netRes = await fetch(request);
      if (netRes && netRes.ok) {
        try {
          await cache.put(cacheKey, netRes.clone());
        } catch (e) {
        }
        return netRes;
      }
      if (netRes) {
        return netRes;
      }
    } catch (e) {
    }

    let cached = await cache.match(cacheKey);
    if (!cached && shouldIgnoreSearchFallbackForRequest(request)) {
      cached = await cache.match(request, { ignoreSearch: true });
    }
    if (cached) return cached;
  } catch (e) {
  }

  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function isStaticJsOrCssUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname || '';
    if (!path.startsWith('/static/')) return false;
    if (path.endsWith('.js')) return true;
    if (path.endsWith('.css')) return true;
    return false;
  } catch (e) {
    return false;
  }
}

async function broadcastSwEvent(type, payload) {
  try {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientsList || []) {
      try {
        c.postMessage({ type, payload });
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

async function cleanupOldStaticAssetVersions(cache, currentUrl) {
  try {
    const url = new URL(currentUrl);
    const path = url.pathname || '';
    if (!path.startsWith('/static/')) return;
    if (!(path.endsWith('.js') || path.endsWith('.css'))) return;

    let keys = [];
    try {
      const baseReq = new Request(`${url.origin}${path}`, { method: 'GET' });
      keys = await cache.keys(baseReq, { ignoreSearch: true });
    } catch (e) {
      keys = await cache.keys();
    }

    let deleted = 0;
    for (const req of keys) {
      try {
        const u = new URL(req.url);
        if (u.pathname !== path) continue;
        if (req.url === currentUrl) continue;
        if (req.url === `${url.origin}${path}${url.search}`) continue;
        const ok = await cache.delete(req);
        if (ok) deleted += 1;
      } catch (e) {
      }
    }

    if (deleted > 0) {
      try {
        await broadcastSwEvent('sw_cache_cleanup', { kind: 'static_version', path, deleted });
      } catch (e) {
      }
    }
  } catch (e) {
  }
}

function swTimeEnd(label) {
  if (!SW_DEBUG) return;
  try {
    console.timeEnd(label);
  } catch (e) {
  }
}

// Постоянный кеш для медиа диктанта. Должен переживать обновления Service Worker, чтобы офлайн-диктанты
// (таблицы IndexedDB + аудио/обложки) не терялись при обновлении HTML/JS/CSS.
const MEDIA_CACHE_PERSIST = 'dictafan-media';

// ПРИМЕЧАНИЕ (прямая загрузка в B2): загрузки из браузера в Backblaze B2 требуют кастомного CORS-правила
// на бакете (allowedOperations: ["b2_upload_file"]). Правило должно разрешать origin этого приложения
// (например https://dictafan-staging001.up.railway.app) и заголовки, используемые при загрузке в B2:
// authorization, x-bz-file-name, x-bz-content-sha1, content-type.

function normalizeCacheKey(requestOrUrl) {
  try {
    const raw = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
    const url = new URL(raw);
    const path = url.pathname;

    // Кешируем внешние ASR-ассеты (Transformers.js + файлы модели Whisper), игнорируя query-параметры.
    if (url.hostname === 'huggingface.co' || url.hostname === 'cdn.jsdelivr.net') {
      return `${url.origin}${path}`;
    }

    // Для JS/CSS ассетов мы ОБЯЗАНЫ учитывать cache-busting query-параметры (?v=...), чтобы деплои
    // гарантированно доставляли новый код даже при runtime-кешировании в SW.
    if (path.startsWith('/static/')) {
      const isJs = path.endsWith('.js');
      const isCss = path.endsWith('.css');
      const isI18nJson = path.startsWith('/static/i18n/') && path.endsWith('.json');
      if (isJs || isCss || isI18nJson) {
        return `${url.origin}${path}${url.search}`;
      }
      // Остальные static-ассеты могут игнорировать query-параметры.
      return `${url.origin}${path}`;
    }

    // App shell: игнорируем query-параметры.
    if (path === '/' || path.startsWith('/dictation/')) {
      return `${url.origin}${path}`;
    }

    // Медиа диктанта (аудио + коверы): игнорируем query-параметры, чтобы cache-busting (?v=...) не ломал офлайн.
    if (path.startsWith('/api/dictations/') || path.startsWith('/api/dictations_covers/')) {
      return `${url.origin}${path}`;
    }

    return typeof requestOrUrl === 'string' ? raw : requestOrUrl;
  } catch (e) {
    return typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl;
  }
}

async function staleWhileRevalidateImage(request, event) {
  const cacheKey = normalizeCacheKey(request);
  const cache = await caches.open(RUNTIME_CACHE_UNBOUNDED);

  const cached = await cache.match(cacheKey);
  if (cached) {
    if (event && event.waitUntil) {
      event.waitUntil((async () => {
        try {
          const netRes = await fetch(request);
          if (netRes && netRes.ok) {
            try {
              const cc = (netRes.headers.get('cache-control') || '').toLowerCase();
              const pragma = (netRes.headers.get('pragma') || '').toLowerCase();
              const isNoStore = cc.includes('no-store') || cc.includes('no-cache') || pragma.includes('no-cache');
              if (!isNoStore) {
                await cache.put(cacheKey, netRes.clone());
              }
            } catch (e) {
            }
          }
        } catch (e) {}
      })());
    }
    return cached;
  }

  try {
    const legacyCache = await caches.open(MEDIA_CACHE_PERSIST);
    const legacy = await legacyCache.match(request);
    if (legacy) {
      if (event && event.waitUntil) {
        event.waitUntil((async () => {
          try {
            await cache.put(cacheKey, legacy.clone());
          } catch (e) {
          }
        })());
      }
      return legacy;
    }
  } catch (e) {
  }

  const response = await fetch(request);
  if (response && response.ok) {
    try {
      const cc = (response.headers.get('cache-control') || '').toLowerCase();
      const pragma = (response.headers.get('pragma') || '').toLowerCase();
      const isNoStore = cc.includes('no-store') || cc.includes('no-cache') || pragma.includes('no-cache');
      if (!isNoStore) {
        await cache.put(cacheKey, response.clone());
      }
    } catch (e) {
    }
  }
  return response;
}

function shouldIgnoreSearchFallbackForRequest(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/' || path.startsWith('/dictation/')) return true;

    // Never ignore search for versioned assets.
    if (path.startsWith('/static/')) {
      const isJs = path.endsWith('.js');
      const isCss = path.endsWith('.css');
      const isI18nJson = path.startsWith('/static/i18n/') && path.endsWith('.json');
      if (isJs || isCss || isI18nJson) return false;
      return true;
    }
    return false;
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
    if (path.startsWith('/api/dictations_covers/')) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function isImageUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname;
    return path === '/library/api/book-cover' || path === '/user/api/avatar';
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

function shouldHandleRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const path = url.pathname;

    // Разрешаем офлайн-доступ к ASR-ассетам с внешних доменов.
    if (url.hostname === 'huggingface.co') return true;
    if (url.hostname === 'cdn.jsdelivr.net') return true;

    if (path.startsWith('/api/dictations/')) return true;
    if (path === '/library/api/book-cover') return true;
    if (path === '/user/api/avatar') return true;

    // Страницы диктанта в режиме offline-first + необходимые static-ассеты.
    // Страница диктанта берет предложения из IndexedDB; здесь кешируются только HTML/JS/CSS/медиа.
    if (path.startsWith('/dictation/')) return true;
    if (path.startsWith('/static/')) return true;

    // Главная страница — основной «стол», разрешаем открывать офлайн.
    if (path === '/') return true;

    return false;
  } catch (e) {
    return false;
  }
}

async function cacheFirstBounded(request, event) {
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
      try {
        await cache.put(cacheKey, response.clone());
      } catch (e) {
      }

      try {
        const rawUrl = request && request.url ? request.url : '';
        if (event && event.waitUntil && isStaticJsOrCssUrl(rawUrl)) {
          const currentKey = (typeof cacheKey === 'string') ? cacheKey : rawUrl;
          event.waitUntil(cleanupOldStaticAssetVersions(cache, currentKey));
        }
      } catch (e) {
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
      // игнорируем
    }

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirstUnbounded(request, event) {
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
      try {
        await cache.put(cacheKey, response.clone());
      } catch (e) {
      }

      try {
        const rawUrl = request && request.url ? request.url : '';
        if (event && event.waitUntil && isStaticJsOrCssUrl(rawUrl)) {
          const currentKey = (typeof cacheKey === 'string') ? cacheKey : rawUrl;
          event.waitUntil(cleanupOldStaticAssetVersions(cache, currentKey));
        }
      } catch (e) {
      }
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
      // игнорируем
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
      try {
        await cache.put(url, response.clone());
      } catch (e) {
      }
    }
  } catch (e) {
    // игнорируем
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();

  // Минимальный app shell prefetch: чтобы приложение открывалось офлайн даже сразу после обновления SW.
  // Важно: кешируем только URL без build query, которые существуют стабильно.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
      const urls = [
        '/',
        '/static/css/style.css',
        '/static/css/style_color.css',
      ];
      await Promise.all(urls.map(async (url) => {
        try {
          const absolute = new URL(url, self.location.origin).toString();
          const key = normalizeCacheKey(absolute);
          const cached = await cache.match(key);
          if (cached) return;
          const res = await fetch(new Request(url, { method: 'GET' }));
          if (res && res.ok) {
            await cache.put(key, res.clone());
          }
        } catch (e) {
        }
      }));
    } catch (e) {
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      for (const k of keys || []) {
        try {
          const isRuntime = (k || '').startsWith('dictafan-runtime-');
          if (!isRuntime) continue;
          if (k === RUNTIME_CACHE_BOUNDED || k === RUNTIME_CACHE_UNBOUNDED) continue;
          await caches.delete(k);
        } catch (e) {
        }
      }
    } catch (e) {
    }

    // ВАЖНО: не удаляем старые runtime-кеши автоматически.
    // Иначе после деплоя новый SW может удалить app shell (HTML/JS/CSS), и приложение перестанет
    // открываться офлайн до следующего успешного онлайн-прогрева.
    await self.clients.claim();

    // Уведомляем все открытые страницы о том, что SW обновился
    try {
      const buildVersion = CACHE_VERSION;
      await broadcastSwEvent('sw_build_update', { build: buildVersion });
    } catch (e) {
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const reqId = (__swReqSeq += 1);
  let reqPath = '';
  try {
    reqPath = new URL(request.url).pathname || '';
  } catch (e) {
    reqPath = '';
  }

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

  // Коверы диктантов тоже должны работать офлайн (MEDIA_CACHE_PERSIST).
  try {
    const url = new URL(request.url);
    if (url.pathname && url.pathname.startsWith('/api/dictations_covers/')) {
      const label = `sw#${reqId} dictations_covers ${reqPath}`;
      swTimeStart(label);
      event.respondWith((async () => {
        try {
          const cache = await caches.open(MEDIA_CACHE_PERSIST);
          const cacheKey = normalizeCacheKey(request);

          let cached = await cache.match(cacheKey);
          if (cached) return cached;

          // Если закешировано без query (старые версии) — подстрахуемся.
          cached = await cache.match(request, { ignoreSearch: true });
          if (cached) {
            try {
              await cache.put(cacheKey, cached.clone());
            } catch (e) {
            }
            return cached;
          }

          const netRes = await fetch(request);
          if (netRes && netRes.ok) {
            try {
              await cache.put(cacheKey, netRes.clone());
            } catch (e) {
            }
            return netRes;
          }

          if (netRes) return netRes;
        } catch (e) {
        }

        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })().finally(() => {
        swTimeEnd(label);
      }));
      return;
    }
  } catch (e) {
  }

  // i18n словари: строго network-first по точному URL (с ?v=), без ignoreSearch fallback.
  // Иначе можно получить устаревший словарь (без новых ключей) даже после смены build.
  try {
    const url = new URL(request.url);
    if (url.pathname && url.pathname.startsWith('/static/i18n/') && url.pathname.endsWith('.json')) {
      const label = `sw#${reqId} i18n ${reqPath}`;
      swTimeStart(label);
      event.respondWith((async () => {
        try {
          const cache = await caches.open(RUNTIME_CACHE_BOUNDED);
          const cacheKey = normalizeCacheKey(request);

          try {
            const netRes = await fetch(request);
            if (netRes && netRes.ok) {
              try {
                await cache.put(cacheKey, netRes.clone());
              } catch (e) {
              }
              return netRes;
            }
            if (netRes) return netRes;
          } catch (e) {
          }

          try {
            const cached = await cache.match(cacheKey);
            if (cached) return cached;
          } catch (e) {
          }
        } catch (e) {
        }

        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })().finally(() => {
        swTimeEnd(label);
      }));
      return;
    }
  } catch (e) {
  }

  if (!shouldHandleRequest(request.url)) return;

  // Для app shell навигации (HTML) используем network-first,
  // чтобы после деплоя не показывать целиком старую версию из кеша.
  try {
    const url = new URL(request.url);
    const isAppShellNav = (request.mode === 'navigate')
      && (url.origin === self.location.origin)
      && (url.pathname === '/' || url.pathname.startsWith('/dictation/'));
    if (isAppShellNav) {
      const label = `sw#${reqId} nav ${reqPath}`;
      swTimeStart(label);
      event.respondWith((async () => {
        try {
          return await networkFirstAppShell(request, event);
        } finally {
          swTimeEnd(label);
        }
      })());
      return;
    }
  } catch (e) {
  }

  if (isImageUrl(request.url)) {
    const label = `sw#${reqId} image ${reqPath}`;
    swTimeStart(label);
    event.respondWith((async () => {
      try {
        return await staleWhileRevalidateImage(request, event);
      } finally {
        swTimeEnd(label);
      }
    })());
    return;
  }

  // Для Range-запросов (часто для <audio>) отдаём 206 Partial Content из кеша.
  const hasRange = request.headers && request.headers.has('range');
  if (hasRange && request.url.includes('/api/dictations/')) {
    // все аудио должны быть из кеша
    // Range-запросы для аудио тоже должны быть только из кеша.
    const label = `sw#${reqId} dictations-range ${reqPath}`;
    swTimeStart(label);
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
              // bytes=-N (суффикс)
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
            // Если не получилось собрать range-ответ, отдаём полный кешированный ответ
            return cached;
          }
        }

        // Если /api/dictations отсутствует в кеше, разрешаем сетевой fallback и кладём в кеш для будущей офлайн-работы.
        try {
          const u = new URL(request.url);
          if (u.pathname && u.pathname.startsWith('/api/dictations/')) {
            const netRes = await fetch(request);
            if (netRes && netRes.ok) {
              try {
                await cache.put(request.url, netRes.clone());
              } catch (e) {
              }
              return netRes;
            }

            // ВАЖНО: если сеть ответила (даже ошибкой), возвращаем этот ответ.
            // Не маскируем реальные backend-коды синтетическим Offline 503.
            if (netRes) {
              return netRes;
            }
          }
        } catch (e) {
        }
      } catch (e) {
        // игнорируем
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })().finally(() => {
      swTimeEnd(label);
    }));
    return;
  }

  // все аудио должны быть из кеша
  // Диктант должен уметь работать полностью офлайн.
  try {
    const url = new URL(request.url);
    if (url.pathname && url.pathname.startsWith('/api/dictations/')) {
      const label = `sw#${reqId} dictations ${reqPath}`;
      swTimeStart(label);
      event.respondWith((async () => {
        try {
          const cache = await caches.open(MEDIA_CACHE_PERSIST);
          const cached = await cache.match(request.url);
          if (cached) return cached;

          // /api/dictations: если ещё не закешировано, берём из сети и кладём в кеш.
          const netRes = await fetch(request);
          if (netRes && netRes.ok) {
            try {
              await cache.put(request.url, netRes.clone());
            } catch (e) {
            }
            return netRes;
          }

          // ВАЖНО: если сеть ответила (даже ошибкой), возвращаем этот ответ.
          // Не маскируем реальные backend-коды синтетическим Offline 503.
          if (netRes) {
            return netRes;
          }
        } catch (e) {
        }
        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })().finally(() => {
        swTimeEnd(label);
      }));
      return;
    }
  } catch (e) {
  }

  if (isUnboundedUrl(request.url)) {
    const label = `sw#${reqId} unbounded ${reqPath}`;
    swTimeStart(label);
    event.respondWith((async () => {
      try {
        return await cacheFirstUnbounded(request, event);
      } finally {
        swTimeEnd(label);
      }
    })());
  } else {
    const label = `sw#${reqId} bounded ${reqPath}`;
    swTimeStart(label);
    event.respondWith((async () => {
      try {
        return await cacheFirstBounded(request, event);
      } finally {
        swTimeEnd(label);
      }
    })());
  }
});

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

      const cached = await cache.match(normalizedKey);
      if (cached) {
        skipped += 1;
        continue;
      }

      const res = await fetch(new Request(url, { method: 'GET' }));
      if (res && res.ok) {
        try {
          await cache.put(normalizedKey, res.clone());
        } catch (e) {
        }
        fetched += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      failed += 1;
    }
  }

  return { fetched, skipped, failed, total: (urls || []).length };
}

async function prefetchUrlsStrict(urls, options = {}) {
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  const failedUrls = [];
  void (options);

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

      const cached = await cache.match(normalizedKey);
      if (cached) {
        skipped += 1;
        continue;
      }

      const res = await fetch(new Request(url, { method: 'GET' }));
      if (res && res.ok) {
        try {
          await cache.put(normalizedKey, res.clone());
        } catch (e) {
        }
        fetched += 1;
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

  const ok = failed === 0;
  return {
    ok,
    fetched,
    skipped,
    failed,
    total: (urls || []).length,
    failedUrls,
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

async function purgeDictationFromMediaCache(dictationId) {
  // Удаляем /api/dictations/dict_123/... из постоянного медиа-кеша.
  const cache = await caches.open(MEDIA_CACHE_PERSIST);
  const keys = await cache.keys();

  const dictKey = String(dictationId || '').trim();
  if (!dictKey) return { deleted: 0, dictationId: dictKey };

  const numericId = dictKey.startsWith('dict_')
    ? dictKey.replace(/^dict_/, '')
    : dictKey;

  let deleted = 0;
  for (const req of keys) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      // Аудио: /api/dictations/dict_123/...
      if (path.startsWith(`/api/dictations/${dictKey}/`)) {
        const ok = await cache.delete(req);
        if (ok) deleted += 1;
        continue;
      }

      // Обложка: /api/dictations_covers/<id>.webp
      if (path === `/api/dictations_covers/${numericId}.webp` || path === `/api/dictations_covers/${dictKey}.webp`) {
        const ok = await cache.delete(req);
        if (ok) deleted += 1;
        continue;
      }
    } catch (e) {
      // игнорируем
    }
  }

  return { deleted, dictationId: dictKey };
}

async function promoteDraftDictationCache(fromDictationId, toDictationId) {
  // Дублируем черновое аудио в кеше, не обращаясь к сети:
  // источник: /api/dictations/<fromId>/<lang>/<file>
  // назначение: /api/dictations/<toId>/<lang>/<file>
  const cache = await caches.open(MEDIA_CACHE_PERSIST);
  const keys = await cache.keys();

  const fromId = String(fromDictationId || '').trim();
  const toIdRaw = String(toDictationId || '').trim();
  const toId = toIdRaw.startsWith('dict_') ? toIdRaw : `dict_${toIdRaw}`;

  const fromPrefix = `/api/dictations/${fromId}/`;
  const toFinalPrefix = `/api/dictations/${toId}/`;

  const toNumeric = toId.replace(/^dict_/, '');
  const fromCoverPath = `/api/dictations_covers/${fromId}.webp`;
  const toCoverPath = `/api/dictations_covers/${toNumeric}.webp`;

  let copiedFinal = 0;
  let copiedCover = 0;

  for (const req of keys) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;
      if (path.startsWith(fromPrefix)) {
        const nextFinal = path.replace(fromPrefix, toFinalPrefix);

        const fromUrl = new URL(path, self.location.origin).toString();
        const finalUrl = new URL(nextFinal, self.location.origin).toString();

        try {
          const res = await cache.match(fromUrl);
          if (res) {
            await cache.put(finalUrl, res.clone());
            copiedFinal += 1;
          }
        } catch (e) {
          // игнорируем
        }
        continue;
      }
    } catch (e) {
      // игнорируем
    }
  }

  // Превращаем обложку черновика: из overlay-ключа в numeric-ключ диктанта.
  try {
    const fromCoverUrl = new URL(fromCoverPath, self.location.origin).toString();
    const cachedCover = await cache.match(fromCoverUrl);
    if (cachedCover) {
      const toCoverUrl = new URL(toCoverPath, self.location.origin).toString();
      await cache.put(toCoverUrl, cachedCover.clone());
      copiedCover += 1;
    }
  } catch (e) {
    // игнорируем
  }

  return { copiedFinal, copiedCover, fromId, toId };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const { action, requestId } = data;

  const respond = (payload) => {
    try {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ requestId, ...payload });
      }
    } catch (e) {
      // игнорируем
    }
  };

  (async () => {
    try {
      if (action === 'purgeDictation') {
        const res = await purgeDictationFromMediaCache(data.dictationId);
        respond({ success: true, result: res });
        return;
      }

      if (action === 'promoteDraftCache') {
        const res = await promoteDraftDictationCache(data.fromDictationId, data.toDictationId);
        respond({ success: true, result: res });
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
        const res = await prefetchUrlsStrict(urls, { ignoreLimit: !!data.ignoreLimit });
        if (res.ok) {
          respond({ success: true, result: res });
        } else {
          respond({ success: false, error: 'prefetch_failed', result: res });
        }
        return;
      }

      if (action === 'checkCached') {
        const urls = Array.isArray(data.urls) ? data.urls : [];
        const res = await checkUrlsInCache(urls);
        respond({ success: true, result: res });
        return;
      }

      if (action === 'saveQueueCleanup') {
        // SW просто подтверждает получение — cleanup уже сделан на клиенте
        respond({ success: true });
        return;
      }

      respond({ success: false, error: 'unknown_action' });
    } catch (e) {
      respond({ success: false, error: String(e) });
    }
  })();
});
