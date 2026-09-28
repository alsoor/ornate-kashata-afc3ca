import { useCallback, useEffect, useState } from 'react';

/**
 * تتبّع طلبات الإضافة "المشاهدة" لأيقونة الطلبات في الشريط العلوي.
 * - hasUnseen = true  → الأيقونة والنقطة برتقاليتان (وصل طلب جديد لم يُفتح بعد).
 * - markSeen()        → تُستدعى عند فتح صندوق الطلبات؛ ترجع الأيقونة لونها والنقطة رمادية.
 * المعرّفات المشاهدة تُحفظ في localStorage لكل مستخدم، فلا ترجع البرتقالية بعد تحديث الصفحة،
 * وأي طلب جديد (معرّف جديد) يعيدها برتقالية.
 */

const MAX_STORED = 500;

function storageKey(userId: string | number | null | undefined): string {
  return `stooorna_friend_req_seen_${userId ?? 'anon'}`;
}

function loadSeen(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids).slice(-MAX_STORED)));
  } catch { /* storage optional */ }
}

export function useFriendRequestSeen(
  userId: string | number | null | undefined,
  incoming: Array<{ id: number | string }>,
  /** true = الصندوق مفتوح على تبويب الطلبات → أي طلب يصل الآن يُعتبر مشاهداً مباشرة */
  autoMark = false,
) {
  const key = storageKey(userId);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen(key));

  // لو تغيّر المستخدم (أو انتهى تحميل الجلسة) نقرأ قائمته هو
  useEffect(() => { setSeen(loadSeen(key)); }, [key]);

  const markSeen = useCallback(() => {
    setSeen(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const r of incoming) {
        const id = String(r.id);
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      if (!changed) return prev;
      saveSeen(key, next);
      return next;
    });
  }, [incoming, key]);

  const hasUnseen = incoming.some(r => !seen.has(String(r.id)));

  useEffect(() => {
    if (autoMark) markSeen();
  }, [autoMark, markSeen]);

  return { hasUnseen, markSeen };
}
