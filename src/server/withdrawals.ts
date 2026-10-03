/**
 * server/withdrawals.ts — نظام سحب أرباح الدعم (بنك IBAN + PayPal)
 *
 * المبدأ:
 *  - السحب فقط من "أرباح الدعم" (earnings) — أبداً من رصيد Coins المشحون بالبطاقة.
 *  - كل الأمور الحساسة على السيرفر: الهوية من الجلسة (وليس من userId يرسله العميل).
 *  - عند الطلب يُخصم المبلغ فوراً (حجز) داخل قسم متزامن واحد، ويُرجع تلقائياً عند الرفض/الإلغاء.
 *  - بيانات الحساب مشفّرة AES-256-GCM على القرص، وتُعرض مقنّعة، ولا يراها إلا الأدمن بطلب مُسجَّل.
 *  - الدفع الفعلي يدوي: pending → approved → paid (لا يوجد تحويل تلقائي).
 *
 * الربط في entry.ts: انظر README أسفل الملف (ثلاثة أسطر).
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ───────────────────────── الإعدادات ─────────────────────────
export const WITHDRAW_DEFAULTS = {
	coinsPerUsd: 100, // 100 Coins = 1$ (نفس entry.ts: usd = coins / 100)
	minUsd: 10,
	maxUsdPerRequest: 500,
	maxUsdPerDay: 1000, // مجموع آخر 24 ساعة (بدون المرفوض/الملغي)
	holdHours: 48, // مدة المراجعة قبل أن يقدر الأدمن يوافق (والمستخدم يقدر يلغي خلالها)
	maxOpenRequests: 1, // طلب واحد مفتوح (pending/approved) لكل مستخدم
	minAccountAgeHours: 72, // يُطبَّق فقط إذا أعاد getUser حقل createdAt
	writeLimitPerIp: { max: 12, windowMs: 10 * 60_000 },
	writeLimitPerUser: { max: 8, windowMs: 10 * 60_000 },
};
export type WithdrawConfig = typeof WITHDRAW_DEFAULTS;

// ───────────────────────── الأنواع ─────────────────────────
export interface AuthUser {
	id: string;
	username?: string | null;
	email?: string | null;
	createdAt?: number | string | null;
}
/** منفذ الأرباح: يربط الملف برصيد الأرباح الموجود في entry.ts دون استيراده. */
export interface EarningsPort {
	available(user: AuthUser): number;
	/** يخصم بشكل ذرّي ويرجع مفتاح المصدر، أو null إذا الرصيد غير كافٍ. */
	debit(user: AuthUser, coins: number): string | null;
	credit(sourceKey: string, coins: number): void;
}
export interface WithdrawalDeps {
	/** الهوية من الجلسة/الكوكي — اربطها بنفس آلية /api/users/me. تفشل مغلقة (401) إذا أعادت null. */
	getUser: (req: Request) => AuthUser | null | Promise<AuthUser | null>;
	isAdmin: (user: AuthUser) => boolean;
	earnings: EarningsPort;
	dataDir: string;
	/** اختياري: تحقق إضافي قبل إنشاء الطلب (كلمة السر / OTP). يجب أن يرجع true. */
	stepUp?: (req: Request, user: AuthUser) => boolean | Promise<boolean>;
	isBlocked?: (user: AuthUser) => boolean | Promise<boolean>;
	/** المفتاح السري 32 بايت (hex 64 أو base64). الافتراضي: process.env.WITHDRAW_ENC_KEY */
	encKey?: string;
	/** نطاقات إضافية مسموحة للـ Origin (مثلاً دومين التطبيق العام). */
	allowedOrigins?: string[];
	config?: Partial<WithdrawConfig>;
}

