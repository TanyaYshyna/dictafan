(function () {
  try {
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

        if (prev && prev !== v && !alreadyReloaded) {
          try {
            sessionStorage.setItem(onceKey, 'true');
          } catch (e) {
          }
          try {
            localStorage.setItem(k, v);
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
  } catch (e) {
  }
})();
