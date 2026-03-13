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

    var progressState = {
      active: false,
      label: '',
      percent: null,
      kind: '',
      updatedAt: 0,
    };

    // Public page-published info shown on the right.
    // Example: setSwBarMeta('build: ...') or setSwBarInfo('release', '2026-03-11')
    var pageInfo = {
      meta: '',
      kv: {},
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

    function buildMetaText() {
      try {
        if (pageInfo && pageInfo.meta) {
          var forced = String(pageInfo.meta || '').trim();
          if (forced) return forced;
        }
      } catch (e) {
      }

      var parts = [];
      try {
        var build = getBuildValue();
        if (build) parts.push('build: ' + build);
      } catch (e) {
      }

      try {
        var kv = (pageInfo && pageInfo.kv) ? pageInfo.kv : {};
        var keys = Object.keys(kv || {});
        for (var i = 0; i < keys.length; i++) {
          var k = String(keys[i] || '').trim();
          if (!k) continue;
          if (k === 'build') continue;
          var v = String(kv[k] || '').trim();
          if (!v) continue;
          parts.push(k + ': ' + v);
        }
      } catch (e) {
      }

      return parts.join(' | ');
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
          "#" + BAR_ID + " .swbar-left-wrap{display:flex;align-items:center;gap:10px;min-width:0;}" +
          "#" + BAR_ID + " .swbar-msg{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
          "#" + BAR_ID + " .swbar-progress{display:none;align-items:center;gap:8px;flex:0 0 auto;}" +
          "#" + BAR_ID + " .swbar-progress.on{display:flex;}" +
          "#" + BAR_ID + " .swbar-progress-track{width:160px;height:8px;border-radius:999px;background:rgba(0,0,0,0.06);overflow:hidden;}" +
          "#" + BAR_ID + " .swbar-progress-bar{height:100%;width:0%;background:rgba(0,0,0,0.12);transition:none;}" +
          "#" + BAR_ID + " .swbar-progress.is-db .swbar-progress-bar{background:var(--color-button-text-lightgreen, rgba(25,166,74,0.85));}" +
          "#" + BAR_ID + " .swbar-progress.is-audio .swbar-progress-bar{background:var(--color-button-text-purple, rgba(126,34,206,0.85));}" +
          "#" + BAR_ID + " .swbar-progress.is-cache .swbar-progress-bar{background:rgba(0,0,0,0.14);}" +
          "#" + BAR_ID + " .swbar-progress-pct{opacity:0.85;}" +
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
        el.style.borderTop = '0';
        el.style.backdropFilter = 'blur(6px)';
        el.style.webkitBackdropFilter = 'blur(6px)';
        el.style.pointerEvents = 'none';

        var inner = document.createElement('div');
        inner.className = 'swbar-inner';
        var left = document.createElement('div');
        left.className = 'swbar-left';
        left.id = BAR_ID + '__left';

        var leftWrap = document.createElement('div');
        leftWrap.className = 'swbar-left-wrap';

        var msg = document.createElement('div');
        msg.className = 'swbar-msg';
        msg.id = BAR_ID + '__msg';
        msg.textContent = 'SW: idle';

        var prog = document.createElement('div');
        prog.className = 'swbar-progress';
        prog.id = BAR_ID + '__progress';

        var progLabel = document.createElement('div');
        progLabel.id = BAR_ID + '__progressLabel';
        progLabel.textContent = '';

        var track = document.createElement('div');
        track.className = 'swbar-progress-track';
        var bar = document.createElement('div');
        bar.className = 'swbar-progress-bar';
        bar.id = BAR_ID + '__progressBar';
        track.appendChild(bar);

        var pct = document.createElement('div');
        pct.className = 'swbar-progress-pct';
        pct.id = BAR_ID + '__progressPct';
        pct.textContent = '';

        leftWrap.appendChild(msg);
        left.appendChild(leftWrap);

        var right = document.createElement('div');
        right.className = 'swbar-right';
        right.id = BAR_ID + '__right';

        var meta = document.createElement('div');
        meta.className = 'swbar-meta';
        meta.id = BAR_ID + '__meta';
        meta.textContent = buildMetaText();

        prog.appendChild(progLabel);
        prog.appendChild(track);
        prog.appendChild(pct);

        right.appendChild(prog);
        if (meta.textContent) right.appendChild(meta);

        inner.appendChild(left);
        inner.appendChild(right);
        el.appendChild(inner);
        document.body.appendChild(el);

        // reflect any pending progress state
        try {
          if (progressState && progressState.active) {
            updateProgressUi(progressState.label, progressState.percent, progressState.kind);
          }
        } catch (e) {
        }
        return el;
      } catch (e) {
        return null;
      }
    }

    function updateProgressUi(label, percent, kind) {
      try {
        var prog = document.getElementById(BAR_ID + '__progress');
        if (!prog) return;
        var lbl = document.getElementById(BAR_ID + '__progressLabel');
        var bar = document.getElementById(BAR_ID + '__progressBar');
        var pct = document.getElementById(BAR_ID + '__progressPct');

        var text = String(label || '').trim();
        if (lbl) lbl.textContent = text;

        try {
          prog.classList.remove('is-db', 'is-audio', 'is-cache');
          var k = String(kind || '').trim();
          if (k === 'db') prog.classList.add('is-db');
          else if (k === 'audio') prog.classList.add('is-audio');
          else if (k === 'cache') prog.classList.add('is-cache');
        } catch (e0) {
        }

        var p = (percent === 0 || percent) ? Number(percent) : NaN;
        var hasPct = isFinite(p) && p >= 0;
        var k2 = String(kind || '').trim();
        if (pct) {
          if (k2 === 'cache') {
            pct.textContent = text;
            if (lbl) lbl.textContent = '';
          } else {
            pct.textContent = hasPct ? (Math.min(100, Math.max(0, Math.round(p))) + '%') : '';
          }
        }
        if (bar) bar.style.width = hasPct ? (Math.min(100, Math.max(0, p)) + '%') : '12%';

        if (text || hasPct) {
          prog.classList.add('on');
        } else {
          prog.classList.remove('on');
          if (bar) bar.style.width = '0%';
        }
      } catch (e) {
      }
    }

    function setBarText(message) {
      try {
        var el = ensureBar();
        if (!el) return;
        var msg = String(message || '').trim();
        if (!msg) msg = 'SW: idle';
        var msgEl = document.getElementById(BAR_ID + '__msg');
        if (msgEl) {
          msgEl.textContent = msg;
        } else {
          var left = document.getElementById(BAR_ID + '__left');
          if (left) {
            left.textContent = msg;
          } else {
            el.textContent = msg;
          }
        }

        // keep meta refreshed (some pages set build var after scripts)
        refreshMeta();
      } catch (e) {
      }
    }

    function refreshMeta() {
      try {
        var meta = document.getElementById(BAR_ID + '__meta');
        var right = document.getElementById(BAR_ID + '__right');
        var text = buildMetaText();
        if (!meta && text) {
          // Meta didn't exist at initial render (e.g. build var was set later).
          // Create it lazily when we finally have something to show.
          meta = document.createElement('div');
          meta.className = 'swbar-meta';
          meta.id = BAR_ID + '__meta';
          meta.textContent = text;
          if (right) {
            right.appendChild(meta);
          }
          return;
        }

        if (!meta) return;

        meta.textContent = text;
        if (!text) {
          // keep DOM clean
          try {
            if (meta.parentNode) meta.parentNode.removeChild(meta);
          } catch (e2) {
          }
        }
      } catch (e) {
      }
    }

    // Public API
    try {
      window.setSwBarMeta = function (text) {
        try {
          pageInfo.meta = String(text || '').trim();
        } catch (e) {
          pageInfo.meta = '';
        }
        try {
          ensureBar();
        } catch (e) {
        }
        refreshMeta();
      };

      window.setSwBarInfo = function (key, value) {
        try {
          var k = String(key || '').trim();
          if (!k) return;
          var v = String(value || '').trim();
          if (!pageInfo.kv) pageInfo.kv = {};
          if (!v) {
            try { delete pageInfo.kv[k]; } catch (e2) {}
          } else {
            pageInfo.kv[k] = v;
          }
        } catch (e) {
        }
        try {
          ensureBar();
        } catch (e) {
        }
        refreshMeta();
      };

      window.setSwBarProgress = function (label, percent, kind) {
        try {
          var l = String(label || '').trim();
          var p = (percent === 0 || percent) ? Number(percent) : null;
          var k = String(kind || '').trim();
          if (!(p === null || (isFinite(p) && p >= 0))) {
            p = null;
          }
          progressState.active = !!(l || (p === 0 || p));
          progressState.label = l;
          progressState.percent = p;
          progressState.kind = k;
          progressState.updatedAt = Date.now();
        } catch (e) {
          progressState.active = false;
          progressState.label = '';
          progressState.percent = null;
          progressState.kind = '';
        }
        try {
          ensureBar();
        } catch (e) {
        }
        updateProgressUi(progressState.label, progressState.percent, progressState.kind);
      };
    } catch (e) {
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
