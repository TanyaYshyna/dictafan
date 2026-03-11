(function () {
  try {
    var BAR_ID = 'swStatusBarGlobal';
    var state = {
      lastMessage: '',
      lastTs: 0,
      idleAfterMs: 2500,
      timer: null,
    };

    function ensureBar() {
      try {
        var el = document.getElementById(BAR_ID);
        if (el) return el;
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
        el.textContent = 'SW: idle';
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
        el.textContent = msg;
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
          });
        } else {
          ensureBar();
        }
      } catch (e) {
      }
      installInterceptor();
    }

    boot();
  } catch (e) {
  }
})();
