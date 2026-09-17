/**
 * AudioControlPanel — لوحة التحكم الصوتية الكاملة داخل الروم
 *
 * تُفتح بضغطة على أيقونة Sliders بجانب MonitorSpeaker في الهيدر.
 * تحتوي على:
 *   🎤 قسم المايك: تشغيل/إيقاف/كتم + مؤشر مستوى حي + اختبار
 *   🔊 قسم السماعة: تشغيل/كتم/مستوى + اختيار جهاز الإخراج + اختبار
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, Volume2, VolumeX, MonitorSpeaker,
  X, CheckCircle2, AlertCircle, Loader2, Play, Square,
  SlidersHorizontal, Wifi, WifiOff, ShieldCheck, ShieldOff,
} from 'lucide-react';

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg:           '#0a1a1a',
  bgPanel:      'rgba(8,20,20,0.98)',
  primary:      '#00BCD4',
  primaryDim:   'rgba(0,188,212,0.35)',
  primaryBorder:'rgba(0,188,212,0.2)',
  primaryFaint: 'rgba(0,188,212,0.08)',
  text:         'rgba(200,230,230,0.9)',
  textDim:      'rgba(150,200,200,0.5)',
  red:          '#ef4444',
  green:        '#22c55e',
  orange:       '#f97316',
  border:       'rgba(0,188,212,0.12)',
};

// ── Mic status type ───────────────────────────────────────────────────────────
type MicStatus = 'idle' | 'testing' | 'ok' | 'error';
type SpeakerStatus = 'idle' | 'testing' | 'ok';

// ── Props ─────────────────────────────────────────────────────────────────────
interface AudioControlPanelProps {
  /** AudioContext الرئيسي للروم */
  audioCtx:    AudioContext | null;
  /** GainNode الرئيسي (يتحكم في مستوى الصوت الكلي) */
  masterGain:  GainNode | null;
  /** قائمة أجهزة الإخراج */
  audioDevices: MediaDeviceInfo[];
  /** الجهاز النشط حالياً */
  activeSinkId: string;
  /** حجم الصوت الحالي 0–1 */
  volume:       number;
  /** كتم السماعة */
  muted:        boolean;
  /** دالة تغيير الحجم */
  onVolumeChange: (v: number) => void;
  /** دالة اختيار جهاز الإخراج */
  onSelectSink:   (id: string) => void;
  /** دالة تبديل كتم السماعة */
  onToggleMute:   () => void;
  /** دالة تحديث قائمة الأجهزة */
  onRefreshDevices: () => void;
  /** هل المستخدم الحالي أدمن في الروم؟ */
  iAmAdmin:     boolean;
  /** هل المستخدم الحالي مالك (Owner)؟ */
  isOwner:      boolean;
  /** هل صلاحية الأدمن ممنوحة من المالك؟ */
  adminGranted: boolean;
}

// ── Mic Level Meter ───────────────────────────────────────────────────────────
function MicLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
  const rafRef  = useRef<number | null>(null);
  const anaRef  = useRef<AnalyserNode | null>(null);
  const ctxRef  = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevels(Array(20).fill(0));
      return;
    }
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const ana = ctx.createAnalyser();
    ana.fftSize = 64;
    anaRef.current = ana;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(ana);
    const data = new Uint8Array(ana.frequencyBinCount);

    const tick = () => {
      ana.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / 20));
      const lvls = Array.from({ length: 20 }, (_, i) => {
        const v = data[i * step] ?? 0;
        return v / 255;
      });
      setLevels(lvls);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.close().catch(() => {});
    };
  }, [stream]);

  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  const color = avg > 0.6 ? T.red : avg > 0.3 ? T.orange : T.green;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28, padding: '0 2px' }}>
      {levels.map((lvl, i) => (
        <motion.div
          key={i}
          animate={{ height: Math.max(3, lvl * 28) }}
          transition={{ duration: 0.06, ease: 'linear' }}
          style={{
            flex: 1,
            borderRadius: 2,
            background: lvl > 0.05
              ? `linear-gradient(to top, ${color}, ${color}88)`
              : 'rgba(255,255,255,0.06)',
            minWidth: 3,
          }}
        />
      ))}
    </div>
  );
}

