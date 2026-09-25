import React, { useEffect, useState } from 'react';
import { getVipColor, isVip, resolveVipNameStyle, VIP_COLORS } from '@/lib/vipPatch';

export function VipBadge({ userId, compact }: { userId?: string | null; compact?: boolean }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('stooorna:vip', on);
    window.addEventListener('stooorna:vip-directory', on);
    return () => {
      window.removeEventListener('stooorna:vip', on);
      window.removeEventListener('stooorna:vip-directory', on);
    };
  }, []);
  if (!isVip(userId)) return null;
  return (
    <span
      title="VIP"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: compact ? '0.52rem' : '0.58rem',
        fontWeight: 900,
        color: '#111',
        background: 'linear-gradient(90deg,#fde68a,#eab308)',
        borderRadius: 5,
        padding: compact ? '1px 5px' : '2px 7px',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        boxShadow: '0 0 8px rgba(234,179,8,0.45)',
        verticalAlign: 'middle',
        flexShrink: 0,
        marginInlineStart: 4,
      }}
    >
      VIP
    </span>
  );
}

export function VipAvatarFrame({
  userId,
  children,
  size = 44,
}: {
  userId?: string | null;
  children: React.ReactNode;
  size?: number;
}) {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('stooorna:vip', on);
    window.addEventListener('stooorna:vip-directory', on);
    return () => {
      window.removeEventListener('stooorna:vip', on);
      window.removeEventListener('stooorna:vip-directory', on);
    };
  }, []);
  const vip = isVip(userId);
  const ringColor = vip ? VIP_COLORS[getVipColor(userId)] : '';
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: '50%',
        padding: vip ? 2 : 0,
        background: vip ? `linear-gradient(135deg, ${ringColor}cc, ${ringColor}, ${ringColor}e6)` : 'transparent',
        boxShadow: vip ? `0 0 10px ${ringColor}73` : 'none',
        width: size + (vip ? 4 : 0),
        height: size + (vip ? 4 : 0),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </span>
  );
}

export function VipName({
  userId,
  children,
  className,
  style,
}: {
  userId?: string | null;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={{ ...resolveVipNameStyle(userId), ...style }}>
      {children}
    </span>
  );
}
