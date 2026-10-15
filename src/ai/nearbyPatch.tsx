/**
 * NEARBY PATCH  (ملف مستقل — لا يعدّل StooornaAiSheet.tsx ولا friendChatPatch.tsx)
 *
 * [v1.2] البحث صار مربع بمنتصف الشاشة فوق قائمة الشات؛ الضغط على شخص يعرض بروفايله (صورة + يوزر + زر طلب)،
 *         الطلب يوصل للطرف الثاني داخل النقطة الزرقاء (تبويب الطلبات)، وبعد القبول فقط ينزل مستطيل تحت مستطيلات الشات ويفتح الدردشة.
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

export const NEARBY_PATCH_VERSION = '1.2.0';

/* ───────────────────────── Types ───────────────────────── */
interface Me { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null }
interface Peer { id: string; name: string; username?: string | null; avatar?: string | null; ble?: boolean; geo?: boolean; dist?: number }
interface ReqIn { id: string; fromId: string; name: string; username?: string | null; avatar?: string | null; ts: number }
interface ReqOut { id: string; toId: string; status: 'pending'; name: string; username?: string | null; avatar?: string | null; ts: number }
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
  incoming: [] as ReqIn[],                    // طلبات وصلتني (تظهر داخل النقطة الزرقاء)
  outgoing: {} as Record<string, ReqOut>,    // طلبات أرسلتها وبانتظار الرد
  accepted: new Set<string>(),               // من قبلوا => مسموح الدردشة معهم
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

/* ── الطلبات: لا دخول مباشر — لازم الطرف الثاني يقبل أولاً ── */
const kAcc = (me: string) => `stooorna_nearby_acc_v1_${me}`;       // من قبلوا (محلياً) => يظهرون في قائمة الشات
const kOrigin = (me: string) => `stooorna_nearby_origin_v1_${me}`; // كيف عرفته: بلوتوث / موقع
type OriginFlags = { ble?: boolean; geo?: boolean };

/** المحادثات القديمة (قبل نظام الطلبات) تُعتبر مقبولة حتى ما تضيع. */
function loadAccepted(me: string) {
  E.accepted = new Set<string>([...jget<string[]>(kAcc(me), []), ...loadIndex(me).map(c => c.id)]);
}
const relOf = (id: string): 'none' | 'out' | 'in' | 'accepted' =>
  E.accepted.has(id) ? 'accepted' : E.incoming.some(r => r.fromId === id) ? 'in' : E.outgoing[id]?.status === 'pending' ? 'out' : 'none';

/** يجلب الطلبات الواردة/الصادرة والمقبولين من السيرفر. المقبول الجديد ينزل مستطيل تحت قائمة الشات. */
async function syncLinks(me: Me) {
  if (!isOnline()) return;
  try {
    const d = await net('/api/nearby/requests');
    E.incoming = (d?.incoming || []).map((o: any): ReqIn => ({ id: String(o.id), fromId: String(o.fromId), name: String(o.name || 'User'), username: o.username || null, avatar: o.avatar ?? null, ts: Number(o.ts) || Date.now() }));
    const out: Record<string, ReqOut> = {};
    (d?.outgoing || []).forEach((o: any) => { out[String(o.toId)] = { id: String(o.id), toId: String(o.toId), status: 'pending', name: String(o.name || 'User'), username: o.username || null, avatar: o.avatar ?? null, ts: Number(o.ts) || Date.now() }; });
    E.outgoing = out;
    const org = jget<Record<string, OriginFlags>>(kOrigin(me.id), {});
    let added = false;
    (d?.accepted || []).forEach((a: any) => {
      const id = String(a.peerId);
      if (E.accepted.has(id)) return;
      E.accepted.add(id); added = true;
      touchIndex(me.id, { id, name: a.name, avatar: a.avatar, ...(org[id] || (E.blePeers.has(id) ? { ble: true } : { geo: true })) });
    });
    if (added) jset(kAcc(me.id), [...E.accepted]);
    emit('links'); if (added) emit('msgs');
  } catch { /* */ }
}

