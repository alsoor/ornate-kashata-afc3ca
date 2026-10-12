import React, { useRef } from 'react';

interface StooornaAiIconProps {
  active?: boolean;
  onClick: () => void;
  /** Long-press (≈450ms) — opens the shortcuts menu. A normal tap still calls onClick. */
  onLongPress?: (el: HTMLElement) => void;
  size?: number;
}

/**
 * Bottom-bar icon for Stooorna Ai.
 * White circle with the black Stooorna globe logo inside.
 * The globe rotates slowly (clockwise); a ring around it rotates even more slowly the opposite way (counter-clockwise).
 * Place this between LIVE and Templates in the bottom navigation.
 */
export default function StooornaAiIcon({ active = false, onClick, onLongPress, size = 42 }: StooornaAiIconProps) {
  const press = useRef({ timer: 0, fired: false });
  const endPress = () => { if (press.current.timer) { window.clearTimeout(press.current.timer); press.current.timer = 0; } };
  const glyph = Math.round(size * 0.74); // globe size

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (!onLongPress) return;
        const el = e.currentTarget;
        press.current.fired = false;
        endPress();
        press.current.timer = window.setTimeout(() => {
          press.current.timer = 0;
          press.current.fired = true;
          try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* */ }
          onLongPress(el);
        }, 450);
      }}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (press.current.fired) { press.current.fired = false; return; } onClick(); }}
      aria-label="Stooorna Ai"
      title="Stooorna Ai"
      style={{
        width: size,
        height: size,
        borderRadius: '50%', // circle
        position: 'relative',
        border: active ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.9)',
        background: '#ffffff',
        color: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        boxShadow: active
          ? '0 0 12px rgba(239,68,68,0.45)'
          : '0 2px 8px rgba(0,0,0,0.35)',
        transition: 'all 0.2s ease',
        flexShrink: 0,
        touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* Frame ring — slow rotation, opposite direction to the globe */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 2,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, #000 0deg 70deg, transparent 70deg 180deg, #000 180deg 250deg, transparent 250deg 360deg)',
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
          animation: 'stooornaAiIconRing 14s linear infinite',
          pointerEvents: 'none',
        }}
      />

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
        style={{ animation: 'stooornaAiIconGlobe 9s linear infinite', transformOrigin: '50% 50%', position: 'relative' }}
      >
        <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
        <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" />
        <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
        <circle cx="12" cy="12" r="10" />
      </svg>

      <style>{`
        @keyframes stooornaAiIconGlobe {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes stooornaAiIconRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Stooorna Ai"] svg, [aria-label="Stooorna Ai"] span { animation: none !important; }
        }
      `}</style>
    </button>
  );
}
