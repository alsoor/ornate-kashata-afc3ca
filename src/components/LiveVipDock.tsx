import React, { useEffect } from 'react';
import {
  getVipMaxSpeakers,
  isVip,
} from '@/lib/vipPatch';

/**
 * LiveVipDock — يضبط سقف المايكات لـ VIP فقط.
 * أيقونة/مشغّل الموسيقى أُزيلت من بث الحسابات (صوتي + مرئي).
 */
export function LiveVipDock({
  hostId,
  currentUserId,
}: {
  hostId?: string | null;
  currentUserId?: string | null;
}) {
  const vipHost = isVip(hostId);
  const cap = getVipMaxSpeakers(hostId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).getVipMaxSpeakers = getVipMaxSpeakers;
    (window as any).__stooornaVipMicCap = cap;
    window.dispatchEvent(new CustomEvent('stooorna:vip-mic-cap', { detail: { hostId, cap } }));
  }, [hostId, cap]);

  // لا واجهة مرئية — الموسيقى أُزيلت من البث الصوتي والمرئي لبث الحسابات
  void currentUserId;
  void vipHost;
  return null;
}

export default LiveVipDock;
