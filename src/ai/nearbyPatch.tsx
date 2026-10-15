/**
 * NEARBY PATCH  (ملف مستقل — لا يعدّل StooornaAiSheet.tsx ولا friendChatPatch.tsx)
 *
 * ماذا يسوي:
 *  - يضيف زر نقطة زرقاء أعلى صفحة Stooorna Ai (بجانب زر القائمة) — يظهر لكل مستخدمي التطبيق.
 *  - الضغط عليها يفتح صفحة "القريبون" فيها زر بحث واحد (Hybrid Local Discovery):
 *      المسار 1 — البلوتوث (BLE / Nearby): أشخاص حولك مباشرة، بدون إنترنت.        🟢
 *      المسار 2 — الموقع الجغرافي (GPS): مستخدمو التطبيق في نفس الحي/المنطقة.       🔵
 *    النتيجة قائمة موحدة؛ كل اسم بجانبه مؤشر طريقة الاتصال. الضغط على اسم يفتح دردشة مباشرة.
 *  - الدردشة تشتغل كأنها بإنترنت: إرسال/استقبال مباشر بين الطرفين.
 *      * قريب بالبلوتوث  => ترسل مباشرة جهاز-لجهاز (تعمل بدون إنترنت) وتظهر ✓✓
 *      * فيه إنترنت       => ترسل عبر السيرفر /api/nearby/messages وتظهر ✓
 *      * لا بلوتوث ولا إنترنت => تُحفظ محلياً في سجل الجهاز (⏳) وتُرسل تلقائياً أول ما يتوفر أي مسار.
 *  - كل المحادثات تُخزَّن محلياً في الجهاز (localStorage) فتبقى ظاهرة حتى بدون إنترنت.
 *  - محصورة داخل مستخدمي التطبيق فقط: السيرفر يتحقق من الجلسة، والبلوتوث يستخدم Service-ID خاص بالتطبيق.
 *
 * الربط: سطر واحد في index.ts:  import './nearbyPatch';
 *
 * ⚠️ متطلبات خارج هذا الملف:
 *  - السيرفر:  server/nearby-routes.ts  + سطرين في entry.ts (مرفقين).
 *  - البلوتوث الحقيقي (جهاز-لجهاز بدون إنترنت) يحتاج إضافة أصلية Capacitor باسم StooornaNearby
 *    (مرفق StooornaNearbyPlugin.kt لأندرويد). بدونها يشتغل الموقع + الإنترنت فقط ويظهر "البلوتوث غير متاح".
 *    الويب (WebView) لا يستطيع عمل Advertise/Connect بالبلوتوث لوحده — لذلك الإضافة ضرورية.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

export const NEARBY_PATCH_VERSION = '1.0.0';

/* ───────────────────────── Types ───────────────────────── */
interface Me { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null }
interface Peer { id: string; name: string; avatar?: string | null; ble?: boolean; geo?: boolean; dist?: number }
type MsgStatus = 'pending' | 'sent' | 'ble' | 'failed';
interface Msg { id: string; clientId: string; from: string; to: string; text: string; ts: number; status?: MsgStatus }
interface ConvMeta { id: string; name: string; avatar?: string | null; ts: number; last?: string }
type BleState = 'off' | 'unavailable' | 'starting' | 'on' | 'denied';

const GREEN = '#0a1f1a';
const BLUE = '#3b82f6';

/* ───────────────────────── Local store (سجل البيانات المحلي) ───────────────────────── */
const kMsgs = (me: string, peer: string) => `stooorna_nearby_chat_v1_${me}_${peer}`;
const kIndex = (me: string) => `stooorna_nearby_index_v1_${me}`;
const kUnread = (me: string) => `stooorna_nearby_unread_v1_${me}`;
const kHidden = (me: string) => `stooorna_nearby_hidden_v1_${me}`;

const jget = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const jset = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

