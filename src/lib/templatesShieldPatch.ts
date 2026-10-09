/**
 * TEMPLATES SHIELD PATCH (standalone)
 *
 * Active ONLY while the Templates gallery or the Templates photo/video viewer is open.
 * It listens to the events add-friend.tsx already fires:
 *   - 'stooorna:templates-gallery-visible'  { open }
 *   - 'stooorna:tpl-media-viewer'           { open }
 *
 * What it does while active:
 *   1. Screenshot attempt (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5, Ctrl/Cmd+P, Ctrl/Cmd+S)
 *      -> media is hidden for 2 seconds and a centered popup shows:
 *         "You Cannot Take A Screen Shot Of The image 😊"  (disappears after 2 seconds)
 *   2. Long-press / right-click "Save image" menu is blocked (browser and installed app),
 *      image dragging is blocked, text/callout selection on media is disabled,
 *      video download / picture-in-picture buttons are removed.
 *   3. Media is hidden while the page/app is in the background (app switcher, snipping tools stealing focus).
 *   4. Optional native block (installed Android/iOS app): if the Capacitor plugin
 *      @capacitor-community/privacy-screen is installed, it is enabled only while Templates is open.
 *      (If you do NOT install it, this step is simply skipped.)
 *   5. Native code can also trigger the popup by dispatching:  window.dispatchEvent(new Event('stooorna:screenshot-attempt'))
 *
 * Usage: add ONE line to add-friend.tsx (top, with the other imports):
 *   import '@/lib/templatesShieldPatch';
 *
 * Honest limit: a normal browser can never fully block a phone's hardware screenshot or an external camera.
 * This patch blocks everything the web page itself is able to block.
 */

const TOAST_TEXT = 'You Cannot Take A Screen Shot Of The image 😊';
const TOAST_MS = 2000;
const NATIVE_BLOCK = false; // old optional privacy-screen plugin (always-secure, hides our popup) - replaced by ScreenShield below

type W = Window & { __stooornaTplShield?: boolean };

