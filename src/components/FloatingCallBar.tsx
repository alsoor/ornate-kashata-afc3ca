/**
 * FloatingCallBar
 *
 * Persistent floating pill shown when a call is active and the user
 * navigates away from the call screen.
 *
 * Features:
 *   • Caller name + avatar
 *   • Real-time audio waveform animation (active speaker indicator)
 *   • Elapsed call timer
 *   • Tap → returns to full CallScreen
 *   • X button → ends the call immediately
 *
 * Lives inside GlobalCallProvider, rendered above all pages.
 */
import { motion, AnimatePresence } from 'motion/react';
import { PhoneOff, Phone } from 'lucide-react';

interface Props {
  visible:      boolean;
  peerName:     string;
  peerAvatar:   string | null;
  isConference: boolean;
  elapsed:      number;          // seconds since call connected
  speaking:     boolean;         // true when remote peer is speaking
  onTap:        () => void;      // expand back to full CallScreen
  onEnd:        () => void;      // hang up immediately
}

// ── Animated waveform bars ────────────────────────────────────────────────────
function WaveformBars({ active }: { active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 18 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <motion.div
          key={i}
          animate={active
            ? { scaleY: [0.3, 1, 0.5, 0.9, 0.3] }
            : { scaleY: 0.25 }
          }
          transition={active
            ? { duration: 0.65, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' as const }
            : { duration: 0.3 }
          }
          style={{
            width: 3,
            height: 16,
            borderRadius: 2,
            background: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            transformOrigin: 'center',
            transition: 'background 0.3s',
          }}
        />
      ))}
    </div>
  );
}

// ── Timer formatter ───────────────────────────────────────────────────────────
function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FloatingCallBar({
  visible, peerName, peerAvatar, isConference, elapsed, speaking, onTap, onEnd,
}: Props) {
  const displayName = peerName || 'Call';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="floating-call-bar"
          initial={{ y: 80, opacity: 0, scale: 0.92 }}
          animate={{ y: 0,  opacity: 1, scale: 1    }}
          exit={{   y: 80,  opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          style={{
            position: 'fixed',
            bottom: 'max(env(safe-area-inset-bottom, 0px), 80px)',
            left: 14, right: 14,
            zIndex: 9990,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            onClick={onTap}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--primary) / 0.3)',
              borderRadius: 50,
              padding: '8px 10px 8px 12px',
              width: '100%',
              maxWidth: 420,
              boxShadow: '0 8px 32px hsl(var(--background) / 0.8), 0 0 0 1px hsl(var(--primary) / 0.12)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              userSelect: 'none',
            }}
          >
            {/* ── Avatar ── */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              background: 'hsl(var(--muted))',
              border: speaking
                ? '2px solid hsl(var(--primary))'
                : '2px solid hsl(var(--border))',
              transition: 'border-color 0.3s',
              boxShadow: speaking ? '0 0 10px hsl(var(--primary) / 0.5)' : 'none',
            }}>
              {peerAvatar ? (
                <img src={peerAvatar} alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', fontWeight: 800,
                  color: 'hsl(var(--primary))',
                }}>
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* ── Name + status ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{
                color: 'hsl(var(--foreground))',
                fontSize: '0.82rem', fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {isConference ? `Conference · ${displayName}` : displayName}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Green pulsing dot */}
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'hsl(var(--success))',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.68rem', fontWeight: 500 }}>
                  {fmt(elapsed)}
                </span>
              </div>
            </div>

            {/* ── Waveform ── */}
            <WaveformBars active={speaking} />

            {/* ── Return to call button ── */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => { e.stopPropagation(); onTap(); }}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'hsl(var(--success))',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                boxShadow: '0 4px 12px hsl(var(--success) / 0.4)',
              }}
            >
              <Phone size={16} color="hsl(var(--success-foreground))" strokeWidth={2} />
            </motion.button>

            {/* ── End call X button ── */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => { e.stopPropagation(); onEnd(); }}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'hsl(var(--destructive))',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                boxShadow: '0 4px 12px hsl(var(--destructive) / 0.4)',
              }}
            >
              <PhoneOff size={16} color="hsl(var(--destructive-foreground))" strokeWidth={2} />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
