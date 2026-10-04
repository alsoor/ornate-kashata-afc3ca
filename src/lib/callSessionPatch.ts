/**
 * callSessionPatch — باتش واحد للمكالمات (إرسال / استقبال / صوت / إغلاق فوري).
 *
 * ضعه في src/lib/callSessionPatch.ts واستورده مرة واحدة من RootLayout:
 *   import '@/lib/callSessionPatch';
 *
 * يحل:
 *  1) بعد الرد، الاتصال مرة ثانية لا يصل (القناة الثابتة private_* كانت تُقفل بعد أول إغلاق).
 *  2) المتصل يغلق والمكالمة تظل ترن عند الطرف الثاني.
 *  3) عدم الرد: الرنين يتوقف فوراً عند الإغلاق، وبعد 45 ثانية تُنهى الدعوة تلقائياً.
 *  4) صوت الرنين لا يعود أثناء المكالمة ولا بعد الإغلاق.
 *
 * المكالمة تُعرَّف بـ channel + at. إغلاق دعوة لا يمنع دعوة أحدث على نفس القناة.
 */
const NO_ANSWER_MS = 45_000;
const ENDED_KEEP_MS = 3 * 60_000;

type EndedCall = { channel: string; at: number; endedAt: number };

const endedByChannel = new Map<string, EndedCall>();
let installed = false;

function num(v: unknown): number {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function sessionKey(channel: string, at: number): string {
  return `${channel}@${num(at)}`;
}

function rememberEnded(channel: string, inviteAt: number) {
  const ch = String(channel || '').trim();
  if (!ch) return;
  const prev = endedByChannel.get(ch);
  const at = num(inviteAt) || prev?.at || 0;
  const row: EndedCall = { channel: ch, at, endedAt: Date.now() };
  if (!prev || row.endedAt >= prev.endedAt) endedByChannel.set(ch, row);
  try {
    localStorage.setItem(`stooorna_call_ended_${ch}`, JSON.stringify({ channel: ch, at: row.at, endedAt: row.endedAt, by: 'patch' }));
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
          row = { channel: ch, at: num(p.inviteAt || p.callAt || 0), endedAt };
          endedByChannel.set(ch, row);
        }
      }
    } catch { /* */ }
  }
  if (!row) return false;
  if (Date.now() - row.endedAt > ENDED_KEEP_MS) {
    endedByChannel.delete(ch);
    return false;
  }
  const at = num(inviteAt);
  // دعوة أحدث من الإغلاق = مكالمة جديدة ويجب أن تصل.
  if (at && at > row.endedAt + 800) return false;
  // بدون وقت، أو وقت أقدم/مساوٍ للإغلاق = نفس المكالمة المنتهية.
  return true;
}

export function stopCallAudio() {
  try {
    const w = window as any;
    if (w.__stooornaIncomingVibrateTimer) {
      window.clearInterval(w.__stooornaIncomingVibrateTimer);
      w.__stooornaIncomingVibrateTimer = null;
    }
    try { navigator.vibrate?.(0); } catch { /* */ }
    const ctx: AudioContext | undefined = w.__stooornaRingCtx;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
      w.__stooornaRingCtx = null;
    }
    document.querySelectorAll('audio').forEach((el) => {
      const src = (el.currentSrc || el.src || '').toLowerCase();
      if (src.includes('ring') || src.includes('call')) {
        try { el.pause(); el.currentTime = 0; } catch { /* */ }
      }
    });
  } catch { /* */ }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
    window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
  } catch { /* */ }
}

function wipeLocalInvite(userId?: string) {
  try {
    const uid = userId || '';
    if (uid) localStorage.removeItem(`stooorna_home_call_invite_${uid}`);
    localStorage.removeItem('stooorna_home_call_active_invite');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('stooorna_home_call_invite_')) localStorage.removeItem(k);
    }
  } catch { /* */ }
}

export function endCallNow(channel: string, inviteAt?: number, peerIds: string[] = []) {
  const ch = String(channel || '').trim();
  rememberEnded(ch, num(inviteAt));
  stopCallAudio();
  wipeLocalInvite();
  try {
    window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel: ch, at: Date.now(), inviteAt: num(inviteAt) } }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: `stooorna_call_ended_${ch}`,
      newValue: JSON.stringify({ channel: ch, at: Date.now() }),
    }));
  } catch { /* */ }
  const peers = peerIds.filter(Boolean);
  const clearPeer = (peerId: string) => {
    void fetch('/api/call/invite/clear', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: peerId, toUserId: peerId, channel: ch, clear: true, ended: true }),
      keepalive: true,
    }).catch(() => {});
    void fetch('/api/call/invite', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: peerId, userId: peerId, channel: ch, clear: true, ended: true, at: Date.now() }),
      keepalive: true,
    }).catch(() => {});
  };
  peers.forEach(clearPeer);
  window.setTimeout(() => peers.forEach(clearPeer), 600);
  window.setTimeout(() => peers.forEach(clearPeer), 1600);
}