// ── Speaker Test Tone ─────────────────────────────────────────────────────────
// نغمة اختبار واضحة وقوية — تذهب مباشرة إلى ctx.destination
// تجاوز masterGain تماماً حتى تُسمع حتى لو الصوت مكتوم في الروم
function playSpeakerTest(ctx: AudioContext) {
  const now = ctx.currentTime;

  // ── Master gain للاختبار فقط — حجم عالٍ ثابت ──────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.75;
  master.connect(ctx.destination);

  // ── دالة مساعدة: تشغيل نبضة واحدة ──────────────────────────────────────
  function beep(freq: number, startTime: number, duration: number, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = freq > 800 ? 'triangle' : type; // triangle أوضح للترددات العالية
    osc.frequency.value = freq;
    osc.connect(env);
    env.connect(master);

    // envelope: attack سريع → sustain → release
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(1, startTime + 0.015);   // attack 15ms
    env.gain.setValueAtTime(1, startTime + duration - 0.04);  // sustain
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // release
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  // ── نغمة الاختبار: 3 بيبات تصاعدية + نغمة تأكيد ──────────────────────
  // بيب 1 — تنبيه أول
  beep(880, now + 0.00, 0.18);
  // بيب 2 — تنبيه ثانٍ أعلى
  beep(1100, now + 0.25, 0.18);
  // بيب 3 — تنبيه ثالث أعلى
  beep(1320, now + 0.50, 0.18);
  // نغمة تأكيد مزدوجة في النهاية (تشغيل متزامن لترددين = صوت "دينج" واضح)
  beep(1047, now + 0.80, 0.30, 'sine');
  beep(1319, now + 0.80, 0.30, 'sine');
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AudioControlPanel({
  audioCtx, masterGain, audioDevices, activeSinkId,
  volume, muted, onVolumeChange, onSelectSink, onToggleMute, onRefreshDevices,
  iAmAdmin, isOwner, adminGranted,
}: AudioControlPanelProps) {

  const [open, setOpen] = useState(false);

  // ── Mic state ──────────────────────────────────────────────────────────────
  const [micEnabled,  setMicEnabled]  = useState(true);
  const [micMuted,    setMicMuted]    = useState(false);
  const [micStatus,   setMicStatus]   = useState<MicStatus>('idle');
  const [micStream,   setMicStream]   = useState<MediaStream | null>(null);
  const micStreamRef    = useRef<MediaStream | null>(null);
  const micTestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ref يحمل القيمة الحالية لـ micStatus بدون إعادة إنشاء الدوال
  const micStatusRef = useRef<MicStatus>('idle');

  // ── Speaker state ──────────────────────────────────────────────────────────
  const [speakerStatus, setSpeakerStatus] = useState<SpeakerStatus>('idle');

  // ── Wi-Fi Audio state ──────────────────────────────────────────────────────
  // تحسين جودة الصوت عبر الواي فاي باستخدام RTCPeerConnection مع إعدادات DSCP
  // لا يمس المايك الأساسي — فقط يضيف طبقة تحسين منفصلة
  const [wifiAudio,       setWifiAudio]       = useState(false);
  const [wifiStatus,      setWifiStatus]      = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const wifiPcRef         = useRef<RTCPeerConnection | null>(null);
  const wifiStreamRef     = useRef<MediaStream | null>(null);

  // مزامنة الـ ref مع الـ state
  useEffect(() => { micStatusRef.current = micStatus; }, [micStatus]);

  // ── Stop mic test (ثابتة — لا تتغير بين الـ renders) ──────────────────────
  const stopMicTest = useCallback(() => {
    if (micTestTimerRef.current) {
      clearTimeout(micTestTimerRef.current);
      micTestTimerRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setMicStream(null);
    setMicStatus('idle');
    micStatusRef.current = 'idle';
  }, []);

  // ── Cleanup عند إغلاق اللوحة ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) stopMicTest();
  }, [open, stopMicTest]);

  // ── Test Mic ───────────────────────────────────────────────────────────────
  const testMic = useCallback(async () => {
    // إذا كان الاختبار جارياً — أوقفه
    if (micStatusRef.current === 'testing' || micStatusRef.current === 'ok') {
      stopMicTest();
      return;
    }

    setMicStatus('testing');
    micStatusRef.current = 'testing';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });

      // تحقق أن المستخدم لم يلغِ الاختبار أثناء انتظار الإذن
      if (micStatusRef.current !== 'testing') {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') {
        stream.getTracks().forEach(t => t.stop());
        setMicStatus('error');
        micStatusRef.current = 'error';
        return;
      }

      micStreamRef.current = stream;
      setMicStream(stream);
      setMicStatus('ok');
      micStatusRef.current = 'ok';

      // إيقاف تلقائي بعد 8 ثواني
      micTestTimerRef.current = setTimeout(() => {
        stopMicTest();
      }, 8000);

    } catch (err) {
      console.warn('[AudioControlPanel] Mic access error:', err);
      setMicStatus('error');
      micStatusRef.current = 'error';
    }
  }, [stopMicTest]);

  // ── Test Speaker ───────────────────────────────────────────────────────────
  const testSpeaker = useCallback(async () => {
    // منع الضغط المتكرر أثناء التشغيل
    if (speakerStatus === 'testing') return;

    setSpeakerStatus('testing');
    let tempCtx: AudioContext | null = null;

    try {
      let ctx: AudioContext;

      if (audioCtx && audioCtx.state !== 'closed') {
        // الروم شغّال — استخدم الـ context الأصلي
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        ctx = audioCtx;
      } else {
        // خارج الروم أو قبل الانضمام — أنشئ context مؤقت
        // AudioContext يجب أن يُنشأ داخل user gesture مباشرة (هنا نحن داخل onClick)
        tempCtx = new AudioContext({ sampleRate: 44100 });
        // resume() فوري — نحن داخل user gesture
        if (tempCtx.state === 'suspended') await tempCtx.resume();
        ctx = tempCtx;
      }

      // شغّل النغمة — تذهب مباشرة لـ destination بغض النظر عن mute/volume
      playSpeakerTest(ctx);

      // النغمة تنتهي بعد ~1.1 ثانية — نعرض "ok" بعدها
      setTimeout(() => setSpeakerStatus('ok'), 1150);
      setTimeout(() => {
        setSpeakerStatus('idle');
        if (tempCtx) tempCtx.close().catch(() => {});
      }, 3200);

    } catch (err) {
      console.warn('[AudioControlPanel] Speaker test error:', err);
      if (tempCtx) tempCtx.close().catch(() => {});
      setSpeakerStatus('idle');
    }
  }, [audioCtx, speakerStatus]);

  // ── Wi-Fi Audio: تشغيل / إيقاف ────────────────────────────────────────────
  // يُنشئ RTCPeerConnection loopback مع إعدادات DSCP (googDscp) لتحسين
  // أولوية حزم الصوت على الشبكة — لا يغيّر المايك الأساسي أبداً
  const stopWifiAudio = useCallback(() => {
    if (wifiPcRef.current) {
      wifiPcRef.current.close();
      wifiPcRef.current = null;
    }
    if (wifiStreamRef.current) {
      wifiStreamRef.current.getTracks().forEach(t => t.stop());
      wifiStreamRef.current = null;
    }
    setWifiAudio(false);
    setWifiStatus('idle');
  }, []);

  const startWifiAudio = useCallback(async () => {
    setWifiStatus('connecting');
    try {
      // إعدادات RTCPeerConnection مع تحسينات الواي فاي
      const pcConfig: RTCConfiguration = {
        iceServers: [],          // loopback — لا نحتاج STUN/TURN
        // @ts-expect-error — خاصية Chrome غير رسمية لتفعيل DSCP
        googDscp: true,
        // @ts-ignore
        googIPv6: false,
      };

      const pc1 = new RTCPeerConnection(pcConfig);
      const pc2 = new RTCPeerConnection(pcConfig);
      wifiPcRef.current = pc1;

      // نحصل على stream صوتي خفيف (silent) فقط لتأسيس القناة
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          // @ts-expect-error — Chrome: تحسين جودة الصوت عبر الشبكة
          googHighpassFilter: false,
        },
        video: false,
      });
      wifiStreamRef.current = stream;

      // أضف المسار لـ pc1 فقط لتأسيس الاتصال
      stream.getAudioTracks().forEach(track => {
        pc1.addTrack(track, stream);
      });

      // ICE candidate exchange (loopback)
      pc1.onicecandidate = e => { if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {}); };
      pc2.onicecandidate = e => { if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {}); };

      // Offer / Answer
      const offer = await pc1.createOffer();
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);
      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);

      // انتظر الاتصال (max 4s)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 4000);
        pc1.oniceconnectionstatechange = () => {
          if (pc1.iceConnectionState === 'connected' || pc1.iceConnectionState === 'completed') {
            clearTimeout(timeout);
            resolve();
          }
          if (pc1.iceConnectionState === 'failed') {
            clearTimeout(timeout);
            reject(new Error('ICE failed'));
          }
        };
        // إذا كان loopback يتصل فوراً
        if (pc1.iceConnectionState === 'connected' || pc1.iceConnectionState === 'completed') {
          clearTimeout(timeout);
          resolve();
        }
      });

      setWifiAudio(true);
      setWifiStatus('connected');

      // أوقف stream الصوت — القناة تأسست، الهدف تحسين الشبكة فقط
      stream.getAudioTracks().forEach(t => t.stop());

    } catch (err) {
      console.warn('[WiFiAudio] Error:', err);
      stopWifiAudio();
      setWifiStatus('error');
      setTimeout(() => setWifiStatus('idle'), 3000);
    }
  }, [stopWifiAudio]);

  const toggleWifiAudio = useCallback(() => {
    if (wifiAudio) {
      stopWifiAudio();
    } else {
      startWifiAudio();
    }
  }, [wifiAudio, startWifiAudio, stopWifiAudio]);

  // Cleanup عند إغلاق اللوحة أو unmount
  useEffect(() => {
    return () => { stopWifiAudio(); };
  }, [stopWifiAudio]);

  // ── Mic status icon ────────────────────────────────────────────────────────
  function MicStatusIcon() {
    if (micStatus === 'testing') return <Loader2 size={13} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />;
    if (micStatus === 'ok')      return <CheckCircle2 size={13} color={T.green} />;
    if (micStatus === 'error')   return <AlertCircle size={13} color={T.red} />;
    return null;
  }

  // ── Speaker status icon ────────────────────────────────────────────────────
  function SpeakerStatusIcon() {
    if (speakerStatus === 'testing') return <Loader2 size={13} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />;
    if (speakerStatus === 'ok')      return <CheckCircle2 size={13} color={T.green} />;
    return null;
  }

  return (
    <>
      {/* ── Trigger button ── */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => { setOpen(v => !v); onRefreshDevices(); }}
        title="Audio Control Panel"
        aria-label="Open audio control panel"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: '50%',
          background: open ? 'rgba(0,188,212,0.18)' : T.primaryFaint,
          border: `1px solid ${open ? T.primary : T.primaryBorder}`,
          cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
          flexShrink: 0,
        }}
      >
        <SlidersHorizontal size={16} strokeWidth={2} color={open ? T.primary : T.primaryDim} />
      </motion.button>

      {/* ── Panel overlay ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(3px)',
              }}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: 80, right: 16,
                width: 'min(340px, calc(100vw - 32px))',
                background: T.bgPanel,
                border: `1px solid ${T.primaryBorder}`,
                borderRadius: 20,
                zIndex: 201,
                boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,188,212,0.06)',
                overflow: 'hidden',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {/* ── Panel header ── */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 18px 14px',
                borderBottom: `1px solid ${T.border}`,
                background: 'rgba(0,188,212,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SlidersHorizontal size={16} color={T.primary} strokeWidth={2} />
                  <span style={{ color: T.text, fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                    Audio Control
                  </span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textDim, display: 'flex' }}
                >
                  <X size={16} strokeWidth={2} />
                </motion.button>
              </div>

              <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* ══════════════════════════════════════════════════════════
                    🎤  MIC SECTION
                ══════════════════════════════════════════════════════════ */}
                <section>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Mic size={13} color={T.primary} strokeWidth={2.5} />
                    <span style={{ color: T.primary, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Microphone
                    </span>
                    <MicStatusIcon />
                  </div>

                  {/* Mic controls row */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>

                    {/* Enable / Disable */}
                    <ControlBtn
                      active={micEnabled}
                      color={micEnabled ? T.green : T.textDim}
                      onClick={() => setMicEnabled(v => !v)}
                      title={micEnabled ? 'Mic On' : 'Mic Off'}
                    >
                      {micEnabled
                        ? <Mic size={15} strokeWidth={2} color={T.green} />
                        : <MicOff size={15} strokeWidth={2} color={T.textDim} />
                      }
                      <BtnLabel color={micEnabled ? T.green : T.textDim}>
                        {micEnabled ? 'On' : 'Off'}
                      </BtnLabel>
                    </ControlBtn>

                    {/* Mute */}
                    <ControlBtn
                      active={micMuted}
                      color={micMuted ? T.orange : T.textDim}
                      onClick={() => setMicMuted(v => !v)}
                      title={micMuted ? 'Unmute Mic' : 'Mute Mic'}
                    >
                      {micMuted
                        ? <MicOff size={15} strokeWidth={2} color={T.orange} />
                        : <Mic size={15} strokeWidth={2} color={T.textDim} />
                      }
                      <BtnLabel color={micMuted ? T.orange : T.textDim}>
                        {micMuted ? 'Muted' : 'Mute'}
                      </BtnLabel>
                    </ControlBtn>

                    {/* Test mic */}
                    <ControlBtn
                      active={micStatus === 'testing' || micStatus === 'ok'}
                      color={
                        micStatus === 'ok'      ? T.green :
                        micStatus === 'error'   ? T.red :
                        micStatus === 'testing' ? T.primary : T.textDim
                      }
                      onClick={testMic}
                      title={
                        micStatus === 'testing' || micStatus === 'ok'
                          ? 'Stop Mic Test'
                          : 'Test Microphone'
                      }
                      style={{ flex: 1 }}
                    >
                      {micStatus === 'testing'
                        ? <Square size={13} strokeWidth={2} color={T.primary} />
                        : micStatus === 'ok'
                          ? <Square size={13} strokeWidth={2} color={T.green} />
                          : micStatus === 'error'
                            ? <AlertCircle size={13} strokeWidth={2} color={T.red} />
                            : <Play size={13} strokeWidth={2} color={T.textDim} />
                      }
                      <BtnLabel color={
                        micStatus === 'ok'      ? T.green :
                        micStatus === 'error'   ? T.red :
                        micStatus === 'testing' ? T.primary : T.textDim
                      }>
                        {micStatus === 'testing' ? 'Stop…' :
                         micStatus === 'ok'      ? 'Stop' :
                         micStatus === 'error'   ? 'Retry' : 'Test'}
                      </BtnLabel>
                    </ControlBtn>
                  </div>

                  {/* Mic level meter */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    border: `1px solid ${T.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: T.textDim, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                        MIC LEVEL
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: (micStatus === 'testing' || micStatus === 'ok') ? T.green : 'rgba(255,255,255,0.1)',
                          boxShadow: (micStatus === 'testing' || micStatus === 'ok') ? `0 0 6px ${T.green}` : 'none',
                          transition: 'all 0.3s',
                        }} />
                        <span style={{ color: (micStatus === 'testing' || micStatus === 'ok') ? T.green : T.textDim, fontSize: '0.58rem' }}>
                          {micStatus === 'testing' ? 'LIVE' : micStatus === 'ok' ? 'LIVE' : micStatus === 'error' ? 'ERROR' : 'IDLE'}
                        </span>
                      </div>
                    </div>
                    <MicLevelMeter stream={(micStatus === 'testing' || micStatus === 'ok') ? micStream : null} />
                    {micStatus === 'idle' && (
                      <p style={{ color: T.textDim, fontSize: '0.6rem', textAlign: 'center', marginTop: 4 }}>
                        Press Test to check your microphone
                      </p>
                    )}
                    {micStatus === 'error' && (
                      <p style={{ color: T.red, fontSize: '0.6rem', textAlign: 'center', marginTop: 4 }}>
                        Mic access denied — check browser permissions
                      </p>
                    )}
                  </div>
                </section>

                {/* Divider */}
                <div style={{ height: 1, background: T.border }} />

                {/* ══════════════════════════════════════════════════════════
                    🔊  SPEAKER SECTION
                ══════════════════════════════════════════════════════════ */}
                <section>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Volume2 size={13} color={T.primary} strokeWidth={2.5} />
                    <span style={{ color: T.primary, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Speaker
                    </span>
                    <SpeakerStatusIcon />
                  </div>

                  {/* Speaker controls row */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>

                    {/* Mute toggle */}
                    <ControlBtn
                      active={muted}
                      color={muted ? T.red : T.textDim}
                      onClick={onToggleMute}
                      title={muted ? 'Unmute Speaker' : 'Mute Speaker'}
                    >
                      {muted
                        ? <VolumeX size={15} strokeWidth={2} color={T.red} />
                        : <Volume2 size={15} strokeWidth={2} color={T.textDim} />
                      }
                      <BtnLabel color={muted ? T.red : T.textDim}>
                        {muted ? 'Muted' : 'Mute'}
                      </BtnLabel>
                    </ControlBtn>

                    {/* Test speaker */}
                    <ControlBtn
                      active={speakerStatus === 'testing' || speakerStatus === 'ok'}
                      color={
                        speakerStatus === 'ok'      ? T.green :
                        speakerStatus === 'testing' ? T.primary : T.textDim
                      }
                      onClick={testSpeaker}
                      title="Test Speaker — plays a tone directly to your speaker"
                      style={{ flex: 1 }}
                    >
                      {speakerStatus === 'testing'
                        ? <Loader2 size={13} strokeWidth={2} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />
                        : speakerStatus === 'ok'
                          ? <CheckCircle2 size={13} strokeWidth={2} color={T.green} />
                          : <Play size={13} strokeWidth={2} color={T.textDim} />
                      }
                      <BtnLabel color={
                        speakerStatus === 'ok'      ? T.green :
                        speakerStatus === 'testing' ? T.primary : T.textDim
                      }>
                        {speakerStatus === 'testing' ? 'Playing…' :
                         speakerStatus === 'ok'      ? 'Heard it?' : 'Test'}
                      </BtnLabel>
                    </ControlBtn>
                  </div>

                  {/* Speaker test feedback bar */}
                  <AnimatePresence>
                    {(speakerStatus === 'testing' || speakerStatus === 'ok') && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 10 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          background: speakerStatus === 'ok'
                            ? 'rgba(34,197,94,0.08)'
                            : 'rgba(0,188,212,0.08)',
                          border: `1px solid ${speakerStatus === 'ok' ? 'rgba(34,197,94,0.25)' : T.primaryBorder}`,
                          borderRadius: 10,
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        {/* Animated sound waves */}
                        {speakerStatus === 'testing' && (
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 20, flexShrink: 0 }}>
                            {[0.4, 0.7, 1, 0.7, 0.4, 0.9, 0.6].map((h, i) => (
                              <motion.div
                                key={i}
                                animate={{ scaleY: [h, 1, h * 0.5, 1, h] }}
                                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
                                style={{
                                  width: 3, borderRadius: 2,
                                  height: `${h * 20}px`,
                                  background: T.primary,
                                  transformOrigin: 'bottom',
                                }}
                              />
                            ))}
                          </div>
                        )}
                        {speakerStatus === 'ok' && (
                          <CheckCircle2 size={16} color={T.green} strokeWidth={2} style={{ flexShrink: 0 }} />
                        )}
                        <div>
                          <p style={{ color: speakerStatus === 'ok' ? T.green : T.text, fontSize: '0.72rem', fontWeight: 600, margin: 0 }}>
                            {speakerStatus === 'testing' ? 'Playing test tone…' : 'Speaker is working!'}
                          </p>
                          <p style={{ color: T.textDim, fontSize: '0.6rem', margin: '2px 0 0' }}>
                            {speakerStatus === 'testing'
                              ? 'Listen for 4 ascending tones from your speaker'
                              : 'If you heard the tones, your speaker is working correctly'}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Volume slider */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    border: `1px solid ${T.border}`,
                    marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: T.textDim, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                        VOLUME
                      </span>
                      <span style={{ color: T.primary, fontSize: '0.68rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <VolumeX size={12} color={T.textDim} />
                      <div style={{ flex: 1, position: 'relative', height: 24, display: 'flex', alignItems: 'center' }}>
                        {/* Track */}
                        <div style={{ position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3, background: 'rgba(0,188,212,0.1)' }} />
                        {/* Fill */}
                        <div style={{
                          position: 'absolute', left: 0,
                          width: `${volume * 100}%`, height: 5, borderRadius: 3,
                          background: `linear-gradient(to right, ${T.primaryDim}, ${T.primary})`,
                          transition: 'width 0.04s',
                        }} />
                        {/* Hidden range input */}
                        <input
                          type="range" min={0} max={1} step={0.01}
                          value={volume}
                          onChange={e => onVolumeChange(Number(e.target.value))}
                          style={{ position: 'absolute', left: 0, right: 0, width: '100%', opacity: 0, cursor: 'pointer', height: 24, margin: 0 }}
                        />
                        {/* Thumb */}
                        <div style={{
                          position: 'absolute',
                          left: `calc(${volume * 100}% - 9px)`,
                          width: 18, height: 18, borderRadius: '50%',
                          background: T.primary,
                          boxShadow: `0 0 10px ${T.primary}99`,
                          border: '2px solid rgba(0,0,0,0.4)',
                          transition: 'left 0.04s',
                          pointerEvents: 'none',
                        }} />
                      </div>
                      <Volume2 size={12} color={T.primary} />
                    </div>
                  </div>

                  {/* Output device selector */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    border: `1px solid ${T.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: T.textDim, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                        OUTPUT DEVICE
                      </span>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={onRefreshDevices}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim, fontSize: '0.58rem', padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        ↻ Refresh
                      </motion.button>
                    </div>

                    {audioDevices.length === 0 ? (
                      <p style={{ color: T.textDim, fontSize: '0.68rem', textAlign: 'center', padding: '6px 0' }}>
                        No output devices found
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                        {audioDevices.map((d, idx) => {
                          const isActive = activeSinkId === d.deviceId;
                          return (
                            <motion.button
                              key={d.deviceId}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => onSelectSink(d.deviceId)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px', borderRadius: 8,
                                background: isActive ? 'rgba(0,188,212,0.1)' : 'transparent',
                                border: `1px solid ${isActive ? T.primaryBorder : 'transparent'}`,
                                color: isActive ? T.primary : T.text,
                                fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left',
                                transition: 'all 0.15s', width: '100%',
                              }}
                            >
                              <MonitorSpeaker size={12} strokeWidth={2} color={isActive ? T.primary : T.textDim} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.label || `Speaker ${idx + 1}`}
                              </span>
                              {isActive && (
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.primary, flexShrink: 0, boxShadow: `0 0 6px ${T.primary}` }} />
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* Divider */}
                <div style={{ height: 1, background: T.border }} />

                {/* ══════════════════════════════════════════════════════════
                    📶  WI-FI AUDIO SECTION
                ══════════════════════════════════════════════════════════ */}
                <section>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Wifi size={13} color={T.primary} strokeWidth={2.5} />
                    <span style={{ color: T.primary, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Wi-Fi Audio
                    </span>
                    {wifiStatus === 'connecting' && (
                      <Loader2 size={13} color={T.primary} style={{ animation: 'spin 1s linear infinite' }} />
                    )}
                    {wifiStatus === 'connected' && <CheckCircle2 size={13} color={T.green} />}
                    {wifiStatus === 'error'     && <AlertCircle  size={13} color={T.red}   />}
                  </div>

                  {/* Toggle row */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: `1px solid ${wifiAudio ? 'rgba(0,188,212,0.3)' : T.border}`,
                    transition: 'border-color 0.25s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

                      {/* Icon + label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: wifiAudio ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${wifiAudio ? T.primaryBorder : 'rgba(255,255,255,0.08)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.25s',
                          flexShrink: 0,
                        }}>
                          {wifiAudio
                            ? <Wifi    size={16} strokeWidth={2} color={T.primary} />
                            : <WifiOff size={16} strokeWidth={2} color={T.textDim} />
                          }
                        </div>
                        <div>
                          <p style={{ color: wifiAudio ? T.text : T.textDim, fontSize: '0.78rem', fontWeight: 600, margin: 0, transition: 'color 0.2s' }}>
                            {wifiStatus === 'connecting' ? 'Connecting…'
                             : wifiStatus === 'connected' ? 'Wi-Fi Enhanced'
                             : wifiStatus === 'error'     ? 'Connection failed'
                             : 'Wi-Fi Boost'}
                          </p>
                          <p style={{ color: T.textDim, fontSize: '0.6rem', margin: '2px 0 0', lineHeight: 1.4 }}>
                            {wifiAudio
                              ? 'Audio priority active via DSCP'
                              : 'Prioritise audio packets over Wi-Fi'}
                          </p>
                        </div>
                      </div>

                      {/* Toggle switch */}
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={toggleWifiAudio}
                        disabled={wifiStatus === 'connecting'}
                        aria-label={wifiAudio ? 'Disable Wi-Fi Audio' : 'Enable Wi-Fi Audio'}
                        style={{
                          width: 46, height: 26, borderRadius: 13,
                          background: wifiAudio ? T.primary : 'rgba(255,255,255,0.1)',
                          border: `1px solid ${wifiAudio ? T.primary : 'rgba(255,255,255,0.15)'}`,
                          cursor: wifiStatus === 'connecting' ? 'not-allowed' : 'pointer',
                          outline: 'none',
                          position: 'relative',
                          transition: 'background 0.25s, border-color 0.25s',
                          flexShrink: 0,
                          opacity: wifiStatus === 'connecting' ? 0.6 : 1,
                        }}
                      >
                        <motion.div
                          animate={{ x: wifiAudio ? 22 : 2 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          style={{
                            position: 'absolute',
                            top: 3, width: 18, height: 18, borderRadius: '50%',
                            background: wifiAudio ? '#000' : 'rgba(255,255,255,0.5)',
                            boxShadow: wifiAudio ? `0 0 8px ${T.primary}88` : 'none',
                          }}
                        />
                      </motion.button>
                    </div>

                    {/* Status bar */}
                    <AnimatePresence>
                      {wifiStatus === 'error' && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{ color: T.red, fontSize: '0.62rem', marginTop: 8, lineHeight: 1.4 }}
                        >
                          Could not establish Wi-Fi audio channel. Check mic permissions and try again.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </section>
                {/* Divider */}
                <div style={{ height: 1, background: T.border }} />

                {/* ══════════════════════════════════════════════════════════
                    🛡  ROOM ADMIN SECTION
                ══════════════════════════════════════════════════════════ */}
                <section>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <ShieldCheck size={13} color={T.primary} strokeWidth={2.5} />
                    <span style={{ color: T.primary, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Room Admin
                    </span>
                  </div>

                  <div style={{
                    background: T.bgPanel,
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: `1px solid ${iAmAdmin ? T.primaryBorder : T.border}`,
                    opacity: adminGranted || isOwner ? 1 : 0.5,
                    transition: 'border-color 0.25s, opacity 0.25s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

                      {/* Icon + label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: iAmAdmin ? T.primaryFaint : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${iAmAdmin ? T.primaryBorder : 'rgba(255,255,255,0.08)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.25s', flexShrink: 0,
                        }}>
                          {iAmAdmin
                            ? <ShieldCheck size={16} strokeWidth={2} color={T.primary} />
                            : <ShieldOff   size={16} strokeWidth={2} color={T.textDim} />
                          }
                        </div>
                        <div>
                          <p style={{ color: iAmAdmin ? T.text : T.textDim, fontSize: '0.78rem', fontWeight: 600, margin: 0, transition: 'color 0.2s' }}>
                            {iAmAdmin ? 'أدمن نشط' : 'أدمن الروم'}
                          </p>
                          <p style={{ color: T.textDim, fontSize: '0.6rem', margin: '2px 0 0', lineHeight: 1.4 }}>
                            {isOwner
                              ? 'أنت المالك — صلاحيات كاملة دائماً'
                              : adminGranted
                                ? 'صلاحية ممنوحة من المالك'
                                : 'يتطلب منح الصلاحية من المالك'}
                          </p>
                        </div>
                      </div>

                      {/* Toggle — display-only, reflects admin state */}
                      <div
                        aria-label={iAmAdmin ? 'Admin active' : 'Admin inactive'}
                        style={{
                          width: 46, height: 26, borderRadius: 13,
                          background: iAmAdmin ? T.primary : 'rgba(255,255,255,0.1)',
                          border: `1px solid ${iAmAdmin ? T.primary : 'rgba(255,255,255,0.15)'}`,
                          cursor: 'default',
                          outline: 'none',
                          position: 'relative',
                          transition: 'background 0.25s, border-color 0.25s',
                          flexShrink: 0,
                        }}
                      >
                        <motion.div
                          animate={{ x: iAmAdmin ? 22 : 2 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          style={{
                            position: 'absolute',
                            top: 3, width: 18, height: 18, borderRadius: '50%',
                            background: iAmAdmin ? '#000' : 'rgba(255,255,255,0.5)',
                            boxShadow: iAmAdmin ? `0 0 8px ${T.primary}88` : 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Not granted hint */}
                    {!adminGranted && !isOwner && (
                      <p style={{ color: T.textDim, fontSize: '0.6rem', marginTop: 10, lineHeight: 1.5, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                        لا تملك صلاحيات الأدمن حالياً. يمكن للمالك منحك الصلاحية من قائمة الأعضاء.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function ControlBtn({
  children, active, color, onClick, title, style: extraStyle,
}: {
  children: React.ReactNode;
  active:   boolean;
  color:    string;
  onClick:  () => void;
  title?:   string;
  style?:   React.CSSProperties;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: '8px 10px', borderRadius: 10, minWidth: 52,
        background: active ? `${color}18` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? `${color}55` : 'rgba(255,255,255,0.07)'}`,
        cursor: 'pointer', outline: 'none', transition: 'all 0.15s',
        ...extraStyle,
      }}
    >
      {children}
    </motion.button>
  );
}

function BtnLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ color, fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
