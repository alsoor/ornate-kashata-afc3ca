import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth/auth-client';

const EmbeddedSettings = lazy(() => import('@/pages/settings'));
const KEY = 'stooorna_owner_control_on';

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
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem('stooorna_owner_control_pos');
      const p = raw ? JSON.parse(raw) : null;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p as { x: number; y: number };
    } catch { /* */ }
    return { x: 16, y: 120 };
  });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  useEffect(() => {
    const sync = () => {
      try { setOn(localStorage.getItem(KEY) !== '0'); } catch { /* */ }
    };
    const onEvt = (e: Event) => setOn(!!(e as CustomEvent).detail?.on);
    window.addEventListener('storage', sync);
    window.addEventListener('stooorna:owner-control', onEvt as EventListener);
    window.addEventListener('stooorna:close-owner-dock', () => setOpen(false));
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('stooorna:owner-control', onEvt as EventListener);
    };
  }, []);

  if (!owner || !on) return null;

  const openBubble = () => {
    try { sessionStorage.setItem('stooorna_owner_dock_only', '1'); } catch { /* */ }
    setOpen(true);
  };
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
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false };
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
          const x = Math.max(8, Math.min(window.innerWidth - 64, d.px + dx));
          const y = Math.max(8, Math.min(window.innerHeight - 64, d.py + dy));
          setPos({ x, y });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          try { localStorage.setItem('stooorna_owner_control_pos', JSON.stringify(pos)); } catch { /* */ }
          if (!d?.moved) openBubble();
        }}
        style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 14040,
          width: 56, height: 56, borderRadius: 16, padding: 0, cursor: 'grab',
          border: '2px solid #eab308', background: '#1a1400',
          boxShadow: '0 0 0 3px rgba(234,179,8,0.25), 0 8px 22px rgba(0,0,0,0.45)',
          animation: 'stooornaOwnerDockPulse 1.4s ease-in-out infinite',
          overflow: 'hidden',
        }}
      >
        <img src="/icons/icon-192.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.15)' }} />
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 14050, background: 'rgba(0,0,0,0.35)' }} onClick={closeBubble}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="stooorna-owner-float"
            style={{
              position: 'fixed',
              left: Math.max(8, Math.min(pos.x, window.innerWidth - 340)),
              top: Math.max(8, Math.min(pos.y + 64, window.innerHeight - 280)),
              width: 'min(420px, calc(100vw - 16px))',
              height: 'min(72dvh, 640px)',
              borderRadius: 18,
              overflow: 'hidden',
              border: '1px solid rgba(234,179,8,0.45)',
              background: '#0c0608',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}
          >
            <Suspense fallback={<p style={{ color: '#eab308', textAlign: 'center', marginTop: 24 }}>Loading…</p>}>
              <EmbeddedSettings />
            </Suspense>
          </div>
        </div>
      )}
      <style>{`@keyframes stooornaOwnerDockPulse { 0%,100% { transform: scale(1); box-shadow: 0 0 0 3px rgba(234,179,8,0.25), 0 8px 22px rgba(0,0,0,0.45); } 50% { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(234,179,8,0.15), 0 0 18px rgba(234,179,8,0.7); } }`}</style>
    </>
  );
}
