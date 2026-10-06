/**
 * liveEmojiBurst.ts  →  ضعه في:  src/lib/liveEmojiBurst.ts
 *
 * تأثير "تناثر الإيموجي" بأسلوب تيليجرام للإيموجي الكبيرة في الشات العام.
 *  - النقر على إيموجي كبيرة: يشتغل التأثير عندك فوراً + يُرسل حدث للسيرفر.
 *  - بقية المستخدمين يستقبلون الحدث (استطلاع كل ~700ms) فيرون نفس التأثير على نفس الرسالة.
 *
 * v2 — محرك Canvas واحد (بدل مئات عناصر DOM) لمنع انهيار الصفحة "Aw, Snap!" مع النقر المتواصل:
 *  • طبقة Canvas واحدة فقط، تُحذف تلقائياً عند انتهاء الجزيئات (لا تستهلك ذاكرة وهي خاملة).
 *  • سقف ثابت للجزيئات الحية + إيموجي مرسومة مسبقاً كصور صغيرة (sprites).
 *  • فيزياء حقيقية: قوة دفع للأعلى + جاذبية + احتكاك هواء، تنتشر على عرض الشاشة وتغطي نصف الشات،
 *    ثم تسقط وترتطم بشريط أزرار الشات وتستقر عليه قليلاً قبل أن تتلاشى.
 */
import { useCallback, useEffect, useRef } from 'react';

const BURST_ENDPOINT = '/api/live-chat/burst';
const MAX_PARTICLES = 260;      // سقف الجزيئات الحية (حماية الذاكرة/الأداء)
const DEFAULT_COUNT = 44;       // جزيئات لكل نقرة
const SEND_THROTTLE_MS = 220;   // أقصى معدل إرسال للسيرفر من نقرات متتالية
const POLL_MS = 700;
const MAX_REMOTE_EVENTS = 4;    // لو تراكمت أحداث (رجوع من الخلفية) نشغّل آخر 4 فقط
const DRAG = 0.55;              // احتكاك الهواء الأفقي (1/ثانية)
const SPRITE_PX = 64;

type Particle = {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number;
  age: number; maxAge: number;
  sprite: HTMLCanvasElement;
  bounces: number; settledAt: number;   // -1 = لم تستقر بعد
};

/* ───────────── حالة المحرك (وحدة واحدة مشتركة) ───────────── */
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let rafId = 0;
let lastT = 0;
let W = 0, H = 0, DPR = 1;
let GRAVITY = 1600;
let FLOOR = 0;
const spriteCache = new Map<string, HTMLCanvasElement>();

function getSprite(emoji: string): HTMLCanvasElement {
  const hit = spriteCache.get(emoji);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE_PX;
  const g = c.getContext('2d');
  if (g) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(SPRITE_PX * 0.82)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
    g.fillText(emoji, SPRITE_PX / 2, SPRITE_PX / 2 + 2);
  }
  if (spriteCache.size > 40) spriteCache.clear();
  spriteCache.set(emoji, c);
  return c;
}

/** سطح الهبوط = أعلى أزرار الشات (شريط الإيموجي). يفضّل data-live-emoji-bar، وإلا نقدّره من خانة الكتابة. */
function computeFloor(): number {
  try {
    const bar = document.querySelector('[data-live-emoji-bar]') as HTMLElement | null;
    if (bar) {
      const r = bar.getBoundingClientRect();
      if (r.height > 0 && r.top > 0) return r.top + 6;
    }
    // احتياط: أقل خانة تعليق ظاهرة على الشاشة (تجاهل الخانات المخفية)
    const inputs = Array.from(document.querySelectorAll('input[placeholder*="Comment"],textarea[placeholder*="Comment"]')) as HTMLElement[];
    let best = -1;
    for (const el of inputs) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top > 0 && r.top > best) best = r.top;
    }
    if (best > 0) return Math.max(H * 0.5, best - 58);
  } catch { /* */ }
  return H * 0.86;
}

function ensureCanvas() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }
  if (W !== w || H !== h || DPR !== dpr || canvas.width !== Math.round(w * dpr)) {
    W = w; H = h; DPR = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  GRAVITY = H * 2.1;
  FLOOR = computeFloor();
}

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0; lastT = 0; particles = [];
  if (canvas) { canvas.remove(); }
  canvas = null; ctx = null;
}

