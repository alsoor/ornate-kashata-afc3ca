/**
 * أدوات بحث اليوزرات في صندوق طلبات الإضافة.
 * حرف واحد (A–Z) → تظهر كل اليوزرات التي يبدأ اسم المستخدم فيها بهذا الحرف، مرتبة أبجدياً.
 * أكثر من حرف → السلوك الأصلي (نتائج السيرفر كما هي).
 */

/** يشيل @ من البداية والمسافات — الحرف الفعلي المكتوب للبحث */
export function normalizeUserQuery(raw: string): string {
  return String(raw || '').trim().replace(/^@+/, '');
}

/** هل المستخدم كتب حرفاً واحداً فقط؟ */
export function isSingleLetterQuery(raw: string): boolean {
  return normalizeUserQuery(raw).length === 1;
}

/** لو الاستعلام حرف واحد: أبقِ فقط من يبدأ username بهذا الحرف ورتّبهم. غير ذلك: أعد القائمة كما هي. */
export function filterUsersForQuery<T extends { username: string | null }>(raw: string, users: T[]): T[] {
  if (!isSingleLetterQuery(raw)) return users;
  const letter = normalizeUserQuery(raw).toLowerCase();
  return users
    .filter(u => String(u.username || '').replace(/^@+/, '').toLowerCase().startsWith(letter))
    .sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' }));
}
