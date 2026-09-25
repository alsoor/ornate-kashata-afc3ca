/**
 * VIP plan — local cache + server sync.
 * English-only identifiers and comments.
 */
export type VipColor = 'blue' | 'gold' | 'red' | 'green' | 'gray' | 'pink';

export const VIP_COLORS: Record<VipColor, string> = {
  blue: '#2563eb',
  gold: '#eab308',
  red: '#ef4444',
  green: '#22c55e',
  gray: '#9ca3af',
  pink: '#ec4899',
};

const PLAN_KEY = 'stooorna_vip_plan';
const COLOR_KEY = 'stooorna_vip_color';
const RENAME_KEY = 'stooorna_vip_rename_used';
const FEAT_KEY = 'stooorna_vip_feats';
export const VIP_FAVS_KEY = 'stooorna_vip_music_favs';

// Tracks when the user last changed VIP state on THIS device, so a slow/stale
// server response (from a fetch that started before that change) never
// overwrites a newer local change. Fixes the "color/feature reverts on its
// own" bug caused by hydrateVipFromServer / hydrateVipDirectory racing with
// a user edit.
const EDIT_TS_KEY = 'stooorna_vip_edit_ts';

function markLocalEdit(userId: string) {
  if (!userId) return;
  const map = readJson<Record<string, number>>(EDIT_TS_KEY, {});
  map[userId] = Date.now();
  writeJson(EDIT_TS_KEY, map);
}

function getLocalEditTs(userId: string): number {
  const map = readJson<Record<string, number>>(EDIT_TS_KEY, {});
  return map[userId] || 0;
}

export const VIP_PRICE_KD = 5;
export const VIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type VipPlan = {
  userId: string;
  active: boolean;
  since: number;
  expiresAt?: number;
};

export type VipFeats = {
  eightMics: boolean;
  roomMusic: boolean;
};

