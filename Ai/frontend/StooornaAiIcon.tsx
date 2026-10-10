import React from 'react';

interface StooornaAiIconProps {
  active?: boolean;
  onClick: () => void;
  size?: number;
}

/**
 * Bottom-bar icon for Stooorna Ai.
 * Dark green-black rounded square with white "S" in the center.
 * Place this between LIVE and Templates in the bottom navigation.
 */
export default function StooornaAiIcon({ active = false, onClick, size = 42 }: StooornaAiIconProps) {
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
        border: active ? '1.5px solid #ef4444' : '1px solid rgba(0,255,140,0.25)',
        background: active
          ? 'linear-gradient(135deg, #0f2a22 0%, #04120f 100%)'
          : 'linear-gradient(135deg, #0a1f1a 0%, #04120f 100%)',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: Math.round(size * 0.45),
        fontFamily: 'system-ui, -apple-system, sans-serif',
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
      S
    </button>
  );
}
