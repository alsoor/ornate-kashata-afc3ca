/**
 * /share?u=username  — Public share page for a Stooorna user profile
 * /share             — Generic app share page
 *
 * Features:
 *  - Full OG / Twitter meta tags pointing to /api/og-image
 *  - Animated profile card
 *  - Share buttons: WhatsApp, Telegram, X (Twitter), Facebook, Copy link
 *  - QR code (CSS-drawn placeholder — links to the profile URL)
 *  - "Open in Stooorna" deep-link button
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

// ── Social share configs ──────────────────────────────────────────────────────
function buildShareLinks(url: string, text: string) {
  const enc = encodeURIComponent;
  return [{
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    icon: <WhatsAppIcon />,
    href: `https://wa.me/?text=${enc(text + '\n' + url)}`
  }, {
    id: 'telegram',
    label: 'Telegram',
    color: '#229ED9',
    icon: <TelegramIcon />,
    href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`
  }, {
    id: 'twitter',
    label: 'X',
    color: '#000000',
    icon: <XIcon />,
    href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`
  }, {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: <FacebookIcon />,
    href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`
  }, {
    id: 'snapchat',
    label: 'Snapchat',
    color: '#FFFC00',
    icon: <SnapchatIcon />,
    href: `https://www.snapchat.com/scan?attachmentUrl=${enc(url)}`
  }];
}

// ── SVG social icons ──────────────────────────────────────────────────────────
function WhatsAppIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>;
}
function TelegramIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>;
}
function XIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>;
}
function FacebookIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>;
}
function SnapchatIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.166.006C9.813-.047 7.249.908 5.55 2.674 4.163 4.112 3.453 6.05 3.5 7.994v1.3c-.37.183-.77.232-1.17.232-.25 0-.5-.025-.74-.07-.07-.013-.14-.02-.21-.02-.43 0-.82.3-.93.73-.13.5.15 1.01.64 1.18.04.013.08.025.12.033.77.19 1.46.63 1.97 1.25.51.62.79 1.4.79 2.2 0 .17-.02.34-.05.51-.06.36.1.73.41.93.31.2.71.2 1.02 0 .77-.49 1.65-.74 2.55-.74.27 0 .54.03.8.08.52.1 1.01.33 1.43.67.42.34.75.78.96 1.28.21.5.28 1.04.21 1.57-.04.3.08.6.31.79.23.19.54.25.82.16.28-.09.5-.31.58-.59.08-.28.04-.58-.1-.83-.14-.25-.36-.44-.62-.54-.26-.1-.54-.1-.8 0-.26.1-.48.29-.62.54-.14.25-.18.55-.1.83.08.28.3.5.58.59.28.09.59.03.82-.16.23-.19.35-.49.31-.79-.07-.53 0-1.07.21-1.57.21-.5.54-.94.96-1.28.42-.34.91-.57 1.43-.67.26-.05.53-.08.8-.08.9 0 1.78.25 2.55.74.31.2.71.2 1.02 0 .31-.2.47-.57.41-.93-.03-.17-.05-.34-.05-.51 0-.8.28-1.58.79-2.2.51-.62 1.2-1.06 1.97-1.25.04-.008.08-.02.12-.033.49-.17.77-.68.64-1.18-.11-.43-.5-.73-.93-.73-.07 0-.14.007-.21.02-.24.045-.49.07-.74.07-.4 0-.8-.049-1.17-.232v-1.3c.047-1.944-.663-3.882-2.05-5.32C16.751.908 14.519-.047 12.166.006z" />
    </svg>;
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

// ── QR code (CSS grid — encodes the share URL visually) ───────────────────────
function QRPlaceholder({
  url
}: {
  url: string;
}) {
  // Simple deterministic pixel pattern derived from URL hash
  const hash = url.split('').reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 0);
  const SIZE = 11;
  const cells: boolean[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    // Always-on finder pattern corners
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const corner = r < 3 && c < 3 || r < 3 && c >= SIZE - 3 || r >= SIZE - 3 && c < 3;
    cells.push(corner || (hash >> i % 31 & 1) === 1);
  }
  return <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
    gap: 1.5,
    width: 88,
    height: 88,
    padding: 8,
    background: 'white',
    borderRadius: 10
  }}>
      {cells.map((on, i) => <div key={i} style={{
      borderRadius: 1,
      background: on ? '#060e0e' : 'white'
    }} />)}
    </div>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const username = params.get('u') ?? '';
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
  const shareLinks = buildShareLinks(shareUrl, shareText);

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
      <Helmet>
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
      </Helmet>
      <main style={{
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
        padding: '44px 20px 12px'
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
              {/* Open in app button */}
              <motion.a whileTap={{
            scale: 0.96
          }} href={`/u/${encodeURIComponent(profile.username ?? '')}`} style={{
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
            textDecoration: 'none',
            boxShadow: `0 0 20px rgba(0,188,212,0.1)`
          }}>
                <ExternalLink size={15} strokeWidth={2} />
                View Profile
              </motion.a>
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

          {/* ── QR code ── */}
          <div style={{
          marginTop: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8
        }}>
            <QRPlaceholder url={shareUrl} />
            <p style={{
            color: T.textDim,
            fontSize: '0.65rem',
            margin: 0
          }}>Scan to open</p>
          </div>
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

        {/* ── Social share buttons ── */}
        <motion.div initial={{
        opacity: 0,
        y: 16
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 0.4,
        delay: 0.25
      }} style={{
        width: '100%',
        maxWidth: 420,
        margin: '16px 16px 0'
      }}>
          <p style={{
          color: T.textDim,
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          margin: '0 0 10px 4px'
        }}>
            SHARE VIA
          </p>
          <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 10
        }}>
            {shareLinks.map((s, i) => <motion.a key={s.id} href={s.href} target="_blank" rel="noopener noreferrer" initial={{
            opacity: 0,
            y: 12
          }} animate={{
            opacity: 1,
            y: 0
          }} transition={{
            duration: 0.3,
            delay: 0.3 + i * 0.06
          }} whileTap={{
            scale: 0.88
          }} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '12px 4px 10px',
            background: T.primaryFaint,
            border: `1px solid ${T.primaryBorder}`,
            borderRadius: 14,
            color: s.color,
            textDecoration: 'none',
            transition: 'all 0.2s'
          }}>
                {s.icon}
                <span style={{
              color: T.textDim,
              fontSize: '0.6rem',
              fontWeight: 500
            }}>{s.label}</span>
              </motion.a>)}
          </div>
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