const loadMsgs = (me: string, peer: string): Msg[] => { const v = jget<Msg[]>(kMsgs(me, peer), []); return Array.isArray(v) ? v : []; };
const saveMsgs = (me: string, peer: string, l: Msg[]) => jset(kMsgs(me, peer), l.slice(-300));
const loadIndex = (me: string): ConvMeta[] => { const v = jget<ConvMeta[]>(kIndex(me), []); return Array.isArray(v) ? v : []; };

function mergeMsgs(prev: Msg[], inc: Msg[]): Msg[] {
  const map = new Map<string, Msg>();
  [...prev, ...inc].forEach(m => {
    const old = map.get(m.clientId);
    // never downgrade a delivered status back to pending
    const keepOld = old && old.status && old.status !== 'pending' && m.status === 'pending';
    map.set(m.clientId, { ...(old || {}), ...m, status: keepOld ? old!.status : (m.status ?? old?.status) } as Msg);
  });
  return [...map.values()].sort((a, b) => a.ts - b.ts).slice(-300);
}

const previewOf = (t: string) => (t.length > 40 ? t.slice(0, 40) + '…' : t);

/* ───────────────────────── Engine (غير مرتبط بـReact) ───────────────────────── */
const bus = new EventTarget();
const emit = (t: string) => bus.dispatchEvent(new Event(t));
const on = (t: string, f: () => void) => { bus.addEventListener(t, f); return () => bus.removeEventListener(t, f); };

const E = {
  me: null as Me | null,
  ble: 'off' as BleState,
  blePeers: new Map<string, Peer & { at: number }>(),
  openPeer: '' as string,         // chat currently on screen
  listeners: false,
  flushing: false,
};

