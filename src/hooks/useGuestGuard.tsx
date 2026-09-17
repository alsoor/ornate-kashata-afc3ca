/**
 * useGuestGuard — shows a sign-up modal when a guest tries to interact.
 * Usage:
 *   const { guard, GuestModal } = useGuestGuard(user);
 *   // in any handler:
 *   if (guard()) return;   // shows the modal and stops execution
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X, LogIn } from 'lucide-react';

export function useGuestGuard(user: { id: string } | null | undefined) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  /** Returns true if the visitor is not signed in (caller should stop execution) */
  const guard = useCallback((): boolean => {
    if (user) return false;
    setOpen(true);
    return true;
  }, [user]);

  const GuestModal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="guest-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'hsl(var(--background)/0.85)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <motion.div
            key="guest-modal-sheet"
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'hsl(var(--card))',
              borderRadius: '22px 22px 0 0',
              border: '1px solid hsl(var(--border))',
              padding: '28px 24px 40px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              position: 'relative',
            }}
          >
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              style={{
                position: 'absolute', top: 14, insetInlineEnd: 16,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'hsl(var(--muted-foreground))', padding: 4,
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Icon */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'hsl(var(--primary)/0.15)',
              border: '2px solid hsl(var(--primary)/0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'hsl(var(--primary))',
            }}>
              <UserPlus size={28} strokeWidth={2} />
            </div>

            {/* Text */}
            <div style={{ textAlign: 'center' }}>
              <p style={{
                color: 'hsl(var(--foreground))', fontWeight: 700,
                fontSize: '1.05rem', margin: '0 0 6px',
              }}>
                Join Stooorna
              </p>
              <p style={{
                color: 'hsl(var(--muted-foreground))',
                fontSize: '0.82rem', lineHeight: 1.6, margin: 0,
              }}>
                Create a free account to like posts,<br />
                follow people, and more.
              </p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setOpen(false); navigate('/settings'); }}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 14,
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  border: 'none', fontWeight: 700, fontSize: '0.9rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}
              >
                <UserPlus size={17} />
                Create account
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setOpen(false); navigate('/settings'); }}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 14,
                  background: 'transparent',
                  color: 'hsl(var(--primary))',
                  border: '1.5px solid hsl(var(--primary)/0.5)',
                  fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}
              >
                <LogIn size={16} />
                Sign in
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { guard, GuestModal };
}