async function sendRequest(me: Me, p: Peer): Promise<'pending' | 'accepted' | 'declined' | 'error'> {
  const org = jget<Record<string, OriginFlags>>(kOrigin(me.id), {});
  org[p.id] = { ble: !!(p.ble || org[p.id]?.ble), geo: !!(p.geo || org[p.id]?.geo) };
  jset(kOrigin(me.id), org);
  try {
    const d = await net('/api/nearby/requests', { method: 'POST', body: JSON.stringify({ to: p.id }) });
    await syncLinks(me);
    return d?.status === 'accepted' ? 'accepted' : 'pending';
  } catch (e: any) { return /429/.test(String(e?.message)) ? 'declined' : 'error'; }
}

async function respondRequest(me: Me, r: ReqIn, accept: boolean): Promise<boolean> {
  try { await net(`/api/nearby/requests/${encodeURIComponent(r.id)}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }); } catch { return false; }
  E.incoming = E.incoming.filter(x => x.id !== r.id);
  if (accept) {
    E.accepted.add(r.fromId); jset(kAcc(me.id), [...E.accepted]);
    touchIndex(me.id, { id: r.fromId, name: r.name, avatar: r.avatar, ...(E.blePeers.has(r.fromId) ? { ble: true } : { geo: true }) });
    emit('msgs');
  }
  emit('links');
  return true;
}

async function cancelRequest(me: Me, toId: string) {
  const o = E.outgoing[toId]; if (!o) return;
  try { await net(`/api/nearby/requests/${encodeURIComponent(o.id)}`, { method: 'DELETE' }); delete E.outgoing[toId]; emit('links'); } catch { /* */ }
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
        if (!E.accepted.has(String(d.from))) return; // لا رسائل من أحد قبل القبول
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
    } catch (e: any) { if (/403/.test(String(e?.message))) return { ...m, status: 'failed' }; /* غير ذلك يبقى معلّقاً */ }
  }
  return { ...m, status: 'pending' };
}

async function sendText(me: Me, peer: Peer, text: string) {
  if (!E.accepted.has(peer.id)) return; // لازم يقبل طلبك أولاً
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
      const pend = loadMsgs(me.id, c.id).filter(m => m.from === me.id && m.status === 'pending');
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
  return (Array.isArray(d) ? d : d?.users || []).map((o: any): Peer => ({ id: String(o.id), name: String(o.name || o.username || 'User'), username: o.username ?? null, avatar: o.avatar ?? o.avatarUrl ?? null, geo: true, dist: Number(o.distance) }));
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

/** طبقة على document.body (خارج الـSheet) حتى لا يبتلع الـSheet اللمس — نفس فكرة ModalLayer في friendChatPatch.
 *  modal=true => خلفية معتمة + المحتوى في منتصف الشاشة (مربع). غير ذلك => صفحة كاملة (الدردشة). */
function Layer({ children, onEsc, modal }: { children: React.ReactNode; onEsc: () => void; modal?: boolean }) {
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
  const base: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 2147483100, display: 'flex', pointerEvents: 'auto', touchAction: 'auto', overscrollBehavior: 'contain', fontFamily: 'inherit' };
  return (
    <div ref={ref} dir="rtl" onClick={modal ? (e) => { if (e.target === e.currentTarget) onEsc(); } : undefined}
      style={modal
        ? { ...base, background: 'rgba(2,10,9,.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', alignItems: 'center', justifyContent: 'center', padding: 16 }
        : { ...base, background: '#fff', flexDirection: 'column' }}>
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

/* ───────────────────────── مربع القريبون (وسط الشاشة فوق قائمة الشات) ───────────────────────── */
const CARD_BG = 'linear-gradient(165deg, #10302a 0%, #0a1f1a 58%, #08171c 100%)';

function PersonRow({ p, sub, right, onClick }: { p: { name: string; avatar?: string | null }; sub?: React.ReactNode; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', marginBottom: 8, borderRadius: 18, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', cursor: onClick ? 'pointer' : 'default' }}>
      <Avatar p={p} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div dir="auto" style={{ fontWeight: 800, fontSize: 15, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
        {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function NearbyDialog({ me, onClose, onOpenChat }: { me: Me; onClose: () => void; onOpenChat: (p: Peer) => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force(x => x + 1), []);
  const [geoPeers, setGeoPeers] = useState<Peer[]>([]);
  const [scanning, setScanning] = useState(false);
  const [searched, setSearched] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [radius, setRadius] = useState(3000);
  const [hidden, setHidden] = useState<boolean>(() => !!jget(kHidden(me.id), false));
  const [tab, setTab] = useState<'find' | 'requests'>(() => (E.incoming.length ? 'requests' : 'find'));
  const [sel, setSel] = useState<Peer | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const offs = [on('peers', rerender), on('ble', rerender), on('links', rerender)];
    void syncLinks(me);
    return () => offs.forEach(f => f());
  }, [rerender]); // eslint-disable-line react-hooks/exhaustive-deps

  const peers = useMemo(() => {
    const map = new Map<string, Peer>();
    geoPeers.forEach(p => map.set(p.id, { ...p }));
    E.blePeers.forEach(p => { const c = map.get(p.id); map.set(p.id, { ...(c || p), ...p, ble: true, geo: c?.geo, dist: c?.dist, username: c?.username }); });
    return [...map.values()].filter(p => p.id !== me.id).sort((a, b) => (a.ble === b.ble ? (a.dist ?? 1e9) - (b.dist ?? 1e9) : a.ble ? -1 : 1));
  }, [geoPeers, me.id, E.blePeers.size, E.ble]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    if (scanning) return;
    setScanning(true); setSearched(true); setGeoNote(''); setSel(null);
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

  /** الضغط على شخص => يظهر بروفايله (صورة + يوزر + زر طلب). */
  const openProfile = (p: Peer) => {
    setSel(p); setNote('');
    if (isOnline() && (!p.username || !p.avatar)) {
      void net(`/api/nearby/user/${encodeURIComponent(p.id)}`).then(d => {
        if (d?.id) setSel(cur => (cur && cur.id === p.id ? { ...cur, username: d.username || cur.username, avatar: cur.avatar || d.avatar || null } : cur));
      }).catch(() => { /* */ });
    }
  };

  const doRequest = async (p: Peer) => {
    if (busy) return; setBusy(true); setNote('');
    const r = await sendRequest(me, p);
    setBusy(false);
    setNote(r === 'accepted' ? 'تم القبول — صار يظهر في قائمة الشات' : r === 'pending' ? 'انرسل الطلب — بانتظار قبوله' : r === 'declined' ? 'الطلب انرفض قبل شوي — جرّب بعد فترة' : isOnline() ? 'تعذّر إرسال الطلب' : 'إرسال الطلب يحتاج إنترنت');
    rerender();
  };
  const doRespond = async (r: ReqIn, accept: boolean) => {
    if (busy) return; setBusy(true);
    const ok = await respondRequest(me, r, accept);
    setBusy(false);
    if (!ok) setNote('تعذّر تنفيذ الإجراء — تأكد من الإنترنت');
    else if (accept) setNote(`تم قبول ${r.name} — نزل في قائمة الشات`);
    rerender();
  };

  const pill: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' };
  const reqButton = (p: Peer) => {
    const rel = relOf(p.id);
    if (rel === 'accepted') return <span style={{ ...pill, background: 'rgba(34,197,94,.18)', color: '#4ade80', cursor: 'default' }}>مقبول ✓</span>;
    if (rel === 'out') return <span style={{ ...pill, background: 'rgba(255,255,255,.1)', color: '#cbd5e1', cursor: 'default' }}>تم الإرسال ✓</span>;
    if (rel === 'in') { const r = E.incoming.find(x => x.fromId === p.id); return <button type="button" disabled={busy || !r} onClick={() => r && void doRespond(r, true)} style={{ ...pill, background: '#16a34a', color: '#fff' }}>قبول</button>; }
    return <button type="button" disabled={busy} onClick={() => void doRequest(p)} style={{ ...pill, background: BLUE, color: '#fff' }}>{busy ? '…' : 'طلب +'}</button>;
  };

  const bleMsg = E.ble === 'unavailable' ? 'البلوتوث غير متاح (الإضافة الأصلية غير مثبتة)' : E.ble === 'denied' ? 'صلاحية البلوتوث/القريبين مرفوضة' : E.ble === 'on' ? 'البلوتوث شغّال' : E.ble === 'starting' ? 'جارٍ تشغيل البلوتوث…' : '';
  const pendingOut = Object.values(E.outgoing).filter(o => o.status === 'pending');
  const reqCount = E.incoming.length;
  const tabBtn = (id: 'find' | 'requests', label: string, count?: number) => (
    <button type="button" onClick={() => { setTab(id); setSel(null); setNote(''); }}
      style={{ flex: 1, height: 38, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 14, background: tab === id ? 'rgba(59,130,246,.22)' : 'transparent', color: tab === id ? '#93c5fd' : '#94a3b8' }}>
      {label}{count ? <span style={{ marginInlineStart: 6, background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: 11 }}>{count}</span> : null}
    </button>
  );

  return (
    <div dir="rtl" style={{ width: 'min(92vw, 380px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: 26, background: CARD_BG, color: '#fff', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(59,130,246,.18)', overflow: 'hidden' }}>
      <style>{`@keyframes snaRing { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(1.9); opacity: 0; } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: BLUE, boxShadow: '0 0 10px rgba(59,130,246,.9)' }} />
        <div style={{ flex: 1, fontWeight: 800, fontSize: 18 }}>القريبون</div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 16, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '0 14px 8px', padding: 4, borderRadius: 16, background: 'rgba(255,255,255,.05)' }}>
        {tabBtn('find', 'بحث')}
        {tabBtn('requests', 'الطلبات', reqCount)}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 16px' }}>
        {note && <div style={{ background: 'rgba(59,130,246,.16)', color: '#bfdbfe', borderRadius: 12, padding: '8px 12px', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{note}</div>}

        {tab === 'find' && sel && (
          /* ── بروفايل الشخص: صورة + اسم وزر الطلب بجانبه (يمين) + اليوزر ── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={() => { setSel(null); setNote(''); }} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', padding: 0 }}>رجوع للنتائج ›</button>
            <span style={{ padding: 3, borderRadius: '50%', background: `linear-gradient(145deg, ${BLUE}, #22c55e)` }}>
              <span style={{ display: 'block', padding: 3, borderRadius: '50%', background: '#0a1f1a' }}><Avatar p={sel} size={92} /></span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%' }}>
              {reqButton(sel)}
              <div style={{ minWidth: 0, textAlign: 'start' }}>
                <div dir="auto" style={{ fontWeight: 800, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{sel.name}</div>
                <div dir="ltr" style={{ fontSize: 13, color: '#93c5fd', textAlign: 'right' }}>{sel.username ? `@${String(sel.username).replace(/^@/, '')}` : ' '}</div>
              </div>
            </div>
            <Origin ble={sel.ble} geo={sel.geo} />
            {sel.dist != null && <div style={{ fontSize: 12, color: '#94a3b8' }}>على بعد {fmtDist(sel.dist)}</div>}
            {relOf(sel.id) === 'accepted'
              ? <button type="button" onClick={() => onOpenChat(sel)} style={{ ...pill, background: '#16a34a', color: '#fff', padding: '10px 26px', fontSize: 14 }}>فتح الدردشة</button>
              : <div style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', lineHeight: 1.7 }}>بعد ما يقبل طلبك ينزل في قائمة الشات وتقدر تدردش معه</div>}
          </div>
        )}

        {tab === 'find' && !sel && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0 12px' }}>
              <button type="button" onClick={search} disabled={scanning} aria-label="Search nearby"
                style={{ position: 'relative', width: 88, height: 88, borderRadius: '50%', border: 'none', background: `linear-gradient(145deg, ${BLUE}, #1d4ed8)`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 0 28px rgba(59,130,246,.55)' }}>
                {scanning && [0, 1].map(i => <span key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(96,165,250,.75)', animation: `snaRing 1.8s ease-out ${i * 0.9}s infinite`, pointerEvents: 'none' }} />)}
                <span style={{ position: 'relative' }}>{scanning ? 'جارٍ البحث' : 'بحث'}</span>
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                {[[500, '500 م'], [3000, '3 كم'], [20000, '20 كم']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setRadius(Number(v))} style={{ border: '1px solid ' + (radius === v ? BLUE : 'rgba(255,255,255,.18)'), background: radius === v ? 'rgba(59,130,246,.2)' : 'transparent', color: radius === v ? '#93c5fd' : '#cbd5e1', borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>{[bleMsg, geoNote].filter(Boolean).join(' · ') || 'يبحث بالبلوتوث + الموقع معاً — مستخدمو التطبيق فقط'}</div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={hidden} onChange={toggleHidden} /> إخفاء موقعي عن الآخرين
              </label>
            </div>

            {searched && (
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, margin: '2px 2px 8px', color: '#cbd5e1' }}>النتائج ({peers.length}) — اضغط على شخص لعرض بروفايله</div>
                {peers.length === 0 && !scanning && <div style={{ color: '#64748b', fontSize: 14, padding: 10, textAlign: 'center' }}>ما لقينا أحد قريب الآن</div>}
                {peers.map(p => (
                  <PersonRow key={p.id} p={p} onClick={() => openProfile(p)}
                    sub={<>{p.ble ? '🟢 بلوتوث' : ''}{p.ble && p.geo ? ' · ' : ''}{p.geo ? `🔵 ${fmtDist(p.dist) || 'نفس المنطقة'}` : ''}</>}
                    right={relOf(p.id) === 'accepted' ? <span style={{ fontSize: 11, color: '#4ade80' }}>مقبول</span> : relOf(p.id) === 'out' ? <span style={{ fontSize: 11, color: '#94a3b8' }}>بانتظار الرد</span> : relOf(p.id) === 'in' ? <span style={{ fontSize: 11, color: '#fbbf24' }}>طلب وارد</span> : undefined} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'requests' && (
          <>
            <div style={{ fontWeight: 800, fontSize: 13, margin: '2px 2px 8px', color: '#cbd5e1' }}>طلبات واردة</div>
            {E.incoming.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: '6px 10px 12px', textAlign: 'center' }}>لا توجد طلبات حالياً</div>}
            {E.incoming.map(r => (
              <PersonRow key={r.id} p={r} sub={r.username ? `@${String(r.username).replace(/^@/, '')}` : 'يبي يدردش معك'}
                right={
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" disabled={busy} onClick={() => void doRespond(r, true)} style={{ ...pill, padding: '6px 12px', background: '#16a34a', color: '#fff' }}>قبول</button>
                    <button type="button" disabled={busy} onClick={() => void doRespond(r, false)} style={{ ...pill, padding: '6px 12px', background: 'rgba(255,255,255,.12)', color: '#e2e8f0' }}>رفض</button>
                  </span>
                } />
            ))}
            {pendingOut.length > 0 && <div style={{ fontWeight: 800, fontSize: 13, margin: '12px 2px 8px', color: '#cbd5e1' }}>طلبات أرسلتها</div>}
            {pendingOut.map(o => (
              <PersonRow key={o.id} p={o} sub={o.username ? `@${String(o.username).replace(/^@/, '')}` : 'بانتظار الرد'}
                right={<button type="button" onClick={() => void cancelRequest(me, o.toId)} style={{ ...pill, padding: '6px 12px', background: 'rgba(255,255,255,.1)', color: '#cbd5e1' }}>إلغاء</button>} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── الدردشة (صفحة كاملة — فقط بعد القبول) ───────────────────────── */
function NearbyChat({ me, peer, onClose }: { me: Me; peer: Peer; onClose: () => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force(x => x + 1), []);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>(() => loadMsgs(me.id, peer.id));
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const offs = [on('peers', rerender), on('ble', rerender)]; return () => offs.forEach(f => f()); }, [rerender]);
  useEffect(() => {
    E.openPeer = peer.id; clearUnread(me.id, peer.id); emit('msgs');
    void syncPeer(me, peer.id, peer.name);
    const refresh = () => { setMsgs(loadMsgs(me.id, peer.id)); clearUnread(me.id, peer.id); };
    const off = on('msgs', refresh);
    const t = window.setInterval(() => { void syncPeer(me, peer.id, peer.name); void flushPending(); }, 3000);
    return () => { off(); window.clearInterval(t); E.openPeer = ''; };
  }, [peer.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const submit = () => { const t = text.trim(); if (!t) return; setText(''); void sendText(me, peer, t); };
  const reach = bleReachable(peer.id) ? 'ble' : isOnline() ? 'net' : 'off';
  const meta = loadIndex(me.id).find(c => c.id === peer.id);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'max(12px, env(safe-area-inset-top)) 14px 12px', borderBottom: '1px solid #eee', background: '#fff' }}>
        <button type="button" aria-label="Back" onClick={onClose}
          style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: GREEN, color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 }}>→</button>
        <Avatar p={peer} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.name}</div>
          <div style={{ fontSize: 12, color: reach === 'ble' ? '#16a34a' : reach === 'net' ? BLUE : '#9ca3af' }}>
            {reach === 'ble' ? 'متصل بالبلوتوث — مباشر' : reach === 'net' ? 'عبر الإنترنت' : '⏳ لا يوجد اتصال — تُحفظ وتُرسل تلقائياً'}
          </div>
        </div>
        <button type="button" aria-label="Delete chat" onClick={() => { if (window.confirm('حذف هذه المحادثة من جهازك؟')) { removeConv(me.id, peer.id); onClose(); } }}
          style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f3f4f6', cursor: 'pointer', padding: 0, fontSize: 16 }}>🗑</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, background: '#f7f8f8' }}>
        {(meta?.ble || meta?.geo || peer.ble || peer.geo) && (
          <div style={{ position: 'sticky', top: 0, zIndex: 2, alignSelf: 'center', margin: '8px 0 4px', background: '#f7f8f8', padding: '2px 0' }}>
            <Origin ble={meta?.ble || peer.ble} geo={meta?.geo || peer.geo} long />
          </div>
        )}
        {msgs.length === 0 && <div style={{ margin: 'auto', color: '#9ca3af', fontSize: 14 }}>ابدأ الدردشة مع {peer.name}</div>}
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
  const [view, setView] = useState<null | { mode: 'search' } | { mode: 'chat'; peer: Peer }>(null);
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
    if (u) { loadAccepted(u.id); void syncLinks(u); void bleStart(u); } // الاستقبال بالبلوتوث طالما صفحة Stooorna Ai مفتوحة
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
    const recount = () => { // رسائل غير مقروءة + طلبات واردة
      const n = localUnreadTotal(me.id) + Object.values(E.srvUnread).reduce((a, b) => a + (Number(b) || 0), 0) + E.incoming.length;
      if (alive) setBadge(n);
    };
    const tick = async (links = true) => {
      if (isOnline()) {
        if (links) await syncLinks(me);
        try { const d = await net('/api/nearby/unread'); E.srvUnread = d?.bySender || {}; emit('unread'); } catch { /* */ }
      }
      recount();
    };
    void tick();
    const t = window.setInterval(tick, 5000);
    const offMsgs = on('msgs', () => { void tick(false); });
    const offLinks = on('links', recount);
    const onNet = () => { void flushPending(); void tick(); };
    window.addEventListener('online', onNet);
    return () => { alive = false; window.clearInterval(t); offMsgs(); offLinks(); window.removeEventListener('online', onNet); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheet || !me) return null;
  return (
    <>
      {/* النقطة الزرقاء الصغيرة: فقط في صفحة قائمة الشات، بجانب زر القائمة (مكانها في الصورة ≈ 100px من اليمين) */}
      {listBox && !selecting && createPortal(
        <div data-sfc-portal="1" style={{ position: 'absolute', right: 83, top: 0, bottom: 0, display: 'flex', alignItems: 'center', zIndex: 9, pointerEvents: 'none' }}>
          <button type="button" aria-label="Nearby" title="القريبون" onClick={() => setView({ mode: 'search' })}
            style={{ pointerEvents: 'auto', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: BLUE, position: 'relative', display: 'block' }}>
              {badge > 0 && <span style={{ position: 'absolute', top: -9, left: 7, minWidth: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, lineHeight: '14px', textAlign: 'center', padding: '0 3px', boxSizing: 'border-box' }}>{badge > 99 ? '99+' : badge}</span>}
            </span>
          </button>
        </div>,
        sheet.header,
      )}
      {host && createPortal(<NearbyRows me={me} onOpen={(p) => setView({ mode: 'chat', peer: p })} />, host)}
      {view?.mode === 'search' && createPortal(
        <Layer modal onEsc={() => setView(null)}><NearbyDialog me={me} onClose={() => setView(null)} onOpenChat={(p) => setView({ mode: 'chat', peer: p })} /></Layer>,
        document.body,
      )}
      {view?.mode === 'chat' && createPortal(
        <Layer onEsc={() => setView(null)}><NearbyChat me={me} peer={view.peer} onClose={() => setView(null)} /></Layer>,
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
