(function () {
  function init() {
    const root = document.getElementById('desktop-root');
    if (!root) return;
    root.innerHTML = '<div style="padding:14px; color: rgba(0,0,0,0.65);">Loading…</div>';
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {
  }
})();
