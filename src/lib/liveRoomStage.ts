/**
 * Account-live stage helpers (voice + camera).
 * English-only.
 */
import { getVipMaxSpeakers } from '@/lib/vipPatch';

export const MAX_LIVE_SPEAKERS = 4;

export type LiveSignal = {
  t: string;
  uid?: number;
  uids?: number[];
  userId?: string;
  name?: string;
  username?: string | null;
  avatarUrl?: string | null;
  text?: string;
  id?: string;
  host?: number | null;
  hostId?: string;
  speakers?: number[];
  at?: number;
  ts?: number;
};

export type MicRequest = {
  uid: number;
  userId?: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  at: number;
};

export function liveSignalKey(channel: string): string {
  return `stooorna_live_sig_${String(channel || '').slice(0, 80)}`;
}

export function publishLiveSignal(channel: string, payload: object) {
  if (!channel) return;
  const key = liveSignalKey(channel);
  const raw = JSON.stringify({ ...payload, _ch: channel, _at: Date.now() });
  try {
    localStorage.setItem(key, raw);
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
    if (!w.__stooornaLiveSigBC) w.__stooornaLiveSigBC = {};
    let bc = w.__stooornaLiveSigBC[key] as BroadcastChannel | undefined;
    if (!bc && typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(key);
      w.__stooornaLiveSigBC[key] = bc;
    }
    bc?.postMessage(payload);
  } catch {
    /* ignore */
  }
}

export async function postLiveSignalHttp(channel: string, payload: object) {
  try {
    await fetch('/api/room/signal', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, payload, data: payload, t: (payload as any).t }),
    });
  } catch {
    /* endpoint optional */
  }
}

export function subscribeLiveSignals(
  channel: string,
  onMsg: (msg: LiveSignal) => void,
): () => void {
  if (!channel) return () => {};
  const key = liveSignalKey(channel);
  const seen = new Set<string>();
  const handle = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as LiveSignal;
    if (!msg.t) return;
    const id = String(
      (msg as any).id || `${msg.t}_${msg.uid ?? ''}_${msg.ts ?? msg.at ?? ''}_${(msg as any).text ?? ''}`,
    );
    if (seen.has(id)) return;
    seen.add(id);
    if (seen.size > 400) seen.clear();
    onMsg(msg);
  };

  const onCustom = (e: Event) => handle((e as CustomEvent).detail);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key || !e.newValue) return;
    try {
      handle(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener(key, onCustom as EventListener);
  window.addEventListener('storage', onStorage);

  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(key);
      bc.onmessage = (ev) => handle(ev.data);
    }
  } catch {
    bc = null;
  }

  let since = Date.now() - 4000;
  let pollOn = true;
  const poll = async () => {
    if (!pollOn) return;
    try {
      const r = await fetch(
        `/api/room/signal?roomId=${encodeURIComponent(channel)}&since=${since}`,
        { credentials: 'include' },
      );
      if (!r.ok) return;
      const d = await r.json();
      const list = (d.messages ?? d.signals ?? d.items ?? (Array.isArray(d) ? d : [])) as Array<
        { payload?: LiveSignal; data?: LiveSignal; at?: number } | LiveSignal
      >;
      for (const item of list) {
        const payload = (item as any).payload ?? (item as any).data ?? item;
        const at = Number((item as any).at || (payload as any).at || (payload as any).ts || Date.now());
        if (at > since) since = at;
        handle(payload);
      }
    } catch {
      /* ignore */
    }
  };
  const timer = window.setInterval(poll, 1200);
  void poll();

  return () => {
    pollOn = false;
    window.clearInterval(timer);
    window.removeEventListener(key, onCustom as EventListener);
    window.removeEventListener('storage', onStorage);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}

export function canGrantSpeaker(speakers: Set<number>, uid: number, hostId?: string | null): boolean {
  if (speakers.has(uid)) return true;
  const cap = getVipMaxSpeakers(hostId);
  return speakers.size < cap;
}

export function makeMicRequestPayload(opts: {
  uid: number;
  userId?: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
}): LiveSignal {
  return {
    t: 'mic-req',
    uid: opts.uid,
    userId: opts.userId,
    name: opts.name || 'User',
    username: opts.username ?? null,
    avatarUrl: opts.avatarUrl ?? null,
    at: Date.now(),
    ts: Date.now(),
    id: `req_${opts.uid}_${Date.now()}`,
  };
}
