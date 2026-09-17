/**
 * /profile — My profile: bio, share via username/QR code
 */
import { useState, useEffect } from 'react';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Edit2, Check, X, Share2, Copy, QrCode, PlusCircle } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { useHeartbeat } from '@/hooks/usePresence';
import UserAvatar from '@/components/UserAvatar';
import StatusUploader from '@/components/StatusUploader';
const T = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.35)',
  primaryBorder: 'rgba(0,188,212,0.2)',
  primaryFaint: 'rgba(0,188,212,0.08)',
  text: 'rgba(200,230,230,0.9)',
  textDim: 'rgba(150,200,200,0.5)',
  surface: 'rgba(0,188,212,0.05)',
  surfaceBorder: 'rgba(0,188,212,0.12)',
  navBorder: 'rgba(0,188,212,0.1)',
  inputBg: 'rgba(0,188,212,0.05)',
  inputBorder: 'rgba(0,188,212,0.15)',
  inputFocus: 'rgba(0,188,212,0.4)'
};

// ── Tiny QR code via qrserver.com (no npm needed) ────────────────────────────
function QRCodeImage({
  value,
  size = 200
}: {
  value: string;
  size?: number;
}) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=0a1a1a&color=00BCD4&margin=10`;
  return <img src={url} alt="QR code" width={size} height={size} style={{
    borderRadius: 12,
    border: `1px solid ${T.primaryBorder}`
  }} />;
}
export default function ProfilePage() {
  const navigate = useNavigate();
  const {
    user,
    isPending
  } = useSession();
  useHeartbeat(!!user);
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [bioMsg, setBioMsg] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showStatusUploader, setShowStatusUploader] = useState(false);
  const [statusUploaded, setStatusUploaded] = useState(false);
  const username = (user as {
    username?: string;
  })?.username ?? '';
  const profileUrl = username ? `https://stooorna.com/u/${username}` : '';

  // Load bio + avatar
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/me/bio').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBio(d.bio ?? '');
    });
    const u = user as {
      avatarUrl?: string | null;
      image?: string | null;
    };
    setAvatarUrl(u.avatarUrl ?? u.image ?? null);
  }, [user]);
  async function saveBio() {
    setBioLoading(true);
    setBioMsg('');
    try {
      const r = await fetch('/api/users/me/bio', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bio: bioInput
        })
      });
      const d = await r.json();
      if (r.ok) {
        setBio(d.bio);
        setEditingBio(false);
        setBioMsg('');
      } else setBioMsg(d.error || 'Failed');
    } catch {
      setBioMsg('Error saving');
    } finally {
      setBioLoading(false);
    }
  }
  function copyLink() {
    if (!profileUrl) return;
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  if (isPending) return null;
  if (!user) {
    return <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <button onClick={() => navigate('/settings')} style={{
        color: T.primary,
        background: 'none',
        border: 'none',
        cursor: 'pointer'
      }}>Sign in first</button>
      </div>;
  }
  const displayName = user.name ?? username ?? 'User';
  return <>
      <Helmet>
        <title>My Profile | Stooorna</title>
        <meta name="description" content="Edit your Stooorna profile — update your bio, share your profile link, and let friends find you." />
        <link rel="canonical" href="https://stooorna.com/profile" />
        <meta property="og:title" content="My Profile | Stooorna" />
        <meta property="og:description" content="Edit your Stooorna profile — update your bio and share your profile link." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/profile" />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">My Profile</h1>

      <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)'
    }}>

        {/* Header */}
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '40px 20px 14px',
        background: 'rgba(6,14,14,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${T.navBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
          <motion.button whileTap={{
          scale: 0.85
        }} onClick={() => navigate(-1)} style={{
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4
        }}>
            <ArrowLeft size={22} strokeWidth={2} />
          </motion.button>
          <p style={{
          color: T.text,
          fontSize: '0.9rem',
          fontWeight: 600
        }}>My Profile</p>
        </div>

        {/* Content */}
        <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxWidth: 420,
        width: '100%',
        margin: '0 auto'
      }}>

          {/* Avatar + name + online dot + bio preview */}
          <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 8
        }}>
            {/* Avatar with always-online dot (you are always online on your own profile) */}
            <UserAvatar name={displayName} avatarUrl={avatarUrl} size={80} online={true} isSelf />
            <div style={{
            textAlign: 'center'
          }}>
              <p style={{
              color: T.text,
              fontSize: '1.1rem',
              fontWeight: 700
            }}>{displayName}</p>
              {username && <p style={{
              color: T.primaryDim,
              fontSize: '0.8rem'
            }}>@{username}</p>}
              {/* Bio preview under name — visible to everyone who views this profile */}
              {bio && <p style={{
              color: T.textDim,
              fontSize: '0.82rem',
              lineHeight: 1.55,
              marginTop: 6,
              maxWidth: 260
            }}>
                  {bio}
                </p>}
            </div>
          </div>

          {/* Bio */}
          <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10
          }}>
              <p style={{
              color: T.textDim,
              fontSize: '0.65rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontWeight: 500
            }}>Bio</p>
              {!editingBio && <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => {
              setEditingBio(true);
              setBioInput(bio);
              setBioMsg('');
            }} style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.primaryDim,
              padding: 4
            }}>
                  <Edit2 size={14} />
                </motion.button>}
            </div>

            <AnimatePresence mode="wait">
              {editingBio ? <motion.div key="edit" initial={{
              opacity: 0
            }} animate={{
              opacity: 1
            }} exit={{
              opacity: 0
            }}>
                  <textarea value={bioInput} onChange={e => setBioInput(e.target.value.slice(0, 160))} rows={3} placeholder="Write something about yourself…" style={{
                width: '100%',
                resize: 'none',
                padding: '10px 12px',
                background: T.inputBg,
                border: `1px solid ${T.inputBorder}`,
                borderRadius: 10,
                color: T.text,
                fontSize: '0.85rem',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.5
              }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                  <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8
              }}>
                    <p style={{
                  color: T.textDim,
                  fontSize: '0.65rem'
                }}>{bioInput.length}/160</p>
                    <div style={{
                  display: 'flex',
                  gap: 8
                }}>
                      <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingBio(false);
                    setBioMsg('');
                  }} style={{
                    padding: '6px 10px',
                    background: 'none',
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 8,
                    color: T.textDim,
                    cursor: 'pointer'
                  }}>
                        <X size={13} />
                      </motion.button>
                      <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={saveBio} disabled={bioLoading} style={{
                    padding: '6px 14px',
                    background: T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    borderRadius: 8,
                    color: T.primary,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>
                        {bioLoading ? '…' : <Check size={13} />}
                      </motion.button>
                    </div>
                  </div>
                  {bioMsg && <p style={{
                color: '#ef4444',
                fontSize: '0.7rem',
                marginTop: 4
              }}>{bioMsg}</p>}
                </motion.div> : <motion.p key="view" initial={{
              opacity: 0
            }} animate={{
              opacity: 1
            }} exit={{
              opacity: 0
            }} style={{
              color: bio ? T.text : T.textDim,
              fontSize: '0.85rem',
              lineHeight: 1.6,
              fontStyle: bio ? 'normal' : 'italic'
            }}>
                  {bio || 'No bio yet — tap the edit icon to add one'}
                </motion.p>}
            </AnimatePresence>
          </div>

          {/* ── Add Status button ── */}
          <motion.button whileTap={{
          scale: 0.95
        }} onClick={() => setShowStatusUploader(true)} style={{
          width: '100%',
          padding: '13px 0',
          borderRadius: 14,
          cursor: 'pointer',
          background: statusUploaded ? 'rgba(34,197,94,0.12)' : 'linear-gradient(90deg, rgba(0,188,212,0.15), rgba(0,82,212,0.15))',
          border: `1.5px solid ${statusUploaded ? 'rgba(34,197,94,0.45)' : 'rgba(0,188,212,0.4)'}`,
          color: statusUploaded ? '#22c55e' : T.primary,
          fontWeight: 700,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}>
            <PlusCircle size={17} strokeWidth={2} />
            {statusUploaded ? 'تم نشر الستاتس ✓' : 'إضافة ستاتس'}
          </motion.button>

          {/* Share section */}
          {username && <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
              <p style={{
            color: T.textDim,
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: 14
          }}>Share Profile</p>

              {/* Profile link */}
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            background: T.inputBg,
            border: `1px solid ${T.inputBorder}`,
            borderRadius: 10,
            marginBottom: 12
          }}>
                <p style={{
              flex: 1,
              color: T.primary,
              fontSize: '0.78rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
                  stooorna.com/u/{username}
                </p>
                <motion.button whileTap={{
              scale: 0.9
            }} onClick={copyLink} style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: copied ? '#22c55e' : T.primaryDim,
              flexShrink: 0
            }}>
                  {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
                </motion.button>
              </div>

              {/* QR toggle */}
              <motion.button whileTap={{
            scale: 0.97
          }} onClick={() => setShowQR(!showQR)} style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px',
            background: T.primaryFaint,
            border: `1px solid ${T.primaryBorder}`,
            borderRadius: 10,
            color: T.primary,
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
                <QrCode size={16} strokeWidth={2} />
                {showQR ? 'Hide QR Code' : 'Show QR Code'}
              </motion.button>

              <AnimatePresence>
                {showQR && <motion.div initial={{
              opacity: 0,
              height: 0
            }} animate={{
              opacity: 1,
              height: 'auto'
            }} exit={{
              opacity: 0,
              height: 0
            }} style={{
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 16
            }}>
                    <QRCodeImage value={profileUrl} size={180} />
                  </motion.div>}
              </AnimatePresence>
            </div>}

          {/* Share via native share API */}
          {username && navigator.share && <motion.button whileTap={{
          scale: 0.97
        }} onClick={() => navigator.share({
          title: `${displayName} on Stooorna`,
          url: profileUrl
        })} style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px',
          background: T.primaryFaint,
          border: `1px solid ${T.primaryBorder}`,
          borderRadius: 12,
          color: T.primary,
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
              <Share2 size={16} strokeWidth={2} />
              Share via…
            </motion.button>}
        </div>
      </div>

      {/* ── Status Uploader overlay ── */}
      <AnimatePresence>
        {showStatusUploader && <StatusUploader onClose={() => setShowStatusUploader(false)} onUploaded={() => {
        setShowStatusUploader(false);
        setStatusUploaded(true);
        setTimeout(() => setStatusUploaded(false), 4000);
      }} />}
      </AnimatePresence>
    </>;
}