type Method = "bank" | "paypal";
type Status = "pending" | "approved" | "paid" | "rejected" | "cancelled";
interface HistoryRow { at: number; by: string; action: string; note?: string }
interface Withdrawal {
	id: string;
	userId: string;
	username: string | null;
	coins: number;
	usdCents: number;
	method: Method;
	status: Status;
	createdAt: number;
	updatedAt: number;
	releaseAt: number;
	destMasked: string;
	destFp: string; // HMAC لهوية الوجهة (يمنع نفس الحساب على عدة مستخدمين)
	payload: string; // التفاصيل مشفّرة
	sourceKey: string; // مفتاح الأرباح الذي خُصم منه (للإرجاع)
	idemKey: string;
	refunded: boolean;
	payoutRef?: string;
	reason?: string;
	history: HistoryRow[];
}

// ───────────────────────── التحقق من المدخلات ─────────────────────────
const IBAN_LEN: Record<string, number> = {
	KW: 30, SA: 24, AE: 23, BH: 22, QA: 29, OM: 23, JO: 30, EG: 29, IQ: 23, LB: 28,
	GB: 22, DE: 22, FR: 27, ES: 24, IT: 27, NL: 18, TR: 26, CH: 21, IE: 22, PT: 25,
};
function ibanOk(iban: string): boolean {
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
	const want = IBAN_LEN[iban.slice(0, 2)];
	if (want ? iban.length !== want : iban.length < 15 || iban.length > 34) return false;
	const s = iban.slice(4) + iban.slice(0, 4);
	let rem = 0;
	for (const ch of s) {
		const v = ch >= "A" ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
		rem = v > 9 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
	}
	return rem === 1;
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{M} .'’-]{3,80}$/u;
const SWIFT_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

type Parsed = { ok: true; method: Method; details: Record<string, string>; masked: string; destId: string } | { ok: false; error: string };
function parseDestination(body: Record<string, unknown>): Parsed {
	const method = String(body.method || "");
	const d = (body.details && typeof body.details === "object" ? body.details : {}) as Record<string, unknown>;
	if (method === "paypal") {
		const email = String(d.email || "").trim().toLowerCase();
		if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: "invalid_paypal_email" };
		const [l, dom] = email.split("@");
		return { ok: true, method, details: { email }, masked: `${l[0]}•••@${dom}`, destId: email };
	}
	if (method === "bank") {
		const holderName = String(d.holderName || "").trim().replace(/\s+/g, " ");
		const bankName = String(d.bankName || "").trim().slice(0, 80);
		const iban = String(d.iban || "").replace(/\s+/g, "").toUpperCase();
		const swift = String(d.swift || "").replace(/\s+/g, "").toUpperCase();
		if (!NAME_RE.test(holderName)) return { ok: false, error: "invalid_holder_name" };
		if (bankName.length < 2) return { ok: false, error: "invalid_bank_name" };
		if (!ibanOk(iban)) return { ok: false, error: "invalid_iban" };
		if (!SWIFT_RE.test(swift)) return { ok: false, error: "invalid_swift" };
		return {
			ok: true,
			method,
			details: { holderName, bankName, iban, swift },
			masked: `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`,
			destId: iban,
		};
	}
	return { ok: false, error: "invalid_method" };
}

