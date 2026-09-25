import React from 'react';
import { isVip, getVipColor, VIP_COLORS, type VipColor } from '@/lib/vipPatch';

/** Small gold VIP chip next to @username — visible to every viewer when the account is VIP. */
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

export default VipBadge;
