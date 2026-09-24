/**
 * Owner restore / unban / permanent wipe.
 * Clears account flags and device IP bans so the user can sign in again.
 */

const DELETED_KEY = 'stooorna_deleted_users';
const IP_BAN_KEY = 'stooorna_banned_ips';
const DEVICE_BAN_KEY = 'stooorna_banned_devices';
const EMAIL_BAN_KEY = 'stooorna_banned_emails';

export type RecoverRow = {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
  lastIp?: string | null;
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadDeletedUsersLocal(): RecoverRow[] {
  const list = loadJson<any[]>(DELETED_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveDeletedUsersLocal(list: RecoverRow[]) {
  saveJson(DELETED_KEY, list);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: list }));
  } catch {
    /* ignore */
  }
}

function sameUser(a: RecoverRow, b: RecoverRow) {
  const ida = String(a.id || '');
  const idb = String(b.id || '');
  const ema = String(a.email || '').toLowerCase();
  const emb = String(b.email || '').toLowerCase();
  const una = String(a.username || '').replace(/^@/, '').toLowerCase();
  const unb = String(b.username || '').replace(/^@/, '').toLowerCase();
  if (ida && idb && ida === idb) return true;
  if (ema && emb && ema === emb) return true;
  if (una && unb && una === unb) return true;
  return false;
}

export function removeFromDeletedList(row: RecoverRow) {
  const next = loadDeletedUsersLocal().filter(x => !sameUser(x, row));
  saveDeletedUsersLocal(next);
  return next;
}

export function clearLocalBans(row: RecoverRow) {
  const email = String(row.email || '').toLowerCase();
  const ip = String(row.lastIp || '').trim();
  const emails = loadJson<string[]>(EMAIL_BAN_KEY, []).filter(x => String(x).toLowerCase() !== email);
  saveJson(EMAIL_BAN_KEY, emails);
  if (ip) {
    const ips = loadJson<string[]>(IP_BAN_KEY, []).filter(x => x !== ip);
    saveJson(IP_BAN_KEY, ips);
  }
  const devices = loadJson<any[]>(DEVICE_BAN_KEY, []).filter((x: any) => {
    if (email && String(x.email || '').toLowerCase() === email) return false;
    if (row.id && String(x.userId || x.id || '') === String(row.id)) return false;
    if (ip && String(x.ip || '') === ip) return false;
    return true;
  });
  saveJson(DEVICE_BAN_KEY, devices);
}

function originalName(row: RecoverRow) {
  const orig = String(row.originalUsername || '').replace(/^@/, '').trim();
  if (orig && !orig.startsWith('deleted_')) return orig;
  const u = String(row.username || '').replace(/^@/, '').trim();
  if (u && !u.startsWith('deleted_')) return u;
  return '';
}

async function tryFetch(url: string, init: RequestInit) {
  try {
    const r = await fetch(url, { credentials: 'include', ...init });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

export async function restoreOwnerAccount(row: RecoverRow): Promise<{ ok: boolean }> {
  const orig = originalName(row);
  const payload = {
    id: row.id,
    userId: row.id,
    email: row.email,
    username: orig || undefined,
    originalUsername: orig || undefined,
    isBanned: false,
    banned: false,
    active: true,
    status: 'active',
    deleted: false,
    isDeleted: false,
    lastIp: row.lastIp || undefined,
    unbanIp: true,
    unbanDevice: true,
  };

  clearLocalBans(row);
  removeFromDeletedList(row);

  const json = { 'Content-Type': 'application/json' };
  const body = JSON.stringify(payload);
  const id = String(row.id || '');

  const calls: Array<() => Promise<boolean>> = [
    () => tryFetch('/api/owner/users/unban', { method: 'POST', headers: json, body }),
    () => tryFetch('/api/owner/users/unban-ip', { method: 'POST', headers: json, body }),
    () => tryFetch('/api/me/ban-status', { method: 'POST', headers: json, body: JSON.stringify({ ...payload, clear: true }) }),
  ];
  if (id) {
    calls.push(() => tryFetch(`/api/owner/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body }));
    calls.push(() => tryFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body }));
  }

  for (const run of calls) await run();
  try {
    window.dispatchEvent(new CustomEvent('stooorna:user-restored', { detail: payload }));
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export async function wipeOwnerAccount(row: RecoverRow): Promise<{ ok: boolean }> {
  const orig = originalName(row);
  const payload = {
    id: row.id,
    userId: row.id,
    email: row.email,
    username: orig || row.username,
    lastIp: row.lastIp || undefined,
    permanent: true,
  };
  clearLocalBans(row);
  removeFromDeletedList(row);

  const json = { 'Content-Type': 'application/json' };
  const body = JSON.stringify(payload);
  const id = String(row.id || '');
  await tryFetch('/api/owner/users/wipe', { method: 'POST', headers: json, body });
  if (id) {
    await tryFetch(`/api/owner/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ deleted: true, isDeleted: true, wipe: true, username: `wiped_${Date.now()}` }),
    });
    await tryFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:user-wiped', { detail: payload }));
  } catch {
    /* ignore */
  }
  return { ok: true };
}
