/**
 * lib/callPatch.tsx — ملف مستقل للمكالمات (مشغول / انتظار المكالمة / تعليق / دمج).
 *
 * يرتبط بـ RootLayout.tsx بنقاط صغيرة فقط، ولا يعدّل منطق المكالمة الأساسي:
 *   - setCallBridge(...)                 : RootLayout يعطي هذا الملف "جسر" لقراءة حالة المكالمة الحالية والتحكم فيها
 *   - callPatchBegin(...)                : قبل إرسال أي دعوة (يفحص مشغول/انتظار على السيرفر)
 *   - callPatchAnswer / callPatchEnd     : عند الرد / الرفض / الإنهاء
 *   - callPatchOnIncomingWhileBusy(...)  : عند وصول اتصال وأنا مشغول (بدل ما يتجاهله RootLayout بصمت)
 *   - callPatchConsumeSignal(...)        : إشارات WebSocket الخاصة بالانتظار (قبل المعالجة القديمة)
 *   - <CallPatchUI />                    : يُركَّب مرة واحدة (شريط الانتظار + التنبيهات + شريط المكالمة الثانية)
 *   - <CallWaitingToggle />              : زر "انتظار المكالمة" داخل سجل المكالمات
 *
 * المكالمة الثانية تعمل بعميل Agora مستقل داخل هذا الملف، فلا تتداخل مع حالة RootLayout.
 */
import React, { useEffect, useSyncExternalStore } from 'react';
import { Phone, PhoneOff, Users, Repeat } from 'lucide-react';

// ───────────────────────────── الأنواع ─────────────────────────────
export type CallPhase = 'idle' | 'animating' | 'connecting' | 'live';
export type CallPeer = { id: string; name: string | null; avatarUrl: string | null };
export type WaitingInvite = {
  channel: string;
  hostId: string;
  hostName: string | null;
  hostAvatar: string | null;
  hostUsername?: string | null;
  video?: boolean;
  members?: unknown[];
  at?: number;
};
export type CallBridge = {
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  phase: () => CallPhase;
  channel: () => string | null;
  members: () => CallPeer[];
  /** يرسل عبر WebSocket القديم (call-signaling-ws) */
  sendSignal: (msg: Record<string, unknown>) => boolean;
  /** تعليق/استئناف المكالمة الحالية (يكتم المايك وصوت الطرف الآخر فقط — بدون ما يغادر القناة) */
  holdCurrent: (on: boolean) => void;
  /** إلغاء اتصال صادر (مثلاً لما يرجع "مشغول") */
  cancelOutgoing: () => void;
  /** ترك المكالمة الحالية بهدوء والانضمام لقناة جديدة كأني رددت عليها (للدمج) */
  joinChannelAsAnswer: (invite: WaitingInvite) => Promise<void>;
  /** تسجيل مكالمة فائتة في السجل */
  logMissed: (invite: WaitingInvite) => void;
};

type SecondCall = { channel: string; peer: CallPeer; activeIsSecond: boolean; startedAt: number };
type Toast = { id: number; text: string; kind: 'busy' | 'info' };
type StoreState = { waiting: WaitingInvite | null; second: SecondCall | null; toast: Toast | null };

const AGORA_APP_ID_FALLBACK = '149ef04e839c4132a08efb49d717c436';
const WAITING_EXPIRE_MS = 12_000; // لو الدعوة ما تجددت (المتصل قفل) نخفي الشريط

// ───────────────────────────── المخزن (Store) ─────────────────────────────
let state: StoreState = { waiting: null, second: null, toast: null };
const subs = new Set<() => void>();
const setState = (patch: Partial<StoreState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => { subs.delete(f); };
};
const getState = () => state;

let bridge: CallBridge | null = null;
export function setCallBridge(b: CallBridge | null) { bridge = b; }

// موارد غير قابلة للتخزين في الـ state
const sec: { client: any; mic: any; hb: number | null; poll: number | null; token: number } = { client: null, mic: null, hb: null, poll: null, token: 0 };
let waitingSeenAt = 0;
let waitingExpireTimer: number | null = null;
let ringTimer: number | null = null;
let toastTimer: number | null = null;
const declinedWaiting = new Map<string, number>();
const busyRepliedAt = new Map<string, number>();
const seenSignalIds = new Set<string>();

