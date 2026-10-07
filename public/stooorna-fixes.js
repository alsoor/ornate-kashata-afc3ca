/* Stooorna fixes — public/stooorna-fixes.js, loaded first in index.html:
 *   <script src="/stooorna-fixes.js"></script>
 *
 * 1) Website + APK: removes the top "Install the app" banner and the bottom Cookie Consent popup.
 * 2) APK only: buying Coins with Polar opens Polar's own checkout as a page that slides up INSIDE the live
 *    (tap X and it slides down, you stay in the broadcast) instead of throwing you out to the phone browser.
 * (The space above the Android buttons is handled natively in MainActivity/TopInsetsListener, not here.)
 */
(function () {
  'use strict';
  if (window.__stooornaFixes) return;
  window.__stooornaFixes = true;

  /* ---------- native (APK) detection ---------- */
  function nativeNow() {
    try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true; } catch (e) { /* ignore */ }
    try { return /Android/.test(navigator.userAgent) && /; wv\)/.test(navigator.userAgent); } catch (e) { return false; }
  }

  /* ---------- 1) never show the install banner ---------- */
  try { sessionStorage.setItem('stooorna_pwa_banner_hidden', '1'); } catch (e) { /* ignore */ }
  try { window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); }, true); } catch (e) { /* ignore */ }

  var INSTALL_RE = /Install the app|ثبّ?ت التطبيق على جوالك/i;
  var COOKIE_RE = /We serve cookies|Cookie Consent/i;
  function outerBox(el) {
    var best = el, n = el;
    for (var i = 0; i < 8 && n && n !== document.body && n.id !== 'app' && n.id !== 'root'; i++) {
      var pos = '';
      try { pos = getComputedStyle(n).position; } catch (e) { /* ignore */ }
      if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') best = n;
      n = n.parentElement;
    }
    return best;
  }
  function sweep() {
    if (!document.body) return;
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var hits = [], t;
    while ((t = w.nextNode())) {
      var s = t.nodeValue;
      if (s && s.length < 400 && (INSTALL_RE.test(s) || COOKIE_RE.test(s))) hits.push(t.parentElement);
    }
    hits.forEach(function (el) {
      if (!el || !el.isConnected) return;
      var box = outerBox(el);
      if (box === document.body || box.id === 'app' || box.id === 'root') box = el;
      box.style.setProperty('display', 'none', 'important');
    });
  }
  var timer = null;
  function schedule() { if (timer) return; timer = setTimeout(function () { timer = null; sweep(); }, 60); }
  function start() {
    sweep();
    try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();

  /* ---------- 2) APK: Polar checkout stays inside the live ----------
   * The app first does window.open('about:blank') and then window.open(<Polar url>). In the APK both leave the app
   * ("Open with Chrome/Brave..."). When window.open yields nothing, the app already falls back to its own
   * "Checkout" sheet (slides up, X slides it down) that hosts Polar's official checkout. So inside the APK we just
   * make those two calls yield nothing. Everything else (e.g. Google Maps links) opens as before. */
  var realOpen = window.open;
  function hostOf(u) { try { return new URL(u, location.href).hostname; } catch (e) { return ''; } }
  window.open = function (url) {
    if (nativeNow()) {
      var u = url == null ? '' : String(url);
      if (u === '' || u === 'about:blank') return null;
      if (/(^|\.)(polar\.sh|stripe\.com)$/i.test(hostOf(u))) return null;
    }
    return realOpen.apply(window, arguments);
  };
})();
