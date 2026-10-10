import React from 'react';

interface StooornaAiIconProps {
  active?: boolean;
  onClick: () => void;
  size?: number;
}

/**
 * Bottom-bar icon for Stooorna Ai.
 * White rounded square with the black Stooorna globe logo inside.
 * - A silver shimmer keeps running around the frame.
 * - The globe rotates slowly.
 * Place this between LIVE and Templates in the bottom navigation.
 */
export default function StooornaAiIcon({ active = false, onClick, size = 42 }: StooornaAiIconProps) {
  const FRAME = 2.5;                       // thickness of the shimmering frame (px)
  const glyph = Math.round(size * 0.74);   // globe size (bigger than before)
  const ringSize = Math.round(size * 1.7); // rotating layer must cover the square's corners

  // Silver frame with one bright streak. Active = red frame with a white streak.
  const base = active ? '#ef4444' : '#7b8089';
  const mid = active ? '#fca5a5' : '#cfd3d9';
  const streak = '#ffffff';
  const ring = `conic-gradient(from 0deg, ${base} 0deg, ${base} 235deg, ${mid} 275deg, ${streak} 310deg, ${mid} 335deg, ${base} 360deg)`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Stooorna Ai"
      title="Stooorna Ai"
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 14, // semi-circular / rounded square
        border: 'none',
        background: 'transparent',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: active
          ? '0 0 12px rgba(239,68,68,0.45)'
          : '0 2px 8px rgba(0,0,0,0.35)',
        transition: 'box-shadow 0.2s ease',
        flexShrink: 0,
      }}
    >
      {/* Silver shimmer travelling around the frame */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: ringSize,
          height: ringSize,
          marginTop: -ringSize / 2,
          marginLeft: -ringSize / 2,
          background: ring,
          animation: 'stooornaAiIconFrame 2.8s linear infinite',
          pointerEvents: 'none',
        }}
      />

      {/* White face */}
      <span
        style={{
          position: 'absolute',
          inset: FRAME,
          borderRadius: 14 - FRAME,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Stooorna Ai globe logo (black on white) — slow rotation */}
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000000"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ animation: 'stooornaAiIconGlobe 9s linear infinite', transformOrigin: '50% 50%' }}
        >
          <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
          <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" />
          <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      </span>

      <style>{`
        @keyframes stooornaAiIconFrame {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes stooornaAiIconGlobe {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Stooorna Ai"] span, [aria-label="Stooorna Ai"] svg { animation: none !important; }
        }
      `}</style>
    </button>
  );
}
