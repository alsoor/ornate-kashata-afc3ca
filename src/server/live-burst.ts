/**
 * live-burst.ts → ضعه بجانب entry.ts
 *
 * أحداث "تناثر الإيموجي" اللحظية للشات العام. ذاكرة فقط (لا حاجة لتخزين دائم):
 *   POST /api/live-chat/burst        { room, msgId, emoji, userId }
 *   GET  /api/live-chat/burst?room=&after=<seq>  → { last, events: [{seq,msgId,emoji,userId,at}] }
 * لا يتعارض مع مسار /api/live-chat الحالي (مسار مختلف تماماً).
 */
import type { Express, Request } from "express";

type Ev = { seq: number; msgId: string; emoji: string; userId: string; at: number };

const MAX_EVENTS = 200;          // لكل غرفة
const EVENT_TTL_MS = 15_000;     // أي حدث أقدم من هذا لا يهم أحداً
const PER_USER_MIN_GAP_MS = 120; // حماية من الإغراق

export function registerLiveBurstRoutes(
  app: Express,
  opts: { getUserId?: (req: Request) => Promise<string | null> | string | null } = {},
) {
  const rooms = new Map<string, Ev[]>();
  const lastByUser = new Map<string, number>();
  let seq = 0;

  const roomKey = (v: unknown) => String(v || "stooorna-live-chat").slice(0, 80);

  app.post("/api/live-chat/burst", async (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    // الهوية من الجلسة إن توفرت، وإلا من العميل (نفس أسلوب /api/live-chat)
    let userId = "";
    try { userId = (opts.getUserId ? await opts.getUserId(req) : null) || ""; } catch { /* */ }
    if (!userId) userId = String(b.userId || "").slice(0, 80);
    const msgId = String(b.msgId || "").slice(0, 80);
    const emoji = String(b.emoji || "").slice(0, 16);
    if (!userId || !msgId || !emoji) return void res.status(400).json({ error: "bad_request" });

    const now = Date.now();
    if (now - (lastByUser.get(userId) || 0) < PER_USER_MIN_GAP_MS) return void res.json({ ok: true, dropped: true });
    lastByUser.set(userId, now);
    if (lastByUser.size > 5000) lastByUser.clear();

    const key = roomKey(b.room ?? b.channel);
    const list = (rooms.get(key) || []).filter((e) => now - e.at < EVENT_TTL_MS);
    list.push({ seq: ++seq, msgId, emoji, userId, at: now });
    rooms.set(key, list.slice(-MAX_EVENTS));
    res.json({ ok: true, seq });
  });

  app.get("/api/live-chat/burst", (req, res) => {
    const key = roomKey(req.query.room ?? req.query.channel);
    const after = Number(req.query.after ?? -1);
    const now = Date.now();
    const list = (rooms.get(key) || []).filter((e) => now - e.at < EVENT_TTL_MS);
    res.setHeader("Cache-Control", "no-store");
    // after = -1 → أول اتصال: نرجع فقط المؤشر الأخير بلا أحداث (لا نعيد تشغيل القديم)
    res.json({ ok: true, last: seq, events: after < 0 ? [] : list.filter((e) => e.seq > after) });
  });
}
