/* Stooorna fixes — put in public/ and load FIRST in index.html (before the module script):
 *   <script src="/stooorna-fixes.js"></script>
 *
 * 1) APK only: lifts every page above the Android system buttons.
 * 2) APK + website: removes the top "Install the app" banner.
 * 3) APK + website: removes the bottom Cookie Consent popup.
 * The APK loads https://stooorna.com (capacitor server.url), so deploying this to the site fixes the APK too — no rebuild.
 */
(function () {
  'use strict';
  if (window.__stooornaFixes) return;
  window.__stooornaFixes = true;

  /* ---------- helpers ---------- */
  var isNative = false;
  try {
    isNative = !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.platform === 'android'));
  } catch (e) { /* ignore */ }
  // Android WebView fallback (Capacitor injects its bridge a bit later than this script)
  if (!isNative) { try { isNative = /Android/.test(navigator.userAgent) && /; wv\)/.test(navigator.userAgent); } catch (e) { /* ignore */ } }

  /* ---------- 2) never show the install banner ---------- */
  try { sessionStorage.setItem('stooorna_pwa_banner_hidden', '1'); } catch (e) { /* ignore */ }
  try { window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); }, true); } catch (e) { /* ignore */ }

  /* ---------- 1) lift the app above the Android buttons ---------- */
  // Height of the system buttons area. 3-button bar is 48dp; gesture bar is smaller. If the OS reports a real
  // safe-area inset we use it, otherwise 48px. Change NAV_PX if you want it higher/lower.
  var NAV_PX = 48;
  if (isNative) {
    var st = document.createElement('style');
    st.setAttribute('data-stooorna-fixes', '1');
    st.textContent =
      ':root{--stooorna-nav:max(env(safe-area-inset-bottom,0px),' + NAV_PX + 'px)}' +
      'html,body{background:#060e0e!important;height:100%;overflow:hidden}' +
      /* #app becomes the "screen": it ends above the system buttons, and position:fixed children
         (bottom sheets, bars, the GPS card) are measured from it instead of from the real screen bottom */
      '#app{position:fixed!important;top:0;left:0;right:0;bottom:var(--stooorna-nav);' +
      'transform:translateZ(0);overflow:hidden}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 2 + 3) remove install banner and cookie popup ---------- */
  var INSTALL_RE = /Install the app|ثبّ?ت التطبيق على جوالك/i;
  var COOKIE_RE = /We serve cookies|Cookie Consent/i;

  // climb from the text node's element up to the outer fixed/sticky/absolute container and remove that
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
  /* ---------- 4) APK: Polar checkout opens INSIDE the app (not the phone browser, not an iframe) ----------
   * The app does window.open('about:blank') and then sets .location.href = <Polar url>. In the APK that opens Chrome.
   * Here we hand back a stand-in window whose location setter navigates the app's own WebView to the Polar page.
   * Needs the Polar/Stripe hosts in capacitor.config.json -> server.allowNavigation (APK rebuild, see notes);
   * after paying, Polar returns to stooorna.com/?coins_paid=1 which is already allowed. */
  (function () {
    var realOpen = window.open;
    var IN_APP = /(^|\.)(stooorna\.com|polar\.sh|stripe\.com|stripe\.network)$/i;
    function nativeNow() {
      try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true; } catch (e) { /* ignore */ }
      return isNative;
    }
    function hostOf(u) { try { return new URL(u, location.href).hostname; } catch (e) { return ''; } }
    function go(u) {
      u = String(u || '');
      if (!u || u === 'about:blank') return;
      if (IN_APP.test(hostOf(u))) { window.location.assign(u); return; }
      try { realOpen.call(window, u, '_blank', 'noopener,noreferrer'); } catch (e) { /* ignore */ }
    }
    function standIn() {
      var loc = {};
      Object.defineProperty(loc, 'href', { get: function () { return 'about:blank'; }, set: function (v) { go(v); } });
      loc.assign = go; loc.replace = go;
      return { closed: false, opener: null, location: loc, focus: function () {}, blur: function () {}, close: function () { this.closed = true; }, document: { write: function () {}, writeln: function () {}, open: function () {}, close: function () {} } };
    }
    window.open = function (url) {
      if (!nativeNow()) return realOpen.apply(window, arguments);
      var u = url == null ? '' : String(url);
      if (u === '' || u === 'about:blank') return standIn();
      if (/(^|\.)(polar\.sh|stripe\.com)$/i.test(hostOf(u))) { go(u); return standIn(); }
      return realOpen.apply(window, arguments);
    };
  })();
})();
