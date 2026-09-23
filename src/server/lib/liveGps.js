/**
 * Live GPS pin store — shared across requests on the same Node process.
 * Uses globalThis so hot-reload / multi-import does not wipe pins.
 * Also mirrors to a temp file when the filesystem is writable (single VPS).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TTL_MS = 30 * 60 * 1000;
const FILE = path.join(os.tmpdir(), 'stooorna-live-gps-pins.json');

function store() {
  const g = globalThis;
  if (!g.__stooornaLiveGpsPins) {
    g.__stooornaLiveGpsPins = new Map();
    try {
      if (fs.existsSync(FILE)) {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (raw && typeof raw === 'object') {
          for (const [id, p] of Object.entries(raw)) {
            if (p && typeof p.lat === 'number') g.__stooornaLiveGpsPins.set(String(id), p);
          }
        }
      }
    } catch { /* */ }
  }
  return g.__stooornaLiveGpsPins;
}

function persist() {
  try {
    const obj = {};
    for (const [id, p] of store()) obj[id] = p;
    fs.writeFileSync(FILE, JSON.stringify(obj));
  } catch { /* serverless may block fs */ }
}

function prune() {
  const now = Date.now();
  const m = store();
  for (const [id, p] of m) {
    if (!p || now - Number(p.at || 0) > TTL_MS) m.delete(id);
  }
}

export function upsertLiveGpsPin(pin) {
  if (!pin || !pin.id) return;
  const id = String(pin.id);
  const row = {
    id,
    name: String(pin.name || 'User'),
    username: String(pin.username || '').replace(/^@/, ''),
    avatarUrl: pin.avatarUrl ?? null,
    lat: Number(pin.lat),
    lng: Number(pin.lng),
    at: Date.now(),
  };
  store().set(id, row);
  persist();
}

export function removeLiveGpsPin(userId) {
  if (!userId) return;
  store().delete(String(userId));
  persist();
}

export function listLiveGpsPins() {
  prune();
  return Array.from(store().values()).filter(
    p => p && typeof p.lat === 'number' && typeof p.lng === 'number',
  );
}
