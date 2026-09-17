/**
 * UserAvatar — shows a photo if available, otherwise initials.
 * Supports online/offline presence dot (green = online, red = offline).
 *
 * Listens for 'stooorna:avatar-updated' events so the avatar refreshes
 * immediately after the current user uploads a new photo — no page reload needed.
 */
import { useState, useEffect } from 'react';
import { useSession } from '@/lib/auth/auth-client';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  /** If true, this avatar belongs to the current logged-in user (auto-refreshes on upload) */
  isSelf?: boolean;
  size?: number;
  red?: boolean;
  /** Owner highlight — full blue border + glow */
  blue?: boolean;
  /** undefined = no dot shown; true = green online dot; false = red offline dot */
  online?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

const PRIMARY        = '#00BCD4';
const PRIMARY_BORDER = 'rgba(0,188,212,0.35)';
const RED            = '#ef4444';
const BLUE           = '#2563eb';
const BLUE_GLOW      = 'rgba(37,99,235,0.55)';

export default function UserAvatar({ name, avatarUrl, isSelf = false, size = 38, red = false, blue = false, online, style, className }: UserAvatarProps) {
  const { user } = useSession();
  const [imgError, setImgError] = useState(false);

  // أحدث URL للصورة — يُحدَّث عبر event أو fetch
  const [selfUrl, setSelfUrl] = useState<string | null>(null);

  // عند أول تحميل: اجلب صورة المستخدم الحالي من /api/users/me إذا لم تكن في الـ session
  useEffect(() => {
    if (!isSelf) return;
    // جرّب الـ session أولاً
    const sessionAvatar =
      (user as { avatarUrl?: string | null } | undefined)?.avatarUrl ??
      (user as { image?: string | null } | undefined)?.image ??
      null;
    if (sessionAvatar) {
      setSelfUrl(sessionAvatar);
      return;
    }
    // fallback: اجلب من API
    fetch('/api/users/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const url = d?.avatarUrl ?? d?.image ?? null;
        if (url) setSelfUrl(url);
      })
      .catch(() => {});
  }, [isSelf, user]);

  // استمع لـ event رفع الصورة (يُطلَق من settings.tsx بعد نجاح الرفع)
  useEffect(() => {
    if (!isSelf) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ avatarUrl: string }>).detail;
      if (detail?.avatarUrl) {
        setSelfUrl(detail.avatarUrl);
        setImgError(false);
      }
    };
    window.addEventListener('stooorna:avatar-updated', handler);
    return () => window.removeEventListener('stooorna:avatar-updated', handler);
  }, [isSelf]);

  // حدد الـ URL النهائي
  const resolvedUrl = isSelf
    ? (selfUrl ?? avatarUrl ?? null)
    : (avatarUrl ?? null);

  const showImg = !!resolvedUrl && !imgError;
  const initials = (name ?? '??').slice(0, 2).toUpperCase();

  // Dot size scales with avatar size
  const dotSize = Math.max(8, Math.round(size * 0.26));
  const dotOffset = Math.round(dotSize * 0.1);

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: blue
      ? `2.5px solid ${BLUE}`
      : `${red ? '2.5px' : '1.5px'} solid ${red ? RED : PRIMARY_BORDER}`,
    boxShadow: blue
      ? `0 0 0 1px rgba(37,99,235,0.25), 0 0 14px ${BLUE_GLOW}`
      : red
        ? `0 0 0 1px rgba(239,68,68,0.25), 0 0 12px rgba(239,68,68,0.3)`
        : 'none',
    background: showImg
      ? 'transparent'
      : 'radial-gradient(circle, rgba(0,188,212,0.12) 0%, rgba(0,188,212,0.03) 100%)',
    ...style,
  };

  // Wrapper needed only when we show the presence dot
  if (online !== undefined) {
    return (
      <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }} className={className}>
        <div style={base}>
          {showImg ? (
            <img
              src={resolvedUrl!}
              alt={initials}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            <span style={{
              color: PRIMARY,
              fontSize: size < 32 ? '0.6rem' : '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              lineHeight: 1,
              userSelect: 'none',
            }}>
              {initials}
            </span>
          )}
        </div>
        {/* Presence dot — bottom-right */}
        <span style={{
          position: 'absolute',
          bottom: dotOffset,
          right: dotOffset,
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: online ? '#22c55e' : '#ef4444',
          border: '2px solid #060e0e',
          boxShadow: online
            ? '0 0 6px rgba(34,197,94,0.7)'
            : '0 0 6px rgba(239,68,68,0.5)',
          zIndex: 2,
        }} />
      </div>
    );
  }

  // No dot — original layout (no extra wrapper div)
  return (
    <div style={base} className={className}>
      {showImg ? (
        <img
          src={resolvedUrl!}
          alt={initials}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      ) : (
        <span style={{
          color: PRIMARY,
          fontSize: size < 32 ? '0.6rem' : '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {initials}
        </span>
      )}
    </div>
  );
}
