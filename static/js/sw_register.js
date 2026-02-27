(function () {
  try {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      const rev = (window && window.__APP_CACHE_REVISION) ? String(window.__APP_CACHE_REVISION) : '';
      const url = rev ? (`/sw.js?v=${encodeURIComponent(rev)}`) : '/sw.js';
      navigator.serviceWorker.register(url).catch(function () {
        // ignore
      });
    });
  } catch (e) {
    // ignore
  }
})();
