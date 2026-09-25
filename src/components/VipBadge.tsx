import React from 'react';
import { isVip, getVipColor, VIP_COLORS, type VipColor } from '@/lib/vipPatch';

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
  if (!force && !isVip(userId)) return null;
  const color: VipColor = getVipColor(userId);
  const accent = VIP_COLORS[color] || VIP_COLORS.gold;
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

/** Animated gold ring + VIP tab on top of an avatar. */
export function VipAvatarFrame({
  userId,
  size = 80,
  children,
}: {
  userId?: string | null;
  size?: number;
  children: React.ReactNode;
}) {
  const active = isVip(userId);
  const color = VIP_COLORS[getVipColor(userId)] || VIP_COLORS.gold;
  if (!active) {
    return <div style={{ position: 'relative', width: size, height: size }}>{children}</div>;
  }
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <style>{`
        @keyframes stooornaVipGlow {
          0%, 100% { box-shadow: 0 0 0 2px ${color}, 0 0 10px ${color}cc, 0 0 18px ${color}66; }
          50% { box-shadow: 0 0 0 3px ${color}, 0 0 18px ${color}, 0 0 28px ${color}aa; }
        }
        @keyframes stooornaVipSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -4,
          borderRadius: '50%',
          background: `conic-gradient(from 0deg, transparent 0deg, ${color} 80deg, #fff3c4 140deg, ${color} 200deg, transparent 280deg)`,
          animation: 'stooornaVipSpin 3.6s linear infinite',
          opacity: 0.95,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          animation: 'stooornaVipGlow 1.8s ease-in-out infinite',
          zIndex: 1,
        }}
      >
        {children}
      </div>
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          background: color,
          color: '#111',
          fontSize: size >= 70 ? 9 : 8,
          fontWeight: 900,
          borderRadius: 6,
          padding: '1px 7px',
          zIndex: 3,
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
