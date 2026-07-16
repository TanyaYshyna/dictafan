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

    var leftInfo = {
      text: '',
    };

    // Информация об очередях отправки и интернете
    var queueInfoState = {
      online: navigator.onLine,
      count: 0,
      timerRemainingMs: null,
      updateTimerId: null,
    };

    // Активные диктанты (из DictationRuntime.DictationSessionsStore)
    var activeDictationsState = {
      dictationIds: [],
      dropdownOpen: false,
      updateTimerId: null,
    };

    // Public page-published info shown on the right.
    // Example: setSwBarMeta('build: ...') or setSwBarInfo('release', '2026-03-11')
    var pageInfo = {
      meta: '',
      kv: {},
    };

    function formatTimerRemaining(ms) {
      try {
        if (ms == null || ms <= 0) return '';
        var totalSec = Math.ceil(ms / 1000);
        var hh = Math.floor(totalSec / 3600);
        var mm = Math.floor((totalSec % 3600) / 60);
        var ss = totalSec % 60;
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      } catch (e) {
        return '';
      }
    }

    function updateQueueInfo() {
      try {
        var online = navigator.onLine;
        queueInfoState.online = online;

        if (typeof window.OutboxBatcher !== 'undefined' && typeof window.OutboxBatcher.getQueueInfo === 'function') {
          window.OutboxBatcher.getQueueInfo().then(function (info) {
            try {
              queueInfoState.count = info.count;
              queueInfoState.timerRemainingMs = info.timerRemainingMs;
            } catch (e) {
              console.warn('[SB:53b] updateQueueInfo: ошибка обработки', e);
            }
            renderQueueInfo();
          }).catch(function (err) {
            console.warn('[SB:53c] updateQueueInfo: getQueueInfo rejected', err);
            renderQueueInfo();
          });
        } else {
          renderQueueInfo();
        }
      } catch (e) {
        console.warn('[SB:53e] updateQueueInfo: ошибка', e);
      }
    }

    function renderQueueInfo() {
      try {
        var el = document.getElementById(BAR_ID + '__queueInfo');
        if (!el) {
          console.warn('[SB:77] renderQueueInfo: элемент не найден');
          return;
        }

        var parts = [];

        // Статус интернета
        if (queueInfoState.online) {
          parts.push('🟢 online');
        } else {
          parts.push('🔴 offline');
        }

        // Общая очередь — показываем всегда, даже если 0
        var total = queueInfoState.count;
        var str = 'queue: ' + total;
        var timer = formatTimerRemaining(queueInfoState.timerRemainingMs);
        if (timer) str += ' (' + timer + ')';
        parts.push(str);

        var text = parts.join(' | ');
        el.textContent = text;
      } catch (e) {
        console.warn('[SB:77err] renderQueueInfo: ошибка', e);
      }
    }

    function getActiveDictationIds() {
      try {
        if (typeof window.DictationRuntime === 'undefined' ||
            typeof window.DictationRuntime.DictationSessionsStore === 'undefined' ||
            typeof window.DictationRuntime.DictationSessionsStore._contents === 'undefined') {
          return [];
        }
        var contents = window.DictationRuntime.DictationSessionsStore._contents;
        if (typeof contents.keys === 'function') {
          return Array.from(contents.keys());
        }
        return [];
      } catch (e) {
        return [];
      }
    }

    function updateActiveDictations() {
      try {
        var ids = getActiveDictationIds();
        activeDictationsState.dictationIds = ids;
        renderActiveDictations();
      } catch (e) {
        console.warn('[SB] updateActiveDictations error:', e);
      }
    }

    function renderActiveDictations() {
      try {
        var el = document.getElementById(BAR_ID + '__activeDictations');
        if (!el) return;
        var ids = activeDictationsState.dictationIds;
        if (!ids || ids.length === 0) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'inline-flex';

        // Кнопка-триггер: последний dictationId + иконка
        var lastId = ids[ids.length - 1];
        var trigger = el.querySelector('.swbar-active-dictations-trigger');
        if (trigger) {
          trigger.innerHTML = lastId + ' <span class="swbar-active-dictations-arrow" data-lucide="chevron-down"></span>';
          try { window.renderLucide && window.renderLucide(trigger); } catch (e) {}
        }

        // Выпадающий список
        var dropdown = el.querySelector('.swbar-active-dictations-dropdown');
        if (dropdown) {
          var items = [];
          for (var i = 0; i < ids.length; i++) {
            items.push('<div class="swbar-active-dictations-item">(' + (i + 1) + ') ' + ids[i] + '</div>');
          }
          dropdown.innerHTML = items.join('');
        }
      } catch (e) {
        console.warn('[SB] renderActiveDictations error:', e);
      }
    }

    function startQueueInfoPolling() {
      try {
        if (queueInfoState.updateTimerId) {
          return;
        }
        updateQueueInfo();
        queueInfoState.updateTimerId = setInterval(function () {
          updateQueueInfo();
        }, 5000); // обновление каждые 5 секунд
      } catch (e) {
        console.warn('[SB:109err] startQueueInfoPolling: ошибка', e);
      }
    }

    function startActiveDictationsPolling() {
      try {
        if (activeDictationsState.updateTimerId) {
          return;
        }
        updateActiveDictations();
        activeDictationsState.updateTimerId = setInterval(function () {
          updateActiveDictations();
        }, 5000); // обновление каждые 5 секунд
      } catch (e) {
        console.warn('[SB] startActiveDictationsPolling error:', e);
      }
    }

    function getBuildValue() {
      try {
        var candidates = [
          window.__APP_BUILD,
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
          "#" + BAR_ID + " .swbar-queue-info{flex:0 0 auto;white-space:nowrap;opacity:0.85;}" +
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
          "#" + BAR_ID + " .swbar-btn:active{transform:translateY(1px);}" +
          "#" + BAR_ID + " .swbar-active-dictations{position:relative;display:none;align-items:center;flex:0 0 auto;white-space:nowrap;pointer-events:auto;}" +
          "#" + BAR_ID + " .swbar-active-dictations-trigger{cursor:pointer;border:1px solid rgba(0,0,0,0.18);background:rgba(255,255,255,0.7);color:rgba(0,0,0,0.8);border-radius:8px;padding:2px 8px;font-size:12px;line-height:18px;display:inline-flex;align-items:center;gap:4px;}" +
          "#" + BAR_ID + " .swbar-active-dictations-trigger:active{transform:translateY(1px);}" +
          "#" + BAR_ID + " .swbar-active-dictations-arrow{display:inline-flex;width:14px;height:14px;}" +
          "#" + BAR_ID + " .swbar-active-dictations-dropdown{display:none;position:absolute;bottom:100%;left:0;margin-bottom:4px;background:rgba(240,240,240,0.98);border:1px solid rgba(0,0,0,0.15);border-radius:8px;padding:4px 0;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.12);z-index:2147483647;}" +
          "#" + BAR_ID + " .swbar-active-dictations-dropdown.open{display:block;}" +
          "#" + BAR_ID + " .swbar-active-dictations-item{padding:4px 12px;font-size:12px;line-height:1.4;color:rgba(0,0,0,0.8);cursor:default;}" +
          "#" + BAR_ID + " .swbar-active-dictations-item:hover{background:rgba(0,0,0,0.06);}"
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

        var leftExtra = document.createElement('div');
        leftExtra.className = 'swbar-msg';
        leftExtra.id = BAR_ID + '__leftExtra';
        leftExtra.textContent = '';

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

        var queueInfo = document.createElement('div');
        queueInfo.className = 'swbar-queue-info';
        queueInfo.id = BAR_ID + '__queueInfo';
        queueInfo.textContent = '';

        // B2 Storage health check button
        var b2HealthBtn = document.createElement('button');
        b2HealthBtn.className = 'swbar-b2-health-btn';
        b2HealthBtn.id = BAR_ID + '__b2Health';
        b2HealthBtn.textContent = '☁ B2';
        b2HealthBtn.title = 'Перевірити B2 сховище';
        b2HealthBtn.style.pointerEvents = 'auto';
        b2HealthBtn.style.cursor = 'pointer';
        b2HealthBtn.style.background = 'none';
        b2HealthBtn.style.border = 'none';
        b2HealthBtn.style.padding = '0 4px';
        b2HealthBtn.style.fontSize = '12px';
        b2HealthBtn.style.fontFamily = 'inherit';
        b2HealthBtn.style.color = 'inherit';
        b2HealthBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var btn = e.currentTarget;
          var origText = btn.textContent;
          btn.textContent = '☁ ...';
          btn.disabled = true;
          btn.style.opacity = '0.5';
          fetch('/api/b2/health', { method: 'GET', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var status = data && data.status;
              if (status === 'ok') {
                btn.textContent = '☁ ✅';
              } else if (status === 'disabled') {
                btn.textContent = '☁ ⚪';
              } else {
                btn.textContent = '☁ ❌';
              }
              setTimeout(function () {
                btn.textContent = origText;
                btn.disabled = false;
                btn.style.opacity = '1';
              }, 3000);
            })
            .catch(function () {
              btn.textContent = '☁ ❌';
              setTimeout(function () {
                btn.textContent = origText;
                btn.disabled = false;
                btn.style.opacity = '1';
              }, 3000);
            });
        });

        // Активные диктанты
        var activeDictEl = document.createElement('div');
        activeDictEl.className = 'swbar-active-dictations';
        activeDictEl.id = BAR_ID + '__activeDictations';
        activeDictEl.style.display = 'none';

        var trigger = document.createElement('span');
        trigger.className = 'swbar-active-dictations-trigger';
        trigger.innerHTML = ' <span class="swbar-active-dictations-arrow" data-lucide="chevron-down"></span>';
        try { window.renderLucide && window.renderLucide(trigger); } catch (e) {}

        var dropdown = document.createElement('div');
        dropdown.className = 'swbar-active-dictations-dropdown';

        // Клик по триггеру — открыть/закрыть dropdown
        trigger.addEventListener('click', function (e) {
          e.stopPropagation();
          var isOpen = dropdown.classList.contains('open');
          // Закрыть все другие dropdown'ы
          document.querySelectorAll('.swbar-active-dictations-dropdown.open').forEach(function (d) {
            d.classList.remove('open');
          });
          if (!isOpen) {
            dropdown.classList.add('open');
          } else {
            dropdown.classList.remove('open');
          }
        });

        // Клик вне dropdown — закрыть
        document.addEventListener('click', function () {
          dropdown.classList.remove('open');
        });

        activeDictEl.appendChild(trigger);
        activeDictEl.appendChild(dropdown);

        leftWrap.appendChild(msg);
        leftWrap.appendChild(leftExtra);
        leftWrap.appendChild(activeDictEl);
        leftWrap.appendChild(b2HealthBtn);
        leftWrap.appendChild(queueInfo);
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

        try {
          var applyLayoutOffsets = function () {
            try {
              var barEl = document.getElementById(BAR_ID);
              if (!barEl) return;
              var h = Math.ceil(barEl.getBoundingClientRect().height || 0);
              if (!h) return;
              try {
                document.documentElement.style.setProperty('--sw-status-bar-height', h + 'px');
              } catch (e0) {
              }
              try {
                if (document.body) {
                  document.body.style.paddingBottom = 'calc(' + h + 'px + env(safe-area-inset-bottom))';
                }
              } catch (e1) {
              }
            } catch (e2) {
            }
          };

          applyLayoutOffsets();

          if (!window.__dictafanSwStatusBarResizeHandlerAttached) {
            window.__dictafanSwStatusBarResizeHandlerAttached = true;
            window.addEventListener('resize', function () {
              try { applyLayoutOffsets(); } catch (e3) { }
            });
          }
        } catch (e) {
        }

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

      window.setSwBarLeftInfo = function (text) {
        try {
          leftInfo.text = String(text || '').trim();
        } catch (e) {
          leftInfo.text = '';
        }
        try {
          ensureBar();
        } catch (e2) {
        }
        try {
          var el = document.getElementById(BAR_ID + '__leftExtra');
          if (el) el.textContent = leftInfo.text ? (' ' + leftInfo.text) : '';
        } catch (e3) {
        }
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
            startQueueInfoPolling();
            startActiveDictationsPolling();
          });
        } else {
          ensureBar();
          hideLegacyBuildBadges();
          startQueueInfoPolling();
          startActiveDictationsPolling();
        }
      } catch (e) {
      }
      installInterceptor();

      // Слушаем изменения статуса интернета
      try {
        window.addEventListener('online', function () {
          queueInfoState.online = true;
          updateQueueInfo();
        });
        window.addEventListener('offline', function () {
          queueInfoState.online = false;
          updateQueueInfo();
        });
      } catch (e) {
      }

      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', function (event) {
            try {
              var data = event && event.data ? event.data : {};
              if (!data || data.type !== 'sw_cache_cleanup') return;
              var p = data.payload || {};
              if (!p || p.kind !== 'static_version') return;
              var path = String(p.path || '').trim();
              var deleted = Number(p.deleted);
              if (!path || !(deleted > 0)) return;
              touch('SW: cleaned ' + String(Math.round(deleted)) + ' old cache entr' + (deleted === 1 ? 'y' : 'ies') + ' for ' + path);
            } catch (e2) {
            }
          });
        }
      } catch (e3) {
      }
    }

    boot();
  } catch (e) {
  }
})();
