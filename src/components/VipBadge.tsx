import React from 'react';
import { isVip, getVipColor, VIP_COLORS } from '@/lib/vipPatch';

/**
 * Shared VIP read for VipBadge + VipAvatarFrame. isVip()/getVipColor() are plain
 * synchronous reads with no reactivity, so a component that mounts before the VIP
 * directory finishes hydrating was stuck on a stale/default color forever (until an
 * unrelated re-render happened to run it again) while another instance on the same
 * page that mounted later showed the real color — this is what looked like the color
 * "changing suddenly" or two colors mixing on the same profile/post. Re-reading on the
 * 'stooorna:vip' and 'stooorna:vip-directory' events keeps every instance in sync.
 */
function useVipVisualState(userId?: string | null): { active: boolean; color: string } {
  const [state, setState] = React.useState(() => ({
    active: isVip(userId),
    color: VIP_COLORS[getVipColor(userId)] || VIP_COLORS.gold,
  }));

  React.useEffect(() => {
    const recompute = () => {
      setState({
        active: isVip(userId),
        color: VIP_COLORS[getVipColor(userId)] || VIP_COLORS.gold,
      });
    };
    recompute();
    window.addEventListener('stooorna:vip', recompute);
    window.addEventListener('stooorna:vip-directory', recompute);
    return () => {
      window.removeEventListener('stooorna:vip', recompute);
      window.removeEventListener('stooorna:vip-directory', recompute);
    };
  }, [userId]);

  return state;
}

/** Small VIP chip next to @username. Visible to every viewer when the account is VIP. */
export function VipBadge({
  userId,
  compact,
  force,
}: {
  userId?: string | null;
  compact?: boolean;
  force?: boolean;
}) {
  const { active, color: accent } = useVipVisualState(userId);
  if (!force && !active) return null;
  return (
    <span
      title="VIP"
      data-vip-badge="1"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: compact ? '0.5rem' : '0.56rem',
        fontWeight: 900,
        color: '#111',
        background: accent,
        borderRadius: 5,
        padding: compact ? '1px 5px' : '2px 6px',
        letterSpacing: '0.06em',
        lineHeight: 1.2,
        boxShadow: `0 0 8px ${accent}99`,
        verticalAlign: 'middle',
        flexShrink: 0,
        marginInlineStart: 4,
      }}
    >
      VIP
    </span>
  );
}

/** Ring thickness added around the avatar's own edges only — the avatar itself never resizes. */
const VIP_RING_WIDTH = 3;
/** Fixed outline color for the ring itself — independent of the account's VIP tag color. */
const VIP_RING_COLOR = '#ef4444';

/**
 * Fixed-color ring + VIP tab on top of an avatar, with a silver shine that sweeps
 * around the ring only. The ring itself is static (no flashing, no color rotation).
 * Pass `live` only for the account's own Voice Live / Video Live broadcast frame to
 * bring back the pulsing glow there — everywhere else the frame stays calm.
 */
export function VipAvatarFrame({
  userId,
  size = 80,
  live = false,
  children,
}: {
  userId?: string | null;
  size?: number;
  live?: boolean;
  children: React.ReactNode;
}) {
  const { active, color } = useVipVisualState(userId);
  if (!active) {
    return <div style={{ position: 'relative', width: size, height: size }}>{children}</div>;
  }
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%' }}>
      <style>{`
        @keyframes stooornaVipShineSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes stooornaVipLiveGlow {
          0%, 100% { box-shadow: 0 0 0 2px ${color}, 0 0 10px ${color}cc, 0 0 18px ${color}66; }
          50% { box-shadow: 0 0 0 3px ${color}, 0 0 18px ${color}, 0 0 28px ${color}aa; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          zIndex: 1,
          ...(live ? { animation: 'stooornaVipLiveGlow 1.8s ease-in-out infinite' } : null),
        }}
      >
        {children}
      </div>
      {/*
        Static ring — drawn as an inward border sized exactly to this box (inset: 0,
        box-sizing: border-box) instead of bulging outward past the box with a negative
        inset. A negative inset made the ring extend beyond the width/height the caller
        declared, so any wrapper sized to match `size` with overflow hidden (used all
        over the app for round avatar buttons) clipped most of the ring away, leaving the
        partial/cut-looking arc seen in the app. Keeping the ring fully inside the box
        guarantees a complete, evenly round ring everywhere the frame is used, whether or
        not the parent clips overflow.
      */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: `${VIP_RING_WIDTH}px solid ${VIP_RING_COLOR}`,
          boxShadow: `0 0 8px ${VIP_RING_COLOR}99`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* Silver shine sweeping around the ring only — masked down to the ring's own band
          so it never fills the avatar's face and the ring's base color never changes. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0deg, transparent 266deg, rgba(255,255,255,0.95) 292deg, rgba(255,255,255,0.95) 308deg, transparent 334deg, transparent 360deg)',
          WebkitMask: `radial-gradient(circle, transparent calc(50% - ${VIP_RING_WIDTH}px), #000 calc(50% - ${VIP_RING_WIDTH}px))`,
          mask: `radial-gradient(circle, transparent calc(50% - ${VIP_RING_WIDTH}px), #000 calc(50% - ${VIP_RING_WIDTH}px))`,
          animation: 'stooornaVipShineSpin 3.2s linear infinite',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: -VIP_RING_WIDTH - 4,
          left: '50%',
          transform: 'translateX(-50%)',
          background: color,
          color: '#111',
          fontSize: size >= 70 ? 9 : 8,
          fontWeight: 900,
          borderRadius: 6,
          padding: '1px 7px',
          zIndex: 4,
          letterSpacing: '0.06em',
          boxShadow: `0 2px 8px ${color}99`,
        }}
      >
        VIP
      </span>
    </div>
  );
}

export default VipBadge;
