/**
 * /u/:username — Public creator profile page
 * Shows avatar, name, bio, posts grid, follow button.
 * Flashing red+yellow glow on avatar when creator has a new post (< 24h).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Heart, MessageCircle, UserPlus, UserCheck, Play, Grid3X3, Radio } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { useHeartbeat } from '@/hooks/usePresence';
import UserAvatar from '@/components/UserAvatar';
const SITE = 'https://stooorna.com';
interface PublicProfile {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  online: boolean;
  lastSeenAt: string | null;
  isPrivate: boolean;
  nameColor?: string | null;
  followersCount?: number;
  likesCount?: number;
  isCompany?: boolean;
}
interface UserPost {
  id: number;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  caption: string | null;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}
function formatLastSeen(ts: string | null): string {
  if (!ts) return 'a while ago';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


function voiceChannelForHost(hostId: string): string {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (clean) return `stooorna-live-${clean}`;
  let h = 0;
  const s = String(hostId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  const uid = Math.abs(h) % 100_000 || 1;
  return `stooorna-live-${uid}`;
}

function camChannelForHost(hostId: string): string {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (clean) return `stooorna-livecam-${clean}`;
  let h = 0;
  const s = String(hostId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  const uid = Math.abs(h) % 100_000 || 1;
  return `stooorna-livecam-${uid}`;
}

function readLocalActive(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const data = JSON.parse(raw) as { active?: boolean; at?: number };
    if (!data?.active) return false;
    if (data.at && Date.now() - data.at > 45_000) return false;
    return true;
  } catch {
    return false;
  }
}

type LiveKind = 'voice' | 'camera' | null;

function useProfileLive(hostId: string | null | undefined): LiveKind {
  const [kind, setKind] = useState<LiveKind>(null);

  useEffect(() => {
    if (!hostId) {
      setKind(null);
      return;
    }
    let cancelled = false;

    const apply = (v: LiveKind) => {
      if (!cancelled) setKind(v);
    };

    const checkLocal = (): LiveKind => {
      if (readLocalActive(`stooorna_livecam_active_${hostId}`)) return 'camera';
      if (readLocalActive(`stooorna_live_active_${hostId}`)) return 'voice';
      return null;
    };

    const checkRoom = async () => {
      const local = checkLocal();
      if (local) {
        apply(local);
      }
      // Camera channel first, then voice
      try {
        const camCh = camChannelForHost(hostId);
        const rCam = await fetch(`/api/room?id=${encodeURIComponent(camCh)}`, { credentials: 'include' });
        if (rCam.ok) {
          const data = await rCam.json() as { members?: unknown[] };
          const n = Array.isArray(data.members) ? data.members.length : 0;
          if (n > 0) {
            apply('camera');
            return;
          }
        }
      } catch { /* ignore */ }
      try {
        const voiceCh = voiceChannelForHost(hostId);
        const r = await fetch(`/api/room?id=${encodeURIComponent(voiceCh)}`, { credentials: 'include' });
        if (r.ok) {
          const data = await r.json() as { members?: unknown[] };
          const n = Array.isArray(data.members) ? data.members.length : 0;
          if (n > 0) {
            apply('voice');
            return;
          }
        }
      } catch { /* ignore */ }
      apply(checkLocal());
    };

    checkRoom();
    const interval = window.setInterval(checkRoom, 2500);

    const onVoice = (e: Event) => {
      const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
      if (!d || String(d.hostId) !== String(hostId)) return;
      if (d.active) apply(checkLocal() || 'voice');
      else void checkRoom();
    };
    const onCam = (e: Event) => {
      const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
      if (!d || String(d.hostId) !== String(hostId)) return;
      if (d.active) apply('camera');
      else void checkRoom();
    };
    window.addEventListener('stooorna:live-active', onVoice);
    window.addEventListener('stooorna:livecam-active', onCam);

    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_live_active_${hostId}` || e.key === `stooorna_livecam_active_${hostId}`) {
        void checkRoom();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('stooorna:live-active', onVoice);
      window.removeEventListener('stooorna:livecam-active', onCam);
      window.removeEventListener('storage', onStorage);
    };
  }, [hostId]);

  return kind;
}


// ── Flashing glow ring for new-post indicator ─────────────────────────────────
function NewPostGlow() {
  return <>
      <style>{`
        @keyframes stooorna-glow-pulse {
          0%   { box-shadow: 0 0 0 3px hsl(var(--destructive)), 0 0 14px 6px hsl(var(--primary)); opacity: 1; }
          50%  { box-shadow: 0 0 0 4px hsl(var(--primary)), 0 0 20px 10px hsl(var(--destructive)); opacity: 0.7; }
          100% { box-shadow: 0 0 0 3px hsl(var(--destructive)), 0 0 14px 6px hsl(var(--primary)); opacity: 1; }
        }
        .stooorna-new-post-glow {
          animation: stooorna-glow-pulse 1.2s ease-in-out infinite;
          border-radius: 50%;
        }
        @keyframes stooorna-live-avatar-pulse {
          0%, 100% { box-shadow: 0 0 0 3px #ef4444, 0 0 16px 4px rgba(239,68,68,0.55); }
          50% { box-shadow: 0 0 0 5px #ef4444, 0 0 28px 10px rgba(239,68,68,0.35); }
        }
        .stooorna-live-avatar-glow {
          animation: stooorna-live-avatar-pulse 1s ease-in-out infinite;
          border-radius: 50%;
        }
      `}</style>
    </>;
}

// ── Post thumbnail card ───────────────────────────────────────────────────────
function PostCard({
  post,
  onClick
}: {
  post: UserPost;
  onClick: () => void;
}) {
  return <button onClick={onClick} className="relative aspect-square overflow-hidden bg-muted border-none cursor-pointer p-0 block w-full">
      {post.thumbnailUrl || post.mediaType === 'image' ? <img src={post.thumbnailUrl || post.mediaUrl} alt={post.caption || 'Post'} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full bg-muted flex items-center justify-center">
          <Play size={24} className="text-muted-foreground" />
        </div>}
      {/* Video badge */}
      {post.mediaType === 'video' && <div className="absolute top-1.5 right-1.5">
          <Play size={14} className="text-primary-foreground drop-shadow" fill="currentColor" />
        </div>}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
        <div className="flex items-center gap-3 text-primary-foreground text-sm font-bold drop-shadow">
          <span className="flex items-center gap-1"><Heart size={14} fill="currentColor" /> {post.likeCount}</span>
          <span className="flex items-center gap-1"><MessageCircle size={14} /> {post.commentCount}</span>
        </div>
      </div>
    </button>;
}

// ── Post detail modal ─────────────────────────────────────────────────────────
function PostModal({
  post,
  profileId,
  onClose,
  onLike,
  onAuthRequired
}: {
  post: UserPost;
  profileId: string;
  onClose: () => void;
  onLike: (id: number) => void;
  onAuthRequired: () => void;
}) {
  const {
    user
  } = useSession();
  const [likeBurstKey, setLikeBurstKey] = useState(0);
  return <motion.div initial={{
    opacity: 0
  }} animate={{
    opacity: 1
  }} exit={{
    opacity: 0
  }} className="fixed inset-0 bg-black/80 flex items-center justify-center" style={{
    zIndex: 200
  }} onClick={onClose}>
      <motion.div initial={{
      scale: 0.9,
      opacity: 0
    }} animate={{
      scale: 1,
      opacity: 1
    }} exit={{
      scale: 0.9,
      opacity: 0
    }} transition={{
      type: 'spring',
      damping: 25,
      stiffness: 300
    }} className="relative bg-card rounded-2xl overflow-hidden max-w-sm w-full mx-4" style={{
      maxHeight: '85dvh'
    }} onClick={e => e.stopPropagation()}>
        {/* Media */}
        {post.mediaType === 'video' ? <video src={post.mediaUrl} controls playsInline className="w-full" style={{
        maxHeight: '60dvh',
        objectFit: 'contain',
        background: 'hsl(var(--background))'
      }} /> : <img src={post.mediaUrl} alt={post.caption || 'Post'} className="w-full" style={{
        maxHeight: '60dvh',
        objectFit: 'contain',
        background: 'hsl(var(--background))'
      }} />}

        {/* Actions */}
        <div className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <button onClick={() => {
            if (!user) {
              onAuthRequired();
              return;
            }
            setLikeBurstKey(key => key + 1);
            onLike(post.id);
          }} className="relative flex items-center gap-1.5 bg-transparent border-none cursor-pointer">
              <AnimatePresence>
                {likeBurstKey > 0 && (
                  <motion.span
                    key={likeBurstKey}
                    initial={{ opacity: 0.9, scale: 0.35 }}
                    animate={{ opacity: 0, scale: 2.4 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.48, ease: 'easeOut' }}
                    aria-hidden="true"
                    className="absolute -left-1 -top-1 h-8 w-8 rounded-full border-2 border-destructive pointer-events-none"
                  />
                )}
              </AnimatePresence>
              <motion.span key={likeBurstKey} animate={likeBurstKey ? { scale: [1, 1.32, 0.94, 1] } : { scale: 1 }} transition={{ duration: 0.34, ease: 'easeOut' }} className="inline-flex">
                <Heart size={22} className={post.likedByMe ? 'text-destructive fill-destructive' : 'text-foreground'} />
              </motion.span>
              <span className="text-foreground text-sm font-semibold">{post.likeCount}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <MessageCircle size={22} className="text-muted-foreground" />
              <span className="text-muted-foreground text-sm">{post.commentCount}</span>
            </div>
          </div>
          {post.caption && <p className="text-foreground text-sm leading-relaxed m-0">{post.caption}</p>}
        </div>

        {/* Close */}
        <button onClick={onClose} className="absolute top-3 right-3 bg-card/80 border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-foreground text-lg leading-none">
          ×
        </button>
      </motion.div>
    </motion.div>;
}

// ── Main profile page ─────────────────────────────────────────────────────────
export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user, isPending } = useSession();
  useHeartbeat(!!user);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [hasNewPost, setHasNewPost] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<UserPost | null>(null);
  const liveKind = useProfileLive(profile?.id);

  // Fetch profile
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setNotFound(false);
    fetch(`/api/users/by-username/${encodeURIComponent(username)}`).then(r => {
      if (r.status === 404) {
        setNotFound(true);
        return null;
      }
      return r.ok ? r.json() : null;
    }).then(d => {
      if (d) setProfile(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [username]);

  // Fetch posts + follow status once profile is loaded
  useEffect(() => {
    if (!profile) return;

    // Posts
    fetch(`/api/users/${profile.id}/posts`, {
      credentials: 'include'
    }).then(r => r.json()).then(d => {
      setPosts(d.posts || []);
      setHasNewPost(!!d.hasNewPost);
    }).catch(() => {});

    // Follow status
    if (user && user.id !== profile.id) {
      fetch(`/api/users/${profile.id}/follow-status`, {
        credentials: 'include'
      }).then(r => r.ok ? r.json() : null).then(d => {
        if (d) setFollowing(d.following);
      }).catch(() => {});
    }
  }, [profile, user]);
  const handleFollow = useCallback(async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!profile || followLoading) return;
    const previousFollowing = following;
    const nextFollowing = !previousFollowing;
    setFollowing(nextFollowing);
    setFollowLoading(true);
    try {
      const r = await fetch(`/api/users/${profile.id}/follow`, {
        method: 'POST',
        credentials: 'include'
      });
      const d = await r.json().catch(() => ({})) as { following?: boolean };
      if (!r.ok || typeof d.following !== 'boolean') throw new Error('Follow request failed');
      setFollowing(d.following);
    } catch {
      setFollowing(previousFollowing);
    }
    setFollowLoading(false);
  }, [user, profile, navigate]);
  async function handleLike(postId: number) {
    if (!user) {
      navigate('/auth');
      return;
    }
    try {
      const r = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
        credentials: 'include'
      });
      const d = await r.json();
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        likedByMe: d.liked,
        likeCount: d.likeCount
      } : p));
      if (selectedPost?.id === postId) {
        setSelectedPost(prev => prev ? {
          ...prev,
          likedByMe: d.liked,
          likeCount: d.likeCount
        } : prev);
      }
    } catch {}
  }
  if (loading || isPending) {
    return <div className="flex items-center justify-center" style={{
      height: '100dvh',
      background: 'hsl(var(--background))'
    }}>
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>;
  }
  if (notFound || !profile) {
    return <div className="flex flex-col items-center justify-center gap-4" style={{
      height: '100dvh',
      background: 'hsl(var(--background))'
    }}>
        <p className="text-muted-foreground text-base">User not found.</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm bg-transparent border-none cursor-pointer">Go back</button>
      </div>;
  }
  const isOwnProfile = user?.id === profile.id;
  // @stooorna is the owner account and the Support identity
  const isSupportProfile = profile.username?.replace(/^@/, '').toLowerCase() === 'stooorna';
  const totalLikes = posts.reduce((sum, post) => sum + post.likeCount, 0);
  const supportBlue = '#00BCD4';
  const pageTitle = isSupportProfile
    ? 'Stooorna (Support) — Stooorna'
    : `${profile.name || profile.username || 'User'} (@${profile.username || 'unknown'}) — Stooorna`;
  return <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={profile.bio || `Check out ${profile.name || profile.username}'s posts on Stooorna.`} />
        <link rel="canonical" href={`${SITE}/u/${profile.username}`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={profile.bio || `${profile.name || profile.username} on Stooorna`} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={`${SITE}/u/${profile.username}`} />
      </Helmet>

      {<NewPostGlow />}

      <main className="flex flex-col bg-background" style={{
      height: '100dvh',
      overflow: 'hidden'
    }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <button onClick={() => navigate(-1)} className="bg-transparent border-none cursor-pointer p-1 text-foreground">
            <ArrowLeft size={22} />
          </button>
          <span
            className={`font-bold text-base flex-1 truncate ${isSupportProfile ? 'text-primary' : 'text-foreground'}`}
            style={isSupportProfile ? { color: supportBlue } : undefined}
          >
            {isSupportProfile ? 'Stooorna (Support)' : (profile.username || profile.name || 'Profile')}
          </span>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Profile hero */}
          <div className="flex flex-col items-center px-4 pt-6 pb-4">
            {/* Avatar + chat on the circle — Support is fully cyan/blue */}
            <div className="relative" style={{ display: 'inline-flex' }}>
              <div
                className={
                  liveKind
                    ? 'stooorna-live-avatar-glow'
                    : (!isSupportProfile && hasNewPost ? 'stooorna-new-post-glow' : '')
                }
                style={{
                  borderRadius: '50%',
                  padding: liveKind ? 4 : (isSupportProfile ? 4 : (hasNewPost ? 3 : 0)),
                  boxShadow: liveKind
                    ? undefined
                    : (isSupportProfile
                      ? `0 0 0 3px ${supportBlue}, 0 0 18px 6px rgba(0,188,212,0.45)`
                      : undefined),
                  cursor: liveKind ? 'pointer' : undefined,
                }}
                onClick={() => {
                  if (!liveKind || !profile) return;
                  const qs = new URLSearchParams({
                    hostId: profile.id,
                    hostName: profile.name || profile.username || 'Host',
                    hostUsername: profile.username || '',
                    hostAvatar: profile.avatarUrl || '',
                  }).toString();
                  navigate(liveKind === 'camera' ? `/live-camera?${qs}` : `/live?${qs}`);
                }}
                role={liveKind ? 'button' : undefined}
                aria-label={liveKind ? 'Join live broadcast' : undefined}
              >
                <UserAvatar name={profile.name || profile.username || '?'} avatarUrl={profile.avatarUrl} size={88} />
              </div>
              {liveKind ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!profile) return;
                    const qs = new URLSearchParams({
                      hostId: profile.id,
                      hostName: profile.name || profile.username || 'Host',
                      hostUsername: profile.username || '',
                      hostAvatar: profile.avatarUrl || '',
                    }).toString();
                    navigate(liveKind === 'camera' ? `/live-camera?${qs}` : `/live?${qs}`);
                  }}
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(239,68,68,0.55)',
                    zIndex: 2,
                  }}
                >
                  <Radio size={12} strokeWidth={2.5} />
                  {liveKind === 'camera' ? 'Video Live' : 'Voice Live'}
                </button>
              ) : null}
              {/* Chat icon on the circle */}
              {(!isOwnProfile || isSupportProfile) && (
                <button
                  onClick={() => {
                    if (!user) {
                      navigate('/auth');
                      return;
                    }
                    navigate(
                      `/chat?with=${profile.id}&name=${encodeURIComponent(isSupportProfile ? 'Stooorna (Support)' : (profile.name ?? ''))}&username=${encodeURIComponent(profile.username ?? 'stooorna')}&avatarUrl=${encodeURIComponent(profile.avatarUrl ?? '')}${isSupportProfile ? '&support=1' : ''}`
                    );
                  }}
                  aria-label="Chat"
                  className="flex items-center justify-center cursor-pointer"
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: -6,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: supportBlue,
                    border: '2.5px solid hsl(var(--background))',
                    color: '#041018',
                    boxShadow: isSupportProfile ? '0 0 12px rgba(0,188,212,0.6)' : undefined,
                  }}
                >
                  <MessageCircle size={17} strokeWidth={2.4} fill="#041018" />
                </button>
              )}
            </div>

            {/* Live status button — visible to visitors when host is broadcasting */}
            {liveKind ? (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  if (!profile) return;
                  const qs = new URLSearchParams({
                    hostId: profile.id,
                    hostName: profile.name || profile.username || 'Host',
                    hostUsername: profile.username || '',
                    hostAvatar: profile.avatarUrl || '',
                  }).toString();
                  navigate(liveKind === 'camera' ? `/live-camera?${qs}` : `/live?${qs}`);
                }}
                className="mt-2 px-5 py-2 rounded-full text-sm font-bold border-none cursor-pointer"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                  border: '1.5px solid rgba(239,68,68,0.65)',
                  boxShadow: '0 0 14px rgba(239,68,68,0.35)',
                  animation: 'stooorna-live-avatar-pulse 1s ease-in-out infinite',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Radio size={16} strokeWidth={2.4} />
                {liveKind === 'camera' ? 'Video Live' : 'Voice Live'}
              </motion.button>
            ) : null}

            {/* New post badge */}
            {hasNewPost && !isSupportProfile && !liveKind && <motion.div initial={{
            opacity: 0,
            y: -4
          }} animate={{
            opacity: 1,
            y: 0
          }} className="mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold" style={{
            background: 'hsl(var(--destructive))',
            color: 'hsl(var(--destructive-foreground))'
          }}>
                New post
              </motion.div>}

            {/* Name + username — fully blue for Support / Owner */}
            <h1
              className="font-bold text-xl mt-3 mb-0.5 text-center"
              style={{ color: isSupportProfile ? supportBlue : (profile.nameColor || undefined) }}
            >
              {isSupportProfile ? 'Stooorna (Support)' : (profile.name || profile.username || 'Unknown')}
            </h1>
            {profile.username && (
              <p
                className={`text-sm mb-2 ${isSupportProfile ? 'font-semibold' : 'text-muted-foreground'}`}
                style={isSupportProfile ? { color: supportBlue } : (profile.nameColor ? { color: profile.nameColor, opacity: 0.8 } : undefined)}
              >
                @{profile.username}{isSupportProfile ? ' · Support · Owner' : ''}
              </p>
            )}

            {/* Online status */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-2 h-2 rounded-full" style={{
              background: profile.online || isSupportProfile ? supportBlue : 'hsl(var(--muted-foreground))'
            }} />
              <span className="text-muted-foreground text-xs" style={isSupportProfile ? { color: 'rgba(0,188,212,0.85)' } : undefined}>
                {profile.online || isSupportProfile ? 'Online' : `Last seen ${formatLastSeen(profile.lastSeenAt)}`}
              </span>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p
                className="text-sm text-center leading-relaxed max-w-xs mb-4"
                style={{ color: isSupportProfile ? 'rgba(0,188,212,0.92)' : undefined }}
              >
                {profile.bio}
              </p>
            )}

            {/* Stats — company: Post / Followers / Likes ; user: Followers / Likes (skip support) */}
            {!isSupportProfile && (
              <div className="flex items-center gap-8 mb-4">
                {!!profile.isCompany && (
                  <div className="flex flex-col items-center">
                    <span className="text-foreground font-bold text-lg">{posts.length}</span>
                    <span className="text-muted-foreground text-xs">Posts</span>
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <span className="text-foreground font-bold text-lg">{profile.followersCount ?? 0}</span>
                  <span className="text-muted-foreground text-xs">Followers</span>
                </div>
                <div className="flex flex-col items-center" aria-label={`${profile.likesCount ?? totalLikes} total likes`}>
                  <span className="text-foreground font-bold text-lg">{profile.likesCount ?? totalLikes}</span>
                  <span className="text-muted-foreground text-xs">Likes</span>
                </div>
              </div>
            )}

            {/* Actions: Support → Chat only; others → Follow */}
            {!isOwnProfile && (
              isSupportProfile ? (
                <button
                  onClick={() => {
                    if (!user) {
                      navigate('/auth');
                      return;
                    }
                    navigate(
                      `/chat?with=${profile.id}&name=${encodeURIComponent('Stooorna (Support)')}&username=stooorna&avatarUrl=${encodeURIComponent(profile.avatarUrl ?? '')}&support=1`
                    );
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm cursor-pointer border-none"
                  style={{
                    background: supportBlue,
                    color: '#041018',
                    boxShadow: '0 0 16px rgba(0,188,212,0.4)',
                  }}
                >
                  <MessageCircle size={16} strokeWidth={2.4} />
                  Chat with Support
                </button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={handleFollow} disabled={followLoading} className="flex items-center gap-2 px-5 py-2 rounded-full font-semibold text-sm cursor-pointer border-none disabled:opacity-60" style={{
                    background: following ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
                    color: following ? 'hsl(var(--foreground))' : 'hsl(var(--primary-foreground))'
                  }}>
                    {following ? <UserCheck size={16} /> : <UserPlus size={16} />}
                    {following ? 'Following' : 'Follow'}
                  </button>
                </div>
              )
            )}
          </div>

          {/* Posts grid header */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <Grid3X3 size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground text-sm font-medium">Posts</span>
          </div>

          {/* Posts grid */}
          {posts.length === 0 ? <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-muted-foreground text-sm">No posts yet.</p>
            </div> : <div className="grid grid-cols-3 gap-0.5 pb-8">
              {posts.map(post => <PostCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />)}
            </div>}
        </div>
      </main>

      {/* Post detail modal */}
      <AnimatePresence>
        {selectedPost && <PostModal post={selectedPost} profileId={profile.id} onClose={() => setSelectedPost(null)} onLike={handleLike} onAuthRequired={() => navigate('/auth')} />}
      </AnimatePresence>
    </>;
}