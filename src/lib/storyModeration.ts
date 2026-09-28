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
function drawToJpeg(src: CanvasImageSource, w: number, h: number): string | null {
  try {
    const max = 560;
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
}
export async function snapshotStoryMedia(url: string, mediaType: string): Promise<string | null> {
  if (!url) return null;
  const isVideo = /video/i.test(mediaType) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  try {
    if (!isVideo) {
      const blob = await (await fetch(url, { credentials: 'omit' })).blob();
      const dataUrl = await blobToDataUrl(blob);
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      return drawToJpeg(img, img.naturalWidth, img.naturalHeight) || dataUrl;
    }
    return await new Promise<string | null>(resolve => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
      const done = (val: string | null) => { try { v.src = ''; } catch { /* */ } resolve(val); };
      const t = setTimeout(() => done(null), 6000);
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); } catch { clearTimeout(t); done(null); } };
      v.onseeked = () => { clearTimeout(t); done(drawToJpeg(v, v.videoWidth || 360, v.videoHeight || 640)); };
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
  };
  saveNotices([notice, ...loadNotices()]);
  try {
    await fetch('/api/story-moderation/notices', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notice),
    });
  } catch { /* delivered locally; server sync will retry via fetchNotices on owner side */ }
  return notice;
}

/** Owner/moderator hard delete of someone else's story (best effort; backend must allow it) */
export async function moderatorDeleteStory(storyId: number, mediaUrl?: string) {
  try {
    await fetch('/api/story-moderation/delete-story', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, statusId: storyId, mediaUrl }),
    });
  } catch { /* */ }
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
