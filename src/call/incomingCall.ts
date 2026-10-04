/**
 * incomingCall.ts — استقبال الاتصال فقط.
 * src/call/incomingCall.ts
 */
import { callSession, endedAtOf, markEnded, newSessionId, sendSignal, stopRing, trackSignalSocket, type CallPeer } from './endCall';

const NO_ANSWER_MS = 45000;

/** يغلق إشعار "Incoming call" الظاهر في النظام (push) بعد انتهاء المكالمة. */
export async function dismissCallNotifications() {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const list = await r.getNotifications();
      for (const n of list) {
        const tag = String(n.tag || '');
        const d: any = n.data || {};
        if (tag.startsWith('call-') || tag === 'stooorna-incoming-call' || d.channel) n.close();
      }
    }
  } catch { /* */ }
}

export function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/call-signal`;
}

function playIncoming() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    let ctx = (window as any).__stooornaRingCtx as AudioContext | undefined;
    if (!ctx || ctx.state === 'closed') ctx = new AC();
    (window as any).__stooornaRingCtx = ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 440;
    g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    window.setTimeout(() => { try { o.stop(); } catch { /* */ } }, 700);
    navigator.vibrate?.([180, 100, 180]);
  } catch { /* */ }
}

export function isEnded(channel: string, at: number) {
  // 1) سجل الذاكرة: يُملأ عند وصول hangup حتى على جهاز المستقبِل.
  const mem = endedAtOf(channel);
  if (mem && !(at && at > mem + 800)) return true;
  // 2) علامة localStorage (نفس الجهاز).
  try {
    const raw = localStorage.getItem(`stooorna_call_ended_${channel}`);
    if (!raw) return false;
    const p = JSON.parse(raw);
    const endedAt = Number(p.endedAt || p.at || 0);
    if (!endedAt || Date.now() - endedAt > 180000) return false;
    if (at && at > endedAt + 800) return false;
    return true;
  } catch { return false; }
}

export function answerIncoming(me: CallPeer) {
  const session = callSession.current;
  if (!session) return;
  stopRing();
  session.phase = 'live';
  sendSignal({ type: 'answered', to: session.hostId, from: me.id, channel: session.channel, at: Date.now() });
  void fetch('/api/call/invite/clear', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: me.id, toUserId: me.id, channel: session.channel, answered: true, clear: true }),
  }).catch(() => {});
  for (const peer of session.peers) {
    if (!peer.id || peer.id === me.id) continue;
    sendSignal({ type: 'member-joined', to: peer.id, from: me.id, channel: session.channel, at: Date.now(), avatarUrl: me.avatarUrl, name: me.name });
  }
}

export function attachIncoming(meId: string, onEvent: (type: string, msg: any) => void) {
  let closed = false;
  let retry = 0;
  let ws: WebSocket | null = null;
  const connect = () => {
    if (closed) return;
    if (retry) { window.clearTimeout(retry); retry = 0; }
    const sock = new WebSocket(wsUrl());
    ws = sock;
    trackSignalSocket(sock);
    sock.onopen = () => { try { sock.send(JSON.stringify({ type: 'register', userId: meId })); } catch { /* */ } };
    sock.onmessage = (ev) => {
      if (closed) return;
      let msg: any;
      try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
      const type = String(msg.type || '');
      if ((type === 'call' || type === 'incoming-call' || type === 'home-call') && (!msg.to || String(msg.to) === meId)) {
        const channel = String(msg.channel || '');
        const at = Number(msg.at || Date.now());
        if (!channel || isEnded(channel, at)) return;
        const cur = callSession.current;
        if (cur?.phase === 'live') return;
        if (cur && cur.channel === channel && cur.phase === 'incoming') {
          // نفس الرنة وصلت مرتين: حدّث الأعضاء فقط ولا تُعد الرنين.
          if (Array.isArray(msg.members) && msg.members.length) cur.peers = msg.members;
          onEvent(type, msg);
          return;
        }
        const peers: CallPeer[] = Array.isArray(msg.members) ? msg.members : [];
        callSession.current = {
          id: newSessionId(),
          channel,
          hostId: String(msg.from || msg.hostId || ''),
          peers,
          video: msg.callType === 'video' || msg.video === true,
          phase: 'incoming',
          startedAt: at,
        };
        playIncoming();
      }
      if (type === 'hangup' || type === 'call-end' || type === 'ended') {
        const channel = String(msg.channel || '');
        const s = callSession.current;
        const from = String(msg.from || '');
        const endsCall = !s || !from || s.peers.length <= 2 || from === s.hostId;
        if (channel && endsCall && (!s || channel === s.channel)) {
          const endedAt = Number(msg.at) || Date.now();
          // سجّل الإنهاء عندنا: أي "call" متأخرة أو دعوة قديمة لن تُعيد الرنين.
          markEnded(channel, endedAt);
          // يُغلق أيضاً شريط الرنين القديم إن وُجد في RootLayout.
          window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel, at: endedAt } }));
        }
        if (!s || !channel || channel === s.channel) { stopRing(); void dismissCallNotifications(); }
        // مهم: لا نمسح callSession هنا. CallHost هو من ينهي الجلسة عبر endCall
        // (يغلق Agora والمايك ويحدّث الواجهة). مسحها هنا كان يمنعه من التنظيف.
      }
      if (type === 'answered' || type === 'call-answered') {
        if (callSession.current && String(msg.channel || '') === callSession.current.channel) {
          callSession.current.phase = 'live';
          stopRing();
          const id = String(msg.from || '');
          const peer = callSession.current.peers.find(p => p.id === id);
          if (peer) peer.joined = true;
        }
      }
      onEvent(type, msg);
    };
    sock.onclose = () => { if (!closed && ws === sock) retry = window.setTimeout(connect, 2000); };
  };
  connect();

  // إنهاء رنين وارد لم يُردّ عليه: يغلق الجلسة والواجهة والإشعار.
  const endIncoming = (session: { id: number; channel: string; hostId: string; startedAt: number }) => {
    const cur = callSession.current;
    if (!cur || cur.id !== session.id || cur.phase === 'live') return;
    markEnded(session.channel, session.startedAt);
    stopRing();
    void dismissCallNotifications();
    onEvent('hangup', { channel: session.channel, from: session.hostId, at: session.startedAt });
  };

  // احتياط: إذا فاتتنا رسالة hangup (انقطاع الويب سوكت / الجوال في الخلفية)، لا يبقى الرنين.
  let watchId = 0;
  let watchSince = 0;
  const check = () => {
    const session = callSession.current;
    if (!session || session.phase === 'live') { watchId = 0; return; }
    if (session.id !== watchId) { watchId = session.id; watchSince = Date.now(); }
    // سقف مطلق: الرنين لا يستمر أكثر من مهلة عدم الرد (+5ث) مهما كانت حالة الخادم.
    if (session.phase === 'incoming' && Date.now() - watchSince > NO_ANSWER_MS + 5000) { endIncoming(session); return; }
    void fetch(`/api/call/invite?userId=${encodeURIComponent(meId)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const inv = data?.invite;
        const sameChannel = !!inv && String(inv.channel || '') === session.channel;
        const cancelled = sameChannel && (!!inv.clear || !!inv.ended);
        // غياب الدعوة وحده لا يُعتبر إلغاءً في أول ثوانٍ: قد لا يكون الخادم خزّنها بعد.
        const missing = !sameChannel && Date.now() - watchSince > 4000;
        if (cancelled || missing) endIncoming(session);
      })
      .catch(() => {});
  };
  const poll = window.setInterval(check, 1000);

  // عودة التطبيق من الخلفية: الويب سوكت غالباً ميت وفاتته hangup. أعد الاتصال فوراً (الخادم يعيد إرسال الإنهاء)
  // وافحص الجلسة، ونظّف أي إشعار مكالمة قديم.
  let hiddenAt = 0;
  const onVis = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const wasHiddenMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (closed) return;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING || wasHiddenMs > 5000) {
      const old = ws;
      connect(); // يستبدل ws قبل إغلاق القديم فلا يُجدول إعادة اتصال مزدوجة
      try { old?.close(); } catch { /* */ }
    }
    check();
    if (!callSession.current || callSession.current.phase === 'live') void dismissCallNotifications();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    closed = true;
    if (retry) window.clearTimeout(retry);
    window.clearInterval(poll);
    document.removeEventListener('visibilitychange', onVis);
    try { ws?.close(); } catch { /* */ }
  };
}
