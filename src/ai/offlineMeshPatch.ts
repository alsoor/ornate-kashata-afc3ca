/**
 * OFFLINE MESH PATCH  —  src/ai/offlineMeshPatch.ts   (ملف مستقل — لا يعدّل أي ملف موجود)
 *
 * يضيف فوق nearbyPatch.tsx بدون لمسه:
 *  1) دردشة تكمل طبيعي لو انقطع النت: الإرسال يتحوّل تلقائياً لرابط الجهاز-للجهاز (بلوتوث / Wi-Fi Direct)،
 *     وإذا الطرف مو قريب مباشرة تمر الرسالة عبر جهاز وسيط قريب (هوب) حتى مرتين (TTL=2).
 *     والعنوان داخل الدردشة يتغيّر من  "Via internet"  إلى  "Out internet …"  فعلياً.
 *  2) البحث عن أشخاص "بالموقع" بدون إنترنت: الأجهزة المتصلة تتبادل إحداثياتها (GPS يشتغل بدون نت)
 *     فتظهر النتائج بالمسافة مثل البحث العادي.
 *  3) طلب الدردشة / القبول / الرفض / الإلغاء بدون إنترنت: تنتقل بين الجهازين مباشرة، وتُحفظ محلياً،
 *     وتُزامَن مع السيرفر تلقائياً أول ما يرجع النت (السيرفر يقبل تلقائياً لو الطرفين أرسلوا).
 *  4) الأصدقاء/الطلبات تُحفظ محلياً (كاش) فتبقى تعمل بعد إعادة فتح التطبيق بدون نت.
 *  5) يشتغل مع إضافة أندرويد (StooornaNearbyPlugin.kt) وإضافة آيفون (StooornaNearbyPlugin.swift) بنفس الواجهة.
 *
 * كيف يشتغل بدون تعديل الملف الأساسي:
 *  - يلفّ window.StooornaNearby بغلاف يضيف التوجيه عبر الوسيط + تبادل الموقع + الطلبات (نفس start/stop/send/addListener).
 *  - يلفّ window.fetch لمسارات /api/nearby* و /api/friends فقط: مع النت يمرّرها كما هي (ويخزّن نسخة)،
 *    وبدون نت يجيب نفس شكل ردود السيرفر من الجهاز نفسه.
 *  - يخلّي navigator.onLine = true فقط أثناء فتح شيت Stooorna Ai + وجود إضافة البلوتوث + انقطاع النت الفعلي،
 *    حتى تكمل الواجهة الأصلية بدل ما توقف عند "No internet".
 *
 * الربط (سطر واحد في index.ts):  import './offlineMeshPatch';
 * إيقاف طارئ:  localStorage.setItem('stooorna_offline_mesh_off','1')  ثم أعد تشغيل التطبيق.
 *
 * ⚠️ حدود فيزيائية: بدون إنترنت الاكتشاف يغطي فقط الأجهزة داخل مدى البلوتوث/Wi-Fi Direct (+ قفزة وسيطة).
 *    أندرويد↔أندرويد وآيفون↔آيفون فقط؛ أندرويد↔آيفون بدون نت غير ممكن بهذه الإضافات (بروتوكولات مختلفة).
 */

export const OFFLINE_MESH_PATCH_VERSION = '1.0.0';

type Any = any;
type Frame = { k: string; [key: string]: Any };
type MeUser = { id: string; name: string; username?: string | null };
interface MeshPeer { id: string; n: string; u?: string | null; la?: number; lo?: number; at: number; via: string | null }
interface LIn { id: string; fromId: string; name: string; username?: string | null; ts: number }
interface LOut { id: string; toId: string; name: string; username?: string | null; ts: number; synced: boolean }
interface LAcc { peerId: string; name: string; username?: string | null; ts: number; synced: boolean }
interface LFrame { to: string; key: string; f: Frame }
interface Store {
  requests: Any | null; friendIds: string[] | null; friendsRaw: Any | null; profiles: Record<string, Any>;
  inc: LIn[]; out: LOut[]; acc: LAcc[]; frames: LFrame[];
}