// ───────────────────────── التشفير ─────────────────────────
function loadKey(raw?: string): Buffer | null {
	const s = String(raw ?? "").trim();
	if (!s) return null;
	const b = /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
	return b.length === 32 ? b : null;
}
const b64u = (b: Buffer) => b.toString("base64url");
function encrypt(key: Buffer, plain: string, aad: string): string {
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", key, iv);
	c.setAAD(Buffer.from(aad));
	const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
	return ["v1", b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join(".");
}
function decrypt(key: Buffer, token: string, aad: string): string {
	const [v, iv, tag, ct] = token.split(".");
	if (v !== "v1") throw new Error("bad_version");
	const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
	d.setAAD(Buffer.from(aad));
	d.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

// ───────────────────────── أدوات عامة ─────────────────────────
function makeLimiter() {
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
const fail = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });
const wrap = (fn: (req: Request, res: Response) => Promise<void> | void): RequestHandler => (req, res) => {
	Promise.resolve(fn(req, res)).catch((e) => {
		console.error("[withdrawals] handler error:", e instanceof Error ? e.message : "unknown");
		if (!res.headersSent) fail(res, 500, "server_error");
	});
};

/** يمنع الوصول العام لملفات حساسة موجودة داخل ASSETS_DIR (مثل gift-profits.json ومجلد _private). */
export function privateAssetsGuard(): RequestHandler {
	return (req: Request, res: Response, next: NextFunction) => {
		let p = req.path;
		try { p = decodeURIComponent(p); } catch { /* */ }
		p = p.toLowerCase();
		if (p.includes("/_private") || p.includes("stooorna-gift-profits")) return void res.status(404).end();
		next();
	};
}

/** يربط EarningsPort بـ Map الأرباح الموجودة في entry.ts (giftProfitMem().earnings). */
export function mapEarningsAdapter(getMap: () => Map<string, number>, save: () => void): EarningsPort {
	const keys = (u: AuthUser) => [...new Set([u.id, u.username].map((x) => String(x || "").trim()).filter(Boolean))];
	const best = (u: AuthUser) => {
		let k = "", v = 0;
		for (const c of keys(u)) { const n = getMap().get(c) || 0; if (n > v) { v = n; k = c; } }
		return { k, v };
	};
	return {
		available: (u) => best(u).v,
		debit(u, coins) {
			const { k, v } = best(u);
			if (!k || v < coins) return null;
			getMap().set(k, v - coins);
			save();
			return k;
		},
		credit(k, coins) { getMap().set(k, (getMap().get(k) || 0) + coins); save(); },
	};
}

// ───────────────────────── التسجيل ─────────────────────────
export function registerWithdrawalRoutes(app: Express, deps: WithdrawalDeps): void {
	const cfg: WithdrawConfig = { ...WITHDRAW_DEFAULTS, ...(deps.config || {}) };
	const key = loadKey(deps.encKey ?? process.env.WITHDRAW_ENC_KEY);
	const fpKey = key ? createHmac("sha256", key).update("withdraw-fp-v1").digest() : null;
	const limit = makeLimiter();
	const DAY = 86_400_000;

	// ── التخزين (ملف JSON ذرّي + سجل تدقيق) ──
	const file = join(deps.dataDir, "withdrawals.json");
	const auditFile = join(deps.dataDir, "withdrawals-audit.log");
	let items: Withdrawal[] = [];
	let storeOk = true;
	try {
		if (!existsSync(deps.dataDir)) mkdirSync(deps.dataDir, { recursive: true, mode: 0o700 });
		if (existsSync(file)) items = (JSON.parse(readFileSync(file, "utf8")) as { items: Withdrawal[] }).items || [];
	} catch (e) {
		storeOk = false; // لا نصفّر الملف أبداً عند الخطأ — نوقف الميزة بدل أن نفقد السجلات
		console.error("[withdrawals] store load failed — feature disabled:", e instanceof Error ? e.message : "unknown");
	}
	if (!key) console.warn("[withdrawals] WITHDRAW_ENC_KEY missing/invalid — creating requests is disabled");
	const persist = () => {
		const tmp = `${file}.tmp`;
		writeFileSync(tmp, JSON.stringify({ version: 1, items }), { mode: 0o600 });
		renameSync(tmp, file);
	};
	const audit = (actor: string, action: string, w: Withdrawal | null, req: Request, extra?: Record<string, unknown>) => {
		try {
			appendFileSync(auditFile, JSON.stringify({ at: Date.now(), actor, action, id: w?.id, user: w?.userId, ip: req.ip, ...extra }) + "\n", { mode: 0o600 });
		} catch { /* */ }
	};

	// ── مساعدات الأمان ──
	const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ""; } };
	const sameOrigin = (req: Request): boolean => {
		const origin = req.get("origin");
		if (!origin) return true; // طلبات بدون Origin (نفس الموقع / أدوات) — الكوكي SameSite تحميها
		const allowed = new Set([req.get("host") || "", ...(deps.allowedOrigins || []).map(hostOf)]);
		if (process.env.PUBLIC_APP_URL) allowed.add(hostOf(process.env.PUBLIC_APP_URL));
		return allowed.has(hostOf(origin));
	};
	const authed = async (req: Request, res: Response, write: boolean): Promise<AuthUser | null> => {
		res.setHeader("Cache-Control", "no-store");
		if (write && !sameOrigin(req)) { fail(res, 403, "bad_origin"); return null; }
		const u = await deps.getUser(req);
		if (!u || !u.id) { fail(res, 401, "unauthorized"); return null; }
		if (write && deps.isBlocked && (await deps.isBlocked(u))) { fail(res, 403, "blocked"); return null; }
		return u;
	};
	const adminOnly = async (req: Request, res: Response, write: boolean): Promise<AuthUser | null> => {
		const u = await authed(req, res, write);
		if (!u) return null;
		if (!deps.isAdmin(u)) { fail(res, 403, "forbidden"); return null; }
		return u;
	};
	const ready = (res: Response, needKey: boolean) => {
		if (!storeOk || (needKey && !key)) { fail(res, 503, "unavailable"); return false; }
		return true;
	};
	const pub = (w: Withdrawal, admin = false) => ({
		id: w.id,
		coins: w.coins,
		usd: w.usdCents / 100,
		method: w.method,
		status: w.status,
		dest: w.destMasked,
		createdAt: w.createdAt,
		updatedAt: w.updatedAt,
		releaseAt: w.releaseAt,
		reason: w.reason,
		payoutRef: w.status === "paid" ? w.payoutRef : undefined,
		...(admin ? { userId: w.userId, username: w.username, history: w.history } : {}),
	});
	const open = (w: Withdrawal) => w.status === "pending" || w.status === "approved";
	/** إرجاع المبلغ مرة واحدة فقط — قسم متزامن بلا await. */
	const refund = (w: Withdrawal) => {
		if (w.refunded) return;
		w.refunded = true;
		deps.earnings.credit(w.sourceKey, w.coins);
	};

	// ── GET إعدادات + حالتي ──
	app.get("/api/withdrawals/config", (_req, res) => {
		res.setHeader("Cache-Control", "no-store");
		res.json({
			ok: true, coinsPerUsd: cfg.coinsPerUsd, minUsd: cfg.minUsd, maxUsdPerRequest: cfg.maxUsdPerRequest,
			maxUsdPerDay: cfg.maxUsdPerDay, holdHours: cfg.holdHours, methods: ["bank", "paypal"], enabled: storeOk && !!key,
		});
	});

	app.get("/api/withdrawals/me", wrap(async (req, res) => {
		const u = await authed(req, res, false);
		if (!u || !ready(res, false)) return;
		const mine = items.filter((w) => w.userId === u.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
		const coins = deps.earnings.available(u);
		res.json({ ok: true, availableCoins: coins, availableUsd: Math.floor((coins * 100) / cfg.coinsPerUsd) / 100, items: mine.map((w) => pub(w)) });
	}));

	// ── POST إنشاء طلب سحب ──
	app.post("/api/withdrawals", wrap(async (req, res) => {
		if (!limit(`ip:${req.ip}`, cfg.writeLimitPerIp.max, cfg.writeLimitPerIp.windowMs)) return void fail(res, 429, "rate_limited");
		const u = await authed(req, res, true);
		if (!u || !ready(res, true)) return;
		if (!limit(`u:${u.id}`, cfg.writeLimitPerUser.max, cfg.writeLimitPerUser.windowMs)) return void fail(res, 429, "rate_limited");
		if (deps.stepUp && !(await deps.stepUp(req, u))) return void fail(res, 403, "step_up_required");

		const body = (req.body || {}) as Record<string, unknown>;
		const idem = String(req.get("idempotency-key") || body.idempotencyKey || "");
		if (!/^[A-Za-z0-9_-]{8,80}$/.test(idem)) return void fail(res, 400, "idempotency_key_required");

		// ===== قسم متزامن: لا await من هنا حتى الحفظ (يمنع السحب المزدوج) =====
		const dup = items.find((w) => w.userId === u.id && w.idemKey === idem);
		if (dup) return void res.json({ ok: true, idempotent: true, item: pub(dup) });

		if (cfg.minAccountAgeHours > 0 && u.createdAt) {
			const created = typeof u.createdAt === "number" ? u.createdAt : Date.parse(String(u.createdAt));
			if (Number.isFinite(created) && Date.now() - created < cfg.minAccountAgeHours * 3_600_000) return void fail(res, 403, "account_too_new");
		}
		if (items.filter((w) => w.userId === u.id && open(w)).length >= cfg.maxOpenRequests) return void fail(res, 409, "open_request_exists");

		const coins = Number(body.coins);
		if (!Number.isSafeInteger(coins) || coins <= 0) return void fail(res, 400, "invalid_amount");
		const usdCents = Math.floor((coins * 100) / cfg.coinsPerUsd);
		if (usdCents < cfg.minUsd * 100) return void fail(res, 400, "below_minimum");
		if (usdCents > cfg.maxUsdPerRequest * 100) return void fail(res, 400, "above_maximum");
		const dayTotal = items
			.filter((w) => w.userId === u.id && Date.now() - w.createdAt < DAY && w.status !== "rejected" && w.status !== "cancelled")
			.reduce((s, w) => s + w.usdCents, 0);
		if (dayTotal + usdCents > cfg.maxUsdPerDay * 100) return void fail(res, 429, "daily_limit");

		const dest = parseDestination(body);
		if (!dest.ok) return void fail(res, 400, dest.error);
		const destFp = createHmac("sha256", fpKey!).update(`${dest.method}:${dest.destId}`).digest("hex");
		if (items.some((w) => w.destFp === destFp && w.userId !== u.id && w.status !== "rejected" && w.status !== "cancelled")) {
			audit(u.id, "dest_in_use", null, req);
			return void fail(res, 409, "destination_in_use");
		}

		const sourceKey = deps.earnings.debit(u, coins); // الخصم من الأرباح فقط
		if (!sourceKey) return void fail(res, 402, "insufficient_earnings");

		const now = Date.now();
		const id = randomUUID();
		const w: Withdrawal = {
			id, userId: u.id, username: u.username ?? null, coins, usdCents, method: dest.method, status: "pending",
			createdAt: now, updatedAt: now, releaseAt: now + cfg.holdHours * 3_600_000,
			destMasked: dest.masked, destFp, payload: encrypt(key!, JSON.stringify(dest.details), id),
			sourceKey, idemKey: idem, refunded: false, history: [{ at: now, by: u.id, action: "created" }],
		};
		items.push(w);
		try { persist(); } catch (e) {
			items.pop();
			deps.earnings.credit(sourceKey, coins); // فشل الحفظ → نرجّع المبلغ
			console.error("[withdrawals] persist failed:", e instanceof Error ? e.message : "unknown");
			return void fail(res, 500, "server_error");
		}
		// ===== نهاية القسم المتزامن =====
		audit(u.id, "created", w, req, { usdCents, method: w.method });
		res.status(201).json({ ok: true, item: pub(w), availableCoins: deps.earnings.available(u) });
	}));

	// ── POST إلغاء من المستخدم (فقط وهو pending) ──
	app.post("/api/withdrawals/:id/cancel", wrap(async (req, res) => {
		const u = await authed(req, res, true);
		if (!u || !ready(res, false)) return;
		const w = items.find((x) => x.id === req.params.id && x.userId === u.id);
		if (!w) return void fail(res, 404, "not_found");
		if (w.status !== "pending") return void fail(res, 409, "not_cancellable");
		w.status = "cancelled"; w.updatedAt = Date.now(); w.history.push({ at: w.updatedAt, by: u.id, action: "cancelled" });
		refund(w);
		persist();
		audit(u.id, "cancelled", w, req);
		res.json({ ok: true, item: pub(w), availableCoins: deps.earnings.available(u) });
	}));

	// ───────────── الأدمن ─────────────
	app.get("/api/admin/withdrawals", wrap(async (req, res) => {
		const a = await adminOnly(req, res, false);
		if (!a || !ready(res, false)) return;
		const st = String(req.query.status || "");
		const list = items.filter((w) => !st || w.status === st).sort((x, y) => y.createdAt - x.createdAt).slice(0, 200);
		res.json({ ok: true, items: list.map((w) => pub(w, true)) });
	}));

	// كشف بيانات الحساب: POST (لا يُخزَّن في اللوقات/الكاش) + يُسجَّل في التدقيق
	app.post("/api/admin/withdrawals/:id/reveal", wrap(async (req, res) => {
		const a = await adminOnly(req, res, true);
		if (!a || !ready(res, true)) return;
		const w = items.find((x) => x.id === req.params.id);
		if (!w) return void fail(res, 404, "not_found");
		audit(a.id, "reveal", w, req);
		res.json({ ok: true, method: w.method, details: JSON.parse(decrypt(key!, w.payload, w.id)) });
	}));

	const transition = (action: "approve" | "reject" | "paid") => wrap(async (req, res) => {
		const a = await adminOnly(req, res, true);
		if (!a || !ready(res, false)) return;
		const w = items.find((x) => x.id === req.params.id);
		if (!w) return void fail(res, 404, "not_found");
		if (w.userId === a.id) return void fail(res, 403, "cannot_review_own_request");
		const body = (req.body || {}) as Record<string, unknown>;
		const now = Date.now();
		if (action === "approve") {
			if (w.status !== "pending") return void fail(res, 409, "invalid_state");
			if (now < w.releaseAt) return void fail(res, 409, "hold_period_active");
			w.status = "approved";
		} else if (action === "reject") {
			const reason = String(body.reason || "").trim().slice(0, 300);
			if (!open(w)) return void fail(res, 409, "invalid_state");
			if (reason.length < 3) return void fail(res, 400, "reason_required");
			w.status = "rejected"; w.reason = reason;
			refund(w);
		} else {
			const ref = String(body.payoutRef || "").trim().slice(0, 120);
			if (w.status !== "approved") return void fail(res, 409, "invalid_state");
			if (ref.length < 3) return void fail(res, 400, "payout_ref_required");
			w.status = "paid"; w.payoutRef = ref; // نهائي — لا رجوع
		}
		w.updatedAt = now;
		w.history.push({ at: now, by: a.id, action, note: action === "reject" ? w.reason : action === "paid" ? w.payoutRef : undefined });
		persist();
		audit(a.id, action, w, req);
		res.json({ ok: true, item: pub(w, true) });
	});
	app.post("/api/admin/withdrawals/:id/approve", transition("approve"));
	app.post("/api/admin/withdrawals/:id/reject", transition("reject"));
	app.post("/api/admin/withdrawals/:id/paid", transition("paid"));
}

