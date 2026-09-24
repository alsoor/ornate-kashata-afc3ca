import { useEffect, useState } from 'react';

const LETTERS = ['S', 't', 'o', 'o', 'o', 'r', 'n', 'a'];
const HOLD_MS = 2000;
const SPIN_MS = 3000;

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    const a = window.setTimeout(() => setSpin(true), HOLD_MS);
    const b = window.setTimeout(() => onDone(), HOLD_MS + SPIN_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
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
        background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #0d3a3a 0%, #072422 42%, #041312 100%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,188,212,0.28) 0%, rgba(0,188,212,0.08) 42%, transparent 70%)',
          filter: 'blur(8px)',
          animation: 'stooornaSplashGlow 2.4s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 280,
          height: 280,
          borderRadius: '50%',
          border: '1.5px solid rgba(0,188,212,0.45)',
          boxShadow: '0 0 28px rgba(0,188,212,0.35), inset 0 0 24px rgba(0,188,212,0.12)',
          animation: 'stooornaSplashRing 3.2s linear infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: '50%',
          border: '1px solid rgba(0,188,212,0.22)',
        }}
      />

      <div style={{ display: 'flex', gap: 2, zIndex: 1, alignItems: 'center' }}>
        {LETTERS.map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            style={{
              color: '#e7ffff',
              fontSize: '2.05rem',
              fontWeight: 900,
              letterSpacing: '0.04em',
              textShadow: '0 0 16px rgba(0,188,212,0.7), 0 0 36px rgba(0,188,212,0.28)',
              display: 'inline-block',
              transformOrigin: '50% 55%',
              animation: spin ? `stooornaSplashFlip 0.9s ease-in-out ${i * 0.08}s both` : 'none',
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes stooornaSplashGlow {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes stooornaSplashRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes stooornaSplashFlip {
          0% { transform: rotateY(0deg) rotateZ(0deg); }
          40% { transform: rotateY(180deg) rotateZ(12deg); }
          70% { transform: rotateY(320deg) rotateZ(-8deg); }
          100% { transform: rotateY(360deg) rotateZ(0deg); }
        }
      `}</style>
    </div>
  );
}
