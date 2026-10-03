/**
 * server/call-state.ts — ملف مستقل بالكامل لحالة المكالمات (مشغول / انتظار المكالمة).
 *
 * لا يعدّل أي route قديم. يُسجَّل مرة واحدة في entry.ts:
 *     registerCallStateRoutes(app, { getUser })
 *
 * القواعد (المصدر الوحيد للحقيقة هو السيرفر، والتسجيل ذرّي لأن Node أحادي الخيط):
 *  1) المتصل مشغول (يتصل/يرن/داخل مكالمة أخرى)      → self_busy
 *  2) المستقبِل "فاضي"                               → يرن عادي
 *  3) المستقبِل يتصل بشخص أو يرن عنده اتصال آخر      → busy (مشغول)
 *  4) المستقبِل داخل مكالمة:
 *       - زر "انتظار المكالمة" مطفي                  → busy (مشغول)
 *       - زر "انتظار المكالمة" مشغّل                 → waiting (يرن له تنبيه المكالمة الثانية)
 *  5) اتصال متبادل (أنا أتصل عليه وهو يتصل عليّ بنفس اللحظة) → الثاني يحصل busy
 *
 * الحالات تنتهي تلقائياً (TTL) إذا انقطع نبض العميل، فلا يبقى أحد "مشغول" للأبد.
 */
import type { Express, Request, Response } from "express";

type SessionUser = { id: string } | null;
type Deps = { getUser: (req: Request) => Promise<SessionUser> | SessionUser };

type UserCall = {
	live: Set<string>; // القنوات اللي أنا داخلها فعلياً (ممكن أكثر من وحدة: وحدة معلّقة)
	calling: string | null; // قناة أنا أتصل فيها وما ردّوا بعد
	ringing: string | null; // قناة يرن عندي منها اتصال
	waiting: { channel: string; from: string; at: number } | null; // اتصال ثانٍ منتظر
	waitingEnabled: boolean;
	beat: number;
	since: number;
};
type Chan = { host: string; invited: Set<string>; joined: Set<string>; at: number };
type Signal = { id: string; at: number; from: string; to: string; type: string; payload: Record<string, unknown> };

const STALE_MS = 60_000; // بدون نبض أكثر من هذا = الحالة منتهية
const SIGNAL_TTL_MS = 30_000;

const g = globalThis as typeof globalThis & {
	__stooornaCallUsers?: Map<string, UserCall>;
	__stooornaCallChans?: Map<string, Chan>;
	__stooornaCallSignals?: Signal[];
};
const users = (g.__stooornaCallUsers ??= new Map<string, UserCall>());
const chans = (g.__stooornaCallChans ??= new Map<string, Chan>());
const signals = (g.__stooornaCallSignals ??= []);

const norm = (s: unknown) => String(s ?? "").trim().slice(0, 80);
const chanId = (s: unknown) => String(s ?? "").trim().slice(0, 120);

function rec(id: string): UserCall {
	let u = users.get(id);
	if (!u) {
		u = { live: new Set(), calling: null, ringing: null, waiting: null, waitingEnabled: false, beat: Date.now(), since: Date.now() };
		users.set(id, u);
	}
	return u;
}
const isBusyNow = (u: UserCall) => u.live.size > 0 || !!u.calling || !!u.ringing;

function resetCallState(u: UserCall) {
	u.live.clear();
	u.calling = null;
	u.ringing = null;
	u.waiting = null;
}

/** تنظيف الحالات المنتهية (ما وصل منها نبض). الإعداد waitingEnabled يبقى. */
function purge() {
	const now = Date.now();
	for (const [id, u] of users) {
		if (now - u.beat > STALE_MS && isBusyNow(u)) resetCallState(u);
		if (now - u.beat > 6 * 3600_000 && !isBusyNow(u) && !u.waitingEnabled) users.delete(id);
	}
	for (const [ch, c] of chans) {
		if (now - c.at > 4 * 3600_000) chans.delete(ch);
	}
	while (signals.length && now - signals[0].at > SIGNAL_TTL_MS) signals.shift();
}

