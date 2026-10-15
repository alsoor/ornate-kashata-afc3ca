/**
 * NEARBY PATCH  (ملف مستقل — لا يعدّل StooornaAiSheet.tsx ولا friendChatPatch.tsx)
 *
 * ماذا يسوي:
 *  - يضيف نقطة زرقاء صغيرة في صفحة "قائمة الشات" فقط (اللي فيها زر اختر صديقاً) — لا تظهر في رئيسية Stooorna Ai ولا داخل الشات.
 *  - الضغط عليها يفتح صفحة البحث (Hybrid Local Discovery) بزر واحد:
 *      المسار 1 — البلوتوث (BLE / Nearby): أشخاص حولك مباشرة، بدون إنترنت.        🟢
 *      المسار 2 — الموقع الجغرافي (GPS): مستخدمو التطبيق في نفس الحي/المنطقة.       🔵
 *  - اختيار شخص من النتائج => ينزل مباشرة تحت قائمة الشات (نفس المستطيلات) قبل الدخول عليه،
 *    وعليه علامة "من البلوتوث" أو "من الموقع"؛ والعلامة تظهر أيضاً أعلى الدردشة نفسها.
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

export const NEARBY_PATCH_VERSION = '1.1.0';

/* ───────────────────────── Types ───────────────────────── */
interface Me { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null }
interface Peer { id: string; name: string; avatar?: string | null; ble?: boolean; geo?: boolean; dist?: number }
type MsgStatus = 'pending' | 'sent' | 'ble' | 'failed';
interface Msg { id: string; clientId: string; from: string; to: string; text: string; ts: number; status?: MsgStatus }
interface ConvMeta { id: string; name: string; avatar?: string | null; ts: number; last?: string; ble?: boolean; geo?: boolean } // ble/geo = how I met this person
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
  srvUnread: {} as Record<string, number>, // unread per sender from the server
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

