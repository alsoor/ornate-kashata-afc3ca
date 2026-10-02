/**
 * giftProfitSplit — 50/50 split of live gift support coins.
 *
 * When a gift is sent in account voice/camera live:
 *   - 50% → recipient's earnings (Wallet Balance / support received)
 *   - 50% → app Profits (owner @Stooorna settings → Profits)
 *
 * applyGiftProfitSplitOnce: full split with localStorage dedupe so it never runs twice
 * for the same gift event (avoids 100% to recipient).
 */

export const OWNER_USERNAME = 'stooorna';
export const OWNER_EMAIL = 'stooorna@mail.com';

const APP_PROFITS_KEY = 'stooorna_app_profits';
const APP_PROFITS_COINS_KEY = 'stooorna_app_profits_coins';
const SPLIT_DONE_PREFIX = 'stooorna_gift_split_done_';
/** 1 Coin = USD 0.01 (same rate as LiveCoinsDock) */
export const PROFIT_CENTS_PER_COIN = 1;

export type AppProfitsSnapshot = {
  coins: number;
  usd: number;
};

function readNum(key: string): number {
  try {
    const n = Number(localStorage.getItem(key) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeNum(key: string, n: number) {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}

const earningsKey = (uid: string) => `stooorna_coins_earnings_${uid || 'guest'}`;
const balanceKey = (uid: string) => `stooorna_coins_balance_${uid || 'guest'}`;

export function readUserEarnings(uid: string): number {
  return readNum(earningsKey(uid));
}

export function writeUserEarnings(uid: string, n: number) {
  const v = Math.max(0, Math.floor(n));
  writeNum(earningsKey(uid), v);
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:coins-earnings', {
        detail: { userId: uid, earnings: v },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function readUserGiftBalance(uid: string): number {
  return readNum(balanceKey(uid));
}

export function writeUserGiftBalance(uid: string, n: number) {
  const v = Math.max(0, Math.floor(n));
  writeNum(balanceKey(uid), v);
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:coins-balance', {
        detail: { userId: uid, balance: v },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function readAppProfitsCoins(): number {
  return readNum(APP_PROFITS_COINS_KEY);
}

export function readAppProfitsUsd(): number {
  return (readAppProfitsCoins() * PROFIT_CENTS_PER_COIN) / 100;
}

export function getAppProfitsSnapshot(): AppProfitsSnapshot {
  const coins = readAppProfitsCoins();
  return { coins, usd: (coins * PROFIT_CENTS_PER_COIN) / 100 };
}

function writeAppProfitsCoins(n: number) {
  const v = Math.max(0, Math.floor(n));
  writeNum(APP_PROFITS_COINS_KEY, v);
  // also store cents for older readers
  writeNum(APP_PROFITS_KEY, v * PROFIT_CENTS_PER_COIN);
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:app-profits', {
        detail: { coins: v, usd: (v * PROFIT_CENTS_PER_COIN) / 100 },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function addAppProfitsCoins(coins: number) {
  if (!(coins > 0)) return;
  writeAppProfitsCoins(readAppProfitsCoins() + coins);
}

function halves(totalCoins: number): { toRecipient: number; toApp: number } {
  const total = Math.max(0, Math.floor(Number(totalCoins) || 0));
  const toApp = Math.floor(total / 2);
  const toRecipient = total - toApp;
  return { toRecipient, toApp };
}

/**
 * Full 50/50 once per dedupeKey (gift event id).
 * Returns amounts applied, or zeros if already done / invalid.
 */
export function applyGiftProfitSplitOnce(
  toUserId: string,
  totalCoins: number,
  dedupeKey: string,
): { toRecipient: number; toApp: number; applied: boolean } {
  const total = Math.max(0, Math.floor(Number(totalCoins) || 0));
  const key = String(dedupeKey || '').slice(0, 180);
  if (!toUserId || total <= 0 || !key) {
    return { toRecipient: 0, toApp: 0, applied: false };
  }

  try {
    if (localStorage.getItem(SPLIT_DONE_PREFIX + key) === '1') {
      return { toRecipient: 0, toApp: 0, applied: false };
    }
    localStorage.setItem(SPLIT_DONE_PREFIX + key, '1');
  } catch {
    /* continue even if storage fails */
  }

  const h = halves(total);
  if (h.toRecipient > 0) {
    writeUserEarnings(toUserId, readUserEarnings(toUserId) + h.toRecipient);
  }
  if (h.toApp > 0) {
    addAppProfitsCoins(h.toApp);
  }

  try {
    void fetch('/api/gifts/profit-split', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'full',
        toUserId,
        total,
        toRecipient: h.toRecipient,
        toApp: h.toApp,
        dedupeKey: key,
      }),
    });
  } catch {
    /* ignore */
  }

  return { ...h, applied: true };
}

/** @deprecated use applyGiftProfitSplitOnce */
export function applyGiftProfitSplit(toUserId: string, totalCoins: number) {
  const r = applyGiftProfitSplitOnce(toUserId, totalCoins, `legacy_${toUserId}_${totalCoins}_${Date.now()}`);
  return { toRecipient: r.toRecipient, toApp: r.toApp };
}

export function applyAppProfitShare(totalCoins: number): number {
  const { toApp } = halves(totalCoins);
  if (toApp > 0) addAppProfitsCoins(toApp);
  return toApp;
}

export function applyRecipientProfitShare(toUserId: string, totalCoins: number): number {
  const { toRecipient } = halves(totalCoins);
  if (!toUserId || toRecipient <= 0) return 0;
  writeUserEarnings(toUserId, readUserEarnings(toUserId) + toRecipient);
  return toRecipient;
}

/**
 * Convert support earnings → gift Coins balance (so user can gift again).
 */
export function convertEarningsToGiftBalance(userId: string, coins?: number): {
  ok: boolean;
  balance?: number;
  earnings?: number;
  converted?: number;
  error?: string;
} {
  const uid = String(userId || '');
  if (!uid) return { ok: false, error: 'يجب تسجيل الدخول' };

  const earn = readUserEarnings(uid);
  const amount = coins == null ? earn : Math.max(0, Math.floor(Number(coins) || 0));
  if (amount <= 0) return { ok: false, error: 'لا توجد أرباح للتحويل' };
  if (amount > earn) return { ok: false, error: 'الرصيد غير كافٍ' };

  const bal = readUserGiftBalance(uid);
  const nextBal = bal + amount;
  const nextEarn = earn - amount;
  writeUserGiftBalance(uid, nextBal);
  writeUserEarnings(uid, nextEarn);

  return { ok: true, balance: nextBal, earnings: nextEarn, converted: amount };
}

export function isOwnerIdentity(user?: {
  email?: string | null;
  username?: string | null;
  name?: string | null;
} | null): boolean {
  if (!user) return false;
  const email = String(user.email || '').trim().toLowerCase();
  const username = String(user.username || user.name || '').trim().toLowerCase();
  return email === OWNER_EMAIL || username === OWNER_USERNAME;
}

export const PAYPAL_WITHDRAW_URL = 'https://www.paypal.com/myaccount/transfer/homepage';
