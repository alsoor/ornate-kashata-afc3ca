/**
 * callSessionPatch — إرسال / استقبال / صوت / إغلاق فوري للطرفين.
 *
 * src/lib/callSessionPatch.ts
 * في أول RootLayout.tsx:
 *   import '@/lib/callSessionPatch';
 *
 * المكالمة = channel + at. إغلاق دعوة لا يمنع اتصالاً أحدث على نفس القناة.
 */
const NO_ANSWER_MS = 45_000;
const ENDED_KEEP_MS = 3 * 60_000;

type EndedCall = { channel: string; at: number; endedAt: number };

const endedByChannel = new Map<string, EndedCall>();
const noAnswerTimers = new Map<string, number>();
const sockets = new Set<WebSocket>();
let installed = false;
let activeChannel = '';
let activeAt = 0;
let activePeers: string[] = [];
let suppressRingUntil = 0;

function num(v: unknown): number {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function rememberEnded(channel: string, inviteAt: number) {
  const ch = String(channel || '').trim();
  if (!ch) return;
  const row: EndedCall = { channel: ch, at: num(inviteAt), endedAt: Date.now() };
  const prev = endedByChannel.get(ch);
  if (!prev || row.endedAt >= prev.endedAt) endedByChannel.set(ch, row);
  try {
    localStorage.setItem(
      `stooorna_call_ended_${ch}`,
      JSON.stringify({ channel: ch, inviteAt: row.at, at: row.endedAt, endedAt: row.endedAt }),
    );
  } catch { /* */ }
}

function isEndedInvite(channel: string, inviteAt: number): boolean {
  const ch = String(channel || '').trim();
  if (!ch) return false;
  let row = endedByChannel.get(ch);
  if (!row) {
    try {
      const raw = localStorage.getItem(`stooorna_call_ended_${ch}`);
      if (raw) {
        const p = JSON.parse(raw);
        const endedAt = num(p.endedAt || p.at);
        if (endedAt && Date.now() - endedAt < ENDED_KEEP_MS) {
          row = { channel: ch, at: num(p.inviteAt || 0), endedAt };
          endedByChannel.set(ch, row);
        }
      }
    } catch { /* */ }
  }
  if (!row || Date.now() - row.endedAt > ENDED_KEEP_MS) return false;
  const at = num(inviteAt);
  // وقت أحدث من لحظة الإغلاق = مكالمة جديدة ويجب أن تصل.
  if (at && at > row.endedAt + 800) return false;
  return true;
}

export function stopCallAudio() {
  suppressRingUntil = Date.now() + 4000;
  try {
    const w = window as any;
    if (w.__stooornaIncomingVibrateTimer) {
      window.clearInterval(w.__stooornaIncomingVibrateTimer);
      w.__stooornaIncomingVibrateTimer = null;
    }
    try { navigator.vibrate?.(0); } catch { /* */ }
    const ctx: AudioContext | undefined = w.__stooornaRingCtx;
    if (ctx && ctx.state !== 'closed') {
      void ctx.suspend().catch(() => {});
      void ctx.close().catch(() => {});
      w.__stooornaRingCtx = null;
    }
  } catch { /* */ }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
    window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
  } catch { /* */ }
}

function allowRing() {
  suppressRingUntil = 0;
}

function wipeInvites() {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('stooorna_home_call_invite_') || k === 'stooorna_home_call_active_invite') drop.push(k);
    }
    drop.forEach(k => localStorage.removeItem(k));
  } catch { /* */ }
}

function sendHangup(channel: string, peerId: string) {
  const payload = JSON.stringify({
    type: 'hangup',
    to: peerId,
    channel,
    at: Date.now(),
  });
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { /* */ }
    }
  });
  const body = JSON.stringify({
    userId: peerId,
    toUserId: peerId,
    channel,
    clear: true,
    ended: true,
    hangup: true,
    at: Date.now(),
  });
  void fetch('/api/call/invite/clear', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
  void fetch('/api/call/invite', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

function forceLocalEnd(channel: string) {
  const ch = String(channel || activeChannel || '').trim();
  stopCallAudio();
  wipeInvites();
  try {
    window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', {
      detail: { channel: ch, at: Date.now() },
    }));
    window.dispatchEvent(new CustomEvent('stooorna:call-declined', {
      detail: { channel: ch, at: Date.now() },
    }));
  } catch { /* */ }
  if (activeChannel === ch) {
    activeChannel = '';
    activeAt = 0;
    activePeers = [];
  }
}

export function endCallNow(channel: string, inviteAt?: number, peerIds: string[] = []) {
  const ch = String(channel || activeChannel || '').trim();
  if (!ch) {
    stopCallAudio();
    return;
  }
  cancelNoAnswer(ch);
  rememberEnded(ch, num(inviteAt) || activeAt);
  const peers = Array.from(new Set([...peerIds, ...activePeers].filter(Boolean)));
  const blast = () => peers.forEach(id => sendHangup(ch, id));
  blast();
  window.setTimeout(blast, 500);
  window.setTimeout(blast, 1400);
  forceLocalEnd(ch);
}

function cancelNoAnswer(channel: string) {
  for (const [key, timer] of noAnswerTimers) {
    if (!channel || key.startsWith(`${channel}@`)) {
      window.clearTimeout(timer);
      noAnswerTimers.delete(key);
    }
  }
}