function touchIndex(me: string, p: { id: string; name?: string; avatar?: string | null; ble?: boolean; geo?: boolean }, last?: string) {
  const list = loadIndex(me);
  const cur = list.find(x => x.id === p.id);
  const next: ConvMeta = {
    id: p.id, name: p.name || cur?.name || 'User', avatar: p.avatar ?? cur?.avatar ?? null, ts: Date.now(), last: last ?? cur?.last,
    ble: !!(p.ble || cur?.ble), geo: !!(p.geo || cur?.geo), // العلامة تبقى: عرفته من البلوتوث / من الموقع
  };
  jset(kIndex(me), [next, ...list.filter(x => x.id !== p.id)].slice(0, 100));
}
function removeConv(me: string, peer: string) {
  jset(kIndex(me), loadIndex(me).filter(x => x.id !== peer));
  try { localStorage.removeItem(kMsgs(me, peer)); } catch { /* */ }
  clearUnread(me, peer); emit('msgs');
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
  touchIndex(me.id, { id: peer, name: peerName || E.blePeers.get(peer)?.name, ble: E.blePeers.has(peer) || undefined }, previewOf(m.text));
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

/* ───────────────────────── علامة المصدر: بلوتوث / موقع ───────────────────────── */
function Origin({ ble, geo, long }: { ble?: boolean; geo?: boolean; long?: boolean }) {
  if (!ble && !geo) return null;
  const chip = (bg: string, fg: string, t: string) => (
    <span style={{ display: 'inline-block', background: bg, color: fg, borderRadius: 999, padding: '1px 8px', fontSize: long ? 12.5 : 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{t}</span>
  );
  return (
    <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
      {ble && chip('#dcfce7', '#15803d', long ? '🟢 هذا الشخص من البلوتوث' : '🟢 من البلوتوث')}
      {geo && chip('#dbeafe', '#1d4ed8', long ? '🔵 هذا الشخص كلمته من الموقع' : '🔵 من الموقع')}
    </span>
  );
}

/* ───────────────────────── صفحة البحث + الدردشة (طبقة كاملة) ───────────────────────── */
function NearbyPage({ me, onClose, initialChat }: { me: Me; onClose: () => void; initialChat?: Peer }) {
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

  const peers = useMemo(() => {
    const map = new Map<string, Peer>();
    geoPeers.forEach(p => map.set(p.id, { ...p }));
    E.blePeers.forEach(p => { const c = map.get(p.id); map.set(p.id, { ...(c || p), ...p, ble: true, geo: c?.geo, dist: c?.dist }); });
    return [...map.values()].filter(p => p.id !== me.id).sort((a, b) => (a.ble === b.ble ? (a.dist ?? 1e9) - (b.dist ?? 1e9) : a.ble ? -1 : 1));
  }, [geoPeers, me.id, E.blePeers.size, E.ble]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    if (scanning) return;
    setScanning(true); setSearched(true); setGeoNote('');
    void bleStart(me);
    const geo = (async () => {
      if (hidden) { setGeoNote('الموقع مخفي — فعّلت إخفاء موقعي'); return; }
      if (!isOnline()) { setGeoNote('لا يوجد إنترنت — البحث بالبلوتوث فقط'); return; }
      try { setGeoPeers(await geoSearch(radius)); }
      catch (e: any) { setGeoNote(e?.code === 1 ? 'صلاحية الموقع مرفوضة — فعّلها من إعدادات الجهاز' : 'تعذّر تحديد الموقع'); }
    })();
    await Promise.all([geo, new Promise(r => setTimeout(r, 6000))]);
    setScanning(false); rerender();
  };

  const toggleHidden = async () => {
    const v = !hidden; setHidden(v); jset(kHidden(me.id), v);
    if (v) { try { await net('/api/nearby/ping', { method: 'DELETE' }); } catch { /* */ } setGeoPeers([]); }
  };

  /** اختيار شخص من النتائج => ينزل مباشرة تحت قائمة الشات (بنفس شكل المستطيلات) قبل الدخول عليه. */
  const pick = (p: Peer) => {
    touchIndex(me.id, { id: p.id, name: p.name, avatar: p.avatar, ble: !!p.ble, geo: !!p.geo });
    emit('msgs'); onClose();
  };

  /* الدردشة */
  const openChat = (p: Peer) => {
    E.openPeer = p.id; clearUnread(me.id, p.id);
    setChat(p); setMsgs(loadMsgs(me.id, p.id)); emit('msgs');
    void syncPeer(me, p.id, p.name);
  };
  useEffect(() => { if (initialChat) openChat(initialChat); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!chat) return; const refresh = () => { setMsgs(loadMsgs(me.id, chat.id)); clearUnread(me.id, chat.id); }; refresh(); return on('msgs', refresh); }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, chat?.id]);
  useEffect(() => {
    if (!chat) return;
    const t = window.setInterval(() => { void syncPeer(me, chat.id, chat.name); void flushPending(); }, 3000);
    return () => window.clearInterval(t);
  }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { E.openPeer = ''; }, []);

  const submit = () => { const t = text.trim(); if (!t || !chat) return; setText(''); void sendText(me, chat, t); };
  const reach = chat ? (bleReachable(chat.id) ? 'ble' : isOnline() ? 'net' : 'off') : 'off';
  const meta = chat ? loadIndex(me.id).find(c => c.id === chat.id) : undefined;
  const bleMsg = E.ble === 'unavailable' ? 'البلوتوث غير متاح (الإضافة الأصلية غير مثبتة)' : E.ble === 'denied' ? 'صلاحية البلوتوث/القريبين مرفوضة' : E.ble === 'on' ? 'البلوتوث شغّال' : E.ble === 'starting' ? 'جارٍ تشغيل البلوتوث…' : '';

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'max(12px, env(safe-area-inset-top)) 14px 12px', borderBottom: '1px solid #eee', background: '#fff' }}>
      <button type="button" aria-label="Back" onClick={onClose}
        style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: GREEN, color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 }}>→</button>
      {chat ? (
        <>
          <Avatar p={chat} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.name}</div>
            <div style={{ fontSize: 12, color: reach === 'ble' ? '#16a34a' : reach === 'net' ? BLUE : '#9ca3af' }}>
              {reach === 'ble' ? 'متصل بالبلوتوث — مباشر' : reach === 'net' ? 'عبر الإنترنت' : '⏳ لا يوجد اتصال — تُحفظ وتُرسل تلقائياً'}
            </div>
          </div>
          <button type="button" aria-label="Delete chat" onClick={() => { if (window.confirm('حذف هذه المحادثة من جهازك؟')) { removeConv(me.id, chat.id); onClose(); } }}
            style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f3f4f6', cursor: 'pointer', padding: 0, fontSize: 16 }}>🗑</button>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, background: '#f7f8f8' }}>
          {(meta?.ble || meta?.geo || chat.ble || chat.geo) && (
            <div style={{ position: 'sticky', top: 0, zIndex: 2, alignSelf: 'center', margin: '8px 0 4px', background: '#f7f8f8', padding: '2px 0' }}>
              <Origin ble={meta?.ble || chat.ble} geo={meta?.geo || chat.geo} long />
            </div>
          )}
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

        {searched && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, margin: '4px 2px 8px' }}>النتائج ({peers.length}) — اختر شخصاً لإضافته لقائمة الشات</div>
            {peers.length === 0 && !scanning && <div style={{ color: '#9ca3af', fontSize: 14, padding: 10 }}>ما لقينا أحد قريب الآن</div>}
            {peers.map(p => (
              <button key={p.id} type="button" onClick={() => pick(p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 22, background: '#fff', cursor: 'pointer', textAlign: 'start' }}>
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
      </div>
    </>
  );
}

/* ───────────────────────── مستطيلات القريبين تحت قائمة الشات ───────────────────────── */
function NearbyRows({ me, onOpen }: { me: Me; onOpen: (p: Peer) => void }) {
  const [, force] = useState(0);
  useEffect(() => { const offs = [on('msgs', () => force(x => x + 1)), on('unread', () => force(x => x + 1)), on('peers', () => force(x => x + 1))]; return () => offs.forEach(f => f()); }, []);
  const rows = loadIndex(me.id);
  const loc = jget<Record<string, number>>(kUnread(me.id), {});
  if (!rows.length) return null;
  return (
    <>
      <style>{`[data-nearby-has="1"] > div:not([role="button"]):not([data-nearby-rows]) { display: none !important; }`}</style>
      {rows.map(c => {
        const last = loadMsgs(me.id, c.id).slice(-1)[0];
        const un = (loc[c.id] || 0) + (E.srvUnread[c.id] || 0);
        const live = bleReachable(c.id);
        return (
          <div key={c.id} role="button" data-nearby-row="1" onClick={() => onOpen({ id: c.id, name: c.name, avatar: c.avatar, ble: c.ble, geo: c.geo })}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 16, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.14)', background: '#fff' }}>
            <Avatar p={c} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div dir="auto" style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {last ? `${last.from === me.id ? 'You: ' : ''}${previewOf(last.text)}` : 'Tap to chat'}
              </div>
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Origin ble={c.ble} geo={c.geo} />
                {live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{hhmm(last?.ts || c.ts)}</span>
              {un > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{un}</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ───────────────────────── الربط بصفحة قائمة الشات (النقطة + المستطيلات) ───────────────────────── */
/** صندوق القائمة داخل friendChatPatch: div مطلق، z-index 10، فيه scroll عمودي. */
function findListBox(inner: HTMLElement): HTMLElement | null {
  const el = Array.from(inner.children).find(c => c instanceof HTMLElement && c.style.zIndex === '10' && c.style.overflowY === 'auto' && c.style.position === 'absolute' && !c.hasAttribute('data-nearby-rows'));
  return (el as HTMLElement) || null;
}

function NearbyPatch() {
  const [sheet, setSheet] = useState<SheetEls | null>(null);
  const [listBox, setListBox] = useState<HTMLElement | null>(null); // موجود فقط في صفحة قائمة الشات (ليس الرئيسية وليس داخل شات)
  const [selecting, setSelecting] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<null | { peer?: Peer }>(null);
  const [badge, setBadge] = useState(0);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const scan = () => {
      raf = 0; const next = scanSheet();
      setSheet(prev => (!next ? (prev ? null : prev) : prev && prev.inner === next.inner && prev.header === next.header ? prev : next));
      const onList = !!next && next.header.getAttribute('data-sfc') === 'chat' && String((window as any).__sfcOpenPeer || '') === '*';
      setListBox(prev => { const box = onList && next ? findListBox(next.inner) : null; return prev === box ? prev : box; });
      setSelecting(!!next?.header.querySelector('button[aria-label="Cancel selection"]'));
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sfc'] }); scan();
    const iv = window.setInterval(scan, 600);
    return () => { mo.disconnect(); window.clearInterval(iv); if (raf) cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!sheet) { setMe(null); setView(null); E.me = null; void bleStop(); return; }
    const u = findUser(sheet.btn); setMe(u); E.me = u;
    if (u) void bleStart(u); // الاستقبال بالبلوتوث طالما صفحة Stooorna Ai مفتوحة
  }, [sheet]);

  /* مكان المستطيلات: عنصر خاص بنا داخل صندوق القائمة (order:999 => دائماً تحت الأصدقاء) */
  useEffect(() => {
    if (!listBox) { setHost(null); return; }
    const h = document.createElement('div');
    h.setAttribute('data-nearby-rows', '1');
    h.style.cssText = 'order:999;flex-shrink:0;display:flex;flex-direction:column;gap:8px;';
    listBox.appendChild(h); setHost(h);
    return () => { h.remove(); listBox.removeAttribute('data-nearby-has'); setHost(null); };
  }, [listBox]);
  useEffect(() => {
    if (!listBox || !me) return;
    const mark = () => { if (loadIndex(me.id).length) listBox.setAttribute('data-nearby-has', '1'); else listBox.removeAttribute('data-nearby-has'); };
    mark(); return on('msgs', mark);
  }, [listBox, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* عدّاد غير المقروء + إعادة إرسال المعلّق عند عودة الإنترنت */
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const tick = async () => {
      if (isOnline()) { try { const d = await net('/api/nearby/unread'); E.srvUnread = d?.bySender || {}; emit('unread'); } catch { /* */ } }
      const n = localUnreadTotal(me.id) + Object.values(E.srvUnread).reduce((a, b) => a + (Number(b) || 0), 0);
      if (alive) setBadge(n);
    };
    void tick();
    const t = window.setInterval(tick, 5000);
    const offMsgs = on('msgs', () => { void tick(); });
    const onNet = () => { void flushPending(); void tick(); };
    window.addEventListener('online', onNet);
    return () => { alive = false; window.clearInterval(t); offMsgs(); window.removeEventListener('online', onNet); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheet || !me) return null;
  return (
    <>
      {/* النقطة الزرقاء الصغيرة: فقط في صفحة قائمة الشات، بجانب زر القائمة (مكانها في الصورة ≈ 100px من اليمين) */}
      {listBox && !selecting && createPortal(
        <div data-sfc-portal="1" style={{ position: 'absolute', right: 83, top: 0, bottom: 0, display: 'flex', alignItems: 'center', zIndex: 9, pointerEvents: 'none' }}>
          <button type="button" aria-label="Nearby" title="القريبون" onClick={() => setView({})}
            style={{ pointerEvents: 'auto', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: BLUE, position: 'relative', display: 'block' }}>
              {badge > 0 && <span style={{ position: 'absolute', top: -9, left: 7, minWidth: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, lineHeight: '14px', textAlign: 'center', padding: '0 3px', boxSizing: 'border-box' }}>{badge > 99 ? '99+' : badge}</span>}
            </span>
          </button>
        </div>,
        sheet.header,
      )}
      {host && createPortal(<NearbyRows me={me} onOpen={(p) => setView({ peer: p })} />, host)}
      {view && createPortal(
        <Layer onEsc={() => setView(null)}><NearbyPage me={me} initialChat={view.peer} onClose={() => setView(null)} /></Layer>,
        document.body,
      )}
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
