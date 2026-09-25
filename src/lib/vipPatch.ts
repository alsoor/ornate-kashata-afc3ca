/**
 * VIP plan — local cache + server sync (file-backed API).
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
const PUBLIC_DIR_KEY = 'stooorna_vip_public_dir';
export const VIP_FAVS_KEY = 'stooorna_vip_music_favs';

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
  expiresAt?: number;
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
    const dir = readJson<Record<string, { active?: boolean; expiresAt?: number }>>(PUBLIC_DIR_KEY, {});
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
  if (p?.expiresAt) return p.expiresAt;
  try {
    const dir = readJson<Record<string, { expiresAt?: number }>>(PUBLIC_DIR_KEY, {});
    return dir[userId]?.expiresAt || null;
  } catch {
    return null;
  }
}

export function deactivateVip(userId: string) {
  const all = readAllPlans();
  if (all[userId]) {
    all[userId] = { ...all[userId], active: false };
    writeJson(PLAN_KEY, all);
  }
  try {
    const dir = readJson<Record<string, unknown>>(PUBLIC_DIR_KEY, {});
    delete dir[userId];
    writeJson(PUBLIC_DIR_KEY, dir);
  } catch {
    /* ignore */
  }
  emitVip({ userId, active: false });
  void postVip({ userId, action: 'deactivate' });
}

export function formatVipCountdown(expiresAt?: number | null): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  date: string;
} {
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
  if (c && VIP_COLORS[c]) return c;
  try {
    const dir = readJson<Record<string, { color?: VipColor }>>(PUBLIC_DIR_KEY, {});
    const dc = dir[userId]?.color;
    if (dc && VIP_COLORS[dc]) return dc;
  } catch {
    /* ignore */
  }
  return 'gold';
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
    expiresAt: getVipExpiry(userId) || undefined,
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
    /* server optional; local cache remains */
  }
}

export async function hydrateVipFromServer(userId: string) {
  if (!userId) return;
  try {
    const r = await fetch(`/api/vip?userId=${encodeURIComponent(userId)}`, { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    if (d?.active) {
      const all = readAllPlans();
      all[userId] = {
        userId,
        active: true,
        since: Number(d.since) || Date.now(),
        expiresAt: Number(d.expiresAt) || Date.now() + VIP_PERIOD_MS,
      };
      if (all[userId].expiresAt && Date.now() > all[userId].expiresAt!) {
        all[userId].active = false;
      }
      writeJson(PLAN_KEY, all);
    }
    if (d?.color && VIP_COLORS[d.color as VipColor]) {
      const map = readJson<Record<string, VipColor>>(COLOR_KEY, {});
      map[userId] = d.color as VipColor;
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
    publishVipPublic(userId);
    emitVip({ userId, hydrated: true });
  } catch {
    /* ignore */
  }
}

export function setVipColor(userId: string, color: VipColor) {
  if (!VIP_COLORS[color]) return;
  const map = readJson<Record<string, VipColor>>(COLOR_KEY, {});
  map[userId] = color;
  writeJson(COLOR_KEY, map);
  try {
    const dir = readJson<Record<string, VipPublicState>>(PUBLIC_DIR_KEY, {});
    const prev = dir[userId];
    dir[userId] = {
      userId,
      active: true,
      color,
      feats: prev?.feats || getVipFeats(userId),
      usernameColor: VIP_COLORS[color],
      expiresAt: prev?.expiresAt || getVipExpiry(userId) || undefined,
    };
    writeJson(PUBLIC_DIR_KEY, dir);
    window.dispatchEvent(new CustomEvent('stooorna:vip-directory', { detail: dir }));
  } catch {
    /* ignore */
  }
  publishVipPublic(userId);
  emitVip({ userId, color });
  void postVip({ userId, action: 'color', color });
}

export function publishVipPublic(userId: string) {
  if (!userId) return;
  try {
    const dir = readJson<Record<string, VipPublicState>>(PUBLIC_DIR_KEY, {});
    const state = getVipPublicState(userId);
    if (state) dir[userId] = state;
    else delete dir[userId];
    writeJson(PUBLIC_DIR_KEY, dir);
    window.dispatchEvent(new CustomEvent('stooorna:vip-directory', { detail: dir }));
  } catch {
    /* ignore */
  }
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
  const map = readJson<Record<string, boolean>>(RENAME_KEY, {});
  map[userId] = true;
  writeJson(RENAME_KEY, map);
  void postVip({ userId, action: 'rename-used' });
}

export function setVipFeat(userId: string, key: keyof VipFeats, on: boolean) {
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
  try {
    const r = await fetch('/api/vip/directory', { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    const list = (d.users || d.items || []) as Array<{
      userId: string;
      active?: boolean;
      color?: VipColor;
      expiresAt?: number;
      feats?: Partial<VipFeats>;
    }>;
    const prevDir = readJson<Record<string, VipPublicState>>(PUBLIC_DIR_KEY, {});
    const dir: Record<string, VipPublicState> = { ...prevDir };
    const colorMap = readJson<Record<string, VipColor>>(COLOR_KEY, {});
    const featMap = readJson<Record<string, Partial<VipFeats>>>(FEAT_KEY, {});
    const seen = new Set<string>();
    for (const row of list) {
      if (!row?.userId) continue;
      seen.add(row.userId);
      const color =
        (row.color && VIP_COLORS[row.color] ? row.color : null) ||
        colorMap[row.userId] ||
        prevDir[row.userId]?.color ||
        'gold';
      if (VIP_COLORS[color]) colorMap[row.userId] = color;
      if (row.feats) {
        featMap[row.userId] = {
          eightMics: !!row.feats.eightMics,
          roomMusic: !!row.feats.roomMusic,
        };
      }
      dir[row.userId] = {
        userId: row.userId,
        active: row.active !== false,
        color,
        feats: {
          eightMics: !!(row.feats?.eightMics ?? featMap[row.userId]?.eightMics),
          roomMusic: !!(row.feats?.roomMusic ?? featMap[row.userId]?.roomMusic),
        },
        usernameColor: VIP_COLORS[color],
        expiresAt: row.expiresAt,
      };
    }
    // Drop expired / inactive that server no longer lists only if we had them from server before
    writeJson(COLOR_KEY, colorMap);
    writeJson(FEAT_KEY, featMap);
    writeJson(PUBLIC_DIR_KEY, dir);
    window.dispatchEvent(new CustomEvent('stooorna:vip-directory', { detail: dir }));
  } catch {
    /* ignore */
  }
}
