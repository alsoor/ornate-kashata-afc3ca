/**
 * thirdJoinPatch — إضافات الشخص الثالث فقط، بدون إلغاء الإضافات السابقة.
 * src/lib/thirdJoinPatch.ts
 * import '@/lib/thirdJoinPatch';
 *
 * - يوقف رنين الداعي عند الرد
 * - يزيل المدعو عند خروجه بدل إبقاء اسمه
 * - يحفظ دعوة الرجوع ويظهر زر Join
 * - يكمل صورة المدعو إذا ناقصة
 */
type ExtraInvite = { channel: string; peerId: string; at: number; name?: string | null; avatarUrl?: string | null; hostId?: string };

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
      void ctx.close().catch(() => {});
      w.__stooornaRingCtx = null;
    }
    window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
    window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
  } catch { /* */ }
}
function clearExtra(channel: string, peerId: string) {
  void fetch('/api/call/invite/clear', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: peerId, toUserId: peerId, channel, clear: true, answered: true }),
    keepalive: true,
  }).catch(() => {});
  try { localStorage.removeItem(`stooorna_home_call_invite_${peerId}`); } catch { /* */ }
  extras.delete(`${channel}@${peerId}`);
  stopInviterRing();
}
function onAnswered(msg: any) {
  const channel = String(msg?.channel || '');
  const from = String(msg?.from || msg?.by || msg?.userId || '');
  stopInviterRing();
  if (!channel) return;
  const hit = [...extras.values()].filter(x => x.channel === channel && (!from || x.peerId === from));
  hit.forEach(x => clearExtra(x.channel, x.peerId));
  if (from) {
    window.dispatchEvent(new CustomEvent('stooorna:call-member-joined', { detail: { channel, userId: from } }));
  }
}
function rememberRejoin(channel: string, hostId: string, name?: string | null, avatarUrl?: string | null) {
  const row = { channel, hostId, name: name || 'Call', avatarUrl: avatarUrl || null, at: Date.now() };
  try { localStorage.setItem('stooorna_rejoin_call', JSON.stringify(row)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('stooorna:rejoin-available', { detail: row }));
  paintJoin(row);
}
function paintJoin(row: { channel: string; hostId: string; name?: string | null; avatarUrl?: string | null }) {
  let btn = document.getElementById('stooorna-rejoin-call');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'stooorna-rejoin-call';
    btn.type = 'button';
    btn.style.cssText = 'position:fixed;right:16px;bottom:92px;z-index:90;border:0;border-radius:999px;background:#00BCD4;color:#042026;font-weight:800;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    document.body.appendChild(btn);
  }
  btn.innerHTML = row.avatarUrl
    ? `<img src="${row.avatarUrl}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-inline-end:6px" />Join`
    : 'Join';
  btn.onclick = () => {
    window.dispatchEvent(new CustomEvent('stooorna:rejoin-call', { detail: row }));
    btn?.remove();
    try { localStorage.removeItem('stooorna_rejoin_call'); } catch { /* */ }
  };
}
function onMemberLeft(msg: any) {
  const channel = String(msg?.channel || '');
  const userId = String(msg?.from || msg?.userId || '');
  if (!channel || !userId) return;
  extras.delete(`${channel}@${userId}`);
  stopInviterRing();
  window.dispatchEvent(new CustomEvent('stooorna:call-member-left', { detail: { channel, userId } }));
  if (userId === meId) {
    rememberRejoin(channel, String(msg?.hostId || ''), msg?.name, msg?.avatarUrl);
  }
}

export function installThirdJoinPatch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    const saved = localStorage.getItem('stooorna_rejoin_call');
    if (saved) paintJoin(JSON.parse(saved));
  } catch { /* */ }

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
      const member = Array.isArray(body.members) ? body.members.find((m: any) => String(m.id) === peerId) : null;
      if (peerId && channel && peerId !== hostId) {
        extras.set(`${channel}@${peerId}`, {
          channel, peerId, at: num(body.at) || Date.now(), hostId,
          name: member?.name || null,
          avatarUrl: member?.avatarUrl || null,
        });
      }
    }
    if (url.includes('/api/room/leave') && method === 'POST' && body?.roomId && meId && String(body.userId || '') === meId) {
      const channel = String(body.roomId);
      const extra = [...extras.values()].find(x => x.channel === channel && x.peerId === meId);
      if (extra || localStorage.getItem('stooorna_rejoin_pending') === channel) {
        rememberRejoin(channel, extra?.hostId || '', extra?.name, extra?.avatarUrl);
      }
    }
    const res = await origFetch(input, init);
    if (url.includes('/api/call/invite') && method === 'GET') {
      try {
        const data = await res.clone().json();
        const inv = data?.invite;
        if (inv && meId && String(inv.hostId || inv.fromId || '') === meId) {
          return new Response(JSON.stringify({ ...data, invite: null }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        }
      } catch { /* */ }
    }
    return res;
  };

  const OrigWS = window.WebSocket;
  function Patched(this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    if (String(url).includes('/ws/call-signal')) {
      const origSend = ws.send.bind(ws);
      ws.send = (data: any) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : null;
          if (msg?.type === 'hangup' && meId && String(msg.from || '') === meId) {
            const channel = String(msg.channel || '');
            const asGuest = [...extras.values()].some(x => x.channel === channel && x.peerId === meId);
            if (asGuest) {
              rememberRejoin(channel, String(msg.to || ''), null, null);
              msg.type = 'member-left';
              data = JSON.stringify(msg);
            }
          }
        } catch { /* */ }
        return origSend(data);
      };
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data || ''));
          const type = String(msg?.type || '');
          if (type === 'answered' || type === 'call-answered') onAnswered(msg);
          if (type === 'member-left') onMemberLeft(msg);
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
}

installThirdJoinPatch();
