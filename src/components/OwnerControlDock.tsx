import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth/auth-client';

const EmbeddedSettings = lazy(() => import('@/pages/settings'));
const KEY = 'stooorna_owner_control_on';
const SIZE = 34;

function isOwnerUser(user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined) {
  const email = String(user?.email || '').trim().toLowerCase();
  const username = String(user?.username || user?.name || '').replace(/^@/, '').trim().toLowerCase();
  return email === 'stooorna@mail.com' || username === 'stooorna' || email.endsWith('@stooorna.com');
}

export default function OwnerControlDock() {
  const sessionResult = useSession();
  const user = (sessionResult as any)?.data?.user ?? (sessionResult as any)?.user ?? (sessionResult as any)?.session?.user ?? null;
  const owner = isOwnerUser(user);
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
  });
  const [open, setOpen] = useState(false);
  const posRef = useRef({ x: 12, y: 96 });
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem('stooorna_owner_control_pos');
      const p = raw ? JSON.parse(raw) : null;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        posRef.current = p;
        return p as { x: number; y: number };
      }
    } catch { /* */ }
    return posRef.current;
  });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  useEffect(() => {
    const sync = () => {
      try { setOn(localStorage.getItem(KEY) !== '0'); } catch { /* */ }
    };
    const onEvt = (e: Event) => setOn(!!(e as CustomEvent).detail?.on);
    const close = () => setOpen(false);
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      const x = Math.max(6, Math.min(window.innerWidth - SIZE - 6, d.px + dx));
      const y = Math.max(6, Math.min(window.innerHeight - SIZE - 6, d.py + dy));
      posRef.current = { x, y };
      setPos(posRef.current);
    };
    const swallowClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      e.preventDefault();
      e.stopPropagation();
      try { localStorage.setItem('stooorna_owner_control_pos', JSON.stringify(posRef.current)); } catch { /* */ }
      if (!d.moved) {
        // النقرة التالية كانت توصل لزر الكاميرا/مكتبة الصور. نبلعها ثم نفتح COMPANY.
        window.addEventListener('click', swallowClick, true);
        window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 700);
        try { sessionStorage.setItem('stooorna_owner_dock_only', '1'); } catch { /* */ }
        window.setTimeout(() => setOpen(true), 80);
      }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('stooorna:owner-control', onEvt as EventListener);
    window.addEventListener('stooorna:close-owner-dock', close);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('stooorna:owner-control', onEvt as EventListener);
      window.removeEventListener('stooorna:close-owner-dock', close);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  if (!owner || !on) return null;

  const closeBubble = () => {
    try { sessionStorage.removeItem('stooorna_owner_dock_only'); } catch { /* */ }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Control Owner"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drag.current = { x: e.clientX, y: e.clientY, px: posRef.current.x, py: posRef.current.y, moved: false };
        }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 14040,
          width: SIZE, height: SIZE, borderRadius: 10, padding: 0, cursor: 'grab',
          border: '1.5px solid #eab308', background: '#1a1400',
          boxShadow: '0 0 0 2px rgba(234,179,8,0.28), 0 6px 16px rgba(0,0,0,0.4)',
          animation: 'stooornaOwnerDockPulse 1.5s ease-in-out infinite',
          overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        }}
      >
        <img src="/icons/icon-192.png" alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', filter: 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.15)' }} />
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 14050, background: 'rgba(0,0,0,0.45)' }} onClick={closeBubble}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="stooorna-owner-float"
            style={{
              position: 'fixed', left: 8, right: 8, top: 56, bottom: 24,
              width: 'auto', maxWidth: 480, margin: '0 auto',
              borderRadius: 18, overflow: 'hidden',
              border: '1px solid rgba(234,179,8,0.45)',
              background: '#061014',
              boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(234,179,8,0.25)' }}>
              <span style={{ flex: 1, color: '#eab308', fontWeight: 800, fontSize: 13 }}>COMPANY</span>
              <button type="button" onClick={closeBubble} style={{ border: 'none', background: 'transparent', color: '#eab308', fontWeight: 800, cursor: 'pointer' }}>إغلاق</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Suspense fallback={<p style={{ color: '#eab308', textAlign: 'center', marginTop: 24 }}>Loading…</p>}>
                <EmbeddedSettings />
              </Suspense>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes stooornaOwnerDockPulse { 0%,100% { box-shadow: 0 0 0 2px rgba(234,179,8,0.28), 0 6px 16px rgba(0,0,0,0.4); } 50% { box-shadow: 0 0 0 5px rgba(234,179,8,0.12), 0 0 14px rgba(234,179,8,0.75); } }`}</style>
    </>
  );
}