// ───────────────────────────── شبكة ─────────────────────────────
async function post(path: string, body: Record<string, unknown>, keepalive = false): Promise<any | null> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

// ───────────────────────────── زر انتظار المكالمة (الإعداد) ─────────────────────────────
const waitKey = (uid: string) => `stooorna_call_waiting_${uid || 'guest'}`;
const WAIT_EVT = 'stooorna:call-waiting-setting';
export function getCallWaiting(uid: string): boolean {
  try { return localStorage.getItem(waitKey(uid)) === '1'; } catch { return false; }
}
export function setCallWaiting(uid: string, on: boolean) {
  try { localStorage.setItem(waitKey(uid), on ? '1' : '0'); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(WAIT_EVT, { detail: { uid, on } })); } catch { /* */ }
  void post('/api/call/waiting', { enabled: on });
}
export function useCallWaiting(uid: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(WAIT_EVT, cb);
      window.addEventListener('storage', cb);
      return () => { window.removeEventListener(WAIT_EVT, cb); window.removeEventListener('storage', cb); };
    },
    () => getCallWaiting(uid),
    () => false,
  );
}

// ───────────────────────────── صوت وتنبيهات ─────────────────────────────
function beeps(freqs: number[], gap = 0.22, dur = 0.16, vol = 0.18) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.value = vol;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * gap);
      o.stop(ctx.currentTime + i * gap + dur);
    });
    window.setTimeout(() => { try { void ctx.close(); } catch { /* */ } }, freqs.length * gap * 1000 + 400);
  } catch { /* */ }
}
function startWaitingRing() {
  stopWaitingRing();
  const once = () => {
    beeps([880, 880], 0.28, 0.18, 0.2);
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
  };
  once();
  ringTimer = window.setInterval(once, 3000);
}
function stopWaitingRing() {
  if (ringTimer) { window.clearInterval(ringTimer); ringTimer = null; }
}
export function announceBusy(text: string, kind: Toast['kind'] = 'busy') {
  if (kind === 'busy') {
    beeps([425, 0, 425, 0, 425], 0.22, 0.16, 0.16);
    try { navigator.vibrate?.([120, 80, 120]); } catch { /* */ }
  }
  const id = Date.now();
  setState({ toast: { id, text, kind } });
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { if (state.toast?.id === id) setState({ toast: null }); }, 3800);
}

// ───────────────────────────── صوت المكالمة (فشل صامت / autoplay) ─────────────────────────────
const watchedClients = new Set<any>();
const connectedOnce = new WeakSet<object>();
let watchTimer: number | null = null;
let unlockBound = false;
function replayRemoteAudio() {
  for (const c of Array.from(watchedClients)) {
    try {
      const st = c?.connectionState;
      if (st === 'CONNECTED') connectedOnce.add(c);
      if (st === 'DISCONNECTED' && connectedOnce.has(c)) { watchedClients.delete(c); continue; }
      for (const ru of c?.remoteUsers || []) {
        const t = ru?.audioTrack;
        if (t && t.isPlaying === false) { try { t.play(); } catch { /* */ } }
      }
    } catch { /* */ }
  }
  if (!watchedClients.size && watchTimer) { window.clearInterval(watchTimer); watchTimer = null; }
}
/** يراقب عميل Agora للمكالمة: لو المتصفح منع تشغيل الصوت تلقائياً يعيد تشغيله عند أول لمسة وكل ثانيتين. */
export function callPatchWatchAudio(client: any) {
  if (!client) return;
  watchedClients.add(client);
  if (!watchTimer) watchTimer = window.setInterval(replayRemoteAudio, 2000);
  if (!unlockBound) {
    unlockBound = true;
    for (const ev of ['pointerdown', 'touchstart', 'click', 'keydown']) window.addEventListener(ev, replayRemoteAudio, { passive: true });
  }
}
/** فشل اتصال الصوت كان يُبلع بصمت (المؤقت يشتغل بدون صوت). الآن: سجل + تنبيه واضح. */
export function callPatchAgoraFailed(stage: 'microphone' | 'token' | 'join' | string, err: unknown) {
  try { console.error('[call-audio] failed at', stage, err); } catch { /* */ }
  const text =
    stage === 'microphone' ? 'Microphone blocked — allow mic permission to speak'
    : stage === 'token' ? 'Call audio server error — try calling again'
    : 'Call audio failed to connect — try calling again';
  announceBusy(text, 'info');
}