/** إزالة مستخدم من قناة وترتيب حالة الباقين. */
function leaveChannel(userId: string, channel: string) {
	const u = rec(userId);
	u.live.delete(channel);
	if (u.calling === channel) u.calling = null;
	if (u.ringing === channel) u.ringing = null;
	if (u.waiting?.channel === channel) u.waiting = null;

	const c = chans.get(channel);
	if (!c) return;
	c.joined.delete(userId);
	c.invited.delete(userId);

	// المتصل (host) ألغى قبل ما أحد يرد → كل اللي يرن/ينتظر عندهم ينتهي
	if (userId === c.host && c.joined.size === 0) {
		for (const v of c.invited) {
			const vu = rec(v);
			if (vu.ringing === channel) vu.ringing = null;
			if (vu.waiting?.channel === channel) vu.waiting = null;
		}
		chans.delete(channel);
		return;
	}
	// ما بقي إلا واحد داخل المكالمة → المكالمة انتهت للجميع
	if (c.joined.size <= 1 && c.invited.size === 0) {
		for (const v of c.joined) {
			const vu = rec(v);
			vu.live.delete(channel);
			if (vu.calling === channel) vu.calling = null;
		}
		// اتصال 1:1 رفضه المستقبِل قبل الرد → المتصل يرجع فاضي
		const hu = rec(c.host);
		if (hu.calling === channel) hu.calling = null;
		chans.delete(channel);
	}
}

