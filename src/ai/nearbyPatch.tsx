/**
 * NEARBY PATCH  (ملف مستقل — لا يعدّل StooornaAiSheet.tsx ولا friendChatPatch.tsx)
 *
 * [v1.5] الدردشة داخل حجم الشيت (مثل قائمة الشات) بدل صفحة كاملة · زر رجوع واضح مثل قائمة الأصدقاء · الأصدقاء دخول مباشر والطلب لغير المضافين فقط
 *         إصلاح الصور (صور الأصدقاء من /api/friends + حفظ آخر صورة) · كل النصوص داخل النقطة الزرقاء إنجليزي (LTR).
 * [v1.3] بحث حيّ فعلياً: يتحدّث تلقائياً ويظهر المضاف وغير المضاف مع اليوزر (بلوتوث أو موقع عبر السيرفر — أندرويد وآيفون).
 *         الموقع يُنشر تلقائياً طالما صفحة Stooorna Ai مفتوحة (إلا لو فعّلت إخفاء موقعي).
 * [v1.2] البحث صار مربع بمنتصف الشاشة فوق قائمة الشات؛ الضغط على شخص يعرض بروفايله (صورة + يوزر + زر طلب)،
 *         الطلب يوصل للطرف الثاني داخل النقطة الزرقاء (تبويب الطلبات)، وبعد القبول فقط ينزل مستطيل تحت مستطيلات الشات ويOpen chat.
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

export const NEARBY_PATCH_VERSION = '1.5.0';

/* ───────────────────────── Types ───────────────────────── */
interface Me { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null }
interface Peer { id: string; name: string; username?: string | null; avatar?: string | null; ble?: boolean; geo?: boolean; dist?: number; friend?: boolean }
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
  accepted: new Set<string>(),
  friendInfo: {} as Record<string, { name: string; avatar?: string | null; username?: string | null }>, // [v1.5] اسم/صورة الأصدقاء من /api/friends
  friends: new Set<string>(),                // الأصدقاء المضافون (من السيرفر) — دردشتهم مباشرة بدون طلب               // من قبلوا => مسموح الدردشة معهم
};

/* [v1.7] تحديد/حذف: مستطيلات الموقع والبلوتوث تنضاف لوضع التحديد حق قائمة الشات، وزر Delete يحذفها معها */
const NSEL = new Set<string>();
function nselEmit() {
  try {
    (window as any).__sfcNearbySel = {
      count: NSEL.size,
      deleteAll: () => { const m = E.me; if (m) NSEL.forEach(id => removeConv(m.id, id)); NSEL.clear(); nselEmit(); },
      clear: () => { NSEL.clear(); nselEmit(); },
    };
    window.dispatchEvent(new Event('sfc-nearby-sel'));
  } catch { /* */ }
}

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
  E.accepted = new Set<string>(jget<string[]>(kAcc(me), [])); // [v1.4] الأصدقاء وقدامى المحادثات لازم يمرون بالطلب والقبول
}
const canTalk = (id: string) => E.accepted.has(id) || E.friends.has(id); // [v1.5] الأصدقاء دخول مباشر بدون طلب
const relOf = (id: string): 'none' | 'out' | 'in' | 'accepted' =>
  canTalk(id) ? 'accepted' : E.incoming.some(r => r.fromId === id) ? 'in' : E.outgoing[id]?.status === 'pending' ? 'out' : 'none';

/** [v1.5] الأصدقاء المضافون مباشرة من /api/friends (نفس مصدر قائمة الأصدقاء) — معهم الاسم والصورة. */
async function loadFriends(me: Me) {
  if (!isOnline()) return;
  try {
    const d = await net('/api/friends');
    const list: any[] = Array.isArray(d?.accepted) ? d.accepted : Array.isArray(d) ? d : [];
    list.forEach(o => {
      const id = String(o?.friendId ?? o?.userId ?? ''); if (!id) return;
      E.friends.add(id);
      const prev = E.friendInfo[id];
      const avatar = o?.avatarUrl || o?.avatar || o?.image || prev?.avatar || null;
      const name = String(o?.name || o?.displayName || o?.username || prev?.name || 'User');
      E.friendInfo[id] = { name, avatar, username: o?.username ?? prev?.username ?? null };
      if (avatar) touchAvatar(me.id, id, avatar, name);
    });
    emit('links'); emit('msgs');
  } catch { /* */ }
}

