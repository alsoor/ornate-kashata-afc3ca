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
 *     (تحديث) نتتبّع سلسلة الآباء وقت التركيز (focusin) ولا نعتمد على activeElement
 *     وقت الإغلاق، لأنه يصير body بعد فقدان التركيز فكانت الحاويات تبقى مزاحة ويظهر الهيد مرتفعاً.
 *     ونرجّعها أيضاً عند إغلاق الشاشة (cleanup) حتى بعد إزالة الحقل من الـ DOM.
 *  3) لو الكيبورد يغطي الشاشة (الـ layout ما تصغّر)، نرجّع أبعاد الـ visual viewport
 *     حتى تُحجَّم الشاشة الثابتة على المساحة الظاهرة فوق الكيبورد.
 *     بدون كيبورد ترجع height = null فتبقى الشاشة inset:0 كما هي.
 */
export interface KeyboardSafeBox {
  top: number;
  height: number | null;
}

const KEYBOARD_MIN_PX = 120;
// الكيبورد يأخذ ~300ms ليختفي (وعلى بعض الأجهزة أكثر)، فنعيد التثبيت عدة مرات
const SETTLE_DELAYS = [60, 200, 450, 900];

function isHiddenOverflow(el: Element): boolean {
  try {
    const cs = getComputedStyle(el);
    return cs.overflowY === 'hidden' || cs.overflowY === 'clip';
  } catch {
    return false;
  }
}

/** يضيف العنصر وكل آبائه (حتى قبل documentElement) إلى المجموعة. */
function trackChain(start: Element | null, into: Set<HTMLElement>) {
  let el: Element | null = start;
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement) into.add(el);
    el = el.parentElement;
  }
}

/** يرجّع scrollTop للحاويات المخفية التي أزاحها المتصفح. */
function resetTracked(tracked: Set<HTMLElement>) {
  tracked.forEach(el => {
    if (!el.isConnected) {
      tracked.delete(el);
      return;
    }
    if (el.scrollTop && isHiddenOverflow(el)) el.scrollTop = 0;
  });
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
    // كل الحاويات (الآباء) التي قد يزيحها المتصفح عند فتح الكيبورد
    const tracked = new Set<HTMLElement>();

    trackChain(rootRef?.current ?? null, tracked);
    trackChain(document.activeElement, tracked);

    const pin = () => {
      if (window.scrollX !== savedX || window.scrollY !== savedY) window.scrollTo(savedX, savedY);
      if (document.body.scrollTop) document.body.scrollTop = 0;
      trackChain(document.activeElement, tracked);
      const root = rootRef?.current;
      if (root) {
        trackChain(root, tracked);
        if (root.scrollTop) root.scrollTop = 0;
      }
      resetTracked(tracked);
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

    // عند التركيز نسجّل سلسلة آباء الحقل قبل أن يزيحها المتصفح
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Element) trackChain(e.target, tracked);
      sync();
      SETTLE_DELAYS.slice(0, 2).forEach(ms => timers.push(window.setTimeout(sync, ms)));
    };

    // بعد إغلاق الكيبورد/فقدان التركيز نعيد التثبيت عدة مرات
    const onFocusOut = () => {
      SETTLE_DELAYS.forEach(ms => timers.push(window.setTimeout(sync, ms)));
    };

    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    sync();

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(t => window.clearTimeout(t));
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      // رجّع الصفحة لمكانها الأصلي بعد إغلاق الشاشة (وبعد ما يخلص الكيبورد)
      // + رجّع الحاويات المخفية التي أُزيحت (هذا سبب ارتفاع هيد صفحة القصة)
      const restore = () => {
        window.scrollTo(savedX, savedY);
        if (document.body.scrollTop) document.body.scrollTop = 0;
        resetTracked(tracked);
      };
      restore();
      SETTLE_DELAYS.forEach(ms => window.setTimeout(restore, ms));
    };
  }, [active, rootRef]);

  return box;
}
