/**
 * liveTemplatesStore.ts  →  ضعه في:  src/lib/liveTemplatesStore.ts
 *
 * مخزن مستقل لمنشورات Templates (الصور/الفيديو التي تظهر خارج الشات) وتعليقاتها وإعجاباتها.
 * منفصل تماماً عن الشات العام (/api/live-chat):
 *   • تنظيف الـ24 ساعة يخص الشات فقط ولا يلمس هذا المخزن أبداً.
 *   • الحذف الوحيد: صاحب المنشور يضغط زر الحذف (DELETE /api/templates/:id).
 *
 * الشكل: كل صف (منشور أو تعليق) بنفس شكل صف الشات (TemplateRow ≈ PublicLiveComment)
 *   - منشور : text = caption + TPL marker ، imageUrl = رابط الصورة/الفيديو
 *   - تعليق : text = "↩<postId>\u200b<body>" (نفس صيغة تعليقات المنشورات الحالية)
 *
 * السيرفر (راجع templates-server.ts):
 *   GET    /api/templates            → { items: TemplateRow[] }
 *   POST   /api/templates            → upsert لصف (منشور/تعليق) — صاحبه فقط
 *   POST   /api/templates/like       → { id, liked }  (السيرفر يضيف/يشيل userId من likes)
 *   DELETE /api/templates/:id        → حذف المنشور + تعليقاته (صاحبه فقط)
 */

export interface TemplateRow {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  text: string;
  imageUrl?: string | null;
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  likes: string[];
  createdAt: number;
  editCount?: number;
  replyToId?: string | null;
  replyToName?: string | null;
  replyToText?: string | null;
}

export const TEMPLATES_ENDPOINT = '/api/templates';
/** كاش محلي — لا يُمسح أبداً تلقائياً (فقط عند حذف المنشور) */
export const TEMPLATES_CACHE_KEY = 'stooorna_templates_v1';
const PENDING_KEY = 'stooorna_templates_pending_v1';   // صفوف أنشأتها ولم يؤكد السيرفر استلامها بعد
const DELETED_KEY = 'stooorna_templates_deleted_v1';   // ما حذفته: يمنع رجوعه من أي نسخة قديمة
const MIGRATED_KEY = 'stooorna_templates_migrated_v1'; // مرة واحدة: رفع منشوراتي المحفوظة محلياً ولم تصل السيرفر (قبل تفعيل مسارات السيرفر)
const CMT_RE = /^↩([^\u200b\s]+)\u200b/;

const hasLS = () => { try { return typeof localStorage !== 'undefined'; } catch { return false; } };

function readJson<T>(key: string, fallback: T): T {
  if (!hasLS()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  if (!hasLS()) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

function cleanRow(x: any): TemplateRow | null {
  if (!x || !x.id) return null;
  if (!(x.text || x.imageUrl || x.voiceUrl)) return null;
  return {
    id: String(x.id),
    userId: String(x.userId || ''),
    name: x.name ?? null,
    username: x.username ?? null,
    avatarUrl: x.avatarUrl ?? null,
    text: String(x.text || ''),
    imageUrl: x.imageUrl ?? x.mediaUrl ?? x.videoUrl ?? null,
    voiceUrl: x.voiceUrl ?? null,
    voiceDuration: x.voiceDuration ?? null,
    likes: Array.isArray(x.likes) ? x.likes.map(String) : [],
    createdAt: Number(x.createdAt) || Date.now(),
    editCount: Math.max(0, Number(x.editCount) || 0),
    replyToId: x.replyToId ? String(x.replyToId) : null,
    replyToName: x.replyToName ? String(x.replyToName) : null,
    replyToText: x.replyToText ? String(x.replyToText).slice(0, 120) : null,
  };
}

const sortRows = (list: TemplateRow[]) => list.slice().sort((a, b) => a.createdAt - b.createdAt);

export function loadTemplatesCache(): TemplateRow[] {
  const raw = readJson<any[]>(TEMPLATES_CACHE_KEY, []);
  if (!Array.isArray(raw)) return [];
  const deleted = new Set(readJson<string[]>(DELETED_KEY, []));
  return sortRows(raw.map(cleanRow).filter((r): r is TemplateRow => !!r && !deleted.has(r.id)));
}
export function saveTemplatesCache(list: TemplateRow[]) {
  writeJson(TEMPLATES_CACHE_KEY, list);
}

/* ───────────── pending / deleted bookkeeping ───────────── */
export function markTemplatePending(id: string) {
  const cur = readJson<string[]>(PENDING_KEY, []);
  if (!cur.includes(id)) writeJson(PENDING_KEY, [...cur, id].slice(-500));
}
function clearTemplatePending(id: string) {
  const cur = readJson<string[]>(PENDING_KEY, []);
  if (cur.includes(id)) writeJson(PENDING_KEY, cur.filter(x => x !== id));
}
export function markTemplateDeleted(id: string) {
  const cur = readJson<string[]>(DELETED_KEY, []);
  if (!cur.includes(id)) writeJson(DELETED_KEY, [...cur, id].slice(-1000));
  clearTemplatePending(id);
}
export function isTemplateDeleted(id: string): boolean {
  return readJson<string[]>(DELETED_KEY, []).includes(id);
}

/* ───────────── network ───────────── */
export async function fetchTemplatesFromServer(): Promise<TemplateRow[] | null> {
  try {
    const r = await fetch(TEMPLATES_ENDPOINT, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    const arr = Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : null);
    if (!arr) return null;
    return sortRows(arr.map(cleanRow).filter((x: TemplateRow | null): x is TemplateRow => !!x));
  } catch { return null; }
}

/** upsert لمنشور أو تعليق. يرجع true عند نجاح السيرفر (ويشيل علامة pending). */
export async function postTemplateRow(row: TemplateRow): Promise<boolean> {
  try {
    const r = await fetch(TEMPLATES_ENDPOINT, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    });
    if (r.ok) { clearTemplatePending(row.id); return true; }
    // 4xx (غير مصرّح/بيانات خاطئة): لا فائدة من إعادة المحاولة للأبد
    if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) clearTemplatePending(row.id);
    return false;
  } catch { return false; }
}

