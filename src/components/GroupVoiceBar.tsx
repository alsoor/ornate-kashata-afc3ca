/**
 * GroupVoiceBar — نظام صوت القروب عبر Agora RTC
 *
 * ✅ Agora RTC SDK v4 — dynamic import (لا static — يكسر SSR)
 * ✅ channel = "group-{groupId}"
 * ✅ floor/mutex: شخص واحد يتكلم في نفس الوقت (عبر /api/room/floor)
 * ✅ ذبذبات حقيقية من الميك (AudioAnalyser على MediaStreamTrack)
 * ✅ speaking indicator يظهر للجميع عبر WebSocket /ws/room-live
 * ✅ نقرة تفعّل — نقرة ثانية تلغي
 * ✅ mute/unmute عبر setEnabled(false/true) — الطريقة الصحيحة في SDK v4
 * ✅ بانر "لديك مكالمة جماعية" + زر Join منفصل
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, VolumeX, LogOut } from 'lucide-react';
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';
// Token is null in Testing Mode (App Certificate disabled)

interface GroupVoiceBarProps {
  groupId:          string;
  userId:           string;
  userName:         string;
  avatarUrl:        string;
  onJoinVoice?:     () => void;
  externalVolume?:  number;
  onSpeaking?:      (active: boolean) => void;
  autoJoin?:        boolean;     // ينضم تلقائياً فور mount بدون زر "انضم"
  channelOverride?: string;      // channel مباشر بدلاً من "group-{groupId}"
  joinLabel?:       string;      // نص زر الانضمام (افتراضي: "انضم للصوت")
  joinSubLabel?:    string;      // نص فرعي (افتراضي: "اضغط لتفعيل الميك والاستماع")
}

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
  blue:          '#3b82f6',
  blueFaint:     'rgba(59,130,246,0.12)',
  blueBorder:    'rgba(59,130,246,0.30)',
  text:          'rgba(200,240,245,0.92)',
  textDim:       'rgba(200,230,230,0.45)',
};

// ── Join sound + haptic ───────────────────────────────────────────────────────
/**
 * صفارة إنذار — تبدأ من بعيد (هادئة + تردد منخفض) وتقترب (أعلى + تردد أعلى)
 * تُشغَّل مرة واحدة عند اكتشاف مكالمة جماعية حية
 */
function playLiveCallAlert() {
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.connect(ctx.destination);

    // المرحلة 1 — من بعيد: صوت خافت + تردد منخفض يصعد ببطء
    const osc1  = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    // تردد يصعد من 180 → 520 Hz خلال 1.2 ثانية (تأثير الاقتراب)
    osc1.frequency.setValueAtTime(180, ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(520, ctx.currentTime + 1.2);
    // حجم يبدأ صفر ويرتفع تدريجياً (من بعيد → قريب)
    gain1.gain.setValueAtTime(0, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.3);
    gain1.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);
    osc1.connect(gain1); gain1.connect(master);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 1.2);

    // المرحلة 2 — وصول: نبضتان حادتان (woop woop)
    [1.25, 1.55].forEach((startAt, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      // كل نبضة تصعد من 600 → 900 Hz
      osc.frequency.setValueAtTime(600 + i * 40, ctx.currentTime + startAt);
      osc.frequency.linearRampToValueAtTime(900 + i * 40, ctx.currentTime + startAt + 0.22);
      gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + startAt + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.28);
      osc.connect(gain); gain.connect(master);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + 0.3);
    });

    // إغلاق الـ context بعد انتهاء الصوت
    setTimeout(() => ctx.close(), 2200);
  } catch { /* صامت إذا رفض المتصفح */ }
}

