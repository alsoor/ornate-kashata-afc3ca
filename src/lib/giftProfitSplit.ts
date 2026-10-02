/**
 * giftProfitSplit — 50/50 split of live gift support coins.
 *
 * When a gift is sent in account voice/camera live:
 *   - 50% → recipient's earnings (settings Balance / support received)
 *   - 50% → app Profits (owner @Stooorna settings → Profits)
 *
 * Call sites (avoid double-count across devices):
 *   - Sender device: applyAppProfitShare(total)  // always
 *   - Recipient device: applyRecipientProfitShare(toUserId, total)  // when they receive the gift event
 *   - Same device (sender === viewing as recipient): applyGiftProfitSplit once
 *
 * Odd coins: recipient gets ceil(half), app gets floor(half).
 */

export const OWNER_USERNAME = 'stooorna';
export const OWNER_EMAIL = 'stooorna@mail.com';

const APP_PROFITS_KEY = 'stooorna_app_profits';
const APP_PROFITS_COINS_KEY = 'stooorna_app_profits_coins';
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

export function readUserEarnings(uid: string): number {
  return readNum(earningsKey(uid));
}

export function writeUserEarnings(uid: string, n: number) {
  writeNum(earningsKey(uid), n);
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:coins-earnings', {
        detail: { userId: uid, earnings: Math.max(0, Math.floor(n)) },
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
  const stored = readNum(APP_PROFITS_KEY);
  if (stored > 0) return stored / 100;
  return (readAppProfitsCoins() * PROFIT_CENTS_PER_COIN) / 100;
}

export function getAppProfitsSnapshot(): AppProfitsSnapshot {
  const coins = readAppProfitsCoins();
  return { coins, usd: (coins * PROFIT_CENTS_PER_COIN) / 100 };
}

function writeAppProfitsCoins(n: number) {
  const v = Math.max(0, Math.floor(n));
  writeNum(APP_PROFITS_COINS_KEY, v);
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

/** App share only (call on sender device). */
export function applyAppProfitShare(totalCoins: number): number {
  const { toApp } = halves(totalCoins);
  if (toApp > 0) addAppProfitsCoins(toApp);
  try {
    void fetch('/api/gifts/profit-split', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'app', total: totalCoins, toApp }),
    });
  } catch {
    /* ignore */
  }
  return toApp;
}

/** Recipient share only (call on recipient device). */
export function applyRecipientProfitShare(toUserId: string, totalCoins: number): number {
  const { toRecipient } = halves(totalCoins);
  if (!toUserId || toRecipient <= 0) return 0;
  writeUserEarnings(toUserId, readUserEarnings(toUserId) + toRecipient);
  try {
    void fetch('/api/gifts/profit-split', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'recipient', toUserId, total: totalCoins, toRecipient }),
    });
  } catch {
    /* ignore */
  }
  return toRecipient;
}

/** Full 50/50 on one device (sender is also recipient, or single-device demo). */
export function applyGiftProfitSplit(toUserId: string, totalCoins: number): {
  toRecipient: number;
  toApp: number;
} {
  const h = halves(totalCoins);
  if (toUserId && h.toRecipient > 0) {
    writeUserEarnings(toUserId, readUserEarnings(toUserId) + h.toRecipient);
  }
  if (h.toApp > 0) addAppProfitsCoins(h.toApp);
  try {
    void fetch('/api/gifts/profit-split', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'full',
        toUserId,
        total: totalCoins,
        toRecipient: h.toRecipient,
        toApp: h.toApp,
      }),
    });
  } catch {
    /* ignore */
  }
  return h;
}

/** Convert recipient earnings coins back into gift spend balance (same user). */
export function convertEarningsToGiftBalance(userId: string, coins: number): {
  ok: boolean;
  balance?: number;
  earnings?: number;
  error?: string;
} {
  const uid = String(userId || '');
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  if (!uid || amount <= 0) return { ok: false, error: 'Invalid amount' };

  const earn = readUserEarnings(uid);
  if (amount > earn) return { ok: false, error: 'Insufficient earnings' };

  const balKey = `stooorna_coins_balance_${uid || 'guest'}`;
  let bal = 0;
  try {
    bal = Number(localStorage.getItem(balKey) || 0);
    if (!Number.isFinite(bal) || bal < 0) bal = 0;
  } catch {
    bal = 0;
  }
  const nextBal = Math.floor(bal) + amount;
  const nextEarn = earn - amount;
  try {
    localStorage.setItem(balKey, String(nextBal));
  } catch {
    /* ignore */
  }
  writeUserEarnings(uid, nextEarn);
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:coins-balance', { detail: { userId: uid, balance: nextBal } }),
    );
  } catch {
    /* ignore */
  }
  return { ok: true, balance: nextBal, earnings: nextEarn };
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
