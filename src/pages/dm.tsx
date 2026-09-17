/**
 * /dm?with=<userId>&name=<name>&username=<username>&avatarUrl=<url>
 * Full-screen DM chat page with:
 *  - Proper message bubbles (text, image, voice)
 *  - Streak messages (Snapchat-style, view-once): blue=video, yellow=image
 *  - In-chat call UI (caller + receiver screens)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Send, Image as ImageIcon, Mic, MicOff, Phone, PhoneOff, PhoneIncoming, Volume2, VolumeX, Video, Zap, Eye } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { useGlobalCall } from '@/components/GlobalCallProvider';
import UserAvatar from '@/components/UserAvatar';
const _SITE = 'https://stooorna.com';
void _SITE;
interface DmMsg {
  id: number;
  senderId: string;
  receiverId: string;
  type: string;
  body: string | null;
  duration: number | null;
  readAt: string | null;
  createdAt: string;
  senderName: string | null;
  senderUsername: string | null;
  senderAvatarUrl: string | null;
  isStreak?: boolean;
  streakOpenedAt?: string | null;
}

// ── Streak bubble ─────────────────────────────────────────────────────────────
function StreakBubble({
  msg,
  isMe,
  onOpen
}: {
  msg: DmMsg;
  isMe: boolean;
  onOpen: (id: number) => void;
}) {
  const opened = !!msg.streakOpenedAt;
  const isVideo = msg.type === 'video';
  const color = isVideo ? 'hsl(210 100% 56%)' : 'hsl(45 100% 50%)';
  const animClass = isVideo ? 'streak-flash-blue' : 'streak-flash-yellow';
  return <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    background: opened ? 'hsl(var(--muted))' : `${color}22`,
    border: `2px solid ${opened ? 'hsl(var(--border))' : color}`,
    cursor: opened ? 'default' : 'pointer',
    animation: opened ? 'none' : `${animClass} 1.2s ease-in-out infinite`,
    minWidth: 120
  }} onClick={() => {
    if (!opened && !isMe) onOpen(msg.id);
  }}>
      {isVideo ? <Video size={20} color={opened ? 'hsl(var(--muted-foreground))' : color} /> : <ImageIcon size={20} color={opened ? 'hsl(var(--muted-foreground))' : color} />}
      <div>
        <p style={{
        margin: 0,
        fontSize: '0.8rem',
        fontWeight: 700,
        color: opened ? 'hsl(var(--muted-foreground))' : color
      }}>
          {isMe ? opened ? 'تم الفتح' : 'ستريك مرسل' : opened ? 'تم الفتح' : 'اضغط للفتح'}
        </p>
        <p style={{
        margin: 0,
        fontSize: '0.65rem',
        color: 'hsl(var(--muted-foreground))'
      }}>
          {isVideo ? 'فيديو مؤقت' : 'صورة مؤقتة'} · مرة واحدة
        </p>
      </div>
      {!opened && !isMe && <Eye size={16} color={color} style={{
      marginLeft: 'auto'
    }} />}
    </div>;
}

// ── Streak viewer overlay ─────────────────────────────────────────────────────
function StreakViewer({
  url,
  type,
  onClose
}: {
  url: string;
  type: string;
  onClose: () => void;
}) {
  return <motion.div initial={{
    opacity: 0
  }} animate={{
    opacity: 1
  }} exit={{
    opacity: 0
  }} onClick={onClose} style={{
    position: 'fixed',
    inset: 0,
    background: 'hsl(var(--background))',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
      {type === 'video' ? <video src={url} autoPlay playsInline controls style={{
      maxWidth: '100%',
      maxHeight: '100%'
    }} /> : <img src={url} alt="streak" style={{
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain'
    }} />}
      <button onClick={onClose} style={{
      position: 'absolute',
      top: 20,
      right: 20,
      background: 'hsl(var(--card))',
      border: 'none',
      borderRadius: '50%',
      width: 40,
      height: 40,
      cursor: 'pointer',
      color: 'hsl(var(--foreground))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        ✕
      </button>
    </motion.div>;
}

// ── In-chat call screen ───────────────────────────────────────────────────────
function CallScreen({
  peerName,
  peerAvatar,
  isCaller,
  isAnswered,
  onAnswer,
  onHangup,
  onSpeaker,
  onMute,
  speakerOn,
  muted
}: {
  peerName: string;
  peerAvatar: string | null;
  isCaller: boolean;
  isAnswered: boolean;
  onAnswer: () => void;
  onHangup: () => void;
  onSpeaker: () => void;
  onMute: () => void;
  speakerOn: boolean;
  muted: boolean;
}) {
  return <motion.div initial={{
    opacity: 0,
    y: 40
  }} animate={{
    opacity: 1,
    y: 0
  }} exit={{
    opacity: 0,
    y: 40
  }} style={{
    position: 'fixed',
    inset: 0,
    zIndex: 500,
    background: 'radial-gradient(ellipse 80% 70% at 50% 30%, hsl(var(--primary) / 0.18) 0%, hsl(var(--background)) 70%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24
  }}>
      {/* Pulsing avatar */}
      <div style={{
      position: 'relative'
    }}>
        <motion.div animate={{
        scale: [1, 1.12, 1]
      }} transition={{
        duration: 1.8,
        repeat: Infinity,
        ease: 'easeInOut' as const
      }} style={{
        width: 100,
        height: 100,
        borderRadius: '50%',
        border: `3px solid hsl(var(--primary))`,
        boxShadow: `0 0 30px hsl(var(--primary) / 0.4)`,
        overflow: 'hidden'
      }}>
          <UserAvatar name={peerName} avatarUrl={peerAvatar} size={100} />
        </motion.div>
      </div>

      <div style={{
      textAlign: 'center'
    }}>
        <p style={{
        color: 'hsl(var(--foreground))',
        fontSize: '1.3rem',
        fontWeight: 700,
        margin: 0
      }}>{peerName}</p>
        <p style={{
        color: 'hsl(var(--muted-foreground))',
        fontSize: '0.85rem',
        margin: '6px 0 0'
      }}>
          {isCaller ? isAnswered ? 'جارٍ الاتصال...' : 'يتصل...' : isAnswered ? 'جارٍ الاتصال...' : 'مكالمة واردة...'}
        </p>
      </div>

      {/* Controls */}
      <div style={{
      display: 'flex',
      gap: 24,
      alignItems: 'center',
      marginTop: 16
    }}>
        {/* Speaker */}
        <CallBtn icon={speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />} label={speakerOn ? 'سماعة' : 'هاتف'} color="hsl(var(--secondary))" onClick={onSpeaker} />

        {/* Mute */}
        <CallBtn icon={muted ? <MicOff size={22} /> : <Mic size={22} />} label={muted ? 'صامت' : 'ميكروفون'} color="hsl(var(--secondary))" onClick={onMute} />

        {/* Answer (receiver only, before answered) OR Hangup */}
        {!isCaller && !isAnswered ? <>
            <CallBtn icon={<PhoneIncoming size={24} />} label="رد" color="hsl(142 71% 45%)" onClick={onAnswer} large />
            <CallBtn icon={<PhoneOff size={24} />} label="رفض" color="hsl(var(--destructive))" onClick={onHangup} large />
          </> : <CallBtn icon={<PhoneOff size={24} />} label="إنهاء" color="hsl(var(--destructive))" onClick={onHangup} large />}
      </div>
    </motion.div>;
}
function CallBtn({
  icon,
  label,
  color,
  onClick,
  large
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  large?: boolean;
}) {
  return <motion.button whileTap={{
    scale: 0.88
  }} onClick={onClick} style={{
    width: large ? 64 : 52,
    height: large ? 64 : 52,
    borderRadius: '50%',
    background: color,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    color: 'hsl(var(--primary-foreground))',
    boxShadow: `0 4px 16px ${color}66`
  }}>
      {icon}
      <span style={{
      fontSize: '0.55rem',
      fontWeight: 600
    }}>{label}</span>
    </motion.button>;
}

