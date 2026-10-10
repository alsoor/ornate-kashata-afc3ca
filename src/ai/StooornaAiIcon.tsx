import React from 'react';

interface StooornaAiIconProps {
  active?: boolean;
  onClick: () => void;
  size?: number;
}

/**
 * Bottom-bar icon for Stooorna Ai.
 * White rounded square with the black Stooorna globe logo inside.
 * Place this between LIVE and Templates in the bottom navigation.
 */
export default function StooornaAiIcon({ active = false, onClick, size = 42 }: StooornaAiIconProps) {
  const glyph = Math.round(size * 0.62);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Stooorna Ai"
      title="Stooorna Ai"
      style={{
        width: size,
        height: size,
        borderRadius: 14, // semi-circular / rounded square
        border: active ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.9)',
        background: '#ffffff',
        color: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        boxShadow: active
          ? '0 0 12px rgba(239,68,68,0.45)'
          : '0 2px 8px rgba(0,0,0,0.35)',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}
    >
      {/* Stooorna Ai globe logo (black on white) */}
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
      >
        <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
        <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" />
        <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    </button>
  );
}
