import { useEffect, useState } from 'react';

/**
 * Stooorna Ai icon visibility (owner-controlled).
 *  - users: إخفاء أيقونة Ai عن كل المستخدمين
 *  - owner: إخفاء أيقونة Ai عن الأونر نفسه (جهازه)
 * Stored locally + synced to the server (/api/ai-icon) so it reaches every phone.
 */
export type AiIconHide = { users: boolean; owner: boolean };

const KEY = 'stooorna_ai_icon_hide';
const EVT = 'stooorna:ai-icon-hide';

export function readAiIconHide(): AiIconHide {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { users: !!p.users, owner: !!p.owner };
    }
  } catch { /* */ }
  return { users: false, owner: false };
}

function writeLocal(next: AiIconHide) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch { /* */ }
}

export async function fetchAiIconHide(): Promise<AiIconHide | null> {
  try {
    const r = await fetch('/api/ai-icon', { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    const src = d && (d.hide || d);
    if (!src || typeof src !== 'object') return null;
    const next = { users: !!src.users, owner: !!src.owner };
    writeLocal(next);
    return next;
  } catch { return null; }
}

/** Owner only: save + broadcast. Returns true when the server confirmed. */
export async function setAiIconHide(next: AiIconHide): Promise<boolean> {
  writeLocal(next);
  try {
    const r = await fetch('/api/ai-icon', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hide: next }),
    });
    return r.ok;
  } catch { return false; }
}

export function isAiOwnerUser(user: { email?: string | null; username?: string | null } | null | undefined): boolean {
  const email = String(user?.email ?? '').trim().toLowerCase();
  const uname = String(user?.username ?? '').replace(/^@/, '').trim().toLowerCase();
  return email === 'stooorna@mail.com' || uname === 'stooorna';
}

/** true = show the Ai icon in the bottom bar for this user */
export function useAiIconVisible(user: { email?: string | null; username?: string | null } | null | undefined): boolean {
  const [hide, setHide] = useState<AiIconHide>(() => readAiIconHide());
  useEffect(() => {
    let alive = true;
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setHide(d && typeof d === 'object' ? { users: !!d.users, owner: !!d.owner } : readAiIconHide());
    };
    window.addEventListener(EVT, onEvt);
    const pull = () => { void fetchAiIconHide().then(h => { if (alive && h) setHide(h); }); };
    pull();
    const t = window.setInterval(pull, 60000);
    return () => { alive = false; window.removeEventListener(EVT, onEvt); window.clearInterval(t); };
  }, []);
  return isAiOwnerUser(user) ? !hide.owner : !hide.users;
}
