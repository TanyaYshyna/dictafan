(function () {
  try {
    function getNowIso() {
      try {
        return new Date().toISOString();
      } catch (e) {
        return '';
      }
    }

    function safeJsonParse(raw, fallback) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    }

    function persistentLog(event, data) {
      try {
        var key = 'dictafan:persistent_logs';
        var max = 250;
        var entry = {
          ts: getNowIso(),
          t: Date.now(),
          build: (window && window.__APP_BUILD) ? String(window.__APP_BUILD) : '',
          event: String(event || ''),
          data: (data === undefined) ? null : data
        };
        var raw = '';
        try {
          raw = localStorage.getItem(key) || '';
        } catch (e) {
          raw = '';
        }
        var list = Array.isArray(raw && raw.length ? safeJsonParse(raw, []) : [])
          ? safeJsonParse(raw, [])
          : [];
        list.push(entry);
        if (list.length > max) {
          list = list.slice(list.length - max);
        }
        try {
          localStorage.setItem(key, JSON.stringify(list));
        } catch (e) {
        }
      } catch (e) {
      }
    }

    function getAppBuild() {
      try {
        var v = (window && window.__APP_BUILD) ? String(window.__APP_BUILD || '').trim() : '';
        return v;
      } catch (e) {
        return '';
      }
    }

    function installBuildAutoReloader(buildValue, storageKey) {
      try {
        var v = String(buildValue || '');
        if (!v) return;
        var k = String(storageKey || 'dictafan:build');
        var prev = String(localStorage.getItem(k) || '');
        var onceKey = k + ':reloaded:' + v;
        var alreadyReloaded = String(sessionStorage.getItem(onceKey) || '') === 'true';

        try {
          persistentLog('build_check', { prev: prev, next: v, key: k, alreadyReloaded: alreadyReloaded });
        } catch (e) {
        }

        if (prev && prev !== v && !alreadyReloaded) {
          try {
            sessionStorage.setItem(onceKey, 'true');
          } catch (e) {
          }
          try {
            localStorage.setItem(k, v);
          } catch (e) {
          }
          try {
            persistentLog('build_reload', { prev: prev, next: v, reason: 'build_changed' });
          } catch (e) {
          }
          // Вместо жёсткого location.reload() показываем уведомление
          showBuildUpdateNotification(prev, v);
          return;
        }

        if (!prev) {
          try {
            localStorage.setItem(k, v);
          } catch (e) {
          }
          try {
            persistentLog('build_set_initial', { next: v, key: k });
          } catch (e) {
          }
        }
      } catch (e) {
      }
    }

    function _tBuild(key, fallback) {
      try {
        if (typeof window.I18n !== 'undefined' && typeof window.I18n.t === 'function') {
          var v = window.I18n.t('build_update.' + key);
          if (v && v !== 'build_update.' + key) return v;
        }
      } catch (e) {
      }
      return fallback;
    }

    function showBuildUpdateNotification(oldBuild, newBuild) {
      try {
        // Если уведомление уже показано — не дублируем
        if (document.getElementById('dictafan-build-update-banner')) return;

        var banner = document.createElement('div');
        banner.id = 'dictafan-build-update-banner';
        banner.setAttribute('role', 'alert');

        var message = document.createElement('span');
        message.className = 'build-update-banner-message';
        message.textContent = _tBuild('available', 'Доступна новая версия');

        var btn = document.createElement('button');
        btn.className = 'build-update-banner-btn';
        btn.textContent = _tBuild('reload', 'Обновить');
        btn.addEventListener('click', function () {
          try {
            persistentLog('build_reload_manual', { from: oldBuild, to: newBuild });
          } catch (e) {
          }
          location.reload();
        });

        var closeBtn = document.createElement('button');
        closeBtn.className = 'build-update-banner-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Закрыть');
        closeBtn.addEventListener('click', function () {
          try {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(100%)';
            setTimeout(function () {
              try {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
              } catch (e) {
              }
            }, 300);
          } catch (e) {
          }
        });

        banner.appendChild(message);
        banner.appendChild(btn);
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);

        // Анимация появления
        requestAnimationFrame(function () {
          banner.classList.add('visible');
        });

        // Также обновляем статус-бар
        try {
          if (typeof window.setSwBarInfo === 'function') {
            window.setSwBarInfo('update', newBuild);
          }
        } catch (e) {
        }
      } catch (e) {
        // Если что-то пошло не так — fallback на старый reload
        try {
          persistentLog('build_reload_fallback', { from: oldBuild, to: newBuild });
        } catch (e2) {
        }
        location.reload();
      }
    }

    function withCacheBust(url, buildValue) {
      try {
        if (!url || typeof url !== 'string') return url;
        var u = String(url);
        var sep = u.includes('?') ? '&' : '?';
        var v = String(buildValue || '') || '1';
        return u + sep + 'v=' + encodeURIComponent(v);
      } catch (e) {
        return url;
      }
    }

    function withCacheBustVersion(url, version, buildValue) {
      try {
        if (!url || typeof url !== 'string') return url;
        var u = String(url);
        var v = (version !== undefined && version !== null && String(version).trim())
          ? String(version).trim()
          : (String(buildValue || '') || '1');
        var sep = u.includes('?') ? '&' : '?';
        return u + sep + 'v=' + encodeURIComponent(v);
      } catch (e) {
        return url;
      }
    }

    function reportBuildToStatusBar(buildValue) {
      try {
        if (typeof window.setSwBarInfo === 'function') {
          window.setSwBarInfo('build', String(buildValue || '').trim() || 'unknown');
        }
      } catch (e) {
      }
    }

    window.BuildHelpers = {
      getAppBuild: getAppBuild,
      installBuildAutoReloader: installBuildAutoReloader,
      installBuildUpdateNotifier: installBuildAutoReloader,
      showBuildUpdateNotification: showBuildUpdateNotification,
      withCacheBust: withCacheBust,
      withCacheBustVersion: withCacheBustVersion,
      reportBuildToStatusBar: reportBuildToStatusBar
    };

    // Expose persistent log API for debugging across reloads.
    window.PersistentLog = {
      log: persistentLog,
      dump: function () {
        try {
          var raw = localStorage.getItem('dictafan:persistent_logs') || '[]';
          var list = safeJsonParse(raw, []);
          try {
            console.log('[PersistentLog] entries=', Array.isArray(list) ? list.length : 0);
          } catch (e) {
          }
          return list;
        } catch (e) {
          return [];
        }
      },
      clear: function () {
        try {
          localStorage.removeItem('dictafan:persistent_logs');
        } catch (e) {
        }
      },
      download: function (filename) {
        try {
          var name = filename || ('dictafan_logs_' + Date.now() + '.json');
          var raw = localStorage.getItem('dictafan:persistent_logs') || '[]';
          var blob = new Blob([raw], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            try { URL.revokeObjectURL(a.href); } catch (e) {}
            try { document.body.removeChild(a); } catch (e) {}
          }, 0);
        } catch (e) {
        }
      }
    };

    try {
      persistentLog('boot', { href: (location && location.href) ? String(location.href) : '' });
    } catch (e) {
    }

    // Слушаем сообщения от Service Worker об обновлении
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function (event) {
          try {
            var data = event && event.data ? event.data : {};
            if (!data || data.type !== 'sw_build_update') return;
            var payload = data.payload || {};
            var newBuild = String(payload.build || '').trim();
            if (!newBuild) return;
            var currentBuild = String(window.__APP_BUILD || '').trim();
            if (currentBuild && currentBuild === newBuild) return;
            persistentLog('build_sw_notify', { from: currentBuild, to: newBuild });
            showBuildUpdateNotification(currentBuild, newBuild);
          } catch (e) {
          }
        });

        // Если SW обновился и стал контролировать страницу — тоже сигнал
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          try {
            persistentLog('build_controller_change', {});
            // Не показываем уведомление сразу — installBuildAutoReloader уже сработает
            // при следующей загрузке страницы. Но можем обновить статус-бар.
            try {
              if (typeof window.setSwBarInfo === 'function') {
                window.setSwBarInfo('sw', 'updated');
              }
            } catch (e) {
            }
          } catch (e) {
          }
        });
      }
    } catch (e) {
    }
  } catch (e) {
  }
})();
