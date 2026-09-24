const DELETED_KEY = 'stooorna_deleted_users';
const IP_BAN_KEY = 'stooorna_banned_ips';
const DEVICE_BAN_KEY = 'stooorna_banned_devices';
const EMAIL_BAN_KEY = 'stooorna_banned_emails';
const FREED_KEY = 'stooorna_freed_usernames';
const RESTORED_KEY = 'stooorna_restored_users';

export type RecoverRow = {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
  lastIp?: string | null;
};

function readList(key: string): any[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: any[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function normUser(v?: string | null) {
  return String(v || '').replace(/^@/, '').trim().toLowerCase();
}

function origName(row: RecoverRow) {
  const a = normUser(row.originalUsername);
  if (a && !a.startsWith('deleted_')) return a;
  const b = normUser(row.username);
  if (b && !b.startsWith('deleted_')) return b;
  return '';
}

function sameRow(a: RecoverRow, b: RecoverRow) {
  const ida = String(a.id || '');
  const idb = String(b.id || '');
  if (ida && idb && ida === idb) return true;
  const ea = String(a.email || '').toLowerCase();
  const eb = String(b.email || '').toLowerCase();
  if (ea && eb && ea === eb) return true;
  const ua = normUser(a.username);
  const ub = normUser(b.username);
  if (ua && ub && ua === ub) return true;
  return false;
}

export function loadDeletedUsersLocal(): RecoverRow[] {
  return readList(DELETED_KEY);
}

export function saveDeletedUsersLocal(list: RecoverRow[]) {
  writeList(DELETED_KEY, list);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: list }));
  } catch {
    /* ignore */
  }
}

function pullFromDeleted(row: RecoverRow) {
  const next = loadDeletedUsersLocal().filter(x => !sameRow(x, row));
  saveDeletedUsersLocal(next);
  return next;
}

function freeUsername(name: string) {
  const u = normUser(name);
  if (!u) return;
  const list = readList(FREED_KEY).map(x => normUser(typeof x === 'string' ? x : x?.username));
  if (!list.includes(u)) list.push(u);
  writeList(FREED_KEY, list);
}

function unfreeUsername(name: string) {
  const u = normUser(name);
  writeList(FREED_KEY, readList(FREED_KEY).filter(x => normUser(typeof x === 'string' ? x : x?.username) !== u));
}

function clearBans(row: RecoverRow) {
  const email = String(row.email || '').toLowerCase();
  const ip = String(row.lastIp || '').trim();
  writeList(EMAIL_BAN_KEY, readList(EMAIL_BAN_KEY).filter(x => String(x).toLowerCase() !== email));
  if (ip) writeList(IP_BAN_KEY, readList(IP_BAN_KEY).filter(x => String(x) !== ip));
  writeList(
    DEVICE_BAN_KEY,
    readList(DEVICE_BAN_KEY).filter((x: any) => {
      if (email && String(x.email || '').toLowerCase() === email) return false;
      if (row.id && String(x.userId || x.id || '') === String(row.id)) return false;
      if (ip && String(x.ip || '') === ip) return false;
      return true;
    }),
  );
}

async function hit(url: string, init: RequestInit) {
  try {
    const r = await fetch(url, { credentials: 'include', ...init });
    return r.ok || r.status === 404 || r.status === 204;
  } catch {
    return false;
  }
}

export async function restoreOwnerAccount(row: RecoverRow): Promise<{ ok: boolean }> {
  const username = origName(row);
  const id = String(row.id || '');
  const payload = {
    id,
    userId: id,
    email: row.email,
    username: username || undefined,
    originalUsername: username || undefined,
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

  clearBans(row);
  if (username) unfreeUsername(username);
  const next = pullFromDeleted(row);
  writeList(RESTORED_KEY, [...readList(RESTORED_KEY).filter(x => !sameRow(x, row)), { ...row, username, at: Date.now() }]);

  const json = { 'Content-Type': 'application/json' };
  const body = JSON.stringify(payload);
  await Promise.all([
    hit('/api/owner/users/unban', { method: 'POST', headers: json, body }),
    hit('/api/owner/users/unban-ip', { method: 'POST', headers: json, body }),
    id ? hit(`/api/owner/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body }) : Promise.resolve(false),
    id ? hit(`/api/support/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body }) : Promise.resolve(false),
    id ? hit(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body }) : Promise.resolve(false),
  ]);

  try {
    window.dispatchEvent(new CustomEvent('stooorna:user-restored', { detail: { ...payload, list: next } }));
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: next }));
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export async function wipeOwnerAccount(row: RecoverRow): Promise<{ ok: boolean }> {
  const username = origName(row) || normUser(row.username);
  const id = String(row.id || '');
  const payload = {
    id,
    userId: id,
    email: row.email,
    username,
    lastIp: row.lastIp || undefined,
    permanent: true,
    wipe: true,
  };

  clearBans(row);
  if (username) freeUsername(username);
  if (row.username) freeUsername(String(row.username));
  const next = pullFromDeleted(row);

  const json = { 'Content-Type': 'application/json' };
  const body = JSON.stringify(payload);
  await Promise.all([
    hit('/api/owner/users/wipe', { method: 'POST', headers: json, body }),
    hit('/api/owner/users/unban', { method: 'POST', headers: json, body }),
    hit('/api/owner/users/unban-ip', { method: 'POST', headers: json, body }),
    id ? hit(`/api/owner/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({
        deleted: true,
        isDeleted: true,
        wipe: true,
        isBanned: false,
        banned: false,
        username: username ? `wiped_${username}_${Date.now()}` : `wiped_${Date.now()}`,
      }),
    }) : Promise.resolve(false),
    id ? hit(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }) : Promise.resolve(false),
  ]);

  try {
    window.dispatchEvent(new CustomEvent('stooorna:user-wiped', { detail: { ...payload, list: next } }));
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: next }));
  } catch {
    /* ignore */
  }
  return { ok: true };
}
