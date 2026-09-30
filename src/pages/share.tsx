/**
 * /share?u=username  — Public share page for a Stooorna user profile
 * /share             — Generic app share page
 *
 * Features:
 *  - Full OG / Twitter meta tags pointing to /api/og-image
 *  - Animated profile card
 *  - Copy link + native share (Share via…)
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { Link2, Check, ArrowLeft, ExternalLink, Send } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.35)',
  primaryBorder: 'rgba(0,188,212,0.2)',
  primaryFaint: 'rgba(0,188,212,0.06)',
  text: 'rgba(200,230,230,0.92)',
  textDim: 'rgba(150,200,200,0.5)',
  surface: 'rgba(0,188,212,0.05)',
  surfaceBorder: 'rgba(0,188,212,0.12)',
  red: '#ef4444'
};
interface Profile {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  online: boolean;
}

// ── Mini waveform decoration ──────────────────────────────────────────────────
function WaveDecor() {
  return <div style={{
    display: 'flex',
    alignItems: 'flex-end',
    gap: 3,
    height: 28,
    opacity: 0.35
  }}>
      {[0.3, 0.6, 1, 0.8, 0.5, 0.9, 0.7, 0.4, 0.8, 0.6, 0.3].map((h, i) => <motion.div key={i} animate={{
      scaleY: [h, h * 0.4, h, h * 0.7, h]
    }} transition={{
      duration: 1.8,
      repeat: Infinity,
      delay: i * 0.12,
      ease: 'easeInOut'
    }} style={{
      width: 4,
      height: 28 * h,
      borderRadius: 2,
      background: T.primary,
      transformOrigin: 'bottom'
    }} />)}
    </div>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return <SharePageView username={params.get('u') ?? ''} onBack={() => navigate(-1)} />;
}

/**
 * نفس صفحة المشاركة لكن قابلة للتضمين داخل فقاعة الإعدادات.
 * embedded=true → تملأ الفقاعة نفسها (بدون 100dvh وبدون تغيير عنوان الصفحة / meta).
 */
