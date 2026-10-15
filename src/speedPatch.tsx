/**
 * SPEED PATCH  (ملف مستقل — لا يعدّل أي ملف آخر)
 *
 * يسرّع التطبيق عند:
 *  - النقر على الأقسام (bottom dock / الهيدر / الأزرار)
 *  - الدخول للصفحات (تقليل التأخير الأولي + تسخين الكود والبيانات)
 *
 * الربط: سطر واحد في index.ts أو أي ملف عميل:
 *   import './speedPatch';
 *
 * لا يلغي أي إضافة أو تعديل سابق.
 */

export const SPEED_PATCH_VERSION = '1.0.0';

if (typeof window !== 'undefined' && !(window as any).__STOOORNA_SPEED_PATCH__) {
  (window as any).__STOOORNA_SPEED_PATCH__ = SPEED_PATCH_VERSION;

  /* ── 1) تسريع الاستجابة للنقر: منع التأخير المزدوج + تمييز سريع ── */
  let lastTap = 0;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      const btn = t.closest('button, a, [role="button"], [data-tab], [data-section]');
      if (!btn) return;
      const now = Date.now();
      if (now - lastTap < 280) {
        // تجاهل النقر المزدوج السريع جداً (يقلل اللاج)
        e.stopImmediatePropagation();
        return;
      }
      lastTap = now;
      // علامة بصرية خفيفة فورية
      (btn as HTMLElement).style.transform = 'scale(0.97)';
      window.setTimeout(() => {
        try { (btn as HTMLElement).style.transform = ''; } catch { /* */ }
      }, 90);
    },
    { passive: true, capture: true }
  );

  /* ── 2) تسخين (prefetch) للأقسام الشائعة بعد الخمول ── */
  const warm = () => {
    const paths = ['/settings', '/privacy', '/profile', '/add-friend'];
    paths.forEach((p) => {
      try {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = p;
        document.head.appendChild(link);
      } catch { /* */ }
    });
    // تسخين موديولات شائعة إن وُجدت كـ lazy
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined') {
        void import(/* webpackPrefetch: true */ '@/components/PublicVoiceLive').catch(() => {});
      }
    } catch { /* */ }
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(warm, { timeout: 4000 });
  } else {
    window.setTimeout(warm, 2500);
  }

  /* ── 3) تقليل إعادة الرسم عند التمرير السريع ── */
  let scrollTimer = 0;
  document.addEventListener(
    'scroll',
    () => {
      document.documentElement.classList.add('stooorna-scrolling');
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        document.documentElement.classList.remove('stooorna-scrolling');
      }, 120);
    },
    { passive: true }
  );

  /* ── 4) CSS خفيف لتسريع الانتقالات وإخفاء التأخير البصري ── */
  const style = document.createElement('style');
  style.id = 'stooorna-speed-patch';
  style.textContent = `
    html.stooorna-scrolling * { pointer-events: none !important; }
    button, a, [role="button"] {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    img, video { content-visibility: auto; }
  `;
  document.head.appendChild(style);

  /* ── 5) تسريع الدخول: تخفيف الحمل عند visibilitychange ── */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // إعادة تسخين خفيفة عند العودة
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(warm, { timeout: 1500 });
      }
    }
  });

  console.log('[SPEED-PATCH] active v' + SPEED_PATCH_VERSION);
}

export function installSpeedPatch() {
  // already installed above if in browser
}