const PFX = '\u0001SM1:';              // بادئة الإطارات الخاصة داخل نص الرسالة (الإضافة الأصلية ما تتغيّر)
const PLUGIN = 'StooornaNearby';
const RX_API = /\/api\/(nearby|friends)(\/[^?#]*)?$/;
const emptyStore = (): Store => ({ requests: null, friendIds: null, friendsRaw: null, profiles: {}, inc: [], out: [], acc: [], frames: [] });
const nid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const num = (v: Any): number | undefined => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : undefined; };

function haversine(a1: number, o1: number, a2: number, o2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const x = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function createOfflineMesh(W: Any) {
  const nav: Any = W.navigator, doc: Any = W.document, ls: Any = W.localStorage;
  const origFetch: Any = typeof W.fetch === 'function' ? W.fetch.bind(W) : null;
  const navDesc = (() => { try { return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nav), 'onLine'); } catch { return undefined; } })();
  const rawOnline = (): boolean => { try { return navDesc && navDesc.get ? navDesc.get.call(nav) !== false : true; } catch { return true; } };

  let me: MeUser | null = null;
  let store: { id: string; s: Store } | null = null;
  let started = false;
  let sheetOpen = false;
  let probeOk: boolean | null = null;
  let myPos: { lat: number; lng: number; acc?: number } | null = null;
  let realCache: Any = null;
  let hooked = false;
  let syncing = false;
  let helloTimer = 0;
  const timers: Any[] = [];
  const direct = new Map<string, MeshPeer>();
  const mesh = new Map<string, MeshPeer>();
  const listeners: Record<string, Set<(d: Any) => void>> = {};

  /* ───────────── الإضافة الأصلية ───────────── */
  function real(): Any {
    if (realCache) return realCache;
    try {
      const ex = W.StooornaNearby; if (ex && !ex.__offlineMesh) { realCache = ex; return ex; }
      const C = W.Capacitor; let p = C && C.Plugins && C.Plugins[PLUGIN];
      if (!p && C && typeof C.registerPlugin === 'function' && Array.isArray(C.PluginHeaders) && C.PluginHeaders.some((h: Any) => h && h.name === PLUGIN)) p = C.registerPlugin(PLUGIN);
      if (p) realCache = p;
      return p || null;
    } catch { return null; }
  }
  const hasNative = () => !!real();

  /* ───────────── المستخدم + التخزين المحلي ───────────── */
  function findMe(): MeUser | null {
    try {
      const btn = doc.querySelector('button[aria-label="History"]');
      const k = btn && Object.keys(btn).find((x: string) => x.startsWith('__reactFiber$') || x.startsWith('__reactInternalInstance$'));
      let f: Any = k ? btn[k] : null; let n = 0;
      while (f && n++ < 80) {
        const p = f.memoizedProps;
        if (p && typeof p === 'object' && 'user' in p && 'onClose' in p && 'open' in p) { if (p.user && p.user.id) return { id: String(p.user.id), name: String(p.user.name || p.user.username || 'User'), username: p.user.username || null }; break; }
        f = f.return;
      }
    } catch { /* */ }
    const g = W.__STOOORNA_USER__;
    return g && g.id ? { id: String(g.id), name: String(g.name || g.username || 'User'), username: g.username || null } : null;
  }
  function ensureMe(): boolean {
    if (!sheetOpen) return false;
    const u = findMe();
    if (u) { if (!me || me.id !== u.id) { me = u; store = null; } else { me.username = u.username ?? me.username; me.name = u.name || me.name; } }
    return !!me;
  }
  const skey = (id: string) => `stooorna_ob_v1_${id}`;
  function S(): Store {
    if (store && me && store.id === me.id) return store.s;
    let s = emptyStore();
    try { const raw = me && ls.getItem(skey(me.id)); if (raw) s = { ...emptyStore(), ...JSON.parse(raw) }; } catch { /* */ }
    store = { id: me ? me.id : '', s };
    return s;
  }
  function save() { try { if (store && store.id) ls.setItem(skey(store.id), JSON.stringify(store.s)); } catch { /* */ } }
  const hiddenLoc = (): boolean => { try { return !!me && JSON.parse(ls.getItem(`stooorna_nearby_hidden_v1_${me.id}`) || 'false') === true; } catch { return false; } };
  function prof(id: string, p: { name?: string; username?: string | null; avatar?: string | null }) {
    if (!id) return; const s = S(); const cur = s.profiles[id] || {};
    s.profiles[id] = { name: p.name || cur.name, username: p.username ?? cur.username ?? null, avatar: p.avatar || cur.avatar || null };
    const ks = Object.keys(s.profiles); if (ks.length > 300) delete s.profiles[ks[0]];
  }
  const nameOf = (id: string) => S().profiles[id]?.name || mesh.get(id)?.n || 'User';
  const userOf = (id: string) => S().profiles[id]?.username ?? mesh.get(id)?.u ?? null;

  /* ───────────── النقل: مباشر أو عبر وسيط ───────────── */
  const enc = (f: Frame) => PFX + JSON.stringify(f);
  async function rawSend(peerId: string, text: string, x?: { clientId?: string; ts?: number; fromName?: string }) {
    const p = real(); if (!p) throw new Error('no plugin');
    await p.send({ peerId, text, clientId: x?.clientId || nid(), ts: x?.ts || Date.now(), fromName: x?.fromName || me?.name || '' });
  }
  function nextHop(to: string): string | null {
    if (direct.has(to)) return to;
    const m = mesh.get(to); return m && m.via && direct.has(m.via) ? m.via : null;
  }
  async function routeSend(to: string, text: string, x?: { clientId?: string; ts?: number; fromName?: string }) {
    if (direct.has(to)) return rawSend(to, text, x);
    const hop = nextHop(to); if (!hop || !me) throw new Error('not connected');
    return rawSend(hop, enc({ k: 'ry', to, from: me.id, fn: x?.fromName || me.name, ttl: 2, t: text, c: x?.clientId, ts: x?.ts || Date.now() }));
  }
  const emitL = (evt: string, d: Any) => { (listeners[evt] || []).forEach(fn => { try { fn(d); } catch { /* */ } }); };

  function upsertMesh(p: { id: string; n: string; u?: string | null; la?: number; lo?: number; via: string | null }) {
    const old = mesh.get(p.id);
    if (old && old.via === null && p.via !== null) return;            // الاتصال المباشر أقوى من الوسيط
    mesh.set(p.id, { ...p, at: Date.now() });
    if (!old && p.via !== null) emitL('peerFound', { id: p.id, name: p.n });
  }
  function dropMesh(id: string) { if (mesh.delete(id)) emitL('peerLost', { id }); }

  /* الأحداث القادمة من الإضافة الأصلية */
  function onRealFound(d: Any) {
    const id = String(d?.id || ''); if (!id) return;
    const n = String(d.name || 'User');
    direct.set(id, { id, n, at: Date.now(), via: null });
    mesh.set(id, { id, n, at: Date.now(), via: null });
    emitL('peerFound', d);
    sendHello(id); scheduleHello(); void flushFrames();
  }
  function onRealLost(d: Any) {
    const id = String(d?.id || ''); if (!id) return;
    direct.delete(id); mesh.delete(id); emitL('peerLost', { id });
    mesh.forEach((m, k) => { if (m.via === id) dropMesh(k); });
    scheduleHello();
  }
  function onRealMessage(d: Any) {
    const text = String(d?.text ?? '');
    if (!text.startsWith(PFX)) { emitL('message', d); return; }          // رسالة عادية => للملف الأصلي كما هي
    let f: Frame; try { f = JSON.parse(text.slice(PFX.length)); } catch { return; }
    const from = String(d.from || '');
    if (f.k === 'h') onHello(from, f);
    else if (f.k === 'ry') onRelay(from, f);
    else onCtl(from, f);
  }
  function hook() {
    if (hooked) return; const p = real(); if (!p) return; hooked = true;
    try { void p.addListener('peerFound', onRealFound); void p.addListener('peerLost', onRealLost); void p.addListener('message', onRealMessage); } catch { hooked = false; }
  }

  /* ───────────── تبادل الموقع (hello) ───────────── */
  function myHello(): Frame {
    const hide = hiddenLoc();
    return {
      k: 'h', id: me!.id, n: me!.name, u: me!.username || null,
      la: hide || !myPos ? undefined : myPos.lat, lo: hide || !myPos ? undefined : myPos.lng,
      nb: [...direct.values()].slice(0, 12).map(p => ({ id: p.id, n: p.n, u: p.u || null, la: p.la, lo: p.lo })),
    };
  }
  function sendHello(id: string) { if (me && started) void rawSend(id, enc(myHello())).catch(() => { /* */ }); }
  function broadcastHello() { if (!me || !started) return; const t = enc(myHello()); direct.forEach((_, id) => { void rawSend(id, t).catch(() => { /* */ }); }); }
  function scheduleHello() { if (helloTimer) return; helloTimer = W.setTimeout(() => { helloTimer = 0; broadcastHello(); }, 400); }
  function onHello(from: string, f: Frame) {
    const p = direct.get(from); if (!p) return;
    const nla = num(f.la), nlo = num(f.lo);
    const changed = p.la !== nla || p.lo !== nlo || p.n !== String(f.n || p.n) || (p.u || null) !== (f.u || null);
    p.n = String(f.n || p.n); p.u = f.u || null; p.la = nla; p.lo = nlo; p.at = Date.now();
    if (changed) scheduleHello();                                         // الجيران يعرفون موقع بعض عبر الوسيط (بدون عواصف: فقط عند تغيّر فعلي)
    upsertMesh({ id: from, n: p.n, u: p.u, la: p.la, lo: p.lo, via: null });
    prof(from, { name: p.n, username: p.u });
    (Array.isArray(f.nb) ? f.nb : []).slice(0, 16).forEach((x: Any) => {
      const id = String(x?.id || ''); if (!id || !me || id === me.id || direct.has(id)) return;
      upsertMesh({ id, n: String(x.n || 'User'), u: x.u || null, la: num(x.la), lo: num(x.lo), via: from });
    });
    void flushFrames();
  }
  function setMyPos(lat: Any, lng: Any, acc?: Any) {
    const a = num(lat), o = num(lng); if (a == null || o == null) return;
    const moved = !myPos || haversine(myPos.lat, myPos.lng, a, o) > 15;
    myPos = { lat: a, lng: o, acc: num(acc) }; if (moved) scheduleHello();
  }

  /* ───────────── الوسيط (relay) ───────────── */
  function onRelay(hop: string, f: Frame) {
    if (!me) return;
    if (f.to === me.id) {
      const origin = String(f.from || ''); const m = mesh.get(origin);
      if (!m || m.via !== hop) return;                                   // لا نقبل منتحل: المصدر لازم معروف عبر نفس الوسيط
      const inner = String(f.t ?? '');
      if (inner.startsWith(PFX)) { try { onCtl(origin, JSON.parse(inner.slice(PFX.length))); } catch { /* */ } return; }
      emitL('message', { from: origin, fromName: f.fn, text: inner, clientId: f.c, ts: f.ts });
      return;
    }
    if ((Number(f.ttl) || 0) > 0 && direct.has(String(f.to))) void rawSend(String(f.to), enc({ ...f, ttl: Number(f.ttl) - 1 })).catch(() => { /* */ });
  }

  /* ───────────── الطلبات بدون إنترنت ───────────── */
  const isAcc = (id: string): boolean => {
    const s = S();
    return s.acc.some(a => a.peerId === id) || !!(s.requests?.accepted || []).some((a: Any) => String(a.peerId) === id) || !!(s.friendIds || []).includes(id);
  };
  function queueFrame(to: string, f: Frame, key: string) {
    const s = S(); s.frames = s.frames.filter(x => x.key !== key); s.frames.push({ to, f, key }); s.frames = s.frames.slice(-50); save();
  }
  async function flushFrames() {
    if (!me || !started) return; const s = S(); let changed = false;
    for (const q of [...s.frames]) {
      if (!nextHop(q.to)) continue;
      try { await routeSend(q.to, enc(q.f)); s.frames = s.frames.filter(x => x !== q); changed = true; } catch { /* يبقى بالطابور */ }
    }
    if (changed) save();
  }
  function addAcc(peerId: string, name?: string, username?: string | null) {
    const s = S(); if (s.acc.some(a => a.peerId === peerId)) return;
    s.acc.push({ peerId, name: name || nameOf(peerId), username: username ?? userOf(peerId), ts: Date.now(), synced: false });
  }
  function onCtl(from: string, f: Frame) {
    if (!me || !from) return; const s = S();
    if (f.n) prof(from, { name: String(f.n), username: f.u || null });
    if (f.k === 'rq') {
      if (isAcc(from)) { queueFrame(from, { k: 'ac', id: f.id, n: me.name, u: me.username || null }, `ac:${from}`); }
      else if (s.out.some(o => o.toId === from)) { s.out = s.out.filter(o => o.toId !== from); addAcc(from, f.n, f.u); queueFrame(from, { k: 'ac', id: f.id, n: me.name, u: me.username || null }, `ac:${from}`); }
      else if (!s.inc.some(r => r.fromId === from)) s.inc.push({ id: String(f.id || `off_${nid()}`), fromId: from, name: String(f.n || nameOf(from)), username: f.u || null, ts: Date.now() });
    } else if (f.k === 'ac') {
      s.out = s.out.filter(o => o.toId !== from); addAcc(from, f.n, f.u);
    } else if (f.k === 'dc') {
      s.out = s.out.filter(o => o.toId !== from);
    } else if (f.k === 'cx') {
      s.inc = s.inc.filter(r => !(r.fromId === from && r.id === f.id));
    }
    save(); void flushFrames();
  }
  function findIncoming(id: string): { fromId: string; name: string; username?: string | null } | null {
    const s = S(); const l = s.inc.find(r => r.id === id); if (l) return l;
    const c = (s.requests?.incoming || []).find((r: Any) => String(r.id) === id);
    return c ? { fromId: String(c.fromId), name: String(c.name || 'User'), username: c.username || null } : null;
  }
  function mergeReq(base: Any, s: Store) {
    base = base || { incoming: [], outgoing: [], accepted: [] };
    const accIds = new Set(s.acc.map(a => a.peerId));
    const accepted: Any[] = [...(base.accepted || [])]; const haveA = new Set(accepted.map((a: Any) => String(a.peerId)));
    s.acc.forEach(a => { if (!haveA.has(a.peerId)) accepted.push({ peerId: a.peerId, name: a.name, username: a.username || null, avatar: s.profiles[a.peerId]?.avatar || null }); });
    const incoming: Any[] = (base.incoming || []).filter((r: Any) => !accIds.has(String(r.fromId))); const haveI = new Set(incoming.map((r: Any) => String(r.fromId)));
    s.inc.forEach(r => { if (!haveI.has(r.fromId) && !accIds.has(r.fromId)) incoming.push({ id: r.id, fromId: r.fromId, name: r.name, username: r.username || null, avatar: s.profiles[r.fromId]?.avatar || null, ts: r.ts }); });
    const outgoing: Any[] = (base.outgoing || []).filter((r: Any) => !accIds.has(String(r.toId))); const haveO = new Set(outgoing.map((r: Any) => String(r.toId)));
    s.out.forEach(o => { if (!haveO.has(o.toId) && !accIds.has(o.toId)) outgoing.push({ id: o.id, toId: o.toId, name: o.name, username: o.username || null, avatar: s.profiles[o.toId]?.avatar || null, ts: o.ts }); });
    return { incoming, outgoing, accepted };
  }
  function reconcileWithReal(d: Any) {
    const s = S(); s.requests = d;
    const A = new Set((d.accepted || []).map((a: Any) => String(a.peerId)));
    const I = new Set((d.incoming || []).map((r: Any) => String(r.fromId)));
    s.acc = s.acc.filter(a => !A.has(a.peerId));
    s.out = s.out.filter(o => !o.synced && !A.has(o.toId));
    s.inc = s.inc.filter(r => !A.has(r.fromId) && !I.has(r.fromId));
    [...(d.incoming || []), ...(d.outgoing || []), ...(d.accepted || [])].forEach((r: Any) => prof(String(r.fromId || r.toId || r.peerId), { name: r.name, username: r.username, avatar: r.avatar }));
    save();
    return s.acc.length || s.out.length || s.inc.length ? mergeReq(d, s) : null;
  }
  async function syncOffline() {
    if (syncing || !me || !realOnline()) return; syncing = true;
    try {
      const s = S();
      const post = async (to: string) => {
        const r = await origFetch('/api/nearby/requests', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
        return r.ok || r.status === 400 || r.status === 429;
      };
      for (const a of s.acc.filter(x => !x.synced)) { try { if (await post(a.peerId)) a.synced = true; } catch { break; } }
      for (const o of s.out.filter(x => !x.synced)) { try { if (await post(o.toId)) o.synced = true; } catch { break; } }
      save();
    } finally { syncing = false; }
  }

  /* ───────────── السيرفر الافتراضي (بدون نت) ───────────── */
  function nearbyList(radiusRaw: string | null) {
    const radius = Math.min(50000, Math.max(100, Number(radiusRaw) || 3000));
    const fr = new Set(S().friendIds || []);
    const users: Any[] = [];
    mesh.forEach(m => {
      if (!me || m.id === me.id) return;
      const dist = myPos && m.la != null && m.lo != null ? haversine(myPos.lat, myPos.lng, m.la, m.lo) : undefined;
      if (dist != null && dist > radius) return;
      users.push({ id: m.id, name: m.n, username: m.u || null, avatar: S().profiles[m.id]?.avatar || null, distance: dist, friend: fr.has(m.id) });
    });
    users.sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12));
    return { users };
  }
  async function virtual(info: Any): Promise<Any> {
    const s = S(); const { method, sub } = info;
    if (method === 'GET' && sub === '/requests') return mergeReq(s.requests, s);
    if (method === 'GET' && sub === '/friends') return { ids: s.friendIds || [] };
    if (method === 'GET' && sub === '@friends') return s.friendsRaw || { accepted: [] };
    if (method === 'GET' && sub === '/unread') return { bySender: {} };
    if (sub === '/ping') { if (method === 'DELETE') { myPos = null; scheduleHello(); } else { const b = await bodyOf(info); setMyPos(b.lat, b.lng, b.accuracy); } return { ok: true }; }
    if (method === 'GET' && sub === '') return nearbyList(info.u.searchParams.get('radius'));
    if (method === 'GET' && sub.startsWith('/user/')) {
      const id = decodeURIComponent(sub.slice(6)); const p = s.profiles[id]; const m = mesh.get(id);
      if (!p && !m) return new W.Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      return { id, name: p?.name || m?.n || 'User', username: p?.username ?? m?.u ?? null, avatar: p?.avatar || null };
    }
    if (sub === '/messages') { if (method === 'GET') return { messages: [] }; throw new Error('offline'); }
    if (method === 'POST' && sub === '/requests') {
      const b = await bodyOf(info); const to = String(b.to || ''); if (!to || !me || to === me.id) throw new Error('bad');
      if (isAcc(to)) return { ok: true, status: 'accepted' };
      const inc = s.inc.find(r => r.fromId === to) || (s.requests?.incoming || []).map((r: Any) => ({ id: String(r.id), fromId: String(r.fromId) })).find((r: Any) => r.fromId === to);
      if (inc) { s.inc = s.inc.filter(r => r.fromId !== to); addAcc(to); queueFrame(to, { k: 'ac', id: inc.id, n: me.name, u: me.username || null }, `ac:${to}`); save(); void flushFrames(); return { ok: true, status: 'accepted' }; }
      let o = s.out.find(x => x.toId === to);
      if (!o) { o = { id: `off_${nid()}`, toId: to, name: nameOf(to), username: userOf(to), ts: Date.now(), synced: false }; s.out.push(o); }
      queueFrame(to, { k: 'rq', id: o.id, n: me.name, u: me.username || null }, `rq:${to}`); save(); void flushFrames();
      return { ok: true, status: 'pending', id: o.id };
    }
    if (info.reqId && info.respond && method === 'POST') {
      const b = await bodyOf(info); const r = findIncoming(info.reqId); if (!r || !me) return new W.Response('{}', { status: 404 });
      s.inc = s.inc.filter(x => x.id !== info.reqId);
      if (b.accept) { addAcc(r.fromId, r.name, r.username); queueFrame(r.fromId, { k: 'ac', id: info.reqId, n: me.name, u: me.username || null }, `ac:${r.fromId}`); }
      else queueFrame(r.fromId, { k: 'dc', id: info.reqId }, `dc:${r.fromId}`);
      save(); void flushFrames();
      return { ok: true, status: b.accept ? 'accepted' : 'declined' };
    }
    if (info.reqId && !info.respond && method === 'DELETE') {
      const o = s.out.find(x => x.id === info.reqId);
      if (o) { s.out = s.out.filter(x => x !== o); queueFrame(o.toId, { k: 'cx', id: o.id }, `cx:${o.toId}`); save(); void flushFrames(); return { ok: true }; }
    }
    throw new Error('offline');
  }
  const jsonRes = (d: Any) => (d instanceof W.Response ? d : new W.Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  async function bodyOf(info: Any): Promise<Any> {
    try {
      let raw = info.init && info.init.body;
      if (raw == null && info.input && typeof info.input.clone === 'function') raw = await info.input.clone().text();
      return typeof raw === 'string' && raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function classify(input: Any, init?: Any): Any {
    let url = ''; try { url = typeof input === 'string' ? input : input && input.href ? String(input.href) : input && input.url ? String(input.url) : ''; } catch { /* */ }
    if (!url) return null;
    let u: URL; try { u = new URL(url, (W.location && W.location.href) || 'http://localhost/'); } catch { return null; }
    const m = u.pathname.match(RX_API); if (!m) return null;
    if (m[1] === 'friends' && m[2]) return null;
    const method = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const sub = m[1] === 'friends' ? '@friends' : (m[2] || '');
    const mr = sub.match(/^\/requests\/([^/]+)(\/respond)?$/);
    return { url, u, method, sub, input, init, reqId: mr ? decodeURIComponent(mr[1]) : null, respond: !!(mr && mr[2]) };
  }

  /* ───────────── حالة الاتصال الحقيقية ───────────── */
  const realOnline = () => rawOnline() && probeOk !== false;
  const spoof = () => sheetOpen && hasNative() && !realOnline();
  function setProbe(v: boolean) {
    const was = probeOk; probeOk = v;
    if (v && was === false) { void syncOffline(); try { if (rawOnline()) W.dispatchEvent(new W.Event('online')); } catch { /* */ } }   // يوقظ إعادة الإرسال المعلّقة في الملف الأصلي
  }
  let lastProbe = 0;
  async function probe() {
    if (!sheetOpen || !origFetch) return;
    lastProbe = Date.now();
    if (!rawOnline()) { setProbe(false); return; }
    try {
      const ctl = typeof W.AbortController === 'function' ? new W.AbortController() : null; const t = ctl ? W.setTimeout(() => ctl.abort(), 3500) : 0;
      await origFetch('/api/nearby/health', { cache: 'no-store', credentials: 'include', ...(ctl ? { signal: ctl.signal } : {}) });
      if (t) W.clearTimeout(t); setProbe(true);
    } catch { setProbe(false); }
  }

  async function patchedFetch(input: Any, init?: Any): Promise<Response> {
    const info = classify(input, init);
    if (!info || !origFetch || !ensureMe()) return origFetch(input, init);
    if (info.sub === '/ping' && info.method === 'POST') { const b = await bodyOf(info); setMyPos(b.lat, b.lng, b.accuracy); }   // أحدّث آخر موقع معروف دائماً
    if (info.reqId && String(info.reqId).startsWith('off_')) { try { return jsonRes(await virtual(info)); } catch { return new W.Response('{}', { status: 503 }); } }
    const goVirtual = async () => { if (rawOnline() && Date.now() - lastProbe > 2000) void probe();   // أول ما يرجع النت نكتشفه بسرعة
      try { return jsonRes(await virtual(info)); } catch { return new W.Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } }); } };
    if (!realOnline()) return goVirtual();
    try {
      let i2 = init;
      if (typeof input === 'string' && !(init && init.signal) && typeof W.AbortController === 'function') { const c = new W.AbortController(); W.setTimeout(() => c.abort(), 6000); i2 = { ...(init || {}), signal: c.signal }; }
      const r: Response = await origFetch(input, i2);
      if (probeOk === false) setProbe(true);
      if (r.ok && info.method === 'GET') {
        const copy = r.clone();
        if (info.sub === '/requests') {
          const d = await copy.json(); const merged = reconcileWithReal(d); void syncOffline();
          return merged ? jsonRes(merged) : r;
        }
        void cacheFrom(info, copy);
      }
      return r;
    } catch (e: Any) {
      if (e && (e.name === 'TypeError' || e.name === 'AbortError')) { setProbe(false); return goVirtual(); }
      throw e;
    }
  }
  async function cacheFrom(info: Any, r: Response) {
    try {
      const d: Any = await r.json(); const s = S();
      if (info.sub === '/friends') s.friendIds = (d.ids || []).map(String);
      else if (info.sub === '@friends') s.friendsRaw = d;
      else if (info.sub === '') (Array.isArray(d) ? d : d.users || []).forEach((o: Any) => prof(String(o.id), { name: o.name, username: o.username, avatar: o.avatar }));
      else if (info.sub.startsWith('/user/') && d && d.id) prof(String(d.id), { name: d.name, username: d.username, avatar: d.avatar });
      save();
    } catch { /* */ }
  }

  /* ───────────── غلاف الإضافة الأصلية ───────────── */
  const wrapper: Any = {
    __offlineMesh: true,
    async start(opts: Any) {
      const f = findMe(); me = { id: String(opts.id), name: String(opts.name || 'User'), username: f && f.id === String(opts.id) ? f.username : me?.username || null };
      hook();
      const r = await real().start(opts);
      if (!r || r.granted !== false) started = true;
      broadcastHello();
      return r;
    },
    async stop() { started = false; direct.clear(); mesh.clear(); try { return await real().stop(); } catch { return undefined; } },
    send(opts: Any) { return routeSend(String(opts.peerId), String(opts.text ?? ''), { clientId: opts.clientId, ts: opts.ts, fromName: opts.fromName }); },
    addListener(evt: string, fn: (d: Any) => void) { hook(); (listeners[evt] || (listeners[evt] = new Set())).add(fn); return Promise.resolve({ remove: async () => { listeners[evt]?.delete(fn); } }); },
    removeAllListeners() { Object.keys(listeners).forEach(k => listeners[k].clear()); return Promise.resolve(); },
  };
  function installPlugin(): boolean {
    if (W.StooornaNearby && W.StooornaNearby.__offlineMesh) return true;
    if (!real()) return false;
    try { Object.defineProperty(W, 'StooornaNearby', { value: wrapper, configurable: true, writable: true }); return true; } catch { try { W.StooornaNearby = wrapper; return true; } catch { return false; } }
  }

  /* ───────────── عنوان الدردشة: Via internet ← Out internet ───────────── */
  function openChatPeerId(): string | null {
    try {
      const el = doc.querySelector('[data-nearby-chat="1"]'); if (!el) return null;
      const k = Object.keys(el).find((x: string) => x.startsWith('__reactFiber$')); let f: Any = k ? el[k] : null; let n = 0;
      while (f && n++ < 40) { const p = f.memoizedProps; if (p && typeof p === 'object' && p.peer && p.peer.id && 'me' in p) return String(p.peer.id); f = f.return; }
    } catch { /* */ }
    return null;
  }
  function relabel() {
    try {
      const root = doc.querySelector('[data-nearby-chat="1"]'); if (!root) return;
      const pid = openChatPeerId(); const off = spoof();
      const kind = pid ? (direct.has(pid) ? 'direct' : nextHop(pid) ? 'relay' : 'none') : 'none';
      root.querySelectorAll('div').forEach((d: Any) => {
        if (d.childElementCount) return;
        const t: string = d.textContent || '';
        if (!(t.startsWith('Via internet') || t.startsWith('Connected via Bluetooth') || t.startsWith('Out internet'))) return;
        let want: string, color: string;
        if (off) { want = kind === 'direct' ? 'Out internet — direct link' : kind === 'relay' ? 'Out internet — via a nearby device' : 'Out internet — waiting for a link · saved, sent automatically'; color = kind === 'none' ? '#b45309' : '#16a34a'; }
        else { if (!t.startsWith('Out internet')) return; want = kind === 'none' ? 'Via internet' : 'Connected via Bluetooth — direct'; color = kind === 'none' ? '#3b82f6' : '#16a34a'; }
        if (t !== want) d.textContent = want;
        d.style.color = color;
      });
    } catch { /* */ }
  }

  /* ───────────── التشغيل ───────────── */
  function tickSheet() {
    let open = false; try { open = !!doc.querySelector('button[aria-label="History"]'); } catch { /* */ }
    if (open !== sheetOpen) { sheetOpen = open; if (open) { ensureMe(); void probe(); installPlugin(); } }
    relabel();
  }
  function install() {
    if (!origFetch) return;
    W.fetch = patchedFetch;
    try { Object.defineProperty(nav, 'onLine', { configurable: true, get: () => (spoof() ? true : rawOnline()) }); } catch { /* */ }
    installPlugin();
    let tries = 0; const t0 = W.setInterval(() => { if (installPlugin() || ++tries > 30) W.clearInterval(t0); }, 1000); timers.push(t0);
    timers.push(W.setInterval(tickSheet, 700));
    timers.push(W.setInterval(() => { void probe(); }, 5000));
    timers.push(W.setInterval(() => { broadcastHello(); }, 15000));
    timers.push(W.setInterval(() => {
      void flushFrames();
      const now = Date.now(); mesh.forEach((m, k) => { if (m.via !== null && now - m.at > 45000) dropMesh(k); });
    }, 5000));
    try { W.addEventListener('online', () => { void probe(); }); W.addEventListener('offline', () => { setProbe(false); }); } catch { /* */ }
    try { if (W.MutationObserver && doc.body) { let raf = 0; new W.MutationObserver(() => { if (!raf) raf = W.requestAnimationFrame(() => { raf = 0; relabel(); }); }).observe(doc.body, { childList: true, subtree: true, characterData: true }); } } catch { /* */ }
  }
  return {
    install, wrapper, tickSheet, probe,
    dispose() { timers.forEach(t => W.clearInterval(t)); },
    _debug: () => ({ direct: [...direct.keys()], mesh: [...mesh.entries()].map(([k, v]) => [k, v.via]), store: store && store.s, realOnline: realOnline(), spoof: spoof(), myPos }),
  };
}

export function installOfflineMeshPatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w: Any = window;
  if (w.__STOOORNA_OFFLINE_MESH__) return;
  try { if (localStorage.getItem('stooorna_offline_mesh_off') === '1') return; } catch { /* */ }
  const m = createOfflineMesh(w);
  w.__STOOORNA_OFFLINE_MESH__ = OFFLINE_MESH_PATCH_VERSION;
  m.install();
}

installOfflineMeshPatch();
