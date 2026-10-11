/**
 * liveBox.server.ts — Treasure Box (صندوق الكنز) for live rooms.
 *
 * The box is SHARED state, so the server is the single clock + referee:
 *   buy   → starts a 4:00 countdown that every viewer of the room sees (same server time).
 *   open  → when the countdown ends the server splits the box value into N random shares
 *           (N = viewers present in the room at that moment). Each viewer taps once and grabs the next share.
 *   close → as soon as every share is taken (or after CLAIM_MS) the box disappears for everybody.
 *
 * Coins are credited by the client (same model as /api/gifts/balance): the claim response carries the amount.
 *
 * Mount in entry.ts (one line, anywhere after the app is created and before the catch-all route):
 *
 *   import { createLiveBoxRouter } from './liveBox.server';
 *   app.use('/api/live-box', createLiveBoxRouter());
 *
 * State is kept in memory and mirrored to data/live-box.json so a restart does not eat a running box.
 */
import { Router, json } from 'express';
import fs from 'node:fs';
import path from 'node:path';

// ── settings (change here) ─────────────────────────────────────────────
const ALLOWED_COINS = [250, 500, 1000];
const COUNTDOWN_MS = 4 * 60 * 1000;  // 4 minutes
const CLAIM_MS = 30 * 1000;          // how long the opened box stays available
const PRESENT_MS = 8000;             // a viewer counts as "present" if it polled within this window
const MAX_CLAIMS_SHOWN = 30;

type Person = { id: string; name: string; avatar: string | null };
type Claim = { userId: string; name: string; avatar: string | null; coins: number; at: number };
type Box = {
  id: string;
  room: string;
  coins: number;
  buyer: Person;
  startedAt: number;
  openAt: number;
  claimEndsAt: number | null;
  phase: 'counting' | 'open';
  total: number;      // number of shares (0 until opened)
  shares: number[];   // shares still available
  claims: Claim[];
};

const boxes = new Map<string, Box>();
const presence = new Map<string, Map<string, number>>();

// ── persistence (best effort) ──────────────────────────────────────────
const FILE = path.join(process.cwd(), 'data', 'live-box.json');
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify([...boxes.values()]));
    } catch { /* ignore */ }
  }, 400);
}
function loadOnce() {
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Box[];
    for (const b of arr) if (b && b.room && b.id) boxes.set(b.room, b);
  } catch { /* no file yet */ }
}

// ── helpers ────────────────────────────────────────────────────────────
const cleanRoom = (v: unknown) => String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
const cleanStr = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const cleanAvatar = (v: unknown): string | null => {
  const s = String(v ?? '').slice(0, 600);
  return s ? s : null;
};
const cleanUid = (v: unknown) => String(v ?? '').slice(0, 80);

function markPresent(room: string, uid: string, now: number) {
  if (!uid) return;
  let m = presence.get(room);
  if (!m) { m = new Map(); presence.set(room, m); }
  m.set(uid, now);
  if (m.size > 400) for (const [k, t] of m) if (now - t > PRESENT_MS * 4) m.delete(k);
}
function presentCount(room: string, now: number): number {
  const m = presence.get(room);
  if (!m) return 0;
  let n = 0;
  for (const t of m.values()) if (now - t <= PRESENT_MS) n++;
  return n;
}

/** Lucky split: `n` integer shares ≥ 1 that add up to `total` (no share is more than ~2× the average). */
function luckySplit(total: number, n: number): number[] {
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < n - 1; i++) {
    const slotsLeft = n - i;
    const max = Math.max(1, Math.min(left - (slotsLeft - 1), Math.floor((left / slotsLeft) * 2)));
    const v = 1 + Math.floor(Math.random() * max);
    out.push(v);
    left -= v;
  }
  out.push(left);
  // shuffle so the big share is not always first
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Moves the room's box through its phases; returns the live box or null. */
function tick(room: string, now: number): Box | null {
  const b = boxes.get(room);
  if (!b) return null;
  if (b.phase === 'counting' && now >= b.openAt) {
    const n = Math.max(1, Math.min(presentCount(room, now), b.coins));
    b.shares = luckySplit(b.coins, n);
    b.total = n;
    b.phase = 'open';
    b.claimEndsAt = now + CLAIM_MS;
    saveSoon();
  }
  if (b.phase === 'open' && (b.shares.length === 0 || (b.claimEndsAt != null && now >= b.claimEndsAt))) {
    boxes.delete(room);
    saveSoon();
    return null;
  }
  return b;
}

function publicBox(b: Box | null, uid: string) {
  if (!b) return null;
  const mine = b.claims.find(c => c.userId === uid);
  return {
    id: b.id,
    phase: b.phase,
    coins: b.coins,
    buyer: b.buyer,
    startedAt: b.startedAt,
    openAt: b.openAt,
    claimEndsAt: b.claimEndsAt,
    total: b.total,
    left: b.shares.length,
    claims: b.claims.slice(-MAX_CLAIMS_SHOWN).map(c => ({ userId: c.userId, name: c.name, avatar: c.avatar, coins: c.coins })),
    mine: mine ? mine.coins : null,
  };
}

// ── router ─────────────────────────────────────────────────────────────
export function createLiveBoxRouter(): Router {
  loadOnce();
  const r = Router();
  r.use(json({ limit: '16kb' }));

  // heartbeat + state (every viewer polls this ~1.2s; that is also how "present viewers" is counted)
  r.get('/', (req, res) => {
    const room = cleanRoom(req.query.room);
    const uid = cleanUid(req.query.uid);
    if (!room) return res.status(400).json({ ok: false, error: 'room' });
    const now = Date.now();
    markPresent(room, uid, now);
    const b = tick(room, now);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, now, box: publicBox(b, uid) });
  });

  r.post('/', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const room = cleanRoom(body.room);
    const uid = cleanUid(body.userId);
    const action = String(body.action || '');
    if (!room || !uid) return res.status(400).json({ ok: false, error: 'bad' });
    const now = Date.now();
    markPresent(room, uid, now);
    const current = tick(room, now);
    const person: Person = { id: uid, name: cleanStr(body.name, 60), avatar: cleanAvatar(body.avatar) };

    if (action === 'buy') {
      const coins = Math.floor(Number(body.coins) || 0);
      if (!ALLOWED_COINS.includes(coins)) return res.status(400).json({ ok: false, error: 'amount' });
      if (current) return res.json({ ok: false, error: 'active', now, box: publicBox(current, uid) });
      const box: Box = {
        id: `bx_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        room,
        coins,
        buyer: person,
        startedAt: now,
        openAt: now + COUNTDOWN_MS,
        claimEndsAt: null,
        phase: 'counting',
        total: 0,
        shares: [],
        claims: [],
      };
      boxes.set(room, box);
      saveSoon();
      return res.json({ ok: true, now, box: publicBox(box, uid) });
    }

    if (action === 'claim') {
      if (!current || current.phase !== 'open') return res.json({ ok: false, error: 'closed', now, box: publicBox(current, uid) });
      if (current.claims.some(c => c.userId === uid)) return res.json({ ok: false, error: 'claimed', now, box: publicBox(current, uid) });
      const share = current.shares.pop();
      if (!share) return res.json({ ok: false, error: 'closed', now, box: null });
      current.claims.push({ userId: uid, name: person.name, avatar: person.avatar, coins: share, at: now });
      const after = tick(room, now); // closes immediately when the last share was taken
      saveSoon();
      return res.json({ ok: true, coins: share, now, box: publicBox(after, uid) });
    }

    return res.status(400).json({ ok: false, error: 'action' });
  });

  return r;
}

export default createLiveBoxRouter;
