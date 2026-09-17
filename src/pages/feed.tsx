/**
 * /feed — TikTok-style full-screen video/image feed
 * Guests can browse public posts and read comments; interactions require sign-in.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageCircle, UserPlus, UserCheck, ArrowLeft, Volume2, VolumeX, Play } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import UserAvatar from '@/components/UserAvatar';
const SITE = 'https://stooorna.com';
interface PostAuthor {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  nameColor?: string | null;
}
interface FeedPost {
  id: number;
  userId: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  caption: string | null;
  thumbnailUrl: string | null;
  duration: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  author: PostAuthor;
  authorNameColor?: string | null;
  likedByMe: boolean;
  followingAuthor: boolean;
}
interface Comment {
  id: number;
  body: string;
  createdAt: string;
  author: {
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    nameColor?: string | null;
  };
  authorNameColor?: string | null;
}

// ── Single post slide ─────────────────────────────────────────────────────────
function PostSlide({
  post,
  isActive,
  onLike,
  onFollow,
  onOpenComments,
  onAvatarClick,
  muted,
  onToggleMute
}: {
  post: FeedPost;
  isActive: boolean;
  onLike: (id: number) => void;
  onFollow: (userId: string) => void;
  onOpenComments: (post: FeedPost) => void;
  onAvatarClick: (username: string | null) => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [heartAnim, setHeartAnim] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || post.mediaType !== 'video') return;
    if (isActive) {
      v.currentTime = 0;
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [isActive, post.mediaType]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);
  function handleDoubleTap() {
    onLike(post.id);
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 900);
  }
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }
  return <div className="relative w-full bg-background overflow-hidden flex-shrink-0" style={{
    height: '100dvh'
  }} onDoubleClick={handleDoubleTap}>
      {/* Media */}
      {post.mediaType === 'video' ? <video ref={videoRef} src={post.mediaUrl} poster={post.thumbnailUrl || undefined} loop playsInline muted preload="auto" className="w-full h-full object-cover" onClick={togglePlay} /> : <img src={post.mediaUrl} alt={post.caption || 'Post'} className="w-full h-full object-cover" />}

      {/* Gradient overlay — pure Tailwind, no inline rgba */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Pause indicator */}
      <AnimatePresence>
        {post.mediaType === 'video' && !playing && isActive && <motion.div initial={{
        opacity: 0,
        scale: 0.7
      }} animate={{
        opacity: 1,
        scale: 1
      }} exit={{
        opacity: 0,
        scale: 0.7
      }} transition={{
        duration: 0.15
      }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 rounded-full w-16 h-16 flex items-center justify-center pointer-events-none">
            <Play size={28} className="text-primary-foreground fill-primary-foreground" />
          </motion.div>}
      </AnimatePresence>

      {/* Double-tap heart */}
      <AnimatePresence>
        {heartAnim && <motion.div initial={{
        opacity: 0,
        scale: 0.5
      }} animate={{
        opacity: 1,
        scale: 1.3
      }} exit={{
        opacity: 0,
        scale: 1.8
      }} transition={{
        duration: 0.5
      }} className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <Heart size={80} className="text-destructive fill-destructive" />
          </motion.div>}
      </AnimatePresence>

      {/* Bottom: author + caption */}
      <div className="absolute bottom-0 left-0 right-14 p-4 pb-8 pointer-events-none">
          <div className="flex items-center gap-2.5 mb-2 pointer-events-auto cursor-pointer" onClick={() => onAvatarClick(post.author.username)}>
          <UserAvatar name={post.author.name || post.author.username || '?'} avatarUrl={post.author.avatarUrl} size={40} />
          <div>
            <div className="font-bold text-sm leading-tight drop-shadow-md" style={{ color: post.author.nameColor || post.authorNameColor || '#ffffff' }}>
              {post.author.name || post.author.username || 'Unknown'}
            </div>
            {post.author.username && <div className="text-white/60 text-xs drop-shadow">@{post.author.username}</div>}
          </div>
        </div>
        {post.caption && <p className="text-primary-foreground text-sm leading-relaxed m-0 max-w-[90%] drop-shadow line-clamp-3">
            {post.caption}
          </p>}
      </div>

      {/* Right action bar */}
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-5">
        <ActionBtn icon={<Heart size={28} className={post.likedByMe ? 'text-destructive fill-destructive' : 'text-primary-foreground'} />} label={String(post.likeCount)} onClick={() => onLike(post.id)} />
        <ActionBtn icon={<MessageCircle size={28} className="text-primary-foreground" />} label={String(post.commentCount)} onClick={() => onOpenComments(post)} />
        <ActionBtn icon={post.followingAuthor ? <UserCheck size={26} className="text-primary" /> : <UserPlus size={26} className="text-primary-foreground" />} label={post.followingAuthor ? 'Following' : 'Follow'} onClick={() => onFollow(post.userId)} />
        <ActionBtn icon={muted ? <VolumeX size={24} className="text-white/50" /> : <Volume2 size={24} className="text-primary-foreground" />} label="" onClick={onToggleMute} />
      </div>
    </div>;
}
function ActionBtn({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return <button onClick={onClick} className="bg-transparent border-none cursor-pointer flex flex-col items-center gap-0.5 p-1">
      {icon}
      {label && <span className="text-primary-foreground text-xs font-semibold drop-shadow">{label}</span>}
    </button>;
}

// ── Comments panel ────────────────────────────────────────────────────────────
function CommentsPanel({
  post,
  onClose,
  onAuthRequired
}: {
  post: FeedPost;
  onClose: () => void;
  onAuthRequired: () => void;
}) {
  const {
    user
  } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    fetch(`/api/posts/${post.id}/comments`).then(r => r.json()).then(d => setComments(d.comments || [])).catch(() => {});
  }, [post.id]);
  async function sendComment() {
    if (!user) {
      onAuthRequired();
      return;
    }
    if (!input.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: input.trim()
        }),
        credentials: 'include'
      });
      setComments(prev => [...prev, {
        id: Date.now(),
        body: input.trim(),
        createdAt: new Date().toISOString(),
        author: {
          name: user.name,
          username: (user as any).username,
          avatarUrl: (user as any).avatarUrl
        }
      }]);
      setInput('');
    } catch {}
    setSending(false);
  }
  return <motion.div initial={{
    y: '100%'
  }} animate={{
    y: 0
  }} exit={{
    y: '100%'
  }} transition={{
    type: 'spring',
    damping: 28,
    stiffness: 300
  }} className="fixed bottom-0 left-0 right-0 bg-card border border-border border-b-0 rounded-t-2xl flex flex-col" style={{
    height: '65dvh',
    zIndex: 100
  }}>
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <span className="text-foreground font-bold text-base">Comments ({post.commentCount})</span>
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-muted-foreground text-2xl leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {comments.length === 0 && <p className="text-muted-foreground text-center mt-8 text-sm">No comments yet. Be the first!</p>}
        {comments.map(c => <div key={c.id} className="flex gap-2.5 mb-4">
            <UserAvatar name={c.author.name || c.author.username || '?'} avatarUrl={c.author.avatarUrl} size={32} />
            <div>
              <span className="font-semibold text-xs" style={{ color: c.author.nameColor || c.authorNameColor || 'hsl(var(--primary))' }}>
                {c.author.username || c.author.name || 'User'}
              </span>
              <p className="text-foreground text-sm mt-0.5 m-0">{c.body}</p>
            </div>
          </div>)}
      </div>

      <div className="flex gap-2 px-4 py-2.5 pb-5 border-t border-border">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder={user ? 'Add a comment…' : 'Sign in to comment'} onFocus={() => {
        if (!user) onAuthRequired();
      }} className="flex-1 bg-muted border border-border rounded-full px-3.5 py-2 text-foreground text-sm outline-none" />
        <button onClick={sendComment} disabled={sending || !input.trim()} className="bg-primary border-none rounded-full px-4 py-2 text-primary-foreground font-bold cursor-pointer text-sm disabled:opacity-50">
          Post
        </button>
      </div>
    </motion.div>;
}

