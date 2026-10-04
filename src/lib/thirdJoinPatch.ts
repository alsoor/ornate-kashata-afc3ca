/**
 * thirdJoinPatch — إصلاح إضافة الشخص الثالث فقط.
 * لا يغيّر مكالمة الشخصين. يوقف رنين الداعي عندما يرد المضاف.
 *
 * src/lib/thirdJoinPatch.ts
 * في أول RootLayout.tsx:
 *   import '@/lib/thirdJoinPatch';
 */
type ExtraInvite = { channel: string; peerId: string; at: number };

const extras = new Map<string, ExtraInvite>();
let meId = '';
let installed = false;

function num(v: unknown) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function stopInviterRing() {
  try {
    const w = window as any;
    if (w.__stooornaIncomingVibrateTimer) {
      window.clearInterval(w.__stooornaIncomingVibrateTimer);
      w.__stooornaIncomingVibrateTimer = null;
    }
    navigator.vibrate?.(0);
    const ctx: AudioContext | undefined = w.__stooornaRingCtx;
    if (ctx && ctx.state !== 'closed') {
      void ctx.suspend().catch(() => {});
      void ctx.close().catch(() => {});
      w.__stooornaRingCtx = null;
    }
    window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
    window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
  } catch { /* */ }
}

function clearExtra(channel: string, peerId: string) {
  const body = JSON.stringify({
    userId: peerId,
    toUserId: peerId,
    channel,
    clear: true,
    answered: true,
    ended: false,
  });
  void fetch('/api/call/invite/clear', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
  try { localStorage.removeItem(`stooorna_home_call_invite_${peerId}`); } catch { /* */ }
  extras.delete(`${channel}@${peerId}`);
  stopInviterRing();
}

function onAnswered(msg: any) {
  const channel = String(msg?.channel || '');
  const from = String(msg?.from || msg?.by || msg?.userId || '');
  if (!channel) return;
  const hit = [...extras.values()].filter(x => x.channel === channel && (!from || x.peerId === from));
  if (!hit.length) {
    // رد على دعوة إضافة حتى لو فُقد التتبع: أوقف الرنين ولا تغلق المكالمة الحية.
    stopInviterRing();
    return;
  }
  hit.forEach(x => clearExtra(x.channel, x.peerId));
}

export function installThirdJoinPatch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = String(init?.method || 'GET').toUpperCase();
    let body: any = null;
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = null; }
    }
    if (url.includes('/api/call/invite') && method === 'POST' && body && !body.clear && !body.ended) {
      const peerId = String(body.toUserId || body.userId || '');
      const channel = String(body.channel || '');
      const hostId = String(body.hostId || body.fromId || '');
      if (hostId) meId = hostId;
      if (peerId && channel && peerId !== hostId) extras.set(`${channel}@${peerId}`, { channel, peerId, at: num(body.at) || Date.now() });
    }
    if (url.includes('/api/auth') || url.includes('/api/me')) {
      /* identity filled from invite host */
    }
    const res = await origFetch(input, init);
    if (url.includes('/api/call/invite') && method === 'GET') {
      try {
        const data = await res.clone().json();
        const inv = data?.invite;
        if (inv && meId && String(inv.hostId || inv.fromId || '') === meId) {
          return new Response(JSON.stringify({ ...data, invite: null }), {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch { /* */ }
    }
    return res;
  };

  const OrigWS = window.WebSocket;
  function Patched(this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    if (String(url).includes('/ws/call-signal')) {
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data || ''));
          const type = String(msg?.type || '');
          if (type === 'answered' || type === 'call-answered') onAnswered(msg);
        } catch { /* */ }
      });
    }
    return ws;
  }
  Patched.prototype = OrigWS.prototype;
  (Patched as any).CONNECTING = OrigWS.CONNECTING;
  (Patched as any).OPEN = OrigWS.OPEN;
  (Patched as any).CLOSING = OrigWS.CLOSING;
  (Patched as any).CLOSED = OrigWS.CLOSED;
  window.WebSocket = Patched as unknown as typeof WebSocket;

  window.addEventListener('stooorna:call-answered', (e: Event) => onAnswered((e as CustomEvent).detail || {}));
  window.addEventListener('stooorna:stop-incoming-ring', () => stopInviterRing());
}

installThirdJoinPatch();
