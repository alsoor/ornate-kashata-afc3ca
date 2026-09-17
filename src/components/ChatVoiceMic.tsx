/**
 * ChatVoiceMic
 * ─────────────────────────────────────────────────────────────────────────────
 * زر الميكروفون في شريط الإدخال (DM + Group).
 *
 * الطريقة:
 *  • اضغط مطولاً (أو اضغط مرة للتبديل) → يبدأ البث الصوتي عبر Agora RTC
 *  • يُرسل إشارة voice_start عبر WS → يظهر LiveVoiceBanner للمستقبل
 *  • عند الإفراج / الضغط مجدداً → voice_end → البانر يختفي
 *  • لا يُحفظ أي ملف في المحادثة
 *
 * Props:
 *  chatId     — "dm-{a}-{b}" أو "grp-{groupId}" (نفس chatId في LiveVoiceBanner)
 *  myId       — معرف المستخدم الحالي
 *  myName     — اسم المستخدم الحالي
 *  myAvatar   — رابط الصورة الشخصية
 *  wsSend     — دالة إرسال WS من GlobalCallProvider
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

interface Props {
  chatId:   string;
  myId:     string;
  myName:   string;
  myAvatar: string;
  wsSend:   (msg: object) => void;
}

export default function ChatVoiceMic({ chatId, myId, myName, myAvatar, wsSend }: Props) {
  const [active, setActive]   = useState(false);
  const [loading, setLoading] = useState(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const trackRef  = useRef<IMicrophoneAudioTrack | null>(null);
  const activeRef = useRef(false);

  // Sync ref with state
  useEffect(() => { activeRef.current = active; }, [active]);

  const stopBroadcast = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current.close();
        trackRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch {}
    setActive(false);
    // Signal voice_end to all listeners
    wsSend({ type: 'voice_end', from: myId, chatId });
  }, [myId, chatId, wsSend]);

  const startBroadcast = useCallback(async () => {
    if (activeRef.current) { await stopBroadcast(); return; }
    setLoading(true);
    try {
      const A = (await import('agora-rtc-sdk-ng')).default;
      A.setLogLevel(3);

      const client = A.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      clientRef.current = client;

      // Get token
      const channel = `voice-${chatId}`;
      const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(myId)}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Unable to secure the voice connection.');
      const { appId, token, uid } = await r.json() as { appId: string; token: string; uid: number };

      await client.join(appId || AGORA_APP_ID, channel, token, uid);

      const track = await A.createMicrophoneAudioTrack({ encoderConfig: 'speech_low_quality' });
      trackRef.current = track;
      await client.publish(track);

      setActive(true);

      // Signal voice_start to all listeners in this chat
      wsSend({
        type:       'voice_start',
        from:       myId,
        fromName:   myName,
        fromAvatar: myAvatar,
        channel,
        chatId,
      });
    } catch (e) {
      console.error('[ChatVoiceMic] start error', e);
      // Cleanup on error
      try { await clientRef.current?.leave(); } catch {}
      clientRef.current = null;
      trackRef.current  = null;
    } finally {
      setLoading(false);
    }
  }, [myId, myName, myAvatar, chatId, wsSend, stopBroadcast]);

  // Cleanup on unmount
  useEffect(() => () => { void stopBroadcast(); }, [stopBroadcast]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={startBroadcast}
        disabled={loading}
        title={active ? 'إيقاف البث الصوتي' : 'بدء البث الصوتي'}
        style={{
          width: 42, height: 42, borderRadius: '50%',
          background: active
            ? 'hsl(var(--destructive)/0.18)'
            : 'hsl(var(--primary)/0.12)',
          border: `1.5px solid ${active ? 'hsl(var(--destructive)/0.5)' : 'hsl(var(--primary)/0.3)'}`,
          color: active ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          outline: 'none',
        }}
      >
        {loading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid hsl(var(--primary))', borderTopColor: 'transparent' }}
          />
        ) : active ? (
          <MicOff size={17} strokeWidth={2} />
        ) : (
          <Mic size={17} strokeWidth={1.8} />
        )}
      </motion.button>

      {/* Pulse ring when active */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="pulse"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.9, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1.5px solid hsl(var(--destructive))',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
