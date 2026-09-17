/**
 * DmCallBar — مكالمة صوتية خاصة بين شخصين عبر Agora RTC
 *
 * الزر "اتصال" → يرسل ring عبر /ws/call-signal → الطرف الثاني يسمع رنين
 * → يقبل → كلاهما ينضم Agora channel → ذبذبات حقيقية + 30 ثانية auto-cutoff
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, PhoneCall, PhoneOff, PhoneIncoming, Volume2, VolumeX, X } from 'lucide-react';
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';
const LATCH_MAX   = 30;

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  primary:       '#00BCD4',
  primaryFaint:  'rgba(0,188,212,0.10)',
  primaryBorder: 'rgba(0,188,212,0.25)',
  red:           '#ef4444',
  redFaint:      'rgba(239,68,68,0.12)',
  redBorder:     'rgba(239,68,68,0.30)',
  green:         '#22c55e',
  greenFaint:    'rgba(34,197,94,0.10)',
  greenBorder:   'rgba(34,197,94,0.28)',
  text:          'rgba(200,240,245,0.92)',
  textDim:       'rgba(200,230,230,0.45)',
};

// ── Waveform bars ─────────────────────────────────────────────────────────────
function SpeakingBars({ levels, color }: { levels: number[]; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          width: 3,
          height: Math.max(3, (levels[i] ?? 0.3) * 16),
          borderRadius: 2,
          background: color,
          transition: 'height 0.08s ease',
        }} />
      ))}
    </div>
  );
}

function IdleBars({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {[0, 1, 2, 3].map(i => (
        <motion.div key={i}
          animate={{ scaleY: [0.3, 1, 0.5, 0.9, 0.3] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' as const }}
          style={{ width: 3, height: 16, borderRadius: 2, background: color, transformOrigin: 'bottom' }}
        />
      ))}
    </div>
  );
}

// ── Ringtone (Web Audio API — no file needed) ─────────────────────────────────
function useRingtone(active: boolean) {
  const ctxRef   = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const beep = useCallback(() => {
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }, []);

  useEffect(() => {
    if (active) {
      beep();
      timerRef.current = setInterval(beep, 1400);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, beep]);
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface DmCallBarProps {
  myId:       string;
  myName:     string;
  myAvatar:   string;
  peerId:     string;
  peerName:   string;
  peerAvatar: string;
}

// ── Channel name — deterministic ──────────────────────────────────────────────
function dmChannel(a: string, b: string) {
  return a < b ? `dm-${a}-${b}` : `dm-${b}-${a}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DmCallBar({
  myId, myName, myAvatar, peerId, peerName, peerAvatar,
}: DmCallBarProps) {
  // ── Call state ──────────────────────────────────────────────────────────────
  type Phase =
    | 'idle'       // لا يوجد مكالمة
    | 'calling'    // أنا أتصل — أنتظر رد
    | 'ringing'    // شخص آخر يتصل بي
    | 'connected'; // متصلان

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [muted,       setMuted]       = useState(false);
  const [publishing,  setPublishing]  = useState(false);
  const [joining,     setJoining]     = useState(false);
  const [micLevels,   setMicLevels]   = useState<number[]>([0.3, 0.3, 0.3, 0.3]);
  const [latchLeft,   setLatchLeft]   = useState(LATCH_MAX);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  // Ringtone — يرن عند incoming call
  useRingtone(phase === 'ringing');

  // ── Refs ────────────────────────────────────────────────────────────────────
  const wsRef          = useRef<WebSocket | null>(null);
  const clientRef      = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef    = useRef<IMicrophoneAudioTrack | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const latchRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef       = useRef<Phase>('idle');
  const mutedRef       = useRef(false);

  phaseRef.current = phase;

  // ── WebSocket signaling ──────────────────────────────────────────────────────
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws    = new WebSocket(`${proto}//${location.host}/ws/call-signal`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', userId: myId }));
    };

    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data as string); } catch { return; }
      const t = msg.type as string;

      if (t === 'call' && msg.from === peerId) {
        // Incoming call from this peer
        if (phaseRef.current === 'idle') {
          setPhase('ringing');
        } else {
          // Busy — decline automatically
          wsSend(JSON.stringify({ type: 'answer', from: myId, to: peerId, accept: false }));
        }
      } else if (t === 'answer' && msg.from === peerId) {
        if (msg.accept) {
          // Peer accepted — join Agora
          joinAgora();
        } else {
          // Peer declined / busy
          setPhase('idle');
        }
      } else if (t === 'hangup' && msg.from === peerId) {
        hangup(false);
      } else if (t === 'busy') {
        setPhase('idle');
      }
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [myId, peerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function wsSend(data: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  // ── Initiate call ────────────────────────────────────────────────────────────
  function startCall() {
    if (phase !== 'idle') return;
    setPhase('calling');
    wsSend(JSON.stringify({
      type: 'call',
      from: myId,
      to:   peerId,
      fromName:   myName,
      fromAvatar: myAvatar,
    }));
  }

  // ── Accept incoming call ─────────────────────────────────────────────────────
  function acceptCall() {
    wsSend(JSON.stringify({ type: 'answer', from: myId, to: peerId, accept: true }));
    joinAgora();
  }

  // ── Decline incoming call ────────────────────────────────────────────────────
  function declineCall() {
    wsSend(JSON.stringify({ type: 'answer', from: myId, to: peerId, accept: false }));
    setPhase('idle');
  }

  // ── Hangup ───────────────────────────────────────────────────────────────────
  function hangup(sendSignal = true) {
    if (sendSignal) {
      wsSend(JSON.stringify({ type: 'hangup', from: myId, to: peerId }));
    }
    setPhase('idle');
    leaveAgora();
  }

  // ── Join Agora ───────────────────────────────────────────────────────────────
  async function joinAgora() {
    if (clientRef.current) return; // already joined
    setPhase('connected');
    setJoining(true);

    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3);

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      clientRef.current = client;

      // stability: handle network quality
      client.on("network-quality", (stats: any) => {
        if (stats.uplinkNetworkQuality >= 5 || stats.downlinkNetworkQuality >= 5) {
          console.warn("[DmCallBar] Poor network connection detected.");
        }
      });

      // stability: handle reconnection
      client.on("connection-state-change", (cur: string) => {
        if (cur === 'RECONNECTING') console.log("[DmCallBar] Reconnecting...");
        if (cur === 'CONNECTED')    console.log("[DmCallBar] Connected");
      });

      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType !== 'audio') return;
        await client.subscribe(user, 'audio');
        user.audioTrack?.setVolume(mutedRef.current ? 0 : 100);
        if (!mutedRef.current) user.audioTrack?.play();
        setRemoteSpeaking(true);
      });

      client.on('user-unpublished', (user: IAgoraRTCRemoteUser) => {
        user.audioTrack?.stop();
        setRemoteSpeaking(false);
      });

      client.on('user-left', () => {
        setRemoteSpeaking(false);
        hangup(false);
      });

      const ch = dmChannel(myId, peerId);
      const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(ch)}&uid=${encodeURIComponent(myId)}`, { credentials: 'include' });
      if (!tokenRes.ok) throw new Error('Unable to secure the call connection.');
      const { token, uid } = await tokenRes.json() as { token: string; uid: number };

      await client.join(AGORA_APP_ID, ch, token, uid);

      // Stability: set high-fidelity profile
      await (client as any).setAudioProfile('music_standard', 'game_streaming');

      // Auto-publish mic — لكن مكتوم بالبداية حتى يضغط المستخدم
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'music_standard' });
      micTrackRef.current = micTrack;
      await micTrack.setEnabled(false);   // مكتوم بالبداية
      await client.publish([micTrack]);
      setPublishing(false);               // لم يبدأ التحدث بعد
      // لا نبدأ analyser أو latch حتى يضغط المستخدم على الميك

    } catch (err) {
      console.error('[DmCallBar] Agora join error:', err);
      setPhase('idle');
    } finally {
      setJoining(false);
    }
  }

  // ── Leave Agora ──────────────────────────────────────────────────────────────
  async function leaveAgora() {
    stopLatch();
    stopAnalyser();
    setPublishing(false);
    setRemoteSpeaking(false);
    if (micTrackRef.current) {
      try { await clientRef.current?.unpublish([micTrackRef.current]); } catch {}
      micTrackRef.current.stop();
      micTrackRef.current.close();
      micTrackRef.current = null;
    }
    try { await clientRef.current?.leave(); } catch {}
    clientRef.current = null;
  }

  // ── Mic analyser ─────────────────────────────────────────────────────────────
  function startAnalyser(track: IMicrophoneAudioTrack) {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src     = ctx.createMediaStreamSource(new MediaStream([track.getMediaStreamTrack()]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / 4);
        setMicLevels([0, 1, 2, 3].map(i => Math.max(0.08, (data[i * step] ?? 0) / 255)));
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      analyserRafRef.current = requestAnimationFrame(tick);
    } catch {}
  }

  function stopAnalyser() {
    if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevels([0.3, 0.3, 0.3, 0.3]);
  }

  // ── 30-second latch ──────────────────────────────────────────────────────────
  function startLatch() {
    setLatchLeft(LATCH_MAX);
    let rem = LATCH_MAX;
    latchRef.current = setInterval(() => {
      rem -= 1;
      setLatchLeft(rem);
      if (rem <= 0) {
        stopLatch();
        hangup(true);
      }
    }, 1000);
  }

  function stopLatch() {
    if (latchRef.current) clearInterval(latchRef.current);
    latchRef.current = null;
    setLatchLeft(LATCH_MAX);
  }

  // ── Toggle mute ───────────────────────────────────────────────────────────────
  function toggleMute() {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    clientRef.current?.remoteUsers.forEach(u => {
      if (next) u.audioTrack?.stop();
      else      u.audioTrack?.play();
    });
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopLatch();
      stopAnalyser();
      void leaveAgora();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: 6 }}>
      <AnimatePresence mode="wait">

        {/* ── IDLE — زر اتصال ── */}
        {phase === 'idle' && (
          <motion.div key="idle"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`,
              borderRadius: 14, padding: '10px 14px',
            }}>
            {/* Avatar */}
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: 'rgba(0,188,212,0.12)', border: `1px solid ${C.primaryBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {peerAvatar
                ? <img src={peerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: C.primary, fontSize: '1rem', fontWeight: 700 }}>{peerName.charAt(0).toUpperCase()}</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontSize: '0.78rem', fontWeight: 600 }}>مكالمة صوتية</div>
              <div style={{ color: C.textDim, fontSize: '0.67rem', marginTop: 2 }}>اضغط للاتصال بـ {peerName}</div>
            </div>
            {/* Call button */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={startCall}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: `linear-gradient(135deg, ${C.green} 0%, #16a34a 100%)`,
                border: 'none', borderRadius: 10, padding: '8px 14px',
                color: '#fff', fontSize: '0.73rem', fontWeight: 700,
                cursor: 'pointer', flexShrink: 0,
              }}>
              <PhoneCall size={14} strokeWidth={2.5} />
              اتصال
            </motion.button>
          </motion.div>
        )}

        {/* ── CALLING — أنا أتصل ── */}
        {phase === 'calling' && (
          <motion.div key="calling"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.greenBorder}`,
              borderRadius: 14, padding: '10px 14px',
            }}>
            {/* Pulsing avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <motion.div
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `2px solid ${C.green}`, pointerEvents: 'none' }}
              />
              <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'rgba(34,197,94,0.12)', border: `1px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {peerAvatar
                  ? <img src={peerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: C.green, fontSize: '1rem', fontWeight: 700 }}>{peerName.charAt(0).toUpperCase()}</span>
                }
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.green, fontSize: '0.78rem', fontWeight: 700 }}>جاري الاتصال…</div>
              <div style={{ color: C.textDim, fontSize: '0.67rem', marginTop: 2 }}>{peerName}</div>
            </div>
            {/* Cancel */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => { wsSend(JSON.stringify({ type: 'hangup', from: myId, to: peerId })); setPhase('idle'); }}
              style={{ width: 36, height: 36, borderRadius: '50%', background: C.redFaint, border: `1px solid ${C.redBorder}`, color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <X size={16} strokeWidth={2.5} />
            </motion.button>
          </motion.div>
        )}

        {/* ── RINGING — مكالمة واردة ── */}
        {phase === 'ringing' && (
          <motion.div key="ringing"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(6,14,14,0.97)', border: `1.5px solid ${C.greenBorder}`,
              borderRadius: 14, padding: '10px 14px',
              boxShadow: '0 4px 24px rgba(34,197,94,0.2)',
            }}>
            {/* Ringing avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {[0, 1].map(i => (
                <motion.div key={i}
                  animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.4 }}
                  style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `2px solid ${C.green}`, pointerEvents: 'none' }}
                />
              ))}
              <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'rgba(34,197,94,0.12)', border: `1px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                {peerAvatar
                  ? <img src={peerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: C.green, fontSize: '1rem', fontWeight: 700 }}>{peerName.charAt(0).toUpperCase()}</span>
                }
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.green, fontSize: '0.78rem', fontWeight: 700 }}>
                <PhoneIncoming size={12} style={{ display: 'inline', marginLeft: 4 }} />
                مكالمة واردة
              </div>
              <div style={{ color: C.text, fontSize: '0.72rem', marginTop: 2, fontWeight: 600 }}>{peerName}</div>
            </div>
            {/* Accept */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={acceptCall}
              style={{ width: 36, height: 36, borderRadius: '50%', background: C.greenFaint, border: `1px solid ${C.greenBorder}`, color: C.green, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PhoneCall size={16} strokeWidth={2.5} />
            </motion.button>
            {/* Decline */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={declineCall}
              style={{ width: 36, height: 36, borderRadius: '50%', background: C.redFaint, border: `1px solid ${C.redBorder}`, color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PhoneOff size={16} strokeWidth={2.5} />
            </motion.button>
          </motion.div>
        )}

        {/* ── CONNECTED — متصلان ── */}
        {phase === 'connected' && (
          <motion.div key="connected"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Remote speaking indicator */}
            <AnimatePresence>
              {remoteSpeaking && (
                <motion.div key="remote"
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.greenFaint, border: `1px solid ${C.greenBorder}`, borderRadius: 12, padding: '8px 12px' }}>
                  <IdleBars color={C.green} />
                  <span style={{ color: 'rgba(34,197,94,0.9)', fontSize: '0.72rem', fontWeight: 600 }}>
                    {peerName} يتحدث…
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main control bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: publishing ? 'rgba(6,14,14,0.97)' : C.primaryFaint,
              border: `1.5px solid ${publishing ? C.redBorder : C.primaryBorder}`,
              borderRadius: 14, padding: '10px 14px',
              boxShadow: publishing ? '0 4px 24px rgba(239,68,68,0.15)' : 'none',
              transition: 'all 0.2s',
            }}>

              {/* Mic button — PTT: اضغط مع الاستمرار للتحدث */}
              <motion.button
                onPointerDown={joining ? undefined : async () => {
                  const track = micTrackRef.current;
                  if (!track || publishing) return;
                  await track.setEnabled(true);
                  setPublishing(true);
                  startAnalyser(track);
                  startLatch();
                }}
                onPointerUp={joining ? undefined : async () => {
                  const track = micTrackRef.current;
                  if (!track || !publishing) return;
                  await track.setEnabled(false);
                  stopLatch();
                  stopAnalyser();
                  setPublishing(false);
                }}
                onPointerLeave={joining ? undefined : async () => {
                  // إذا خرج الإصبع من الزر أثناء الضغط — أوقف الميك
                  const track = micTrackRef.current;
                  if (!track || !publishing) return;
                  await track.setEnabled(false);
                  stopLatch();
                  stopAnalyser();
                  setPublishing(false);
                }}
                style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: publishing ? C.redFaint : joining ? 'rgba(255,255,255,0.04)' : 'rgba(0,188,212,0.08)',
                  border: `1.5px solid ${publishing ? C.redBorder : joining ? 'rgba(255,255,255,0.08)' : C.primaryBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: joining ? 'not-allowed' : 'pointer',
                  position: 'relative',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'none',
                }}>
                {publishing && (
                  <motion.div
                    animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0.08, 0.5] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                    style={{ position: 'absolute', inset: -5, borderRadius: 17, border: `1.5px solid ${C.red}`, pointerEvents: 'none' }}
                  />
                )}
                {joining
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' as const }}
                      style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${C.primary}`, borderTopColor: 'transparent' }} />
                  : publishing
                  ? <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.55, repeat: Infinity }}>
                      <Mic size={20} color={C.red} strokeWidth={2.5} />
                    </motion.div>
                  : <Mic size={20} color={C.primary} strokeWidth={2} />
                }
              </motion.button>

              {/* Status + waveform */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {joining ? (
                  <div style={{ color: C.textDim, fontSize: '0.78rem' }}>جاري الاتصال…</div>
                ) : publishing ? (
                  <>
                    <div style={{ color: C.red, fontSize: '0.78rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      أنت تتحدث
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: latchLeft <= 10 ? C.red : 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
                        {latchLeft}s
                      </span>
                    </div>
                    <SpeakingBars levels={micLevels} color={C.red} />
                  </>
                ) : (
                  <>
                    <div style={{ color: C.text, fontSize: '0.78rem', fontWeight: 600 }}>متصل — {peerName}</div>
                    <div style={{ color: C.textDim, fontSize: '0.67rem', marginTop: 2 }}>اضغط مع الاستمرار 🎤 للتحدث</div>
                  </>
                )}
              </div>

              {/* Mute + Hangup */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <motion.button whileTap={{ scale: 0.88 }} onClick={toggleMute}
                  style={{ width: 34, height: 34, borderRadius: 9, background: muted ? C.redFaint : 'rgba(0,188,212,0.06)', border: `1px solid ${muted ? C.redBorder : C.primaryBorder}`, color: muted ? C.red : C.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {muted ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
                </motion.button>

                <motion.button whileTap={{ scale: 0.88 }} onClick={() => hangup(true)}
                  style={{ width: 34, height: 34, borderRadius: 9, background: C.redFaint, border: `1px solid ${C.redBorder}`, color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PhoneOff size={15} strokeWidth={2} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}