export async function likeTemplateRow(id: string, liked: boolean): Promise<void> {
  try {
    await fetch(`${TEMPLATES_ENDPOINT}/like`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, liked }),
    });
  } catch { /* the next sync will correct the count */ }
}

export async function deleteTemplateRow(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${TEMPLATES_ENDPOINT}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    return r.ok;
  } catch { return false; }
}

export function mergeTemplateRows(a: TemplateRow[], b: TemplateRow[]): TemplateRow[] {
  const map = new Map<string, TemplateRow>();
  for (const r of [...a, ...b]) {
    const prev = map.get(r.id);
    map.set(r.id, prev ? { ...prev, ...r, likes: Array.from(new Set([...(prev.likes || []), ...(r.likes || [])])) } : r);
  }
  return sortRows([...map.values()]);
}

/**
 * مزامنة كاملة (تُستدعى كل بضع ثوانٍ):
 *  1) نجلب القائمة من السيرفر — هي المرجع (إذا حُذف منشور عند صاحبه يختفي عند الجميع).
 *  2) نضيف فوقها صفوفي التي لم يستلمها السيرفر بعد (pending) ونعيد إرسالها.
 *  3) نستبعد ما حذفته أنا. 4) نحفظ الكاش ونرجّع القائمة.
 *  فشل الجلب = نبقي الكاش كما هو (لا نمسح شيئاً بسبب انقطاع الشبكة).
 */
export async function syncTemplates(myId: string): Promise<TemplateRow[]> {
  const cache = loadTemplatesCache();
  const server = await fetchTemplatesFromServer();
  if (!server) return cache;
  const deleted = new Set(readJson<string[]>(DELETED_KEY, []));
  const serverIds = new Set(server.map(r => r.id));
  // One-time recovery: my own posts that only exist on this device (the server routes were not active before) are sent once.
  if (!readJson<boolean>(MIGRATED_KEY, false)) {
    for (const r of cache) {
      if (r.userId === myId && !serverIds.has(r.id) && !deleted.has(r.id)) markTemplatePending(r.id);
    }
    writeJson(MIGRATED_KEY, true);
  }
  const pending = new Set(readJson<string[]>(PENDING_KEY, []));

  const mine: TemplateRow[] = [];
  for (const r of cache) {
    if (serverIds.has(r.id) || deleted.has(r.id)) continue;
    if (r.userId === myId && pending.has(r.id)) mine.push(r);
  }
  // أعد إرسال ما لم يصل
  for (const r of mine) void postTemplateRow(r);
  // علّقات مرتبطة بمنشور محذوف عند السيرفر تسقط معه
  const list = mergeTemplateRows(server.filter(r => !deleted.has(r.id)), mine);
  const postIds = new Set(list.filter(r => !CMT_RE.test(r.text)).map(r => r.id));
  const final = list.filter(r => { const m = CMT_RE.exec(r.text); return !m || postIds.has(m[1]); });
  saveTemplatesCache(final);
  return final;
}
