import { useEffect } from 'react';

const HOLD_MS = 2000;
const SPIN_MS = 3000;

function AppMark() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="200" rx="42" fill="#0b1618" />
      <circle cx="100" cy="100" r="72" fill="none" stroke="#00BCD4" strokeWidth="14" />
      <path
        d="M42 78 C70 58, 130 58, 158 78"
        fill="none"
        stroke="#00BCD4"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M40 108 C78 92, 128 128, 160 108"
        fill="none"
        stroke="#00BCD4"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M48 138 C88 118, 122 162, 156 140"
        fill="none"
        stroke="#00BCD4"
        strokeWidth="12"
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
        background: 'radial-gradient(ellipse 70% 55% at 50% 42%, #042422 0%, #021110 40%, #000807 100%)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: 228, height: 228 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '7px solid #0f6b3a',
            boxShadow: '0 0 18px rgba(15,107,58,0.55), inset 0 0 12px rgba(15,107,58,0.25)',
            animation: 'stooornaSplashRingSpin 0.9s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 14,
            borderRadius: 36,
            overflow: 'hidden',
            animation: 'stooornaSplashLogoSpin 0.9s linear infinite',
          }}
        >
          <AppMark />
        </div>
      </div>

      <style>{`
        @keyframes stooornaSplashRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes stooornaSplashLogoSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}
