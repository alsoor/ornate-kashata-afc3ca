// ─────────────────────────────────────────────────────────────────────────────
// Story moderation (Owner @Stooorna + moderators the owner grants)
//  • Owner/moderator deletes any user's story WITH a message (copyright / app rules)
//  • 3 levels:  gray = first warning (no ban) · orange = 3-day story ban · red = 7-day story ban
//  • The deleted media snapshot + message are kept in a "notice" the target sees in the bell
//  • Everything is local-first (localStorage) and synced best-effort with:
//      GET  /api/story-moderation/notices?userId=<id>   (omit userId = all, owner only)
//      POST /api/story-moderation/notices               (create notice)
//      POST /api/story-moderation/notices/seen          { ids }
//      POST /api/story-moderation/notices/lift          { id }
//      GET  /api/story-moderation/moderators
//      POST /api/story-moderation/moderators            { userId, enabled }
//      POST /api/story-moderation/delete-story          { storyId, mediaUrl }
// ─────────────────────────────────────────────────────────────────────────────

export type StrikeLevel = 'gray' | 'orange' | 'red';

export interface ModerationNotice {
  id: string;
  targetUserId: string;
  targetUsername?: string | null;
  targetName?: string | null;
  storyId: number;
  mediaUrl: string;
  mediaType: string;
  /** small snapshot (data URL) kept so the user can still see what was removed */
  thumbDataUrl?: string | null;
  overlayText?: string | null;
  level: StrikeLevel;
  message: string;
  createdAt: string;
  /** ISO date until which the user cannot publish stories (null = warning only) */
  banUntil: string | null;
  /** 1 = first strike, 2 = second, ... (counted per target user) */
  strikeNumber: number;
  /** owner lifted the ban early */
  banLifted?: boolean;
  seen: boolean;
  /** true = the owner cleared ALL of this user's stories (storyId is 0) */
  clearAll?: boolean;
  /** the target's device already removed the story from the server */
  applied?: boolean;
}

export const LEVEL_META: Record<StrikeLevel, { label: string; short: string; color: string; days: number }> = {
  gray:   { label: 'رمادي — إنذار أول (بدون حظر)', short: 'إنذار', color: '#9ca3af', days: 0 },
  orange: { label: 'برتقالي — منع النشر 3 أيام',   short: 'حظر 3 أيام', color: '#f97316', days: 3 },
  red:    { label: 'أحمر — منع النشر أسبوع',       short: 'حظر أسبوع', color: '#ef4444', days: 7 },
};

const NOTICES_KEY = 'stooorna_story_mod_notices_v1';
const MODS_KEY = 'stooorna_story_mod_moderators_v1';
const EVT = 'stooorna:story-moderation-changed';
const MAX_NOTICES = 150;

const OWNER_EMAIL = 'stooorna@mail.com';
const OWNER_USERNAME = 'stooorna';

export function isStoryOwner(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
): boolean {
  if (!user && !profileUsername) return false;
  const email = (user?.email ?? '').trim().toLowerCase();
  const username = ((profileUsername ?? user?.username ?? user?.name ?? '') as string).replace(/^@/, '').trim().toLowerCase();
  return email === OWNER_EMAIL || username === OWNER_USERNAME;
}

