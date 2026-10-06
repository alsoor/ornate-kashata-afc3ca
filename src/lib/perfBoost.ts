/**
 * perfBoost.ts — تسريع الواجهة بدون تعديل أي منطق موجود.
 *  1) دمج طلبات GET المتطابقة تحت /api/ إذا كان نفس الطلب قيد التنفيذ (عدة مكوّنات تسأل نفس الـ endpoint معاً).
 *  2) إذا كانت الصفحة مخفية (تبويب خلفي / التطبيق بالخلفية): المؤقّتات من 1.2 إلى 4 ثواني تعمل مرة كل 4 ثواني فقط.
 *     المؤقّتات البطيئة (4ث فأكثر) والسريعة (أقل من 1.2ث، مثل عدّادات التسجيل) لا تتأثر إطلاقاً.
 * يُفعَّل مرة واحدة فقط مهما استُورد من ملفات. لا يحذف ولا يغيّر أي شيء آخر.
 */
const HIDDEN_MIN_MS = 4000;

function installFetchDedupe(w: any) {
  const origFetch: typeof fetch = w.fetch.bind(w);
  const inflight = new Map<string, Promise<Response>>();
  w.fetch = function patchedFetch(input: any, init?: any) {
    try {
      const isStr = typeof input === 'string';
      const isUrl = typeof URL !== 'undefined' && input instanceof URL;
      if (!isStr && !isUrl) return origFetch(input, init); // Request objects: leave alone
      const method = String((init && init.method) || 'GET').toUpperCase();
      if (method !== 'GET' || (init && (init.signal || init.body))) return origFetch(input, init);
      const u = new URL(isStr ? input : input.href, w.location.href);
      if (u.origin !== w.location.origin || !u.pathname.startsWith('/api/')) return origFetch(input, init);
      let hdr = '';
      if (init && init.headers) { try { hdr = JSON.stringify(Array.from(new Headers(init.headers).entries())); } catch { return origFetch(input, init); } }
      const key = `${u.pathname}${u.search}|${(init && init.credentials) || ''}|${(init && init.cache) || ''}|${hdr}`;
      let p = inflight.get(key);
      if (!p) {
        p = origFetch(input, init);
        const clear = () => { if (inflight.get(key) === p) inflight.delete(key); };
        p.then(clear, clear);
        inflight.set(key, p);
      }
      return p.then((r) => r.clone());
    } catch {
      return origFetch(input, init);
    }
  };
}

function installHiddenThrottle(w: any) {
  const origSet: typeof setInterval = w.setInterval.bind(w);
  w.setInterval = function patchedSetInterval(handler: any, timeout?: any, ...args: any[]) {
    const t = Number(timeout) || 0;
    if (typeof handler !== 'function' || t < 1200 || t >= HIDDEN_MIN_MS) return origSet(handler, timeout, ...args);
    let last = 0;
    const wrapped = (...a: any[]) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        const now = Date.now();
        if (now - last < HIDDEN_MIN_MS - 250) return;
        last = now;
      }
      return handler(...a);
    };
    return origSet(wrapped, timeout, ...args);
  };
}

(function boot() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__stooornaPerfBoost) return;
  w.__stooornaPerfBoost = true;
  try { if (typeof w.fetch === 'function' && typeof Response !== 'undefined') installFetchDedupe(w); } catch { /* ignore */ }
  try { installHiddenThrottle(w); } catch { /* ignore */ }
})();

export {};
