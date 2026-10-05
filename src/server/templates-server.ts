/**
 * templates-server.ts — مرجع جانب السيرفر لـ /api/templates
 *
 * مكتوب بـ Web Request/Response القياسي، فيشتغل كما هو (أو بتعديل بسيط) على:
 * Hono / Cloudflare Workers / Bun / Deno / Next.js route handlers / React Router (loader/action).
 * مع Express: حوّل req/res إلى Request/Response أو انقل المنطق كما هو.
 *
 * ⚠️ هذا الملف لم يُجرَّب على سيرفرك (لا أعرف الـ stack ولا قاعدة البيانات عندك).
 *    اربطه بقاعدة بياناتك عبر واجهة TemplatesDb بالأسفل، والمنطق جاهز.
 *
 * القواعد:
 *  - لا يوجد أي مسح تلقائي للمنشورات. تُحذف فقط بطلب DELETE من صاحبها.
 *  - هوية المستخدم تؤخذ من الجلسة (getUserId) وليس مما يرسله العميل.
 *  - حذف منشور = حذف تعليقاته أيضاً (ويمكنك حذف ملف الصورة/الفيديو عبر onDeleteFile).
 *
 * ── مخطط SQL مقترح ─────────────────────────────────────────────
 *  CREATE TABLE templates_posts (
 *    id         TEXT PRIMARY KEY,
 *    user_id    TEXT NOT NULL,
 *    parent_id  TEXT,                 -- null = منشور ، غير ذلك = تعليق على منشور
 *    data       TEXT NOT NULL,        -- JSON للصف كاملاً (الاسم، النص، الرابط، likes ...)
 *    created_at INTEGER NOT NULL
 *  );
 *  CREATE INDEX idx_templates_parent ON templates_posts(parent_id);
 *  -- لا يوجد أي job أو TTL على هذا الجدول.
 */

export interface TemplateRowServer {
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

/** اربطها بقاعدة بياناتك */
export interface TemplatesDb {
  list(): Promise<TemplateRowServer[]>;
  get(id: string): Promise<TemplateRowServer | null>;
  upsert(row: TemplateRowServer): Promise<void>;
  /** يحذف الصفوف بالـ id */
  remove(ids: string[]): Promise<void>;
}

export interface TemplatesServerOptions {
  db: TemplatesDb;
  /** يرجع id المستخدم من الجلسة أو null إن لم يكن مسجّلاً */
  getUserId: (req: Request) => Promise<string | null> | string | null;
  /** اختياري: أدمن/مشرف يقدر يحذف أي منشور */
  isAdmin?: (userId: string) => Promise<boolean> | boolean;
  /** اختياري: حذف ملف الصورة/الفيديو من التخزين بعد حذف المنشور */
  onDeleteFile?: (url: string) => Promise<void> | void;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const CMT_RE = /^↩([^\u200b\s]+)\u200b/;
const parentOf = (text: string) => CMT_RE.exec(text || '')?.[1] ?? null;

export function createTemplatesHandler(opts: TemplatesServerOptions) {
  const { db, getUserId, isAdmin, onDeleteFile } = opts;

  return async function handleTemplates(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // /api/templates , /api/templates/like , /api/templates/:id
    const rest = url.pathname.replace(/^\/api\/templates\/?/, '');
    const uid = await getUserId(req);

    // ── GET /api/templates ──
    if (req.method === 'GET' && rest === '') {
      if (!uid) return json({ error: 'unauthorized' }, 401);
      return json({ items: await db.list() });
    }

    // ── POST /api/templates/like ──
    if (req.method === 'POST' && rest === 'like') {
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const body = await req.json().catch(() => null) as { id?: string; liked?: boolean } | null;
      if (!body?.id) return json({ error: 'bad_request' }, 400);
      const row = await db.get(String(body.id));
      if (!row) return json({ error: 'not_found' }, 404);
      const set = new Set(row.likes || []);
      if (body.liked) set.add(uid); else set.delete(uid);
      await db.upsert({ ...row, likes: Array.from(set) });
      return json({ ok: true, likes: Array.from(set) });
    }

    // ── POST /api/templates  (إنشاء/تحديث منشور أو تعليق) ──
    if (req.method === 'POST' && rest === '') {
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const b = await req.json().catch(() => null) as Partial<TemplateRowServer> | null;
      if (!b?.id || !(b.text || b.imageUrl)) return json({ error: 'bad_request' }, 400);
      const id = String(b.id).slice(0, 80);
      const existing = await db.get(id);
      if (existing && existing.userId !== uid) return json({ error: 'forbidden' }, 403);
      const parent = parentOf(String(b.text || ''));
      if (parent && !(await db.get(parent))) return json({ error: 'parent_not_found' }, 404);
      const row: TemplateRowServer = {
        id,
        userId: uid, // من الجلسة دائماً
        name: b.name ?? null,
        username: b.username ?? null,
        avatarUrl: b.avatarUrl ?? null,
        text: String(b.text || '').slice(0, 600),
        imageUrl: b.imageUrl ?? null,
        voiceUrl: b.voiceUrl ?? null,
        voiceDuration: b.voiceDuration ?? null,
        likes: existing?.likes ?? [],           // الإعجابات تتغير فقط عبر /like
        createdAt: existing?.createdAt ?? (Number(b.createdAt) || Date.now()),
        editCount: b.editCount ?? 0,
        replyToId: b.replyToId ?? null,
        replyToName: b.replyToName ?? null,
        replyToText: b.replyToText ?? null,
      };
      await db.upsert(row);
      return json({ ok: true, id });
    }

    // ── DELETE /api/templates/:id ──
    if (req.method === 'DELETE' && rest !== '') {
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const id = decodeURIComponent(rest);
      const row = await db.get(id);
      if (!row) return json({ ok: true });                       // محذوف مسبقاً
      const admin = isAdmin ? await isAdmin(uid) : false;
      if (row.userId !== uid && !admin) return json({ error: 'forbidden' }, 403);
      const all = await db.list();
      const kids = all.filter(r => parentOf(r.text) === id).map(r => r.id);
      await db.remove([id, ...kids]);
      if (onDeleteFile && row.imageUrl) { try { await onDeleteFile(row.imageUrl); } catch { /* ignore */ } }
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  };
}
