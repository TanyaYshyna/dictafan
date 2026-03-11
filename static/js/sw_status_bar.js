(function () {
  try {
    var BAR_ID = 'swStatusBarGlobal';
    var STYLE_ID = 'swStatusBarGlobalStyle';
    var state = {
      lastMessage: '',
      lastTs: 0,
      idleAfterMs: 2500,
      timer: null,
    };

    function getBuildValue() {
      try {
        var candidates = [
          window.__DICTATION_EDITOR_BUILD,
          window.__DICTATION_BUILD,
          window.__PRIVATE_LIBRARY_BUILD,
          window.__APP_CACHE_REVISION,
        ];
        for (var i = 0; i < candidates.length; i++) {
          var v = String(candidates[i] || '').trim();
          if (v) return v;
        }
      } catch (e) {
      }
      return '';
    }

    function ensureStyle() {
      try {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = "" +
          "#" + BAR_ID + "{box-sizing:border-box;}" +
          "#" + BAR_ID + " .swbar-inner{display:flex;align-items:center;justify-content:space-between;gap:10px;}" +
          "#" + BAR_ID + " .swbar-left{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
          "#" + BAR_ID + " .swbar-right{display:flex;align-items:center;gap:10px;flex:0 0 auto;}" +
          "#" + BAR_ID + " .swbar-meta{opacity:0.75;}" +
          "#" + BAR_ID + " .swbar-btn{pointer-events:auto;cursor:pointer;border:1px solid rgba(0,0,0,0.18);background:rgba(255,255,255,0.7);color:rgba(0,0,0,0.8);border-radius:8px;padding:2px 8px;font-size:12px;line-height:18px;}" +
          "#" + BAR_ID + " .swbar-btn:active{transform:translateY(1px);}"
        ;
        document.head.appendChild(style);
      } catch (e) {
      }
    }

    function ensureBar() {
      try {
        var el = document.getElementById(BAR_ID);
        if (el) return el;
        ensureStyle();
        el = document.createElement('div');
        el.id = BAR_ID;
        el.style.position = 'fixed';
        el.style.left = '0';
        el.style.right = '0';
        el.style.bottom = '0';
        el.style.zIndex = '2147483647';
        el.style.padding = '6px 10px';
        el.style.fontSize = '12px';
        el.style.lineHeight = '1.2';
        el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        el.style.color = 'rgba(0,0,0,0.75)';
        el.style.background = 'rgba(240,240,240,0.95)';
        el.style.borderTop = '1px solid rgba(0,0,0,0.08)';
        el.style.backdropFilter = 'blur(6px)';
        el.style.webkitBackdropFilter = 'blur(6px)';
        el.style.pointerEvents = 'none';

        var inner = document.createElement('div');
        inner.className = 'swbar-inner';
        var left = document.createElement('div');
        left.className = 'swbar-left';
        left.id = BAR_ID + '__left';
        left.textContent = 'SW: idle';

        var right = document.createElement('div');
        right.className = 'swbar-right';

        var meta = document.createElement('div');
        meta.className = 'swbar-meta';
        meta.id = BAR_ID + '__meta';
        var build = getBuildValue();
        meta.textContent = build ? ('build: ' + build) : '';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swbar-btn';
        btn.id = BAR_ID + '__cacheBtn';
        btn.textContent = 'Cache';
        btn.title = 'Оффлайн кеш / отладка хранилища';
        btn.addEventListener('click', function () {
          try {
            // 1) If desk modal helper exists
            if (typeof window.openOfflineCacheModal === 'function') {
              window.openOfflineCacheModal();
              return;
            }
            // 2) Try to open modal by id (if present)
            var m = document.getElementById('offline-cache-modal');
            if (m) {
              m.style.display = 'flex';
              return;
            }
            // 3) If dictation overlay exists, show it
            if (typeof window.showDictationCacheFetchOverlay === 'function') {
              window.showDictationCacheFetchOverlay('offline cache');
              return;
            }
          } catch (e) {
          }
        });

        right.appendChild(btn);
        if (meta.textContent) right.appendChild(meta);

        inner.appendChild(left);
        inner.appendChild(right);
        el.appendChild(inner);
        document.body.appendChild(el);
        return el;
      } catch (e) {
        return null;
      }
    }

    function setBarText(message) {
      try {
        var el = ensureBar();
        if (!el) return;
        var msg = String(message || '').trim();
        if (!msg) msg = 'SW: idle';
        var left = document.getElementById(BAR_ID + '__left');
        if (left) {
          left.textContent = msg;
        } else {
          el.textContent = msg;
        }

        // keep meta refreshed (some pages set build var after scripts)
        var meta = document.getElementById(BAR_ID + '__meta');
        if (meta) {
          var build = getBuildValue();
          meta.textContent = build ? ('build: ' + build) : '';
        }
      } catch (e) {
      }
    }

    function hideLegacyBuildBadges() {
      try {
        var ids = [
          'private-library-build-badge',
          'dictation-build-badge',
          'dictation-editor-build-badge',
          'dictation-cache-fetch-overlay',
        ];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) {
            el.style.display = 'none';
          }
        }
      } catch (e) {
      }
    }

    function touch(message, opts) {
      try {
        state.lastMessage = String(message || '');
        state.lastTs = Date.now();
        setBarText(state.lastMessage || 'SW: idle');

        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }

        var idleAfterMs = (opts && typeof opts.idleAfterMs === 'number') ? opts.idleAfterMs : state.idleAfterMs;
        if (idleAfterMs > 0) {
          state.timer = setTimeout(function () {
            try {
              var age = Date.now() - state.lastTs;
              if (age >= idleAfterMs) {
                setBarText('SW: idle');
              }
            } catch (e) {
            }
          }, idleAfterMs);
        }
      } catch (e) {
      }
    }

    function installInterceptor() {
      try {
        var currentImpl = null;
        var wrapper = function (message, opts) {
          try {
            touch(message, opts || {});
          } catch (e) {
          }
          try {
            if (typeof currentImpl === 'function' && currentImpl !== wrapper) {
              return currentImpl(message, opts);
            }
          } catch (e) {
          }
        };

        Object.defineProperty(window, 'setSwStatus', {
          configurable: true,
          enumerable: true,
          get: function () {
            return wrapper;
          },
          set: function (fn) {
            if (typeof fn === 'function') {
              currentImpl = fn;
            } else {
              currentImpl = null;
            }
          }
        });

        // Trigger initial render
        touch('SW: idle', { idleAfterMs: 0 });
      } catch (e) {
        // If defineProperty fails, fallback to a plain function.
        try {
          if (typeof window.setSwStatus !== 'function') {
            window.setSwStatus = function (message, opts) {
              touch(message, opts || {});
            };
          }
          touch('SW: idle', { idleAfterMs: 0 });
        } catch (e2) {
        }
      }
    }

    function boot() {
      try {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () {
            ensureBar();
            hideLegacyBuildBadges();
          });
        } else {
          ensureBar();
          hideLegacyBuildBadges();
        }
      } catch (e) {
      }
      installInterceptor();
    }

    boot();
  } catch (e) {
  }
})();