(function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window as W;
  if (w.__stooornaTplShield) return;
  w.__stooornaTplShield = true;

  let galleryOpen = false;
  let viewerOpen = false;
  let active = false;
  let hideTimer: number | null = null;
  let toastTimer: number | null = null;
  let toastEl: HTMLElement | null = null;
  let observer: MutationObserver | null = null;
  let raf = 0;

  // ── styles ──
  const style = document.createElement('style');
  style.setAttribute('data-tpl-shield', '1');
  style.textContent = `
html.tpl-shield-on img, html.tpl-shield-on video, html.tpl-shield-on canvas {
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  -webkit-tap-highlight-color: transparent;
}
html.tpl-shield-hide img, html.tpl-shield-hide video, html.tpl-shield-hide canvas,
html.tpl-shield-away img, html.tpl-shield-away video, html.tpl-shield-away canvas {
  visibility: hidden !important;
}
@keyframes tplShieldPop { from { opacity: 0; transform: translate(-50%, -50%) scale(.92); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
`;
  (document.head || document.documentElement).appendChild(style);

  const root = document.documentElement;

  // ── toast: centered popup, icon on top, English text underneath, gone after 2s ──
  function showToast() {
    try {
      if (toastEl) toastEl.remove();
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.style.cssText = [
        'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
        'z-index:2147483600', 'width:min(78vw,320px)', 'box-sizing:border-box',
        'padding:22px 18px', 'border-radius:20px', 'text-align:center',
        'background:rgba(10,18,20,0.97)', 'border:1px solid rgba(126,232,245,0.45)',
        'box-shadow:0 18px 60px rgba(0,0,0,0.65)', 'color:#fff',
        'font:800 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'pointer-events:none', 'animation:tplShieldPop .18s ease-out',
      ].join(';');
      const icon = document.createElement('div');
      icon.style.cssText = 'width:54px;height:54px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,0.16);border:1px solid rgba(239,68,68,0.55)';
      icon.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c5 0 9 4 10 6-.5 1-1.6 2.6-3.2 3.9"/><path d="M6.7 6.8C4.6 8.1 3.1 10.1 2 12c1 2 5 6 10 6 1.5 0 2.9-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
      const txt = document.createElement('div');
      txt.textContent = TOAST_TEXT;
      el.appendChild(icon);
      el.appendChild(txt);
      document.body.appendChild(el);
      toastEl = el;
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { try { el.remove(); } catch { /* */ } if (toastEl === el) toastEl = null; }, TOAST_MS);
    } catch { /* */ }
  }

  function attempt() {
    if (!active) return;
    root.classList.add('tpl-shield-hide');
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => root.classList.remove('tpl-shield-hide'), TOAST_MS);
    try { navigator.clipboard?.writeText(' ').catch(() => { /* */ }); } catch { /* */ }
    showToast();
  }

  // ── harden media elements (no download button, no PiP, not draggable) ──
  function harden() {
    raf = 0;
    if (!active) return;
    document.querySelectorAll('img').forEach(el => { if ((el as HTMLImageElement).draggable !== false) (el as HTMLImageElement).draggable = false; });
    document.querySelectorAll('video').forEach(el => {
      const v = el as HTMLVideoElement;
      try { v.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback'); } catch { /* */ }
      try { v.disablePictureInPicture = true; } catch { /* */ }
      try { v.setAttribute('disableRemotePlayback', ''); } catch { /* */ }
      if (v.draggable !== false) v.draggable = false;
    });
  }
  function scheduleHarden() { if (!raf) raf = window.requestAnimationFrame(harden); }

  function nativeBlock(on: boolean) {
    if (!NATIVE_BLOCK) return;
    try {
      const P = (window as any).Capacitor?.Plugins?.PrivacyScreen;
      if (!P) return;
      if (on) void P.enable?.(); else void P.disable?.();
    } catch { /* */ }
  }

  // Native bridge (installed Android app): ScreenShieldPlugin.java. Tells native code when Templates is open so it can
  // detect/block hardware screenshots (Power + Volume Down, 3-finger swipe, ...) and fire 'stooorna:screenshot-attempt'.
  function nativeShield(on: boolean) {
    try {
      const C = (window as any).Capacitor;
      if (!C) return;
      const direct = C.Plugins?.ScreenShield;
      if (direct?.setActive) { void direct.setActive({ active: on }); return; }
      if (typeof C.nativePromise === 'function') void C.nativePromise('ScreenShield', 'setActive', { active: on }).catch(() => { /* */ });
    } catch { /* */ }
  }

  function recompute() {
    const next = galleryOpen || viewerOpen;
    if (next === active) return;
    active = next;
    if (active) {
      root.classList.add('tpl-shield-on');
      harden();
      try {
        observer = new MutationObserver(scheduleHarden);
        observer.observe(document.body, { childList: true, subtree: true });
      } catch { /* */ }
      nativeBlock(true);
      nativeShield(true);
    } else {
      root.classList.remove('tpl-shield-on', 'tpl-shield-hide', 'tpl-shield-away');
      if (observer) { observer.disconnect(); observer = null; }
      if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
      if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null; }
      if (toastEl) { try { toastEl.remove(); } catch { /* */ } toastEl = null; }
      nativeBlock(false);
      nativeShield(false);
    }
  }

  // ── state from the events add-friend.tsx already fires ──
  window.addEventListener('stooorna:templates-gallery-visible', (e: Event) => { galleryOpen = !!(e as CustomEvent).detail?.open; recompute(); });
  window.addEventListener('stooorna:tpl-media-viewer', (e: Event) => { viewerOpen = !!(e as CustomEvent).detail?.open; recompute(); });
  // native code (or anything else) can report a capture
  window.addEventListener('stooorna:screenshot-attempt', () => attempt());

  // ── block the long-press / right-click "Save image" menu and dragging ──
  const isEditable = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    return !!(el && el.closest && el.closest('input,textarea,[contenteditable="true"]'));
  };
  document.addEventListener('contextmenu', (e) => {
    if (!active || isEditable(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener('dragstart', (e) => {
    if (!active) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(IMG|VIDEO|CANVAS|PICTURE)$/.test(t.tagName)) e.preventDefault();
  }, true);

  // ── keyboard screenshot / save / print shortcuts ──
  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    const code = e.code || '';
    const key = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const printScreen = key === 'printscreen' || code === 'PrintScreen';
    const macShot = e.metaKey && e.shiftKey && (code === 'Digit3' || code === 'Digit4' || code === 'Digit5' || code === 'KeyS');
    const winSnip = e.metaKey && e.shiftKey && code === 'KeyS';
    const saveOrPrint = mod && (key === 's' || key === 'p');
    if (printScreen || macShot || winSnip || saveOrPrint) {
      if (e.type === 'keydown' || printScreen) { e.preventDefault(); attempt(); }
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  // ── hide media while the page / app is in the background or loses focus ──
  const away = (on: boolean) => { if (active) root.classList.toggle('tpl-shield-away', on); else root.classList.remove('tpl-shield-away'); };
  document.addEventListener('visibilitychange', () => away(document.visibilityState !== 'visible'));
  window.addEventListener('blur', () => away(true));
  window.addEventListener('focus', () => away(false));
  window.addEventListener('pagehide', () => away(true));
  window.addEventListener('pageshow', () => away(false));
})();

export {};