// ───────────────────────────── ربط السيرفر ─────────────────────────────
export async function callPatchBegin(opts: { toUserIds: string[]; channel: string; clientIdle: boolean }): Promise<{ selfBusy: boolean; busy: string[]; waiting: string[] }> {
  const d = await post('/api/call/begin', { toUserIds: opts.toUserIds, channel: opts.channel, clientIdle: opts.clientIdle });
  // لو السيرفر ما رد: لا نمنع المكالمة (نفتح الخط) — الحماية الاحتياطية تشتغل عند المستقبِل
  if (!d || d.ok !== true) return { selfBusy: false, busy: [], waiting: [] };
  const results = (d.results || {}) as Record<string, string>;
  return {
    selfBusy: !!d.selfBusy,
    busy: Object.keys(results).filter((k) => results[k] === 'busy'),
    waiting: Object.keys(results).filter((k) => results[k] === 'waiting'),
  };
}
export function callPatchAnswer(channel: string) {
  const uid = bridge?.userId || '';
  return post('/api/call/answer', { channel, waitingEnabled: uid ? getCallWaiting(uid) : undefined }, true);
}
export function callPatchEnd(channel: string | null | undefined) {
  if (!channel) return Promise.resolve(null);
  return post('/api/call/end', { channel }, true);
}

