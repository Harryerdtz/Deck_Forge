/* DeckForge - Boot. */
(function () {
  'use strict';
  function boot() {
    try {
      window.DFUI.init();
    } catch (err) {
      var el = document.getElementById('screen');
      if (el) {
        el.innerHTML = '<div style="padding:24px;font-family:monospace;color:#e8e2d0">Fehler beim Start: ' +
          String(err && err.message ? err.message : err).replace(/[<>&]/g, '') + '</div>';
      }
      if (window.console) console.error(err);
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache optional */ });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
