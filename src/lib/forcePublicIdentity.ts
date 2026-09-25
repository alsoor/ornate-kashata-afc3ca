/**
 * Force public VIP + Business visibility across all viewers.
 * Call startForcePublicIdentity(userId) once from the main app shell.
 * English-only.
 */

import {
  getVipColor,
  hydrateVipDirectory,
  isVip,
  publishVipPublic,
  type VipColor,
} from '@/lib/vipPatch';
import {
  hydrateBusinessDirectory,
  publishBusinessPublic,
  pushAllLocalBusinessToServer,
} from '@/lib/publicVisibility';

const PLAN_KEY = 'stooorna_vip_plan';

function readPlans(): Record<string, { active?: boolean; expiresAt?: number }> {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Re-upload this browser's VIP state to the server so other viewers can hydrate. */
export async function forceReseedVipToServer(userId?: string | null) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  if (!isVip(uid)) {
    const plans = readPlans();
    if (!plans[uid]?.active) return;
  }
  const color: VipColor = getVipColor(uid);
  const exp = readPlans()[uid]?.expiresAt;
  try {
    await fetch('/api/vip', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid,
        action: 'activate',
        expiresAt: exp || Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
    });
  } catch {
    /* ignore */
  }
  try {
    await fetch('/api/vip', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, action: 'color', color }),
    });
  } catch {
    /* ignore */
  }
  publishVipPublic(uid);
}

/** Pull server directories into localStorage and notify every badge component. */
export async function forceHydratePublicDirectories() {
  await Promise.all([
    hydrateVipDirectory().catch(() => {}),
    hydrateBusinessDirectory().catch(() => {}),
  ]);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:vip'));
    window.dispatchEvent(new CustomEvent('stooorna:vip-directory'));
    window.dispatchEvent(new CustomEvent('stooorna:business-directory'));
  } catch {
    /* ignore */
  }
}

let started = false;

/**
 * Start aggressive public badge sync:
 * - reseed self VIP + all local approved Business to server
 * - hydrate directories for every viewer every few seconds
 */
export function startForcePublicIdentity(userId?: string | null) {
  if (typeof window === 'undefined') return;
  if (started) return;
  started = true;

  const tick = () => {
    void forceReseedVipToServer(userId);
    void pushAllLocalBusinessToServer();
    void forceHydratePublicDirectories();
  };

  tick();
  window.setInterval(tick, 8000);

  window.addEventListener('stooorna:vip', () => {
    void forceReseedVipToServer(userId);
  });
  window.addEventListener('stooorna:business-registry', () => {
    void pushAllLocalBusinessToServer();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}