// ───────────────────────────── إشارات ─────────────────────────────
function sendBoth(to: string, type: string, extra: Record<string, unknown>) {
  const b = bridge;
  if (!b || !to) return;
  const id = `${type}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try { b.sendSignal({ type, to, from: b.userId, fromName: b.userName, fromAvatar: b.userAvatar, id, at: Date.now(), ...extra }); } catch { /* */ }
  void post('/api/call/signal', { to, type, id, payload: { from: b.userId, fromName: b.userName, fromAvatar: b.userAvatar, ...extra } });
}
function notifyHold(on: boolean, peers?: CallPeer[]) {
  const b = bridge;
  if (!b) return;
  const list = peers ?? b.members().filter((m) => m.id !== b.userId);
  for (const p of list) sendBoth(p.id, 'hold', { on, channel: b.channel() || '' });
}

// ───────────────────────────── اتصال وصل وأنا مشغول ─────────────────────────────
export function callPatchOnIncomingWhileBusy(invite: WaitingInvite): void {
  const b = bridge;
  if (!b || !invite?.channel || !invite.hostId) return;
  const ch = String(invite.channel);
  if (ch === b.channel()) return; // نفس المكالمة (نبض/تذكير)
  // نبض الدعوة يستمر عند المتصل حتى يصله الرد — لو المتصل هو نفس الشخص الذي أنا داخل مكالمة معه الآن فهذا ليس اتصالاً ثانياً:
  // نتجاهله (قبل: كان يُرسل "مشغول" بالغلط فيقطع المتصل المكالمة بعد ما رددت)
  if (b.members().some((m) => m.id === invite.hostId)) return;
  if (state.second?.channel === ch) return;
  const declinedAt = declinedWaiting.get(ch);
  if (declinedAt && Date.now() - declinedAt < 60_000) return;

  if (state.waiting?.channel === ch) { waitingSeenAt = Date.now(); return; } // نفس الاتصال المنتظر: جدّد فقط

  // connecting/animating = المستخدم مشغول أصلاً (يرن أو يتصل) — انتظار المكالمة لازم يشتغل هنا مو بس بعد live
  const phase = b.phase();
  const inCall = phase === 'live' || phase === 'connecting' || phase === 'animating' || !!state.second;
  const canWait = inCall && !state.second && !state.waiting && getCallWaiting(b.userId);
  if (canWait) {
    waitingSeenAt = Date.now();
    setState({ waiting: { ...invite, channel: ch } });
    startWaitingRing();
    if (waitingExpireTimer) window.clearInterval(waitingExpireTimer);
    waitingExpireTimer = window.setInterval(() => {
      if (!state.waiting) { if (waitingExpireTimer) window.clearInterval(waitingExpireTimer); waitingExpireTimer = null; return; }
      if (Date.now() - waitingSeenAt > WAITING_EXPIRE_MS) dismissWaiting('missed');
    }, 1000);
    return;
  }

  // مشغول: نرد على المتصل (احتياط — السيرفر عادةً يمنع الدعوة أصلاً)
  const last = busyRepliedAt.get(ch) || 0;
  if (Date.now() - last < 4000) return;
  busyRepliedAt.set(ch, Date.now());
  sendBoth(invite.hostId, 'busy', { channel: ch });
}

function dismissWaiting(reason: 'missed' | 'declined' | 'handled') {
  const w = state.waiting;
  stopWaitingRing();
  if (waitingExpireTimer) { window.clearInterval(waitingExpireTimer); waitingExpireTimer = null; }
  if (!w) return;
  setState({ waiting: null });
  if (reason === 'missed') {
    try { bridge?.logMissed(w); } catch { /* */ }
    void callPatchEnd(w.channel);
  }
}

// ───────────────────────────── أزرار شريط الانتظار ─────────────────────────────
export function declineWaiting() {
  const w = state.waiting;
  const b = bridge;
  if (!w || !b) return;
  declinedWaiting.set(w.channel, Date.now());
  dismissWaiting('handled');
  void callPatchEnd(w.channel);
  const ts = Date.now();
  try { b.sendSignal({ type: 'hangup', to: w.hostId, from: b.userId, channel: w.channel, at: ts, reason: 'declined' }); } catch { /* */ }
  void post('/api/call/invite/clear', { userId: b.userId, channel: w.channel }, true);
  try { b.logMissed(w); } catch { /* */ }
}

/** رد + تعليق المكالمة الحالية */
export async function answerWaitingAndHold() {
  const w = state.waiting;
  const b = bridge;
  if (!w || !b) return;
  dismissWaiting('handled');
  b.holdCurrent(true);
  notifyHold(true);
  void callPatchAnswer(w.channel);
  await startSecond(w);
}

async function startSecond(w: WaitingInvite) {
  const b = bridge;
  if (!b) return;
  const uid = b.userId;
  const ch = w.channel;
  const token = ++sec.token;
  const peer: CallPeer = { id: w.hostId, name: w.hostName, avatarUrl: w.hostAvatar };
  setState({ second: { channel: ch, peer, activeIsSecond: true, startedAt: Date.now() } });

  // يعرّف المتصل إني رديت (نفس الإشارات اللي يستخدمها الرد العادي)
  const ts = Date.now();
  try { b.sendSignal({ type: 'answered', to: w.hostId, from: uid, channel: ch, at: ts }); } catch { /* */ }
  void post('/api/call/invite', { toUserId: w.hostId, channel: ch, kind: 'voice', hostId: w.hostId, answered: true, at: ts }, true);
  void post('/api/call/invite/clear', { userId: uid, channel: ch }, true);
  void post('/api/room/join', { roomId: ch, userId: uid, name: b.userName || 'User' }, true);

  if (sec.hb) window.clearInterval(sec.hb);
  sec.hb = window.setInterval(() => {
    void post('/api/room/heartbeat', { roomId: ch, userId: uid });
  }, 4000);
  if (sec.poll) window.clearInterval(sec.poll);
  sec.poll = window.setInterval(() => { void pollSecond(); }, 1500);

  try {
    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default as any;
    if (sec.token !== token) return;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    sec.client = client;
    client.on('user-published', async (ru: any, mt: string) => {
      try {
        await client.subscribe(ru, mt);
        if (mt === 'audio') {
          try { await ru.audioTrack?.play(); } catch { try { ru.audioTrack?.play(); } catch { /* */ } }
          ru.audioTrack?.setVolume?.(state.second?.activeIsSecond ? 100 : 0);
        }
      } catch { /* */ }
    });
    const [tr, mic] = await Promise.all([
      fetch(`/api/call/token?channel=${encodeURIComponent(ch)}&uid=${encodeURIComponent(uid)}`, { credentials: 'include' }),
      AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' }),
    ]);
    if (sec.token !== token) { try { mic.stop(); mic.close(); } catch { /* */ } return; }
    if (!tr.ok) throw new Error('token');
    const td = (await tr.json()) as { token: string; uid: number; appId?: string };
    await client.join(td.appId || AGORA_APP_ID_FALLBACK, ch, td.token, td.uid);
    if (sec.token !== token) { try { mic.stop(); mic.close(); await client.leave(); } catch { /* */ } return; }
    sec.mic = mic;
    applySecondAudio(!!state.second?.activeIsSecond);
    await client.publish([mic]);
    await Promise.all((client.remoteUsers || []).map(async (ru: any) => {
      try {
        if (ru.hasAudio) {
          await client.subscribe(ru, 'audio');
          ru.audioTrack?.play();
          ru.audioTrack?.setVolume?.(state.second?.activeIsSecond ? 100 : 0);
        }
      } catch { /* */ }
    }));
  } catch {
    if (sec.token === token) {
      announceBusy('Could not connect the second call', 'info');
      void endSecond({ remote: true });
    }
  }
}

function applySecondAudio(active: boolean) {
  try { void sec.mic?.setMuted?.(!active); } catch { /* */ }
  try {
    for (const ru of sec.client?.remoteUsers || []) {
      try { ru.audioTrack?.setVolume?.(active ? 100 : 0); } catch { /* */ }
    }
  } catch { /* */ }
}

async function pollSecond() {
  const s = state.second;
  const b = bridge;
  if (!s || !b) return;
  // المكالمة الأولى انتهت → الثانية تصير هي الفعّالة
  if (b.phase() === 'idle' && !s.activeIsSecond) {
    setState({ second: { ...s, activeIsSecond: true } });
    applySecondAudio(true);
  }
  try {
    const r = await fetch(`/api/room?id=${encodeURIComponent(s.channel)}`, { credentials: 'include' });
    if (!r.ok) return;
    const d = (await r.json()) as { members?: { userId?: string; id?: string }[] };
    const others = (d.members || []).filter((x) => String(x.userId || x.id) !== String(b.userId));
    if (others.length === 0 && Date.now() - s.startedAt > 6000 && state.second?.channel === s.channel) {
      void endSecond({ remote: true });
    }
  } catch { /* */ }
}

/** إنهاء المكالمة الثانية. remote = الطرف الآخر هو اللي أنهى. quiet = دمج (بدون إشارة إغلاق). */
export async function endSecond(opts: { remote?: boolean; quiet?: boolean } = {}) {
  const s = state.second;
  const b = bridge;
  if (!s) return;
  sec.token++;
  if (sec.hb) { window.clearInterval(sec.hb); sec.hb = null; }
  if (sec.poll) { window.clearInterval(sec.poll); sec.poll = null; }
  const { client, mic } = sec;
  sec.client = null; sec.mic = null;
  setState({ second: null });
  try { mic?.stop?.(); mic?.close?.(); } catch { /* */ }
  try { await client?.leave?.(); } catch { /* */ }
  if (b) {
    void post('/api/room/leave', { roomId: s.channel, userId: b.userId, endRoom: !opts.remote && !opts.quiet }, true);
    void callPatchEnd(s.channel);
    if (!opts.remote && !opts.quiet) {
      try { b.sendSignal({ type: 'hangup', to: s.peer.id, from: b.userId, channel: s.channel, at: Date.now() }); } catch { /* */ }
      void post('/api/call/invite/clear', { userId: s.peer.id, channel: s.channel }, true);
    }
    // رجّع المكالمة الأولى (لو لسا موجودة)
    if (!opts.quiet && b.phase() !== 'idle') {
      b.holdCurrent(false);
      notifyHold(false);
    }
  }
}

/** تبديل بين المكالمتين (واحدة تكلم، والثانية معلّقة) */
export function switchCalls() {
  const s = state.second;
  const b = bridge;
  if (!s || !b) return;
  if (b.phase() === 'idle') return; // ما في مكالمة أولى للتبديل
  const toSecond = !s.activeIsSecond;
  setState({ second: { ...s, activeIsSecond: toSecond } });
  applySecondAudio(toSecond);
  b.holdCurrent(toSecond);
  notifyHold(toSecond);                                   // أعلم أصحاب المكالمة الأولى
  sendBoth(s.peer.id, 'hold', { on: !toSecond, channel: s.channel }); // وأعلم صاحب المكالمة الثانية
}

/** دمج المتصل المنتظر (أو صاحب المكالمة الثانية) داخل مكالمتي الحالية */
export async function mergeIntoCurrent() {
  const b = bridge;
  if (!b) return;
  const curCh = b.channel();
  const w = state.waiting;
  const s = state.second;
  const peer: CallPeer | null = w ? { id: w.hostId, name: w.hostName, avatarUrl: w.hostAvatar } : s ? s.peer : null;
  if (!peer) return;
  if (!curCh || b.phase() === 'idle') {
    // ما في مكالمة نندمج فيها → رد عادي
    if (w) await answerWaitingAndHold();
    return;
  }
  if (w) dismissWaiting('handled');
  b.holdCurrent(false);
  notifyHold(false);
  const members = b.members();
  sendBoth(peer.id, 'merge-invite', { channel: curCh, hostId: b.userId, hostName: b.userName, hostAvatar: b.userAvatar, members });
  announceBusy('Merging calls…', 'info');
  if (s) window.setTimeout(() => { void endSecond({ quiet: true }); }, 1500); // نعطي الطرف وقت ينتقل
}

// ───────────────────────────── استقبال الإشارات ─────────────────────────────
/** يرجّع true إذا هذا الملف تعامل مع الإشارة (RootLayout يتوقف). */
export function callPatchConsumeSignal(msg: any): boolean {
  const b = bridge;
  if (!msg || typeof msg !== 'object' || !b) return false;
  const type = String(msg.type || '');
  const ch = String(msg.channel || '');
  const id = msg.id ? String(msg.id) : '';
  if (id) {
    if (seenSignalIds.has(id)) return true;
    seenSignalIds.add(id);
    if (seenSignalIds.size > 300) seenSignalIds.clear();
  }

  if (type === 'hangup' || type === 'call-end' || type === 'ended') {
    if (state.waiting && ch && state.waiting.channel === ch) { dismissWaiting('missed'); return true; }
    if (state.second && ch && state.second.channel === ch) { void endSecond({ remote: true }); return true; }
    const cur = String(b.channel() || '');
    // إغلاق قناة ثانية (رفض انتظار / مكالمة قديمة) لا ينهي المكالمة الحالية
    if (ch && cur && ch !== cur) return true;
    // نفس القناة: أقفل صفحة الاتصال عند الطرف الثاني حتى لو الإشارة وصلت HTTP مو WebSocket
    if (!ch || !cur || ch === cur) {
      try {
        window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel: ch || cur, at: Date.now(), remote: true } }));
      } catch { /* */ }
    }
    return false;
  }
  if (type === 'call-waiting') {
    const hostId = String(msg.from || msg.hostId || '');
    const channel = String(msg.channel || (msg.payload as any)?.channel || '');
    if (hostId && channel) {
      callPatchOnIncomingWhileBusy({
        channel,
        hostId,
        hostName: (msg.fromName as string) || null,
        hostAvatar: (msg.fromAvatar as string) || null,
        at: Number(msg.at) || Date.now(),
      });
    }
    return true;
  }
  if (type === 'busy') {
    const busyFrom = String(msg.from || '');
    const fromKnown = !busyFrom || b.members().some((m) => m.id === busyFrom); // حماية: "مشغول" فقط من شخص أنا فعلاً أتصل به
    if (ch && ch === b.channel() && fromKnown) {
      if (b.phase() !== 'live') {
        announceBusy('Busy · الخط مشغول');
        b.cancelOutgoing();
      }
    }
    return true;
  }
  if (type === 'hold') {
    announceBusy(msg.on ? 'You were put on hold' : 'Call resumed', 'info');
    return true;
  }
  if (type === 'merge-invite') {
    const to = String(msg.to || '');
    const from = String(msg.from || msg.hostId || '');
    if (to && to !== b.userId) return true;
    const known = b.members().some((m) => m.id === from);
    if (!from || !ch || b.phase() === 'idle' || !known) return true; // حماية: فقط من شخص أنا فعلاً معه في مكالمة
    void b.joinChannelAsAnswer({
      channel: ch,
      hostId: from,
      hostName: msg.fromName || msg.hostName || null,
      hostAvatar: msg.fromAvatar || msg.hostAvatar || null,
      members: Array.isArray(msg.members) ? msg.members : [],
      at: Date.now(),
    });
    announceBusy('Joining merged call…', 'info');
    return true;
  }
  return false;
}

// ───────────────────────────── الواجهة ─────────────────────────────
const C = { bg: 'rgba(8,22,25,0.97)', border: 'rgba(0,188,212,0.45)', text: '#e8fbff', dim: 'rgba(232,251,255,0.65)', red: '#e5214f', green: '#18b66a', cyan: '#00bcd4' };

function Avatar({ name, url, size = 44 }: { name: string | null; url: string | null; size?: number }) {
  const initial = (name || 'U').trim().charAt(0).toUpperCase() || 'U';
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${C.border}` }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#e9eef0', color: '#111', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${C.border}` }}>{initial}</div>
  );
}

