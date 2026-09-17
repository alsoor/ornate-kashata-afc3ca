/**
 * useAppRefresh
 * ─────────────────────────────────────────────────────────────────────────────
 * يستمع لحدثين:
 *   1. visibilitychange — عندما يعود المستخدم للتطبيق بعد تبديل التبويب
 *   2. focus            — عندما تستعيد النافذة التركيز
 *
 * عند أي منهما يعمل invalidateQueries على كل الـ queries النشطة
 * فيتم إعادة جلب الرسائل والإشعارات والحضور فوراً.
 *
 * ✅ لا يعمل page reload
 * ✅ لا يقطع WebSocket أو Agora
 * ✅ لا يمسح النصوص المكتوبة
 * ✅ يعمل فقط عند عودة المستخدم — لا يشغّل نفسه في الخلفية
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useAppRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let lastHidden = 0;

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        const gap = Date.now() - lastHidden;
        // فقط إذا كان المستخدم غائباً أكثر من ثانية واحدة
        if (gap > 1000) {
          queryClient.invalidateQueries();
        }
      } else {
        lastHidden = Date.now();
      }
    }

    function handleFocus() {
      const gap = Date.now() - lastHidden;
      if (gap > 1000) {
        queryClient.invalidateQueries();
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [queryClient]);
}
