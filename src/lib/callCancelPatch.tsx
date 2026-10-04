/**
 * lib/callCancelPatch.tsx
 * باتش مستقل: إذا المتصل سكّر قبل الرد، الرنين يوقف فوراً عند الطرف الثاني
 * والمكالمة تختفي وتتسجل مسكول. ما يلغي أي إضافة سابقة.
 */
export type CancelTarget = { id: string; name?: string | null; avatarUrl?: string | null };

function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function blastCallCancel(channel: string, targets: CancelTarget[], fromId: string) {
  const ch = String(channel || '').trim();
  if (!ch || !fromId) return;
  const ids = targets.map(t => String(t.id || '')).filter(id => id && id !== fromId);
  const sendOnce = () => {
    const at = Date.now();
    for (const id of ids) {
      post('/api/call/signal', { to: id, type: 'hangup', id: `cancel_${at}_${id}`, payload: { channel: ch, from: fromId, at, reason: 'cancelled' } });
      post('/api/call/signal', { to: id, type: 'cancel', id: `cancel2_${at}_${id}`, payload: { channel: ch, from: fromId, at, reason: 'cancelled' } });
      post('/api/call/invite', { toUserId: id, userId: id, channel: ch, ended: true, clear: true, at, hostId: fromId });
      post('/api/call/invite/clear', { toUserId: id, userId: id, channel: ch });
      post('/api/call/cancel', { toUserId: id, userId: id, channel: ch, from: fromId, missed: true });
      post('/api/call/end', { channel: ch, userId: fromId, peerId: id, missed: true });
    }
    try {
      localStorage.setItem(`stooorna_call_ended_${ch}`, JSON.stringify({ channel: ch, by: fromId, at, reason: 'cancelled' }));
    } catch { /* */ }
  };
  sendOnce();
  let n = 0;
  const timer = window.setInterval(() => {
    n += 1;
    sendOnce();
    if (n >= 6) window.clearInterval(timer);
  }, 700);
}

function stopLocalRing(channel: string, fromId?: string) {
  try { window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring')); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } })); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel, at: Date.now(), remote: true, reason: 'cancelled', by: fromId || '' } })); } catch { /* */ }
  if (fromId) {
    try {
      const key = 'stooorna_call_log';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        list.unshift({ peerId: fromId, direction: 'in', status: 'missed', at: Date.now() });
        localStorage.setItem(key, JSON.stringify(list.slice(0, 80)));
      }
    } catch { /* */ }
  }
}

/** يشتغل عند المستقبِل طول ما الحساب مفتوح، حتى لو صفحة الاتصال ما سحبت الإشارة. */
export function installCallCancelWatch(userId: string | null | undefined) {
  if (!userId || typeof window === 'undefined') return () => {};
  let stopped = false;
  const seen = new Set<string>();
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await fetch(`/api/call/signal?userId=${encodeURIComponent(userId)}`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const list = (d?.signals || d?.items || d || []) as any[];
      if (!Array.isArray(list)) return;
      for (const msg of list) {
        const type = String(msg?.type || '');
        if (type !== 'hangup' && type !== 'cancel' && type !== 'call-end' && type !== 'ended') continue;
        const id = String(msg?.id || `${type}_${msg?.at || ''}`);
        if (seen.has(id)) continue;
        seen.add(id);
        const payload = msg?.payload || msg;
        stopLocalRing(String(payload?.channel || msg?.channel || ''), String(payload?.from || msg?.from || ''));
      }
    } catch { /* */ }
    try {
      const r = await fetch(`/api/call/invite?userId=${encodeURIComponent(userId)}&toUserId=${encodeURIComponent(userId)}`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const inv = d?.invite || d;
      if (inv && (inv.ended || inv.clear)) stopLocalRing(String(inv.channel || ''), String(inv.hostId || inv.from || ''));
    } catch { /* */ }
  };
  void tick();
  const timer = window.setInterval(() => { void tick(); }, 1200);
  return () => { stopped = true; window.clearInterval(timer); };
}
