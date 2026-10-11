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

/** Returns '' on success, otherwise a short reason: HTTP status (403 = not owner, 404 = server routes not deployed, 500 = database), 'html' or 'net'. */
async function save(userId: string, on: boolean): Promise<string> {
  try {
    const r = await fetch('/api/ai-credits/free', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, on }),
    });
    if (!r.ok) {
      try { const d: any = await r.clone().json(); if (d?.detail) console.error('[free-publish] server:', d.detail); } catch { /* */ }
      return String(r.status);
    }
    let d: any;
    try { d = await r.json(); } catch { return 'html'; } // 200 but not JSON: the route does not exist on this server
    if (Array.isArray(d?.ids)) granted = new Set<string>(d.ids.map((x: unknown) => String(x)));
    else if (on) granted.add(userId); else granted.delete(userId);
    loaded = true;
    emit();
    return '';
  } catch { return 'net'; }
}

export function OwnerFreePublishSwitch({ userId }: { userId: string }) {
  const [, force] = useState(0);
  const [failed, setFailed] = useState('');

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
    setFailed('');
    const why = await save(userId, next);
    if (why) { // server refused (not the owner / not deployed / offline): put it back and show why
      if (next) granted.delete(userId); else granted.add(userId);
      emit();
      setFailed(why);
      window.setTimeout(() => setFailed(''), 7000);
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
      {failed && <span style={{ color: '#fca5a5', fontWeight: 800, fontSize: '0.68rem' }}>! {failed}</span>}
      <span style={{ position: 'relative', width: 38, height: 22, borderRadius: 999, flexShrink: 0, background: on ? '#22c55e' : '#4b5563', transition: 'background 0.15s ease' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }} />
      </span>
    </span>
  );
}

export default OwnerFreePublishSwitch;