function emit() { try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* */ } }
export function onModerationChanged(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  const onStorage = (e: StorageEvent) => { if (e.key === NOTICES_KEY || e.key === MODS_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', onStorage); };
}

// ── Notices store ───────────────────────────────────────────────────────────
export function loadNotices(): ModerationNotice[] {
  try {
    const raw = localStorage.getItem(NOTICES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveNotices(list: ModerationNotice[]) {
  const sorted = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, MAX_NOTICES);
  try { localStorage.setItem(NOTICES_KEY, JSON.stringify(sorted)); }
  catch {
    // storage full → drop snapshots of the oldest notices and retry
    try { localStorage.setItem(NOTICES_KEY, JSON.stringify(sorted.map((n, i) => (i > 10 ? { ...n, thumbDataUrl: null } : n)))); } catch { /* */ }
  }
  emit();
}
function mergeNotices(remote: ModerationNotice[]) {
  if (!remote.length) return;
  const local = loadNotices();
  const byId = new Map(local.map(n => [n.id, n]));
  let changed = false;
  for (const r of remote) {
    if (!r || !r.id) continue;
    const cur = byId.get(r.id);
    if (!cur) { byId.set(r.id, { ...r, seen: !!r.seen }); changed = true; }
    else {
      const merged = { ...cur, ...r, thumbDataUrl: cur.thumbDataUrl || r.thumbDataUrl || null, seen: cur.seen || !!r.seen, banLifted: cur.banLifted || r.banLifted };
      if (JSON.stringify(merged) !== JSON.stringify(cur)) { byId.set(r.id, merged); changed = true; }
    }
  }
  if (changed) saveNotices([...byId.values()]);
}

export function noticesForUser(userId?: string | null): ModerationNotice[] {
  if (!userId) return [];
  return loadNotices()
    .filter(n => String(n.targetUserId) === String(userId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
export function strikeCountForUser(userId?: string | null): number {
  return noticesForUser(userId).length;
}
export function unseenCountForUser(userId?: string | null): number {
  return noticesForUser(userId).filter(n => !n.seen).length;
}

export async function fetchNotices(opts: { userId?: string | null; all?: boolean }): Promise<void> {
  try {
    const q = opts.all ? '' : `?userId=${encodeURIComponent(String(opts.userId || ''))}`;
    if (!opts.all && !opts.userId) return;
    const r = await fetch(`/api/story-moderation/notices${q}`, { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    const list: ModerationNotice[] = Array.isArray(d) ? d : Array.isArray(d?.notices) ? d.notices : [];
    mergeNotices(list);
  } catch { /* offline / no backend yet — local only */ }
}

export async function markNoticesSeen(userId?: string | null) {
  if (!userId) return;
  const list = loadNotices();
  const ids: string[] = [];
  const next = list.map(n => {
    if (String(n.targetUserId) === String(userId) && !n.seen) { ids.push(n.id); return { ...n, seen: true }; }
    return n;
  });
  if (!ids.length) return;
  saveNotices(next);
  try {
    await fetch('/api/story-moderation/notices/seen', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
  } catch { /* */ }
}

// ── Ban state ───────────────────────────────────────────────────────────────
export function getActiveBan(userId?: string | null): { until: number; level: StrikeLevel; noticeId: string } | null {
  if (!userId) return null;
  const now = Date.now();
  let best: { until: number; level: StrikeLevel; noticeId: string } | null = null;
  for (const n of noticesForUser(userId)) {
    if (!n.banUntil || n.banLifted) continue;
    const t = +new Date(n.banUntil);
    if (t > now && (!best || t > best.until)) best = { until: t, level: n.level, noticeId: n.id };
  }
  return best;
}

export function formatBanCountdown(ms: number): { days: number; hh: string; mm: string; ss: string; text: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (x: number) => String(x).padStart(2, '0');
  const dayTxt = days === 1 ? 'يوم' : days === 2 ? 'يومين' : `${days} أيام`;
  return { days, hh: p(h), mm: p(m), ss: p(s), text: `${days > 0 ? dayTxt + ' و ' : ''}${p(h)}:${p(m)}:${p(s)}` };
}

export async function liftBan(noticeId: string) {
  saveNotices(loadNotices().map(n => (n.id === noticeId ? { ...n, banLifted: true } : n)));
  try {
    await fetch('/api/story-moderation/notices/lift', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noticeId }),
    });
  } catch { /* */ }
}

// ── Media snapshot (so the notice can still show what was deleted) ──────────
function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
function drawToJpeg(src: CanvasImageSource, w: number, h: number, max = 560, q = 0.7): string | null {
  try {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  } catch { return null; }
}
export async function snapshotStoryMedia(url: string, mediaType: string, max = 560, q = 0.7): Promise<string | null> {
  if (!url) return null;
  const isVideo = /video/i.test(mediaType) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  try {
    if (!isVideo) {
      const blob = await (await fetch(url, { credentials: 'omit' })).blob();
      const dataUrl = await blobToDataUrl(blob);
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      return drawToJpeg(img, img.naturalWidth, img.naturalHeight, max, q) || dataUrl;
    }
    return await new Promise<string | null>(resolve => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
      const done = (val: string | null) => { try { v.src = ''; } catch { /* */ } resolve(val); };
      const t = setTimeout(() => done(null), 6000);
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); } catch { clearTimeout(t); done(null); } };
      v.onseeked = () => { clearTimeout(t); done(drawToJpeg(v, v.videoWidth || 360, v.videoHeight || 640, max, q)); };
      v.onerror = () => { clearTimeout(t); done(null); };
    });
  } catch { return null; }
}

// ── Create notice (called when the owner/moderator deletes a story) ─────────
export async function createModerationNotice(input: {
  target: { userId: string; username?: string | null; name?: string | null };
  story: { id: number; mediaUrl: string; mediaType: string; overlayText?: string | null };
  level: StrikeLevel;
  message: string;
  thumbDataUrl?: string | null;
  clearAll?: boolean;
}): Promise<ModerationNotice> {
  const days = LEVEL_META[input.level].days;
  const notice: ModerationNotice = {
    id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetUserId: String(input.target.userId),
    targetUsername: input.target.username ?? null,
    targetName: input.target.name ?? null,
    storyId: input.story.id,
    mediaUrl: input.story.mediaUrl,
    mediaType: input.story.mediaType,
    thumbDataUrl: input.thumbDataUrl ?? null,
    overlayText: input.story.overlayText ?? null,
    level: input.level,
    message: input.message.trim(),
    createdAt: new Date().toISOString(),
    banUntil: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
    strikeNumber: strikeCountForUser(input.target.userId) + 1,
    seen: false,
    clearAll: !!input.clearAll,
  };
  saveNotices([notice, ...loadNotices()]);
  // 1) real delivery: the existing /api/messages backend (works today, no new server routes)
  await sendNoticeDM(notice);
  // 2) optional dedicated route (only if you add it on the server)
  try {
    await fetch('/api/story-moderation/notices', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notice),
    });
  } catch { /* */ }
  return notice;
}

/** Try every known delete route for a story (owner routes first, then the regular ones) */
export async function deleteStoryOnServer(storyId: number, mediaUrl?: string): Promise<boolean> {
  const id = storyId;
  const json = { 'Content-Type': 'application/json' };
  const attempts: Array<() => Promise<Response>> = [
    () => fetch('/api/story-moderation/delete-story', { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify({ storyId: id, statusId: id, mediaUrl }) }),
    () => fetch(`/api/status/${id}`, { method: 'DELETE', credentials: 'include' }),
    () => fetch(`/api/owner/status/${id}`, { method: 'DELETE', credentials: 'include' }),
    () => fetch(`/api/owner/stories/${id}`, { method: 'DELETE', credentials: 'include' }),
    () => fetch(`/api/status?id=${encodeURIComponent(String(id))}`, { method: 'DELETE', credentials: 'include' }),
    () => fetch('/api/status/delete', { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify({ id, statusId: id, storyId: id }) }),
    () => fetch(`/api/stories/${id}`, { method: 'DELETE', credentials: 'include' }),
    () => fetch('/api/status', { method: 'DELETE', credentials: 'include', headers: json, body: JSON.stringify({ id, statusId: id }) }),
    () => fetch('/api/status/remove', { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify({ id, statusId: id, storyId: id, mediaUrl }) }),
    () => fetch(`/api/status/${id}?force=1`, { method: 'DELETE', credentials: 'include' }),
  ];
  for (const run of attempts) {
    try { const r = await run(); if (r.ok || r.status === 204) return true; } catch { /* next */ }
  }
  return false;
}
/** kept for older callers */
export async function moderatorDeleteStory(storyId: number, mediaUrl?: string) { await deleteStoryOnServer(storyId, mediaUrl); }

const DELETED_IDS_KEY = 'stooorna_deleted_story_ids'; // same key add-friend.tsx uses
function rememberDeletedIds(ids: number[]) {
  try {
    const cur: number[] = JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]');
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...cur, ...ids].slice(-300)));
  } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent('stooorna:story-moderation-applied', { detail: { ids } })); } catch { /* */ }
}

