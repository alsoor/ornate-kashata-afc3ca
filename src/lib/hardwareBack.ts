// HARDWARE-BACK-PATCH
// زر الرجوع حق الموبايل (Android back) داخل التطبيق.
// - الصفحات (/live /live-camera /settings /chat ...): الرجوع يتم عبر history (react-router) — يشتغل لما تفعّل
//   خيار "Hardware back button integration" في أداة تحويل الموقع لتطبيق (الـ wrapper).
// - النوافذ المنبثقة (Modal / Sheet / لوحة الهدايا / الشات): تُغلق بزر الرجوع بدل ما تطلع من الصفحة كلها.
import { useEffect, useRef } from 'react';

type Entry = { id: number; close: () => void };
const stack: Entry[] = [];
let uid = 0;
let ignorePops = 0;
let consumedAt = 0;

function onPop() {
  if (ignorePops > 0) { ignorePops--; consumedAt = Date.now(); return; }
  const top = stack.pop();
  if (top) { consumedAt = Date.now(); top.close(); }
}

// يُربط مرة وحدة عند تحميل الملف (قبل أي listener ثاني في الصفحات)
if (typeof window !== 'undefined') {
  const g = window as unknown as { __stHwBackBound?: boolean };
  if (!g.__stHwBackBound) { g.__stHwBackBound = true; window.addEventListener('popstate', onPop); }
}

/** true إذا هذا الرجوع الأخير أُغلقت به نافذة (فلا تخرج الصفحة) */
export function backWasConsumed(): boolean {
  return Date.now() - consumedAt < 400;
}

/**
 * نافذة مفتوحة => زر الرجوع يقفلها.
 * استعمالها: useBackClose(showPanel, () => setShowPanel(false));
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const entry: Entry = { id: ++uid, close: () => closeRef.current() };
    stack.push(entry);
    try { window.history.pushState({ ...(window.history.state || {}), __stBack: entry.id }, ''); } catch { /* ignore */ }
    return () => {
      const i = stack.indexOf(entry);
      if (i < 0) return; // انقفلت بزر الرجوع نفسه
      stack.splice(i, 1); // انقفلت بزر X أو بالكود: نشيل المدخل الوهمي من التاريخ
      let top = false;
      try { top = (window.history.state || {}).__stBack === entry.id; } catch { /* ignore */ }
      if (top) { ignorePops++; try { window.history.back(); } catch { ignorePops--; } }
    };
  }, [open]);
}

/**
 * صفحات البث: زر الرجوع يطلّعك من البث بشكل نظيف (leave) بدل ما يخرب الاتصال.
 * leave يجب أن يكون leaveRoom({ skipNavigate: true }) لأن الرجوع تم أصلاً.
 */
export function useBackLeave(leave: () => void, alreadyLeft: () => boolean) {
  const ref = useRef(leave);
  ref.current = leave;
  const doneRef = useRef(alreadyLeft);
  doneRef.current = alreadyLeft;
  useEffect(() => {
    const h = () => {
      if (backWasConsumed()) return; // الرجوع قفل نافذة داخل البث فقط
      if (!doneRef.current()) ref.current();
    };
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);
}
