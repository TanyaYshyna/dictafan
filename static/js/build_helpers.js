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
          location.reload();
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
  } catch (e) {
  }
})();
