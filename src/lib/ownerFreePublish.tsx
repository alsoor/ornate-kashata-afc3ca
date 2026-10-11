/**
 * OWNER-FREE-PUBLISH (v1.0.0)
 * Place at: src/lib/ownerFreePublish.tsx
 *
 * Owner only. A small switch shown next to every user in Settings -> User Control.
 * ON  = green "Active" (no frame): this user can publish photos / videos without paying
 *       (no points are taken and the Upgrade / payment box never opens for them).
 * OFF = normal again: points first, then Upgrade.
 *
 * The list is stored on the server (GET /api/ai-credits/free-list, POST /api/ai-credits/free, owner only).
 * One request loads the whole list; every switch shares it.
 */
import React, { useEffect, useState } from 'react';

const EVT = 'stooorna:ai-free-publish';

let granted = new Set<string>();
let loaded = false;
let loading: Promise<void> | null = null;

const emit = () => { try { window.dispatchEvent(new Event(EVT)); } catch { /* */ } };

function loadOnce(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await fetch('/api/ai-credits/free-list', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const d: any = await r.json();
        granted = new Set<string>((Array.isArray(d?.ids) ? d.ids : []).map((x: unknown) => String(x)));
        loaded = true;
        emit();
      }
    } catch { /* offline: every switch just shows OFF */ } finally { loading = null; }
  })();
  return loading;
}

async function save(userId: string, on: boolean): Promise<boolean> {
  try {
    const r = await fetch('/api/ai-credits/free', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, on }),
    });
    if (!r.ok) return false;
    const d: any = await r.json();
    if (Array.isArray(d?.ids)) granted = new Set<string>(d.ids.map((x: unknown) => String(x)));
    else if (on) granted.add(userId); else granted.delete(userId);
    loaded = true;
    emit();
    return true;
  } catch { return false; }
}

export function OwnerFreePublishSwitch({ userId }: { userId: string }) {
  const [, force] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const h = () => force(n => n + 1);
    window.addEventListener(EVT, h);
    void loadOnce();
    return () => window.removeEventListener(EVT, h);
  }, []);

  const on = granted.has(userId);

  const toggle = async (e: React.SyntheticEvent) => {
    e.stopPropagation(); // the row itself opens the user's control box: do not open it
    e.preventDefault();
    const next = !on;
    if (next) granted.add(userId); else granted.delete(userId); // instant
    emit();
    setFailed(false);
    const ok = await save(userId, next);
    if (!ok) { // server refused (not the owner / offline): put it back
      if (next) granted.delete(userId); else granted.add(userId);
      emit();
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2500);
    }
  };

  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label="Publish without paying"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') void toggle(e); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, cursor: 'pointer', padding: '6px 2px', background: 'transparent', border: 'none', outline: 'none' }}
    >
      {on && <span style={{ color: '#22c55e', fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.02em' }}>Active</span>}
      {failed && <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: '0.64rem' }}>!</span>}
      <span style={{ position: 'relative', width: 38, height: 22, borderRadius: 999, flexShrink: 0, background: on ? '#22c55e' : '#4b5563', transition: 'background 0.15s ease' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }} />
      </span>
    </span>
  );
}

export default OwnerFreePublishSwitch;