/** يجلب الطلبات الواردة/الصادرة والمقبولين من السيرفر. المقبول الجديد ينزل مستطيل تحت قائمة الشات. */
async function syncLinks(me: Me) {
  if (!isOnline()) return;
  try {
    try { const f = await net('/api/nearby/friends'); (f?.ids || []).forEach((id: any) => { E.friends.add(String(id)); }); } catch { /* */ }
    await loadFriends(me); // [v1.5] الأصدقاء + صورهم
    const d = await net('/api/nearby/requests');
    E.incoming = (d?.incoming || []).map((o: any): ReqIn => ({ id: String(o.id), fromId: String(o.fromId), name: String(o.name || 'User'), username: o.username || null, avatar: o.avatar ?? null, ts: Number(o.ts) || Date.now() }));
    const out: Record<string, ReqOut> = {};
    (d?.outgoing || []).forEach((o: any) => { out[String(o.toId)] = { id: String(o.id), toId: String(o.toId), status: 'pending', name: String(o.name || 'User'), username: o.username || null, avatar: o.avatar ?? null, ts: Number(o.ts) || Date.now() }; });
    E.outgoing = out;
    const org = jget<Record<string, OriginFlags>>(kOrigin(me.id), {});
    let added = false;
    const srvAcc = new Set<string>((d?.accepted || []).map((a: any) => String(a.peerId)));
    (d?.accepted || []).forEach((a: any) => {
      const id = String(a.peerId);
      if (E.accepted.has(id)) { if (a.avatar) touchAvatar(me.id, id, a.avatar); return; }
      E.accepted.add(id); added = true;
      touchIndex(me.id, { id, name: a.name, avatar: a.avatar, ...(org[id] || (E.blePeers.has(id) ? { ble: true } : { geo: true })) });
    });
    if (srvAcc.size !== E.accepted.size || [...E.accepted].some(x => !srvAcc.has(x))) { E.accepted = srvAcc; added = true; }
    jset(kAcc(me.id), [...E.accepted]);
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

/* ── [v1.4] الصورة: لو ما وصلت صورة الشخص نجيبها من بروفايله ونحفظها في الفهرس ── */
function touchAvatar(meId: string, id: string, avatar: string, name?: string) {
  const list = loadIndex(meId); const cur = list.find(x => x.id === id);
  if (!cur || (cur.avatar === avatar && (!name || cur.name === name))) return;
  jset(kIndex(meId), list.map(x => (x.id === id ? { ...x, avatar, name: name || x.name } : x)));
}
const profTried = new Map<string, number>();
async function hydrateProfile(me: Me, id: string): Promise<{ name?: string; username?: string | null; avatar?: string | null } | null> {
  const fi = E.friendInfo[id];
  if (fi?.avatar) { touchAvatar(me.id, id, fi.avatar, fi.name); emit('msgs'); return { name: fi.name, username: fi.username, avatar: fi.avatar }; }
  if (!isOnline() || Date.now() - (profTried.get(id) || 0) < 60000) return null;
  profTried.set(id, Date.now());
  try {
    const d = await net(`/api/nearby/user/${encodeURIComponent(id)}`);
    if (d?.avatar) { touchAvatar(me.id, id, d.avatar, d.name); emit('msgs'); }
    return d || null;
  } catch { return null; }
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
        if (!canTalk(String(d.from))) return; // لا رسائل من أحد قبل القبول (الأصدقاء مسموحين)
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
  if (!canTalk(peer.id)) return; // لازم يقبل طلبك أولاً (إلا الأصدقاء)
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
type Pos = { lat: number; lng: number; accuracy?: number };
let lastPos: (Pos & { at: number }) | null = null;
function webPos(high: boolean, timeout: number): Promise<Pos> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 0, message: 'nogeo' });
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), rej, { enableHighAccuracy: high, timeout, maximumAge: 60000 });
  });
}
/** الموقع: إضافة Capacitor Geolocation إن وُجدت (أندرويد + آيفون)، وإلا متصفح الـWebView؛ دقة عالية ثم تقريبية إذا تأخّر الـGPS. */
async function getPos(): Promise<Pos> {
  if (lastPos && Date.now() - lastPos.at < 20000) return lastPos;
  let p: Pos | null = null;
  const cap: any = (() => { try { const w: any = window; return w.Capacitor?.Plugins?.Geolocation || null; } catch { return null; } })();
  if (cap) {
    try {
      const perm = await cap.checkPermissions?.();
      if (perm && perm.location !== 'granted' && perm.coarseLocation !== 'granted') await cap.requestPermissions?.();
      const r = await cap.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
      p = { lat: r.coords.latitude, lng: r.coords.longitude, accuracy: r.coords.accuracy };
    } catch (e: any) { if (/denied|permission/i.test(String(e?.message))) throw { code: 1 }; }
  }
  if (!p) { try { p = await webPos(true, 8000); } catch (e: any) { if (e?.code === 1) throw e; p = await webPos(false, 15000); } }
  lastPos = { ...p, at: Date.now() };
  return p;
}
/** ينشر موقعي للسيرفر (يختفي تلقائياً بعد دقائق بدون تحديث). */
async function publishPos(): Promise<Pos> {
  const p = await getPos();
  await net('/api/nearby/ping', { method: 'POST', body: JSON.stringify(p) });
  return p;
}
function geoErr(e: any): string {
  const m = String(e?.message || '');
  if (e?.code === 1) return 'Location permission denied — enable it in device settings';
  if (/HTTP 404/.test(m)) return 'Server is missing the Nearby routes (nearby-routes in entry.ts)';
  if (/HTTP 401/.test(m)) return 'Please sign in first';
  if (/HTTP 5/.test(m)) return 'Server error — try again shortly';
  if (e?.code) return 'Could not get your location — make sure GPS is on';
  return 'Could not reach the server';
}
async function geoSearch(radius: number): Promise<Peer[]> {
  await publishPos();
  const d = await net(`/api/nearby?radius=${radius}`);
  return (Array.isArray(d) ? d : d?.users || []).map((o: any): Peer => {
    if (o.friend) E.friends.add(String(o.id));
    const fi = E.friendInfo[String(o.id)];
    return { id: String(o.id), name: String(o.name || o.username || fi?.name || 'User'), username: o.username ?? fi?.username ?? null, avatar: o.avatar || o.avatarUrl || fi?.avatar || null, geo: true, dist: Number(o.distance), friend: !!o.friend };
  });
}