/** Every story currently visible for a user (GET /api/status groups) */
async function listUserStories(userId: string): Promise<{ id: number; mediaUrl: string; mediaType: string; overlayText?: string | null }[]> {
  try {
    const r = await fetch('/api/status', { credentials: 'include' });
    if (!r.ok) return [];
    const d = await r.json() as { statuses?: { userId: string; items: { id: number; mediaUrl: string; mediaType: string; overlayText?: string | null }[] }[] };
    const g = (d.statuses || []).find(x => String(x.userId) === String(userId));
    return g ? g.items.map(it => ({ id: it.id, mediaUrl: it.mediaUrl, mediaType: it.mediaType, overlayText: it.overlayText })) : [];
  } catch { return []; }
}

/** Owner: wipe ALL stories of a user + send him a notice (gray/orange/red) */
export async function clearAllStoriesForUser(
  target: { userId: string; username?: string | null; name?: string | null },
  message: string,
  level: StrikeLevel,
): Promise<number> {
  const items = await listUserStories(target.userId);
  const first = items[0];
  const thumb = first ? await snapshotStoryMedia(first.mediaUrl, first.mediaType, 260, 0.5) : null;
  await createModerationNotice({
    target,
    story: { id: 0, mediaUrl: first?.mediaUrl || '', mediaType: first?.mediaType || 'image', overlayText: null },
    level, message, thumbDataUrl: thumb, clearAll: true,
  });
  rememberDeletedIds(items.map(i => i.id));
  await Promise.all(items.map(i => deleteStoryOnServer(i.id, i.mediaUrl)));
  return items.length;
}

