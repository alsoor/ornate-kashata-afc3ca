/**
 * CallNotificationBanner
 *
 * Heads-up banner for incoming calls — slides in from the top.
 * Supports two modes:
 *   • private    → "Accept" (green) + "Decline" (red)
 *   • conference → "Join"   (green) + "Ignore"  (red)
 *
 * Plays a standard dual-tone ringtone via Web Audio API.
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Users } from 'lucide-react';

interface Props {
  visible:         boolean;
  callerName:      string;
  callerUsername?: string;
  callerAvatar:    string | null;
  isConference?:   boolean;
  callType?:       'voice' | 'video';
  onAccept:        () => void;
  onDecline:       () => void;
}

// ── Dual-tone ringtone (400 Hz + 450 Hz) ─────────────────────────────────────
function useRingtone(active: boolean) {
  const ctxRef   = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const playRing = () => {
      try {
        if (!ctxRef.current || ctxRef.current.state === 'closed') {
          ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx  = ctxRef.current;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine'; osc1.frequency.value = 400;
        osc2.type = 'sine'; osc2.frequency.value = 450;

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 1.8);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);

        osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
        osc1.start(); osc2.start();
        osc1.stop(ctx.currentTime + 2.1); osc2.stop(ctx.currentTime + 2.1);
      } catch { /* AudioContext blocked */ }
    };

    playRing();
    timerRef.current = setInterval(playRing, 4000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [active]);
}

export default function CallNotificationBanner({
  visible, callerName, callerUsername, callerAvatar, isConference = false, callType = 'voice',
  onAccept, onDecline,
}: Props) {
  const displayName = callerName || callerUsername || 'User';
  useRingtone(visible);

  const acceptLabel  = isConference ? 'Join'   : 'Accept';
  const declineLabel = isConference ? 'Ignore' : 'Decline';
  const callLabel    = isConference ? 'Conference call' : (callType === 'video' ? 'Incoming video call' : 'Incoming voice call');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -130, opacity: 0, scale: 0.96 }}
          animate={{ y: 0,    opacity: 1, scale: 1    }}
          exit={{   y: -110,  opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          style={{
            position: 'fixed',
            top: 'env(safe-area-inset-top, 16px)',
            left: 14, right: 14,
            zIndex: 10000,
            display: 'flex', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'hsl(var(--card))',
            borderRadius: 28,
            padding: '14px 18px 16px',
            width: '100%',
            maxWidth: 480,
            boxShadow: 'var(--call-popup-shadow)',
            border: '1px solid hsl(var(--border))',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>

            {/* ── Top label row ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {isConference ? (
                <div style={{
                  background: 'hsl(var(--secondary))',
                  borderRadius: 5, padding: '2px 6px',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Users size={10} color="hsl(var(--secondary-foreground))" strokeWidth={2.5} />
                  <span style={{ color: 'hsl(var(--secondary-foreground))', fontSize: '0.6rem', fontWeight: 800 }}>CONF</span>
                </div>
              ) : (
                <div style={{
                  background: 'hsl(var(--foreground))',
                  borderRadius: 5, padding: '2px 6px',
                }}>
                  <span style={{ color: 'hsl(var(--background))', fontSize: '0.6rem', fontWeight: 900 }}>HD+</span>
                </div>
              )}
              <span style={{ color: 'hsl(var(--foreground))', fontSize: '0.95rem', fontWeight: 600 }}>
                {callLabel}
              </span>
            </div>

            {/* ── Middle row: name + avatar ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <h2 style={{ color: 'hsl(var(--foreground))', margin: 0, fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }}>
                  {displayName}
                </h2>
                <p style={{ color: 'hsl(var(--muted-foreground))', margin: 0, fontSize: '0.88rem', fontWeight: 500 }}>
                  @{callerUsername || 'stooorna'}
                </p>
              </div>

              <div style={{
                width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))',
              }}>
                {callerAvatar ? (
                  <img src={callerAvatar} alt={displayName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.8rem', fontWeight: 800,
                    color: 'hsl(var(--primary))',
                  }}>
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'flex-end', gap: 14, marginTop: 2,
            }}>
              {/* Accept / Join */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  animate={{ scale: [1, 1.07, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  onClick={onAccept}
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'hsl(var(--success))',
                    border: '2px solid hsl(var(--success) / 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: 'var(--call-green-glow) 0 6px 18px',
                  }}
                >
                  <Phone size={26} color="hsl(var(--success-foreground))" strokeWidth={2} />
                </motion.button>
                <span style={{ color: 'hsl(var(--success))', fontSize: '0.68rem', fontWeight: 700 }}>
                  {acceptLabel}
                </span>
              </div>

              {/* Decline / Ignore */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={onDecline}
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'hsl(var(--destructive))',
                    border: '2px solid hsl(var(--destructive) / 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 6px 18px hsl(var(--destructive) / 0.35)',
                  }}
                >
                  <PhoneOff size={26} color="hsl(var(--destructive-foreground))" strokeWidth={2} />
                </motion.button>
                <span style={{ color: 'hsl(var(--destructive))', fontSize: '0.68rem', fontWeight: 700 }}>
                  {declineLabel}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}