export function SharePageView({
  username,
  onBack,
  embedded = false
}: {
  username: string;
  onBack: () => void;
  embedded?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!username);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const SITE = 'https://stooorna.com';

  // ── Resolve profile ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!username) {
      setLoading(false);
      return;
    }
    fetch(`/api/users/by-username?username=${encodeURIComponent(username)}`).then(r => r.ok ? r.json() : null).then(d => {
      setProfile(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [username]);

  // ── Build share URL + OG image URL ────────────────────────────────────────
  const shareUrl = username ? `${SITE}/u/${encodeURIComponent(username)}` : SITE;
  const ogParams = new URLSearchParams();
  if (username && profile) {
    ogParams.set('type', 'profile');
    ogParams.set('username', profile.username ?? username);
    ogParams.set('name', profile.name ?? username);
    if (profile.bio) ogParams.set('bio', profile.bio);
    if (profile.avatarUrl) ogParams.set('avatar', profile.avatarUrl);
  } else {
    ogParams.set('type', 'app');
  }
  const ogImageUrl = `${SITE}/api/og-image?${ogParams.toString()}`;
  const pageTitle = profile ? `${profile.name ?? profile.username} on Stooorna` : 'Stooorna — Voice Rooms & Live Audio';
  const pageDesc = profile?.bio ? profile.bio : 'Join Stooorna — live voice rooms, friends, and real-time audio chat.';

  // ── Share links ────────────────────────────────────────────────────────────
  const shareText = profile ? `Check out ${profile.name ?? '@' + username} on Stooorna 🎙️` : 'Join me on Stooorna — live voice rooms & audio chat 🎙️';

  // ── Copy link ──────────────────────────────────────────────────────────────
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setShareMsg('Link copied!');
      setTimeout(() => {
        setCopied(false);
        setShareMsg('');
      }, 2500);
    } catch {
      setShareMsg('Copy failed');
      setTimeout(() => setShareMsg(''), 2000);
    }
  }

  // ── Native share (mobile) ──────────────────────────────────────────────────
  async function nativeShare() {
    if (!navigator.share) {
      copyLink();
      return;
    }
    try {
      await navigator.share({
        title: pageTitle,
        text: shareText,
        url: shareUrl
      });
    } catch {/* cancelled */}
  }
  return <>
      {!embedded && <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={shareUrl} />

        {/* Open Graph */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:type" content="profile" />
        <meta property="og:site_name" content="Stooorna" />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <meta name="twitter:image" content={ogImageUrl} />
        <meta name="twitter:site" content="@stooorna" />
      </Helmet>}
      <main style={embedded ? {
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      height: '100%',
      minHeight: 0,
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: 'var(--font-sans)',
      overflowX: 'hidden'
    } : {
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: 'var(--font-sans)',
      overflowX: 'hidden'
    }}>

        {/* ── Header ── */}
        <div style={{
        width: '100%',
        maxWidth: 480,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: embedded ? '16px 20px 12px' : '44px 20px 12px'
      }}>
          <motion.button whileTap={{
          scale: 0.85
        }} onClick={onBack} style={{
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4
        }}>
            <ArrowLeft size={22} strokeWidth={2} />
          </motion.button>
          <h1 style={{
          color: T.textDim,
          fontSize: '0.82rem',
          margin: 0,
          fontWeight: 400
        }}>Share</h1>
        </div>

        {/* ── Card ── */}
        <motion.div initial={{
        opacity: 0,
        y: 24
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 0.45,
        ease: 'easeOut'
      }} style={{
        width: '100%',
        maxWidth: 420,
        margin: '0 16px',
        background: 'rgba(13,42,46,0.7)',
        border: `1px solid ${T.primaryBorder}`,
        borderRadius: 24,
        padding: '32px 24px 28px',
        backdropFilter: 'blur(16px)',
        boxShadow: `0 0 60px rgba(0,188,212,0.08)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0
      }}>
          {/* Waveform top */}
          <div style={{
          marginBottom: 20
        }}>
            <WaveDecor />
          </div>

          {loading ? <div style={{
          color: T.textDim,
          fontSize: '0.85rem',
          padding: '20px 0'
        }}>Loading…</div> : profile ? (/* ── Profile card ── */
        <>
              {/* Avatar */}
              <div style={{
            position: 'relative',
            marginBottom: 16
          }}>
                <UserAvatar name={profile.name ?? profile.username ?? 'U'} avatarUrl={profile.avatarUrl} size={88} style={{
              border: `3px solid ${T.primaryDim}`,
              boxShadow: `0 0 24px rgba(0,188,212,0.2)`
            }} />
                {/* Online dot */}
                {profile.online && <div style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#22c55e',
              border: '2px solid #0a1a1a',
              boxShadow: '0 0 8px rgba(34,197,94,0.6)'
            }} />}
              </div>
              {/* Name */}
              <p style={{
            color: T.text,
            fontSize: '1.3rem',
            fontWeight: 700,
            margin: 0,
            textAlign: 'center'
          }}>
                {profile.name ?? profile.username}
              </p>
              {/* Username */}
              {profile.username && <p style={{
            color: T.primary,
            fontSize: '0.9rem',
            margin: '4px 0 0',
            opacity: 0.85
          }}>
                  @{profile.username}
                </p>}
              {/* Online status */}
              <p style={{
            color: profile.online ? '#22c55e' : T.textDim,
            fontSize: '0.72rem',
            margin: '6px 0 0'
          }}>
                {profile.online ? '● Online now' : '○ Offline'}
              </p>
              {/* Bio */}
              {profile.bio && <p style={{
            color: T.textDim,
            fontSize: '0.82rem',
            textAlign: 'center',
            margin: '14px 0 0',
            lineHeight: 1.55,
            maxWidth: 300
          }}>
                  {profile.bio}
                </p>}
            </>) : (/* ── App card (no user) ── */
        <>
              <p style={{
            color: T.primary,
            fontSize: '2rem',
            fontWeight: 800,
            margin: 0,
            letterSpacing: '-1px'
          }}>
                Stooorna
              </p>
              <p style={{
            color: T.textDim,
            fontSize: '0.82rem',
            margin: '8px 0 0',
            textAlign: 'center'
          }}>
                Voice Rooms · Live Audio · Friends
              </p>
              <motion.a whileTap={{
            scale: 0.96
          }} href="/" style={{
            marginTop: 22,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 28px',
            background: `linear-gradient(135deg, rgba(0,188,212,0.18), rgba(0,188,212,0.08))`,
            border: `1px solid ${T.primaryBorder}`,
            borderRadius: 50,
            color: T.primary,
            fontSize: '0.85rem',
            fontWeight: 600,
            textDecoration: 'none'
          }}>
                <ExternalLink size={15} strokeWidth={2} />
                Open Stooorna
              </motion.a>
            </>)}
        </motion.div>

        {/* ── Share URL strip ── */}
        <motion.div initial={{
        opacity: 0,
        y: 16
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 0.4,
        delay: 0.15
      }} style={{
        width: '100%',
        maxWidth: 420,
        margin: '16px 16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        background: T.primaryFaint,
        border: `1px solid ${T.primaryBorder}`,
        borderRadius: 14
      }}>
          <p style={{
          flex: 1,
          color: T.textDim,
          fontSize: '0.75rem',
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
            {shareUrl}
          </p>
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={copyLink} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '6px 12px',
          borderRadius: 8,
          background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(0,188,212,0.12)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : T.primaryBorder}`,
          color: copied ? '#22c55e' : T.primary,
          fontSize: '0.72rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
          flexShrink: 0
        }}>
            <AnimatePresence mode="wait">
              {copied ? <motion.span key="check" initial={{
              scale: 0
            }} animate={{
              scale: 1
            }} exit={{
              scale: 0
            }}><Check size={13} strokeWidth={2.5} /></motion.span> : <motion.span key="copy" initial={{
              scale: 0
            }} animate={{
              scale: 1
            }} exit={{
              scale: 0
            }}><Link2 size={13} strokeWidth={2} /></motion.span>}
            </AnimatePresence>
            {copied ? 'Copied!' : 'Copy'}
          </motion.button>
        </motion.div>

        {/* ── Native share (mobile) ── */}
        {typeof navigator !== 'undefined' && 'share' in navigator && <motion.div initial={{
        opacity: 0,
        y: 12
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 0.35,
        delay: 0.55
      }} style={{
        width: '100%',
        maxWidth: 420,
        margin: '12px 16px 0'
      }}>
            <motion.button whileTap={{
          scale: 0.97
        }} onClick={nativeShare} style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px',
          background: `linear-gradient(135deg, rgba(0,188,212,0.15), rgba(0,82,212,0.1))`,
          border: `1px solid ${T.primaryBorder}`,
          borderRadius: 14,
          color: T.primary,
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: `0 0 20px rgba(0,188,212,0.06)`
        }}>
              <Send size={16} strokeWidth={2} />
              Share via…
            </motion.button>
          </motion.div>}

        {/* ── Toast ── */}
        <AnimatePresence>
          {shareMsg && <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: 20
        }} style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0d2a2e',
          border: `1px solid ${T.primaryBorder}`,
          borderRadius: 50,
          padding: '10px 22px',
          color: T.primary,
          fontSize: '0.82rem',
          fontWeight: 600,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          zIndex: 999,
          whiteSpace: 'nowrap'
        }}>
              {shareMsg}
            </motion.div>}
        </AnimatePresence>

        {/* Bottom padding */}
        <div style={{
        height: 48
      }} />
      </main>
    </>;
}
