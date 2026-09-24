import { useEffect } from 'react';

const HOLD_MS = 2000;
const SPIN_MS = 3000;

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDone(), HOLD_MS + SPIN_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse 70% 55% at 50% 42%, #063230 0%, #031614 38%, #010807 100%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,40,42,0.45) 0%, rgba(0,0,0,0.2) 55%, transparent 72%)',
          filter: 'blur(10px)',
        }}
      />

      <div style={{ position: 'relative', width: 236, height: 236 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '6px solid #22c55e',
            boxShadow: '0 0 22px rgba(34,197,94,0.55), inset 0 0 18px rgba(34,197,94,0.18)',
            animation: 'stooornaSplashRingSpin 0.85s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 10,
            borderRadius: '50%',
            border: '1px solid rgba(0,188,212,0.28)',
          }}
        />
        <img
          src="/stooorna-logo.jpg"
          alt=""
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 132,
            height: 132,
            borderRadius: 28,
            objectFit: 'cover',
            animation: 'stooornaSplashLogoSpin 0.85s linear infinite',
            boxShadow: '0 0 18px rgba(0,188,212,0.28)',
          }}
        />
      </div>

      <style>{`
        @keyframes stooornaSplashRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes stooornaSplashLogoSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}
