/**
 * checkoutInAppPatch — صفحة الدفع (Polar / Stripe) تفتح فوق التطبيق داخل المتصفح الداخلي (Chrome Custom Tab)
 * بزر X يرجّعك لنفس البث. موقع الدفع الأصلي نفسه، بدون iframe، وبدون ما يطلع المستخدم من التطبيق.
 *
 * ليش هذا الملف:
 *  - الـ APK (Capacitor) يحمّل الموقع من stooorna.com ويحقن في الصفحة جسر native-bridge فقط:
 *    Capacitor.nativePromise(...). أما Capacitor.Plugins.Browser و registerPlugin فغير موجودين في صفحة الويب،
 *    فأي كود يعتمد عليهم يفشل بصمت ثم يفتح رابط الدفع مكان التطبيق نفسه (بدون X).
 *  - هذا الباتش يعترض أي محاولة لفتح رابط دفع (window.open / رابط <a> / تغيير عنوان الصفحة) داخل التطبيق
 *    ويحوّلها لإضافة Browser الأصلية عبر الجسر. يشتغل مهما كان الكود اللي طلب فتح الرابط.
 *  - لو فشل الفتح يظهر شريط صغير بسبب الفشل (يسهّل التشخيص) بدل ما يطيح المستخدم خارج التطبيق.
 *
 * التركيب: import '@/lib/checkoutInAppPatch';  (سطر واحد في RootLayout.tsx). لا يغيّر شي في المتصفح العادي/الموقع.
 */

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  nativeCallback?: (plugin: string, method: string, options: unknown, cb: (data: unknown) => void) => unknown;
};

const CHECKOUT_HOST = /(^|\.)(polar\.sh|stripe\.com|stripe\.network)$/i;

function bridge(): CapacitorBridge | null {
  try {
    const c = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
    return c && c.isNativePlatform?.() && typeof c.nativePromise === 'function' ? c : null;
  } catch {
    return null;
  }
}

export function isCheckoutUrl(u: unknown): boolean {
  try {
    if (!u) return false;
    const url = new URL(String(u), window.location.href);
    return /^https?:$/.test(url.protocol) && CHECKOUT_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

function toast(msg: string) {
  try {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:calc(24px + env(safe-area-inset-bottom,0px))',
      'z-index:2147483000', 'background:#7f1d1d', 'color:#fff', 'padding:12px 14px', 'border-radius:12px',
      'font:600 13px/1.4 system-ui,sans-serif', 'text-align:center', 'direction:ltr', 'box-shadow:0 6px 24px rgba(0,0,0,.5)',
    ].join(';');
    document.body.appendChild(el);
    window.setTimeout(() => { try { el.remove(); } catch { /* ignore */ } }, 5000);
  } catch { /* ignore */ }
}

let lastOpenAt = 0;
let finishListenerOn = false;

/** يفتح رابط الدفع الأصلي فوق التطبيق (Chrome Custom Tab بزر X). يرجع true لو انفتح. */
export async function openCheckoutInApp(url: string): Promise<boolean> {
  const c = bridge();
  if (!c || !c.nativePromise) return false;
  const now = Date.now();
  if (now - lastOpenAt < 1500) return true; // نفس اللمسة سجّلت مرتين → افتح مرة وحدة
  lastOpenAt = now;
  try {
    if (!finishListenerOn && typeof c.nativeCallback === 'function') {
      finishListenerOn = true;
      try {
        c.nativeCallback('Browser', 'addListener', { eventName: 'browserFinished' }, () => {
          try { window.dispatchEvent(new CustomEvent('stooorna:checkout-closed')); } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    }
    await c.nativePromise('Browser', 'open', { url, toolbarColor: '#0b0b0f' });
    return true;
  } catch (e) {
    lastOpenAt = 0;
    const why = String((e as { message?: string } | null)?.message || e || 'unknown').slice(0, 120);
    console.warn('[checkout-patch] Browser.open failed', e);
    toast(`Checkout could not open: ${why}`);
    return false;
  }
}

function fakeWindow(): Window {
  const loc = { href: '', assign() {}, replace() {}, reload() {} };
  return { closed: false, opener: null, location: loc, close() {}, focus() {}, blur() {}, postMessage() {} } as unknown as Window;
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window as unknown as { __stooornaCheckoutPatch?: boolean };
  if (w.__stooornaCheckoutPatch) return;
  w.__stooornaCheckoutPatch = true;

  // 1) window.open(url)
  try {
    const origOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      if (url && isCheckoutUrl(url) && bridge()) {
        void openCheckoutInApp(String(url));
        return fakeWindow();
      }
      return origOpen(url as string, target, features);
    }) as typeof window.open;
  } catch { /* ignore */ }

  // 2) رابط <a href> (ضغطة أو a.click() برمجي) → قبل ما يتنقّل الـ WebView
  try {
    document.addEventListener('click', (ev) => {
      if (!bridge()) return;
      const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !isCheckoutUrl(a.href)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      void openCheckoutInApp(a.href);
    }, true);
  } catch { /* ignore */ }

  // 3) تغيير عنوان الصفحة نفسه (location.href = ...) — Navigation API (WebView الحديث)
  try {
    const nav = (window as unknown as { navigation?: { addEventListener: (t: string, cb: (e: any) => void) => void } }).navigation;
    nav?.addEventListener('navigate', (e: any) => {
      if (!bridge()) return;
      const dest = e?.destination?.url;
      if (!dest || !isCheckoutUrl(dest) || e.cancelable === false) return;
      e.preventDefault();
      void openCheckoutInApp(String(dest));
    });
  } catch { /* ignore */ }
}

install();
