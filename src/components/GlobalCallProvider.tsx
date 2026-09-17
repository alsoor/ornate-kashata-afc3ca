/**
 * GlobalCallProvider
 *
 * Lives in App.tsx above all pages.
 * Opens /ws/call-signal as soon as the user logs in and keeps it alive.
 *
 * Renders:
 *   • CallNotificationBanner  — incoming call heads-up (private or conference)
 *   • CallScreen              — full-screen two-way call UI, defined below in
 *                               this same file (Agora 'rtc' mode — both peers
 *                               publish + subscribe). Stays mounted for the
 *                               whole call, even while minimized, so audio
 *                               never drops. Unrelated to /live.tsx, which is
 *                               a separate "Go Live" broadcast room feature.
 *   • FloatingCallBar         — minimized pill when call is minimized
 *
 * Exposes useGlobalCall() hook for any component that needs call state.
 */
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useSession } from '@/lib/auth/auth-client';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, ChevronDown, Users, Video, VideoOff } from 'lucide-react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import CallNotificationBanner from '@/components/CallNotificationBanner';
import FloatingCallBar from '@/components/FloatingCallBar';

// ── Context shape ─────────────────────────────────────────────────────────────
interface GlobalCallCtx {
  callWs: WebSocket | null;
  wsSend: (msg: object) => void;
  startCall: (opts: {
    peerId: string;
    peerName: string;
    peerUsername?: string;
    peerAvatar: string | null;
    isConference?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  }) => void;
  endCall: () => void;
  activeCall: {
    peerId: string;
    peerName: string;
    peerUsername?: string;
    peerAvatar: string | null;
    isCaller: boolean;
    isConference?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  } | null;
  incomingCaller: {
    id: string;
    name: string;
    username?: string;
    avatar: string | null;
    isGroup?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  } | null;
  acceptCall: () => void;
  declineCall: () => void;
  /** Minimise the full CallScreen to the floating bar */
  minimizeCall: () => void;
  /** Expand the floating bar back to full CallScreen */
  expandCall: () => void;
  isMinimized: boolean;
  /** Elapsed seconds since call connected (for FloatingCallBar) */
  callElapsed: number;
  /** Whether the remote peer is currently speaking */
  remoteSpeaking: boolean;
  /** Expose conferenceParticipantIds for FriendPickerModal compat */
  conferenceParticipantIds: Set<string>;
}
const Ctx = createContext<GlobalCallCtx>({
  callWs: null,
  wsSend: () => {},
  startCall: () => {},
  endCall: () => {},
  activeCall: null,
  incomingCaller: null,
  acceptCall: () => {},
  declineCall: () => {},
  minimizeCall: () => {},
  expandCall: () => {},
  isMinimized: false,
  callElapsed: 0,
  remoteSpeaking: false,
  conferenceParticipantIds: new Set<string>()
});
export function useGlobalCall() {
  return useContext(Ctx);
}

function fmtCallTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── CallScreen ────────────────────────────────────────────────────────────────
// Full-screen two-way voice call UI. Mounted for the entire lifetime of an
// active call (even while minimized to FloatingCallBar) so the Agora
// connection never drops. Uses 'rtc' mode — both peers are equal
// publishers/subscribers (unlike /live.tsx's host/audience 'live' mode,
// which is an unrelated "Go Live" broadcast room feature).
function CallScreen({
  visible,
  activeCall,
  wsSend,
  endCall,
  minimizeCall,
  callElapsed,
  remoteSpeaking,
  user,
  onConnectedChange,
}: {
  visible: boolean;
  activeCall: {
    peerId: string;
    peerName: string;
    peerUsername?: string;
    peerAvatar: string | null;
    isCaller: boolean;
    isConference?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  };
  wsSend: (msg: object) => void;
  endCall: () => void;
  minimizeCall: () => void;
  callElapsed: number;
  remoteSpeaking: boolean;
  user: any;
  /** يبلّغ الـ Provider أول ما الطرف الثاني ينضم فعليًا — هذا هو المشغّل
   *  الوحيد المسموح لعدّاد المدة (callElapsed)، مو مجرد الضغط على اتصال. */
  onConnectedChange: (connected: boolean) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [micError, setMicError] = useState(false);
  const [cameraOn, setCameraOn] = useState(activeCall.callType === 'video');
  const [cameraError, setCameraError] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const cameraTrackRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLDivElement | null>(null);
  const joinedChannelRef = useRef<string | null>(null);
  // الـ uid الرقمي الفعلي اللي انضمينا فيه للقناة — لازم يطابق نفس الـ uid
  // اللي اتولّد فيه توكن Agora، مو user.id النصي. تُستخدم للمقارنة بمؤشر
  // "أنا أتكلم" (volume-indicator يرجّع uid رقمي من Agora نفسه).
  const joinUidRef = useRef<number>(0);
  // رنين الاتصال الصادر (نغمة انتظار للمتصل نفسه لحد ما الطرف الثاني يرد)
  const ringbackCtxRef = useRef<AudioContext | null>(null);
  const ringbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const channel = activeCall.channel;
  const peerId = activeCall.peerId;

  useEffect(() => {
    if (!channel || !user?.id) return;
    if (joinedChannelRef.current === channel) return;
    joinedChannelRef.current = channel;
    let cancelled = false;

    (async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === 'audio') remoteUser.audioTrack?.play();
          if (mediaType === 'video' && remoteVideoRef.current) remoteUser.videoTrack?.play(remoteVideoRef.current);
        });
        client.on('user-joined', () => { if (!cancelled) setConnected(true); });
        client.on('user-left', () => { if (!cancelled) setConnected(false); });

        client.enableAudioVolumeIndicator();
        client.on('volume-indicator', (vols: Array<{ uid: string | number; level: number }>) => {
          vols.forEach(v => {
            // قارن بالـ uid الرقمي الفعلي اللي انضمينا فيه (joinUidRef)،
            // مو user.id النصي — Agora يرجّع uid رقمي دايمًا بهالحدث.
            if (String(v.uid) === String(joinUidRef.current)) setLocalSpeaking(v.level > 12);
          });
        });

        // ── توكن Agora حقيقي — بنفس أسلوب LiveVoiceBanner/DmPttBar المُثبت
        //    إنه شغال. تمرير null هنا كان يفشل بصمت لو المشروع مفعّل له
        //    App Certificate (شبه مؤكد، لأن فيه إندبوينت توكنات أصلًا). ──
        //
        // ⚠️ حرج: السيرفر يرجّع uid رقمي مُشتق بخوارزمية hash خاصة (مو
        //    user.id النصي) ويوثّق صراحة إن العميل *لازم* يستخدم نفس الـ uid
        //    الراجع عند client.join()، وإلا Agora يرفض التوكن لعدم تطابقه
        //    مع uid الانضمام → join يفشل بصمت ويضل الاتصال عالق على
        //    "Calling…/Connecting…" للأبد رغم إن كل إشارات WS وصلت صح. ──
        const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(user.id)}`, {
          credentials: 'include',
        });
        if (!tokenRes.ok) {
          throw new Error(`Unable to secure the call connection (${tokenRes.status}).`);
        }
        const tokenData = await tokenRes.json() as { appId?: string; token?: string; uid?: number };
        if (!tokenData.token || !tokenData.uid || !tokenData.appId) {
          throw new Error('The call credentials were incomplete.');
        }

        joinUidRef.current = tokenData.uid;
        await client.join(tokenData.appId, channel, tokenData.token, tokenData.uid);
        if (client.remoteUsers.length > 0 && !cancelled) setConnected(true);

        // ── المايك بمحاولة مستقلة — فشل الصلاحية ما يوقف الاتصال (تقدر
        //    تسمع الطرف الثاني برضو)، بس نوريك تحذير واضح بدل ما يظل
        //    زر الميوت بدون أي تأثير بصمت. ──
        try {
          const mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true });
          if (cancelled) { mic.close(); return; }
          micTrackRef.current = mic;
          await client.publish([mic]);
          setMicError(false);

          if (activeCall.callType === 'video') {
            try {
              const camera = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '480p_1' });
              if (cancelled) { camera.close(); return; }
              cameraTrackRef.current = camera;
              await client.publish([camera]);
              if (localVideoRef.current) camera.play(localVideoRef.current);
              setCameraOn(true);
              setCameraError(false);
            } catch (cameraErr) {
              console.error('[CallScreen] Camera unavailable:', cameraErr);
              if (!cancelled) { setCameraOn(false); setCameraError(true); }
            }
          }
        } catch (micErr) {
          console.error('[CallScreen] Microphone unavailable:', micErr);
          if (!cancelled) setMicError(true);
        }
      } catch (err) {
        console.error('[CallScreen] Agora join failed:', err);
        if (!cancelled) setMicError(true);
      }
    })();

    return () => {
      cancelled = true;
      joinedChannelRef.current = null;
      micTrackRef.current?.stop();
      micTrackRef.current?.close();
      micTrackRef.current = null;
      cameraTrackRef.current?.stop();
      cameraTrackRef.current?.close();
      cameraTrackRef.current = null;
      clientRef.current?.leave().catch(() => {});
      clientRef.current = null;
      joinUidRef.current = 0;
      setConnected(false);
      setMicError(false);
    };
  }, [channel, user?.id, activeCall.callType]);

  useEffect(() => {
    if (!user?.id || !peerId) return;
    wsSend({ type: localSpeaking ? 'speaking' : 'silent', from: user.id, to: peerId });
  }, [localSpeaking, user?.id, peerId, wsSend]);

  // ── بلّغ الـ Provider فور ما الاتصال يصير "متصل" فعليًا — هذا هو المشغّل
  //    الوحيد لعدّاد المدة، مو مجرد الضغط على اتصال. ──
  useEffect(() => {
    onConnectedChange(connected);
  }, [connected, onConnectedChange]);

  // ── نغمة رنين للمتصل نفسه أثناء الانتظار — تشتغل بس لما إحنا اللي طالبين
  //    الاتصال ولسا محد رد، وتوقف تلقائيًا فور ما نتصل فعليًا. ──
  useEffect(() => {
    // Stop ringing as soon as peer answers (connected) OR as soon as we're no longer the caller
    const shouldRing = activeCall.isCaller && !connected;
    if (!shouldRing) {
      if (ringbackTimerRef.current) { clearInterval(ringbackTimerRef.current); ringbackTimerRef.current = null; }
      if (ringbackCtxRef.current) { ringbackCtxRef.current.close().catch(() => {}); ringbackCtxRef.current = null; }
      return;
    }

    // Also stop immediately when peer sends 'answer' WS event (before Agora user-joined)
    const onAnswered = () => {
      if (ringbackTimerRef.current) { clearInterval(ringbackTimerRef.current); ringbackTimerRef.current = null; }
      if (ringbackCtxRef.current) { ringbackCtxRef.current.close().catch(() => {}); ringbackCtxRef.current = null; }
    };
    window.addEventListener('stooorna:call-answered', onAnswered);

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ringbackCtxRef.current = ctx;

    const playTone = () => {
      if (ctx.state === 'closed') return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      gain.gain.value = 0.06;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 2);
      osc2.stop(ctx.currentTime + 2);
    };

    playTone();
    ringbackTimerRef.current = setInterval(playTone, 6000);

    return () => {
      window.removeEventListener('stooorna:call-answered', onAnswered);
      if (ringbackTimerRef.current) { clearInterval(ringbackTimerRef.current); ringbackTimerRef.current = null; }
      ctx.close().catch(() => {});
      if (ringbackCtxRef.current === ctx) ringbackCtxRef.current = null;
    };
  }, [activeCall.isCaller, connected]);

  const toggleMic = useCallback(async () => {
    // ما فيه تراك مايك (فشلت الصلاحية أول مرة) — حاول تاخذها من جديد
    // بدل ما الزر يضل بدون أي تأثير بصمت.
    if (!micTrackRef.current) {
      if (!clientRef.current) return;
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        const mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true });
        micTrackRef.current = mic;
        await clientRef.current.publish([mic]);
        setMicError(false);
        setMicOn(true);
      } catch (err) {
        console.error('[CallScreen] Retry mic failed:', err);
        setMicError(true);
      }
      return;
    }
    const next = !micOn;
    await micTrackRef.current.setMuted(!next);
    setMicOn(next);
  }, [micOn]);

  const toggleCamera = useCallback(async () => {
    if (activeCall.callType !== 'video') return;
    if (cameraTrackRef.current) {
      const next = !cameraOn;
      await cameraTrackRef.current.setMuted(!next);
      setCameraOn(next);
      return;
    }
    if (!clientRef.current) return;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const camera = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '480p_1' });
      cameraTrackRef.current = camera;
      await clientRef.current.publish([camera]);
      if (localVideoRef.current) camera.play(localVideoRef.current);
      setCameraOn(true);
      setCameraError(false);
    } catch (error) {
      console.error('[CallScreen] Camera retry failed:', error);
      setCameraError(true);
    }
  }, [activeCall.callType, cameraOn]);

  const hangUp = useCallback(() => {
    if (activeCall && user) {
      wsSend({ type: 'hangup', from: user.id, to: activeCall.peerId });
    }
    endCall();
  }, [activeCall, user, wsSend, endCall]);

  const displayName = activeCall.peerName || activeCall.peerUsername || 'User';
  const statusLabel = connected
    ? fmtCallTime(callElapsed)
    : activeCall.isCaller ? 'Calling…' : 'Connecting…';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="call-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'radial-gradient(ellipse 70% 60% at 50% 25%, hsl(var(--card)) 0%, hsl(var(--background)) 70%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 40px)',
          }}
        >
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={minimizeCall}
            aria-label="Minimize call"
            style={{
              position: 'absolute',
              top: 'max(env(safe-area-inset-top, 0px), 18px)',
              left: 18,
              width: 36, height: 36, borderRadius: '50%',
              background: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ChevronDown size={18} strokeWidth={2.5} />
          </motion.button>

          {activeCall.isConference && (
            <div style={{
              marginTop: 8,
              background: 'hsl(var(--secondary))',
              borderRadius: 20, padding: '4px 12px',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Users size={12} color="hsl(var(--secondary-foreground))" strokeWidth={2.5} />
              <span style={{ color: 'hsl(var(--secondary-foreground))', fontSize: '0.7rem', fontWeight: 800 }}>
                Conference
              </span>
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, width: '100%', padding: '0 20px' }}>
            {activeCall.callType === 'video' && (
              <div style={{ position: 'relative', width: '100%', maxWidth: 520, aspectRatio: '9 / 14', maxHeight: '52vh', borderRadius: 24, overflow: 'hidden', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}>
                <div ref={remoteVideoRef} style={{ position: 'absolute', inset: 0 }} />
                <div ref={localVideoRef} style={{ position: 'absolute', right: 12, bottom: 12, width: 112, aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                {!cameraOn && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>Camera is off</div>}
              </div>
            )}
            <div style={{ position: 'relative', width: 132, height: 132 }}>
              {(connected && remoteSpeaking) && (
                <motion.div
                  animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute', inset: -10, borderRadius: '50%',
                    border: '2px solid hsl(var(--primary))',
                  }}
                />
              )}
              <div style={{
                width: 132, height: 132, borderRadius: '50%', overflow: 'hidden',
                background: 'hsl(var(--muted))',
                border: '2px solid hsl(var(--border))',
              }}>
                {activeCall.peerAvatar ? (
                  <img src={activeCall.peerAvatar} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <h2 style={{ color: 'hsl(var(--foreground))', margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
                {displayName}
              </h2>
              {activeCall.peerUsername && (
                <p style={{ color: 'hsl(var(--muted-foreground))', margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>
                  @{activeCall.peerUsername}
                </p>
              )}
              <p style={{ color: connected ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))', margin: '4px 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
                {statusLabel}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 26, marginTop: 20 }}>
            {activeCall.callType === 'video' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <motion.button whileTap={{ scale: 0.88 }} onClick={toggleCamera} aria-label="Toggle camera" style={{ width: 58, height: 58, borderRadius: '50%', background: cameraError ? 'hsl(var(--destructive) / 0.15)' : (cameraOn ? 'hsl(var(--muted))' : 'hsl(var(--foreground))'), border: cameraError ? '1px solid hsl(var(--destructive))' : '1px solid hsl(var(--border))', color: cameraError ? 'hsl(var(--destructive))' : (cameraOn ? 'hsl(var(--foreground))' : 'hsl(var(--background))'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {cameraOn ? <Video size={23} /> : <VideoOff size={23} />}
                </motion.button>
                <span style={{ color: cameraError ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))', fontSize: '0.68rem', fontWeight: 600 }}>{cameraError ? 'Enable camera' : (cameraOn ? 'Camera' : 'Camera off')}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={toggleMic}
                style={{
                  width: 58, height: 58, borderRadius: '50%',
                  background: micError ? 'hsl(var(--destructive) / 0.15)' : (micOn ? 'hsl(var(--muted))' : 'hsl(var(--foreground))'),
                  border: micError ? '1px solid hsl(var(--destructive))' : '1px solid hsl(var(--border))',
                  color: micError ? 'hsl(var(--destructive))' : (micOn ? 'hsl(var(--foreground))' : 'hsl(var(--background))'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                {micOn ? <Mic size={24} strokeWidth={2} /> : <MicOff size={24} strokeWidth={2} />}
              </motion.button>
              <span style={{ color: micError ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))', fontSize: '0.68rem', fontWeight: 600, maxWidth: 70, textAlign: 'center' }}>
                {micError ? 'تفعيل المايك' : (micOn ? 'Mute' : 'Unmute')}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={hangUp}
                style={{
                  width: 58, height: 58, borderRadius: '50%',
                  background: 'hsl(var(--destructive))',
                  border: '2px solid hsl(var(--destructive) / 0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 6px 18px hsl(var(--destructive) / 0.35)',
                }}
              >
                <PhoneOff size={24} color="hsl(var(--destructive-foreground))" strokeWidth={2} />
              </motion.button>
              <span style={{ color: 'hsl(var(--destructive))', fontSize: '0.68rem', fontWeight: 700 }}>
                End
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function GlobalCallProvider({
  children
}: {
  children: ReactNode;
}) {
  const sessionResult = useSession();
  const user = (sessionResult as any).user as any;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // رنين وارد عالمي — يشتغل بمجرد وصول اتصال بغض النظر عن الصفحة المفتوحة
  const incomingRingCtxRef = useRef<AudioContext | null>(null);
  const incomingRingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Incoming call ─────────────────────────────────────────────────────────
  const [incomingCaller, setIncomingCaller] = useState<{
    id: string;
    name: string;
    username: string;
    avatar: string | null;
    isGroup?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  } | null>(null);
  const incomingCallerRef = useRef<typeof incomingCaller>(null);

  // ── Active call ───────────────────────────────────────────────────────────
  const [activeCall, setActiveCall] = useState<{
    peerId: string;
    peerName: string;
    peerUsername?: string;
    peerAvatar: string | null;
    isCaller: boolean;
    isConference?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  } | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isMinimized, setIsMinimized] = useState(false);
  const [callElapsed, setCallElapsed] = useState(0);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  // صار الطرف الثاني موجود فعليًا بالقناة (مو مجرد إننا ضغطنا اتصال) — هذا
  // هو الشرط الوحيد المسموح يشغّل عدّاد المدة.
  const [callConnected, setCallConnected] = useState(false);

  // ── رنين وارد عالمي (Web Audio) — يشتغل بمجرد ما incomingCaller يتحدث،
  //    بمستوى الـ Provider نفسه (مو داخل صفحة شات معينة)، فيرن المستخدم
  //    بغض النظر وين هو بالتطبيق. توقف تلقائيًا عند القبول/الرفض/انتهاء
  //    الاتصال. نمط "رن-رن" كلاسيكي يختلف عن نغمة الانتظار (ringback) اللي
  //    يسمعها المتصل نفسه. ──────────────────────────────────────────────
  useEffect(() => {
    if (!incomingCaller) {
      if (incomingRingTimerRef.current) { clearInterval(incomingRingTimerRef.current); incomingRingTimerRef.current = null; }
      incomingRingCtxRef.current?.close().catch(() => {});
      incomingRingCtxRef.current = null;
      return;
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    incomingRingCtxRef.current = ctx;

    const playBell = (startAt: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.4);
    };

    const ringCycle = () => {
      if (ctx.state === 'closed') return;
      const now = ctx.currentTime;
      // "رن-رن" — نبضتين قريبتين من بعض، تكرار كل 2.2 ثانية
      playBell(now);
      playBell(now + 0.45);
    };

    ringCycle();
    incomingRingTimerRef.current = setInterval(ringCycle, 2200);

    return () => {
      if (incomingRingTimerRef.current) { clearInterval(incomingRingTimerRef.current); incomingRingTimerRef.current = null; }
      ctx.close().catch(() => {});
      if (incomingRingCtxRef.current === ctx) incomingRingCtxRef.current = null;
    };
  }, [incomingCaller]);

  // ── WS send helper ────────────────────────────────────────────────────────
  const wsSend = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (!ws) return false;
    const payload = JSON.stringify(msg);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      return true;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      const onOpen = () => {
        ws.send(payload);
        ws.removeEventListener('open', onOpen);
      };
      ws.addEventListener('open', onOpen);
      return true;
    }
    return false;
  }, []);

  // ── Open / reconnect WS ───────────────────────────────────────────────────
  const openWs = useCallback(() => {
    if (!user?.id || !mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/call-signal`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'register',
        userId: user.id
      }));
    };
    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data as string);

        // Broadcast to CallScreen via custom event
        window.dispatchEvent(new CustomEvent('call-signal', {
          detail: msg
        }));

        // ── Support thread clear (owner marked task done) ─────────────────
        if (msg.type === 'support_thread_clear') {
          // Wipe every support-related localStorage key for this user
          try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && (k.startsWith('stooorna_support_thread_') || k === 'stooorna_support_tickets')) {
                keysToRemove.push(k);
              }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            // Pass targetUserId so the owner's chat panel knows which thread to close
            window.dispatchEvent(new CustomEvent('stooorna:support-thread', {
              detail: { cleared: true, all: true, targetUserId: msg.targetUserId ?? null }
            }));
          } catch { /* silent */ }
        }

        // ── Incoming call ──────────────────────────────────────────────────
        if (msg.type === 'call') {
          const caller = {
            id: msg.from ?? '',
            name: msg.fromName ?? '',
            username: msg.fromUsername ?? '',
            avatar: msg.fromAvatar ?? null,
            isGroup: msg.isGroup === true,
            channel: msg.channel,
            callType: (msg.callType === 'video' ? 'video' : 'voice') as 'voice' | 'video'
          };
          setIncomingCaller(caller);
          incomingCallerRef.current = caller;
        }

        // ── Answer ────────────────────────────────────────────────────────
        // accept=true  → CallScreen handles Agora join via 'call-signal' event
        // accept=false → callee declined; only clear if WE are the caller
        if (msg.type === 'answer' && msg.accept === true) {
          // Peer accepted — signal via a custom event so the ringback effect
          // can stop immediately (the effect watches activeCall.isCaller + connected,
          // but Agora user-joined can take a few seconds; this is faster)
          try { window.dispatchEvent(new CustomEvent('stooorna:call-answered')); } catch { /* */ }
        }
        if (msg.type === 'answer' && msg.accept === false) {
          setActiveCall(prev => {
            // Only clear if this answer is from our current peer (we are the caller)
            if (prev?.isCaller && prev.peerId === msg.from) return null;
            return prev;
          });
        }

        // ── Busy — ignored on caller side; caller stays in channel waiting ──
        // if (msg.type === 'busy') setActiveCall(null);

        // ── Hangup ────────────────────────────────────────────────────────
        if (msg.type === 'hangup') {
          const caller = incomingCallerRef.current;
          if (caller && msg.from === caller.id) {
            setIncomingCaller(null);
            incomingCallerRef.current = null;
          }
          setActiveCall(prev => {
            if (prev && msg.from === prev.peerId) return null;
            return prev;
          });
        }

        // ── Remote speaking indicator ──────────────────────────────────────
        if (msg.type === 'speaking') setRemoteSpeaking(true);
        if (msg.type === 'silent') setRemoteSpeaking(false);
      } catch {/* ignore */}
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      wsRef.current = null;
      if (!mountedRef.current) return;
      reconnectTimer.current = setTimeout(openWs, 3000);
    };
  }, [user?.id]); // eslint-disable-line

  useEffect(() => {
    mountedRef.current = true;
    if (user?.id) openWs();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user?.id, openWs]);

  // ── تتبع آخر مكالمة فعلية قبل ما activeCall يصير null — نحتاجها عشان
  //    نعرف مين المتصل (peerId) ولو كنا إحنا البادئين (isCaller) لحظة
  //    الانتهاء، بعد ما activeCall نفسه يكون خلاص null. ──
  const lastActiveCallRef = useRef<typeof activeCall>(null);
  useEffect(() => {
    if (activeCall) lastActiveCallRef.current = activeCall;
  }, [activeCall]);

  // ── تسجيل المكالمة كرسالة بالشات لحظة انتهائها (best-effort — فشل الحفظ
  //    ما يوقف أي شي بالمكالمة نفسها). فقط الطرف اللي بدأ الاتصال (isCaller)
  //    يسجّل، عشان ما تتكرر نفس المكالمة كسطرين. مكالمات المجموعات مو مدعومة
  //    حاليًا (زر الاتصال أصلاً DM فقط). ──
  const logCallEnd = useCallback(async (call: { peerId: string; channel?: string }, duration: number, connected: boolean) => {
    try {
      const dmRes = await fetch('/api/secret-chat/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ peerId: call.peerId }),
      });
      if (!dmRes.ok) return;
      const dmData = await dmRes.json() as { chatId?: number };
      if (!dmData.chatId) return;
      const connectedFinal = connected;
      await fetch('/api/secret-chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chatId: dmData.chatId,
          type: 'call',
          body: connectedFinal ? 'answered' : 'missed',
          duration: connectedFinal ? duration : undefined,
        }),
      });
    } catch { /* best-effort — ما نكسر أي شي بالواجهة لو فشل */ }
  }, []);

  // ── Elapsed timer — يبدأ بس لما الطرف الثاني يرد فعليًا (callConnected)،
  //    مو لحظة الضغط على اتصال. قبل التعديل كان يبدأ فور setActiveCall،
  //    فيبين وكأنه في مكالمة "شغالة" ورد عليها أحد وهو أصلًا لسا يرن. ──────
  useEffect(() => {
    if (activeCall && callConnected) {
      setCallElapsed(0);
      elapsedTimer.current = setInterval(() => setCallElapsed(s => s + 1), 1000);
    } else {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
      setCallElapsed(0);
    }
    if (!activeCall) {
      const ended = lastActiveCallRef.current;
      if (ended?.isCaller && !ended.isConference && user) {
        logCallEnd(ended, callElapsed, callConnected);
      }
      lastActiveCallRef.current = null;
      setIsMinimized(false);
      setRemoteSpeaking(false);
      setCallConnected(false);
    }
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, [!!activeCall, callConnected]); // eslint-disable-line

  // ── startCall ─────────────────────────────────────────────────────────────
  const startCall = useCallback((opts: {
    peerId: string;
    peerName: string;
    peerUsername?: string;
    peerAvatar: string | null;
    isConference?: boolean;
    channel?: string;
    callType?: 'voice' | 'video';
  }) => {
    if (!user) return;
    const channel = opts.channel || `dm-${[user.id, opts.peerId].sort().join('-')}`;
    const call = { ...opts, channel, isCaller: true };
    const send = () => wsSend({
      type: 'call',
      from: user.id,
      to: opts.peerId,
      fromName: user.name ?? '',
      fromUsername: (user as any).username ?? '',
      fromAvatar: (user as any).avatarUrl ?? null,
      isGroup: opts.isConference ?? false,
      channel,
      callType: opts.callType ?? 'voice'
    });
    const ws = wsRef.current;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      openWs();
      const waitAndSend = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(waitAndSend);
          send();
        }
      }, 80);
      setTimeout(() => clearInterval(waitAndSend), 4000);
    } else {
      send();
    }
    setActiveCall(call);
    setIsMinimized(false);
  }, [user, wsSend, openWs]);

  // ── Accept incoming — activates CallScreen directly ──────────────────────
  const handleAccept = useCallback(() => {
    if (!incomingCaller || !user) return;
    const channel = incomingCaller.channel || `dm-${[user.id, incomingCaller.id].sort().join('-')}`;
    // Confirm acceptance before joining so the caller can immediately connect.
    wsSend({ type: 'answer', from: user.id, to: incomingCaller.id, accept: true, channel });
    setActiveCall({
      peerId: incomingCaller.id,
      peerName: incomingCaller.name,
      peerUsername: incomingCaller.username,
      peerAvatar: incomingCaller.avatar,
      isCaller: false,
      isConference: incomingCaller.isGroup ?? false,
      channel,
      callType: incomingCaller.callType ?? 'voice'
    });
    setIncomingCaller(null);
    incomingCallerRef.current = null;
  }, [incomingCaller, user, wsSend]);

  // ── Decline incoming ──────────────────────────────────────────────────────
  const handleDecline = useCallback(() => {
    if (!incomingCaller || !user) return;
    wsSend({
      type: 'answer',
      from: user.id,
      to: incomingCaller.id,
      accept: false
    });
    setIncomingCaller(null);
    incomingCallerRef.current = null;
  }, [incomingCaller, user, wsSend]);

  // ── endCall ───────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    setActiveCall(null);
    setIsMinimized(false);
  }, []);

  // ── minimizeCall / expandCall ─────────────────────────────────────────────
  const minimizeCall = useCallback(() => setIsMinimized(true), []);
  const expandCall = useCallback(() => setIsMinimized(false), []);

  // ── Determine visibility ──────────────────────────────────────────────────
  const showCallScreen = !!activeCall && !isMinimized;
  const showFloatingBar = !!activeCall && isMinimized;
  const showIncomingBanner = !!incomingCaller && !activeCall;
  return <Ctx.Provider value={{
    callWs: wsRef.current,
    wsSend,
    startCall,
    endCall,
    activeCall,
    incomingCaller,
    acceptCall: handleAccept,
    declineCall: handleDecline,
    minimizeCall,
    expandCall,
    isMinimized,
    callElapsed,
    remoteSpeaking,
    conferenceParticipantIds: new Set<string>()
  }}>
      {children}

      {/* ── Incoming call banner ── */}
      <CallNotificationBanner visible={showIncomingBanner} callerName={incomingCaller?.name ?? ''} callerUsername={incomingCaller?.username ?? ''} callerAvatar={incomingCaller?.avatar ?? null} isConference={incomingCaller?.isGroup ?? false} callType={incomingCaller?.callType ?? 'voice'} onAccept={handleAccept} onDecline={handleDecline} />

      {/* ── Full-screen active call — stays mounted while minimized so audio never drops ── */}
      {activeCall && (
        <CallScreen
          visible={showCallScreen}
          activeCall={activeCall}
          wsSend={wsSend}
          endCall={endCall}
          minimizeCall={minimizeCall}
          callElapsed={callElapsed}
          remoteSpeaking={remoteSpeaking}
          user={user}
          onConnectedChange={setCallConnected}
        />
      )}

      {/* ── Floating call bar (minimized) ── */}
      <FloatingCallBar visible={showFloatingBar} peerName={activeCall?.peerName ?? ''} peerAvatar={activeCall?.peerAvatar ?? null} isConference={activeCall?.isConference ?? false} elapsed={callElapsed} speaking={remoteSpeaking} onTap={expandCall} onEnd={() => {
      if (activeCall && user) {
        wsSend({
          type: 'hangup',
          from: user.id,
          to: activeCall.peerId
        });
      }
      endCall();
    }} />
    </Ctx.Provider>;
}