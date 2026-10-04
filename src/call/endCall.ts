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

async function clearInvite(userId: string, channel: string) {
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
export async function endCall(meId: string, opts?: { remote?: boolean; client?: { current: any }; mic?: { current: any }; cam?: { current: any }; sessionId?: number }) {
  const session = callSession.current;
  if (opts?.sessionId && session && session.id !== opts.sessionId) return;
  stopRing();
  if (!session) return;
  const remote = !!opts?.remote;
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
  if (opts?.client && opts.mic && opts.cam) await leaveAgora(opts.client, opts.mic, opts.cam);
  try { localStorage.setItem(`stooorna_call_ended_${session.channel}`, JSON.stringify({ at: Date.now(), inviteAt: session.startedAt })); } catch { /* */ }
  callSession.current = null;
  window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel: session.channel, at: Date.now() } }));
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
