import { useEffect } from 'react';

const HOLD_MS = 2000;
const SPIN_MS = 3000;

function AppIcon() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <circle cx="100" cy="100" r="78" fill="#071314" />
      <circle cx="100" cy="100" r="64" fill="none" stroke="#00BCD4" strokeWidth="16" />
      <path
        d="M48 86 C78 62, 122 62, 152 86"
        fill="none"
        stroke="#00BCD4"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M44 112 C84 94, 124 132, 156 112"
        fill="none"
        stroke="#00BCD4"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M52 140 C90 118, 124 160, 150 138"
        fill="none"
        stroke="#00BCD4"
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
        background: 'radial-gradient(ellipse 60% 50% at 50% 38%, #0a2426 0%, #061516 42%, #030a0b 100%)',
      }}
    >
      <div style={{ position: 'relative', width: 168, height: 168 }}>
        <svg
          viewBox="0 0 100 100"
          width="168"
          height="168"
          style={{
            position: 'absolute',
            inset: 0,
            animation: 'stooornaSplashRingSpin 1.1s linear infinite',
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgba(0,80,86,0.45)"
            strokeWidth="3.2"
          />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="url(#stooornaSplashArc)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeDasharray="70 206"
          />
          <defs>
            <linearGradient id="stooornaSplashArc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00E5FF" />
              <stop offset="55%" stopColor="#00BCD4" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 28,
            borderRadius: '50%',
            overflow: 'hidden',
          }}
        >
          <AppIcon />
        </div>
      </div>
      <style>{`
        @keyframes stooornaSplashRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