/* ───────────────────────── Helpers UI ───────────────────────── */
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDist = (d?: number) => (d == null || !Number.isFinite(d) ? '' : d < 1000 ? `${Math.max(1, Math.round(d))} m` : `${(d / 1000).toFixed(1)} km`);

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

const fixUrl = (u?: string | null): string | null => {
  const s = String(u ?? '').trim(); if (!s) return null;
  return /^(https?:|data:|blob:|\/)/i.test(s) ? s : '/' + s.replace(/^\.?\//, '');
};
function Avatar({ p, size = 46 }: { p: { name: string; avatar?: string | null; id?: string }; size?: number }) {
  const [bad, setBad] = useState(false);
  const src = fixUrl(p.avatar) || fixUrl(p.id ? E.friendInfo[p.id]?.avatar : null);
  useEffect(() => { setBad(false); }, [src]);
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.4 }}>
      {src && !bad ? <img src={src} alt="" onError={() => setBad(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.name.trim().charAt(0).toUpperCase() || '?')}
    </span>
  );
}

/** طبقة على document.body (خارج الـSheet) حتى لا يبتلع الـSheet اللمس — نفس فكرة ModalLayer في friendChatPatch.
 *  modal=true => خلفية معتمة + المحتوى في منتصف الشاشة (مربع). غير ذلك => صفحة كاملة (الدردشة). */