/* ───────────────────────── README: الربط في entry.ts ─────────────────────────

1) الاستيراد (خارج بلوك <api-imports> لأنه يُولَّد تلقائياً):
   import { registerWithdrawalRoutes, mapEarningsAdapter, privateAssetsGuard } from "./withdrawals.js";

2) قبل أسطر express.static الخاصة بـ ASSETS_DIR مباشرة (يحجب stooorna-gift-profits.json ومجلد _private):
   for (const p of ["/airo-assets", "/assets", "/uploads", "/media"]) app.use(p, privateAssetsGuard());

3) بعد دالة giftProfitTouch وبعد بلوك </api-registrations>:
   registerWithdrawalRoutes(app, {
     dataDir: process.env.WITHDRAW_DATA_DIR || join(ASSETS_DIR, "_private", "withdrawals"),
     earnings: mapEarningsAdapter(() => giftProfitMem().earnings, () => giftProfitTouch()),
     isAdmin: (u) => OWNER_IDS.has(String(u.username || "").toLowerCase()) || OWNER_IDS.has(String(u.email || "").toLowerCase()),
     getUser: async (req) => { ...نفس طريقة api/users/me/GET لقراءة المستخدم من الجلسة...; return { id, username, email, createdAt } },
   });

4) متغير بيئة (مرة واحدة):  WITHDRAW_ENC_KEY=$(openssl rand -hex 32)
*/