// ── Delivery through the existing /api/messages backend ─────────────────────
// The notice travels as a direct message from the owner: "[[STORYMOD]]{json}".
// The target's device picks it up (StoryModerationWatcher), shows it in the bell,
// and deletes the story from the server with his OWN account — so it disappears for everyone.
export const MOD_PREFIX = '[[STORYMOD]]';
export const isModBody = (b?: string | null) => typeof b === 'string' && b.startsWith(MOD_PREFIX);

function packNotice(n: ModerationNotice, withThumb: boolean): string {
  return MOD_PREFIX + JSON.stringify({
    id: n.id, tu: n.targetUserId, tn: n.targetUsername, tm: n.targetName, s: n.storyId, u: n.mediaUrl, t: n.mediaType,
    th: withThumb ? n.thumbDataUrl : null, o: n.overlayText, lv: n.level, m: n.message, at: n.createdAt, b: n.banUntil, n: n.strikeNumber, all: !!n.clearAll,
  });
}
function unpackNotice(body: string): ModerationNotice | null {
  try {
    const d = JSON.parse(body.slice(MOD_PREFIX.length));
    if (!d?.id || !d?.tu) return null;
    return {
      id: d.id, targetUserId: String(d.tu), targetUsername: d.tn ?? null, targetName: d.tm ?? null, storyId: Number(d.s) || 0,
      mediaUrl: d.u || '', mediaType: d.t || 'image', thumbDataUrl: d.th ?? null, overlayText: d.o ?? null,
      level: (['gray', 'orange', 'red'].includes(d.lv) ? d.lv : 'gray') as StrikeLevel, message: String(d.m || ''),
      createdAt: d.at || new Date().toISOString(), banUntil: d.b ?? null, strikeNumber: Number(d.n) || 1, seen: false, clearAll: !!d.all,
    };
  } catch { return null; }
}

async function postDM(receiverId: string, body: string): Promise<boolean> {
  try {
    const r = await fetch('/api/messages', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiverId, body }) });
    return r.ok;
  } catch { return false; }
}
export async function sendNoticeDM(n: ModerationNotice): Promise<boolean> {
  let small = n.thumbDataUrl || null;
  if (!small && n.mediaUrl) small = await snapshotStoryMedia(n.mediaUrl, n.mediaType, 240, 0.5);
  const withThumb: ModerationNotice = { ...n, thumbDataUrl: small };
  if (await postDM(n.targetUserId, packNotice(withThumb, true))) return true;
  return postDM(n.targetUserId, packNotice(n, false)); // body too big? retry without the picture
}