function Layer({ children, onEsc, modal, dir = 'ltr' }: { children: React.ReactNode; onEsc: () => void; modal?: boolean; dir?: 'rtl' | 'ltr' }) {
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
    <div ref={ref} dir={dir} onClick={modal ? (e) => { if (e.target === e.currentTarget) onEsc(); } : undefined}
      style={modal
        ? { ...base, background: 'rgba(2,10,9,.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', alignItems: 'center', justifyContent: 'center', padding: 16 }
        : { ...base, background: '#fff', color: '#111', flexDirection: 'column' }}>
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
      {ble && chip('#dcfce7', '#15803d', long ? '🟢 Met via Bluetooth' : '🟢 From Bluetooth')}
      {geo && chip('#dbeafe', '#1d4ed8', long ? '🔵 Met via Location' : '🔵 From Location')}
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

  const scanRef = useRef(false);
  /** بحث حيّ: يشتغل تلقائياً عند فتح المربع ويتحدّث كل 8 ثوانٍ؛ الزر للتحديث اليدوي. */
  const search = async (silent = false) => {
    if (scanRef.current) return; scanRef.current = true;
    if (!silent) { setScanning(true); setSel(null); }
    setSearched(true);
    if (!hidden) void bleStart(me);
    try {
      if (hidden) { setGeoPeers([]); setGeoNote('Your location is hidden — nobody sees you and you see nobody by location'); }
      else if (!isOnline()) setGeoNote('No internet — searching by Bluetooth only');
      else { try { setGeoPeers(await geoSearch(radius)); setGeoNote(''); } catch (e) { setGeoNote(geoErr(e)); } }
      if (!silent) await new Promise(r => setTimeout(r, 1200));
    } finally { scanRef.current = false; setScanning(false); rerender(); }
  };
  useEffect(() => {
    void search();
    const t = window.setInterval(() => { void search(true); }, 8000);
    return () => window.clearInterval(t);
  }, [radius, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleHidden = async () => {
    const v = !hidden; setHidden(v); jset(kHidden(me.id), v);
    if (v) { try { await net('/api/nearby/ping', { method: 'DELETE' }); } catch { /* */ } setGeoPeers([]); void bleStop(); }
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

  /** [v1.5] صديق/مقبول => دخول مباشر على الدردشة؛ غير مضاف => بروفايل + طلب. */
  const enter = (p: Peer) => {
    const fi = E.friendInfo[p.id];
    const full: Peer = { ...p, name: p.name || fi?.name || 'User', avatar: p.avatar || fi?.avatar || null };
    touchIndex(me.id, { id: full.id, name: full.name, avatar: full.avatar, ble: full.ble, geo: full.geo });
    emit('msgs'); onOpenChat(full);
  };
  const pickPerson = (p: Peer) => { if (relOf(p.id) === 'accepted') enter(p); else openProfile(p); };

  const doRequest = async (p: Peer) => {
    if (busy) return; setBusy(true); setNote('');
    const r = await sendRequest(me, p);
    setBusy(false);
    setNote(r === 'accepted' ? 'Accepted — now in your chat list' : r === 'pending' ? 'Request sent — waiting for acceptance' : r === 'declined' ? 'Request was declined recently — try again later' : isOnline() ? 'Could not send the request' : 'Sending a request needs internet');
    rerender();
  };
  const doRespond = async (r: ReqIn, accept: boolean) => {
    if (busy) return; setBusy(true);
    const ok = await respondRequest(me, r, accept);
    setBusy(false);
    if (!ok) setNote('Action failed — check your internet');
    else if (accept) setNote(`${r.name} accepted — added to your chat list`);
    rerender();
  };

  const pill: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' };
  const reqButton = (p: Peer) => {
    const rel = relOf(p.id);
    if (rel === 'accepted') return <span style={{ ...pill, background: 'rgba(34,197,94,.18)', color: '#4ade80', cursor: 'default' }}>{E.friends.has(p.id) ? 'Friend ✓' : 'Accepted ✓'}</span>;
    if (rel === 'out') return <span style={{ ...pill, background: 'rgba(255,255,255,.1)', color: '#cbd5e1', cursor: 'default' }}>Sent ✓</span>;
    if (rel === 'in') { const r = E.incoming.find(x => x.fromId === p.id); return <button type="button" disabled={busy || !r} onClick={() => r && void doRespond(r, true)} style={{ ...pill, background: '#16a34a', color: '#fff' }}>Accept</button>; }
    return <button type="button" disabled={busy} onClick={() => void doRequest(p)} style={{ ...pill, background: BLUE, color: '#fff' }}>{busy ? '…' : 'Request +'}</button>;
  };

  const bleMsg = E.ble === 'unavailable' ? 'Bluetooth unavailable (native plugin not installed)' : E.ble === 'denied' ? 'Bluetooth / Nearby permission denied' : E.ble === 'on' ? 'Bluetooth is on' : E.ble === 'starting' ? 'Starting Bluetooth…' : '';
  const pendingOut = Object.values(E.outgoing).filter(o => o.status === 'pending');
  const reqCount = E.incoming.length;
  const tabBtn = (id: 'find' | 'requests', label: string, count?: number) => (
    <button type="button" onClick={() => { setTab(id); setSel(null); setNote(''); }}
      style={{ flex: 1, height: 38, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 14, background: tab === id ? 'rgba(59,130,246,.22)' : 'transparent', color: tab === id ? '#93c5fd' : '#94a3b8' }}>
      {label}{count ? <span style={{ marginInlineStart: 6, background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: 11 }}>{count}</span> : null}
    </button>
  );

  return (
    <div dir="ltr" style={{ width: 'min(92vw, 380px)', height: 'min(78vh, 640px)', maxHeight: '80vh', /* [v1.8] same box size on Search / Requests / profile — no growing or shrinking */ display: 'flex', flexDirection: 'column', borderRadius: 26, background: CARD_BG, color: '#fff', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(59,130,246,.18)', overflow: 'hidden' }}>
      <style>{`@keyframes snaRing { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(1.9); opacity: 0; } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: BLUE, boxShadow: '0 0 10px rgba(59,130,246,.9)' }} />
        <div style={{ flex: 1, fontWeight: 800, fontSize: 18 }}>Nearby</div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 16, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '0 14px 8px', padding: 4, borderRadius: 16, background: 'rgba(255,255,255,.05)' }}>
        {tabBtn('find', 'Search')}
        {tabBtn('requests', 'Requests', reqCount)}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 16px' }}>
        {note && <div style={{ background: 'rgba(59,130,246,.16)', color: '#bfdbfe', borderRadius: 12, padding: '8px 12px', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{note}</div>}

        {tab === 'find' && sel && (
          /* ── بروفايل الشخص: صورة + اسم وزر الطلب بجانبه (يمين) + اليوزر ── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={() => { setSel(null); setNote(''); }} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', padding: 0 }}>‹ Back to results</button>
            <span style={{ padding: 3, borderRadius: '50%', background: `linear-gradient(145deg, ${BLUE}, #22c55e)` }}>
              <span style={{ display: 'block', padding: 3, borderRadius: '50%', background: '#0a1f1a' }}><Avatar p={sel} size={92} /></span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 12, width: '100%' }}>
              {reqButton(sel)}
              <div style={{ minWidth: 0, textAlign: 'start' }}>
                <div dir="auto" style={{ fontWeight: 800, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{sel.name}</div>
                <div dir="ltr" style={{ fontSize: 13, color: '#93c5fd', textAlign: 'left' }}>{sel.username ? `@${String(sel.username).replace(/^@/, '')}` : ' '}</div>
              </div>
            </div>
            <Origin ble={sel.ble} geo={sel.geo} />
            {sel.dist != null && <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDist(sel.dist)} away</div>}
            {relOf(sel.id) === 'accepted'
              ? <button type="button" onClick={() => enter(sel)} style={{ ...pill, background: '#16a34a', color: '#fff', padding: '10px 26px', fontSize: 14 }}>Open chat</button>
              : <div style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', lineHeight: 1.7 }}>Once they accept your request they appear in your chat list and you can chat</div>}
          </div>
        )}

        {tab === 'find' && !sel && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0 12px' }}>
              <button type="button" onClick={() => void search()} disabled={scanning} aria-label="Search nearby"
                style={{ position: 'relative', width: 88, height: 88, borderRadius: '50%', border: 'none', background: `linear-gradient(145deg, ${BLUE}, #1d4ed8)`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 0 28px rgba(59,130,246,.55)' }}>
                {scanning && [0, 1].map(i => <span key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(96,165,250,.75)', animation: `snaRing 1.8s ease-out ${i * 0.9}s infinite`, pointerEvents: 'none' }} />)}
                <span style={{ position: 'relative' }}>{scanning ? 'Searching' : 'Refresh'}</span>
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                {[[500, '500 m'], [3000, '3 km'], [20000, '20 km']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setRadius(Number(v))} style={{ border: '1px solid ' + (radius === v ? BLUE : 'rgba(255,255,255,.18)'), background: radius === v ? 'rgba(59,130,246,.2)' : 'transparent', color: radius === v ? '#93c5fd' : '#cbd5e1', borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>{[bleMsg, geoNote].filter(Boolean).join(' · ') || 'Auto-refresh — people appear live via Bluetooth or location (app users only)'}</div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={hidden} onChange={toggleHidden} /> Hide my location from others
              </label>
            </div>

            {searched && (
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, margin: '2px 2px 8px', color: '#cbd5e1' }}>Results ({peers.length}) — tap a person to view their profile</div>
                {peers.length === 0 && !scanning && <div style={{ color: '#64748b', fontSize: 14, padding: 10, textAlign: 'center', lineHeight: 1.7 }}>Nobody nearby right now — people appear here as soon as they open Stooorna Ai with location or Bluetooth on</div>}
                {peers.map(p => (
                  <PersonRow key={p.id} p={p} onClick={() => pickPerson(p)}
                    sub={<>{p.friend || E.friends.has(p.id) ? '⭐ Friend' : 'Not added'}{p.username ? ` · @${String(p.username).replace(/^@/, '')}` : ''} · {p.ble ? '🟢 Bluetooth' : ''}{p.ble && p.geo ? ' · ' : ''}{p.geo ? `🔵 ${fmtDist(p.dist) || 'Same area'}` : ''}</>}
                    right={relOf(p.id) === 'accepted' ? <span style={{ fontSize: 11, color: '#4ade80' }}>Accepted</span> : relOf(p.id) === 'out' ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Awaiting reply</span> : relOf(p.id) === 'in' ? <span style={{ fontSize: 11, color: '#fbbf24' }}>Incoming request</span> : undefined} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'requests' && (
          <>
            <div style={{ fontWeight: 800, fontSize: 13, margin: '2px 2px 8px', color: '#cbd5e1' }}>Incoming requests</div>
            {E.incoming.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: '6px 10px 12px', textAlign: 'center' }}>No requests right now</div>}
            {E.incoming.map(r => (
              <PersonRow key={r.id} p={r} sub={r.username ? `@${String(r.username).replace(/^@/, '')}` : 'Wants to chat with you'}
                right={
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" disabled={busy} onClick={() => void doRespond(r, true)} style={{ ...pill, padding: '6px 12px', background: '#16a34a', color: '#fff' }}>Accept</button>
                    <button type="button" disabled={busy} onClick={() => void doRespond(r, false)} style={{ ...pill, padding: '6px 12px', background: 'rgba(255,255,255,.12)', color: '#e2e8f0' }}>Decline</button>
                  </span>
                } />
            ))}
            {pendingOut.length > 0 && <div style={{ fontWeight: 800, fontSize: 13, margin: '12px 2px 8px', color: '#cbd5e1' }}>Sent requests</div>}
            {pendingOut.map(o => (
              <PersonRow key={o.id} p={o} sub={o.username ? `@${String(o.username).replace(/^@/, '')}` : 'Awaiting reply'}
                right={<button type="button" onClick={() => void cancelRequest(me, o.toId)} style={{ ...pill, padding: '6px 12px', background: 'rgba(255,255,255,.1)', color: '#cbd5e1' }}>Cancel</button>} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── الدردشة (داخل الشيت بنفس حجم قائمة الشات — [v1.5]) ───────────────────────── */
/** DAY-SEPARATORS: "Today" / "Yesterday" / date, shown between messages of different days */
const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ts: number): string {
  const d = new Date(ts); const now = new Date();
  if (dayKey(ts) === dayKey(now.getTime())) return 'Today';
  if (dayKey(ts) === dayKey(now.getTime() - 864e5)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) });
}
const DAY_CHIP: React.CSSProperties = { alignSelf: 'center', background: 'rgba(0,0,0,0.06)', color: '#6b7280', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 999, margin: '6px 0 2px', flexShrink: 0 };

function BackArrow() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  );
}

function NearbyChat({ me, peer, onClose }: { me: Me; peer: Peer; onClose: () => void }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force(x => x + 1), []);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>(() => loadMsgs(me.id, peer.id));
  const [avatar, setAvatar] = useState<string | null>(peer.avatar ?? loadIndex(me.id).find(c => c.id === peer.id)?.avatar ?? E.friendInfo[peer.id]?.avatar ?? null);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqNote, setReqNote] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /* [v1.7] الصفحة تمتد لتحت وتوقف بالضبط عند شريط الكتابة الأصلي في الشيت: مربع الكتابة + الإرسال بنفس مكانه وارتفاعه */
  const [gap, setGap] = useState<number | null>(null);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = panelRef.current; const inner = el?.parentElement as HTMLElement | null | undefined; if (!el || !inner) return;
    const measure = () => {
      const ir = inner.getBoundingClientRect();
      let bar: HTMLElement | null = null;
      let cur = inner.querySelector('textarea') as HTMLElement | null;
      for (let i = 0; cur && cur !== inner && i < 7; i++, cur = cur.parentElement) {
        const rr = cur.getBoundingClientRect(); const rad = parseFloat(getComputedStyle(cur).borderTopLeftRadius) || 0;
        if (rad >= 16 && rr.width > ir.width * 0.7) { bar = cur; break; }
      }
      if (!bar) { setGap(null); setBarH(0); return; }
      const br = bar.getBoundingClientRect();
      const g = ir.bottom - (br.bottom + 10);
      setGap(g >= 0 && g < 260 ? Math.round(g) : null);
      setBarH(Math.max(44, Math.min(58, Math.round(br.height))));
    };
    measure();
    const iv = window.setInterval(measure, 400); // keyboard / sheet animations
    const ro = new ResizeObserver(measure); ro.observe(inner);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    return () => { window.clearInterval(iv); ro.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);

  /* keep touches inside the panel away from the sheet (drag-to-close etc.) */
  useEffect(() => {
    const el = panelRef.current; if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const evs = ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'mousedown', 'wheel'];
    evs.forEach(n => el.addEventListener(n, stop, { passive: true } as AddEventListenerOptions));
    return () => evs.forEach(n => el.removeEventListener(n, stop));
  }, []);
  useEffect(() => { const offs = [on('peers', rerender), on('ble', rerender), on('links', rerender)]; return () => offs.forEach(f => f()); }, [rerender]);
  useEffect(() => {
    E.openPeer = peer.id; clearUnread(me.id, peer.id); emit('msgs');
    void syncPeer(me, peer.id, peer.name);
    if (!avatar) void hydrateProfile(me, peer.id).then(d => { if (d?.avatar) setAvatar(d.avatar); });
    const refresh = () => { setMsgs(loadMsgs(me.id, peer.id)); clearUnread(me.id, peer.id); };
    const off = on('msgs', refresh);
    const t = window.setInterval(() => { void syncPeer(me, peer.id, peer.name); void flushPending(); }, 3000);
    return () => { off(); window.clearInterval(t); E.openPeer = ''; };
  }, [peer.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstScroll = useRef(true);
  useEffect(() => { // don't yank the view down while reading old messages
    const box = endRef.current?.parentElement as HTMLElement | null;
    const near = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    const mineLast = msgs[msgs.length - 1]?.from === me.id;
    if (firstScroll.current || near || mineLast) endRef.current?.scrollIntoView({ block: 'end' });
    firstScroll.current = false;
  }, [msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const fi = E.friendInfo[peer.id]; if (!avatar && fi?.avatar) setAvatar(fi.avatar); }); // friend photo may arrive later

  const rel = relOf(peer.id);
  const accepted = rel === 'accepted';
  const isFriend = E.friends.has(peer.id);
  const submit = () => { const t = text.trim(); if (!t || !accepted) return; setText(''); void sendText(me, { ...peer, avatar }, t); };
  const invite = async () => {
    if (reqBusy) return; setReqBusy(true); setReqNote('');
    const r = await sendRequest(me, peer);
    setReqBusy(false);
    setReqNote(r === 'accepted' ? 'Accepted — you can chat now' : r === 'pending' ? 'Request sent — waiting for acceptance' : r === 'declined' ? 'Request was declined recently — try again later' : isOnline() ? 'Could not send the request' : 'Sending a request needs internet');
    rerender();
  };
  const reach = bleReachable(peer.id) ? 'ble' : isOnline() ? 'net' : 'off';
  const meta = loadIndex(me.id).find(c => c.id === peer.id);
  const shown = { id: peer.id, name: peer.name, avatar };

  return (
    <div ref={panelRef} data-nearby-chat="1" dir="ltr"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: gap != null ? gap : 'calc(env(safe-area-inset-bottom, 0px) + 44px)', zIndex: 60, display: 'flex', flexDirection: 'column', background: '#fff', color: '#111', borderRadius: 'inherit', overflow: 'hidden', fontFamily: 'inherit', pointerEvents: 'auto', touchAction: 'auto' }}>
      {/* header — same back button as the friends list: dark circle + clear white arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px', borderBottom: '1px solid #eee', background: '#fff', flexShrink: 0 }}>
        <button type="button" aria-label="Back" onClick={onClose}
          style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', WebkitTapHighlightColor: 'transparent' }}>
          <BackArrow />
        </button>
        <Avatar p={shown} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div dir="auto" style={{ fontWeight: 800, fontSize: 16, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.name}{isFriend ? ' ⭐' : ''}</div>
          <div dir="auto" style={{ fontSize: 12, color: reach === 'ble' ? '#16a34a' : reach === 'net' ? BLUE : '#9ca3af' }}>
            {reach === 'ble' ? 'Connected via Bluetooth — direct' : reach === 'net' ? 'Via internet' : '⏳ No connection — saved and sent automatically'}
          </div>
        </div>
        <button type="button" aria-label="Delete chat" onClick={() => { if (window.confirm('Delete this conversation from your device?')) { removeConv(me.id, peer.id); onClose(); } }}
          style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f3f4f6', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, background: '#f7f8f8' }}>
        {(meta?.ble || meta?.geo || peer.ble || peer.geo) && (
          <div style={{ position: 'sticky', top: 0, zIndex: 2, alignSelf: 'center', margin: '8px 0 4px', background: '#f7f8f8', padding: '2px 0' }}>
            <Origin ble={meta?.ble || peer.ble} geo={meta?.geo || peer.geo} long />
          </div>
        )}
        {msgs.length === 0 && <div dir="auto" style={{ margin: 'auto', color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>{accepted ? `Start chatting with ${peer.name}` : 'Send a chat request — the chat opens once they accept'}</div>}
        {msgs.map((m, i) => {
          const mine = m.from === me.id;
          return (
            <React.Fragment key={m.clientId}>
            {(i === 0 || dayKey(msgs[i - 1].ts) !== dayKey(m.ts)) && <div style={DAY_CHIP}>{dayLabel(m.ts)}</div>}
            <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div dir="auto" style={{ background: mine ? GREEN : '#fff', color: mine ? '#fff' : '#111', border: mine ? 'none' : '1px solid #e5e7eb', borderRadius: 16, padding: '8px 12px', fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
              <div dir="ltr" style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
                {hhmm(m.ts)}{mine ? (m.status === 'ble' ? ' ✓✓' : m.status === 'sent' ? ' ✓' : m.status === 'pending' ? ' ⏳' : ' !') : ''}
              </div>
            </div>
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>

      {accepted ? (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 10px', borderTop: '1px solid #eee', background: '#fff', flexShrink: 0 }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} dir="auto" placeholder="Type a message…"
            style={{ flex: 1, minWidth: 0, height: barH || 46, borderRadius: (barH || 46) / 2, border: 'none', background: GREEN, color: '#fff', padding: '0 18px', fontSize: 15, outline: 'none' }} />
          <button type="button" onClick={submit} aria-label="Send" style={{ width: barH || 46, height: barH || 46, borderRadius: '50%', border: 'none', background: BLUE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          </button>
        </div>
      ) : (
        /* not a friend and not accepted yet => request instead of the message box */
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid #eee', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {reqNote && <div dir="auto" style={{ fontSize: 13, color: '#1d4ed8', textAlign: 'center' }}>{reqNote}</div>}
          {rel === 'in'
            ? <button type="button" disabled={reqBusy} onClick={async () => { const r = E.incoming.find(x => x.fromId === peer.id); if (!r) return; setReqBusy(true); await respondRequest(me, r, true); setReqBusy(false); rerender(); }}
                style={{ border: 'none', borderRadius: 999, padding: '12px 30px', fontSize: 15, fontWeight: 800, background: '#16a34a', color: '#fff', cursor: 'pointer' }}>Accept request</button>
            : rel === 'out'
              ? <div dir="auto" style={{ fontSize: 14, color: '#6b7280' }}>⏳ Request sent — waiting for acceptance</div>
              : <button type="button" disabled={reqBusy} onClick={() => void invite()}
                  style={{ border: 'none', borderRadius: 999, padding: '12px 30px', fontSize: 15, fontWeight: 800, background: BLUE, color: '#fff', cursor: 'pointer' }}>{reqBusy ? '…' : 'Send chat request +'}</button>}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── مستطيلات القريبين تحت قائمة الشات ───────────────────────── */
function NearbyRows({ me, onOpen, selecting }: { me: Me; onOpen: (p: Peer) => void; selecting?: boolean }) {
  const [, force] = useState(0);
  useEffect(() => { const offs = [on('msgs', () => force(x => x + 1)), on('unread', () => force(x => x + 1)), on('peers', () => force(x => x + 1))]; return () => offs.forEach(f => f()); }, []);
  useEffect(() => { const f = () => force(x => x + 1); window.addEventListener('sfc-nearby-sel', f); return () => window.removeEventListener('sfc-nearby-sel', f); }, []);
  const rows = loadIndex(me.id);
  const loc = jget<Record<string, number>>(kUnread(me.id), {});
  const missing = rows.filter(c => !c.avatar).map(c => c.id).join(',');
  useEffect(() => { missing.split(',').filter(Boolean).slice(0, 5).forEach(id => { const mm = E.me; if (mm) void hydrateProfile(mm, id); }); }, [missing]);
  if (!rows.length) return null;
  return (
    <>
      <style>{`[data-nearby-has="1"] > div:not([role="button"]):not([data-nearby-rows]) { display: none !important; }`}</style>
      {/* [v1.6] فواصل: قائمة الشات العادية فوق، وبعدها قسم الموقع، وبعده قسم البلوتوث */}
      {(['geo', 'ble'] as const).map(sec => {
        const group = rows.filter(c => (sec === 'ble' ? !!c.ble : !c.ble));
        if (!group.length) return null;
        const col = sec === 'ble' ? '#15803d' : '#1d4ed8';
        return (
          <React.Fragment key={sec}>
            <div data-nearby-section={sec} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 2px 2px', flexShrink: 0 }}>
              <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.14)' }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: col, background: sec === 'ble' ? '#dcfce7' : '#dbeafe', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}>
                {sec === 'ble' ? '🟢 Bluetooth chats' : '🔵 Location chats'}
              </span>
              <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.14)' }} />
            </div>
            {group.map(c => {
        const last = loadMsgs(me.id, c.id).slice(-1)[0];
        const un = (loc[c.id] || 0) + (E.srvUnread[c.id] || 0);
        const live = bleReachable(c.id);
        return (
          <div key={c.id} role="button" data-nearby-row="1" onClick={() => { if (selecting) { if (NSEL.has(c.id)) NSEL.delete(c.id); else NSEL.add(c.id); nselEmit(); force(x => x + 1); } else onOpen({ id: c.id, name: c.name, avatar: c.avatar, ble: c.ble, geo: c.geo }); }}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 16, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.14)', background: '#fff' }}>
            {selecting && (
              <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${GREEN}`, background: NSEL.has(c.id) ? GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box' }}>
                {NSEL.has(c.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
            )}
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
          </React.Fragment>
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
    if (u) { loadAccepted(u.id); void syncLinks(u); if (!jget(kHidden(u.id), false)) void bleStart(u); } // الاستقبال بالبلوتوث طالما صفحة Stooorna Ai مفتوحة
  }, [sheet]);

  useEffect(() => { if (!selecting && NSEL.size) { NSEL.clear(); nselEmit(); } }, [selecting]);

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
        try {
          const d = await net('/api/nearby/unread'); E.srvUnread = d?.bySender || {}; emit('unread');
          // [v1.4] رسالة جاتني من شخص ما عندي له مستطيل => أنزّله في القائمة (مع صورته) عشان تنشاف
          const have = new Set(loadIndex(me.id).map(c => c.id));
          for (const sid of Object.keys(E.srvUnread)) {
            if (have.has(sid) || !canTalk(sid)) continue;
            touchIndex(me.id, { id: sid, name: 'User' });
            const pr = await hydrateProfile(me, sid);
            if (pr?.name) touchIndex(me.id, { id: sid, name: pr.name, avatar: pr.avatar });
            void syncPeer(me, sid, pr?.name);
            emit('msgs');
          }
        } catch { /* */ }
      }
      recount();
    };
    void tick();
    const t = window.setInterval(tick, 5000);
    const beat = () => { if (jget(kHidden(me.id), false) || !isOnline()) return; void publishPos().catch(() => { /* */ }); }; // أنشر موقعي طالما الصفحة مفتوحة
    beat();
    const hb = window.setInterval(beat, 45000);
    const offMsgs = on('msgs', () => { void tick(false); });
    const offLinks = on('links', recount);
    const onNet = () => { void flushPending(); void tick(); };
    window.addEventListener('online', onNet);
    return () => { alive = false; window.clearInterval(t); window.clearInterval(hb); offMsgs(); offLinks(); void net('/api/nearby/ping', { method: 'DELETE' }).catch(() => { /* */ }); window.removeEventListener('online', onNet); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheet || !me) return null;
  return (
    <>
      {/* النقطة الزرقاء الصغيرة: فقط في صفحة قائمة الشات، بجانب زر القائمة (مكانها في الصورة ≈ 100px من اليمين) */}
      {listBox && !selecting && createPortal(
        <div data-sfc-portal="1" style={{ position: 'absolute', right: 83, top: 0, bottom: 0, display: 'flex', alignItems: 'center', zIndex: 9, pointerEvents: 'none' }}>
          <button type="button" aria-label="Nearby" title="Nearby" onClick={() => setView({ mode: 'search' })}
            style={{ pointerEvents: 'auto', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: BLUE, position: 'relative', display: 'block' }}>
              {badge > 0 && <span style={{ position: 'absolute', top: -9, left: 7, minWidth: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, lineHeight: '14px', textAlign: 'center', padding: '0 3px', boxSizing: 'border-box' }}>{badge > 99 ? '99+' : badge}</span>}
            </span>
          </button>
        </div>,
        sheet.header,
      )}
      {host && createPortal(<NearbyRows me={me} selecting={selecting} onOpen={(p) => setView({ mode: 'chat', peer: p })} />, host)}
      {view?.mode === 'search' && createPortal(
        <Layer modal onEsc={() => setView(null)}><NearbyDialog me={me} onClose={() => setView(null)} onOpenChat={(p) => setView({ mode: 'chat', peer: p })} /></Layer>,
        document.body,
      )}
      {/* [v1.5] الدردشة داخل الشيت نفسه (بنفس حجم قائمة الشات) وليست صفحة كاملة */}
      {view?.mode === 'chat' && createPortal(
        <NearbyChat me={me} peer={view.peer} onClose={() => setView(null)} />,
        sheet.inner,
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

nselEmit();
installNearbyPatch();