function armNoAnswer(channel: string, at: number, peers: string[]) {
  const key = `${channel}@${at}`;
  if (noAnswerTimers.has(key)) return;
  const timer = window.setTimeout(() => {
    noAnswerTimers.delete(key);
    endCallNow(channel, at, peers);
  }, NO_ANSWER_MS);
  noAnswerTimers.set(key, timer);
}

function noteOutgoing(channel: string, at: number, peers: string[]) {
  const ch = String(channel || '').trim();
  if (!ch || !at) return;
  const prev = endedByChannel.get(ch);
  if (prev && at > prev.endedAt) endedByChannel.delete(ch);
  activeChannel = ch;
  activeAt = at;
  activePeers = Array.from(new Set([...activePeers, ...peers.filter(id => id && id !== ch)]));
  allowRing();
  armNoAnswer(ch, at, activePeers);
}

function inviteOf(data: any): any {
  if (!data || typeof data !== 'object') return null;
  return data.invite || data.data || data.call || (data.channel ? data : null);
}

function handleSignal(msg: any) {
  if (!msg || typeof msg !== 'object') return;
  const type = String(msg.type || '');
  const channel = String(msg.channel || '');
  if (type === 'hangup' || type === 'call-end' || type === 'ended' || msg.clear || msg.ended) {
    rememberEnded(channel, num(msg.at));
    cancelNoAnswer(channel);
    forceLocalEnd(channel);
    return;
  }
  if (type === 'answered' || type === 'call-answered') {
    cancelNoAnswer(channel);
    stopCallAudio();
    return;
  }
  if (type === 'call' || type === 'incoming-call' || type === 'home-call') {
    const at = num(msg.at);
    if (isEndedInvite(channel, at)) {
      stopCallAudio();
      forceLocalEnd(channel);
      return;
    }
    activeChannel = channel || activeChannel;
    if (at) activeAt = at;
    allowRing();
  }
}

export function installCallSessionPatch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (AC && !(AC.prototype as any).__stooornaRingGuard) {
    const orig = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      const osc = orig.call(this);
      if (Date.now() < suppressRingUntil) {
        try { osc.frequency.value = 0; } catch { /* */ }
        const start = osc.start.bind(osc);
        osc.start = () => { try { osc.stop(); } catch { /* */ } return undefined as any; };
        void start;
      }
      return osc;
    };
    (AC.prototype as any).__stooornaRingGuard = true;
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = String(init?.method || 'GET').toUpperCase();
    let body: any = null;
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = null; }
    }

    if (url.includes('/api/call/invite') && method === 'POST' && body) {
      const channel = String(body.channel || activeChannel || '');
      const peers = [body.toUserId, body.userId].map((x: unknown) => String(x || '')).filter(Boolean);
      if (body.clear || body.ended || body.hangup) {
        rememberEnded(channel, num(body.at));
        cancelNoAnswer(channel);
        forceLocalEnd(channel);
      } else if (body.answered) {
        cancelNoAnswer(channel);
        stopCallAudio();
      } else if (channel && num(body.at)) {
        noteOutgoing(channel, num(body.at), peers);
      }
    }

    const res = await origFetch(input, init);

    if (url.includes('/api/call/invite') && method === 'GET') {
      try {
        const data = await res.clone().json();
        const inv = inviteOf(data);
        if (inv && (inv.ended || inv.clear || isEndedInvite(String(inv.channel || ''), num(inv.at)))) {
          forceLocalEnd(String(inv.channel || ''));
          const stripped = { ...data, invite: null };
          delete (stripped as any).channel;
          return new Response(JSON.stringify(stripped), {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch { /* */ }
    }
    return res;
  };

  const OrigWS = window.WebSocket;
  function PatchedWS(this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    if (String(url).includes('/ws/call-signal')) {
      sockets.add(ws);
      ws.addEventListener('close', () => sockets.delete(ws));
      ws.addEventListener('message', (ev) => {
        try { handleSignal(JSON.parse(String(ev.data || ''))); } catch { /* */ }
      });
      const origSend = ws.send.bind(ws);
      ws.send = (data: any) => {
        try { if (typeof data === 'string') handleSignal(JSON.parse(data)); } catch { /* */ }
        return origSend(data);
      };
    }
    return ws;
  }
  PatchedWS.prototype = OrigWS.prototype;
  (PatchedWS as any).CONNECTING = OrigWS.CONNECTING;
  (PatchedWS as any).OPEN = OrigWS.OPEN;
  (PatchedWS as any).CLOSING = OrigWS.CLOSING;
  (PatchedWS as any).CLOSED = OrigWS.CLOSED;
  window.WebSocket = PatchedWS as unknown as typeof WebSocket;

  window.addEventListener('stooorna:home-call-ended', (e: Event) => {
    const d = (e as CustomEvent).detail || {};
    const ch = String(d.channel || '');
    if (ch) rememberEnded(ch, num(d.inviteAt));
    stopCallAudio();
  });
  window.addEventListener('stooorna:stop-incoming-ring', () => stopCallAudio());

  window.setInterval(() => {
    if (Date.now() < suppressRingUntil) stopCallAudio();
    if (!activeChannel) return;
    if (isEndedInvite(activeChannel, activeAt)) forceLocalEnd(activeChannel);
  }, 700);
}

installCallSessionPatch();