function frame(t: number) {
  rafId = requestAnimationFrame(frame);
  if (!ctx || !canvas) return;
  const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
  lastT = t;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const alive: Particle[] = [];
  for (const p of particles) {
    p.age += dt;
    if (p.settledAt < 0) {
      p.vy += GRAVITY * dt;
      p.vx *= Math.max(0, 1 - DRAG * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      // ارتطام بأزرار الشات: ارتداد خفيف ثم استقرار
      if (p.vy > 0 && p.y >= FLOOR && p.y < FLOOR + 40 && p.x > -20 && p.x < W + 20) {
        p.y = FLOOR;
        if (p.bounces >= 2 || Math.abs(p.vy) < H * 0.25) {
          p.settledAt = p.age; p.vy = 0;
        } else {
          p.vy = -p.vy * 0.4;
          p.vx *= 0.65;
          p.vr *= 0.5;
          p.bounces++;
        }
      }
    } else {
      // مستقرة على الأزرار: انزلاق بسيط ثم تلاشٍ
      p.x += p.vx * dt * 0.25;
      p.vx *= Math.max(0, 1 - 4 * dt);
      p.vr *= Math.max(0, 1 - 6 * dt);
      p.rot += p.vr * dt;
    }

    let alpha = Math.min(1, p.age / 0.06);
    if (p.settledAt >= 0) alpha *= Math.max(0, 1 - (p.age - p.settledAt) / 0.7);
    else if (p.age > p.maxAge - 0.5) alpha *= Math.max(0, (p.maxAge - p.age) / 0.5);

    if (alpha <= 0.01 || p.age > p.maxAge || p.y > H + 80 || p.x < -120 || p.x > W + 120) continue;
    alive.push(p);

    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  particles = alive;
  if (!particles.length) teardown();
}

/** يشغّل التأثير فوق الشاشة انطلاقاً من مركز (x, y). */
export function playEmojiBurst(emoji: string, x: number, y: number, count = DEFAULT_COUNT) {
  if (typeof document === 'undefined') return;
  const n = Math.min(count, MAX_PARTICLES - particles.length);
  if (n <= 0) return;
  ensureCanvas();
  const sprite = getSprite(emoji);
  const startsBelowFloor = y >= FLOOR;
  for (let i = 0; i < n; i++) {
    // ارتفاع الذروة: من 12% إلى 60% من الشاشة → يغطي نصف الشات تقريباً
    const apex = H * (0.12 + Math.random() * 0.48);
    const vy = -Math.sqrt(2 * GRAVITY * apex);
    // انتشار أفقي على عرض الشاشة كله
    const vx = (Math.random() * 2 - 1) * W * 0.95;
    particles.push({
      x: x + (Math.random() - 0.5) * 24,
      y: y + (Math.random() - 0.5) * 16,
      vx, vy,
      rot: (Math.random() - 0.5) * 1.2,
      vr: (Math.random() - 0.5) * 9,
      size: 22 + Math.random() * 38,
      age: 0,
      maxAge: 3.4,
      sprite,
      bounces: startsBelowFloor ? 2 : 0,
      settledAt: -1,
    });
  }
  if (!rafId) { lastT = 0; rafId = requestAnimationFrame(frame); }
}

/** نبضة تكبير سريعة على الإيموجي المنقورة نفسها. */
function pulse(el: Element | null) {
  if (!el) return;
  try {
    (el as HTMLElement).animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  } catch { /* old webview */ }
}

function findMsgEl(msgId: string): HTMLElement | null {
  try { return document.querySelector(`[data-live-big-emoji="${CSS.escape(msgId)}"]`) as HTMLElement | null; } catch { return null; }
}

function playOn(msgId: string, emoji: string, direct?: Element | null) {
  const el = (direct as HTMLElement | null) || findMsgEl(msgId);
  if (!el) return;
  const r = el.getBoundingClientRect();
  // لو الرسالة خارج الشاشة لا نزعج المستخدم بتأثير عشوائي
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  pulse(el);
  playEmojiBurst(emoji, r.left + r.width / 2, r.top + r.height / 2);
}

/**
 * الاستخدام داخل PublicLiveCommentsPanel:
 *   const burst = useLiveEmojiBurstSync(LIVE_CHAT_ROOM, myId, chatLift === 1);
 *   ...
 *   onClick={e => { e.stopPropagation(); burst(c.id, stripLiveBigEmojiMark(c.text), e.currentTarget); }}
 */
export function useLiveEmojiBurstSync(room: string, myId: string | undefined | null, enabled: boolean) {
  const cursorRef = useRef<number>(-1);          // آخر seq رأيناه (-1 = لم نتزامن بعد)
  const lastSendRef = useRef(0);

  useEffect(() => {
    if (!enabled || !myId) return;
    let stopped = false;
    const pull = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const r = await fetch(`${BURST_ENDPOINT}?room=${encodeURIComponent(room)}&after=${cursorRef.current}`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok || stopped) return;
        const d = await r.json() as { last?: number; events?: Array<{ seq: number; msgId: string; emoji: string; userId: string }> };
        const last = Number(d.last ?? 0);
        if (cursorRef.current === -1 || last < cursorRef.current) { cursorRef.current = last; return; } // أول مزامنة أو إعادة تشغيل السيرفر
        const evs = d.events || [];
        for (const ev of evs) cursorRef.current = Math.max(cursorRef.current, ev.seq);
        for (const ev of evs.filter(e => e.userId !== myId).slice(-MAX_REMOTE_EVENTS)) playOn(ev.msgId, ev.emoji);
      } catch { /* الشبكة: نحاول في الدورة القادمة */ }
    };
    void pull();
    const id = window.setInterval(pull, POLL_MS);
    return () => { stopped = true; window.clearInterval(id); };
  }, [room, myId, enabled]);

  // تنظيف الطبقة إن خرج المستخدم من الشات أثناء التأثير
  useEffect(() => () => { if (particles.length === 0) teardown(); }, []);

  return useCallback((msgId: string, emoji: string, el?: Element | null) => {
    if (!myId) return;
    playOn(msgId, emoji, el);                     // فوري محلياً
    try { navigator.vibrate?.(8); } catch { /* */ }
    const now = Date.now();
    if (now - lastSendRef.current < SEND_THROTTLE_MS) return;
    lastSendRef.current = now;
    void fetch(BURST_ENDPOINT, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, msgId, emoji, userId: myId }),
    }).catch(() => { /* تأثير لحظي فقط: لا إعادة محاولة */ });
  }, [room, myId]);
}