function inviteOf(data: any): any {
  if (!data || typeof data !== 'object') return null;
  return data.invite || data.data || data.call || (data.channel ? data : null);
}

function stripIfEnded(data: any): any {
  const inv = inviteOf(data);
  if (!inv) return data;
  if (inv.ended || inv.clear || inv.answered) return { ...data, invite: null, channel: undefined };
  if (isEndedInvite(String(inv.channel || ''), num(inv.at))) return { ...data, invite: null, channel: undefined };
  return data;
}

const outgoingTimers = new Map<string, number>();

function armNoAnswer(channel: string, at: number, peers: string[]) {
  const key = sessionKey(channel, at);
  const prev = outgoingTimers.get(key);
  if (prev) window.clearTimeout(prev);
  const timer = window.setTimeout(() => {
    outgoingTimers.delete(key);
    endCallNow(channel, at, peers);
  }, NO_ANSWER_MS);
  outgoingTimers.set(key, timer);
}

function cancelNoAnswer(channel: string) {
  for (const [key, timer] of outgoingTimers) {
    if (key.startsWith(`${channel}@`)) {
      window.clearTimeout(timer);
      outgoingTimers.delete(key);
    }
  }
}

export function installCallSessionPatch() {
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

    if (url.includes('/api/call/invite') && method === 'POST' && body) {
      const channel = String(body.channel || '');
      const peers = [body.toUserId, body.userId, body.addresseeId].map((x: unknown) => String(x || '')).filter(Boolean);
      if (body.clear || body.ended || body.hangup) {
        rememberEnded(channel, num(body.at));
        cancelNoAnswer(channel);
        stopCallAudio();
      } else if (body.answered) {
        cancelNoAnswer(channel);
        stopCallAudio();
        rememberEnded(channel, num(body.at));
      } else if (channel && num(body.at)) {
        // مكالمة جديدة: لا تُحجب بسبب إغلاق قديم على نفس القناة.
        const prev = endedByChannel.get(channel);
        if (prev && num(body.at) > prev.endedAt) endedByChannel.delete(channel);
        armNoAnswer(channel, num(body.at), peers);
      }
    }

    const res = await origFetch(input, init);

    if (url.includes('/api/call/invite') && method === 'GET') {
      try {
        const cloned = res.clone();
        const data = await cloned.json();
        const stripped = stripIfEnded(data);
        if (stripped !== data) {
          stopCallAudio();
          return new Response(JSON.stringify(stripped), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        }
      } catch { /* */ }
    }
    return res;
  };

  const OrigWS = window.WebSocket;
  const PatchedWS = function (this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    const href = String(url);
    if (href.includes('/ws/call-signal')) {
      const origSend = ws.send.bind(ws);
      ws.send = (data: any) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : null;
          if (msg && (msg.type === 'hangup' || msg.type === 'call-end' || msg.type === 'ended')) {
            endCallNow(String(msg.channel || ''), num(msg.at), [String(msg.to || '')]);
          }
          if (msg && (msg.type === 'answered' || msg.type === 'call-answered')) {
            cancelNoAnswer(String(msg.channel || ''));
            stopCallAudio();
          }
        } catch { /* */ }
        return origSend(data);
      };
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data || ''));
          const type = String(msg?.type || '');
          if (type === 'hangup' || type === 'call-end' || type === 'ended') {
            endCallNow(String(msg.channel || ''), num(msg.at), [String(msg.from || '')]);
          }
          if (type === 'answered' || type === 'call-answered') stopCallAudio();
        } catch { /* */ }
      });
    }
    return ws;
  } as unknown as typeof WebSocket;
  PatchedWS.prototype = OrigWS.prototype;
  Object.setPrototypeOf(PatchedWS, OrigWS);
  window.WebSocket = PatchedWS;

  window.addEventListener('stooorna:home-call-ended', (e: Event) => {
    const d = (e as CustomEvent).detail || {};
    rememberEnded(String(d.channel || ''), num(d.inviteAt || d.at));
    stopCallAudio();
  });
  window.addEventListener('stooorna:stop-incoming-ring', () => stopCallAudio());

  // إذا بقيت دعوة محلية بعد الإغلاق، امسحها حتى لا يعيد الاستطلاع الرنين.
  window.setInterval(() => {
    try {
      const active = localStorage.getItem('stooorna_home_call_active_invite');
      if (active) {
        const d = JSON.parse(active);
        if (isEndedInvite(String(d.channel || ''), num(d.at))) {
          localStorage.removeItem('stooorna_home_call_active_invite');
          stopCallAudio();
          window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel: d.channel, at: Date.now() } }));
        }
      }
    } catch { /* */ }
  }, 1000);
}

installCallSessionPatch();