function ActionBtn({ label, color, onClick, children }: { label: string; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 64 }}>
      <span style={{ width: 46, height: 46, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>{children}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{label}</span>
    </button>
  );
}

export function CallPatchUI({ userId }: { userId?: string | null }) {
  const st = useSyncExternalStore(subscribe, getState, getState);

  // نبض + دفع إعداد الانتظار للسيرفر + استقبال الإشارات الاحتياطية (HTTP)
  useEffect(() => {
    if (!userId) return;
    void post('/api/call/waiting', { enabled: getCallWaiting(userId) });
    // لو السيرفر حافظ الإعداد وهذا الجهاز فاضي، لا نخلي الانتظار يطلع مطفي بالغلط
    void (async () => {
      try {
        const r = await fetch('/api/call/waiting', { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json() as { enabled?: boolean };
        if (d?.enabled === true && !getCallWaiting(userId)) setCallWaiting(userId, true);
      } catch { /* */ }
    })();
    let since: number | null = null; // وقت السيرفر فقط — لا نعتمد على ساعة الجهاز (قد تختلف)
    let stopped = false;
    const active = () => (bridge?.phase() ?? 'idle') !== 'idle' || !!state.second || !!state.waiting;
    const beat = window.setInterval(() => {
      if (active()) void post('/api/call/heartbeat', { waitingEnabled: getCallWaiting(userId) });
    }, 12_000);
    const pull = window.setInterval(async () => {
      if (stopped || !active()) return;
      try {
        // أول طلب: since كبير جداً → السيرفر يرجّع وقته فقط بدون إشارات قديمة
        const r = await fetch(`/api/call/signals?since=${since ?? 9e15}`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as { now?: number; signals?: { id: string; at: number; from: string; type: string; payload: Record<string, unknown> }[] };
        const first = since === null;
        if (typeof d.now === 'number') since = Math.max(since ?? 0, d.now - 500);
        if (first) return;
        for (const s of d.signals || []) {
          callPatchConsumeSignal({ ...s.payload, id: s.id, type: s.type, from: s.from, to: userId });
        }
      } catch { /* */ }
    }, 1500);
    return () => { stopped = true; window.clearInterval(beat); window.clearInterval(pull); };
  }, [userId]);

  // لو التطبيق انقفل/تحدّث: نظّف المكالمة الثانية والتنبيه
  useEffect(() => () => {
    stopWaitingRing();
    if (state.second) void endSecond({ remote: true });
  }, []);

  if (!userId) return null;
  const top = 'calc(env(safe-area-inset-top, 0px) + 8px)';
  const w = st.waiting;
  const s = st.second;

  return (
    <>
      {st.toast && (
        <div role="status" style={{ position: 'fixed', top, left: '50%', transform: 'translateX(-50%)', zIndex: 12050, padding: '10px 18px', borderRadius: 999, background: st.toast.kind === 'busy' ? C.red : C.bg, color: '#fff', fontWeight: 800, fontSize: 14, border: `1px solid ${st.toast.kind === 'busy' ? 'rgba(255,255,255,0.25)' : C.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxWidth: '92vw', textAlign: 'center' }}>
          {st.toast.text}
        </div>
      )}

      {w && (
        <div style={{ position: 'fixed', left: 10, right: 10, top, zIndex: 12040, background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 22, padding: '12px 14px', boxShadow: '0 14px 40px rgba(0,0,0,0.55), 0 0 26px rgba(0,188,212,0.18)', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Avatar name={w.hostName} url={w.hostAvatar} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: C.cyan, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Call waiting</div>
              <div style={{ color: C.text, fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.hostName || w.hostUsername || 'User'}</div>
              <div style={{ color: C.dim, fontSize: 12 }}>is calling you · you are on another call</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start' }}>
            <ActionBtn label="Decline" color={C.red} onClick={declineWaiting}><PhoneOff size={20} /></ActionBtn>
            <ActionBtn label="Hold & Answer" color={C.green} onClick={() => { void answerWaitingAndHold(); }}><Phone size={20} /></ActionBtn>
            <ActionBtn label="Merge" color="#2563eb" onClick={() => { void mergeIntoCurrent(); }}><Users size={20} /></ActionBtn>
          </div>
        </div>
      )}

      {s && (
        <div style={{ position: 'fixed', left: 10, right: 10, bottom: 'calc(var(--stooorna-bottom-bar-h, 96px) + 12px)', zIndex: 12030, background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 22, padding: '10px 12px', boxShadow: '0 14px 40px rgba(0,0,0,0.55)', maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={s.peer.name} url={s.peer.avatarUrl} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.peer.name || 'User'}</div>
            <div style={{ color: s.activeIsSecond ? C.green : '#f5b942', fontSize: 11, fontWeight: 800 }}>
              {s.activeIsSecond ? 'Talking · other call on hold' : 'On hold · other call active'}
            </div>
          </div>
          <button type="button" onClick={switchCalls} aria-label="Switch calls" style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.08)', color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Repeat size={18} /></button>
          <button type="button" onClick={() => { void mergeIntoCurrent(); }} aria-label="Merge calls" style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(37,99,235,0.85)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={18} /></button>
          <button type="button" onClick={() => { void endSecond(); }} aria-label="End this call" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: C.red, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PhoneOff size={18} /></button>
        </div>
      )}
    </>
  );
}

/** زر "انتظار المكالمة" — يوضع داخل لوحة سجل المكالمات. */
export function CallWaitingToggle({ userId, variant = 'dark' }: { userId?: string | null; variant?: 'dark' | 'light' }) {
  const uid = String(userId || '');
  const on = useCallWaiting(uid);
  if (!uid) return null;
  const dark = variant === 'dark';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setCallWaiting(uid, !on); }}
      aria-pressed={on}
      aria-label="Call waiting"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
        padding: '9px 12px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
        border: dark ? '1px solid rgba(0,188,212,0.35)' : '1px solid rgba(0,0,0,0.1)',
        background: dark ? 'rgba(0,188,212,0.08)' : '#f6f8f9',
        color: dark ? '#e8fbff' : '#111',
      }}
    >
      <Phone size={16} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: 13 }}>Call waiting</span>
        <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>
          {on ? 'ON — you get an alert when someone calls during a call' : 'OFF — callers get "busy" while you are on a call'}
        </span>
      </span>
      <span style={{ width: 40, height: 22, borderRadius: 999, background: on ? '#18b66a' : (dark ? 'rgba(255,255,255,0.2)' : '#c8d0d3'), position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
    </button>
  );
}
