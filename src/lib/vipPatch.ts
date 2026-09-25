export type VipColor = 'blue' | 'gold' | 'red' | 'green' | 'gray';

export const VIP_COLORS: Record<VipColor, string> = {
  blue: '#2563eb',
  gold: '#eab308',
  red: '#ef4444',
  green: '#22c55e',
  gray: '#9ca3af',
};

const PLAN_KEY = 'stooorna_vip_plan';
const COLOR_KEY = 'stooorna_vip_color';
const RENAME_KEY = 'stooorna_vip_rename_used';

export type VipPlan = {
  userId: string;
  active: boolean;
  since: number;
};

function readAll(): Record<string, VipPlan> {
  try {
    return JSON.parse(localStorage.getItem(PLAN_KEY) || '{}');
  } catch {
    return {};
  }
}

export function isVip(userId?: string | null): boolean {
  if (!userId) return false;
  const p = readAll()[userId];
  return !!p?.active;
}

export function getVipColor(userId?: string | null): VipColor {
  if (!userId) return 'gold';
  try {
    const map = JSON.parse(localStorage.getItem(COLOR_KEY) || '{}');
    const c = map[userId] as VipColor | undefined;
    if (c && VIP_COLORS[c]) return c;
  } catch {
    /* ignore */
  }
  return 'gold';
}

export function vipUsernameColor(userId?: string | null): string {
  return isVip(userId) ? VIP_COLORS[getVipColor(userId)] : '';
}

export function setVipColor(userId: string, color: VipColor) {
  try {
    const map = JSON.parse(localStorage.getItem(COLOR_KEY) || '{}');
    map[userId] = color;
    localStorage.setItem(COLOR_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('stooorna:vip', { detail: { userId, color } }));
  } catch {
    /* ignore */
  }
}

export function activateVip(userId: string) {
  const all = readAll();
  all[userId] = { userId, active: true, since: Date.now() };
  localStorage.setItem(PLAN_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('stooorna:vip', { detail: { userId, active: true } }));
}

export function vipRenameUsed(userId: string): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(RENAME_KEY) || '{}');
    return !!map[userId];
  } catch {
    return false;
  }
}

export function markVipRenameUsed(userId: string) {
  try {
    const map = JSON.parse(localStorage.getItem(RENAME_KEY) || '{}');
    map[userId] = true;
    localStorage.setItem(RENAME_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getVipMaxSpeakers(hostId?: string | null): number {
  if (!isVip(hostId)) return 4;
  return getVipFeats(hostId).eightMics ? 8 : 4;
}

const FEAT_KEY = 'stooorna_vip_feats';

export type VipFeats = {
  eightMics: boolean;
  roomMusic: boolean;
};

export function getVipFeats(userId?: string | null): VipFeats {
  if (!userId) return { eightMics: false, roomMusic: false };
  try {
    const map = JSON.parse(localStorage.getItem(FEAT_KEY) || '{}');
    const f = map[userId] || {};
    return { eightMics: !!f.eightMics, roomMusic: !!f.roomMusic };
  } catch {
    return { eightMics: false, roomMusic: false };
  }
}

export function setVipFeat(userId: string, key: keyof VipFeats, on: boolean) {
  const cur = getVipFeats(userId);
  const next = { ...cur, [key]: on };
  try {
    const map = JSON.parse(localStorage.getItem(FEAT_KEY) || '{}');
    map[userId] = next;
    localStorage.setItem(FEAT_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('stooorna:vip', { detail: { userId, feats: next } }));
  } catch {
    /* ignore */
  }
}

export const VIP_FAVS_KEY = 'stooorna_vip_music_favs';

export function readVipFavs(userId: string): Array<{ id: string; title: string; url: string }> {
  try {
    const map = JSON.parse(localStorage.getItem(VIP_FAVS_KEY) || '{}');
    return Array.isArray(map[userId]) ? map[userId] : [];
  } catch {
    return [];
  }
}

export function saveVipFav(userId: string, track: { id: string; title: string; url: string }) {
  const list = readVipFavs(userId).filter(t => t.id !== track.id);
  list.unshift(track);
  try {
    const map = JSON.parse(localStorage.getItem(VIP_FAVS_KEY) || '{}');
    map[userId] = list.slice(0, 40);
    localStorage.setItem(VIP_FAVS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