/** Feed chat rows through this: stores any notices found and returns the rows WITHOUT them */
export function ingestModMessageRows<T extends { body?: string | null }>(rows: T[]): T[] {
  const found: ModerationNotice[] = [];
  const rest = rows.filter(r => {
    if (!isModBody(r.body)) return true;
    const n = unpackNotice(String(r.body));
    if (n) found.push(n);
    return false;
  });
  if (found.length) mergeNotices(found);
  return rest;
}

let ownerIdCache: string | null = null;
async function resolveOwnerId(): Promise<string | null> {
  if (ownerIdCache) return ownerIdCache;
  try {
    const r = await fetch('/api/users/by-username/stooorna', { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    ownerIdCache = (d.id || d.userId || d.user?.id || null) as string | null;
  } catch { /* */ }
  return ownerIdCache;
}

/** Target device: pull notices sent by the owner (only when the owner has unread messages for me) */
export async function pullNoticesFromOwner(myId: string): Promise<void> {
  try {
    const ownerId = await resolveOwnerId();
    if (!ownerId || String(ownerId) === String(myId)) return;
    const u = await fetch('/api/messages/unread', { credentials: 'include' });
    if (!u.ok) return;
    const d = await u.json() as { bySender?: Record<string, number> };
    if (!((d.bySender || {})[ownerId] > 0)) return;
    const r = await fetch(`/api/messages?with=${encodeURIComponent(ownerId)}`, { credentials: 'include' });
    if (!r.ok) return;
    const rows = await r.json();
    if (Array.isArray(rows)) ingestModMessageRows(rows as { body?: string }[]);
  } catch { /* */ }
}

/** Target device: remove the story(ies) from the server with the user's own account */
export async function applyPendingNotices(myId: string): Promise<void> {
  const pending = noticesForUser(myId).filter(n => !n.applied);
  if (!pending.length) return;
  for (const n of pending) {
    // keep a picture for the bell before the media disappears
    if (!n.thumbDataUrl && n.mediaUrl) {
      const th = await snapshotStoryMedia(n.mediaUrl, n.mediaType, 260, 0.5);
      if (th) saveNotices(loadNotices().map(x => (x.id === n.id ? { ...x, thumbDataUrl: th } : x)));
    }
    let ids: number[] = [];
    if (n.clearAll) {
      const mine = await listUserStories(myId);
      ids = mine.map(i => i.id);
      rememberDeletedIds(ids);
      await Promise.all(mine.map(i => deleteStoryOnServer(i.id, i.mediaUrl)));
    } else if (n.storyId) {
      ids = [n.storyId];
      rememberDeletedIds(ids);
      await deleteStoryOnServer(n.storyId, n.mediaUrl);
    }
    saveNotices(loadNotices().map(x => (x.id === n.id ? { ...x, applied: true } : x)));
  }
}

// ── Moderators (owner grants the tool to chosen users) ──────────────────────
export function loadModerators(): string[] {
  try { const a = JSON.parse(localStorage.getItem(MODS_KEY) || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}
export function isModerator(userId?: string | null): boolean {
  return !!userId && loadModerators().includes(String(userId));
}
export async function setModerator(userId: string, enabled: boolean) {
  const cur = new Set(loadModerators());
  if (enabled) cur.add(String(userId)); else cur.delete(String(userId));
  try { localStorage.setItem(MODS_KEY, JSON.stringify([...cur])); } catch { /* */ }
  emit();
  try {
    await fetch('/api/story-moderation/moderators', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, enabled }),
    });
  } catch { /* */ }
}
export async function fetchModerators() {
  try {
    const r = await fetch('/api/story-moderation/moderators', { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    const ids: unknown[] = Array.isArray(d) ? d : Array.isArray(d?.moderators) ? d.moderators : [];
    if (!ids.length && !Array.isArray(d?.moderators)) return;
    localStorage.setItem(MODS_KEY, JSON.stringify(ids.map(x => String((x as { userId?: string })?.userId ?? x))));
    emit();
  } catch { /* */ }
}