export type VipPublicState = {
  userId: string;
  active: boolean;
  color: VipColor;
  feats: VipFeats;
  usernameColor: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function emitVip(detail: Record<string, unknown>) {
  try {
    window.dispatchEvent(new CustomEvent('stooorna:vip', { detail }));
  } catch {
    /* ignore */
  }
}

function readAllPlans(): Record<string, VipPlan> {
  return readJson<Record<string, VipPlan>>(PLAN_KEY, {});
}

export function isVip(userId?: string | null): boolean {
  if (!userId) return false;
  const p = readAllPlans()[userId];
  if (p?.active) {
    if (p.expiresAt && Date.now() > p.expiresAt) {
      deactivateVip(userId);
      return false;
    }
    return true;
  }
  try {
    const dir = readJson<Record<string, { active?: boolean; expiresAt?: number }>>('stooorna_vip_public_dir', {});
    const row = dir[userId];
    if (!row?.active) return false;
    if (row.expiresAt && Date.now() > row.expiresAt) return false;
    return true;
  } catch {
    return false;
  }
}

export function getVipExpiry(userId?: string | null): number | null {
  if (!userId) return null;
  const p = readAllPlans()[userId];
  return p?.expiresAt || null;
}

export function deactivateVip(userId: string) {
  markLocalEdit(userId);
  const all = readAllPlans();
  if (all[userId]) {
    all[userId] = { ...all[userId], active: false };
    writeJson(PLAN_KEY, all);
  }
  try {
    const dir = readJson<Record<string, unknown>>('stooorna_vip_public_dir', {});
    delete dir[userId];
    writeJson('stooorna_vip_public_dir', dir);
  } catch { /* ignore */ }
  emitVip({ userId, active: false });
  void postVip({ userId, action: 'deactivate' });
}

export function formatVipCountdown(expiresAt?: number | null): { days: number; hours: number; minutes: number; seconds: number; date: string } {
  const end = Number(expiresAt || 0);
  const left = Math.max(0, end - Date.now());
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const minutes = Math.floor((left % 3600000) / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  const date = end ? new Date(end).toLocaleString() : '';
  return { days, hours, minutes, seconds, date };
}


export function getVipColor(userId?: string | null): VipColor {
  if (!userId) return 'gold';
  const map = readJson<Record<string, VipColor>>(COLOR_KEY, {});
  const c = map[userId];
  return c && VIP_COLORS[c] ? c : 'gold';
}

export function vipUsernameColor(userId?: string | null): string {
  return isVip(userId) ? VIP_COLORS[getVipColor(userId)] : '';
}

export function getVipFeats(userId?: string | null): VipFeats {
  if (!userId) return { eightMics: false, roomMusic: false };
  const map = readJson<Record<string, Partial<VipFeats>>>(FEAT_KEY, {});
  const f = map[userId] || {};
  return { eightMics: !!f.eightMics, roomMusic: !!f.roomMusic };
}

export function getVipPublicState(userId?: string | null): VipPublicState | null {
  if (!userId || !isVip(userId)) return null;
  const color = getVipColor(userId);
  return {
    userId,
    active: true,
    color,
    feats: getVipFeats(userId),
    usernameColor: VIP_COLORS[color],
  };
}

export function getVipMaxSpeakers(hostId?: string | null): number {
  return isVip(hostId) ? 8 : 4;
}

async function postVip(body: Record<string, unknown>) {
  try {
    await fetch('/api/vip', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* server optional; local cache remains source of truth until sync */
  }
}

export async function hydrateVipFromServer(userId: string) {
  if (!userId) return;
  const requestStartedAt = Date.now();
  try {
    const r = await fetch(`/api/vip?userId=${encodeURIComponent(userId)}`, { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    // If the user changed something locally (color, feature, activate/deactivate)
    // after this request was sent, this response reflects the old server state.
    // Applying it now would silently revert the user's newer local change.
    if (getLocalEditTs(userId) > requestStartedAt) return;
    if (d?.active) {
      const all = readAllPlans();
      all[userId] = { userId, active: true, since: Number(d.since) || Date.now(), expiresAt: Number(d.expiresAt) || (Date.now() + VIP_PERIOD_MS) };
      if (all[userId].expiresAt && Date.now() > all[userId].expiresAt!) {
        all[userId].active = false;
      }
      writeJson(PLAN_KEY, all);
    }
    if (d?.color && VIP_COLORS[d.color as VipColor]) {
      const map = readJson<Record<string, VipColor>>(COLOR_KEY, {});
      map[userId] = d.color;
      writeJson(COLOR_KEY, map);
    }
    if (d?.feats) {
      const map = readJson<Record<string, VipFeats>>(FEAT_KEY, {});
      map[userId] = {
        eightMics: !!d.feats.eightMics,
        roomMusic: !!d.feats.roomMusic,
      };
      writeJson(FEAT_KEY, map);
    }
    if (d?.renameUsed) {
      const map = readJson<Record<string, boolean>>(RENAME_KEY, {});
      map[userId] = true;
      writeJson(RENAME_KEY, map);
    }
    emitVip({ userId, hydrated: true });
  } catch {
    /* ignore */
  }
}

export function setVipColor(userId: string, color: VipColor) {
  if (!VIP_COLORS[color]) return;
  markLocalEdit(userId);
  const map = readJson<Record<string, VipColor>>(COLOR_KEY, {});
  map[userId] = color;
  writeJson(COLOR_KEY, map);
  publishVipPublic(userId);
  emitVip({ userId, color });
  void postVip({ userId, action: 'color', color });
}

const PUBLIC_DIR_KEY = 'stooorna_vip_public_dir';

export function publishVipPublic(userId: string) {
  if (!userId) return;
  try {
    const dir = readJson<Record<string, VipPublicState>>(PUBLIC_DIR_KEY, {});
    const state = getVipPublicState(userId);
    if (state) dir[userId] = state;
    else delete dir[userId];
    writeJson(PUBLIC_DIR_KEY, dir);
    window.dispatchEvent(new CustomEvent('stooorna:vip-directory', { detail: dir }));
  } catch { /* ignore */ }
}

export function isPublicVipAccount(userId?: string | null): boolean {
  if (!userId) return false;
  if (isVip(userId)) return true;
  try {
    const dir = readJson<Record<string, VipPublicState>>(PUBLIC_DIR_KEY, {});
    return !!dir[userId]?.active;
  } catch {
    return false;
  }
}

export function activateVip(userId: string) {
  markLocalEdit(userId);
  const all = readAllPlans();
  const now = Date.now();
  all[userId] = { userId, active: true, since: now, expiresAt: now + VIP_PERIOD_MS };
  writeJson(PLAN_KEY, all);
  publishVipPublic(userId);
  emitVip({ userId, active: true, expiresAt: now + VIP_PERIOD_MS });
  void postVip({ userId, action: 'activate', expiresAt: now + VIP_PERIOD_MS });
}


export function vipRenameUsed(userId: string): boolean {
  const map = readJson<Record<string, boolean>>(RENAME_KEY, {});
  return !!map[userId];
}

export function markVipRenameUsed(userId: string) {
  markLocalEdit(userId);
  const map = readJson<Record<string, boolean>>(RENAME_KEY, {});
  map[userId] = true;
  writeJson(RENAME_KEY, map);
  void postVip({ userId, action: 'rename-used' });
}

export function setVipFeat(userId: string, key: keyof VipFeats, on: boolean) {
  markLocalEdit(userId);
  const next = { ...getVipFeats(userId), [key]: on };
  const map = readJson<Record<string, VipFeats>>(FEAT_KEY, {});
  map[userId] = next;
  writeJson(FEAT_KEY, map);
  publishVipPublic(userId);
  emitVip({ userId, feats: next });
  void postVip({ userId, action: 'feat', key, on });
}

export function readVipFavs(userId: string): Array<{ id: string; title: string; url: string }> {
  const map = readJson<Record<string, Array<{ id: string; title: string; url: string }>>>(VIP_FAVS_KEY, {});
  return Array.isArray(map[userId]) ? map[userId] : [];
}

export function saveVipFav(userId: string, track: { id: string; title: string; url: string }) {
  const list = readVipFavs(userId).filter((t) => t.id !== track.id);
  list.unshift(track);
  const map = readJson<Record<string, unknown>>(VIP_FAVS_KEY, {});
  map[userId] = list.slice(0, 40);
  writeJson(VIP_FAVS_KEY, map);
}

/** Username CSS color for feed / live / profile. Empty string = default theme color. */
export function resolveVipNameStyle(userId?: string | null): { color?: string; fontWeight?: number } {
  const c = vipUsernameColor(userId);
  if (!c) return {};
  return { color: c, fontWeight: 800 };
}


export async function hydrateVipDirectory() {
  const requestStartedAt = Date.now();
  try {
    const r = await fetch('/api/vip/directory', { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    const list = (d.users || d.items || []) as Array<{ userId: string; active?: boolean; color?: VipColor; expiresAt?: number }>;
    const prevDir = readJson<Record<string, { active: boolean; color?: VipColor; expiresAt?: number }>>(PUBLIC_DIR_KEY, {});
    const dir: Record<string, { active: boolean; color?: VipColor; expiresAt?: number }> = {};
    for (const row of list) {
      if (!row?.userId) continue;
      dir[row.userId] = { active: row.active !== false, color: row.color, expiresAt: row.expiresAt };
    }
    // Keep whatever was published locally for any account edited on this
    // device after this directory request started — this response predates
    // that edit, so it must not erase it (this is what made a freshly
    // activated/colored VIP or Business account disappear from its own
    // "public" state right after saving).
    for (const uid of Object.keys(prevDir)) {
      if (getLocalEditTs(uid) > requestStartedAt) {
        dir[uid] = prevDir[uid];
      }
    }
    writeJson(PUBLIC_DIR_KEY, dir);
    window.dispatchEvent(new CustomEvent('stooorna:vip-directory', { detail: dir }));
  } catch { /* ignore */ }
}
