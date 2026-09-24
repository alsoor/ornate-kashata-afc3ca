/**
 * Top toast when someone starts voice or video live.
 * Mount once in RootLayout (or app shell). English-only.
 */
import { useEffect, useState } from 'react';

type Banner = {
  id: number;
  message: string;
  kind: 'voice' | 'camera';
  hostId: string;
};

export default function LiveStartBanner() {
  const [items, setItems] = useState<Banner[]>([]);

  useEffect(() => {
    const onBanner = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        active?: boolean;
        message?: string;
        kind?: 'voice' | 'camera';
        hostId?: string;
      };
      if (!d?.active || !d.message || !d.hostId) return;
      const id = Date.now();
      setItems(prev => [...prev, { id, message: d.message!, kind: d.kind || 'voice', hostId: d.hostId! }].slice(-3));
      window.setTimeout(() => {
        setItems(prev => prev.filter(x => x.id !== id));
      }, 5000);
    };
    window.addEventListener('stooorna:live-banner', onBanner as EventListener);
    return () => window.removeEventListener('stooorna:live-banner', onBanner as EventListener);
  }, []);

  if (!items.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(10px, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 12000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 'min(420px, calc(100vw - 24px))',
        pointerEvents: 'none',
      }}
    >
      {items.map(b => (
        <div
          key={b.id}
          style={{
            pointerEvents: 'auto',
            borderRadius: 14,
            padding: '10px 14px',
            background: 'rgba(6,18,20,0.94)',
            border: b.kind === 'camera'
              ? '1px solid rgba(250,204,21,0.45)'
              : '1px solid rgba(34,197,94,0.45)',
            color: '#e8f6f6',
            fontWeight: 700,
            fontSize: '0.82rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {b.message}
        </div>
      ))}
    </div>
  );
}
