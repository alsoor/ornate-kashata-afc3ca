/**
 * Stooorna Ai — Credits (v1.0.0)
 * Place at: src/ai/aiCredits.ts
 *
 * - Every user gets 30 P automatically the first time (welcome credit).
 * - Every published photo / video costs 5 P (taken automatically).
 * - Subscription: $10 = 500 P (= 100 posts).
 *
 * The SERVER is the source of truth (GET/POST /api/ai-credits, see server/ai-credits-routes.ts).
 * If the server routes are not deployed yet, a per-user local ledger is used so the feature still works.
 * Payment is NOT connected yet: startPayment() does nothing until window.__STOOORNA_GOOGLE_PAY__ exists.
 */

export const AI_POST_COST = 5;
export const AI_WELCOME_CREDITS = 30;
export const AI_PLAN = { price: '$10', points: 500, posts: 100, perDay: 3 } as const;

export interface CreditUser { id?: string | null }
export interface CreditsState { balance: number; source: 'server' | 'local' }

const EVT = 'stooorna:ai-credits';
const localKey = (uid: string) => `stooorna_ai_credits_v1_${uid}`;

function readLocal(uid: string): number {
  try {
    const raw = localStorage.getItem(localKey(uid));
    if (raw === null) { localStorage.setItem(localKey(uid), String(AI_WELCOME_CREDITS)); return AI_WELCOME_CREDITS; }
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch { return AI_WELCOME_CREDITS; }
}
function writeLocal(uid: string, n: number) { try { localStorage.setItem(localKey(uid), String(Math.max(0, n))); } catch { /* */ } }
const announce = (balance: number) => { try { window.dispatchEvent(new CustomEvent(EVT, { detail: { balance } })); } catch { /* */ } };

/** Current balance. Creates the welcome 30 P on first use. */
export async function getCredits(user: CreditUser | null | undefined): Promise<CreditsState | null> {
  const uid = String(user?.id || '');
  if (!uid) return null;
  try {
    const r = await fetch('/api/ai-credits', { credentials: 'include', cache: 'no-store' });
    if (r.ok) {
      const d: any = await r.json();
      if (typeof d?.balance === 'number') { announce(d.balance); return { balance: d.balance, source: 'server' }; }
    }
  } catch { /* server routes not reachable -> local ledger */ }
  const b = readLocal(uid);
  announce(b);
  return { balance: b, source: 'local' };
}

/** Takes AI_POST_COST points. Returns the new balance, or null when there are not enough points. */
export async function spendCredits(user: CreditUser | null | undefined, ref = ''): Promise<number | null> {
  const uid = String(user?.id || '');
  if (!uid) return null;
  try {
    const r = await fetch('/api/ai-credits/spend', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    });
    if (r.status === 402) { const d: any = await r.json().catch(() => ({})); const b = Number(d?.balance) || 0; announce(b); return null; }
    if (r.ok) {
      const d: any = await r.json();
      if (typeof d?.balance === 'number') { announce(d.balance); return d.balance; }
    }
  } catch { /* local ledger */ }
  const cur = readLocal(uid);
  if (cur < AI_POST_COST) { announce(cur); return null; }
  const next = cur - AI_POST_COST;
  writeLocal(uid, next);
  announce(next);
  return next;
}

export const canAfford = (balance: number | null | undefined) => (balance ?? 0) >= AI_POST_COST;

/** Subscribe to balance changes (returns the unsubscribe function). */
export function onCreditsChange(cb: (balance: number) => void): () => void {
  const h = (e: Event) => cb(Number((e as CustomEvent).detail?.balance) || 0);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

/**
 * Pay button. Nothing opens until Google Pay is connected:
 * define  window.__STOOORNA_GOOGLE_PAY__ = async (plan) => boolean  later; it should return true after a VERIFIED payment
 * (the server must then add the points with grantCredits() in server/ai-credits-routes.ts).
 */
export async function startPayment(): Promise<boolean> {
  const fn = (window as any).__STOOORNA_GOOGLE_PAY__;
  if (typeof fn !== 'function') return false;
  try { return !!(await fn({ ...AI_PLAN })); } catch { return false; }
}
