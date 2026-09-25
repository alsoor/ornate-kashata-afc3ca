/**
 * Public Business + VIP badge sync for every viewer.
 * English-only identifiers and comments.
 */

export type PublicBusinessAccount = {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
};

const BIZ_DIR_KEY = 'stooorna_business_directory';

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
  const list = readJson<PublicBusinessAccount[]>(BIZ_DIR_KEY, []);
  return Array.isArray(list) ? list : [];
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
  return dir.some(
    (x) =>
      (id && x.userId === id) ||
      (un && String(x.username || '').replace(/^@/, '').trim().toLowerCase() === un) ||
      (em && String(x.email || '').trim().toLowerCase() === em),
  );
}

export async function publishBusinessPublic(row: {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
  remove?: boolean;
}) {
  if (!row?.userId) return;
  try {
    const list = loadBusinessPublicDirectory().filter((x) => x.userId !== row.userId);
    if (!row.remove) {
      list.unshift({
        userId: String(row.userId),
        username: row.username ? String(row.username).replace(/^@/, '').trim().toLowerCase() : null,
        email: row.email ? String(row.email).trim().toLowerCase() : null,
        projectName: row.projectName || null,
      });
    }
    writeJson(BIZ_DIR_KEY, list);
    window.dispatchEvent(new CustomEvent('stooorna:business-directory', { detail: list }));
  } catch {
    /* ignore */
  }
  try {
    await fetch('/api/business/directory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        row.remove
          ? { action: 'remove', userId: row.userId }
          : {
              action: 'upsert',
              userId: row.userId,
              username: row.username ?? null,
              email: row.email ?? null,
              projectName: row.projectName ?? null,
            },
      ),
    });
  } catch {
    /* server optional */
  }
}

export async function hydrateBusinessDirectory() {
  try {
    const r = await fetch('/api/business/directory', { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    const list = (d.users || d.items || []) as PublicBusinessAccount[];
    if (!Array.isArray(list)) return;
    writeJson(BIZ_DIR_KEY, list);
    window.dispatchEvent(new CustomEvent('stooorna:business-directory', { detail: list }));
  } catch {
    /* ignore */
  }
}

let syncStarted = false;

/** Poll VIP + Business public directories so every viewer sees badges. */
export function startPublicBadgeSync(_userId?: string | null) {
  if (typeof window === 'undefined') return;
  if (syncStarted) return;
  syncStarted = true;
  const tick = () => {
    void hydrateBusinessDirectory();
    try {
      import('@/lib/vipPatch')
        .then((m) => {
          if (typeof m.hydrateVipDirectory === 'function') void m.hydrateVipDirectory();
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  };
  tick();
  window.setInterval(tick, 12000);
  window.addEventListener('stooorna:business-registry', () => {
    void hydrateBusinessDirectory();
  });
  window.addEventListener('stooorna:vip', () => {
    try {
      import('@/lib/vipPatch')
        .then((m) => {
          if (typeof m.hydrateVipDirectory === 'function') void m.hydrateVipDirectory();
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  });
}