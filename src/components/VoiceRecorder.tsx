/**
 * VoiceRecorder — بث صوتي مباشر عبر Agora RTC
 *
 * ── السلوك الجديد ────────────────────────────────────────────────────────────
 *  • عند الضغط على الميكروفون → يبدأ البث الحي فوراً عبر Agora
 *  • يُرسل إشارة WS { type:'voice_start' } لكل من في المحادثة
 *  • الطرف الآخر يسمع الصوت مباشرة عبر LiveVoiceBanner (لا ملف يُرسل)
 *  • زر إيقاف (X) → يقطع البث ويُرسل { type:'voice_end' }
 *  • لا يُرفع أي ملف صوتي في الشات نهائياً
 *
 * ── الذبذبات ─────────────────────────────────────────────────────────────────
 *  Web Audio API AnalyserNode → 28 شريطاً تعكس الصوت الفعلي
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, X } from 'lucide-react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const BAR_COUNT   = 28;
const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

interface VoiceRecorderProps {
  /** معرّف المستقبل (DM) */
  receiverId?: string;
  /** معرّف القروب */
  groupId?: string;
  /** معرّف المستخدم الحالي */
  myId:       string;
  /** اسم المستخدم الحالي */
  myName:     string;
  /** أفاتار المستخدم الحالي */
  myAvatar:   string;
  /** chatId = dm:{a}:{b} أو grp:{groupId} — يُرسل في إشارة WS */
  chatId:     string;
  /** دالة إرسال WS من GlobalCallProvider */
  wsSend:     (msg: object) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
}

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceRecorder({
  receiverId, groupId, myId, myName, myAvatar, chatId,
  wsSend, onRecordingChange, disabled,
}: VoiceRecorderProps) {
  type Phase = 'idle' | 'broadcasting';
  const [phase,   setPhase]   = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [bars,    setBars]    = useState<number[]>(Array(BAR_COUNT).fill(0.08));

  const clientRef   = useRef<IAgoraRTCClient | null>(null);
  const trackRef    = useRef<IMicrophoneAudioTrack | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef     = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);

  /* ── تنظيف كامل ── */
  const cleanup = useCallback(async () => {
    if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
    if (animRef.current)   { cancelAnimationFrame(animRef.current); animRef.current = null; }
    try { trackRef.current?.stop(); trackRef.current?.close(); } catch {}
    trackRef.current = null;
    try { await clientRef.current?.leave(); } catch {}
    clientRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;
    setSeconds(0);
    setBars(Array(BAR_COUNT).fill(0.08));
  }, []);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  /* ── حلقة الذبذبات من Web Audio API ── */
  function startWaveLoop(stream: MediaStream) {
    try {
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const step = Math.floor(data.length / BAR_COUNT);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setBars(Array.from({ length: BAR_COUNT }, (_, i) =>
          Math.max(0.06, (data[i * step] ?? 0) / 255)
        ));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } catch {}
  }

  /* ── بدء البث ── */
  async function startBroadcast() {
    if (disabled) return;
    try {
      const A = (await import('agora-rtc-sdk-ng')).default;
      A.setLogLevel(3);

      const channel = groupId
        ? `voice-grp-${groupId}`
        : (() => { const [a, b] = [myId, receiverId!].sort(); return `voice-dm-${a}-${b}`; })();

      const c = A.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      clientRef.current = c;

      // stability: handle network quality
      c.on("network-quality", (stats: any) => {
        if (stats.uplinkNetworkQuality >= 5 || stats.downlinkNetworkQuality >= 5) {
          console.warn("[VoiceRecorder] Poor network connection detected.");
        }
      });

      const r   = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(myId)}`);
      const { token } = await r.json() as { token: string };
      const uid = Math.abs(myId.split('').reduce((a, ch) => (a << 5) - a + ch.charCodeAt(0), 0)) % 100000;
      await c.join(AGORA_APP_ID, channel, token, uid);

      // Stability: set high-fidelity profile
      await (c as any).setAudioProfile('music_standard', 'game_streaming');

      const micTrack = await A.createMicrophoneAudioTrack();
      trackRef.current = micTrack;
      await c.publish(micTrack);

      /* ذبذبات من stream الميكروفون */
      const stream = new MediaStream([micTrack.getMediaStreamTrack()]);
      streamRef.current = stream;
      startWaveLoop(stream);

      /* عداد الوقت */
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

      setPhase('broadcasting');
      onRecordingChange?.(true);

      /* إشارة WS لكل من في المحادثة */
      wsSend({
        type:        'voice_start',
        from:        myId,
        fromName:    myName,
        fromAvatar:  myAvatar,
        channel,
        chatId,
        to:          receiverId ?? null,
        groupId:     groupId   ?? null,
      });

    } catch (err) {
      console.error('[VoiceRecorder] start error:', err);
      await cleanup();
    }
  }

  /* ── إيقاف البث ── */
  async function stopBroadcast() {
    wsSend({
      type:    'voice_end',
      from:    myId,
      chatId,
      to:      receiverId ?? null,
      groupId: groupId    ?? null,
    });
    await cleanup();
    setPhase('idle');
    onRecordingChange?.(false);
  }

  return (
    <AnimatePresence mode="wait">

      {/* ══ IDLE — زر ميكروفون ══ */}
      {phase === 'idle' && (
        <motion.button
          key="mic-btn"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.82 }}
          onClick={() => void startBroadcast()}
          disabled={disabled}
          title="اضغط للبث الصوتي المباشر"
          style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            background: 'hsl(var(--primary))',
            border: 'none',
            color: 'hsl(var(--primary-foreground))',
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: disabled ? 0.4 : 1,
            boxShadow: '0 2px 12px var(--call-cyan-border)',
            position: 'relative',
          }}
        >
          <motion.span
            animate={{ scale: [1, 1.55, 1], opacity: [0.35, 0, 0.35] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' as const }}
            style={{
              position: 'absolute', inset: -5, borderRadius: '50%',
              border: '1.5px solid hsl(var(--primary))',
              pointerEvents: 'none',
            }}
          />
          <Mic size={17} strokeWidth={2} />
        </motion.button>
      )}

      {/* ══ BROADCASTING — شريط البث الحي ══ */}
      {phase === 'broadcasting' && (
        <motion.div
          key="broadcast-box"
          initial={{ opacity: 0, scaleX: 0.85, y: 6 }}
          animate={{ opacity: 1, scaleX: 1, y: 0 }}
          exit={{ opacity: 0, scaleX: 0.85, y: 6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            width: '100%',
            background: 'hsl(var(--card))',
            border: '1.5px solid var(--call-cyan-border)',
            borderRadius: 16,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: 'var(--call-popup-shadow)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* خلفية توهج */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'var(--call-cyan-faint)', opacity: 0.5,
          }} />

          {/* نبضة ON AIR */}
          <div style={{ flexShrink: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            <motion.div
              animate={{ opacity: [1, 0.2, 1], scale: [1, 1.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' as const }}
              style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--destructive))' }}
            />
            <span style={{ color: 'hsl(var(--destructive))', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em' }}>
              LIVE
            </span>
          </div>

          {/* عداد الوقت */}
          <span style={{
            color: 'hsl(var(--primary))',
            fontSize: '0.78rem', fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.05em',
            flexShrink: 0, zIndex: 1, minWidth: 36,
          }}>
            {fmt(seconds)}
          </span>

          {/* الذبذبات الحية */}
          <div style={{
            flex: 1, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 2.5, zIndex: 1, overflow: 'hidden',
          }}>
            {bars.map((h, i) => (
              <motion.div
                key={i}
                animate={{ scaleY: h }}
                transition={{ duration: 0.06, ease: 'linear' }}
                style={{
                  width: 3, height: 32, borderRadius: 3,
                  background: 'hsl(var(--primary))',
                  transformOrigin: 'center',
                  flexShrink: 0,
                  opacity: 0.3 + h * 0.7,
                }}
              />
            ))}
          </div>

          {/* زر إيقاف */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => void stopBroadcast()}
            title="إيقاف البث"
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'var(--call-red-faint)',
              border: '1px solid var(--call-red-border)',
              color: 'hsl(var(--destructive))',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <X size={16} strokeWidth={2.5} />
          </motion.button>
        </motion.div>
      )}

    </AnimatePresence>
  );
}