export function registerCallStateRoutes(app: Express, deps: Deps) {
	const auth = async (req: Request, res: Response) => {
		res.setHeader("Cache-Control", "no-store");
		const u = await deps.getUser(req);
		if (!u?.id) {
			res.status(401).json({ ok: false, error: "unauthorized" });
			return null;
		}
		purge();
		const me = norm(u.id);
		rec(me).beat = Date.now();
		return me;
	};
	const wrap = (fn: (req: Request, res: Response, me: string) => unknown) => async (req: Request, res: Response) => {
		try {
			const me = await auth(req, res);
			if (!me) return;
			await fn(req, res, me);
		} catch (e) {
			console.error("[call-state]", e instanceof Error ? e.message : "error");
			if (!res.headersSent) res.status(500).json({ ok: false, error: "server_error" });
		}
	};

	/** بدء اتصال: فحص ذرّي + حجز الحالات. */
	app.post("/api/call/begin", wrap((req, res, me) => {
		const body = (req.body || {}) as Record<string, unknown>;
		const channel = chanId(body.channel);
		const toIds = [...new Set((Array.isArray(body.toUserIds) ? body.toUserIds : []).map(norm).filter((x) => x && x !== me))].slice(0, 20);
		if (!channel || !toIds.length) return res.status(400).json({ ok: false, error: "bad_request" });

		const caller = rec(me);
		// الواجهة تقول إنها فاضية (phase idle) → أي حالة قديمة عالقة عند السيرفر تُمسح
		if (body.clientIdle === true) resetCallState(caller);

		const selfBusy =
			(caller.live.size > 0 && !caller.live.has(channel)) ||
			(!!caller.calling && caller.calling !== channel) ||
			!!caller.ringing;
		if (selfBusy) return res.json({ ok: true, selfBusy: true, results: {} });

		const results: Record<string, "ok" | "busy" | "waiting"> = {};
		const now = Date.now();
		let c = chans.get(channel);
		if (!c) {
			c = { host: me, invited: new Set(), joined: new Set(), at: now };
			chans.set(channel, c);
		}
		c.at = now;

		for (const id of toIds) {
			const v = rec(id);
			if (v.live.has(channel) || v.ringing === channel || v.waiting?.channel === channel) {
				// نفس المكالمة (إعادة نبض/تذكير) — لا نغيّر شيئاً
				results[id] = v.waiting?.channel === channel ? "waiting" : "ok";
				c.invited.add(id);
				continue;
			}
			if (v.live.size > 0) {
				if (v.waitingEnabled && !v.waiting) {
					v.beat = now; // المستقبِل ممكن يكون خامل بدون نبض — لا نخلي purge يمسح الحجز فوراً
					v.waiting = { channel, from: me, at: now };
					c.invited.add(id);
					results[id] = "waiting";
				} else {
					results[id] = "busy";
				}
				continue;
			}
			if (v.calling || v.ringing) {
				results[id] = "busy"; // يتصل بشخص أو يرن عنده اتصال — مشغول (يشمل الاتصال المتبادل)
				continue;
			}
			v.beat = now; // نفس السبب: الحجز يعيش STALE_MS كاملة من لحظة الاتصال
			v.ringing = channel;
			c.invited.add(id);
			results[id] = "ok";
		}

		const anyDelivered = Object.values(results).some((r) => r !== "busy");
		if (anyDelivered) {
			if (!caller.live.has(channel)) caller.calling = channel;
		} else if (!c.joined.size && !c.invited.size) {
			chans.delete(channel);
		}
		res.json({ ok: true, selfBusy: false, results });
	}));

	/** رد على مكالمة (عادية أو ثانية بعد الانتظار). */
	app.post("/api/call/answer", wrap((req, res, me) => {
		const channel = chanId((req.body || {}).channel);
		if (!channel) return res.status(400).json({ ok: false, error: "bad_request" });
		const c = chans.get(channel);
		const u = rec(me);
		// السيرفر ممكن يكون انعاد تشغيله وفقد إعداد الانتظار — العميل يرسله مع كل رد
		if (typeof (req.body || {}).waitingEnabled === "boolean") u.waitingEnabled = (req.body as any).waitingEnabled;
		u.live.add(channel);
		if (u.ringing === channel) u.ringing = null;
		if (u.waiting?.channel === channel) u.waiting = null;
		if (c) {
			c.invited.delete(me);
			c.joined.add(me);
			c.at = Date.now();
			const h = rec(c.host);
			h.live.add(channel);
			if (h.calling === channel) h.calling = null;
			c.joined.add(c.host);
		}
		res.json({ ok: true });
	}));

	/** إنهاء / رفض / إلغاء. */
	app.post("/api/call/end", wrap((req, res, me) => {
		const channel = chanId((req.body || {}).channel);
		if (!channel) {
			// بدون قناة: نظّف كل شيء خاص بي (مثلاً عند إغلاق التطبيق)
			resetCallState(rec(me));
			return res.json({ ok: true });
		}
		leaveChannel(me, channel);
		res.json({ ok: true });
	}));

	/** نبض: يمدّد صلاحية حالتي. */
	app.post("/api/call/heartbeat", wrap((req, res, me) => {
		if (typeof (req.body || {}).waitingEnabled === "boolean") rec(me).waitingEnabled = (req.body as any).waitingEnabled;
		res.json({ ok: true });
	}));

	/** زر "انتظار المكالمة" (يظهر في سجل المكالمات). */
	app.post("/api/call/waiting", wrap((req, res, me) => {
		const enabled = (req.body || {}).enabled === true || (req.body || {}).enabled === "true";
		rec(me).waitingEnabled = enabled;
		res.json({ ok: true, enabled });
	}));
	app.get("/api/call/waiting", wrap((_req, res, me) => res.json({ ok: true, enabled: rec(me).waitingEnabled })));

	/** حالة مستخدم (اختياري للواجهة). */
	app.get("/api/call/status", wrap((req, res) => {
		const id = norm(req.query.userId);
		const u = id ? users.get(id) : undefined;
		res.json({ ok: true, busy: !!u && isBusyNow(u), waiting: !!u?.waitingEnabled });
	}));

	/** صندوق إشارات احتياطي (دمج / انتظار / مشغول) — لا يعتمد على WebSocket القديم. */
	app.post("/api/call/signal", wrap((req, res, me) => {
		const body = (req.body || {}) as Record<string, unknown>;
		const to = norm(body.to);
		const type = String(body.type || "").slice(0, 30);
		if (!to || !type) return res.status(400).json({ ok: false, error: "bad_request" });
		const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
		const id = String(body.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`).slice(0, 60);
		signals.push({ id, at: Date.now(), from: me, to, type, payload });
		if (signals.length > 500) signals.splice(0, signals.length - 500);
		res.json({ ok: true, id });
	}));
	app.get("/api/call/signals", wrap((req, res, me) => {
		const since = Number(req.query.since) || 0;
		const out = signals.filter((s) => s.to === me && s.at > since);
		res.json({ ok: true, now: Date.now(), signals: out });
	}));
}