// ── Main feed page ────────────────────────────────────────────────────────────
export default function FeedPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(false);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadingMore = useRef(false);
  const loadFeed = useCallback(async (cursor?: number) => {
    try {
      const url = cursor ? `/api/posts?cursor=${cursor}&limit=10` : '/api/posts?limit=10';
      const r = await fetch(url, {
        credentials: 'include'
      });
      const d = await r.json();
      if (cursor) {
        setPosts(prev => [...prev, ...(d.posts || [])]);
      } else {
        setPosts(d.posts || []);
      }
      setNextCursor(d.nextCursor);
    } catch {}
    setLoading(false);
    loadingMore.current = false;
  }, []);
  useEffect(() => {
    loadFeed();
  }, [loadFeed]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / window.innerHeight);
      setActiveIdx(idx);
      if (idx >= posts.length - 3 && nextCursor && !loadingMore.current) {
        loadingMore.current = true;
        loadFeed(nextCursor);
      }
    };
    el.addEventListener('scroll', onScroll, {
      passive: true
    });
    return () => el.removeEventListener('scroll', onScroll);
  }, [posts.length, nextCursor, loadFeed]);
  function requireAuth() {
    navigate('/auth');
  }
  async function handleLike(postId: number) {
    if (!user) {
      requireAuth();
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
    } catch {}
  }
  async function handleFollow(userId: string) {
    if (!user) {
      requireAuth();
      return;
    }
    const previousFollowing = Boolean(posts.find((post) => post.userId === userId)?.followingAuthor);
    const nextFollowing = !previousFollowing;
    setPosts(prev => prev.map(p => p.userId === userId ? {
      ...p,
      followingAuthor: nextFollowing
    } : p));
    try {
      const r = await fetch(`/api/users/${userId}/follow`, {
        method: 'POST',
        credentials: 'include'
      });
      const d = await r.json().catch(() => ({})) as { following?: boolean };
      if (!r.ok || typeof d.following !== 'boolean') throw new Error('Follow request failed');
      const confirmedFollowing = d.following;
      setPosts(prev => prev.map(p => p.userId === userId ? {
        ...p,
        followingAuthor: confirmedFollowing
      } : p));
    } catch {
      setPosts(prev => prev.map(p => p.userId === userId ? {
        ...p,
        followingAuthor: previousFollowing
      } : p));
    }
  }
  return <>
      <Helmet>
        <title>Feed — Stooorna</title>
        <meta name="description" content="Browse the latest video and photo posts from creators on Stooorna." />
        <link rel="canonical" href={`${SITE}/feed`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <h1 className="sr-only">Stooorna Feed</h1>

      {/* Back button */}
      <button onClick={() => navigate('/')} className="fixed left-3 bg-card/70 border-none rounded-full w-10 h-10 flex items-center justify-center cursor-pointer" style={{
      top: 'env(safe-area-inset-top, 12px)',
      zIndex: 50
    }}>
        <ArrowLeft size={20} className="text-foreground" />
      </button>

      {/* Title */}
      <div className="fixed left-1/2 -translate-x-1/2 text-primary-foreground font-extrabold text-base drop-shadow-md pointer-events-none" style={{
      top: 'env(safe-area-inset-top, 14px)',
      zIndex: 50
    }}>
        For You
      </div>

      {/* Guest sign-in button — top-right, feed page */}
      {!user && <motion.button initial={{
      opacity: 0,
      scale: 0.85
    }} animate={{
      opacity: 1,
      scale: 1
    }} transition={{
      delay: 0.4,
      duration: 0.3,
      ease: 'easeOut' as const
    }} whileTap={{
      scale: 0.92
    }} onClick={() => navigate('/auth')} className="fixed flex items-center gap-1.5 font-bold text-sm rounded-full px-4 py-2" style={{
      top: 'max(10px, env(safe-area-inset-top, 10px))',
      right: 12,
      zIndex: 50,
      background: 'hsl(var(--primary))',
      color: 'hsl(var(--primary-foreground))',
      border: 'none',
      cursor: 'pointer',
      boxShadow: '0 2px 14px hsl(var(--primary) / 0.5)'
    }}>
          <span style={{
        fontSize: '0.9rem',
        lineHeight: 1
      }}>⚡</span>
          تسجيل الدخول
        </motion.button>}

      {/* Scroll container */}
      <div ref={containerRef} className="w-full bg-background" style={{
      height: '100dvh',
      overflowY: 'scroll',
      scrollSnapType: 'y mandatory'
    }}>
        {loading && <div className="flex items-center justify-center text-muted-foreground text-sm" style={{
        height: '100dvh'
      }}>
            Loading feed…
          </div>}

        {!loading && posts.length === 0 && <div className="flex flex-col items-center justify-center gap-3" style={{
        height: '100dvh'
      }}>
            <p className="text-muted-foreground text-base">No posts yet.</p>
            <p className="text-muted-foreground text-sm">Be the first to share something!</p>
          </div>}

        {posts.map((post, idx) => <div key={post.id} style={{
        scrollSnapAlign: 'start',
        height: '100dvh'
      }}>
            <PostSlide post={post} isActive={idx === activeIdx} onLike={handleLike} onFollow={handleFollow} onOpenComments={p => setCommentPost(p)} onAvatarClick={u => u && navigate(`/u/${u}`)} muted={muted} onToggleMute={() => setMuted(m => !m)} />
          </div>)}
      </div>

      {/* Comments panel */}
      <AnimatePresence>
        {commentPost && <>
            <motion.div initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} exit={{
          opacity: 0
        }} className="fixed inset-0 bg-black/50" style={{
          zIndex: 99
        }} onClick={() => setCommentPost(null)} />
            <CommentsPanel post={commentPost} onClose={() => setCommentPost(null)} onAuthRequired={requireAuth} />
          </>}
      </AnimatePresence>
    </>;
}
