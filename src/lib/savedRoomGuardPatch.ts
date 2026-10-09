/**
 * SAVED-ROOM-GUARD-PATCH (client) — standalone file, used only by the Saved Messages chat + the invite popup in add-friend.tsx.
 *
 *  A) DELETE
 *     - A deleted row is remembered on this device ("tombstone"), so the 2-second room refresh can never bring it back.
 *     - Deleting my own photo / video also sends a hidden delete command through the room, so it disappears
 *       from the other person's chat right away. The command is never shown as a message.
 *       (Only the sender of the media — or the room owner — can delete it for everyone.)
 *
 *  B) INVITES
 *     - An invite that was already answered (Accept / Decline) never pops up again.
 *     - After I get kicked, invites from before / right after the kick are ignored (that was the automatic
 *       "ghost invite"). A real new invite sent later still arrives normally.
 */
import { decodeSavedMediaLink } from './savedMediaPatch';

const un = (s: unknown) => String(s ?? '').replace(/^@/, '').trim().toLowerCase();

/* ───────────── A) delete ───────────── */
const DEL_KEY = 'stooorna_saved_deleted_v1_';
const CMD = '\u2063SMDEL\u2063';

type Tomb = { u?: string; id?: string; s?: string; t?: string; at?: number };
type Row = { id?: string; kind?: string; mediaUrl?: string | null; text?: string | null; senderName?: string | null; createdAt?: number };

/** same file → same key, whatever the host / #tag in front of it */
export function normMediaUrl(u: unknown): string {
  return String(u ?? '').split('#')[0].replace(/^https?:\/\/[^/]+/i, '');
}

function loadTombs(uid: string): Tomb[] {
  try { const a = JSON.parse(localStorage.getItem(DEL_KEY + uid) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** remember a deleted row; returns true when it was not remembered before */
export function markDeleted(uid: string, row: Row): boolean {
  if (!uid) return false;
  const list = loadTombs(uid);
  const t: Tomb = {};
  const u = row.mediaUrl && !String(row.mediaUrl).startsWith('blob:') ? normMediaUrl(row.mediaUrl) : '';
  if (u) t.u = u;
  if (row.id) t.id = String(row.id);
  if (row.kind === 'text' && row.text) { t.s = un(row.senderName); t.t = String(row.text); t.at = Number(row.createdAt) || Date.now(); }
  if (!t.u && !t.id && !t.t) return false;
  const exists = list.some(x => (t.u && x.u === t.u) || (!t.u && t.id && x.id === t.id));
  list.push(t);
  try { localStorage.setItem(DEL_KEY + uid, JSON.stringify(list.slice(-400))); } catch { /* */ }
  return !exists;
}

/** returns a checker: is this row (from the server or local) one I / the sender deleted? */
export function deletedChecker(uid: string): (row: Row) => boolean {
  const list = loadTombs(uid);
  if (!list.length) return () => false;
  return (row: Row) => {
    const u = row.mediaUrl ? normMediaUrl(row.mediaUrl) : '';
    for (const x of list) {
      if (u && x.u && x.u === u) return true;
      if (row.id && x.id && x.id === String(row.id)) return true;
      if (x.t && row.kind === 'text' && String(row.text || '') === x.t && (!x.s || x.s === un(row.senderName)) && Math.abs((Number(row.createdAt) || 0) - (x.at || 0)) < 60000) return true;
    }
    return false;
  };
}

/** hidden room message that tells everybody to remove this photo / video */
export function encodeDeleteCmd(url: string): string { return `${CMD}${normMediaUrl(url)}`; }
export function decodeDeleteCmd(text?: unknown): string | null {
  const s = String(text ?? '');
  return s.startsWith(CMD) ? s.slice(CMD.length) : null;
}

/** media url of a raw room message (img: / vid: / hidden link), '' for plain text */
export function rawMediaUrl(raw?: unknown): string {
  const s = String(raw ?? '');
  if (s.startsWith('img:') || s.startsWith('vid:')) return normMediaUrl(s.slice(4));
  const d = decodeSavedMediaLink(s);
  return d ? normMediaUrl(d.url) : '';
}

/* ───────────── B) invites ───────────── */
const INV_DONE_KEY = 'stooorna_saved_invite_done_v1';
const KICK_KEY = 'stooorna_saved_kick_at_v1';
const KICK_WINDOW_MS = 20000;

function doneSet(): Set<string> {
  try { const a = JSON.parse(localStorage.getItem(INV_DONE_KEY) || '[]'); return new Set<string>(Array.isArray(a) ? a.map(String) : []); } catch { return new Set<string>(); }
}
export function isInviteDone(id: string): boolean { return doneSet().has(String(id)); }
export function markInviteDone(id: string): void {
  if (!id) return;
  const s = doneSet(); s.add(String(id));
  try { localStorage.setItem(INV_DONE_KEY, JSON.stringify(Array.from(s).slice(-300))); } catch { /* */ }
}

/** call for every "you were kicked" notification; returns true when this is a NEW kick */
export function noteKick(at: number): boolean {
  const t = Number(at) || Date.now();
  let prev = 0;
  try { prev = Number(localStorage.getItem(KICK_KEY)) || 0; } catch { /* */ }
  if (t <= prev) return false;
  try { localStorage.setItem(KICK_KEY, String(t)); } catch { /* */ }
  return true;
}
/** true = this invite is from before the kick (or its automatic echo right after it) → ignore it */
export function inviteIsKickEcho(at: number): boolean {
  let k = 0;
  try { k = Number(localStorage.getItem(KICK_KEY)) || 0; } catch { /* */ }
  return k > 0 && (Number(at) || 0) <= k + KICK_WINDOW_MS;
}
