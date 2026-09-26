/**
 * Live chat transport used by public voice room and account live rooms.
 * English-only.
 */
export const LIVE_ENDED_TITLE = 'Live ended';
export const LIVE_ENDED_BODY = 'The host closed this room.';
export const LIVE_ENDED_HINT = 'You will leave automatically.';

export type LiveChatMsg = {
  t?: string;
  id: string;
  uid?: number;
  userId?: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  text: string;
  at: number;
  isMe?: boolean;
};

export function makeChatPayload(opts: {
  uid?: number;
  userId?: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  text: string;
}): LiveChatMsg {
  return {
    t: 'chat',
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    uid: opts.uid,
    userId: opts.userId,
    name: opts.name || 'User',
    username: opts.username ?? null,
    avatarUrl: opts.avatarUrl ?? null,
    text: String(opts.text || '').slice(0, 400),
    at: Date.now(),
  };
}

export function parseIncomingChat(raw: unknown): LiveChatMsg | null {
  const m = raw as Partial<LiveChatMsg> | null;
  if (!m || (m.t && m.t !== 'chat')) {
    if (!m || typeof m.text !== 'string') return null;
  }
  const text = String((m as any)?.text || '').trim();
  if (!text) return null;
  return {
    t: 'chat',
    id: String((m as any).id || `c_${Date.now()}`),
    uid: typeof (m as any).uid === 'number' ? (m as any).uid : undefined,
    userId: (m as any).userId ? String((m as any).userId) : undefined,
    name: String((m as any).name || 'User'),
    username: (m as any).username ? String((m as any).username) : null,
    avatarUrl: (m as any).avatarUrl ? String((m as any).avatarUrl) : null,
    text,
    at: Number((m as any).at || Date.now()),
  };
}

function chatKey(channel: string) {
  return `stooorna_live_chat_${String(channel || '').slice(0, 80)}`;
}

/**
 * Guard: only real chat messages (t === 'chat' with non-empty text) are
 * allowed into the chat store. Room-control signals (freeze-set, mic-req,
 * mic-grant, speakers-set, room-ended, etc.) are sent through this same
 * helper by callers such as sendDataPayload() in the live room pages, but
 * they do not belong in the chat log — the host's periodic freeze-set
 * broadcast (every ~2s for the whole duration of a private room) would
 * otherwise flood the chat store and bury or crowd out real messages.
 * The public room never emits host-only control signals, which is why it
 * was unaffected while private host rooms were.
 */
function isRealChatPayload(payload: object): boolean {
  const p = payload as { t?: string; text?: unknown };
  if (p && p.t && p.t !== 'chat') return false;
  return typeof p?.text === 'string' && p.text.trim().length > 0;
}

export function publishLiveChat(channel: string, payload: object) {
  if (!channel) return;
  if (!isRealChatPayload(payload)) return;
  const key = chatKey(channel);
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, _at: Date.now() }));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(key, { detail: payload }));
  } catch {
    /* ignore */
  }
  try {
    const w = window as any;
    if (!w.__stooornaLiveChatBC) w.__stooornaLiveChatBC = {};
    if (!w.__stooornaLiveChatBC[key] && typeof BroadcastChannel !== 'undefined') {
      w.__stooornaLiveChatBC[key] = new BroadcastChannel(key);
    }
    w.__stooornaLiveChatBC[key]?.postMessage(payload);
  } catch {
    /* ignore */
  }
  void fetch('/api/live-chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, payload }),
  }).catch(() => {});
}

export function subscribeLiveChat(channel: string, handle: (msg: LiveChatMsg) => void): () => void {
  if (!channel) return () => {};
  const key = chatKey(channel);
  const onEvt = (e: Event) => {
    const d = (e as CustomEvent).detail;
    const cm = parseIncomingChat(d);
    if (cm) handle(cm);
  };
  const onBc = (e: MessageEvent) => {
    const cm = parseIncomingChat(e.data);
    if (cm) handle(cm);
  };
  window.addEventListener(key, onEvt as EventListener);
  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(key);
      bc.onmessage = onBc;
    }
  } catch {
    /* ignore */
  }
  let since = 0;
  let on = true;
  const poll = async () => {
    if (!on) return;
    try {
      const r = await fetch(`/api/live-chat?channel=${encodeURIComponent(channel)}&since=${since}`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      const list = (d.messages || d.items || []) as Array<{ payload?: unknown; at?: number } | LiveChatMsg>;
      for (const item of list) {
        const payload = (item as any).payload ?? item;
        const at = Number((item as any).at || (payload as any).at || 0);
        if (at > since) since = at;
        const cm = parseIncomingChat(payload);
        if (cm) handle(cm);
      }
    } catch {
      /* ignore */
    }
  };
  const timer = window.setInterval(poll, 900);
  void poll();
  return () => {
    on = false;
    window.clearInterval(timer);
    window.removeEventListener(key, onEvt as EventListener);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}

export function publishLiveActive(info: {
  hostId?: string;
  active?: boolean;
  kind?: string;
  name?: string;
  username?: string | null;
  avatarUrl?: string | null;
} | string, active?: boolean) {
  const hostId = typeof info === 'string' ? info : info.hostId;
  const isActive = typeof info === 'string' ? !!active : !!info.active;
  try {
    window.dispatchEvent(new CustomEvent('stooorna:live-active', { detail: { hostId, active: isActive, ...(typeof info === 'object' ? info : {}) } }));
  } catch { /* ignore */ }
}
