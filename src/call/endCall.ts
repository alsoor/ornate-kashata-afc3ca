/**
 * endCall.ts — إنهاء المكالمة فقط.
 * src/call/endCall.ts
 * لا يبدأ اتصالاً ولا يستقبل. يوقف الرنين ويغلق الخط عند الطرفين.
 */
export type CallPeer = { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; joined?: boolean };
export type CallSession = {
  id: number;
  channel: string;
  hostId: string;
  peers: CallPeer[];
  video: boolean;
  phase: 'idle' | 'outgoing' | 'incoming' | 'live';
  startedAt: number;
};
let nextSessionId = 1;
export function newSessionId() { return nextSessionId++; }

const sockets = new Set<WebSocket>();
export const callSession: { current: CallSession | null } = { current: null };

/* ───────────── سجل المكالمات المنتهية (في الذاكرة) ─────────────
 * القناة بين شخصين ثابتة دائماً (channelFor)، لذلك أي رسالة "call" متأخرة
 * أو دعوة قديمة من الخادم كانت تعيد الرنين بعد إنهاء المتصل.
 * نسجّل هنا وقت الإنهاء (بساعة المتصل) ليُرفض أي شيء أقدم منه.
 */
const ENDED_WINDOW_MS = 60000;
const endedMem = new Map<string, { at: number; local: number }>();

export function markEnded(channel: string, at?: number) {
  const ch = String(channel || '').trim();
  if (!ch) return;
  const endedAt = Number(at) || Date.now();
  const prev = endedMem.get(ch);
  if (!prev || endedAt > prev.at) endedMem.set(ch, { at: endedAt, local: Date.now() });
  try {
    localStorage.setItem(`stooorna_call_ended_${ch}`, JSON.stringify({ at: endedAt }));
    // تنظيف العلامة بعد قليل حتى لا تقتل مكالمة جديدة على نفس القناة.
    window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(`stooorna_call_ended_${ch}`);
        if (raw && Number(JSON.parse(raw).at) === endedAt) localStorage.removeItem(`stooorna_call_ended_${ch}`);
      } catch { /* */ }
    }, 3500);
  } catch { /* */ }
}

/** وقت إنهاء هذه القناة (0 إذا لم تنتهِ مؤخراً). */
export function endedAtOf(channel: string) {
  const row = endedMem.get(String(channel || '').trim());
  if (!row) return 0;
  if (Date.now() - row.local > ENDED_WINDOW_MS) { endedMem.delete(String(channel || '').trim()); return 0; }
  return row.at;
}

export function trackSignalSocket(ws: WebSocket) {
  sockets.add(ws);
  ws.addEventListener('close', () => sockets.delete(ws));
}

export function stopRing() {
  try {
    const w = window as any;
    if (w.__stooornaIncomingVibrateTimer) {
      window.clearInterval(w.__stooornaIncomingVibrateTimer);
      w.__stooornaIncomingVibrateTimer = null;
    }
    navigator.vibrate?.(0);
    const ctx: AudioContext | undefined = w.__stooornaRingCtx;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
      w.__stooornaRingCtx = null;
    }
    window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
    window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
  } catch { /* */ }
}

export function sendSignal(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg);
  const trySend = () => {
    let ok = false;
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); ok = true; } catch { /* */ }
      }
    });
    return ok;
  };
  if (trySend()) return;
  let n = 0;
  const t = window.setInterval(() => { n += 1; if (trySend() || n >= 20) window.clearInterval(t); }, 400);
}

/* طلبات إنشاء الدعوة الجارية. إذا أنهى المتصل بسرعة، كان طلب "المسح" قد يصل
 * قبل طلب "الإنشاء" فيُنشئ الخادم الدعوة بعد مسحها ويبقى الرنين عند الطرف الآخر.
 * لذلك ننتظر استقرار الإنشاء قبل إرسال المسح. */
const inflightInvites = new Set<Promise<unknown>>();
export function trackInvite(p: Promise<unknown>) {
  inflightInvites.add(p);
  void p.then(() => inflightInvites.delete(p), () => inflightInvites.delete(p));
}

