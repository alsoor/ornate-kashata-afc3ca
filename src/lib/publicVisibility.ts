/**
 * Shared live visibility for VIP + Business badges.
 * Call startPublicBadgeSync() once from the feed / app shell.
 */
import { hydrateVipDirectory, hydrateVipFromServer, publishVipPublic } from './vipPatch';

const BUSINESS_DIR_KEY = 'stooorna_business_directory';
const BUSINESS_REG_KEY = 'stooorna_business_registry';

export type PublicBusinessAccount = {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
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
    /* ignore */
  }
}

export function loadBusinessPublicDirectory(): PublicBusinessAccount[] {
  const list = readJson<PublicBusinessAccount[]>(BUSINESS_DIR_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveBusinessPublicDirectory(list: PublicBusinessAccount[]) {
  writeJson(BUSINESS_DIR_KEY, list);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:business-directory', { detail: list }));
  } catch {
    /* ignore */
  }
}

export function upsertLocalBusinessPublic(row: PublicBusinessAccount) {
  if (!row?.userId) return;
  const next = loadBusinessPublicDirectory().filter((x) => String(x.userId) !== String(row.userId));
  next.unshift(row);
  saveBusinessPublicDirectory(next);
}

export function isPublicBusinessAccount(u?: {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
  email?: string | null;
} | null): boolean {
  if (!u) return false;
  const id = String(u.id || u.userId || '').trim();
  const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const em = String(u.email || '').trim().toLowerCase();
  const dir = loadBusinessPublicDirectory();
  if (dir.some((x) =>
    (id && String(x.userId) === id) ||
    (un && String(x.username || '').replace(/^@/, '').trim().toLowerCase() === un) ||
    (em && String(x.email || '').trim().toLowerCase() === em)
  )) return true;
  try {
    const reg = readJson<Array<{ userId?: string; username?: string; email?: string; status?: string }>>(BUSINESS_REG_KEY, []);
    return Array.isArray(reg) && reg.some((x) =>
      x.status === 'approved' && (
        (id && String(x.userId) === id) ||
        (un && String(x.username || '').replace(/^@/, '').trim().toLowerCase() === un) ||
        (em && String(x.email || '').trim().toLowerCase() === em)
      )
    );
  } catch {
    return false;
  }
}

export async function hydrateBusinessDirectory() {
  try {
    const r = await fetch('/api/business/directory', { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      const list = (d.users || d.items || []) as PublicBusinessAccount[];
      if (Array.isArray(list) && list.length) {
        const byId = new Map<string, PublicBusinessAccount>();
        for (const row of [...loadBusinessPublicDirectory(), ...list]) {
          if (!row?.userId) continue;
          byId.set(String(row.userId), row);
        }
        saveBusinessPublicDirectory([...byId.values()]);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const reg = readJson<Array<{
      userId?: string;
      username?: string;
      email?: string;
      projectName?: string;
      status?: string;
    }>>(BUSINESS_REG_KEY, []);
    const approved = (Array.isArray(reg) ? reg : [])
      .filter((x) => x.status === 'approved' && x.userId)
      .map((x) => ({
        userId: String(x.userId),
        username: x.username || null,
        email: x.email || null,
        projectName: x.projectName || null,
      }));
    if (approved.length) {
      const byId = new Map<string, PublicBusinessAccount>();
      for (const row of [...loadBusinessPublicDirectory(), ...approved]) {
        byId.set(String(row.userId), row);
      }
      saveBusinessPublicDirectory([...byId.values()]);
      for (const row of approved) {
        void fetch('/api/business/directory', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upsert', ...row }),
        }).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
}

export async function publishBusinessPublic(row: PublicBusinessAccount) {
  upsertLocalBusinessPublic(row);
  try {
    await fetch('/api/business/directory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', ...row }),
    });
  } catch {
    /* ignore */
  }
}

let started = false;

export function startPublicBadgeSync(currentUserId?: string | null) {
  if (typeof window === 'undefined') return;
  if (started) {
    void hydrateVipDirectory();
    void hydrateBusinessDirectory();
    return;
  }
  started = true;
  if (currentUserId) {
    void hydrateVipFromServer(currentUserId);
    publishVipPublic(currentUserId);
  }
  void hydrateVipDirectory();
  void hydrateBusinessDirectory();
  window.setInterval(() => {
    void hydrateVipDirectory();
    void hydrateBusinessDirectory();
  }, 12000);
  window.addEventListener('stooorna:vip', () => {
    if (currentUserId) publishVipPublic(currentUserId);
  });
  window.addEventListener('stooorna:business-registry', () => {
    void hydrateBusinessDirectory();
  });
}
