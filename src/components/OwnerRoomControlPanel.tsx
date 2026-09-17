/**
 * OwnerRoomControlPanel
 * لوحة تحكم المالك السريعة داخل الروم — مخصصة للـ Owner فقط
 *
 * تُفتح بضغطة زر "Control" في الشريط الجانبي للروم.
 * تحتوي على:
 *   👥 قائمة الأعضاء مع أزرار سريعة: منح/سحب أدمن، كتم، طرد، حظر
 *   🛡 قسم الأدمنز الحاليين مع زر سحب سريع
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, ShieldOff, Snowflake, Crown, Users, ChevronDown, Loader2 } from 'lucide-react';

// ── Theme ─────────────────────────────────────────────────────────────────────

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg:            'hsl(var(--background))',
  panel:         'hsl(var(--card))',
  primary:       'hsl(var(--primary))',
  primaryDim:    'rgba(0,188,212,0.35)',
  primaryBorder: 'rgba(0,188,212,0.22)',
  primaryFaint:  'rgba(0,188,212,0.08)',
  text:          'hsl(var(--foreground))',
  textDim:       'hsl(var(--muted-foreground))',
  red:           'hsl(var(--destructive))',
  redFaint:      'hsl(var(--destructive) / 0.12)',
  redBorder:     'hsl(var(--destructive) / 0.3)',
  green:         '#22c55e',
  navBorder:     'rgba(0,188,212,0.12)',
  owner:         'hsl(var(--secondary))',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoomMember {
  userId:    string;
  name:      string | null;
  username:  string | null;
  avatarUrl: string | null;
  isRoomAdmin?: boolean;
}

interface Props {
  open:         boolean;
  onClose:      () => void;
  members:      RoomMember[];
  roomAdmins:   string[];   // userIds currently granted admin
  frozenUsers:  string[];
  floorUserId:  string | null;
  ownerUserId:  string;
  onGrantAdmin: (userId: string) => Promise<void>;
  onRevokeAdmin:(userId: string) => Promise<void>;
  onFreeze:     (userId: string) => Promise<void>;
  onUnfreeze:   (userId: string) => Promise<void>;
  onKick:       (userId: string) => Promise<void>;
  onBan:        (userId: string) => Promise<void>;
}

// ── Mini avatar ───────────────────────────────────────────────────────────────
function MiniAvatar({ name, avatarUrl, size = 36 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: T.primary, fontSize: size * 0.32, fontWeight: 700 }}>{initials}</span>
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({
  icon, label, color, faint, border, onClick, loading,
}: {
  icon: React.ReactNode; label: string;
  color: string; faint: string; border: string;
  onClick: () => void; loading?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '7px 10px', borderRadius: 10,
        background: faint, border: `1px solid ${border}`,
        cursor: loading ? 'wait' : 'pointer', outline: 'none',
        minWidth: 52, transition: 'all 0.15s',
        opacity: loading ? 0.6 : 1,
      }}>
      {loading
        ? <Loader2 size={16} color={color} style={{ animation: 'spin 1s linear infinite' }} />
        : <span style={{ color }}>{icon}</span>
      }
      <span style={{ color, fontSize: '0.52rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
    </motion.button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OwnerRoomControlPanel({
  open, onClose, members, roomAdmins, frozenUsers, floorUserId,
  ownerUserId, onGrantAdmin, onRevokeAdmin, onFreeze, onUnfreeze, onKick, onBan,
}: Props) {
  const [loadingMap, setLoadingMap] = useState<Record<string, string>>({});
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  async function run(userId: string, action: string, fn: () => Promise<void>) {
    setLoadingMap(m => ({ ...m, [userId]: action }));
    try { await fn(); } finally { setLoadingMap(m => { const n = { ...m }; delete n[userId]; return n; }); }
  }

  // Separate owner from others
  const nonOwnerMembers = members.filter(m => m.userId !== ownerUserId);
  const adminMembers    = nonOwnerMembers.filter(m => roomAdmins.includes(m.userId));
  const regularMembers  = nonOwnerMembers.filter(m => !roomAdmins.includes(m.userId));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="owner-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'hsl(var(--background) / 0.6)',
            backdropFilter: 'blur(6px)',
            zIndex: 320,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
          <motion.div
            initial={{ y: 160, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 160, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: T.panel,
              borderRadius: '22px 22px 0 0',
              border: `1px solid ${T.primaryBorder}`,
              borderBottom: 'none',
              display: 'flex', flexDirection: 'column',
              maxHeight: '82dvh',
              overflow: 'hidden',
            }}>

            {/* ── Header ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 18px 14px',
              borderBottom: `1px solid ${T.navBorder}`,
              flexShrink: 0,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'hsl(var(--secondary) / 0.15)',
                border: `1.5px solid hsl(var(--secondary) / 0.4)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Crown size={15} strokeWidth={2} color={T.owner} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: T.owner, fontSize: '0.88rem', fontWeight: 800, margin: 0, letterSpacing: '0.02em' }}>
                  لوحة تحكم المالك
                </p>
                <p style={{ color: T.textDim, fontSize: '0.6rem', margin: '2px 0 0' }}>
                  {nonOwnerMembers.length} عضو · {adminMembers.length} أدمن
                </p>
              </div>
              <motion.button whileTap={{ scale: 0.88 }} onClick={onClose}
                style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={18} />
              </motion.button>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>

              {/* ── Current Admins section ── */}
              {adminMembers.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <ShieldCheck size={12} strokeWidth={2} color={T.primary} />
                    <span style={{ color: T.primary, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      الأدمنز الحاليون
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {adminMembers.map(m => {
                      const label = m.name ?? m.username ?? 'User';
                      const isFloor = m.userId === floorUserId;
                      const loading = loadingMap[m.userId];
                      return (
                        <div key={m.userId} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 12px', borderRadius: 12,
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                        }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <MiniAvatar name={label} avatarUrl={m.avatarUrl} size={36} />
                            {isFloor && (
                              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
                                style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: T.red, border: '2px solid hsl(var(--card))' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: T.text, fontSize: '0.8rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
                            <p style={{ color: T.primary, fontSize: '0.58rem', margin: '2px 0 0', fontWeight: 600 }}>أدمن نشط</p>
                          </div>
                          {/* Revoke admin */}
                          <motion.button whileTap={{ scale: 0.88 }}
                            onClick={() => run(m.userId, 'revoke', () => onRevokeAdmin(m.userId))}
                            disabled={!!loading}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '5px 10px', borderRadius: 8,
                              background: T.redFaint, border: `1px solid ${T.redBorder}`,
                              cursor: loading ? 'wait' : 'pointer', outline: 'none',
                              opacity: loading ? 0.6 : 1,
                            }}>
                            {loading === 'revoke'
                              ? <Loader2 size={13} color={T.red} style={{ animation: 'spin 1s linear infinite' }} />
                              : <ShieldOff size={13} strokeWidth={2} color={T.red} />
                            }
                            <span style={{ color: T.red, fontSize: '0.6rem', fontWeight: 700 }}>سحب</span>
                          </motion.button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Divider ── */}
              {adminMembers.length > 0 && regularMembers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1, height: 1, background: T.navBorder }} />
                  <span style={{ color: T.textDim, fontSize: '0.56rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    الأعضاء
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.navBorder }} />
                </div>
              )}

              {/* ── Regular members ── */}
              {regularMembers.length === 0 && adminMembers.length === 0 && (
                <p style={{ color: T.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
                  لا يوجد أعضاء في الروم حالياً
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {regularMembers.map(m => {
                  const label    = m.name ?? m.username ?? 'User';
                  const isFloor  = m.userId === floorUserId;
                  const isFrozen = frozenUsers.includes(m.userId);
                  const isGuest  = m.userId.startsWith('guest-');
                  const loading  = loadingMap[m.userId];
                  const expanded = expandedId === m.userId;

                  return (
                    <div key={m.userId} style={{
                      borderRadius: 12,
                      background: isFrozen ? 'rgba(100,149,237,0.07)' : 'hsl(var(--muted) / 0.3)',
                      border: `1px solid ${isFrozen ? 'rgba(100,149,237,0.25)' : T.navBorder}`,
                      overflow: 'hidden',
                      transition: 'all 0.15s',
                    }}>
                      {/* Member row */}
                      <div
                        onClick={() => !isGuest && setExpandedId(expanded ? null : m.userId)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 12px',
                          cursor: isGuest ? 'default' : 'pointer',
                        }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <MiniAvatar name={isGuest ? 'Listener' : label} avatarUrl={isGuest ? null : m.avatarUrl} size={36} />
                          {isFloor && (
                            <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
                              style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: T.red, border: '2px solid hsl(var(--card))' }} />
                          )}
                          {isFrozen && !isFloor && (
                            <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: 'hsl(var(--primary))', border: '2px solid hsl(var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Snowflake size={6} color="hsl(var(--primary-foreground))" />
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: T.text, fontSize: '0.8rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isGuest ? 'Listener' : label}
                          </p>
                          <p style={{ color: isFrozen ? 'hsl(var(--primary))' : isFloor ? T.red : T.textDim, fontSize: '0.58rem', margin: '2px 0 0' }}>
                            {isGuest ? 'Listener Only' : isFrozen ? 'Frozen' : isFloor ? 'Speaking Now' : 'Member'}
                          </p>
                        </div>
                        {!isGuest && (
                          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown size={14} color={T.textDim} />
                          </motion.div>
                        )}
                      </div>

                      {/* Expanded actions */}
                      <AnimatePresence>
                        {expanded && !isGuest && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ overflow: 'hidden' }}>
                            <div style={{
                              display: 'flex', flexWrap: 'wrap', gap: 6,
                              padding: '0 12px 12px',
                              borderTop: `1px solid ${T.navBorder}`,
                              paddingTop: 10,
                            }}>
                              {/* Grant Admin */}
                              <ActionBtn
                                icon={<ShieldCheck size={15} strokeWidth={2} />}
                                label="منح أدمن"
                                color={T.primary} faint={T.primaryFaint} border={T.primaryBorder}
                                loading={loading === 'grant'}
                                onClick={() => { run(m.userId, 'grant', () => onGrantAdmin(m.userId)); setExpandedId(null); }}
                              />
                              {/* Freeze / Unfreeze */}
                              {isFrozen ? (
                                <ActionBtn
                                  icon={<Snowflake size={15} strokeWidth={2} />}
                                  label="إلغاء تجميد"
                                  color="hsl(var(--primary))" faint={T.primaryFaint} border={T.primaryBorder}
                                  loading={loading === 'unfreeze'}
                                  onClick={() => run(m.userId, 'unfreeze', () => onUnfreeze(m.userId))}
                                />
                              ) : (
                                <ActionBtn
                                  icon={<Snowflake size={15} strokeWidth={2} />}
                                  label="تجميد"
                                  color="hsl(var(--primary))" faint={T.primaryFaint} border={T.primaryBorder}
                                  loading={loading === 'freeze'}
                                  onClick={() => run(m.userId, 'freeze', () => onFreeze(m.userId))}
                                />
                              )}
                              
                              {/* Ban */}
                              <ActionBtn
                                icon={<Users size={15} strokeWidth={2} />}
                                label="حظر"
                                color={T.red} faint={T.redFaint} border={T.redBorder}
                                loading={loading === 'ban'}
                                onClick={() => { run(m.userId, 'ban', () => onBan(m.userId)); setExpandedId(null); }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
