/**
 * server/gift-guard.ts — طبقة حماية اقتصاد الهدايا
 *
 * المبدأ الذي يمنع التزوير بغض النظر عن كود العميل:
 *   "الأرباح لا تُنشأ إلا مقابل خصم حقيقي من رصيد المرسل على السيرفر،
 *    ورصيد السيرفر لا يزيد إلا من قنوات موثوقة (ويب هوك Polar، منح الأدمن، تحويل الأرباح)".
 */
import type { Request, RequestHandler } from "express";
import { createHash } from "node:crypto";

export interface SessionUser { id: string; username: string; email: string }

const norm = (s: unknown) => String(s ?? "").trim().replace(/^@/, "").toLowerCase();
export const normId = norm;

// ───────────── الجلسة: نقرأ المستخدم من نفس معالج /api/users/me الموجود عندك ─────────────
// يفشل مغلقاً: أي خطأ/شكل غير متوقع => null => 401. لا نثق أبداً بـ userId القادم من المتصفح.
export function createSession(usersMe: RequestHandler, ownerIds: Set<string>) {
	const cache = new Map<string, { at: number; u: SessionUser | null }>();
	let warned = false;

	const callMe = (req: Request): Promise<SessionUser | null> =>
		new Promise((resolve) => {
			let code = 200;
			let done = false;
			const finish = (o: unknown) => {
				if (done) return;
				done = true;
				if (code >= 400 || !o || typeof o !== "object") return resolve(null);
				const root = o as Record<string, any>;
				const u = root.user ?? root.data?.user ?? root;
				const id = String(u?.id ?? u?.userId ?? "").trim();
				if (!id) {
					if (!warned) { warned = true; console.warn("[session] /api/users/me returned no id — adjust gift-guard.createSession extraction"); }
					return resolve(null);
				}
				resolve({ id, username: norm(u?.username), email: norm(u?.email) });
			};
			const res: any = new Proxy({}, {
				get(_t, p) {
					if (p === "status" || p === "sendStatus") return (c: number) => { code = Number(c) || code; if (p === "sendStatus") finish(null); return res; };
					if (p === "json") return (o: unknown) => { finish(o); return res; };
					if (p === "send") return (o: unknown) => { let v = o; if (typeof o === "string") { try { v = JSON.parse(o); } catch { v = null; } } finish(v); return res; };
					if (p === "end") return () => { finish(null); return res; };
					if (p === "headersSent") return done;
					if (p === "statusCode") return code;
					if (p === "getHeader") return () => undefined;
					return () => res; // setHeader / set / cookie / type / header ...
				},
				set: () => true,
			});
			const t = setTimeout(() => finish(null), 4000);
			try {
				Promise.resolve((usersMe as any)(req, res, () => finish(null))).catch(() => finish(null)).finally(() => clearTimeout(t));
			} catch { clearTimeout(t); finish(null); }
		});

	const user = async (req: Request): Promise<SessionUser | null> => {
		const cookie = String(req.headers.cookie || "");
		const auth = String(req.headers.authorization || "");
		if (!cookie && !auth) return null;
		const k = createHash("sha1").update(cookie + "|" + auth).digest("hex");
		const hit = cache.get(k);
		const now = Date.now();
		if (hit && now - hit.at < (hit.u ? 5000 : 1000)) return hit.u;
		const u = await callMe(req);
		cache.set(k, { at: now, u });
		if (cache.size > 2000) for (const [kk, v] of cache) if (now - v.at > 10_000) cache.delete(kk);
		return u;
	};
	const isAdmin = (u: SessionUser | null) => !!u && (ownerIds.has(u.username) || ownerIds.has(u.email));
	/** كل المفاتيح (مطبّعة) التي قد تُخزَّن بها بيانات هذا المستخدم. */
	const keysOf = (u: SessionUser): string[] => {
		const k = new Set([u.id, u.username, u.email].map(norm).filter(Boolean));
		if (isAdmin(u)) for (const a of ["stooorna", "stooorna@mail.com"]) k.add(a);
		return [...k];
	};
	const owns = (u: SessionUser, key: unknown) => !!norm(key) && keysOf(u).includes(norm(key));
	return { user, isAdmin, keysOf, owns };
}

// ───────────── Rate limit بسيط في الذاكرة ─────────────
export function makeLimiter() {
	const hits = new Map<string, number[]>();
	return (key: string, max: number, windowMs: number): boolean => {
		const now = Date.now();
		const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
		if (arr.length >= max) { hits.set(key, arr); return false; }
		arr.push(now);
		hits.set(key, arr);
		if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
		return true;
	};
}

/** يختار مفتاح الرصيد/الأرباح الأعلى قيمة من مفاتيح المستخدم؛ وإلا u.id */
export function pickKey(map: Map<string, number>, u: SessionUser, keys: string[]): string {
	let best = "", v = -1;
	for (const [k, n] of map) if (keys.includes(norm(k)) && n > v) { best = k; v = n; }
	return best || u.id;
}

// ───────────── سجل الهدايا المدفوعة (يربط الخصم ببث الهدية) ─────────────
type Paid = { userId: string; to: string; giftId: string; count: number; price: number; at: number };
const paid: Paid[] = [];
const PAID_TTL = 5 * 60_000;
const pk = (p: Omit<Paid, "at">) => `${norm(p.userId)}|${norm(p.to)}|${p.giftId}|${p.count}|${p.price}`;
export function recordPaid(p: Omit<Paid, "at">) {
	const now = Date.now();
	while (paid.length && now - paid[0].at > PAID_TTL) paid.shift();
	paid.push({ ...p, at: now });
	if (paid.length > 3000) paid.splice(0, paid.length - 3000);
}
/** يستهلك سجلاً مطابقاً مرة واحدة فقط؛ false إذا لا يوجد خصم مطابق. */
export function takePaid(p: Omit<Paid, "at">): boolean {
	const now = Date.now();
	const key = pk(p);
	const i = paid.findIndex((x) => now - x.at <= PAID_TTL && pk(x) === key);
	if (i < 0) return false;
	paid.splice(i, 1);
	return true;
}

// نافذة قصيرة لمنع الضغط المزدوج (أقل من COMBO_WINDOW_MS=1200). تُسجَّل فقط بعد خصم ناجح،
// حتى لا يتحول طلب فاشل إلى "تكرار" يمرّر الطلب التالي بدون دفع.
const recent = new Map<string, number>();
export function seenRecently(key: string, windowMs = 800): boolean {
	const t = recent.get(key);
	return t !== undefined && Date.now() - t < windowMs;
}
export function markSeen(key: string) {
	const now = Date.now();
	recent.set(key, now);
	if (recent.size > 4000) for (const [k, v] of recent) if (now - v > 10_000) recent.delete(k);
}