async function clearInvite(userId: string, channel: string) {
  if (inflightInvites.size) {
    try {
      await Promise.race([
        Promise.all([...inflightInvites]),
        new Promise(resolve => window.setTimeout(resolve, 3000)),
      ]);
    } catch { /* */ }
  }
  const body = JSON.stringify({ userId, toUserId: userId, channel, clear: true, ended: true });
  for (let i = 0; i < 3; i++) {
    void fetch('/api/call/invite/clear', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    void fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}

export function rememberRejoin(channel: string, hostId: string, name?: string | null, avatarUrl?: string | null) {
  const row = { channel, hostId, name: name || 'Call', avatarUrl: avatarUrl || null, at: Date.now() };
  try { localStorage.setItem('stooorna_rejoin_call', JSON.stringify(row)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('stooorna:rejoin-available', { detail: row }));
}

export async function leaveAgora(client: { current: any }, mic: { current: any }, cam: { current: any }) {
  try { mic.current?.stop?.(); mic.current?.close?.(); } catch { /* */ }
  try { cam.current?.stop?.(); cam.current?.close?.(); } catch { /* */ }
  try { await client.current?.leave?.(); } catch { /* */ }
  client.current = null;
  mic.current = null;
  cam.current = null;
  document.querySelectorAll('audio[data-stooorna-call-audio="1"]').forEach(el => el.remove());
}

/** إنهاء كامل: يوقف الرنين ويخرج الطرفين. */
export async function endCall(meId: string, opts?: { remote?: boolean; client?: { current: any }; mic?: { current: any }; cam?: { current: any }; sessionId?: number; at?: number }) {
  const session = callSession.current;
  if (opts?.sessionId && session && session.id !== opts.sessionId) return;
  stopRing();
  if (!session) return;
  const remote = !!opts?.remote;
  const endedAt = remote ? (Number(opts?.at) || Date.now()) : Date.now();

  // أغلق الجلسة فوراً (قبل انتظار Agora) حتى تختفي الواجهة ويتوقف الرنين مباشرة.
  callSession.current = null;
  markEnded(session.channel, endedAt);

  if (!remote) {
    const peers = session.peers.filter(p => p.id && p.id !== meId);
    const blast = () => {
      for (const peer of peers) {
        sendSignal({ type: 'hangup', to: peer.id, from: meId, channel: session.channel, at: Date.now() });
        sendSignal({ type: 'ended', to: peer.id, from: meId, channel: session.channel, at: Date.now() });
        void clearInvite(peer.id, session.channel);
      }
    };
    blast();
    window.setTimeout(blast, 400);
    window.setTimeout(blast, 1200);
    window.setTimeout(blast, 2500);
  }
  void fetch('/api/room/leave', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: session.channel, userId: meId, endRoom: !remote }),
  }).catch(() => {});
  window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel: session.channel, at: endedAt } }));
  if (opts?.client && opts.mic && opts.cam) await leaveAgora(opts.client, opts.mic, opts.cam);
}

/** خروج الشخص الثالث فقط. الطرفان يبقيان، ويظهر له زر Join. */
export function leaveAsGuest(meId: string, client?: { current: any }, mic?: { current: any }, cam?: { current: any }) {
  const session = callSession.current;
  stopRing();
  if (!session) return;
  rememberRejoin(session.channel, session.hostId, session.peers.find(p => p.id === session.hostId)?.name, session.peers.find(p => p.id === session.hostId)?.avatarUrl);
  for (const peer of session.peers) {
    if (!peer.id || peer.id === meId) continue;
    sendSignal({ type: 'member-left', to: peer.id, from: meId, channel: session.channel, hostId: session.hostId, at: Date.now() });
  }
  void fetch('/api/room/leave', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: session.channel, userId: meId, endRoom: false }),
  }).catch(() => {});
  if (client && mic && cam) void leaveAgora(client, mic, cam);
  callSession.current = null;
  window.dispatchEvent(new CustomEvent('stooorna:call-member-left', { detail: { channel: session.channel, userId: meId } }));
}
