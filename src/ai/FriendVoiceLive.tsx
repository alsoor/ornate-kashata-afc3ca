/**
 * FRIEND-VOICE-LIVE  (ملف مستقل — لا يعدّل StooornaAiSheet.tsx ولا يلغي أي تعديل سابق)
 *
 * بث صوتي مباشر داخل شات الأصدقاء، مربوط بالمايك الأحمر الموجود في شريط الكتابة:
 *  - تضغط المايك الأحمر داخل الشات  => تصير LIVE صوتي (تدخل قناة Agora خاصة بينك وبين صديقك).
 *  - الصديق يشوف مايكه الأحمر يتوهج أخضر + شريط "في بث صوتي"، يضغط عليه => يدخل معك بالصوت (الاثنين يسمعون بعض).
 *  - أثناء البث تطلع ذبذبات (دوائر موجية) حول دائرة المايك تتفاعل مع شدة الصوت.
 *  - تضغط المايك مرة ثانية => تطلع من البث. الخروج من الشات/تغيير الصديق/إغلاق الصفحة => يطلع تلقائياً.
 *  - خارج الشات (قائمة المحادثات) الميزة لا تعمل (friendChatPatch يعرض رسالة "النص فقط").
 *  - GROUP-VOICE: داخل القروب (g:<id>) نفس الشي لكن جماعي: كل الأعضاء بنفس القناة، من يضغط المايك يدخل ويسمع الكل، وأعضاء القروب يشوفون المايك أخضر.
 *
 * الربط: friendChatPatch.tsx يرسم <FriendVoiceLive/> ويرسل الحدث FRIEND_VOICE_TAP_EVENT عند الضغط على المايك داخل شات صديق.
 * الاتصال: نفس طريقة PublicVoiceLive بالضبط (/api/call/token + Agora RTC + /api/room/signal للإشعار).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

export const FRIEND_VOICE_LIVE_VERSION = '1.0.0';
export const FRIEND_VOICE_TAP_EVENT = 'stooorna:friend-voice-tap';

const HEARTBEAT_MS = 4000; // المضيف يرسل "أنا لايف" كل 4 ثواني
const LIVE_TTL_MS = 11000; // إذا انقطعت الإشارة 11 ثانية يعتبر البث انتهى
const POLL_MS = 2000;

interface PersonLite { id: string; name?: string | null; username?: string | null }
interface Props {
  me: PersonLite | null;
  peer: PersonLite | null;
  /** true فقط داخل محادثة صديق مفتوحة */
  active: boolean;
  /** عنصر form شريط الكتابة (آخر زر فيه هو المايك الأحمر) */
  formEl: HTMLElement | null;
  onFlash?: (msg: string) => void;
}

/* ───────── helpers ───────── */
function uidFromString(s: string): number {
  if (!s || s === '0') return 0;
  return Math.abs(s.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0)) % 100_000 || 1;
}

