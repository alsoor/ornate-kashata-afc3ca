/**
 * InAppNotification — WhatsApp-style toast that slides in from the top.
 * Used for incoming messages and incoming calls.
 *
 * Usage:
 *   <InAppNotification notifications={queue} onDismiss={id => dismiss(id)} />
 *
 * Each notification auto-dismisses after 4s.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, MessageCircle, X } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

export interface AppNotification {
  id: string;
  type: 'message' | 'call';
  senderName: string;
  senderAvatar?: string | null;
  preview: string;       // message text or "Incoming call"
  onTap?: () => void;    // navigate to chat / answer call
  onAnswer?: () => void; // call only
  onReject?: () => void; // call only
}

interface Props {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}

const T = {
  bg:     'rgba(6,14,14,0.97)',
  border: 'rgba(0,188,212,0.22)',
  text:   'rgba(200,230,230,0.92)',
  dim:    'rgba(150,200,200,0.5)',
  primary:'#00BCD4',
  green:  '#22c55e',
  red:    '#ef4444',
};

export default function InAppNotification({ notifications, onDismiss }: Props) {
  // Auto-dismiss after 4s
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const t = setTimeout(() => onDismiss(latest.id), 4000);
    return () => clearTimeout(t);
  }, [notifications, onDismiss]);

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ y: -80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0,   opacity: 1, scale: 1 }}
            exit={{   y: -80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{
              width: '100%', maxWidth: 400,
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 16,
              padding: '12px 14px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,188,212,0.08)',
              display: 'flex', alignItems: 'center', gap: 12,
              pointerEvents: 'auto',
              cursor: n.onTap ? 'pointer' : 'default',
            }}
            onClick={() => { n.onTap?.(); onDismiss(n.id); }}
          >
            {/* Icon / avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <UserAvatar name={n.senderName} avatarUrl={n.senderAvatar} size={40} />
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: n.type === 'call' ? T.green : T.primary,
                border: '2px solid rgba(6,14,14,0.95)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {n.type === 'call'
                  ? <Phone size={8} strokeWidth={2.5} color="white" />
                  : <MessageCircle size={8} strokeWidth={2.5} color="white" />
                }
              </div>
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: T.text, fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.2, marginBottom: 2 }}>
                {n.senderName}
              </p>
              <p style={{ color: T.dim, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                {n.preview}
              </p>
            </div>

            {/* Call actions */}
            {n.type === 'call' && n.onAnswer && n.onReject && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={(e) => { e.stopPropagation(); n.onReject!(); onDismiss(n.id); }}
                  style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: T.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={14} strokeWidth={2.5} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={(e) => { e.stopPropagation(); n.onAnswer!(); onDismiss(n.id); }}
                  style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.4)', color: T.green, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Phone size={14} strokeWidth={2.5} />
                </motion.button>
              </div>
            )}

            {/* Dismiss button (messages) */}
            {n.type === 'message' && (
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: T.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <X size={13} strokeWidth={2} />
              </motion.button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
