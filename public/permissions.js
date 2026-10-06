/* Stooorna — one-tap permissions (location, camera, microphone, notifications, storage).
 * An installed web app cannot declare Android permissions in manifest.json: the browser asks for each one
 * only when a feature first needs it, and a refused/ignored prompt is never shown again by itself.
 * This sheet asks for all of them together, from a real tap, and explains how to fix a blocked one. */
(function () {
  'use strict';
  if (window.__stooornaPerm) return;
  window.__stooornaPerm = true;

  var SKIP_KEY = 'stooorna-perm-skip';
  var SKIP_MS = 3 * 24 * 60 * 60 * 1000;
  var ITEMS = [
    { id: 'notifications', ar: 'الإشعارات', en: 'Notifications' },
    { id: 'geolocation', ar: 'الموقع (GPS)', en: 'Location (GPS)' },
    { id: 'camera', ar: 'الكاميرا', en: 'Camera' },
    { id: 'microphone', ar: 'المايك', en: 'Microphone' },
  ];

  function standalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    } catch (e) { return false; }
  }
  function skipped() {
    try { return Date.now() - Number(localStorage.getItem(SKIP_KEY) || 0) < SKIP_MS; } catch (e) { return false; }
  }
  function setSkip() { try { localStorage.setItem(SKIP_KEY, String(Date.now())); } catch (e) { /* ignore */ } }

  function stateOf(id) {
    if (id === 'notifications') {
      if (!('Notification' in window)) return Promise.resolve('unsupported');
      return Promise.resolve(Notification.permission === 'default' ? 'prompt' : Notification.permission);
    }
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('prompt');
    return navigator.permissions.query({ name: id }).then(function (r) { return r.state; }, function () { return 'prompt'; });
  }
  function allStates() {
    return Promise.all(ITEMS.map(function (it) { return stateOf(it.id); })).then(function (arr) {
      var m = {}; ITEMS.forEach(function (it, i) { m[it.id] = arr[i]; }); return m;
    });
  }

  function askNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'default') return Promise.resolve();
    try {
      var p = Notification.requestPermission();
      return Promise.resolve(p).catch(function () { /* ignore */ });
    } catch (e) { return Promise.resolve(); }
  }
  function askLocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(function () { resolve(); }, function () { resolve(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }
  function stopStream(s) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ } }
  function askMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve();
    var gum = function (c) { return navigator.mediaDevices.getUserMedia(c).then(function (s) { stopStream(s); return true; }, function () { return false; }); };
    // one prompt for both; if the phone lacks one device, ask each on its own
    return gum({ audio: true, video: true }).then(function (ok) {
      if (ok) return;
      return gum({ audio: true }).then(function () { return gum({ video: true }); });
    }).then(function () { /* done */ });
  }
  function askStorage() {
    try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    return Promise.resolve();
  }

  var host = null;
  function css(el, o) { for (var k in o) el.style[k] = o[k]; return el; }
  function close() { if (host && host.parentNode) host.parentNode.removeChild(host); host = null; }

  function label(st) {
    if (st === 'granted') return { t: '✅', c: '#4ade80' };
    if (st === 'denied') return { t: '⛔', c: '#f87171' };
    if (st === 'unsupported') return { t: '—', c: '#9ca3af' };
    return { t: '•', c: '#fbbf24' };
  }

  function render(states, busy, msg) {
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-stooorna-perm', '1');
      css(host, { position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '2147483000', padding: '12px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' });
      document.body.appendChild(host);
    }
    host.textContent = '';
    var card = css(document.createElement('div'), { background: '#050b0c', border: '1px solid rgba(34,211,238,0.35)', borderRadius: '18px', padding: '14px', color: '#fff', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)', direction: 'rtl', textAlign: 'right' });
    var h = css(document.createElement('div'), { fontWeight: '800', fontSize: '1rem', marginBottom: '2px' });
    h.textContent = 'تفعيل أذونات التطبيق · Enable permissions';
    var sub = css(document.createElement('div'), { fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', marginBottom: '10px' });
    sub.textContent = 'للموقع والمكالمات والبث والإشعارات';
    card.appendChild(h); card.appendChild(sub);

    var anyDenied = false;
    ITEMS.forEach(function (it) {
      var st = states[it.id]; if (st === 'denied') anyDenied = true;
      var l = label(st);
      var row = css(document.createElement('div'), { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', marginBottom: '5px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', fontSize: '0.88rem' });
      var a = document.createElement('span'); a.textContent = it.ar + ' · ' + it.en;
      var b = css(document.createElement('span'), { color: l.c, fontWeight: '800' }); b.textContent = l.t;
      row.appendChild(a); row.appendChild(b); card.appendChild(row);
    });

    if (anyDenied) {
      var hint = css(document.createElement('div'), { fontSize: '0.74rem', lineHeight: '1.5', color: '#fca5a5', margin: '6px 0 8px' });
      hint.textContent = 'أحد الأذونات محظور ولا يمكن طلبه مرة ثانية من داخل التطبيق. افتح كروم ← ⋮ ← الإعدادات ← إعدادات المواقع ← stooorna.com ← غيّر المحظور إلى «سماح». وتأكد أن تطبيق Chrome نفسه مسموح له بالموقع والكاميرا والمايك من إعدادات الجوال ← التطبيقات.';
      card.appendChild(hint);
    }
    if (msg) {
      var m = css(document.createElement('div'), { fontSize: '0.78rem', color: '#4ade80', margin: '6px 0', fontWeight: '700' }); m.textContent = msg; card.appendChild(m);
    }

    var btns = css(document.createElement('div'), { display: 'flex', gap: '8px', marginTop: '8px' });
    var go = document.createElement('button'); go.type = 'button'; go.disabled = !!busy;
    go.textContent = busy ? '… جاري الطلب' : 'تفعيل الكل · Enable all';
    css(go, { flex: '1', border: 'none', borderRadius: '12px', padding: '12px 8px', background: '#22d3ee', color: '#032026', fontWeight: '900', fontSize: '0.95rem', cursor: 'pointer' });
    go.onclick = run;
    var later = document.createElement('button'); later.type = 'button'; later.textContent = 'لاحقاً';
    css(later, { border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '12px 14px', background: 'transparent', color: '#fff', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer' });
    later.onclick = function () { setSkip(); close(); };
    btns.appendChild(go); btns.appendChild(later); card.appendChild(btns);
    host.appendChild(card);
  }

  function run() {
    allStates().then(function (s) { render(s, true); }).then(function () {
      // each request needs the previous prompt to finish, so they run one after another from this tap
      return askNotifications().then(askLocation).then(askMedia).then(askStorage);
    }).then(allStates).then(function (s) {
      var ok = ITEMS.every(function (it) { return s[it.id] === 'granted' || s[it.id] === 'unsupported'; });
      render(s, false, ok ? 'تم تفعيل كل الأذونات ✅' : '');
      if (ok) window.setTimeout(close, 1800);
    });
  }

  function open(force) {
    if (!document.body) return;
    allStates().then(function (s) {
      var need = ITEMS.some(function (it) { return s[it.id] === 'prompt' || s[it.id] === 'denied'; });
      if (!need && !force) return;
      render(s, false);
    });
  }
  window.stooornaEnablePermissions = function () { open(true); };

  function start() {
    if (!standalone() || skipped()) return;
    window.setTimeout(function () { open(false); }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  // back from the browser's site settings: refresh the sheet
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && host) allStates().then(function (s) { render(s, false); });
  });
})();