/** اسم قناة ثابت للطرفين (نفس القيمة عند الاثنين) وقصير يناسب حدود Agora (64 بايت) */
export function friendVoiceRoom(a: string, b: string): string {
  const k = [String(a), String(b)].sort().join('|');
  let h1 = 5381; let h2 = 0;
  for (let i = 0; i < k.length; i++) {
    const c = k.charCodeAt(i);
    h1 = ((h1 << 5) + h1) ^ c;
    h2 = c + (h2 << 6) + (h2 << 16) - h2;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `fv_${hex(h1)}${hex(h2)}`;
}

async function fetchToken(channel: string, userId: string) {
  const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`, { credentials: 'include' });
  if (!r.ok) throw new Error('token');
  return r.json() as Promise<{ token: string; uid: number; appId: string }>;
}

/* GROUP-VOICE: القروب معرّفه g:<id> — القناة الصوتية ثابتة لكل أعضاء القروب */
const isGroupPeer = (id?: string | null): boolean => !!id && id.startsWith('g:');
const roomFor = (meId: string, peerId: string): string => (isGroupPeer(peerId) ? friendVoiceRoom('group', peerId) : friendVoiceRoom(meId, peerId));

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/* ───────── component ───────── */
export default function FriendVoiceLive({ me, peer, active, formEl, onFlash }: Props) {
  const [live, setLive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [peerIn, setPeerIn] = useState(false);     // الصديق داخل القناة الآن
  const [peerLive, setPeerLive] = useState(false); // الصديق بدأ بث وأنا مو داخل (دعوة)
  const [count, setCount] = useState(0);          // GROUP-VOICE: عدد اللي معي بالقناة
  const [liveName, setLiveName] = useState('');    // GROUP-VOICE: اسم العضو اللي بدأ البث
  const liveNameRef = useRef('');
  const [level, setLevel] = useState(0);
  const [secs, setSecs] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const meRef = useRef(me); meRef.current = me;
  const peerRef = useRef(peer); peerRef.current = peer;
  const flashRef = useRef(onFlash); flashRef.current = onFlash;
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteRef = useRef<Map<number, any>>(new Map());
  const sessionRef = useRef<{ room: string; meId: string; peerId: string; meName: string } | null>(null);
  const hbRef = useRef(0);
  const peerUntilRef = useRef(0);

  /* إشارة "أنا لايف / أنهيت" للصديق (نفس /api/room/signal الذي يستخدمه البث العام) */
  const signal = useCallback(async (on: boolean) => {
    const s = sessionRef.current; if (!s) return;
    try {
      await fetch('/api/room/signal', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: s.room, t: 'fv', data: { t: 'fv', from: s.meId, to: s.peerId, name: s.meName, on } }),
      });
    } catch { /* */ }
  }, []);

  /* خروج كامل من البث */
  const stop = useCallback(async () => {
    if (hbRef.current) { window.clearInterval(hbRef.current); hbRef.current = 0; }
    const wasLive = liveRef.current;
    liveRef.current = false;
    setLive(false); setPeerIn(false); setCount(0); setLevel(0); setSecs(0);
    if (wasLive) await signal(false);
    try { micRef.current?.stop(); micRef.current?.close(); } catch { /* */ }
    micRef.current = null;
    remoteRef.current.forEach(t => { try { t.stop(); } catch { /* */ } });
    remoteRef.current.clear();
    const c = clientRef.current; clientRef.current = null;
    try { c?.removeAllListeners(); } catch { /* */ }
    try { await c?.leave(); } catch { /* */ }
    sessionRef.current = null;
  }, [signal]);
  const stopRef = useRef(stop); stopRef.current = stop;

  /* دخول البث (مضيف أو منضم — نفس الشي: قناة صوتية خاصة بين الاثنين) */
  const start = useCallback(async () => {
    const m = meRef.current; const p = peerRef.current;
    if (!m || !p || busyRef.current || liveRef.current) return;
    busyRef.current = true; setConnecting(true);
    const room = roomFor(m.id, p.id); // GROUP-VOICE
    sessionRef.current = { room, meId: m.id, peerId: p.id, meName: String(m.username || m.name || '') };
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3);
      const { token, uid, appId } = await fetchToken(room, m.id);
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (ru: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType !== 'audio') return;
        try {
          await client.subscribe(ru, 'audio');
          const t = ru.audioTrack;
          if (t) { remoteRef.current.set(ru.uid as number, t); t.play(); }
        } catch { /* */ }
      });
      client.on('user-unpublished', (ru: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType === 'audio') { ru.audioTrack?.stop(); remoteRef.current.delete(ru.uid as number); }
      });
      client.on('user-joined', () => { setPeerIn(true); setCount(Math.max(1, client.remoteUsers.length)); });
      client.on('user-left', (ru: IAgoraRTCRemoteUser) => {
        ru.audioTrack?.stop(); remoteRef.current.delete(ru.uid as number);
        setPeerIn(client.remoteUsers.length > 0); setCount(client.remoteUsers.length);
      });

      await client.join(appId, room, token, uid || uidFromString(m.id));
      const mic = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: { sampleRate: 48000, stereo: false, bitrate: 48 },
        AEC: true, ANS: true, AGC: true,
      });
      micRef.current = mic;
      await client.publish([mic]);

      // لو الصديق سبقني بالدخول: اسمع صوته مباشرة
      for (const ru of client.remoteUsers) {
        if (ru.hasAudio) {
          try { await client.subscribe(ru, 'audio'); if (ru.audioTrack) { remoteRef.current.set(ru.uid as number, ru.audioTrack); ru.audioTrack.play(); } } catch { /* */ }
        }
      }
      setPeerIn(client.remoteUsers.length > 0); setCount(client.remoteUsers.length);

      liveRef.current = true; setLive(true); setPeerLive(false); peerUntilRef.current = 0;
      void signal(true);
      hbRef.current = window.setInterval(() => { void signal(true); }, HEARTBEAT_MS);
    } catch {
      flashRef.current?.('تعذر بدء البث الصوتي — تأكد من إذن المايك والاتصال');
      liveRef.current = false;
      await stopRef.current();
    } finally {
      busyRef.current = false; setConnecting(false);
    }
  }, [signal]);
  const startRef = useRef(start); startRef.current = start;

  /* 1) الضغط على المايك الأحمر داخل شات صديق: يدخل / يطلع */
  useEffect(() => {
    if (!active) return;
    const onTap = () => { if (liveRef.current) void stopRef.current(); else void startRef.current(); };
    window.addEventListener(FRIEND_VOICE_TAP_EVENT, onTap);
    return () => window.removeEventListener(FRIEND_VOICE_TAP_EVENT, onTap);
  }, [active]);

  /* 2) خروج الشات / تغيير الصديق / إغلاق الصفحة => يطلع من البث تلقائياً */
  useEffect(() => {
    if (!active) return;
    // حمّل SDK مسبقاً حتى يبدأ البث بسرعة داخل لمسة المستخدم
    void import('agora-rtc-sdk-ng').catch(() => {});
    const onUnload = () => { void stopRef.current(); };
    window.addEventListener('pagehide', onUnload);
    return () => { window.removeEventListener('pagehide', onUnload); void stopRef.current(); setPeerLive(false); peerUntilRef.current = 0; };
  }, [active, peer?.id, me?.id]);

  /* 3) الصديق بدأ بث؟ (يجعل مايكي يتوهج أخضر = دعوة) */
  useEffect(() => {
    if (!active || !me || !peer) return;
    let alive = true;
    const room = roomFor(me.id, peer.id); // GROUP-VOICE
    const grp = isGroupPeer(peer.id);
    const members = new Map<string, number>(); // GROUP-VOICE: عضو -> وقت انتهاء إشارة البث
    let since = Date.now() - 6000;
    const pull = async () => {
      try {
        const r = await fetch(`/api/room/signal?roomId=${encodeURIComponent(room)}&since=${since}`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          const items = (d.signals || d.messages || d.items || []) as any[];
          for (const raw of items) {
            const at = Number(raw?.at || 0);
            if (at > since) since = at;
            const msg = raw?.payload || raw?.data || raw;
            if (msg?.t !== 'fv') continue;
            if (grp) { // GROUP-VOICE: أي عضو (غيري) يبدأ بث => القروب كله ينادى
              const from = String(msg.from);
              if (from === String(me.id)) continue;
              if (msg.on) { members.set(from, Date.now() + LIVE_TTL_MS); if (msg.name) liveNameRef.current = String(msg.name); }
              else members.delete(from);
              continue;
            }
            if (String(msg.from) !== String(peer.id)) continue;
            peerUntilRef.current = msg.on ? Date.now() + LIVE_TTL_MS : 0;
          }
        }
      } catch { /* */ }
      if (grp) { // GROUP-VOICE
        let until = 0;
        members.forEach((u, k) => { if (u > Date.now()) until = Math.max(until, u); else members.delete(k); });
        peerUntilRef.current = until;
        if (alive) setLiveName(liveNameRef.current);
      }
      if (alive) setPeerLive(!liveRef.current && Date.now() < peerUntilRef.current);
    };
    void pull();
    const t = window.setInterval(pull, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [active, me?.id, peer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 4) شدة الصوت (للذبذبات) + عداد الوقت */
  useEffect(() => {
    if (!live) return;
    const t0 = Date.now();
    const a = window.setInterval(() => {
      let v = 0;
      try { v = Math.max(v, micRef.current?.getVolumeLevel() || 0); } catch { /* */ }
      remoteRef.current.forEach(t => { try { v = Math.max(v, t.getVolumeLevel?.() || 0); } catch { /* */ } });
      setLevel(prev => (Math.abs(prev - v) < 0.02 ? prev : v));
    }, 90);
    const b = window.setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, [live]);

  /* 5) مكان المايك الأحمر على الشاشة (آخر زر داخل شريط الكتابة) */
  const show = active && (live || connecting || peerLive);
  useEffect(() => {
    if (!show || !formEl) { setRect(null); return; }
    let raf = 0;
    const tick = () => {
      const btns = formEl.querySelectorAll('button');
      const b = btns[btns.length - 1] as HTMLElement | undefined;
      if (b) {
        const r = b.getBoundingClientRect();
        if (r.width > 0) setRect(p => (p && Math.abs(p.x - r.left) < 0.5 && Math.abs(p.y - r.top) < 0.5 && Math.abs(p.w - r.width) < 0.5 ? p : { x: r.left, y: r.top, w: r.width, h: r.height }));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [show, formEl]);

  if (!show || !rect) return null;

  const accent = live || connecting ? '#ef4444' : '#22c55e';
  const isGrp = isGroupPeer(peer?.id);
  const label = connecting
    ? 'جاري الاتصال…'
    : live
      ? (isGrp
        ? (peerIn ? `LIVE · ${mmss(secs)} · ${Math.max(1, count)} معك` : `LIVE · ${mmss(secs)} · بانتظار أعضاء القروب`)
        : (peerIn ? `LIVE · ${mmss(secs)} · ${peer?.name || ''} معك` : `LIVE · ${mmss(secs)} · بانتظار ${peer?.name || 'صديقك'}`))
      : (isGrp
        ? `${liveName || 'عضو'} بدأ بث صوتي في ${peer?.name || 'القروب'} — اضغط المايك للدخول`
        : `${peer?.name || 'صديقك'} في بث صوتي — اضغط المايك للدخول`);
  const amp = 1 + Math.min(1, level * 3) * 0.9;

  return createPortal(
    <>
      <style>{`
        @keyframes fvRipple { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(2.7); opacity: 0; } }
        @keyframes fvBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>

      {/* ذبذبات حول دائرة المايك */}
      <div aria-hidden="true" style={{ position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: 2147482000, pointerEvents: 'none' }}>
        {[0, 0.53, 1.06].map(d => (
          <span key={d} style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: accent, opacity: 0, animation: `fvRipple ${connecting ? 1.1 : 1.6}s ease-out ${d}s infinite` }} />
        ))}
        {/* حلقة تتفاعل مع شدة الصوت */}
        <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${accent}`, boxShadow: `0 0 ${8 + level * 40}px ${accent}`, transform: `scale(${live ? amp : 1})`, transition: 'transform 90ms linear, box-shadow 90ms linear', opacity: live ? 0.95 : 0.7 }} />
      </div>

      {/* شريط الحالة فوق المايك */}
      <div
        aria-hidden="true"
        dir="auto"
        style={{
          position: 'fixed', right: Math.max(8, window.innerWidth - (rect.x + rect.w)), bottom: window.innerHeight - rect.y + 12, zIndex: 2147482000, pointerEvents: 'none',
          maxWidth: 'calc(100vw - 16px)', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
          background: 'rgba(10,31,26,0.94)', color: '#fff', fontSize: 12.5, fontWeight: 700, boxShadow: '0 6px 18px rgba(0,0,0,0.28)', border: `1px solid ${accent}`,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0, animation: 'fvBlink 1.1s ease-in-out infinite' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
    </>,
    document.body,
  );
}
