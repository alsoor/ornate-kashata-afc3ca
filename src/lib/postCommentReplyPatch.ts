export type CommentLike = {
  id: number;
  parentCommentId?: number | null;
  parent_id?: number | null;
  parentId?: number | null;
  text?: string;
  body?: string;
  createdAt?: string;
};

export function normalizeComment<T extends CommentLike>(c: T): T {
  const parent = c.parentCommentId ?? c.parent_id ?? c.parentId ?? null;
  const text = (c.text || c.body || '') as string;
  return { ...c, parentCommentId: parent, text };
}

export function sortCommentsTree<T extends { id: number; parentCommentId?: number | null; createdAt?: string }>(list: T[]): T[] {
  const roots = list.filter(c => !c.parentCommentId).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const kids = list.filter(c => !!c.parentCommentId);
  const out: T[] = [];
  const used = new Set<number>();
  for (const r of roots) {
    out.push(r);
    used.add(r.id);
    kids.filter(k => Number(k.parentCommentId) === Number(r.id)).forEach(k => {
      out.push(k);
      used.add(k.id);
    });
  }
  list.forEach(c => { if (!used.has(c.id)) out.push(c); });
  return out;
}

export function authorCountryLabel(userId?: string | null): string {
  if (!userId) return '';
  try {
    const raw = localStorage.getItem(`stooorna_profile_country_${userId}`) || '';
    if (!raw) return '';
    const o = JSON.parse(raw);
    return String(o?.name || '');
  } catch {
    return '';
  }
}