const newId = () => `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

async function net<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** الإضافة الأصلية (Capacitor) للبلوتوث. تُعرَّف باسم StooornaNearby. */
function plugin(): any {
  try { const w: any = window; return w.StooornaNearby || w.Capacitor?.Plugins?.StooornaNearby || null; } catch { return null; }
}

function touchIndex(me: string, p: { id: string; name?: string; avatar?: string | null }, last?: string) {
  const list = loadIndex(me);
  const cur = list.find(x => x.id === p.id);
  const next: ConvMeta = { id: p.id, name: p.name || cur?.name || 'User', avatar: p.avatar ?? cur?.avatar ?? null, ts: Date.now(), last: last ?? cur?.last };
  jset(kIndex(me), [next, ...list.filter(x => x.id !== p.id)].slice(0, 100));
}

function bumpUnread(me: string, peer: string, n = 1) {
  const u = jget<Record<string, number>>(kUnread(me), {});
  u[peer] = (u[peer] || 0) + n; jset(kUnread(me), u);
}
function clearUnread(me: string, peer: string) {
  const u = jget<Record<string, number>>(kUnread(me), {});
  if (u[peer]) { delete u[peer]; jset(kUnread(me), u); }
}
const localUnreadTotal = (me: string) => Object.values(jget<Record<string, number>>(kUnread(me), {})).reduce((a, b) => a + (Number(b) || 0), 0);

function storeIncoming(me: Me, m: Msg, peerName?: string) {
  const peer = m.from === me.id ? m.to : m.from;
  saveMsgs(me.id, peer, mergeMsgs(loadMsgs(me.id, peer), [m]));
  touchIndex(me.id, { id: peer, name: peerName || E.blePeers.get(peer)?.name }, previewOf(m.text));
  if (m.from !== me.id && E.openPeer !== peer) bumpUnread(me.id, peer);
  emit('msgs');
}

/* ── البلوتوث (Nearby) ── */
async function bleStart(me: Me) {
  const p = plugin();
  if (!p) { E.ble = 'unavailable'; emit('ble'); return; }
  if (E.ble === 'on' || E.ble === 'starting') return;
  E.ble = 'starting'; emit('ble');
  try {
    if (!E.listeners) {
      E.listeners = true;
      p.addListener('peerFound', (d: any) => {
        if (!d?.id || String(d.id) === me.id) return;
        E.blePeers.set(String(d.id), { id: String(d.id), name: String(d.name || 'User'), avatar: d.avatar ?? null, ble: true, at: Date.now() });
        emit('peers'); void flushPending();
      });
      p.addListener('peerLost', (d: any) => { if (d?.id) { E.blePeers.delete(String(d.id)); emit('peers'); } });
      p.addListener('message', (d: any) => {
        const cur = E.me; if (!cur || !d?.from || !d?.text) return;
        storeIncoming(cur, { id: String(d.clientId || newId()), clientId: String(d.clientId || newId()), from: String(d.from), to: cur.id, text: String(d.text), ts: Number(d.ts) || Date.now(), status: 'ble' }, d.fromName);
      });
    }
    const r = await p.start({ id: me.id, name: String(me.name || me.username || 'User') });
    E.ble = r && r.granted === false ? 'denied' : 'on';
  } catch { E.ble = 'denied'; }
  emit('ble');
}
async function bleStop() {
  const p = plugin(); E.blePeers.clear();
  if (p && (E.ble === 'on' || E.ble === 'starting')) { try { await p.stop(); } catch { /* */ } }
  E.ble = 'off'; emit('ble'); emit('peers');
}
const bleReachable = (id: string) => E.ble === 'on' && E.blePeers.has(id);

/* ── التسليم: بلوتوث ← إنترنت ← حفظ محلي ── */
async function deliver(me: Me, m: Msg): Promise<Msg> {
  const peer = m.to;
  if (bleReachable(peer)) {
    try { await plugin().send({ peerId: peer, text: m.text, clientId: m.clientId, ts: m.ts, fromName: me.name || me.username || '' }); return { ...m, status: 'ble' }; } catch { /* جرّب الإنترنت */ }
  }
  if (isOnline()) {
    try {
      const d = await net('/api/nearby/messages', { method: 'POST', body: JSON.stringify({ receiverId: peer, body: m.text, clientId: m.clientId }) });
      return { ...m, status: 'sent', ...(typeof d?.ts === 'number' ? { ts: d.ts } : {}) };
    } catch { /* يبقى معلّقاً */ }
  }
  return { ...m, status: 'pending' };
}

async function sendText(me: Me, peer: Peer, text: string) {
  const m: Msg = { id: newId(), clientId: newId(), from: me.id, to: peer.id, text, ts: Date.now(), status: 'pending' };
  storeIncoming(me, m, peer.name);
  touchIndex(me.id, peer, previewOf(text));
  const done = await deliver(me, m);
  storeIncoming(me, done, peer.name);
}

/** إعادة إرسال الرسائل المعلّقة (عند عودة الإنترنت أو ظهور الطرف بالبلوتوث). */
async function flushPending() {
  const me = E.me; if (!me || E.flushing) return;
  E.flushing = true;
  try {
    for (const c of loadIndex(me.id)) {
      const pend = loadMsgs(me.id, c.id).filter(m => m.from === me.id && (m.status === 'pending' || m.status === 'failed'));
      for (const m of pend) {
        if (!bleReachable(c.id) && !isOnline()) break;
        const done = await deliver(me, m);
        if (done.status !== 'pending') storeIncoming(me, done, c.name);
      }
    }
  } finally { E.flushing = false; }
}

/** مزامنة الرسائل من السيرفر (فقط عند وجود إنترنت). GET يعلّم الواردة كمقروءة. */
async function syncPeer(me: Me, peerId: string, name?: string) {
  if (!isOnline()) return;
  try {
    const d = await net(`/api/nearby/messages?with=${encodeURIComponent(peerId)}`);
    const arr: any[] = Array.isArray(d) ? d : d?.messages || [];
    if (!arr.length) return;
    const inc: Msg[] = arr.map(o => ({
      id: `db-${o.id}`, clientId: String(o.clientId || `db-${o.id}`), from: String(o.from), to: String(o.to), text: String(o.text ?? ''), ts: Number(o.ts) || Date.now(), status: 'sent' as MsgStatus,
    }));
    const prev = loadMsgs(me.id, peerId);
    const merged = mergeMsgs(prev, inc);
    if (JSON.stringify(merged) !== JSON.stringify(prev)) {
      saveMsgs(me.id, peerId, merged);
      const last = merged[merged.length - 1];
      touchIndex(me.id, { id: peerId, name }, previewOf(last.text));
      emit('msgs');
    }
  } catch { /* */ }
}

/* ── الموقع الجغرافي ── */
function getPos(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('nogeo'));
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  });
}
async function geoSearch(radius: number): Promise<Peer[]> {
  const pos = await getPos();
  await net('/api/nearby/ping', { method: 'POST', body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }) });
  const d = await net(`/api/nearby?radius=${radius}`);
  return (Array.isArray(d) ? d : d?.users || []).map((o: any): Peer => ({ id: String(o.id), name: String(o.name || o.username || 'User'), avatar: o.avatar ?? o.avatarUrl ?? null, geo: true, dist: Number(o.distance) }));
}

/* ───────────────────────── Helpers UI ───────────────────────── */
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDist = (d?: number) => (d == null || !Number.isFinite(d) ? '' : d < 1000 ? `${Math.max(1, Math.round(d))} م` : `${(d / 1000).toFixed(1)} كم`);

function findUser(el: Element): Me | null {
  try {
    const k = Object.keys(el).find(x => x.startsWith('__reactFiber$') || x.startsWith('__reactInternalInstance$'));
    let f: any = k ? (el as any)[k] : null; let n = 0;
    while (f && n++ < 80) {
      const p = f.memoizedProps;
      if (p && typeof p === 'object' && 'user' in p && 'onClose' in p && 'open' in p) return p.user && p.user.id ? { ...p.user, id: String(p.user.id) } : null;
      f = f.return;
    }
  } catch { /* */ }
  const g = (window as any).__STOOORNA_USER__;
  return g && g.id ? g : null;
}
interface SheetEls { inner: HTMLElement; header: HTMLElement; btn: HTMLElement }
function scanSheet(): SheetEls | null {
  const btn = document.querySelector('button[aria-label="History"]') as HTMLElement | null;
  const header = btn?.parentElement?.parentElement as HTMLElement | null | undefined;
  const inner = header?.parentElement as HTMLElement | null | undefined;
  if (!btn || !header || !inner) return null;
  return { inner, header, btn };
}

function Avatar({ p, size = 46 }: { p: { name: string; avatar?: string | null }; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.4 }}>
      {p.avatar ? <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.name.trim().charAt(0).toUpperCase() || '?')}
    </span>
  );
}

/** طبقة كاملة على document.body (خارج الـSheet) حتى لا يبتلع الـSheet اللمس — نفس فكرة ModalLayer في friendChatPatch. */
function Layer({ children, onEsc }: { children: React.ReactNode; onEsc: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const stop = (e: Event) => { if (el.contains(e.target as Node)) e.stopPropagation(); };
    const evs = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel', 'focusin', 'keydown'];
    evs.forEach(n => document.body.addEventListener(n, stop, { passive: true } as AddEventListenerOptions));
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onEsc(); };
    el.addEventListener('keydown', key);
    return () => { evs.forEach(n => document.body.removeEventListener(n, stop)); el.removeEventListener('keydown', key); };
  }, [onEsc]);
  return (
    <div ref={ref} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 2147483100, background: '#fff', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', touchAction: 'auto', overscrollBehavior: 'contain', fontFamily: 'inherit' }}>
      {children}
    </div>
  );
}

/* ───────────────────────── صفحة القريبون ───────────────────────── */
function NearbyPage({ me, onClose }: { me: Me; onClose: () => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force(x => x + 1), []);
  const [geoPeers, setGeoPeers] = useState<Peer[]>([]);
  const [scanning, setScanning] = useState(false);
  const [searched, setSearched] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [radius, setRadius] = useState(3000);
  const [hidden, setHidden] = useState<boolean>(() => !!jget(kHidden(me.id), false));
  const [chat, setChat] = useState<Peer | null>(null);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const offs = [on('peers', rerender), on('ble', rerender), on('msgs', rerender)]; return () => offs.forEach(f => f()); }, [rerender]);

  /* القائمة الموحدة */
  const peers = useMemo(() => {
    const map = new Map<string, Peer>();
    geoPeers.forEach(p => map.set(p.id, { ...p }));
    E.blePeers.forEach(p => { const c = map.get(p.id); map.set(p.id, { ...(c || p), ...p, ble: true, geo: c?.geo, dist: c?.dist }); });
    return [...map.values()].filter(p => p.id !== me.id).sort((a, b) => (a.ble === b.ble ? (a.dist ?? 1e9) - (b.dist ?? 1e9) : a.ble ? -1 : 1));
  }, [geoPeers, me.id, E.blePeers.size, E.ble]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    if (scanning) return;
    setScanning(true); setSearched(true); setGeoNote('');
    void bleStart(me); // البلوتوث يبقى شغّال أثناء فتح الصفحة (الأسماء تظهر مباشرة)
    const geo = (async () => {
      if (hidden) { setGeoNote('الموقع مخفي — تم تفعيل إخفاء موقعي'); return; }
      if (!isOnline()) { setGeoNote('لا يوجد إنترنت — البحث بالبلوتوث فقط'); return; }
      try { setGeoPeers(await geoSearch(radius)); }
      catch (e: any) { setGeoNote(e?.code === 1 ? 'صلاحية الموقع مرفوضة — فعّلها من إعدادات الجهاز' : 'تعذّر تحديد الموقع'); }
    })();
    await Promise.all([geo, new Promise(r => setTimeout(r, 6000))]); // 6 ثوانٍ لاكتشاف البلوتوث
    setScanning(false); rerender();
  };

  const toggleHidden = async () => {
    const v = !hidden; setHidden(v); jset(kHidden(me.id), v);
    if (v) { try { await net('/api/nearby/ping', { method: 'DELETE' }); } catch { /* */ } setGeoPeers([]); }
  };

  /* الدردشة */
  const openChat = (p: Peer) => {
    E.openPeer = p.id; clearUnread(me.id, p.id);
    touchIndex(me.id, p); setChat(p); setMsgs(loadMsgs(me.id, p.id)); emit('msgs');
    void syncPeer(me, p.id, p.name);
  };
  const closeChat = () => { E.openPeer = ''; setChat(null); setText(''); };
  useEffect(() => { if (!chat) return; const refresh = () => { setMsgs(loadMsgs(me.id, chat.id)); clearUnread(me.id, chat.id); }; refresh(); return on('msgs', refresh); }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, chat?.id]);
  useEffect(() => { // استقبال مباشر: مزامنة كل 3 ثوانٍ مع السيرفر (بدون إنترنت يكتفي بالاستقبال عبر البلوتوث)
    if (!chat) return;
    const t = window.setInterval(() => { void syncPeer(me, chat.id, chat.name); void flushPending(); }, 3000);
    return () => window.clearInterval(t);
  }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { E.openPeer = ''; }, []);

  const submit = () => { const t = text.trim(); if (!t || !chat) return; setText(''); void sendText(me, chat, t); };

  const conv = loadIndex(me.id);
  const unreadMap = jget<Record<string, number>>(kUnread(me.id), {});
  const reach = chat ? (bleReachable(chat.id) ? 'ble' : isOnline() ? 'net' : 'off') : 'off';

  const bleMsg = E.ble === 'unavailable' ? 'البلوتوث غير متاح (الإضافة الأصلية غير مثبتة)' : E.ble === 'denied' ? 'صلاحية البلوتوث/القريبين مرفوضة' : E.ble === 'on' ? 'البلوتوث شغّال' : E.ble === 'starting' ? 'جارٍ تشغيل البلوتوث…' : '';

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'max(12px, env(safe-area-inset-top)) 14px 12px', borderBottom: '1px solid #eee', background: '#fff' }}>
      <button type="button" aria-label="Back" onClick={chat ? closeChat : onClose}
        style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: GREEN, color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 }}>{chat ? '→' : '✕'}</button>
      {chat ? (
        <>
          <Avatar p={chat} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.name}</div>
            <div style={{ fontSize: 12, color: reach === 'ble' ? '#16a34a' : reach === 'net' ? BLUE : '#9ca3af' }}>
              {reach === 'ble' ? '🟢 متصل بالبلوتوث — مباشر' : reach === 'net' ? '🔵 عبر الإنترنت' : '⏳ لا يوجد اتصال — تُحفظ وتُرسل تلقائياً'}
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, fontWeight: 800, fontSize: 18 }}>القريبون</div>
      )}
    </div>
  );

  if (chat) {
    return (
      <>
        {header}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, background: '#f7f8f8' }}>
          {msgs.length === 0 && <div style={{ margin: 'auto', color: '#9ca3af', fontSize: 14 }}>ابدأ الدردشة مع {chat.name}</div>}
          {msgs.map(m => {
            const mine = m.from === me.id;
            return (
              <div key={m.clientId} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                <div dir="auto" style={{ background: mine ? GREEN : '#fff', color: mine ? '#fff' : '#111', border: mine ? 'none' : '1px solid #e5e7eb', borderRadius: 16, padding: '8px 12px', fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, textAlign: mine ? 'left' : 'right' }}>
                  {hhmm(m.ts)}{mine ? (m.status === 'ble' ? ' ✓✓' : m.status === 'sent' ? ' ✓' : m.status === 'pending' ? ' ⏳' : ' !') : ''}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px max(12px, env(safe-area-inset-bottom))', borderTop: '1px solid #eee', background: '#fff' }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} dir="auto" placeholder="اكتب رسالة…"
            style={{ flex: 1, height: 46, borderRadius: 23, border: 'none', background: GREEN, color: '#fff', padding: '0 18px', fontSize: 15, outline: 'none' }} />
          <button type="button" onClick={submit} aria-label="Send" style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: BLUE, color: '#fff', fontSize: 18, cursor: 'pointer', padding: 0 }}>➤</button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>
        {/* زر البحث الموحد */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 14px' }}>
          <style>{`@keyframes snaPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.55); } 50% { box-shadow: 0 0 0 16px rgba(59,130,246,0); } }
                   @keyframes snaSpin { to { transform: rotate(360deg); } }`}</style>
          <button type="button" onClick={search} disabled={scanning} aria-label="Search nearby"
            style={{ width: 96, height: 96, borderRadius: '50%', border: 'none', background: `linear-gradient(145deg, ${BLUE}, #1d4ed8)`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', animation: scanning ? 'snaPulse 1.2s infinite' : undefined, opacity: scanning ? 0.9 : 1 }}>
            {scanning ? <span style={{ display: 'inline-block', animation: 'snaSpin 1s linear infinite' }}>◌</span> : 'بحث'}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {[[500, '500 م'], [3000, '3 كم'], [20000, '20 كم']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setRadius(Number(v))} style={{ border: '1px solid ' + (radius === v ? BLUE : '#d1d5db'), background: radius === v ? '#eff6ff' : '#fff', color: radius === v ? BLUE : '#374151', borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            {[bleMsg, geoNote].filter(Boolean).join(' · ') || 'يبحث بالبلوتوث + الموقع معاً — مستخدمو التطبيق فقط'}
          </div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={hidden} onChange={toggleHidden} /> إخفاء موقعي عن الآخرين
          </label>
        </div>

        {/* النتائج */}
        {searched && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 14, margin: '4px 2px 8px' }}>النتائج ({peers.length})</div>
            {peers.length === 0 && !scanning && <div style={{ color: '#9ca3af', fontSize: 14, padding: 10 }}>ما لقينا أحد قريب الآن</div>}
            {peers.map(p => (
              <button key={p.id} type="button" onClick={() => openChat(p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 22, background: '#fff', cursor: 'pointer', textAlign: 'start' }}>
                <Avatar p={p} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 16, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: '#6b7280' }}>
                    {p.ble ? '🟢 بلوتوث — قريب جداً' : ''}{p.ble && p.geo ? ' · ' : ''}{p.geo ? `🔵 الموقع — ${fmtDist(p.dist) || 'نفس المنطقة'}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* المحادثات المحفوظة محلياً */}
        {conv.length > 0 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, margin: '4px 2px 8px' }}>المحادثات</div>
            {conv.map(c => (
              <button key={c.id} type="button" onClick={() => openChat({ id: c.id, name: c.name, avatar: c.avatar })} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 22, background: '#fff', cursor: 'pointer', textAlign: 'start' }}>
                <Avatar p={c} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 16, color: '#111' }}>{c.name}</span>
                  <span dir="auto" style={{ display: 'block', fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last || ''}</span>
                </span>
                {unreadMap[c.id] ? <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{unreadMap[c.id]}</span> : null}
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{hhmm(c.ts)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ───────────────────────── النقطة الزرقاء + الربط بالـSheet ───────────────────────── */
function NearbyPatch() {
  const [sheet, setSheet] = useState<SheetEls | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    let raf = 0;
    const scan = () => {
      raf = 0; const next = scanSheet();
      setSheet(prev => (!next ? (prev ? null : prev) : prev && prev.inner === next.inner && prev.header === next.header ? prev : next));
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true }); scan();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!sheet) { setMe(null); setOpen(false); E.me = null; void bleStop(); return; }
    const u = findUser(sheet.btn); setMe(u); E.me = u;
    if (u) void bleStart(u); // الاستقبال بالبلوتوث يعمل طالما صفحة Stooorna Ai مفتوحة
  }, [sheet]);

  /* عدّاد الرسائل غير المقروءة + إعادة إرسال المعلّق عند عودة الإنترنت */
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const tick = async () => {
      let n = localUnreadTotal(me.id);
      if (isOnline() && !open) { try { const d = await net('/api/nearby/unread'); n += Object.values(d?.bySender || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0); } catch { /* */ } }
      if (alive) setBadge(n);
    };
    void tick();
    const t = window.setInterval(tick, 5000);
    const offMsgs = on('msgs', () => { void tick(); });
    const onNet = () => { void flushPending(); void tick(); };
    window.addEventListener('online', onNet);
    return () => { alive = false; window.clearInterval(t); offMsgs(); window.removeEventListener('online', onNet); };
  }, [me?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheet || !me) return null;
  return (
    <>
      {createPortal(
        <button type="button" aria-label="Nearby" title="القريبون" onClick={() => setOpen(true)}
          style={{ position: 'absolute', right: 92, top: 0, bottom: 0, margin: 'auto 0', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', zIndex: 9, touchAction: 'manipulation' }}>
          <style>{`@keyframes snaDot { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.55); } 50% { box-shadow: 0 0 0 9px rgba(59,130,246,0); } }`}</style>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: BLUE, animation: 'snaDot 1.8s ease-in-out infinite', position: 'relative' }}>
            {badge > 0 && <span style={{ position: 'absolute', top: -9, right: -11, minWidth: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: '18px', textAlign: 'center', padding: '0 4px', border: '2px solid #fff', boxSizing: 'content-box' }}>{badge > 99 ? '99+' : badge}</span>}
          </span>
        </button>,
        sheet.header,
      )}
      {open && createPortal(<Layer onEsc={() => setOpen(false)}><NearbyPage me={me} onClose={() => setOpen(false)} /></Layer>, document.body)}
    </>
  );
}

export function installNearbyPatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w: any = window;
  if (w.__STOOORNA_NEARBY_PATCH__) return;
  w.__STOOORNA_NEARBY_PATCH__ = NEARBY_PATCH_VERSION;
  const mount = () => {
    const host = document.createElement('div');
    host.id = 'stooorna-nearby-patch';
    document.body.appendChild(host);
    createRoot(host).render(<NearbyPatch />);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

installNearbyPatch();