// ── Main DM page ──────────────────────────────────────────────────────────────
export default function DmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user
  } = useSession();
  const {
    startCall,
    endCall,
    activeCall,
    incomingCaller,
    acceptCall,
    declineCall,
    wsSend
  } = useGlobalCall();
  const withId = searchParams.get('with') ?? '';
  const peerName = searchParams.get('name') ?? 'User';
  const peerUsername = searchParams.get('username') ?? '';
  const peerAvatar = searchParams.get('avatarUrl') ?? null;
  const [msgs, setMsgs] = useState<DmMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLInputElement | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Streak viewer
  const [streakView, setStreakView] = useState<{
    url: string;
    type: string;
  } | null>(null);

  // Streak send mode
  const [streakMode, setStreakMode] = useState(false);

  // Call state (local UI only — actual RTC is in GlobalCallProvider)
  const [callAnswered, setCallAnswered] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const isInCall = !!activeCall && activeCall.peerId === withId;
  const isReceivingCall = !!incomingCaller && incomingCaller.id === withId;

  // ── WhatsApp-style swipe-up-to-call on header ─────────────────────────────
  const swipeStartY = useRef<number | null>(null);
  const swipeTriggered = useRef(false);
  const [swipeHint, setSwipeHint] = useState(false); // show "↑ اتصال" hint
  const swipeHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onHeaderPointerDown(e: React.PointerEvent) {
    swipeStartY.current = e.clientY;
    swipeTriggered.current = false;
  }
  function onHeaderPointerMove(e: React.PointerEvent) {
    if (swipeStartY.current === null || swipeTriggered.current) return;
    const delta = swipeStartY.current - e.clientY; // positive = swiping up
    if (delta > 30) {
      swipeTriggered.current = true;
      setSwipeHint(true);
      if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current);
      swipeHintTimer.current = setTimeout(() => setSwipeHint(false), 1800);
    }
  }
  function onHeaderPointerUp() {
    if (swipeTriggered.current) {
      handleCall();
    }
    swipeStartY.current = null;
    swipeTriggered.current = false;
  }
  useEffect(() => {
    return () => { if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current); };
  }, []);
  const loadMsgs = useCallback(async () => {
    if (!withId || !user) return;
    try {
      const r = await fetch(`/api/messages?with=${withId}`, {
        credentials: 'include'
      });
      if (r.ok) setMsgs(await r.json());
    } catch {}
  }, [withId, user]);
  useEffect(() => {
    loadMsgs();
  }, [loadMsgs]);

  // Poll for new messages every 3s
  useEffect(() => {
    const t = setInterval(loadMsgs, 3000);
    return () => clearInterval(t);
  }, [loadMsgs]);

  // Poll typing indicator
  useEffect(() => {
    if (!withId || !user) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/messages/typing?userId=${withId}`, {
          credentials: 'include'
        });
        if (r.ok) {
          const d = await r.json();
          setTyping(!!d.typing);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [withId, user]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [msgs]);
  function signalTyping() {
    if (!withId) return;
    fetch(`/api/messages/typing?userId=${withId}`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {}, 2000);
  }
  async function sendText() {
    if (!text.trim() || sending || !withId) return;
    setSending(true);
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          receiverId: withId,
          body: text.trim()
        })
      });
      setText('');
      await loadMsgs();
    } catch {}
    setSending(false);
  }
  async function sendImage(file: File) {
    if (!withId) return;
    const buf = await file.arrayBuffer();
    const url = streakMode ? `/api/messages/image?receiverId=${withId}&isStreak=1` : `/api/messages/image?receiverId=${withId}`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        credentials: 'include',
        body: buf
      });
      setStreakMode(false);
      await loadMsgs();
    } catch {}
  }
  async function openStreak(msgId: number) {
    const msg = msgs.find(m => m.id === msgId);
    if (!msg || !msg.body) return;
    // Show the content first
    setStreakView({
      url: msg.body,
      type: msg.type
    });
    // Mark as opened
    try {
      await fetch(`/api/messages/${msgId}/open-streak`, {
        method: 'POST',
        credentials: 'include'
      });
      setMsgs(prev => prev.map(m => m.id === msgId ? {
        ...m,
        streakOpenedAt: new Date().toISOString()
      } : m));
    } catch {}
  }
  function handleCall() {
    if (!user || !withId) return;
    startCall({
      peerId: withId,
      peerName,
      peerAvatar
    });
    setCallAnswered(false);
  }
  function handleAnswer() {
    acceptCall();
    setCallAnswered(true);
  }
  function handleHangup() {
    endCall();
    if (incomingCaller?.id === withId) declineCall();
    wsSend({
      type: 'hangup',
      from: user?.id,
      to: withId
    });
    setCallAnswered(false);
  }
  const showCallScreen = isInCall || isReceivingCall;
  return <>
      <Helmet>
        <title>{peerName} — Stooorna</title>
        <meta name="description" content={`محادثة خاصة مع ${peerName} على Stooorna`} />
        <link rel="canonical" href="https://stooorna.com/dm" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <h1 className="sr-only">محادثة مع {peerName}</h1>

      <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'hsl(var(--background))',
      overflow: 'hidden'
    }}>
        {/* Header — swipe up to call */}
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={() => { swipeStartY.current = null; swipeTriggered.current = false; }}
          style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          background: 'hsl(var(--card))',
          borderBottom: '1px solid hsl(var(--border))',
          flexShrink: 0,
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'grab',
          position: 'relative'
        }}>
          {/* Swipe hint */}
          <AnimatePresence>
            {swipeHint && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'hsl(var(--primary) / 0.92)',
                  borderRadius: 0,
                  zIndex: 10,
                  gap: 8,
                  pointerEvents: 'none'
                }}
              >
                <Phone size={18} style={{ color: 'hsl(var(--primary-foreground))' }} />
                <span style={{ color: 'hsl(var(--primary-foreground))', fontSize: '0.9rem', fontWeight: 700 }}>جاري الاتصال...</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate(-1)} style={{
            background: 'none',
            border: 'none',
            color: 'hsl(var(--foreground))',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            pointerEvents: 'auto'
          }}>
            <ArrowLeft size={20} />
          </motion.button>
          <UserAvatar name={peerName} avatarUrl={peerAvatar} size={38} />
          <div style={{ flex: 1 }}>
            <p style={{
              color: 'hsl(var(--foreground))',
              fontSize: '0.92rem',
              fontWeight: 700,
              margin: 0
            }}>{peerName}</p>
            {peerUsername && <p style={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.68rem',
              margin: '1px 0 0'
            }}>@{peerUsername}</p>}
            {typing && <p style={{
              color: 'hsl(var(--primary))',
              fontSize: '0.65rem',
              margin: '1px 0 0'
            }}>يكتب...</p>}
            {!typing && <p style={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.6rem',
              margin: '2px 0 0',
              opacity: 0.7
            }}>↑ اسحب للأعلى للاتصال</p>}
          </div>
          {/* Phone icon (visual only, no tap — swipe to call) */}
          <div style={{
            color: 'hsl(var(--muted-foreground))',
            opacity: 0.45,
            display: 'flex',
            padding: 6
          }}>
            <Phone size={18} />
          </div>
        </div>

        {/* Messages */}
        <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
          {msgs.length === 0 && <p style={{
          color: 'hsl(var(--muted-foreground))',
          textAlign: 'center',
          marginTop: 40,
          fontSize: '0.85rem'
        }}>
              ابدأ المحادثة مع {peerName}
            </p>}
          {msgs.map(msg => {
          const isMe = msg.senderId === user?.id;
          return <div key={msg.id} style={{
            display: 'flex',
            flexDirection: isMe ? 'row-reverse' : 'row',
            alignItems: 'flex-end',
            gap: 6
          }}>
                {!isMe && <UserAvatar name={msg.senderName ?? peerName} avatarUrl={msg.senderAvatarUrl} size={28} />}
                <div style={{
              maxWidth: '80%',
              minWidth: 0
            }}>
                  {msg.isStreak ? <StreakBubble msg={msg} isMe={isMe} onOpen={openStreak} /> : msg.type === 'image' ? <img src={msg.body ?? ''} alt="صورة" style={{
                display: 'block',
                width: '100%',
                maxWidth: 280,
                height: 'auto',
                borderRadius: 14,
                objectFit: 'contain'
              }} /> : msg.type === 'voice' ? <div style={{
                background: isMe ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                border: `1px solid hsl(var(--border))`,
                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '8px 10px'
              }}>
                      <audio controls src={msg.body ?? ''} style={{
                  display: 'block',
                  width: '100%',
                  minWidth: 220,
                  maxWidth: 300,
                  height: 36
                }} />
                    </div> : <div style={{
                padding: '9px 13px',
                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: isMe ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                border: `1px solid hsl(var(--border))`,
                wordBreak: 'break-word'
              }}>
                      <p style={{
                  color: isMe ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                  fontSize: '0.88rem',
                  margin: 0,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap'
                }}>{msg.body}</p>
                    </div>}
                  <p style={{
                color: 'hsl(var(--muted-foreground))',
                fontSize: '0.58rem',
                margin: '3px 4px 0',
                textAlign: isMe ? 'right' : 'left'
              }}>
                    {new Date(msg.createdAt).toLocaleTimeString('ar-KW', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                    {msg.isStreak && msg.senderId === user?.id && msg.streakOpenedAt && <span style={{
                  marginRight: 4,
                  color: 'hsl(var(--primary))'
                }}>· تم الفتح</span>}
                  </p>
                </div>
              </div>;
        })}
          {/* Typing indicator */}
          {typing && <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
              <UserAvatar name={peerName} avatarUrl={peerAvatar} size={24} />
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '7px 12px',
            borderRadius: '14px 14px 14px 4px',
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))'
          }}>
                {[0, 1, 2].map(i => <motion.div key={i} animate={{
              y: [0, -4, 0]
            }} transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut' as const
            }} style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'hsl(var(--primary))'
            }} />)}
              </div>
            </div>}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
        padding: '10px 12px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        borderTop: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card))',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0
      }}>
          {/* Streak toggle */}
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={() => setStreakMode(m => !m)} title={streakMode ? 'إلغاء وضع الستريك' : 'إرسال ستريك (مرة واحدة)'} style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: streakMode ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
          color: streakMode ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: streakMode ? `0 0 10px hsl(var(--primary) / 0.5)` : 'none',
          animation: streakMode ? 'stooorna-post-ring 1.2s ease-in-out infinite' : 'none'
        }}>
            <Zap size={16} />
          </motion.button>

          {/* Image picker */}
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={() => imgRef.current?.click()} style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'hsl(var(--muted))',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          color: 'hsl(var(--muted-foreground))'
        }}>
            <ImageIcon size={16} />
          </motion.button>
          <input ref={imgRef} type="file" accept="image/*,video/*" style={{
          display: 'none'
        }} onChange={e => {
          const f = e.target.files?.[0];
          if (f) sendImage(f);
          e.target.value = '';
        }} />

          {/* Text input */}
          <input value={text} onChange={e => {
          setText(e.target.value);
          signalTyping();
        }} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendText();
          }
        }} placeholder={streakMode ? '⚡ وضع الستريك — اختر صورة أو فيديو' : 'اكتب رسالة...'} dir="rtl" style={{
          flex: 1,
          background: 'hsl(var(--muted))',
          border: `1px solid ${streakMode ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
          borderRadius: 20,
          padding: '9px 14px',
          color: 'hsl(var(--foreground))',
          fontSize: '0.85rem',
          outline: 'none'
        }} />

          {/* Send */}
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={sendText} disabled={!text.trim() || sending} style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: text.trim() ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: text.trim() ? 'pointer' : 'default',
          flexShrink: 0,
          color: text.trim() ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'
        }}>
            <Send size={15} />
          </motion.button>
        </div>
      </div>

      {/* Streak viewer overlay */}
      <AnimatePresence>
        {streakView && <StreakViewer url={streakView.url} type={streakView.type} onClose={() => setStreakView(null)} />}
      </AnimatePresence>

      {/* In-chat call screen */}
      <AnimatePresence>
        {showCallScreen && <CallScreen peerName={peerName} peerAvatar={peerAvatar} isCaller={isInCall && !isReceivingCall} isAnswered={callAnswered} onAnswer={handleAnswer} onHangup={handleHangup} onSpeaker={() => setSpeakerOn(s => !s)} onMute={() => setCallMuted(m => !m)} speakerOn={speakerOn} muted={callMuted} />}
      </AnimatePresence>
    </>;
}
