/* Stooorna: never show the top "Install the app" banner (browser page or installed app).
 * Put this file in public/ and load it first in index.html:
 *   <script src="/no-install-banner.js"></script>
 */
(function () {
  try { sessionStorage.setItem('stooorna_pwa_banner_hidden', '1'); } catch (e) { /* ignore */ }
  try {
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); }, true);
  } catch (e) { /* ignore */ }
})();
