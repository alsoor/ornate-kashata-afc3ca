/**
 * LiveVoiceBanner — إشعار بث صوتي مباشر
 *
 * يظهر من الأعلى (slide-down) عندما يبدأ أحد في المحادثة البث الصوتي.
 * يشتغل الصوت تلقائياً عبر Agora RTC ويختفي فور انتهاء المتحدث.
 *
 * إشارات WS المستمع إليها (عبر CustomEvent 'call-signal'):
 *   { type: 'voice_start', channel, from, fromName, fromAvatar, chatId }
 *   { type: 'voice_end',   from, chatId }
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

interface Speaker {
  userId:    string;
  name:      string;
  avatarUrl: string;
  channel:   string;
}

interface Props {
  /** dm:{a}:{b} أو grp:{groupId} */
  chatId: string;
  myId:   string;
}

export default function LiveVoiceBanner({ chatId, myId }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const clientRef  = useRef<IAgoraRTCClient | null>(null);
  const joinedRef  = useRef<string | null>(null);

  /* ── انضم للـ channel لسماع الصوت ── */
  const joinChannel = useCallback(async (channel: string) => {
    if (joinedRef.current === channel) return;
    try {
      const A = (await import('agora-rtc-sdk-ng')).default;
      A.setLogLevel(3);
      if (clientRef.current) { try { await clientRef.current.leave(); } catch {} }
      const c = A.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      clientRef.current = c;
      joinedRef.current = channel;

      c.on('user-published', async (u: IAgoraRTCRemoteUser, t: string) => {
        if (t === 'audio') {
          await c.subscribe(u, 'audio');
          u.audioTrack?.play();
        }
      });

      const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(myId)}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Unable to secure the live audio connection.');
      const { token, uid } = await r.json() as { token: string; uid: number };
      await c.join(AGORA_APP_ID, channel, token, uid);
    } catch (e) { console.error('[LiveVoiceBanner] join error', e); }
  }, [myId]);

  /* ── استمع لإشارات WS ── */
  useEffect(() => {
    const h = (e: Event) => {
      const msg = (e as CustomEvent).detail as Record<string, unknown>;
      if (!msg) return;

      if (msg.type === 'voice_start' && msg.chatId === chatId && msg.from !== myId) {
        const sp: Speaker = {
          userId:    msg.from        as string,
          name:      (msg.fromName   as string) ?? 'User',
          avatarUrl: (msg.fromAvatar as string) ?? '',
          channel:   msg.channel     as string,
        };
        setSpeakers(prev => prev.find(s => s.userId === sp.userId) ? prev : [...prev, sp]);
        void joinChannel(sp.channel);
      }

      if (msg.type === 'voice_end' && msg.chatId === chatId) {
        setSpeakers(prev => prev.filter(s => s.userId !== (msg.from as string)));
      }
    };
    window.addEventListener('call-signal', h);
    return () => window.removeEventListener('call-signal', h);
  }, [chatId, myId, joinChannel]);

  /* اترك الـ channel عند اختفاء كل المتحدثين */
  useEffect(() => {
    if (speakers.length === 0 && clientRef.current) {
      clientRef.current.leave().catch(() => {});
      clientRef.current = null;
      joinedRef.current = null;
    }
  }, [speakers]);

  useEffect(() => () => { clientRef.current?.leave().catch(() => {}); }, []);

  return (
    <AnimatePresence>
      {speakers.length > 0 && (
        <motion.div
          key="live-voice-banner"
          initial={{ opacity: 0, y: -70 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -70 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            zIndex: 55,
            background: 'hsl(var(--card))',
            backdropFilter: 'blur(18px)',
            borderBottom: '1px solid var(--call-cyan-border)',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* عنوان LIVE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <motion.div
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--destructive))', flexShrink: 0 }}
            />
            <span style={{ color: 'hsl(var(--destructive))', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em' }}>
              LIVE VOICE
            </span>
          </div>

          {speakers.map(sp => (
            <SpeakerRow key={sp.userId} speaker={sp} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── صف متحدث واحد مع ذبذبات ── */
function SpeakerRow({ speaker }: { speaker: Speaker }) {
  const [bars, setBars] = useState<number[]>(Array(20).fill(0.15));
  const rafRef = useRef<number | null>(null);
  const tmRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = () => {
      setBars(Array.from({ length: 20 }, () => 0.08 + Math.random() * 0.92));
      tmRef.current  = setTimeout(() => { rafRef.current = requestAnimationFrame(tick); }, 75);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (tmRef.current)  clearTimeout(tmRef.current);
    };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

      {/* أفاتار + حلقة نبض */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <motion.div
          animate={{ scale: [1, 1.7], opacity: [0.45, 0] }}
          transition={{ duration: 0.85, repeat: Infinity, ease: 'easeOut' as const }}
          style={{
            position: 'absolute', inset: -5, borderRadius: '50%',
            border: '1.5px solid hsl(var(--primary))',
            pointerEvents: 'none',
          }}
        />
        <div style={{
          width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
          border: '2px solid hsl(var(--primary))',
          background: 'var(--call-cyan-faint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {speaker.avatarUrl
            ? <img src={speaker.avatarUrl} alt={speaker.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: 'hsl(var(--primary))', fontSize: 14, fontWeight: 700 }}>
                {speaker.name.charAt(0).toUpperCase()}
              </span>
          }
        </div>
      </div>

      {/* اسم + "يتحدث الآن" */}
      <div style={{ flexShrink: 0, minWidth: 70 }}>
        <div style={{
          color: 'hsl(var(--foreground))',
          fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 110,
        }}>
          {speaker.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <motion.div
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 0.65, repeat: Infinity }}
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'hsl(var(--primary))', flexShrink: 0 }}
          />
          <span style={{ color: 'hsl(var(--primary))', fontSize: '0.63rem', fontWeight: 600 }}>
            يتحدث الآن
          </span>
        </div>
      </div>

      {/* ذبذبات حية */}
      <div style={{
        flex: 1, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 2, overflow: 'hidden',
      }}>
        {bars.map((h, i) => (
          <motion.div
            key={i}
            animate={{ scaleY: h }}
            transition={{ duration: 0.07, ease: 'linear' }}
            style={{
              width: 2.5, height: 22, borderRadius: 2,
              background: 'hsl(var(--primary))',
              transformOrigin: 'center',
              opacity: 0.2 + h * 0.8,
              flexShrink: 0,
            }}
          />
        ))}
      </div>

    </div>
  );
}