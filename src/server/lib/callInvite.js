/**
 * Call-invite store — shared across requests on the same Node process.
 * Uses globalThis + optional temp-file mirror (single VPS).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TTL_MS = 45_000;
const FILE = path.join(os.tmpdir(), 'stooorna-call-invites.json');

function store() {
  const g = globalThis;
  if (!g.__stooornaCallInvites) {
    g.__stooornaCallInvites = new Map();
    try {
      if (fs.existsSync(FILE)) {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (raw && typeof raw === 'object') {
          for (const [id, row] of Object.entries(raw)) {
            if (row && row.payload) g.__stooornaCallInvites.set(String(id), row);
          }
        }
      }
    } catch { /* */ }
  }
  return g.__stooornaCallInvites;
}

function persist() {
  try {
    const obj = {};
    for (const [id, row] of store()) obj[id] = row;
    fs.writeFileSync(FILE, JSON.stringify(obj));
  } catch { /* */ }
}

function prune() {
  const now = Date.now();
  const m = store();
  for (const [k, v] of m) {
    if (!v || Number(v.expiresAt || 0) <= now) m.delete(k);
  }
}

export function setCallInvite(toUserId, payload) {
  if (!toUserId) return;
  prune();
  store().set(String(toUserId), {
    payload: { ...payload, at: Number(payload.at) || Date.now() },
    expiresAt: Date.now() + TTL_MS,
  });
  persist();
}

export function getCallInvite(toUserId) {
  if (!toUserId) return null;
  prune();
  const row = store().get(String(toUserId));
  if (!row) return null;
  if (Number(row.expiresAt || 0) <= Date.now()) {
    store().delete(String(toUserId));
    persist();
    return null;
  }
  return row.payload;
}

export function clearCallInvite(toUserId, channel) {
  if (!toUserId) return;
  const row = store().get(String(toUserId));
  if (!row) return;
  if (channel && row.payload?.channel && String(row.payload.channel) !== String(channel)) return;
  store().delete(String(toUserId));
  persist();
}

export function callInviteTtlMs() {
  return TTL_MS;
}
