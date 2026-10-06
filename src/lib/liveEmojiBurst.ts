/**
 * liveEmojiBurst.ts  →  ضعه في:  src/lib/liveEmojiBurst.ts
 *
 * تأثير "تناثر الإيموجي" بأسلوب تيليجرام للإيموجي الكبيرة في الشات العام.
 *  - النقر على إيموجي كبيرة: يشتغل التأثير عندك فوراً + يُرسل حدث للسيرفر.
 *  - بقية المستخدمين يستقبلون الحدث (استطلاع كل ~700ms) فيرون نفس التأثير على نفس الرسالة.
 *  - لا يوجد أي تخزين دائم: الأحداث قصيرة العمر (سيرفر: ذاكرة، آخر 200 حدث).
 */
import { useCallback, useEffect, useRef } from 'react';

const BURST_ENDPOINT = '/api/live-chat/burst';
const MAX_PARTICLES = 70;       // سقف الجزيئات الحية في الشاشة (حماية الأداء)
const SEND_THROTTLE_MS = 220;   // أقصى معدل إرسال للسيرفر من نقرات متتالية
const POLL_MS = 700;

let liveParticles = 0;

/** يشغّل التأثير فوق الشاشة انطلاقاً من مركز (x, y). */
export function playEmojiBurst(emoji: string, x: number, y: number, count = 14) {
  if (typeof document === 'undefined') return;
  const n = Math.min(count, MAX_PARTICLES - liveParticles);
  if (n <= 0) return;
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden;';
  document.body.appendChild(layer);
  let alive = n;
  const done = () => { if (--alive <= 0) layer.remove(); };

  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.textContent = emoji;
    const size = 18 + Math.random() * 26;               // 18–44px
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;font-size:${size}px;line-height:1;will-change:transform,opacity;user-select:none;`;
    layer.appendChild(el);
    // اتجاه عشوائي مع ميل للأعلى (مثل تيليجرام): الزاوية من -160° إلى -20°
    const ang = (-160 + Math.random() * 140) * (Math.PI / 180);
    const dist = 90 + Math.random() * 190;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const rot = (Math.random() - 0.5) * 120;
    const dur = 900 + Math.random() * 700;
    liveParticles++;
    const anim = el.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0px,0px) scale(.2) rotate(0deg)', opacity: 0 },
        { transform: `translate(-50%,-50%) translate(${dx * 0.45}px,${dy * 0.45}px) scale(1.1) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy + 70}px) scale(.8) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    );
    const fin = () => { liveParticles = Math.max(0, liveParticles - 1); done(); };
    anim.onfinish = fin;
    anim.oncancel = fin;
  }
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
  if (el) {
    const r = el.getBoundingClientRect();
    // لو الرسالة خارج الشاشة لا نزعج المستخدم بتأثير عشوائي
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    pulse(el);
    playEmojiBurst(emoji, r.left + r.width / 2, r.top + r.height / 2);
  }
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
        if (cursorRef.current === -1 || last < cursorRef.current) { cursorRef.current = last; return; } // أول مزامنة أو إعادة تشغيل السيرفر: بلا إعادة تشغيل الأحداث القديمة
        for (const ev of d.events || []) {
          cursorRef.current = Math.max(cursorRef.current, ev.seq);
          if (ev.userId === myId) continue;      // أنا شغّلتها محلياً مسبقاً
          playOn(ev.msgId, ev.emoji);
        }
      } catch { /* الشبكة: نحاول في الدورة القادمة */ }
    };
    void pull();
    const id = window.setInterval(pull, POLL_MS);
    return () => { stopped = true; window.clearInterval(id); };
  }, [room, myId, enabled]);

  return useCallback((msgId: string, emoji: string, el?: Element | null) => {
    if (!myId) return;
    playOn(msgId, emoji, el);                     // فوري محلياً
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
