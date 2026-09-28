import { useEffect, useState, type RefObject } from 'react';

/**
 * يمنع "ارتفاع" الصفحة عند فتح الكيبورد داخل شاشة fixed (مثل تعليقات القصة).
 *
 * المشكلة: لما يفتح الكيبورد والحقل داخل عنصر position:fixed، المتصفح يرفع الـ window
 * (أو الـ visual viewport) ليكشف الحقل، وبعد إغلاق الكيبورد/الشاشة تبقى الصفحة مرفوعة
 * فيظهر الهيد مقصوصاً من فوق.
 *
 * الحل:
 *  1) نثبّت موضع الـ window على القيمة اللي كان عليها وقت فتح الشاشة، ونرجّعه عند الإغلاق.
 *  2) نرجّع scrollTop للحاويات المخفية (overflow:hidden) اللي المتصفح يزيحها عند التركيز.
 *  3) لو الكيبورد يغطي الشاشة (الـ layout ما تصغّر)، نرجّع أبعاد الـ visual viewport
 *     حتى تُحجَّم الشاشة الثابتة على المساحة الظاهرة فوق الكيبورد.
 *     بدون كيبورد ترجع height = null فتبقى الشاشة inset:0 كما هي.
 */
export interface KeyboardSafeBox {
  top: number;
  height: number | null;
}

const KEYBOARD_MIN_PX = 120;

function resetHiddenOverflowScroll(start: Element | null) {
  let el: Element | null = start;
  while (el && el !== document.documentElement) {
    try {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'hidden' || oy === 'clip') && (el as HTMLElement).scrollTop) {
        (el as HTMLElement).scrollTop = 0;
      }
    } catch { /* ignore */ }
    el = el.parentElement;
  }
}

export function useKeyboardSafeViewport(
  active: boolean,
  rootRef?: RefObject<HTMLElement | null>,
): KeyboardSafeBox {
  const [box, setBox] = useState<KeyboardSafeBox>({ top: 0, height: null });

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const savedX = window.scrollX;
    const savedY = window.scrollY;
    const vv = window.visualViewport ?? null;
    let raf = 0;
    const timers: number[] = [];

    const pin = () => {
      if (window.scrollX !== savedX || window.scrollY !== savedY) window.scrollTo(savedX, savedY);
      if (document.body.scrollTop) document.body.scrollTop = 0;
      resetHiddenOverflowScroll(document.activeElement);
      const root = rootRef?.current;
      if (root) {
        if (root.scrollTop) root.scrollTop = 0;
        resetHiddenOverflowScroll(root);
      }
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        pin();
        if (!vv) return;
        const keyboardCovers = window.innerHeight - vv.height - vv.offsetTop > KEYBOARD_MIN_PX
          || (window.innerHeight - vv.height > KEYBOARD_MIN_PX && vv.offsetTop > 0);
        const next: KeyboardSafeBox = keyboardCovers
          ? { top: Math.max(0, Math.round(vv.offsetTop)), height: Math.round(vv.height) }
          : { top: 0, height: null };
        setBox(prev => (prev.top === next.top && prev.height === next.height ? prev : next));
      });
    };

    // بعد إغلاق الكيبورد/فقدان التركيز: الكيبورد يأخذ ~300ms ليختفي، فنعيد التثبيت عدة مرات
    const onFocusOut = () => {
      [60, 200, 450].forEach(ms => timers.push(window.setTimeout(sync, ms)));
    };

    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    document.addEventListener('focusout', onFocusOut);
    sync();

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(t => window.clearTimeout(t));
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      document.removeEventListener('focusout', onFocusOut);
      // رجّع الصفحة لمكانها الأصلي بعد إغلاق الشاشة (وبعد ما يخلص الكيبورد)
      const restore = () => window.scrollTo(savedX, savedY);
      restore();
      [60, 200, 450].forEach(ms => window.setTimeout(restore, ms));
    };
  }, [active, rootRef]);

  return box;
}