function playJoinSound() {
  try {
    const ctx = new AudioContext();
    // نغمة "دخول" — نوتتان صاعدتان
    const times = [0, 0.12];
    const freqs = [440, 660];
    times.forEach((t, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

function playLeaveSound() {
  try {
    const ctx = new AudioContext();
    const times = [0, 0.12];
    const freqs = [660, 440];
    times.forEach((t, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

function triggerHaptic() {
  try { navigator.vibrate?.([30, 20, 60]); } catch {}
}
function SpeakingBars({ levels, color }: { levels: number[]; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          width: 3,
          height: Math.max(3, (levels[i] ?? 0.3) * 16),
          borderRadius: 2,
          background: color,
          transformOrigin: 'bottom',
          transition: 'height 0.08s ease',
        }} />
      ))}
    </div>
  );
}

// ── Animated idle bars ────────────────────────────────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────
export default function GroupVoiceBar({
  groupId, userId, userName, avatarUrl,
  onJoinVoice, externalVolume, onSpeaking, autoJoin = true, channelOverride,
  joinLabel = 'انضم للصوت', joinSubLabel = 'اضغط لتفعيل الميك والاستماع',
}: GroupVoiceBarProps) {
  const channel = channelOverride ?? `group-${groupId}`;

  const [joined,      setJoined]      = useState(false);
  const [joining,     setJoining]     = useState(false); // Agora join in progress
  const [publishing,  setPublishing]  = useState(false); // I am speaking
  const [muted,       setMuted]       = useState(false);
  const [floorDenied] = useState(false);
  const [permError]   = useState(false);
  const [micLevels,   setMicLevels]   = useState<number[]>([0.3, 0.3, 0.3, 0.3]);
  const [_speakers,   setSpeakers]    = useState<Map<string, string>>(new Map());
  const [floor,       setFloor]       = useState<string | null>(null);

  // ── Live call indicator — يراقب هل في مكالمة جماعية حية ──────────────────
  const [callActive,      setCallActive]      = useState(false);
  const [callMemberCount, setCallMemberCount] = useState(0);
  const activeCallPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCallActiveRef  = useRef(false); // لتشغيل الصوت مرة واحدة عند الانتقال false→true

  const joinedRef      = useRef(false);
  const joinedReadyRef = useRef(false); // true only after client.join() resolves
  const publishingRef  = useRef(false);
  const mutedRef      = useRef(false);
  void useRef(false); // takingRef removed — solo PTT disabled
  const floorRef      = useRef<string | null>(null);

  // ── Latch / 30-second auto-cutoff ────────────────────────────────────────
  const LATCH_MAX_SECONDS = 30;
  const latchTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [latchSecondsLeft, setLatchSecondsLeft] = useState(LATCH_MAX_SECONDS);

  // Agora refs
  const clientRef     = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef   = useRef<IMicrophoneAudioTrack | null>(null);

  // Analyser refs (for waveform from local mic)
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);

  // WebSocket for speaking indicators (floor signaling)
  const wsRef   = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hbRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-join on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (autoJoin && userId && !joinedRef.current) {
      handleJoin();
    }
  }, [autoJoin, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll active-call status (للمستخدمين غير المنضمين) ────────────────────
  useEffect(() => {
    async function checkActive() {
      try {
        const r = await fetch(`/api/room/active-call?channel=${encodeURIComponent(channel)}`);
        if (r.ok) {
          const d = await r.json() as { active: boolean; memberCount: number };
          setCallActive(d.active);
          setCallMemberCount(d.memberCount);

          // شغّل صفارة الإنذار مرة واحدة عند أول اكتشاف للمكالمة (false → true)
          // فقط إذا لم يكن المستخدم منضماً بالفعل
          if (d.active && !prevCallActiveRef.current && !joinedRef.current) {
            playLiveCallAlert();
          }
          prevCallActiveRef.current = d.active;
        }
      } catch {}
    }
    checkActive();
    activeCallPollRef.current = setInterval(checkActive, 3000);
    return () => {
      if (activeCallPollRef.current) clearInterval(activeCallPollRef.current);
    };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent when speaking state changes ──────────────────────────────
  useEffect(() => {
    onSpeaking?.(floor !== null || publishing);
  }, [floor, publishing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync remote volume via Agora volume control ────────────────────────────
  const effectiveVol = externalVolume !== undefined ? externalVolume : 1;
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    client.remoteUsers.forEach(u => {
      u.audioTrack?.setVolume(Math.round(effectiveVol * 100));
    });
  }, [effectiveVol]);

  // ── Safe WS send — only fires when socket is fully OPEN ─────────────────────
  function wsSend(data: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  // ── Connect WebSocket for floor/speaking signals ───────────────────────────
  function connectWS() {
    if (wsRef.current) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url   = `${proto}//${location.host}/ws/room-live?room=${encodeURIComponent(channel)}&userId=${encodeURIComponent(userId)}`;
    const ws    = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', userId, name: userName, mime: 'agora' }));
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) return; // ignore binary (Agora handles audio)
      try {
        const msg = JSON.parse(e.data as string) as { type: string; userId?: string; name?: string };
        if (msg.type === 'speaking' && msg.userId) {
          setSpeakers(prev => { const n = new Map(prev); n.set(msg.userId!, msg.name ?? msg.userId!); return n; });
          floorRef.current = msg.userId!;
          setFloor(msg.userId!);
        } else if (msg.type === 'silent' && msg.userId) {
          setSpeakers(prev => { const n = new Map(prev); n.delete(msg.userId!); return n; });
          if (floorRef.current === msg.userId) floorRef.current = null;
          setFloor(f => f === msg.userId ? null : f);
        } else if (msg.type === 'peer_left' && msg.userId) {
          setSpeakers(prev => { const n = new Map(prev); n.delete(msg.userId!); return n; });
          if (floorRef.current === msg.userId) floorRef.current = null;
          setFloor(f => f === msg.userId ? null : f);
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (joinedRef.current) {
        setTimeout(() => { if (joinedRef.current && !wsRef.current) connectWS(); }, 2000);
      }
    };
    ws.onerror = () => { wsRef.current = null; };
  }

  // ── Snapshot poll (floor state) ──────────────────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    try {
      const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`);
      if (r.ok) {
        const d = await r.json() as { floor?: string | null; members?: { userId: string; name: string }[] };
        const newFloor = d.floor ?? null;
        floorRef.current = newFloor;
        setFloor(newFloor);
        if (newFloor && newFloor !== userId) {
          const member = d.members?.find(m => m.userId === newFloor);
          if (member) {
            setSpeakers(prev => {
              if (prev.has(newFloor)) return prev;
              const n = new Map(prev); n.set(newFloor, member.name ?? newFloor); return n;
            });
          }
        }
        if (!newFloor) setSpeakers(new Map());
      }
    } catch {}
  }, [channel, userId]);

  useEffect(() => {
    if (!joined) return;
    fetchSnapshot();
    pollRef.current = setInterval(fetchSnapshot, 2000);
    const hb = () => fetch('/api/room/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId }),
    }).catch(() => {});
    hb();
    hbRef.current = setInterval(hb, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (hbRef.current)   clearInterval(hbRef.current);
    };
  }, [joined, channel, userId, fetchSnapshot]);

  // ── Mic analyser (waveform from local MediaStreamTrack) ───────────────────
  function startAnalyser(track: IMicrophoneAudioTrack) {
    try {
      const ctx      = new AudioContext();
      audioCtxRef.current = ctx;
      const mediaStream = new MediaStream([track.getMediaStreamTrack()]);
      const src      = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / 4);
        const levels = [0, 1, 2, 3].map(i => Math.max(0.08, (data[i * step] ?? 0) / 255));
        setMicLevels(levels);
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      analyserRafRef.current = requestAnimationFrame(tick);
    } catch {}
  }

  function stopAnalyser() {
    if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
    analyserRafRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevels([0.3, 0.3, 0.3, 0.3]);
  }

  // ── Join Agora channel ────────────────────────────────────────────────────
  async function handleJoin() {
    if (joined || joining) return;

    // إذا كان يتحدث فردياً — أوقف البث أولاً قبل الانضمام للجماعي
    if (micTrackRef.current) await stopPublishing();

    // نغمة + haptic عند الضغط على Join
    playJoinSound();
    triggerHaptic();

    // Register in room DB
    fetch('/api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId, name: userName }),
    }).catch(() => {});

    setJoined(true);
    onJoinVoice?.();

    // إذا كان Agora جاهزاً بالفعل من solo PTT — لا نعيد الانضمام
    if (joinedReadyRef.current && clientRef.current) {
      joinedRef.current = true;
      return;
    }

    joinedRef.current = true;
    setJoining(true);
    connectWS();

    try {
      // Dynamic import — MUST NOT be static (crashes SSR/Node)
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3); // warnings only

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      clientRef.current = client;

      // stability: monitor network quality
      client.on("network-quality", (stats: any) => {
        if (stats.uplinkNetworkQuality >= 5 || stats.downlinkNetworkQuality >= 5) {
          console.warn("[GroupVoiceBar] Poor network connection detected.");
        }
      });

      // stability: handle reconnection
      client.on("connection-state-change", (cur: string, prev: string, reason: string) => {
        if (cur === 'RECONNECTING') console.log("[GroupVoiceBar] Reconnecting...");
        if (cur === 'CONNECTED')    console.log("[GroupVoiceBar] Connected");
      });

      // ── Remote user joined → subscribe to audio ──────────────────────────
      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType !== 'audio') return;
        await client.subscribe(user, 'audio');
        user.audioTrack?.setVolume(Math.round(effectiveVol * 100));
        if (!mutedRef.current) user.audioTrack?.play();

        // أول peer ينضم → حوّل الصوت من سماعة الأذن للسبيكر الخارجي
        if (audioOutputRef.current === 'earpiece') {
          await routeAudioOutput('speaker');
          // وميض أيقونة السبيكر لمدة 2 ثانية
          setPeerJoinFlash(true);
          setTimeout(() => setPeerJoinFlash(false), 2000);
        }
      });

      client.on('user-unpublished', (user: IAgoraRTCRemoteUser) => {
        user.audioTrack?.stop();
      });

      client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        user.audioTrack?.stop();
        setSpeakers(prev => { const n = new Map(prev); n.delete(String(user.uid)); return n; });
        if (floorRef.current === String(user.uid)) {
          floorRef.current = null;
          setFloor(null);
        }
      });

      // Fetch token (null in Testing Mode)
      const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`, { credentials: 'include' });
      if (!tokenRes.ok) throw new Error('Unable to secure the voice connection.');
      const { token, uid } = await tokenRes.json() as { token: string; uid: number };

      // The signed token and join call must use the exact same numeric UID.
      await client.join(AGORA_APP_ID, channel, token, uid);

      // Stability: Set high-fidelity audio profile
      await (client as any).setAudioProfile('music_standard', 'game_streaming');

      // ✅ Agora channel ready
      joinedReadyRef.current = true;

      // ── Open Mic: ننشر الميك تلقائياً بعد الانضمام (روم مفتوح) ──────────
      try {
        const AgoraRTCForMic = (await import('agora-rtc-sdk-ng')).default;
        const micTrack = await AgoraRTCForMic.createMicrophoneAudioTrack({
          encoderConfig: 'music_standard',
        });
        micTrackRef.current = micTrack;
        // إذا كان المستخدم كاتم الصوت — نبدأ مكتوماً
        if (groupMicMutedRef.current) {
          await micTrack.setEnabled(false);
        }
        await client.publish([micTrack]);
        publishingRef.current = true;
        setPublishing(true);
        startAnalyser(micTrack);
        wsSend(JSON.stringify({ type: 'start', userId }));
      } catch (micErr) {
        console.warn('[GroupVoiceBar] open-mic publish failed:', micErr);
      }

    } catch (err) {
      console.error('[GroupVoiceBar] Agora join error:', err);
      joinedRef.current = false;
      setJoined(false);
    } finally {
      setJoining(false);
    }
  }



  // ── Stop publishing ───────────────────────────────────────────────────────
  async function stopPublishing() {
    if (!micTrackRef.current) return;
    const track = micTrackRef.current;
    micTrackRef.current = null;
    publishingRef.current = false;
    setPublishing(false);

    // ── Clear latch countdown ─────────────────────────────────────────────
    if (latchTimerRef.current) clearInterval(latchTimerRef.current);
    latchTimerRef.current = null;
    setLatchSecondsLeft(LATCH_MAX_SECONDS);

    try {
      await clientRef.current?.unpublish([track]);
      track.stop();
      track.close();
    } catch {}

    stopAnalyser();

    wsSend(JSON.stringify({ type: 'stop', userId }));
    floorRef.current = null;
    setFloor(null);

    await fetch('/api/room/floor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, action: 'forceRelease', userId }),
    }).catch(() => {});
  }

  // ── Toggle group mic mute (open-mic mode) ────────────────────────────────
  async function toggleGroupMic() {
    const newMuted = !groupMicMutedRef.current;
    groupMicMutedRef.current = newMuted;
    setGroupMicMuted(newMuted);
    if (micTrackRef.current) {
      await micTrackRef.current.setEnabled(!newMuted).catch(() => {});
    }
  }

  // ── Leave Agora channel completely ───────────────────────────────────────
  async function handleLeave() {
    if (!joinedRef.current) return;
    playLeaveSound();
    triggerHaptic();

    // Stop publishing first if active
    if (micTrackRef.current) await stopPublishing();

    joinedRef.current = false;
    joinedReadyRef.current = false;
    setJoined(false);
    setPublishing(false);
    setFloor(null);
    setSpeakers(new Map());
    // إعادة الـ routing لسماعة الأذن عند الخروج
    audioOutputRef.current = 'earpiece';
    setAudioOutput('earpiece');
    // إعادة ضبط كتم الميك
    groupMicMutedRef.current = false;
    setGroupMicMuted(false);

    wsRef.current?.close();
    wsRef.current = null;

    try { await clientRef.current?.leave(); } catch {}
    clientRef.current = null;

    fetch('/api/room/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId }),
    }).catch(() => {});
  }


  // ── Toggle mute (speaker) — setEnabled on remote tracks ──────────────────
  function toggleMute() {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    clientRef.current?.remoteUsers.forEach(u => {
      if (next) u.audioTrack?.stop();
      else      u.audioTrack?.play();
    });
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (joinedRef.current) {
        // Fire-and-forget cleanup
        void (async () => {
          if (micTrackRef.current) {
            try { await clientRef.current?.unpublish([micTrackRef.current]); } catch {}
            micTrackRef.current.stop();
            micTrackRef.current.close();
            micTrackRef.current = null;
          }
          wsRef.current?.close();
          try { await clientRef.current?.leave(); } catch {}
          clientRef.current = null;
          fetch('/api/room/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: channel, userId }),
          }).catch(() => {});
        })();
      }
      stopAnalyser();
      if (pollRef.current) clearInterval(pollRef.current);
      if (hbRef.current)   clearInterval(hbRef.current);
      if (latchTimerRef.current) clearInterval(latchTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio output routing (earpiece → speaker on peer join) ──────────────
  const [audioOutput, setAudioOutput] = useState<'earpiece' | 'speaker'>('earpiece');
  const audioOutputRef = useRef<'earpiece' | 'speaker'>('earpiece');
  const [peerJoinFlash, setPeerJoinFlash] = useState(false);

  // ── Group mic mute (open-mic mode — كتم/فتح الميك أثناء المكالمة) ────────
  const [groupMicMuted, setGroupMicMuted] = useState(false);
  const groupMicMutedRef = useRef(false); // وميض أيقونة السبيكر

  /** يحوّل كل الـ audio tracks النشطة للـ output المطلوب */
  async function routeAudioOutput(mode: 'earpiece' | 'speaker') {
    audioOutputRef.current = mode;
    setAudioOutput(mode);
    const sinkId = mode === 'speaker' ? '' : 'default'; // '' = default speaker, 'default' = earpiece
    try {
      const client = clientRef.current;
      if (!client) return;
      for (const u of client.remoteUsers) {
        const track = u.audioTrack;
        if (!track) continue;
        // Agora IRemoteAudioTrack exposes setPlaybackDevice
        const el = (track as any)._mediaStreamTrack ?? null;
        if (el) {
          // Try HTMLAudioElement setSinkId if available
          const audioEl = (track as any)._player?._audioElement as HTMLAudioElement | undefined;
          if (audioEl && typeof audioEl.setSinkId === 'function') {
            await audioEl.setSinkId(sinkId).catch(() => {});
          }
        }
        // Agora v4 direct API
        if (typeof (track as any).setPlaybackDevice === 'function') {
          await (track as any).setPlaybackDevice(sinkId).catch(() => {});
        }
      }
    } catch { /* best-effort */ }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const iAmSpeaking   = publishing;


  const floorBusy     = floor !== null && floor !== userId;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* ══ إشعار "مكالمة جماعية حية" — للمستخدمين غير المنضمين ══ */}
      <AnimatePresence>
        {callActive && !joined && (
          <motion.div
            key="live-call-notice"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(10,18,22,0.96)',
              border: '1.5px solid rgba(34,197,94,0.35)',
              borderRadius: 14, padding: '9px 12px',
              boxShadow: '0 2px 20px rgba(34,197,94,0.10)',
            }}>

            {/* نبضة حية */}
            <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
              <motion.div
                animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: '#22c55e', pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: '#22c55e' }} />
            </div>

            {/* ذبذبات ملونة */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 18, flexShrink: 0 }}>
              {[
                { color: '#22c55e', delay: 0,    h: [0.3,1,0.5,0.8,0.3] },
                { color: '#22c55e', delay: 0.1,  h: [0.7,0.3,1,0.4,0.6] },
                { color: '#eab308', delay: 0.18, h: [1,0.5,0.3,0.9,0.4] },
                { color: '#eab308', delay: 0.08, h: [0.4,0.9,0.6,0.3,1] },
                { color: '#ef4444', delay: 0.22, h: [0.6,0.3,1,0.5,0.7] },
                { color: '#ef4444', delay: 0.14, h: [0.3,0.8,0.4,1,0.3] },
              ].map((bar, i) => (
                <motion.div key={i}
                  animate={{ scaleY: bar.h }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: bar.delay, ease: 'easeInOut' as const }}
                  style={{ width: 3, height: 18, borderRadius: 2, background: bar.color, transformOrigin: 'bottom', opacity: 0.9 }}
                />
              ))}
            </div>

            {/* نص */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(134,239,172,0.95)', fontSize: '0.78rem', fontWeight: 700, direction: 'rtl' }}>
                مكالمة جماعية حية
              </div>
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.67rem', marginTop: 1, direction: 'rtl' }}>
                {callMemberCount} {callMemberCount === 1 ? 'شخص' : 'أشخاص'} في المكالمة — اضغط Join للانضمام
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ بانر "لديك مكالمة جماعية" — يظهر فقط عند joined ══ */}
      <AnimatePresence>
        {joined && (
          <motion.div
            key="group-banner"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(10,18,22,0.95)',
              border: '1.5px solid rgba(34,197,94,0.30)',
              borderRadius: 14, padding: '9px 12px',
              boxShadow: '0 2px 16px rgba(34,197,94,0.08)',
            }}>

            {/* ذبذبات ملونة — أخضر / أصفر / أحمر */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, flexShrink: 0 }}>
              {[
                { color: '#22c55e', delay: 0,    heights: [0.3, 1, 0.5, 0.8, 0.3] },
                { color: '#22c55e', delay: 0.1,  heights: [0.6, 0.3, 1, 0.4, 0.7] },
                { color: '#eab308', delay: 0.18, heights: [1, 0.5, 0.3, 0.9, 0.4] },
                { color: '#eab308', delay: 0.08, heights: [0.4, 0.9, 0.6, 0.3, 1] },
                { color: '#ef4444', delay: 0.22, heights: [0.7, 0.3, 1, 0.5, 0.6] },
                { color: '#ef4444', delay: 0.14, heights: [0.3, 0.8, 0.4, 1, 0.3] },
              ].map((bar, i) => (
                <motion.div key={i}
                  animate={{ scaleY: bar.heights }}
                  transition={{ duration: 0.65, repeat: Infinity, delay: bar.delay, ease: 'easeInOut' as const }}
                  style={{
                    width: 3, height: 18, borderRadius: 2,
                    background: bar.color,
                    transformOrigin: 'bottom',
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>

            {/* أيقونة السبيكر — تظهر وتومض عند تحويل الصوت للسبيكر الخارجي */}
            <AnimatePresence>
              {audioOutput === 'speaker' && (
                <motion.div
                  key="speaker-icon"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={peerJoinFlash
                    ? { opacity: [1, 0.2, 1, 0.2, 1], scale: [1, 1.3, 1, 1.3, 1] }
                    : { opacity: 1, scale: 1 }
                  }
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: peerJoinFlash ? 0.8 : 0.2 }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: peerJoinFlash ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.12)',
                    border: `1.5px solid ${peerJoinFlash ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.30)'}`,
                    boxShadow: peerJoinFlash ? '0 0 12px rgba(34,197,94,0.50)' : 'none',
                    transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
                  }}>
                  <Volume2 size={14} color="#22c55e" strokeWidth={2.2} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* نص */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(134,239,172,0.95)', fontSize: '0.78rem', fontWeight: 700, direction: 'rtl' }}>
                لديك مكالمة جماعية
              </div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.67rem', marginTop: 1, direction: 'rtl' }}>
                {groupMicMuted
                  ? 'ميكك مكتوم — اضغط لفتحه'
                  : audioOutput === 'speaker'
                  ? 'مفتوح — الصوت على السبيكر'
                  : 'مفتوح — الصوت على السماعة'}
              </div>
            </div>

            {/* زر كتم/فتح الميك — open mic mode */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={toggleGroupMic}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: groupMicMuted ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)',
                border: `1.5px solid ${groupMicMuted ? 'rgba(239,68,68,0.50)' : 'rgba(34,197,94,0.40)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: groupMicMuted ? '0 0 10px rgba(239,68,68,0.25)' : '0 0 8px rgba(34,197,94,0.20)',
              }}>
              {groupMicMuted
                ? <MicOff size={16} color="#ef4444" strokeWidth={2.2} />
                : <Mic    size={16} color="#22c55e" strokeWidth={2.2} />
              }
            </motion.button>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW الوحيد — الميك الفردي + المربع الأزرق (Join/Leave جماعي) في نهايته
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(10,18,22,0.92)',
        border: `1.5px solid ${iAmSpeaking ? C.redBorder : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 16, padding: '10px 10px',
        boxShadow: iAmSpeaking ? '0 4px 24px rgba(239,68,68,0.12)' : 'none',
        transition: 'border-color 0.25s, box-shadow 0.25s',
      }}>

        {/* Status text + waveform */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {joining ? (
            <div style={{ color: C.textDim, fontSize: '0.78rem', direction: 'rtl' }}>جاري الاتصال…</div>
          ) : joined ? (
            <>
              <div style={{ color: 'rgba(134,239,172,0.9)', fontSize: '0.78rem', fontWeight: 700, direction: 'rtl' }}>أنت في المكالمة الجماعية</div>
              <div style={{ color: C.textDim, fontSize: '0.67rem', marginTop: 1, direction: 'rtl' }}>الميك الفردي معطّل — اضغط خروج للتحدث فردياً</div>
            </>
          ) : iAmSpeaking ? (
            <>
              <div style={{ color: C.red, fontSize: '0.78rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, direction: 'rtl' }}>
                جاري البث — الجميع يسمعك
                <span style={{
                  fontSize: '0.68rem', fontWeight: 600,
                  color: latchSecondsLeft <= 10 ? C.red : 'rgba(239,68,68,0.6)',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 6, padding: '1px 6px', flexShrink: 0,
                }}>
                  {latchSecondsLeft}s
                </span>
              </div>
              <SpeakingBars levels={micLevels} color={C.red} />
            </>
          ) : floorDenied ? (
            <div style={{ color: C.red, fontSize: '0.78rem', fontWeight: 600, direction: 'rtl' }}>الميك مشغول — انتظر</div>
          ) : floorBusy ? (
            <div style={{ color: C.textDim, fontSize: '0.78rem', direction: 'rtl' }}>شخص آخر يتحدث الآن</div>
          ) : permError ? (
            <div style={{ color: C.red, fontSize: '0.78rem', direction: 'rtl' }}>لا يوجد إذن للميكروفون</div>
          ) : (
            <>
              <div style={{ color: C.text, fontSize: '0.78rem', fontWeight: 600, direction: 'rtl' }}>اضغط للتحدث</div>
              <div style={{ color: C.textDim, fontSize: '0.67rem', marginTop: 2, direction: 'rtl' }}>يُغلق تلقائياً بعد 30 ثانية أو عند الخروج</div>
            </>
          )}
        </div>

        {/* زر السبيكر — يظهر دائماً */}
        <motion.button whileTap={{ scale: 0.88 }}
          onClick={toggleMute}
          title={muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
          style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: muted ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${muted ? C.redBorder : 'rgba(255,255,255,0.10)'}`,
            color: muted ? C.red : C.textDim,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {muted ? <VolumeX size={18} strokeWidth={2} /> : <Volume2 size={18} strokeWidth={2} />}
        </motion.button>

        {/* ── الزر الأخير: مربع أزرق (Join جماعي) ↔ خروج أحمر (عند البث) ── */}
        <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0, overflow: 'visible' }}>

          {/* ═══ ذبذبات المكالمة الحية — 3 حلقات ملونة تخرج للخارج ═══ */}
          {callActive && !joined && !joining && !iAmSpeaking && (
            <>
              {[
                { color: '#22c55e', delay: 0,   dur: 1.2, maxScale: 2.0 },
                { color: '#eab308', delay: 0.35, dur: 1.2, maxScale: 2.6 },
                { color: '#ef4444', delay: 0.7,  dur: 1.2, maxScale: 3.3 },
              ].map((ring, i) => (
                <motion.div key={`live-ring-${i}`}
                  animate={{ scale: [1, ring.maxScale, 1], opacity: [0.85, 0, 0.85] }}
                  transition={{ duration: ring.dur, repeat: Infinity, delay: ring.delay, ease: 'easeOut' as const }}
                  style={{
                    position: 'absolute',
                    inset: -3,
                    borderRadius: 14,
                    border: `2.5px solid ${ring.color}`,
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              ))}
            </>
          )}

          {/* وميض أزرق — الحالة العادية (لا مكالمة حية) */}
          {!iAmSpeaking && !joined && !joining && !callActive && (
            <motion.div
              animate={{ scale: [1, 1.7, 1], opacity: [0.45, 0, 0.45] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              style={{
                position: 'absolute', inset: -5, borderRadius: 16,
                border: `1.5px solid ${C.blue}`, pointerEvents: 'none',
              }}
            />
          )}

          {/* وميض أخضر — بعد الانضمام للجماعي */}
          {!iAmSpeaking && joined && (
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                position: 'absolute', inset: -5, borderRadius: 16,
                border: `1.5px solid ${C.green}`, pointerEvents: 'none',
              }}
            />
          )}

          <AnimatePresence mode="wait">
            {iAmSpeaking ? (
              /* خروج أحمر — عند البث الفردي */
              <motion.button key="exit-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.88 }}
                onClick={() => stopPublishing()}
                style={{
                  position: 'relative', zIndex: 1,
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(239,68,68,0.18)',
                  border: `1.5px solid ${C.redBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(239,68,68,0.30)',
                }}>
                <span style={{ color: C.red, fontSize: '0.72rem', fontWeight: 700 }}>خروج</span>
              </motion.button>
            ) : (
              /* مربع أزرق/أخضر/أحمر — Join أو Leave للجماعي */
              <motion.button key="join-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.88 }}
                onClick={joining ? undefined : joined ? () => handleLeave() : handleJoin}
                style={{
                  position: 'relative', zIndex: 1,
                  width: 44, height: 44, borderRadius: 12,
                  background: joined
                    ? 'rgba(239,68,68,0.12)'
                    : joining
                    ? 'rgba(59,130,246,0.08)'
                    : callActive
                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  border: `1.5px solid ${joined ? C.redBorder : callActive ? '#22c55e' : C.blueBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: joining ? 'not-allowed' : 'pointer',
                  boxShadow: joined
                    ? '0 2px 10px rgba(239,68,68,0.25)'
                    : joining ? 'none'
                    : callActive
                    ? '0 0 20px rgba(34,197,94,0.70), 0 2px 10px rgba(34,197,94,0.40)'
                    : '0 2px 14px rgba(59,130,246,0.45)',
                }}>
                {joining
                  ? <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' as const }}
                      style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${C.blue}`, borderTopColor: 'transparent' }}
                    />
                  : joined
                  ? <LogOut size={18} color={C.red} strokeWidth={2.2} />
                  : callActive
                  ? <span style={{ color: '#fff', fontSize: '0.68rem', fontWeight: 800, letterSpacing: 0.5 }}>Join</span>
                  : (
                    /* أيقونة ثلاثة أشخاص — group */
                    <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* الشخص الأوسط */}
                      <circle cx="11" cy="5" r="2.8" fill="#fff" />
                      <path d="M6.5 17c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                      {/* الشخص الأيسر */}
                      <circle cx="4" cy="6.5" r="2.2" fill="rgba(255,255,255,0.80)" />
                      <path d="M0.5 17c0-1.933 1.567-3.5 3.5-3.5 .6 0 1.16.16 1.64.43" stroke="rgba(255,255,255,0.80)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                      {/* الشخص الأيمن */}
                      <circle cx="18" cy="6.5" r="2.2" fill="rgba(255,255,255,0.80)" />
                      <path d="M21.5 17c0-1.933-1.567-3.5-3.5-3.5-.6 0-1.16.16-1.64.43" stroke="rgba(255,255,255,0.80)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                    </svg>
                  )
                }
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}