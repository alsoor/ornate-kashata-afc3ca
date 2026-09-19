import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Phone, Check, X, Images, Heart, ChevronDown, RotateCcw, Zap, ZapOff, Music, Play, Pause, Search } from 'lucide-react';
import NetworkAudioControls from '@/components/NetworkAudioControls';
import { useSession } from '@/lib/auth/auth-client';
import { useHeartbeat } from '@/hooks/usePresence';
import { notifyWhisperAlert } from '@/hooks/useNotifications';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
// OnlineFriend type — used for whisper/friend selection in this screen
export interface OnlineFriend {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl?: string | null;
}
import UserAvatar from '@/components/UserAvatar';
import StatusViewer, { type StatusGroup } from '@/components/StatusViewer';
import { useGlobalCall } from '@/components/GlobalCallProvider';
// ── WhisperFriendStrip — same visual style as ChannelWaves ───────────────────
interface WhisperFriendStripProps {
  friends: OnlineFriend[];
  onlineIds: Set<string>;
  selected: OnlineFriend | null;
  onSelect: (f: OnlineFriend) => void;
  theme: 'cyan' | 'bronze';
  labelColor: string;
  textDim: string;
}
function WhisperFriendStrip({ friends, onlineIds, selected, onSelect, labelColor, textDim }: WhisperFriendStripProps) {
  const { incomingCaller, activeCall, acceptCall, endCall } = useGlobalCall();
  const accent       = 'rgba(200,130,30,0.9)';
  const accentDim    = 'rgba(200,130,30,0.35)';
  const accentFaint  = 'rgba(180,100,20,0.1)';
  const accentBorder = 'rgba(180,100,20,0.22)';
  if (friends.length === 0) {
    return (
      <div style={{ width: '100%', maxWidth: 340 }}>
        <p style={{ color: textDim, fontSize: '0.52rem', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8, fontWeight: 500 }}>
          Friends
        </p>
        <p style={{ color: textDim, fontSize: '0.68rem', textAlign: 'center', opacity: 0.6 }}>
          Add friends to whisper
        </p>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', maxWidth: 340 }}>
      <p style={{ color: textDim, fontSize: '0.52rem', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8, fontWeight: 500 }}>
        {selected ? `→ ${selected.name ?? selected.username}` : 'Whisper to'}
      </p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingLeft: 4, paddingRight: 4 }}>
        {friends.map((f) => {
          const isOnline   = onlineIds.has(f.id);
          const isSelected = selected?.id === f.id;
          const label      = f.username ? `@${f.username}` : (f.name ?? '??');
          const isIncoming = incomingCaller?.id === f.id;
          const isInActive = activeCall?.peerId === f.id;
          return (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.88 }}
              onClick={() => onSelect(f)}
              style={{
                flexShrink: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 10px',
                borderRadius: 10,
                background: isSelected ? 'rgba(200,130,30,0.15)' : isIncoming ? 'rgba(34,197,94,0.1)' : isInActive ? 'rgba(239,68,68,0.1)' : accentFaint,
                border: `1px solid ${isSelected ? accentDim : isIncoming ? '#22c55e' : isInActive ? '#ef4444' : isOnline ? 'rgba(34,197,94,0.3)' : accentBorder}`,
                cursor: 'pointer', outline: 'none',
                minWidth: 56,
                transition: 'all 0.15s',
                boxShadow: isSelected ? `0 0 10px rgba(200,130,30,0.2)` : isIncoming ? '0 0 10px rgba(34,197,94,0.3)' : 'none',
              }}
            >
              {/* Avatar with online dot */}
              <div style={{ position: 'relative' }}>
                <UserAvatar
                  name={label}
                  avatarUrl={f.avatarUrl}
                  size={36}
                  style={{
                    border: `2px solid ${isSelected ? accentDim : isIncoming ? '#22c55e' : isInActive ? '#ef4444' : isOnline ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 0.2s',
                  }}
                />
                {!isIncoming && !isInActive && (
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 9, height: 9, borderRadius: '50%',
                    background: isOnline ? '#22c55e' : 'rgba(150,150,150,0.3)',
                    border: '1.5px solid rgba(8,4,0,0.95)',
                  }} />
                )}
                {(isIncoming || isInActive) && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    style={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 14, height: 14, borderRadius: '50%',
                      background: isIncoming ? '#22c55e' : '#ef4444',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid rgba(8,4,0,0.95)',
                    }}
                  >
                    <Phone size={8} color="#fff" fill="currentColor" />
                  </motion.div>
                )}
              </div>
              {/* Name */}
              <span style={{ color: isSelected ? accent : isIncoming ? '#22c55e' : isInActive ? '#ef4444' : textDim, fontSize: '0.52rem', fontWeight: (isSelected || isIncoming || isInActive) ? 700 : 400, maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {label.split(' ')[0]}
              </span>
              {/* Action Buttons if Incoming/Active */}
              {isIncoming ? (
                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  <button onClick={(e) => { e.stopPropagation(); acceptCall(); }} style={{ background: '#22c55e', border: 'none', borderRadius: 4, padding: '2px 4px' }}>
                    <Check size={10} color="#fff" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); useGlobalCall().declineCall(); }} style={{ background: '#ef4444', border: 'none', borderRadius: 4, padding: '2px 4px' }}>
                    <X size={10} color="#fff" />
                  </button>
                </div>
              ) : isInActive ? (
                <button onClick={(e) => { e.stopPropagation(); endCall(); }} style={{ background: '#ef4444', border: 'none', borderRadius: 4, padding: '2px 6px', marginTop: 2 }}>
                  <span style={{ color: '#fff', fontSize: '0.45rem', fontWeight: 800 }}>END</span>
                </button>
              ) : (
                <div style={{ minWidth: 18, height: 14, borderRadius: 7, background: isOnline ? 'rgba(34,197,94,0.15)' : 'transparent', border: isOnline ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  <span style={{ color: isOnline ? '#22c55e' : textDim, fontSize: '0.48rem', fontWeight: 700, lineHeight: 1 }}>
                    {isOnline ? 'ON' : 'OFF'}
                  </span>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
      {selected && (
        <motion.p
          initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
          style={{ color: labelColor, fontSize: '0.55rem', textAlign: 'center', marginTop: 6, opacity: 0.7 }}
        >
          Hold the circle to whisper
        </motion.p>
      )}
    </div>
  );
}
// ── MusicSearchModal — global music search & favorites (iTunes Search API, free 30s previews, no API key) ──
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
}
interface MusicSearchModalProps {
  onClose: () => void;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: MusicTrack) => void;
  favorites: MusicTrack[];
  onToggleFavorite: (track: MusicTrack) => void;
}
function MusicSearchModal({ onClose, currentTrack, isPlaying, onPlayTrack, favorites, onToggleFavorite }: MusicSearchModalProps) {
  const [musicModalTab, setMusicModalTab] = useState<'search' | 'favorites'>('search');
  const [musicModalQuery, setMusicModalQuery] = useState('');
  const [musicModalResults, setMusicModalResults] = useState<MusicTrack[]>([]);
  const [musicModalSearching, setMusicModalSearching] = useState(false);
  const [musicModalError, setMusicModalError] = useState<string | null>(null);
  const musicSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runMusicSearch = useCallback((term: string) => {
    if (!term.trim()) { setMusicModalResults([]); setMusicModalError(null); setMusicModalSearching(false); return; }
    setMusicModalSearching(true);
    setMusicModalError(null);
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`)
      .then((res) => res.json())
      .then((data: { results?: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }> }) => {
        const items: MusicTrack[] = (data.results ?? [])
          .filter((r) => !!r.previewUrl)
          .map((r) => ({
            id: String(r.trackId),
            title: r.trackName,
            artist: r.artistName,
            artwork: r.artworkUrl100 ?? '',
            previewUrl: r.previewUrl as string,
          }));
        setMusicModalResults(items);
      })
      .catch(() => setMusicModalError('تعذر البحث، تحقق من الاتصال بالإنترنت'))
      .finally(() => setMusicModalSearching(false));
  }, []);
  function handleMusicQueryChange(v: string) {
    setMusicModalQuery(v);
    if (musicSearchDebounceRef.current) clearTimeout(musicSearchDebounceRef.current);
    musicSearchDebounceRef.current = setTimeout(() => runMusicSearch(v), 450);
  }
  const isMusicFav = (id: string) => favorites.some((f) => f.id === id);
  const musicList = musicModalTab === 'search' ? musicModalResults : favorites;
  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18,
        overflow: 'hidden',
      }}
    >
      <motion.div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
        style={{
          width: '100%', maxWidth: 380,
          maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12,10,8,0.97)',
          border: '1px solid rgba(0,188,212,0.28)',
          borderRadius: 20,
          boxShadow: '0 12px 50px rgba(0,0,0,0.55), 0 0 30px rgba(0,188,212,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* header + search input */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Music size={16} color="#00BCD4" />
              الموسيقى
            </span>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 999, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={14} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              value={musicModalQuery}
              onChange={(e) => handleMusicQueryChange(e.target.value)}
              placeholder="ابحث عن أغنية أو فنان..."
              style={{
                width: '100%', padding: '9px 36px 9px 12px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '0.78rem', outline: 'none',
              }}
            />
          </div>
        </div>
        {/* tabs: بحث / مفضلة */}
        <div style={{ display: 'flex', padding: '8px 14px 0' }}>
          {(['search', 'favorites'] as const).map((tKey) => (
            <button
              key={tKey}
              onClick={() => setMusicModalTab(tKey)}
              style={{
                flex: 1, padding: '8px 0', textAlign: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: musicModalTab === tKey ? '#00BCD4' : 'rgba(255,255,255,0.4)',
                fontSize: '0.72rem', fontWeight: 700,
                borderBottom: musicModalTab === tKey ? '2px solid #00BCD4' : '2px solid transparent',
              }}
            >
              {tKey === 'search' ? 'بحث' : `المفضلة${favorites.length ? ` (${favorites.length})` : ''}`}
            </button>
          ))}
        </div>
        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 14px' }}>
          {musicModalTab === 'search' && musicModalSearching && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>جاري البحث...</p>
          )}
          {musicModalTab === 'search' && !musicModalSearching && musicModalError && (
            <p style={{ color: 'rgba(239,68,68,0.8)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>{musicModalError}</p>
          )}
          {musicModalTab === 'search' && !musicModalSearching && !musicModalError && musicModalQuery.trim() && musicList.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد نتائج</p>
          )}
          {musicModalTab === 'search' && !musicModalQuery.trim() && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>اكتب اسم أغنية أو فنان للبحث</p>
          )}
          {musicModalTab === 'favorites' && favorites.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد أغاني في المفضلة بعد</p>
          )}
          {musicList.map((track) => {
            const active = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 6px', borderRadius: 12,
                  background: active ? 'rgba(0,188,212,0.1)' : 'transparent',
                  marginBottom: 4,
                }}
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: active ? '#00BCD4' : '#fff', fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.title}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.64rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.artist}
                  </div>
                </div>
                <button
                  onClick={() => onToggleFavorite(track)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                >
                  <Heart size={16} color={isMusicFav(track.id) ? '#ef4444' : 'rgba(255,255,255,0.35)'} fill={isMusicFav(track.id) ? '#ef4444' : 'none'} />
                </button>
                <button
                  onClick={() => onPlayTrack(track)}
                  style={{
                    background: active && isPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(0,188,212,0.3)',
                    borderRadius: 999, width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {active && isPlaying ? <Pause size={13} color="#00BCD4" /> : <Play size={13} color="#00BCD4" style={{ marginRight: -1 }} />}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}



export type ScreenTheme = 'cyan' | 'bronze';

interface RecorderScreenProps {
  theme: ScreenTheme;
  appName: string;
  channelSearch: string;
  centerButtonLabel: string;
  onCenterButtonPress: () => void;
  onSettingsPress?: () => void;
  onUserPress?: () => void;
  onFriendsPress?: () => void;
  onGroupsPress?: () => void;
  onCallPress?: () => void;
  onFeedPress?: () => void;
  pageTitle?: string;
}
const THEMES = {
  cyan: {
    bgGradient: 'radial-gradient(ellipse 70% 60% at 50% 40%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
    glowColor: 'rgba(0,188,212,0.18)',
    appNameColor: 'rgba(0,188,212,0.7)',
    outerRing: 'conic-gradient(from 180deg, #0d2020 0%, #1a3535 25%, #0d2020 50%, #1a3535 75%, #0d2020 100%)',
    outerRingGlow: '0 0 40px rgba(0,188,212,0.5), 0 0 80px rgba(0,188,212,0.2), inset 0 0 20px rgba(0,0,0,0.8)',
    outerRingIdle: '0 0 20px rgba(0,188,212,0.15), inset 0 0 20px rgba(0,0,0,0.8)',
    arcStroke1: 'rgba(0,188,212,0.9)',
    arcStroke2: 'rgba(0,188,212,0.4)',
    rippleColor: 'rgba(0,188,212,0.35)',
    knobBg: 'radial-gradient(circle at 38% 35%, #4a5568 0%, #2d3748 20%, #1a202c 45%, #0d1117 70%, #060a0d 100%)',
    waveStroke: '#00BCD4',
    waveStrokeActive: '#00d4e8',
    waveGlow: 'rgba(0,212,232,0.3)',
    timerColor: '#00BCD4',
    timerIdleColor: 'rgba(0,188,212,0.35)',
    labelColor: 'rgba(200,220,220,0.6)',
    seekFill: 'rgba(0,188,212,0.7)',
    seekEmpty: 'rgba(0,188,212,0.2)',
    seekBorder: 'rgba(0,188,212,0.2)',
    seekBg: 'linear-gradient(90deg, #0d1f1f 0%, #0a1a1a 100%)',
    btnBg: 'radial-gradient(circle at 38% 35%, #2d3748 0%, #1a202c 40%, #0d1117 100%)',
    btnBorder: 'rgba(0,188,212,0.25)',
    btnGlow: 'rgba(0,188,212,0.1)',
    btnArcStroke: 'rgba(0,188,212,0.6)',
    btnLabelColor: 'rgba(0,188,212,0.9)',
    navBg: 'linear-gradient(180deg, transparent 0%, rgba(6,14,14,0.95) 100%)',
    navBorder: 'rgba(0,188,212,0.08)',
    navIconColor: 'rgba(0,188,212,0.6)',
    toastBg: 'rgba(0,188,212,0.15)',
    toastBorder: 'rgba(0,188,212,0.4)',
    toastColor: '#00BCD4',
    savedOverlay: 'rgba(0,188,212,0.1)',
    savedCheckStroke: '#00BCD4',
    chevronColor: 'rgba(0,188,212,0.7)',
    textDim: 'rgba(150,200,200,0.5)',
  },
  bronze: {
    bgGradient: 'radial-gradient(ellipse 70% 60% at 50% 40%, #1a0e00 0%, #120a00 50%, #080400 100%)',
    glowColor: 'rgba(180,100,20,0.22)',
    appNameColor: 'rgba(205,140,50,0.8)',
    outerRing: 'conic-gradient(from 180deg, #1a0e00 0%, #2a1800 25%, #1a0e00 50%, #2a1800 75%, #1a0e00 100%)',
    outerRingGlow: '0 0 40px rgba(200,120,30,0.6), 0 0 80px rgba(180,90,10,0.25), inset 0 0 20px rgba(0,0,0,0.8)',
    outerRingIdle: '0 0 20px rgba(180,100,20,0.2), inset 0 0 20px rgba(0,0,0,0.8)',
    arcStroke1: 'rgba(220,150,40,0.95)',
    arcStroke2: 'rgba(200,130,30,0.45)',
    rippleColor: 'rgba(200,120,30,0.4)',
    knobBg: 'radial-gradient(circle at 35% 30%, #8B6340 0%, #6B4A28 15%, #4a2e10 35%, #2d1a06 60%, #1a0d02 100%)',
    waveStroke: '#CD8C32',
    waveStrokeActive: '#F0A830',
    waveGlow: 'rgba(200,140,40,0.35)',
    timerColor: '#CD8C32',
    timerIdleColor: 'rgba(180,120,30,0.4)',
    labelColor: 'rgba(200,170,120,0.65)',
    seekFill: 'rgba(200,130,30,0.75)',
    seekEmpty: 'rgba(180,100,20,0.2)',
    seekBorder: 'rgba(180,100,20,0.25)',
    seekBg: 'linear-gradient(90deg, #1a0e00 0%, #120a00 100%)',
    btnBg: 'radial-gradient(circle at 38% 35%, #5a3a18 0%, #3a2208 40%, #1a0d02 100%)',
    btnBorder: 'rgba(200,130,30,0.35)',
    btnGlow: 'rgba(180,100,20,0.15)',
    btnArcStroke: 'rgba(200,140,40,0.7)',
    btnLabelColor: 'rgba(220,160,50,0.95)',
    navBg: 'linear-gradient(180deg, transparent 0%, rgba(8,4,0,0.95) 100%)',
    navBorder: 'rgba(180,100,20,0.1)',
    navIconColor: 'rgba(100,160,200,0.65)',
    toastBg: 'rgba(180,100,20,0.15)',
    toastBorder: 'rgba(200,130,30,0.45)',
    toastColor: '#CD8C32',
    savedOverlay: 'rgba(180,100,20,0.12)',
    savedCheckStroke: '#CD8C32',
    chevronColor: 'rgba(200,140,40,0.75)',
    textDim: 'rgba(150,120,70,0.55)',
  },
};
// ── MediaSourcePlayer — true streaming via MediaSource + SourceBuffer ─────────
// WebM/Opus chunks CANNOT be decoded individually with decodeAudioData because
// each chunk is not a standalone file — it needs the initialization segment
// (first chunk) to be present. MediaSource API handles this correctly by
// appending chunks sequentially into a continuous stream.
//
// Additionally exposes an AnalyserNode so the listener can see real waveforms.
class MediaSourcePlayer {
  private mime:       string;
  private queue:      ArrayBuffer[] = [];
  private appending:  boolean = false;
  private sb:         SourceBuffer | null = null;
  private el:         HTMLAudioElement | null = null;
  private ctx:        AudioContext | null = null;
  private analyser:   AnalyserNode | null = null;
  private onLevels:   ((levels: [number, number, number]) => void) | null = null;
  private animId:     number | null = null;
  private destroyed:  boolean = false;
  constructor(
    mime: string,
    onLevels: (levels: [number, number, number]) => void,
  ) {
    this.mime     = mime || 'audio/webm;codecs=opus';
    this.onLevels = onLevels;
    this._init();
  }
  private _init() {
    // Prefer MediaSource when supported (Chrome/Android)
    const mimeForMS = this.mime.startsWith('audio/webm') ? this.mime : 'audio/webm;codecs=opus';
    if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeForMS)) {
      this._initMediaSource(mimeForMS);
    } else {
      // Safari / iOS fallback: collect all chunks and play as blob
      this._initBlobFallback();
    }
  }
  private _initMediaSource(mimeForMS: string) {
    const ms  = new MediaSource();
    const el  = new Audio();
    this.el   = el;
    el.setAttribute('playsinline', '');
    el.src = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', () => {
      if (this.destroyed) return;
      try {
        const sb = ms.addSourceBuffer(mimeForMS);
        this.sb  = sb;
        sb.mode  = 'sequence'; // gapless append
        sb.addEventListener('updateend', () => {
          this.appending = false;
          this._flush();
        });
        this._flush();
      } catch { /* mime not supported — fall through */ }
    }, { once: true });
    el.addEventListener('canplay', () => {
      if (this.destroyed) return;
      el.play().catch(() => {});
      this._attachAnalyser();
    }, { once: true });
  }
  private _initBlobFallback() {
    // Collect chunks; play when we have enough (~500ms worth)
    // This is a best-effort path for Safari
    this._blobMode = true;
  }
  private _blobMode = false;
  private _blobChunks: ArrayBuffer[] = [];
  private _flush() {
    if (this.destroyed || this.appending || !this.sb) return;
    if (this.sb.updating) return;
    const chunk = this.queue.shift();
    if (!chunk) return;
    try {
      this.appending = true;
      this.sb.appendBuffer(chunk);
    } catch {
      this.appending = false;
    }
  }
  private _attachAnalyser() {
    if (!this.el || this.ctx || this.destroyed) return;
    try {
      const ctx      = new AudioContext();
      this.ctx       = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      this.analyser  = analyser;
      const src      = ctx.createMediaElementSource(this.el);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      this._animateWave();
    } catch { /* analyser optional */ }
  }
  private _animateWave() {
    if (!this.analyser || this.destroyed) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (this.destroyed || !this.analyser) return;
      this.animId = requestAnimationFrame(tick);
      this.analyser.getByteFrequencyData(data);
      const avg = (s: number, e: number) => {
        let sum = 0;
        for (let i = s; i < e; i++) sum += data[i];
        return Math.min(1, (sum / ((e - s) * 255)) * 3.5);
      };
      const bins = this.analyser.frequencyBinCount;
      const levels: [number, number, number] = [
        avg(0, Math.floor(bins * 0.25)),
        avg(Math.floor(bins * 0.25), Math.floor(bins * 0.6)),
        avg(Math.floor(bins * 0.6), bins),
      ];
      this.onLevels?.(levels);
    };
    tick();
  }
  enqueue(chunk: ArrayBuffer): void {
    if (this.destroyed) return;
    if (this._blobMode) {
      // Safari blob fallback
      this._blobChunks.push(chunk);
      if (this._blobChunks.length >= 3) {
        const blob = new Blob(this._blobChunks, { type: this.mime });
        this._blobChunks = [];
        const url  = URL.createObjectURL(blob);
        const el   = new Audio(url);
        el.setAttribute('playsinline', '');
        el.play().catch(() => {});
        el.onended = () => URL.revokeObjectURL(url);
      }
      return;
    }
    this.queue.push(chunk);
    this._flush();
  }
  destroy() {
    this.destroyed = true;
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    this.onLevels  = null;
    try { this.el?.pause(); } catch { /* ignore */ }
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.sb = null; this.el = null; this.ctx = null; this.analyser = null;  }
}
// ─── PIN Popup — rendered as a fixed portal to escape overflow:hidden ─────────
// Measures the lock button's screen position via getBoundingClientRect and
// positions itself directly below it using fixed coordinates.
interface PinPopupProps {
  secretError: boolean;
  secretInput: string;
  setSecretInput: (v: string) => void;
  setSecretError: (v: boolean) => void;
  setShowPinPopup: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleSecretSubmit: () => void;
  pinInputRef: RefObject<HTMLInputElement | null>;
  anchorRef: RefObject<HTMLButtonElement | null>;
}
function PinPopup({
  secretError, secretInput, setSecretInput, setSecretError,
  setShowPinPopup, handleSecretSubmit, pinInputRef, anchorRef,
}: PinPopupProps) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    function measure() {
      const btn = anchorRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setPos({
        top:   r.bottom + 10,
        right: window.innerWidth - r.right,
      });
    }
    measure();
    // Small delay so the button rect is settled after render
    const t = setTimeout(measure, 30);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchorRef]);
  // Fade in after position is known, then focus input
  useEffect(() => {
    if (!pos) return;
    const t1 = setTimeout(() => setVisible(true), 20);
    const t2 = setTimeout(() => {
      const inp = pinInputRef.current;
      if (inp) {
        inp.focus();
        // On iOS, focus alone may not open the keyboard — click() helps
        inp.click();
      }
    }, 80);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pos, pinInputRef]);
  if (!pos) return null;
  return (
    // Plain <div> — no motion wrapper so nothing interferes with pointer events
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        right: pos.right,
        zIndex: 99999,
        // Fade-in via opacity transition
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(-6px)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        background: 'rgba(4,14,14,0.97)',
        border: `1.5px solid ${secretError ? 'rgba(239,68,68,0.55)' : 'rgba(0,188,212,0.35)'}`,
        borderRadius: 16,
        padding: '12px 12px 10px 12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,188,212,0.08)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        width: 220,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        // Critical: ensure all pointer events work inside the portal
        pointerEvents: 'auto',
        touchAction: 'auto',
        // Override any inherited select-none
        userSelect: 'text',
        WebkitUserSelect: 'text',
      }}
    >
      {/* Arrow pointer */}
      <div style={{
        position: 'absolute', top: -7, right: 14,
        width: 13, height: 13,
        background: 'rgba(4,14,14,0.97)',
        border: `1.5px solid ${secretError ? 'rgba(239,68,68,0.55)' : 'rgba(0,188,212,0.35)'}`,
        borderBottom: 'none', borderRight: 'none',
        transform: 'rotate(45deg)',
      }} />
      {/* Label */}
      <p style={{
        margin: 0, fontSize: '0.6rem', fontWeight: 700,
        color: 'rgba(0,188,212,0.6)', letterSpacing: '0.14em',
        textTransform: 'uppercase', paddingLeft: 2,
      }}>
        Secret Room
      </p>
      {/* Input + OK row */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center',
        background: secretError ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.45)',
        border: `1.5px solid ${secretError ? 'rgba(239,68,68,0.5)' : 'rgba(0,188,212,0.22)'}`,
        borderRadius: 12,
        padding: '6px 6px 6px 12px',
        transition: 'border-color 0.2s, background 0.2s',
      }}>
        <input
          ref={pinInputRef}
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="Enter PIN"
          value={secretInput}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={e => { setSecretInput(e.target.value); setSecretError(false); }}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); handleSecretSubmit(); }
            if (e.key === 'Escape') { setShowPinPopup(false); setSecretInput(''); setSecretError(false); }
          }}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: secretError ? 'rgba(239,68,68,0.9)' : 'rgba(0,188,212,0.95)',
            fontSize: '1rem',
            fontWeight: 600,
            letterSpacing: '0.2em',
            minWidth: 0,
            // Fully interactive — override any inherited restrictions
            pointerEvents: 'auto',
            touchAction: 'auto',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            WebkitTapHighlightColor: 'transparent',
          }}
        />
        <button
          type="button"
          onClick={e => { e.stopPropagation(); handleSecretSubmit(); }}
          style={{
            background: secretError ? 'rgba(239,68,68,0.18)' : 'rgba(0,188,212,0.16)',
            border: `1.5px solid ${secretError ? 'rgba(239,68,68,0.45)' : 'rgba(0,188,212,0.35)'}`,
            borderRadius: 10,
            padding: '5px 14px',
            color: secretError ? '#ef4444' : '#00BCD4',
            fontSize: '0.72rem',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            pointerEvents: 'auto',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
          }}
        >
          OK
        </button>
      </div>
      {/* Error message */}
      {secretError && (
        <p style={{
          margin: 0, color: '#ef4444',
          fontSize: '0.62rem', fontWeight: 700,
          letterSpacing: '0.04em', paddingLeft: 2,
        }}>
          ❌ Incorrect PIN
        </p>
      )}
    </div>
  );
}
// ─── Call Swipe-Up Sheet — opens on swipe-up over the Call nav button ────────
// Quarter-screen sheet with a 3s circular countdown, then triggers onCallPress
// (the user-selection screen for placing a call).
interface CallSwipeSheetProps {
  progress: number; // 0 → 1
  onCancel: () => void;
  labelColor: string;
}
function CallSwipeSheet({ progress, onCancel, labelColor }: CallSwipeSheetProps) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const secondsLeft = Math.max(0, Math.ceil(3 - progress * 3));
  return (
    <motion.div
      key="call-swipe-sheet"
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={(_, info) => { if (info.offset.y > 40) onCancel(); }}
      style={{
        position: 'fixed', left: '50%', x: '-50%', bottom: 0,
        width: '92%', maxWidth: 420,
        height: '25vh', zIndex: 10000,
        background: 'linear-gradient(180deg, rgba(6,14,14,0.98) 0%, rgba(2,6,6,0.99) 100%)',
        borderTop: '1.5px solid rgba(0,188,212,0.35)',
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10,
        touchAction: 'none',
      }}
    >
      {/* Drag handle */}
      <div style={{ position: 'absolute', top: 10, width: 40, height: 4, borderRadius: 3, background: 'rgba(0,188,212,0.35)' }} />
      {/* Cancel button */}
      <button
        onClick={onCancel}
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <X size={13} color="rgba(255,255,255,0.6)" />
      </button>
      {/* Circular countdown */}
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(0,188,212,0.15)" strokeWidth="5" />
          <circle
            cx="40" cy="40" r={R} fill="none"
            stroke="#00BCD4" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset 0.03s linear' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', fontWeight: 800, color: '#00BCD4',
        }}>
          {secondsLeft}
        </div>
      </div>
      <p style={{ color: labelColor, fontSize: '0.72rem', letterSpacing: '0.04em', textAlign: 'center' }}>
        جاري فتح شاشة الاتصال...
      </p>
    </motion.div>
  );
}
export default function RecorderScreen({
  theme,
  appName,
  onSettingsPress,
  onUserPress,
  onFriendsPress,
  onGroupsPress,
  onCallPress,
  onFeedPress,
  pageTitle,
}: Omit<RecorderScreenProps, 'channelSearch' | 'centerButtonLabel' | 'onCenterButtonPress'>) {
  void onFeedPress;
  const t = THEMES[theme];
  const recMode = theme === 'bronze' ? 'whisper' : 'public';
  const isWhisper = recMode === 'whisper';
  const { toast, glowPulse } = { toast: null as string | null, glowPulse: false }; // placeholder — recorder removed
  const audioCtxRef = useRef<AudioContext | null>(null);
  function getAudioCtx() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    return audioCtxRef.current;
  }
  void getAudioCtx; // kept for PTT whisper calls
  // Auth + presence
  const { user } = useSession();
  useHeartbeat(!!user);
  const { activeCall: navActiveCall, incomingCaller: navIncomingCaller } = useGlobalCall();
  const hasActiveCall = !!navActiveCall || !!navIncomingCaller;
  void hasActiveCall;
  const [allFriends, setAllFriends] = useState<OnlineFriend[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [selectedWhisperFriend, setSelectedWhisperFriend] = useState<OnlineFriend | null>(null);
  // Status state
  const [statusGroups,     setStatusGroups]     = useState<StatusGroup[]>([]);
  const [statusMyId,       setStatusMyId]       = useState('');
  const [viewerGroupIdx,   setViewerGroupIdx]   = useState<number | null>(null);
  const [highlightedIds,   setHighlightedIds]   = useState<Set<string>>(new Set());
  const [postUserIds,      _setPostUserIds]      = useState<Set<string>>(new Set());
  const [postFilterUserId,  setPostFilterUserId]  = useState<string | null>(null);
  const newPostFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (newPostFlashTimer.current) clearTimeout(newPostFlashTimer.current); }, []);
  // Load statuses (friends + mine) — declared before camera callbacks so publishing can safely refresh.
  const loadStatuses = useCallback(async () => {
    try {
      const r = await fetch('/api/status', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setStatusGroups(d.statuses ?? []);
      setStatusMyId(d.myId ?? '');
    } catch { /* silent */ }
  }, []);
  // ── Home camera capture ───────────────────────────────────────────────────
  const [cameraOpen, setCameraOpen] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState<string | null>(null);
  const [cameraPreviewType, setCameraPreviewType] = useState<'photo' | 'video' | null>(null);
  const [cameraMediaFile, setCameraMediaFile] = useState<File | null>(null);
  const [cameraMediaFiles, setCameraMediaFiles] = useState<File[]>([]);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraRecordingSeconds, setCameraRecordingSeconds] = useState(0);
  const [cameraPublishing, setCameraPublishing] = useState(false);
  const [cameraPublishError, setCameraPublishError] = useState('');
  const [cameraFlashOn, setCameraFlashOn] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const cameraTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraDidRecordRef = useRef(false);
  const formatCameraTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const stopHomeCamera = useCallback(() => {
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    setCameraRecording(false);
    cameraRecorderRef.current = null;
    if (cameraTimerRef.current) {
      clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
  }, [cameraStream]);
  const closeHomeCamera = useCallback(() => {
    stopHomeCamera();
    if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
    setCameraPreviewUrl(null);
    setCameraPreviewType(null);
    setCameraMediaFile(null);
    setCameraMediaFiles([]);
    setCameraRecordingSeconds(0);
    setCameraOpen(false);
    setCameraPublishing(false);
  }, [cameraPreviewUrl, stopHomeCamera]);
  const openHomeCamera = useCallback(() => {
    // Trigger the native picker directly from the user's tap. This is required
    // by mobile browsers, which block file dialogs opened through delayed focus.
    const input = cameraGalleryInputRef.current;
    if (input) {
      input.value = '';
      input.click();
      return;
    }
    setGalleryPickerOpen(true);
  }, []);

  useEffect(() => {
    const handleOpenHomeGallery = () => { void openHomeCamera(); };
    window.addEventListener('stooorna:open-home-gallery', handleOpenHomeGallery);
    return () => window.removeEventListener('stooorna:open-home-gallery', handleOpenHomeGallery);
  }, [openHomeCamera]);

  const switchHomeCamera = useCallback(async () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    // Switching cameras must always return to a clean live-camera view.
    // Clear any selected gallery/captured media first so no stale video poster
    // or native play overlay remains inside the camera frame.
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
    setCameraPreviewUrl(null);
    setCameraPreviewType(null);
    setCameraMediaFile(null);
    setCameraMediaFiles([]);
    setCameraRecordingSeconds(0);
    setCameraRecording(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: true,
      });
      setCameraFacing(nextFacing);
      setCameraStream(stream);
      setCameraOpen(true);
    } catch {
      // Keep the current camera state if the second camera is unavailable.
    }
  }, [cameraFacing, cameraStream, cameraPreviewUrl]);
  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video || !cameraStream) return;
    video.srcObject = cameraStream;
    video.play().catch(() => {});
  }, [cameraStream, cameraOpen]);
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(track => track.stop());
      if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
      if (cameraTimerRef.current) clearInterval(cameraTimerRef.current);
    };
  }, [cameraStream, cameraPreviewUrl]);
  const captureHomePhoto = useCallback(() => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
      const file = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setCameraMediaFile(file);
      setCameraPreviewUrl(URL.createObjectURL(blob));
      setCameraPreviewType('photo');
      stopHomeCamera();
    }, 'image/jpeg', 0.92);
  }, [cameraPreviewUrl, stopHomeCamera]);
  const startHomeVideo = useCallback(() => {
    if (!cameraStream || cameraRecording) return;
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const recorder = new MediaRecorder(cameraStream, { mimeType: mime });
    cameraChunksRef.current = [];
    recorder.ondataavailable = e => {
      if (e.data.size > 0) cameraChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(cameraChunksRef.current, { type: mime });
      if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
      const file = new File([blob], `story-${Date.now()}.webm`, { type: mime });
      setCameraMediaFile(file);
      setCameraPreviewUrl(URL.createObjectURL(blob));
      setCameraPreviewType('video');
      setCameraRecordingSeconds(prev => prev);
      stopHomeCamera();
    };
    cameraRecorderRef.current = recorder;
    recorder.start();
    setCameraRecording(true);
    setCameraRecordingSeconds(0);
    if (cameraTimerRef.current) clearInterval(cameraTimerRef.current);
    cameraTimerRef.current = setInterval(() => setCameraRecordingSeconds(s => s + 1), 1000);
  }, [cameraStream, cameraRecording, cameraPreviewUrl, stopHomeCamera]);
  const stopHomeVideo = useCallback(() => {
    if (cameraTimerRef.current) {
      clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
      cameraRecorderRef.current.stop();
    }
    setCameraRecording(false);
  }, []);
  const toggleHomeFlash = useCallback(async () => {
    const track = cameraStream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !cameraFlashOn;
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setCameraFlashOn(next);
    } catch { /* torch unsupported (e.g. front camera / desktop) */ }
  }, [cameraStream, cameraFlashOn]);
  // نقرة سريعة = صورة، ضغط مطوّل = تسجيل فيديو (نفس سلوك كاميرا الشات)
  const handleCaptureStart = useCallback(() => {
    cameraDidRecordRef.current = false;
    cameraHoldTimeoutRef.current = setTimeout(() => {
      cameraDidRecordRef.current = true;
      startHomeVideo();
    }, 220);
  }, [startHomeVideo]);
  const handleCaptureEnd = useCallback(() => {
    if (cameraHoldTimeoutRef.current) {
      clearTimeout(cameraHoldTimeoutRef.current);
      cameraHoldTimeoutRef.current = null;
    }
    if (cameraDidRecordRef.current) {
      stopHomeVideo();
    } else {
      captureHomePhoto();
    }
  }, [stopHomeVideo, captureHomePhoto]);
  const handleHomeGalleryPick = useCallback((files: FileList | File[] | undefined) => {
    setGalleryPickerOpen(false);
    const selectedFiles = Array.from(files ?? []).filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (selectedFiles.length === 0) return;
    stopHomeCamera();
    if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
    const firstFile = selectedFiles[0];
    setCameraMediaFiles(selectedFiles);
    setCameraMediaFile(firstFile);
    setCameraPreviewUrl(URL.createObjectURL(firstFile));
    setCameraPreviewType(firstFile.type.startsWith('video/') ? 'video' : 'photo');
    setCameraOpen(true);
  }, [cameraPreviewUrl, stopHomeCamera]);
  const retakeHomeMedia = useCallback(async () => {
    if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
    setCameraPreviewUrl(null);
    setCameraPreviewType(null);
    setCameraMediaFile(null);
    setCameraMediaFiles([]);
    setCameraRecordingSeconds(0);
    setCameraOpen(false);
    await openHomeCamera();
  }, [cameraPreviewUrl, openHomeCamera]);
  /**
   * إصلاح: publishHomeStory كانت تكتفي بإطلاق CustomEvent('stooorna:publish-home-post')
   * بدون أي مستمع (listener) يرفع الملف فعليًا — فتُقفل الكاميرا وكأن النشر تم، بينما
   * لا شيء يُرفع للسيرفر ولا تظهر الصورة/الفيديو أبدًا. الآن الدالة ترفع كل ملف
   * وتنشئ المنشور مباشرة (نفس مسار quickPublishMedia الناجح)، ثم تحدّث الحالة محليًا.
   */
  const publishHomeStory = useCallback(async () => {
    const filesToPublish = cameraMediaFiles.length > 0
      ? cameraMediaFiles
      : (cameraMediaFile ? [cameraMediaFile] : []);
    if (filesToPublish.length === 0 || cameraPublishing) return;
    setCameraPublishing(true);
    setCameraPublishError('');
    let successCount = 0;
    try {
      for (const file of filesToPublish) {
        const mediaType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
        try {
          // 1) رفع الملف
          let uploadRes: Response | null = null;
          try {
            const fd = new FormData();
            fd.append('file', file, file.name || `story.${mediaType === 'video' ? 'webm' : 'jpg'}`);
            fd.append('type', mediaType);
            fd.append('mediaType', mediaType);
            uploadRes = await fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
          } catch { /* جرّب البديل تحت */ }
          if (!uploadRes || !uploadRes.ok) {
            uploadRes = await fetch('/api/posts/media', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': file.type || (mediaType === 'video' ? 'video/webm' : 'image/jpeg'),
                'X-File-Ext': `.${(file.name.split('.').pop() || (mediaType === 'video' ? 'webm' : 'jpg'))}`,
                'X-Media-Type': mediaType,
              },
              body: file,
            });
          }
          if (!uploadRes.ok) throw new Error(`upload failed (${uploadRes.status})`);
          const uploadData = await uploadRes.json().catch(() => null) as { url?: string; mediaUrl?: string; path?: string; fileUrl?: string } | null;
          const url = uploadData?.url || uploadData?.mediaUrl || uploadData?.fileUrl || uploadData?.path;
          if (!url) throw new Error('upload returned no url');

          // 2) إنشاء المنشور نفسه — نفس صيغة quickPublishMedia الناجحة
          const createRes = await fetch('/api/posts', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: '',
              mediaUrl: url,
              mediaType,
              mediaUrls: [url],
              mediaTypes: [mediaType],
              hashtags: [],
              audience: 'public',
              destination: mediaType === 'video' ? 'videos' : 'photos',
            }),
          });
          if (!createRes.ok) throw new Error(`create failed (${createRes.status})`);
          const createData = await createRes.json().catch(() => null) as { post?: { id?: number } } | null;
          if (!createData?.post?.id) throw new Error('post not saved');
          successCount++;

          // نبقي الحدث القديم لأي مستمع آخر قد يعتمد عليه بمكان ثاني بالتطبيق
          window.dispatchEvent(new CustomEvent('stooorna:publish-home-post', {
            detail: { file, mediaType, url, post: createData.post },
          }));
        } catch (fileErr) {
          console.error('[HomeCamera] upload/publish failed for one file:', fileErr);
        }
      }

      if (successCount === 0) {
        setCameraPublishError('تعذر نشر الصورة/الفيديو — حاول مرة ثانية');
        return;
      }

      window.dispatchEvent(new CustomEvent('stooorna:refresh-text-feed'));
      void loadStatuses();
      closeHomeCamera();
    } catch (error) {
      console.error('[HomeCamera] Public post publish failed:', error);
      setCameraPublishError('تعذر نشر الصورة/الفيديو — حاول مرة ثانية');
    } finally {
      setCameraPublishing(false);
    }
  }, [cameraMediaFile, cameraMediaFiles, cameraPublishing, closeHomeCamera, loadStatuses]);

  // Owner check — used for blue highlight across all sections
  const OWNER_USERNAME = 'Q8';
  const OWNER_EMAIL    = 'alsoor@mail.com';
  const isCurrentUserOwner =
    (user as any)?.username === OWNER_USERNAME ||
    user?.email === OWNER_EMAIL;
  // ── Call swipe-up sheet ──────────────────────────────────────────────────
  // Swiping up on the bottom-nav "Call" button opens a quarter-screen sheet
  // with a 3s circular countdown; when it completes, onCallPress() fires,
  // taking the user to the call/user-selection screen.
  const [callSheetOpen, setCallSheetOpen] = useState(false);
  const [callSheetProgress, setCallSheetProgress] = useState(0); // 0 → 1
  const callCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callCountdownStartRef = useRef<number>(0);
  const callHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (callHintTimerRef.current) clearTimeout(callHintTimerRef.current); };
  }, []);
  const openCallSheet = () => {
    setCallSheetOpen(true);
    setCallSheetProgress(0);
    callCountdownStartRef.current = Date.now();
    if (callCountdownTimerRef.current) clearInterval(callCountdownTimerRef.current);
    callCountdownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - callCountdownStartRef.current;
      const progress = Math.min(1, elapsed / 3000);
      setCallSheetProgress(progress);
      if (progress >= 1) {
        if (callCountdownTimerRef.current) { clearInterval(callCountdownTimerRef.current); callCountdownTimerRef.current = null; }
        setCallSheetOpen(false);
        onCallPress?.();
      }
    }, 30);
  };
  void openCallSheet;
  function closeCallSheet() {
    if (callCountdownTimerRef.current) { clearInterval(callCountdownTimerRef.current); callCountdownTimerRef.current = null; }
    setCallSheetOpen(false);
    setCallSheetProgress(0);
  }
  useEffect(() => {
    return () => { if (callCountdownTimerRef.current) clearInterval(callCountdownTimerRef.current); };
  }, []);
  // ── Global secret-room live status (visible to ALL users) ──────────────
  // Polled every 3s — shows LIVE banner even to users outside the secret room
  const [globalLiveSpeakers, setGlobalLiveSpeakers] = useState<{ userId: string; name: string }[]>([]);
  const globalLivePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const r = await fetch('/api/secret-room/live-status');
        if (!r.ok) return;
        const d = await r.json() as { live: boolean; speakers: { userId: string; name: string }[] };
        setGlobalLiveSpeakers(d.live ? d.speakers : []);
      } catch { /* silent */ }
    };
    poll();
    globalLivePollRef.current = setInterval(poll, 3000);
    return () => { if (globalLivePollRef.current) clearInterval(globalLivePollRef.current); };
  }, [user]);
  // ── Live Mic (secret-gated PTT) ──────────────────────────────────────────
  const [secretInput,    setSecretInput]    = useState('');
  const [showPinPopup,   setShowPinPopup]   = useState(false);
  const pinInputRef  = useRef<HTMLInputElement | null>(null);
  const lockBtnRef   = useRef<HTMLButtonElement | null>(null);
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const [secretError,    setSecretError]    = useState(false);
  const [_secretJoined,  setSecretJoined]   = useState(false); // tracks WS join state
  const [liveMicActive,  setLiveMicActive]  = useState(false);
  const liveMicActiveRef = useRef(false); // ref to avoid stale closure in MediaSourcePlayer callbacks
  // who is currently speaking in the secret room (userId -> name)
  const [liveSpeakers,   setLiveSpeakers]   = useState<Map<string, string>>(new Map());
  const liveAudioCtxRef  = useRef<AudioContext | null>(null);
  const liveGainRef      = useRef<GainNode | null>(null);
  const livePlayersRef   = useRef<Map<string, MediaSourcePlayer>>(new Map());
  // ── Secret room: join count + join banner ───────────────────────────────
  const [_roomJoinCount, setRoomJoinCount] = useState<number>(0);
  const [_joinBanner,    setJoinBanner]    = useState<{ name: string; visible: boolean } | null>(null);
  const joinBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Secret room: live members list (currently connected) ────────────────
  const [roomMembers,      setRoomMembers]      = useState<{ userId: string; name: string; username: string }[]>([]);
  const [showMembersList,  setShowMembersList]  = useState(false);
  const membersListRef = useRef<HTMLDivElement | null>(null);
  // fetch live members from server
  async function fetchRoomMembers() {
    try {
      const r = await fetch('/api/secret-room/members', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setRoomMembers(d.members ?? []); }
    } catch { /* silent */ }
  }
  // poll members every 3s when secret room is unlocked
  const membersPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!secretUnlocked) {
      if (membersPollRef.current) { clearInterval(membersPollRef.current); membersPollRef.current = null; }
      setRoomMembers([]);
      setShowMembersList(false);
      return;
    }
    fetchRoomMembers();
    membersPollRef.current = setInterval(fetchRoomMembers, 3000);
    return () => { if (membersPollRef.current) clearInterval(membersPollRef.current); };
  }, [secretUnlocked]);
  // close members list when clicking outside
  useEffect(() => {
    if (!showMembersList) return;
    function handleOutside(e: MouseEvent) {
      if (membersListRef.current && !membersListRef.current.contains(e.target as Node)) {
        setShowMembersList(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showMembersList]);
  // fetch total join count from DB
  async function fetchRoomJoinCount() {
    try {
      const r = await fetch('/api/owner/secret-room-joins/count', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setRoomJoinCount(d.count ?? 0); }
    } catch { /* silent */ }
  }
  // log join + show banner + refresh real count from DB
  async function logSecretRoomJoin(userName: string) {
    try {
      await fetch('/api/owner/secret-room-joins', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* silent */ }
    // fetch real count after insert
    fetchRoomJoinCount();
    // show banner
    if (joinBannerTimer.current) clearTimeout(joinBannerTimer.current);
    setJoinBanner({ name: userName, visible: true });
    joinBannerTimer.current = setTimeout(() => setJoinBanner(null), 5000);
  }
  const [liveMicLevels,  setLiveMicLevels]  = useState([0.15, 0.15, 0.15]);
  const [micCountdown,   setMicCountdown]   = useState(30);
  const micTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveMicRef       = useRef<MediaRecorder | null>(null);
  const liveAnalyserRef  = useRef<AnalyserNode | null>(null);
  const liveAnimRef      = useRef<number | null>(null);
  const liveStreamRef    = useRef<MediaStream | null>(null);
  // ── Agora RTC refs for secret room LIVE mic (replaces MediaRecorder+WS binary) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretAgoraClientRef   = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretAgoraMicTrackRef = useRef<any>(null);
  const secretAgoraWaveCtxRef  = useRef<AudioContext | null>(null);
  // ── Secret room: hold-to-record voice note ──────────────────────────────
  const [holdRecording,     setHoldRecording]     = useState(false);
  const [holdDuration,      setHoldDuration]      = useState(0);
  const [micLockState,      setMicLockState]      = useState<{ locked: boolean; lockedBy?: string; lockedName?: string }>({ locked: false });
  // ── Floating voice note notification (self-destructing) ──────────────────
  type FloatingVoiceNote = {
    id: string;
    senderName: string;
    isSelf: boolean;
    duration: number;
    levels: number[];   // live waveform levels during playback
    playing: boolean;
  };
  const [floatingNote, setFloatingNote] = useState<FloatingVoiceNote | null>(null);
  const floatingNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Global music player (search + favorites, persists across modal/navigation) ──
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  const [musicCurrentTrack, setMusicCurrentTrack] = useState<MusicTrack | null>(null);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const [musicFavorites, setMusicFavorites] = useState<MusicTrack[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('stooorna_music_favorites');
      return raw ? (JSON.parse(raw) as MusicTrack[]) : [];
    } catch { return []; }
  });
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const handleMusicPlayTrack = useCallback((track: MusicTrack) => {
    const audioEl = musicAudioRef.current;
    if (!audioEl) return;
    if (musicCurrentTrack?.id === track.id) {
      // toggle play/pause on the same track
      if (audioEl.paused) { void audioEl.play(); setMusicIsPlaying(true); }
      else { audioEl.pause(); setMusicIsPlaying(false); }
      return;
    }
    setMusicCurrentTrack(track);
    audioEl.src = track.previewUrl;
    void audioEl.play();
    setMusicIsPlaying(true);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          artwork: track.artwork ? [{ src: track.artwork, sizes: '100x100', type: 'image/jpeg' }] : [],
        });
      } catch { /* mediaSession optional */ }
    }
  }, [musicCurrentTrack]);
  const handleMusicToggleFavorite = useCallback((track: MusicTrack) => {
    setMusicFavorites((prev) => {
      const exists = prev.some((f) => f.id === track.id);
      const next = exists ? prev.filter((f) => f.id !== track.id) : [track, ...prev];
      try { window.localStorage.setItem('stooorna_music_favorites', JSON.stringify(next)); } catch { /* storage optional */ }
      return next;
    });
  }, []);
  const handleMusicStop = useCallback(() => {
    const audioEl = musicAudioRef.current;
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; audioEl.src = ''; }
    setMusicIsPlaying(false);
    setMusicCurrentTrack(null);
  }, []);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => { void musicAudioRef.current?.play(); setMusicIsPlaying(true); });
      navigator.mediaSession.setActionHandler('pause', () => { musicAudioRef.current?.pause(); setMusicIsPlaying(false); });
      navigator.mediaSession.setActionHandler('stop', () => handleMusicStop());
    } catch { /* mediaSession optional */ }
  }, [handleMusicStop]);
  const floatingWaveAnimRef  = useRef<number | null>(null);
  const floatingAnalyserRef  = useRef<AnalyserNode | null>(null);
  const holdRecRef          = useRef<MediaRecorder | null>(null);
  const holdAnalyserRef     = useRef<AnalyserNode | null>(null);
  const holdAnimRef         = useRef<number | null>(null);
  const holdAudioCtxRef     = useRef<AudioContext | null>(null);
  const holdChunksRef       = useRef<Blob[]>([]);
  const holdTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef        = useRef<number>(0);
  const micLockPollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  // Poll mic lock state every 2s when secret room is unlocked
  useEffect(() => {
    if (!secretUnlocked) { if (micLockPollRef.current) { clearInterval(micLockPollRef.current); micLockPollRef.current = null; } return; }
    async function pollLock() {
      try {
        const r = await fetch('/api/secret-room/mic-lock', { credentials: 'include' });
        if (r.ok) { const d = await r.json(); setMicLockState(d); }
      } catch { /* silent */ }
    }
    pollLock();
    micLockPollRef.current = setInterval(pollLock, 2000);
    return () => { if (micLockPollRef.current) clearInterval(micLockPollRef.current); };
  }, [secretUnlocked]);
  // ── Auto-connect WS to secret-live room when unlocked ───────────────────
  // Independent of live mic — ensures voice notes are always broadcast/received
  const secretWsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!secretUnlocked || !user?.id) {
      // Disconnect if locked again
      if (secretWsRef.current) {
        try { secretWsRef.current.close(); } catch { /* ignore */ }
        secretWsRef.current = null;
      }
      return;
    }
    // Already connected
    if (secretWsRef.current && secretWsRef.current.readyState === WebSocket.OPEN) return;
    const uid   = user.id;
    const uname = user.name ?? user.email ?? 'User';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${location.host}/ws/room-live?room=secret-live&userId=${encodeURIComponent(uid)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    secretWsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', userId: uid, name: uname, mime: 'audio/webm;codecs=opus' }));
    };
    ws.onmessage = (ev) => {
      // ── Binary: live audio chunks from a speaker ──────────────────────────
      if (typeof ev.data !== 'string') {
        try {
          const buf  = ev.data as ArrayBuffer;
          const view = new DataView(buf);
          const mLen = view.getUint32(0, true);
          const uLen = view.getUint32(4, true);
          const peerMimeStr = new TextDecoder().decode(new Uint8Array(buf, 8, mLen));
          const peerUserId  = new TextDecoder().decode(new Uint8Array(buf, 8 + mLen, uLen));
          const audioStart  = 8 + mLen + uLen;
          const audioData   = buf.slice(audioStart);
          // Ensure we have an AudioContext for playback
          if (!liveAudioCtxRef.current) {
            const ctx  = new AudioContext();
            const gain = ctx.createGain();
            gain.gain.value = 1;
            gain.connect(ctx.destination);
            // Force loudspeaker on mobile (not earpiece)
            const ctxAny = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
            if (typeof ctxAny.setSinkId === 'function') ctxAny.setSinkId('speaker').catch(() => {});
            liveAudioCtxRef.current = ctx;
            liveGainRef.current     = gain;
          } else if (liveAudioCtxRef.current.state === 'suspended') {
            liveAudioCtxRef.current.resume().catch(() => {});
          }
          let player = livePlayersRef.current.get(peerUserId);
          if (!player) {
            player = new MediaSourcePlayer(
              peerMimeStr || 'audio/webm;codecs=opus',
              (levels) => {
                // Use ref to avoid stale closure — only update waveform if not speaking
                if (!liveMicActiveRef.current) setLiveMicLevels(levels);
              },
            );
            livePlayersRef.current.set(peerUserId, player);
          }
          player.enqueue(audioData);
        } catch { /* decode errors normal */ }
        return;
      }
      try {
        const msg = JSON.parse(ev.data) as {
          type: string; userId?: string; name?: string;
          mime?: string; duration?: number; audio?: string;
          levels?: number[]; message?: string;
        };
        if (msg.type === 'error' && msg.message === 'not_allowed') {
          ws.close(); secretWsRef.current = null; return;
        }
        // ── voice_note: show floating notification + autoplay ──
        if (msg.type === 'voice_note' && msg.userId && msg.userId !== uid && msg.audio) {
          try {
            const binary = atob(msg.audio);
            const bytes  = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob   = new Blob([bytes], { type: msg.mime ?? 'audio/webm;codecs=opus' });
            const url    = URL.createObjectURL(blob);
            const a      = new Audio(url);
            (a as any).setSinkId?.('default').catch(() => {});
            const senderName = msg.name ?? 'Someone';
            const dur        = msg.duration ?? 0;
            const fnId       = `vn-${Date.now()}`;
            if (floatingNoteTimerRef.current) clearTimeout(floatingNoteTimerRef.current);
            if (floatingWaveAnimRef.current)  cancelAnimationFrame(floatingWaveAnimRef.current);
            setFloatingNote({ id: fnId, senderName, isSelf: false, duration: dur, levels: [0.3, 0.5, 0.3, 0.5, 0.3], playing: true });
            try {
              const ctx      = new AudioContext();
              const src      = ctx.createMediaElementSource(a);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 64;
              src.connect(analyser);
              src.connect(ctx.destination);
              floatingAnalyserRef.current = analyser;
              const data = new Uint8Array(analyser.frequencyBinCount);
              function animateWave() {
                floatingWaveAnimRef.current = requestAnimationFrame(animateWave);
                analyser.getByteFrequencyData(data);
                const avg = (s: number, e: number) => {
                  let sum = 0; for (let i = s; i < e; i++) sum += data[i];
                  return Math.min(1, (sum / ((e - s) * 255)) * 3.5);
                };
                const bins = analyser.frequencyBinCount;
                setFloatingNote(prev => prev ? { ...prev, levels: [
                  avg(0, Math.floor(bins * 0.2)),
                  avg(Math.floor(bins * 0.2), Math.floor(bins * 0.5)),
                  avg(Math.floor(bins * 0.5), Math.floor(bins * 0.75)),
                  avg(Math.floor(bins * 0.75), bins),
                  avg(Math.floor(bins * 0.3), Math.floor(bins * 0.6)),
                ]} : null);
              }
              animateWave();
            } catch { /* analyser optional */ }
            a.onended = () => {
              if (floatingWaveAnimRef.current) cancelAnimationFrame(floatingWaveAnimRef.current);
              floatingWaveAnimRef.current = null;
              setFloatingNote(prev => prev ? { ...prev, playing: false, levels: [0.05, 0.05, 0.05, 0.05, 0.05] } : null);
              floatingNoteTimerRef.current = setTimeout(() => setFloatingNote(null), 600);
              URL.revokeObjectURL(url);
            };
            a.play().catch(() => {});
          } catch { /* decode error */ }
          return;
        }
        // ── waveform_tick from peer (fallback for listeners who joined late) ──
        if (msg.type === 'waveform_tick' && msg.userId && msg.userId !== uid && msg.levels) {
          // Only use waveform_tick if MediaSourcePlayer hasn't attached its analyser yet
          // (i.e. no real audio received yet). Once audio flows, analyser takes over.
          if (!livePlayersRef.current.has(msg.userId)) {
            setLiveMicLevels(msg.levels as [number, number, number]);
          }
          return;
        }
        // ── peer stopped live mic → reset waveform ──
        if (msg.type === 'stop' && msg.userId && msg.userId !== uid) {
          // Destroy the player for this peer so next session gets a fresh MediaSource
          const p = livePlayersRef.current.get(msg.userId);
          if (p) { p.destroy(); livePlayersRef.current.delete(msg.userId); }
          if (!liveMicActive) setLiveMicLevels([0.15, 0.15, 0.15]);
          return;
        }
        if (msg.type === 'recording_start' && msg.userId && msg.userId !== uid) {
          setHoldRecording(true); return;
        }
        if (msg.type === 'recording_stop' && msg.userId && msg.userId !== uid) {
          setHoldRecording(false);
          if (!liveMicActive) setLiveMicLevels([0.15, 0.15, 0.15]);
          return;
        }
        // ── peer join/leave banners ──
        if (msg.type === 'peer_joined' && msg.userId && msg.name && msg.userId !== uid) {
          if (joinBannerTimer.current) clearTimeout(joinBannerTimer.current);
          setJoinBanner({ name: msg.name, visible: true });
          joinBannerTimer.current = setTimeout(() => setJoinBanner(null), 5000);
          // Add to members list immediately (real-time, no poll delay)
          setRoomMembers(prev => {
            if (prev.find(m => m.userId === msg.userId)) return prev;
            return [...prev, { userId: msg.userId!, name: msg.name!, username: (msg as any).username ?? '' }];
          });
        }
        if (msg.type === 'peer_left' && msg.userId) {
          setRoomMembers(prev => prev.filter(m => m.userId !== msg.userId));
        }
        // speaking/silent: update liveSpeakers for ALL users in the room
        // secretWsRef is the single connection — handles all events
        if (msg.type === 'speaking' && msg.userId && msg.name) {
          setLiveSpeakers(prev => { const m = new Map(prev); m.set(msg.userId!, msg.name!); return m; });
        }
        if (msg.type === 'silent' && msg.userId) {
          setLiveSpeakers(prev => { const m = new Map(prev); m.delete(msg.userId!); return m; });
        }
        if (msg.type === 'peer_left' && msg.userId) {
          // handled above — also remove from liveSpeakers
          setLiveSpeakers(prev => { const m = new Map(prev); m.delete(msg.userId!); return m; });
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (secretWsRef.current === ws) secretWsRef.current = null;
      // Auto-reconnect after 2s if still unlocked and not intentionally closed
      if (secretUnlocked && user?.id) {
        setTimeout(() => {
          if (secretUnlocked && !secretWsRef.current) {
            const proto2 = location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl2 = `${proto2}://${location.host}/ws/room-live?room=secret-live&userId=${encodeURIComponent(uid)}`;
            const ws2 = new WebSocket(wsUrl2);
            ws2.binaryType = 'arraybuffer';
            secretWsRef.current = ws2;
            ws2.onopen = () => {
              ws2.send(JSON.stringify({ type: 'join', userId: uid, name: uname, mime: 'audio/webm;codecs=opus' }));
            };
            ws2.onmessage = ws.onmessage;
            ws2.onclose = ws.onclose;
            ws2.onerror = ws.onerror;
          }
        }, 2000);
      }
    };
    ws.onerror = () => {
      if (secretWsRef.current === ws) secretWsRef.current = null;
    };
    return () => {
      try { ws.close(); } catch { /* ignore */ }
      secretWsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secretUnlocked, user?.id]);
  async function startHoldRecord() {
    if (holdRecording) return;
    const uid   = user?.id ?? '';
    const uname = user?.name ?? user?.email ?? 'User';
    // Try to acquire mic lock
    try {
      const r = await fetch('/api/secret-room/mic-lock', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, userName: uname, action: 'lock' }),
      });
      const d = await r.json();
      if (!r.ok || d.error === 'locked') {
        setMicLockState({ locked: true, lockedBy: d.lockedBy, lockedName: d.lockedName ?? d.lockedBy });
        return; // someone else is recording
      }
    } catch { return; }
    // Get mic stream
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { await fetch('/api/secret-room/mic-lock', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid, action: 'unlock' }) }); return; }
    holdChunksRef.current = [];
    let mime = pickSecretMime() || 'audio/webm;codecs=opus';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mr.ondataavailable = (e) => { if (e.data.size > 0) holdChunksRef.current.push(e.data); };
    mr.start(100);
    holdRecRef.current = mr;
    holdStartRef.current = Date.now();
    setHoldRecording(true);
    setHoldDuration(0);
    setMicLockState({ locked: true, lockedBy: uid, lockedName: uname });
    holdTimerRef.current = setInterval(() => setHoldDuration(s => s + 1), 1000);
    // Notify peers that recording started
    const activeWs = secretWsRef.current?.readyState === WebSocket.OPEN ? secretWsRef.current : null;
    if (activeWs) {
      activeWs.send(JSON.stringify({ type: 'recording_start' }));
    }
    // ── Analyser for waveform bars during hold-record ──
    try {
      const ctx      = new AudioContext();
      holdAudioCtxRef.current = ctx;
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      holdAnalyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastTick = 0;
      function animateHold(ts: number) {
        holdAnimRef.current = requestAnimationFrame(animateHold);
        analyser.getByteFrequencyData(data);
        const avg = (start: number, end: number) => {
          let sum = 0;
          for (let i = start; i < end; i++) sum += data[i];
          return Math.min(1, (sum / ((end - start) * 255)) * 3.5);
        };
        const bins = analyser.frequencyBinCount;
        const levels: [number, number, number] = [
          avg(0, Math.floor(bins * 0.25)),
          avg(Math.floor(bins * 0.25), Math.floor(bins * 0.6)),
          avg(Math.floor(bins * 0.6), bins),
        ];
        setLiveMicLevels(levels);
        // Send waveform tick to peers every ~100ms
        const wsForTick = secretWsRef.current?.readyState === WebSocket.OPEN ? secretWsRef.current : null;
        if (ts - lastTick > 100 && wsForTick) {
          lastTick = ts;
          wsForTick.send(JSON.stringify({ type: 'waveform_tick', levels }));
        }
      }
      animateHold(0);
    } catch { /* analyser optional */ }
  }
  async function stopHoldRecord() {
    if (!holdRecording || !holdRecRef.current) return;
    const uid   = user?.id ?? '';
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null; }
    // Stop hold analyser
    if (holdAnimRef.current) { cancelAnimationFrame(holdAnimRef.current); holdAnimRef.current = null; }
    holdAnalyserRef.current = null;
    if (holdAudioCtxRef.current) { holdAudioCtxRef.current.close().catch(() => {}); holdAudioCtxRef.current = null; }
    if (!liveMicActive) setLiveMicLevels([0.15, 0.15, 0.15]);
    // Notify peers that recording stopped
    const wsForStop = secretWsRef.current?.readyState === WebSocket.OPEN ? secretWsRef.current : null;
    if (wsForStop) {
      wsForStop.send(JSON.stringify({ type: 'recording_stop' }));
    }
    const mr = holdRecRef.current;
    holdRecRef.current = null;
    setHoldRecording(false);
    await new Promise<void>(res => {
      mr.onstop = () => res();
      if (mr.state !== 'inactive') mr.stop();
      else res();
    });
    // Stop mic tracks
    mr.stream?.getTracks().forEach(t => t.stop());
    const duration = Math.round((Date.now() - holdStartRef.current) / 1000);
    const blob = new Blob(holdChunksRef.current, { type: mr.mimeType || 'audio/webm' });
    holdChunksRef.current = [];
    // Unlock mic
    try { await fetch('/api/secret-room/mic-lock', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid, action: 'unlock' }) }); } catch { /* ignore */ }
    setMicLockState({ locked: false });
    if (duration < 1) return; // too short, discard
    const noteId = `vn-${Date.now()}`;
    // ── Helper: show floating notification + animate waveform from audio element ──
    function showFloatingNote(audioEl: HTMLAudioElement, senderName: string, isSelf: boolean, dur: number) {
      if (floatingNoteTimerRef.current) clearTimeout(floatingNoteTimerRef.current);
      if (floatingWaveAnimRef.current) cancelAnimationFrame(floatingWaveAnimRef.current);
      floatingAnalyserRef.current = null;
      setFloatingNote({ id: noteId, senderName, isSelf, duration: dur, levels: [0.3, 0.5, 0.3], playing: true });
      // Wire up analyser to the audio element for live waveform
      try {
        const ctx      = new AudioContext();
        const src      = ctx.createMediaElementSource(audioEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        src.connect(ctx.destination);
        floatingAnalyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        function animateWave() {
          floatingWaveAnimRef.current = requestAnimationFrame(animateWave);
          analyser.getByteFrequencyData(data);
          const avg = (s: number, e: number) => {
            let sum = 0; for (let i = s; i < e; i++) sum += data[i];
            return Math.min(1, (sum / ((e - s) * 255)) * 3.5);
          };
          const bins = analyser.frequencyBinCount;
          setFloatingNote(prev => prev ? { ...prev, levels: [
            avg(0, Math.floor(bins * 0.2)),
            avg(Math.floor(bins * 0.2), Math.floor(bins * 0.5)),
            avg(Math.floor(bins * 0.5), Math.floor(bins * 0.75)),
            avg(Math.floor(bins * 0.75), bins),
            avg(Math.floor(bins * 0.3), Math.floor(bins * 0.6)),
          ]} : null);
        }
        animateWave();
      } catch { /* analyser optional — still show static bars */ }
      audioEl.onended = () => {
        if (floatingWaveAnimRef.current) cancelAnimationFrame(floatingWaveAnimRef.current);
        floatingWaveAnimRef.current = null;
        floatingAnalyserRef.current = null;
        setFloatingNote(prev => prev ? { ...prev, playing: false, levels: [0.1, 0.1, 0.1, 0.1, 0.1] } : null);
        floatingNoteTimerRef.current = setTimeout(() => setFloatingNote(null), 600);
        URL.revokeObjectURL(audioEl.src);
      };
    }
    // Sender plays their own recording + shows floating notification
    const selfUrl   = URL.createObjectURL(blob);
    const selfAudio = new Audio(selfUrl);
    (selfAudio as any).setSinkId?.('default').catch(() => {});
    showFloatingNote(selfAudio, user?.name ?? 'You', true, duration);
    selfAudio.play().catch(() => {});
    // Broadcast via WS — use secretWsRef (always connected)
    const wsForNote = secretWsRef.current?.readyState === WebSocket.OPEN ? secretWsRef.current : null;
    if (wsForNote) {
      const noteId2 = `vn-${Date.now()}`;
      const mime    = blob.type || 'audio/webm;codecs=opus';
      const ab      = await blob.arrayBuffer();
      const bytes   = new Uint8Array(ab);
      let binary    = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      wsForNote.send(JSON.stringify({ type: 'voice_note', id: noteId2, mime, duration, audio: b64 }));
    }
  }
  async function handleSecretSubmit() {
    const val = secretInput.trim();
    if (!val) return;
    setSecretError(false);
    let unlocked = false;
    try {
      const r = await fetch('/api/owner/live-pin/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: val }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.valid) unlocked = true;
      }
    } catch { /* network error */ }
    if (unlocked) {
      setSecretUnlocked(true);
      setSecretInput('');
      setSecretError(false);
      setShowPinPopup(false);
      fetchRoomJoinCount();
      // log join with current user's name
      const uName = user?.name ?? user?.email ?? 'Unknown';
      logSecretRoomJoin(uName);
    } else {
      setSecretError(true);
      setSecretInput('');
      setTimeout(() => setSecretError(false), 2500);
    }
  }
  // ── MIME picker (used by hold-to-record voice notes) ─────────────────────
  function pickSecretMime(): string {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm;codecs=opus';
    const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS || isSafari) {
      for (const m of ['audio/mp4', 'audio/aac', 'audio/x-m4a']) {
        if (MediaRecorder.isTypeSupported(m)) return m;
      }
    }
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }
  function stopLiveMic() {
    // ── Stop waveform animation ──────────────────────────────────────────────
    if (liveAnimRef.current) { cancelAnimationFrame(liveAnimRef.current); liveAnimRef.current = null; }
    liveAnalyserRef.current = null;
    // ── Stop Agora mic track + leave channel ─────────────────────────────────
    if (secretAgoraMicTrackRef.current) {
      try { secretAgoraMicTrackRef.current.stop(); secretAgoraMicTrackRef.current.close(); } catch { /* ignore */ }
      secretAgoraMicTrackRef.current = null;
    }
    if (secretAgoraClientRef.current) {
      secretAgoraClientRef.current.leave().catch(() => {});
      secretAgoraClientRef.current = null;
    }
    // ── Stop legacy MediaRecorder / stream (safety cleanup) ──────────────────
    if (liveMicRef.current && liveMicRef.current.state !== 'inactive') liveMicRef.current.stop();
    liveMicRef.current = null;
    if (liveStreamRef.current) { liveStreamRef.current.getTracks().forEach(t => t.stop()); liveStreamRef.current = null; }
    // ── Close waveform AudioContext ───────────────────────────────────────────
    if (secretAgoraWaveCtxRef.current) {
      secretAgoraWaveCtxRef.current.close().catch(() => {});
      secretAgoraWaveCtxRef.current = null;
    }
    // ── Notify peers via WS (speaking → silent) ──────────────────────────────
    const myId = user?.id ?? '';
    const ws = secretWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'stop', userId: myId })); } catch { /* ignore */ }
    }
    if (micTimerRef.current) { clearInterval(micTimerRef.current); micTimerRef.current = null; }
    setLiveMicActive(false);
    liveMicActiveRef.current = false;
    setLiveMicLevels([0.15, 0.15, 0.15]);
    setMicCountdown(30);
    setLiveSpeakers(prev => { const m = new Map(prev); m.delete(myId); return m; });
  }
  function toggleLiveMic() {
    if (liveMicActive) {
      stopLiveMic();
      return;
    }
    const myId  = user?.id    ?? '';
    const uname = user?.name  ?? user?.email ?? 'Live';
    // ── Block if someone else is already speaking ──────────────────────────
    const otherSpeakers = Array.from(liveSpeakers.entries()).filter(([id]) => id !== myId);
    if (otherSpeakers.length > 0) return;
    // ── Start Agora RTC session ────────────────────────────────────────────
    (async () => {
      try {
        const A = (await import('agora-rtc-sdk-ng')).default;
        A.setLogLevel(3);
        const channel = 'secret-live-agora';
        const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(myId)}`);
        const { appId, token } = await r.json() as { appId: string; token: string };
        const uid = Math.abs(myId.split('').reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0)) % 100000;
        const client = A.createClient({ mode: 'rtc', codec: 'vp8' } as any);
        secretAgoraClientRef.current = client;
        // ── Receive audio from other speakers ──────────────────────────────
        client.on('user-published', async (remoteUser: any, mediaType: string) => {
          if (mediaType === 'audio') {
            await client.subscribe(remoteUser, 'audio');
            remoteUser.audioTrack?.play();
          }
        });
        await client.join(appId || '149ef04e839c4132a08efb49d717c436', channel, token, uid);
        // ── Create + publish mic track ─────────────────────────────────────
        const micTrack = await A.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true, ANS: true, AGC: true,
        });
        secretAgoraMicTrackRef.current = micTrack;
        await client.publish(micTrack);
        // ── Waveform analyser via Web Audio API ────────────────────────────
        try {
          const stream = (micTrack as any).getMediaStreamTrack
            ? new MediaStream([(micTrack as any).getMediaStreamTrack()])
            : null;
          if (stream) {
            const waveCtx = new AudioContext();
            secretAgoraWaveCtxRef.current = waveCtx;
            const src      = waveCtx.createMediaStreamSource(stream);
            const analyser = waveCtx.createAnalyser();
            analyser.fftSize = 64;
            src.connect(analyser);
            liveAnalyserRef.current = analyser;
            const data = new Uint8Array(analyser.frequencyBinCount);
            let lastWaveTick = 0;
            function animateWave(ts: number) {
              liveAnimRef.current = requestAnimationFrame(animateWave);
              analyser.getByteFrequencyData(data);
              const avg = (start: number, end: number) => {
                let sum = 0;
                for (let i = start; i < end; i++) sum += data[i];
                return Math.min(1, (sum / ((end - start) * 255)) * 3.5);
              };
              const bins = analyser.frequencyBinCount;
              const levels: [number, number, number] = [
                avg(0, Math.floor(bins * 0.25)),
                avg(Math.floor(bins * 0.25), Math.floor(bins * 0.6)),
                avg(Math.floor(bins * 0.6), bins),
              ];
              setLiveMicLevels(levels);
              // Send waveform tick to peers every ~100ms via WS
              if (ts - lastWaveTick > 100) {
                lastWaveTick = ts;
                const wsForWave = secretWsRef.current;
                if (wsForWave && wsForWave.readyState === WebSocket.OPEN) {
                  wsForWave.send(JSON.stringify({ type: 'waveform_tick', levels }));
                }
              }
            }
            animateWave(0);
          }
        } catch { /* waveform optional */ }
        // ── Notify peers via WS (speaking signal) ─────────────────────────
        const ws = secretWsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'speaking', userId: myId, name: uname }));
        }
        // ── Update state ───────────────────────────────────────────────────
        setLiveMicActive(true);
        liveMicActiveRef.current = true;
        setLiveSpeakers(prev => { const m = new Map(prev); m.set(myId, uname); return m; });
        setSecretJoined(true);
        setMicCountdown(30);
        // 30s auto-stop timer
        micTimerRef.current = setInterval(() => {
          setMicCountdown(prev => {
            if (prev <= 1) { stopLiveMic(); return 30; }
            return prev - 1;
          });
        }, 1000);
      } catch (e) {
        console.error('[SecretRoom Agora] start error', e);
        // Cleanup on error
        try { secretAgoraMicTrackRef.current?.stop(); secretAgoraMicTrackRef.current?.close(); } catch {}
        secretAgoraMicTrackRef.current = null;
        try { await secretAgoraClientRef.current?.leave(); } catch {}
        secretAgoraClientRef.current = null;
      }
    })();
  }
  // ── Poll for whisper alerts (notify current user when someone wants to whisper) ──
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      try {
        const r = await fetch(`/api/notify/whisper?userId=${encodeURIComponent(user.id)}`);
        if (!r.ok) return;
        const alerts: { fromName: string; fromId: string; ts: number }[] = await r.json();
        for (const a of alerts) {
          notifyWhisperAlert(a.fromName);
        }
      } catch { /* silent */ }
    };
    const id = setInterval(check, 4000);
    return () => clearInterval(id);
  }, [user]);
  // Load friends + presence for the picker
  const loadFriendsAndPresence = useCallback(async () => {
    try {
      const r = await fetch('/api/friends');
      if (!r.ok) return;
      const d = await r.json();
      const accepted: { friendId: string; name: string | null; username: string | null; avatarUrl?: string | null }[] = d.accepted ?? [];
      if (!accepted.length) { setAllFriends([]); setOnlineIds(new Set()); return; }
      const ids = accepted.map((f) => f.friendId);
      const pr = await fetch(`/api/presence?userIds=${ids.join(',')}`);
      const presence: { userId: string; online: boolean }[] = pr.ok ? await pr.json() : [];
      const onlineSet = new Set(presence.filter((p) => p.online).map((p) => p.userId));
      setAllFriends(accepted.map((f) => ({ id: f.friendId, name: f.name, username: f.username, avatarUrl: f.avatarUrl })));
      setOnlineIds(onlineSet);
    } catch { /* silent */ }
  }, []);
  // Load highlighted user IDs (owner + manually highlighted)
  useEffect(() => {
    if (!user) return;
    fetch('/api/highlights', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((ids: string[]) => setHighlightedIds(new Set(ids)))
      .catch(() => {});
  }, [user]);
  // ── Auto-refresh every 3s (also triggered by push notifications) ─────────
  const tick = useAutoRefresh();
  // Poll online count every 20s while mounted — also re-runs on tick
  useEffect(() => {
    if (!user) return;
    loadFriendsAndPresence();
    const id = setInterval(loadFriendsAndPresence, 20_000);
    return () => clearInterval(id);
  }, [user, loadFriendsAndPresence, tick]);
  // Poll statuses every 15s — also re-runs on tick
  useEffect(() => {
    if (!user) return;
    loadStatuses();
    const id = setInterval(loadStatuses, 15_000);
    return () => clearInterval(id);
  }, [user, loadStatuses, tick]);
  // Anonymous visitor heartbeat — runs for ALL visitors (logged in or not)
  useEffect(() => {
    let visitorId = localStorage.getItem('stooorna_vid');
    if (!visitorId) { visitorId = Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem('stooorna_vid', visitorId); }
    const vid = visitorId;
    const ping = async () => {
      try {
        const r = await fetch('/api/presence/visitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId: vid }),
        });
        if (r.ok) {
          const d = await r.json();
          void d; // visitor count no longer displayed
        }
      } catch { /* silent */ }
    };
    ping();
    const id = setInterval(ping, 20_000);
    return () => clearInterval(id);
  }, []);
  // Whisper: select friend from strip
  function selectWhisperFriend(friend: OnlineFriend) {
    setSelectedWhisperFriend(friend);
  }
  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden select-none"
      style={{ minHeight: '100dvh', background: t.bgGradient, fontFamily: 'var(--font-sans)' }}
    >
      {pageTitle && <h1 className="sr-only">{pageTitle}</h1>}
      {/* ── Global Secret-Room LIVE Banner — visible to ALL users ── */}
      <AnimatePresence>
        {globalLiveSpeakers.length > 0 && !secretUnlocked && (
          <motion.div
            key="global-live-banner"
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '10px 20px',
              background: 'linear-gradient(90deg, rgba(4,10,10,0.97) 0%, rgba(0,30,35,0.97) 50%, rgba(4,10,10,0.97) 100%)',
              borderBottom: '1.5px solid rgba(239,68,68,0.45)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Red pulsing dot */}
            <motion.div
              animate={{ scale: [1, 1.7, 1], opacity: [1, 0.25, 1] }}
              transition={{ duration: 0.75, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}
            />
            {/* Speaker names */}
            <span style={{ color: 'rgba(220,240,240,0.92)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.02em' }}>
              {globalLiveSpeakers.map(s => s.name).join('، ')}
              <span style={{ color: 'rgba(180,210,210,0.55)', fontWeight: 400, marginRight: 6 }}> يتحدث الآن</span>
            </span>
            {/* Animated waveform */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 16 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <motion.div
                  key={i}
                  animate={{ scaleY: [0.2, 1, 0.4, 0.9, 0.2] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.08, ease: 'easeInOut' }}
                  style={{ width: 3, height: 16, borderRadius: 2, background: '#ef4444', transformOrigin: 'bottom', opacity: 0.8 }}
                />
              ))}
            </div>
            {/* LIVE badge */}
            <motion.span
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.16em',
                color: '#ef4444', background: 'rgba(239,68,68,0.12)',
                border: '1.5px solid rgba(239,68,68,0.5)',
                borderRadius: 8, padding: '2px 8px', flexShrink: 0,
              }}
            >
              LIVE
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background glow */}
      <motion.div
        className="pointer-events-none absolute"
        style={{
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${t.glowColor} 0%, transparent 70%)`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -58%)',
        }}
        animate={glowPulse ? { opacity: [0.7, 1, 0.7], scale: [1, 1.08, 1] } : { opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: glowPulse ? 1.2 : 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* App name */}
      <div className="pt-8 pb-2 z-10 w-full flex items-center justify-between px-4">
        <div style={{ width: 40 }} />
        <p style={{ letterSpacing: '0.35em', fontSize: '0.7rem', color: t.appNameColor, fontWeight: 600, textTransform: 'uppercase' }}>
          {appName}
        </p>
        {/* Music button hidden by request — keep spacer for layout balance */}
        <div style={{ width: 40 }} />
      </div>
      {/* ── All-Users Status Bar (above rooms, public screen only) ── */}
      {false && !isWhisper && allFriends.length > 0 && (
        <div
          className="z-10 w-full"
          style={{
            paddingTop: 10,
            paddingBottom: 6,
            borderBottom: `1px solid ${t.navBorder}`,
            background: 'rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
        >
          <style>{`.users-strip::-webkit-scrollbar{display:none}`}</style>
          <div
            className="users-strip"
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              gap: 6,
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              paddingLeft: 12,
              paddingRight: 12,
              paddingBottom: 2,
              alignItems: 'flex-start',
            }}
          >
            {/* ── My status pill (always first) ── */}
            {user && (() => {
              const myGroup    = statusGroups.find(g => g.userId === statusMyId);
              const hasStatus  = (myGroup?.items.length ?? 0) > 0;
              const allSeen    = hasStatus && (myGroup?.items.every(i => i.seen) ?? false);
              const myGroupIdx = statusGroups.findIndex(g => g.userId === statusMyId);
              void myGroupIdx; // kept for potential status viewer use
              const isMeHighlighted = statusMyId ? highlightedIds.has(statusMyId) : false;
              const hasPublicPosts = statusMyId
                ? postUserIds.has(String(statusMyId))
                : postUserIds.has(String(user?.id ?? ''));
              const isMeOwner = isCurrentUserOwner;
              const isMeSelected = postFilterUserId !== null && String(postFilterUserId) === String(statusMyId ?? user?.id ?? '');
              // Ring color: blue for owner, red for highlighted, cyan gradient for normal
              const ringStroke = allSeen
                ? 'rgba(100,100,100,0.5)'
                : isMeOwner ? '#2563eb' : isMeHighlighted ? '#ff2d2d' : 'url(#sg)';
              // Pill border color
              const pillBorder = isMeSelected
                ? 'rgba(0,188,212,1)'
                : hasStatus
                  ? (allSeen ? 'rgba(100,100,100,0.4)' : isMeOwner ? 'rgba(37,99,235,0.9)' : isMeHighlighted ? 'rgba(255,45,45,0.8)' : 'rgba(0,188,212,0.7)')
                  : isMeOwner ? 'rgba(37,99,235,0.6)' : isMeHighlighted ? 'rgba(255,45,45,0.5)' : 'rgba(255,255,255,0.1)';
              const pillBg = isMeSelected
                ? 'rgba(0,188,212,0.18)'
                : hasStatus
                  ? (isMeOwner ? 'rgba(37,99,235,0.15)' : isMeHighlighted ? 'rgba(255,45,45,0.10)' : 'rgba(0,188,212,0.12)')
                  : isMeOwner ? 'rgba(37,99,235,0.10)' : isMeHighlighted ? 'rgba(255,45,45,0.07)' : 'rgba(255,255,255,0.04)';
              const pillGlow = hasStatus && !allSeen
                ? (isMeOwner ? '0 0 12px rgba(37,99,235,0.55)' : isMeHighlighted ? '0 0 10px rgba(255,45,45,0.45)' : '0 0 8px rgba(0,188,212,0.35)')
                : isMeOwner ? '0 0 10px rgba(37,99,235,0.35)' : 'none';
              return (
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    const myId = statusMyId ?? user?.id ?? '';
                    if (isMeSelected) {
                      setPostFilterUserId(null); // deselect on second tap
                    } else {
                      setPostFilterUserId(String(myId));
                    }
                  }}
                  animate={(hasStatus && !allSeen) || hasPublicPosts ? {
                    boxShadow: [
                      isMeOwner
                        ? '0 0 0px rgba(37,99,235,0)'
                        : isMeHighlighted
                          ? '0 0 0px rgba(255,45,45,0)'
                          : '0 0 0px rgba(0,188,212,0)',
                      isMeOwner
                        ? '0 0 18px 4px rgba(37,99,235,0.75), 0 0 32px 8px rgba(37,99,235,0.35)'
                        : isMeHighlighted
                          ? '0 0 18px 4px rgba(255,45,45,0.75), 0 0 32px 8px rgba(255,45,45,0.35)'
                          : '0 0 18px 4px rgba(0,188,212,0.75), 0 0 32px 8px rgba(0,188,212,0.35)',
                      isMeOwner
                        ? '0 0 0px rgba(37,99,235,0)'
                        : isMeHighlighted
                          ? '0 0 0px rgba(255,45,45,0)'
                          : '0 0 0px rgba(0,188,212,0)',
                    ],
                  } : { boxShadow: pillGlow }}
                  transition={hasStatus && !allSeen ? {
                    duration: 1.4, repeat: Infinity, ease: 'easeInOut',
                  } : { duration: 0.3 }}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'row', alignItems: 'center',
                    gap: 7, padding: '5px 10px 5px 5px',
                    borderRadius: 999,
                    background: pillBg,
                    border: `1.5px solid ${pillBorder}`,
                    cursor: 'pointer', minWidth: 0, maxWidth: 130,
                  }}
                >
                  {/* Avatar with ring */}
                  <div style={{ position: 'relative', flexShrink: 0, width: 30, height: 30 }}>
                    {/* Status ring */}
                    {hasStatus && (
                      <svg style={{ position: 'absolute', inset: -3, width: 36, height: 36, zIndex: 1 }} viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="16" fill="none"
                          stroke={ringStroke}
                          strokeWidth="2.5" strokeDasharray="4 2" strokeLinecap="round" />
                        <defs>
                          <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00BCD4" />
                            <stop offset="100%" stopColor="#0052d4" />
                          </linearGradient>
                        </defs>
                      </svg>
                    )}
                    {(user as any).avatarUrl ? (
                      <img src={(user as any).avatarUrl} alt="me"
                        style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', position: 'relative', zIndex: 2 }} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', position: 'relative', zIndex: 2,
                        background: isMeHighlighted ? 'rgba(255,45,45,0.2)' : 'rgba(0,188,212,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                        color: isMeHighlighted ? '#ff6b6b' : 'rgba(0,188,212,0.9)',
                      }}>
                        {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700,
                    color: isMeOwner ? '#2563eb' : isMeHighlighted ? '#ff4444' : 'rgba(210,240,240,0.9)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textShadow: isMeOwner ? '0 0 10px rgba(37,99,235,0.6)' : isMeHighlighted ? '0 0 8px rgba(255,60,60,0.6)' : 'none',
                  }}>
                    {(user as any).username ? `@${(user as any).username}` : 'أنا'}
                  </span>
                </motion.div>
              );
            })()}
            {/* ── Friends pills ── */}
            {allFriends.map((f) => {
              const isOnline      = onlineIds.has(f.id);
              const label         = f.username ? `@${f.username}` : (f.name ?? '??');
              const fGroup        = statusGroups.find(g => g.userId === f.id);
              const hasStatus     = !!fGroup && fGroup.items.length > 0;
              const allSeen       = hasStatus && fGroup.items.every(i => i.seen);
              const fGroupIdx     = statusGroups.findIndex(g => g.userId === f.id);
              void fGroupIdx; // kept for potential status viewer use
              const isHighlighted = highlightedIds.has(f.id);
              const hasPublicPosts = postUserIds.has(String(f.id));
              const isFriendOwner = f.username === OWNER_USERNAME;
              const isSelected = postFilterUserId !== null && String(postFilterUserId) === String(f.id);
              // Ring color
              const ringStroke = allSeen
                ? 'rgba(100,100,100,0.5)'
                : isFriendOwner ? '#2563eb' : isHighlighted ? '#ff2d2d' : 'url(#fg)';
              // Pill colors — selected (viewing posts) overrides everything with a solid blue frame
              const pillBg = isSelected
                ? 'rgba(0,188,212,0.18)'
                : hasStatus
                  ? (isFriendOwner ? 'rgba(37,99,235,0.15)' : isHighlighted ? 'rgba(255,45,45,0.10)' : 'rgba(0,188,212,0.10)')
                  : isOnline
                    ? (isFriendOwner ? 'rgba(37,99,235,0.10)' : isHighlighted ? 'rgba(255,45,45,0.07)' : 'rgba(0,188,212,0.06)')
                    : 'rgba(255,255,255,0.04)';
              const pillBorder = isSelected
                ? 'rgba(0,188,212,1)'
                : hasStatus && !allSeen
                  ? (isFriendOwner ? 'rgba(37,99,235,0.9)' : isHighlighted ? 'rgba(255,45,45,0.8)' : 'rgba(0,188,212,0.7)')
                  : hasStatus && allSeen ? 'rgba(100,100,100,0.4)'
                  : isOnline
                    ? (isFriendOwner ? 'rgba(37,99,235,0.55)' : isHighlighted ? 'rgba(255,45,45,0.45)' : 'rgba(0,188,212,0.28)')
                    : isFriendOwner ? 'rgba(37,99,235,0.35)' : isHighlighted ? 'rgba(255,45,45,0.3)' : 'rgba(255,255,255,0.08)';
              const pillGlow = hasStatus && !allSeen
                ? (isFriendOwner ? '0 0 12px rgba(37,99,235,0.55)' : isHighlighted ? '0 0 10px rgba(255,45,45,0.45)' : '0 0 8px rgba(0,188,212,0.3)')
                : isFriendOwner ? '0 0 10px rgba(37,99,235,0.4)' : 'none';
              return (
                <motion.div
                  key={f.id}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (isSelected) {
                      setPostFilterUserId(null); // deselect on second tap
                    } else {
                      setPostFilterUserId(String(f.id));
                    }
                  }}
                  animate={(hasStatus && !allSeen) || hasPublicPosts ? {
                    boxShadow: [
                      isFriendOwner
                        ? '0 0 0px rgba(37,99,235,0)'
                        : isHighlighted
                          ? '0 0 0px rgba(255,45,45,0)'
                          : '0 0 0px rgba(0,188,212,0)',
                      isFriendOwner
                        ? '0 0 18px 4px rgba(37,99,235,0.75), 0 0 32px 8px rgba(37,99,235,0.35)'
                        : isHighlighted
                          ? '0 0 18px 4px rgba(255,45,45,0.75), 0 0 32px 8px rgba(255,45,45,0.35)'
                          : '0 0 18px 4px rgba(0,188,212,0.75), 0 0 32px 8px rgba(0,188,212,0.35)',
                      isFriendOwner
                        ? '0 0 0px rgba(37,99,235,0)'
                        : isHighlighted
                          ? '0 0 0px rgba(255,45,45,0)'
                          : '0 0 0px rgba(0,188,212,0)',
                    ],
                  } : { boxShadow: pillGlow }}
                  transition={hasStatus && !allSeen ? {
                    duration: 1.4, repeat: Infinity, ease: 'easeInOut',
                  } : { duration: 0.3 }}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'row', alignItems: 'center',
                    gap: 7, padding: '5px 10px 5px 5px',
                    borderRadius: 999,
                    background: pillBg,
                    border: `1.5px solid ${pillBorder}`,
                    cursor: 'pointer',
                    minWidth: 0, maxWidth: 130,
                  }}
                >
                  {/* Avatar + rings */}
                  <div style={{ position: 'relative', flexShrink: 0, width: 30, height: 30 }}>

                    {/* Status ring */}
                    {hasStatus && (
                      <svg style={{ position: 'absolute', inset: -3, width: 36, height: 36, zIndex: 1 }} viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="16" fill="none"
                          stroke={ringStroke}
                          strokeWidth="2.5" strokeDasharray="4 2" strokeLinecap="round" />
                        <defs>
                          <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00BCD4" />
                            <stop offset="100%" stopColor="#0052d4" />
                          </linearGradient>
                        </defs>
                      </svg>
                    )}
                    {f.avatarUrl ? (
                      <img src={f.avatarUrl} alt={label}
                        style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', position: 'relative', zIndex: 2 }} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', position: 'relative', zIndex: 2,
                        background: isHighlighted ? 'rgba(255,45,45,0.2)' : isOnline ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.07)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                        color: isHighlighted ? '#ff6b6b' : isOnline ? 'rgba(0,188,212,0.9)' : 'rgba(255,255,255,0.3)',
                      }}>
                        {label.replace('@','').charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Presence dot */}
                    <motion.div
                      animate={isOnline ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] } : {}}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        position: 'absolute', bottom: 0, right: 0, zIndex: 3,
                        width: 9, height: 9, borderRadius: '50%',
                        background: isOnline ? '#22c55e' : '#4b5563',
                        border: '1.5px solid rgba(6,14,14,0.95)',
                        boxShadow: isOnline ? '0 0 5px rgba(34,197,94,0.8)' : 'none',
                      }}
                    />
                  </div>
                  {/* Name */}
                  <span style={{
                    fontSize: '0.68rem',
                    color: isFriendOwner ? '#2563eb' : isHighlighted ? '#ff4444' : isOnline ? 'rgba(210,240,240,0.9)' : 'rgba(180,195,195,0.75)',
                    fontWeight: isFriendOwner ? 700 : isHighlighted ? 700 : isOnline ? 600 : 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    letterSpacing: '0.01em',
                    textShadow: isFriendOwner ? '0 0 10px rgba(37,99,235,0.6)' : isHighlighted ? '0 0 8px rgba(255,60,60,0.6)' : 'none',
                  }}>
                    {label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
      {/* ── PIN popup — rendered as a fixed portal to escape overflow:hidden ── */}
      {!secretUnlocked && !isWhisper && showPinPopup && typeof document !== 'undefined' && createPortal(
        <PinPopup
          secretError={secretError}
          secretInput={secretInput}
          setSecretInput={setSecretInput}
          setSecretError={setSecretError}
          setShowPinPopup={setShowPinPopup}
          handleSecretSubmit={handleSecretSubmit}
          pinInputRef={pinInputRef}
          anchorRef={lockBtnRef}
        />,
        document.body
      )}
      {/* Main content */}
      <div className="flex flex-col items-center z-10 flex-1 w-full px-6" style={{ justifyContent: 'center', paddingTop: 0 }}>
        {/* ── Rooms grid (public screen only) ── */}
        {!isWhisper && (
          <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* ── Waveform section — sits directly above rooms ── */}
            {secretUnlocked && (
              <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* ── Network Audio Controls — فوق Joined ── */}
                <div style={{ width: '100%', paddingLeft: 4, paddingRight: 4, marginBottom: 4 }}>
                  <NetworkAudioControls micActive={liveMicActive} />
                </div>
                {/* ── Room join count badge ── */}
                <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }} ref={membersListRef}>
                  <button
                    onClick={() => { setShowMembersList(v => !v); if (!showMembersList) fetchRoomMembers(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '5px 14px',
                      background: showMembersList ? 'rgba(0,188,212,0.12)' : 'rgba(0,0,0,0.45)',
                      border: `1px solid ${showMembersList ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.25)'}`,
                      borderRadius: 20,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(0,188,212,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span style={{ color: 'rgba(0,188,212,0.85)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                      {roomMembers.length} Joined
                    </span>
                    {/* dropdown arrow */}
                    <svg
                      width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(0,188,212,0.75)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: 'transform 0.2s', transform: showMembersList ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {/* ── Members dropdown list ── */}
                  {showMembersList && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      minWidth: 180,
                      background: 'rgba(10,14,22,0.97)',
                      border: '1px solid rgba(0,188,212,0.3)',
                      borderRadius: 12,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                      zIndex: 999,
                      overflow: 'hidden',
                    }}>
                      {/* header */}
                      <div style={{
                        padding: '8px 14px',
                        borderBottom: '1px solid rgba(0,188,212,0.15)',
                        color: 'rgba(0,188,212,0.7)',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}>
                        داخل الغرفة الآن
                      </div>
                      {roomMembers.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', textAlign: 'center' }}>
                          لا أحد متصل
                        </div>
                      ) : (
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {roomMembers.map((m, i) => {
                            const isMemberOwner = m.username === OWNER_USERNAME || (m.userId === user?.id && isCurrentUserOwner);
                            const isSelf = m.userId === user?.id;
                            return (
                            <div key={m.userId} style={{
                              display: 'flex', alignItems: 'center', gap: 9,
                              padding: '9px 14px',
                              borderBottom: i < roomMembers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                              background: isSelf ? 'hsl(var(--primary)/0.07)' : 'transparent',
                            }}>
                              {/* online dot */}
                              <div style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: '#22c55e',
                                boxShadow: '0 0 5px rgba(34,197,94,0.7)',
                                flexShrink: 0,
                              }} />
                              {/* name + username */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  color: isMemberOwner ? 'hsl(var(--owner))' : isSelf ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.88)',
                                  fontSize: '0.82rem',
                                  fontWeight: isMemberOwner || isSelf ? 700 : 500,
                                  textShadow: isMemberOwner ? '0 0 8px hsl(var(--owner)/0.5)' : 'none',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                  {m.name}
                                  {isSelf && (
                                    <span style={{ color: 'hsl(var(--primary)/0.55)', fontSize: '0.68rem', fontWeight: 400 }}>(أنت)</span>
                                  )}
                                  {isMemberOwner && (
                                    <span style={{
                                      fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.06em',
                                      color: 'hsl(var(--owner))',
                                      background: 'hsl(var(--owner)/0.15)',
                                      border: '1px solid hsl(var(--owner)/0.4)',
                                      borderRadius: 4, padding: '1px 4px',
                                    }}>OWNER</span>
                                  )}
                                </div>
                                {m.username ? (
                                  <div style={{
                                    color: isMemberOwner ? 'hsl(var(--owner)/0.7)' : 'hsl(var(--primary)/0.6)',
                                    fontSize: '0.7rem', fontWeight: 500, marginTop: 1,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  }}>
                                    @{m.username}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
 
                {/* ── تسجيل الخروج button ── */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                  <button
                    onClick={() => setSecretUnlocked(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 16px',
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.5)',
                      borderRadius: 20,
                      color: 'rgba(239,68,68,0.95)',
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.28)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                  >
                    {/* logout icon */}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    تسجيل الخروج
                  </button>
                </div>
                {/* Extra waveform bar — top */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 7,
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.25)',
                  border: `1px solid ${(liveMicActive || holdRecording) ? 'rgba(239,68,68,0.35)' : 'rgba(0,188,212,0.15)'}`,
                  borderRadius: 12,
                  transition: 'border-color 0.3s',
                }}>
                  {liveMicLevels.map((level, i) => {
                    const barColors = [
                      { active: 'rgba(239,68,68,0.9), rgba(239,68,68,', glow: 'rgba(239,68,68,0.6)' },
                      { active: 'rgba(234,179,8,0.9), rgba(234,179,8,',  glow: 'rgba(234,179,8,0.6)'  },
                      { active: 'rgba(34,197,94,0.9), rgba(34,197,94,',  glow: 'rgba(34,197,94,0.6)'  },
                    ];
                    const c = barColors[i % 3];
                    return (
                      <div key={i} style={{ position: 'relative', height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <motion.div
                          animate={{ width: (liveMicActive || holdRecording) ? `${Math.max(8, level * 100)}%` : '8%' }}
                          transition={{ duration: 0.08, ease: 'linear', delay: i * 0.02 }}
                          style={{
                            position: 'absolute', left: 0, top: 0, height: '100%',
                            borderRadius: 4,
                            background: (liveMicActive || holdRecording)
                              ? `linear-gradient(90deg, ${c.active}${0.4 + level * 0.6}))`
                              : 'rgba(0,188,212,0.3)',
                            boxShadow: (liveMicActive || holdRecording) && level > 0.3 ? `0 0 8px ${c.glow}` : 'none',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Bottom 3 horizontal bars */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 7,
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.25)',
                  border: `1px solid ${(liveMicActive || holdRecording) ? 'rgba(239,68,68,0.35)' : 'rgba(0,188,212,0.15)'}`,
                  borderRadius: 12,
                  transition: 'border-color 0.3s',
                }}>
                  {liveMicLevels.map((level, i) => {
                    const barColors = [
                      { active: 'rgba(34,197,94,0.9), rgba(34,197,94,',  glow: 'rgba(34,197,94,0.6)'  },
                      { active: 'rgba(239,68,68,0.9), rgba(239,68,68,',  glow: 'rgba(239,68,68,0.6)'  },
                      { active: 'rgba(234,179,8,0.9), rgba(234,179,8,',  glow: 'rgba(234,179,8,0.6)'  },
                    ];
                    const c = barColors[i % 3];
                    return (
                      <div key={i} style={{ position: 'relative', height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <motion.div
                          animate={{ width: (liveMicActive || holdRecording) ? `${Math.max(8, level * 100)}%` : '8%' }}
                          transition={{ duration: 0.08, ease: 'linear' }}
                          style={{
                            position: 'absolute', left: 0, top: 0, height: '100%',
                            borderRadius: 4,
                            background: (liveMicActive || holdRecording)
                              ? `linear-gradient(90deg, ${c.active}${0.4 + level * 0.6}))`
                              : 'rgba(0,188,212,0.3)',
                            boxShadow: (liveMicActive || holdRecording) && level > 0.3 ? `0 0 8px ${c.glow}` : 'none',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* ── Live Mic circle — below rooms, visible only when unlocked ── */}
            {secretUnlocked && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 70, gap: 12 }}>
                {/* ── Live speakers indicator (visible to ALL in room) ── */}
                {liveSpeakers.size > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 4, width: '100%' }}>
                    {Array.from(liveSpeakers.entries()).map(([spkId, name]) => {
                      const isSelf = spkId === (user?.id ?? '');
                      const isSpkOwner = name === OWNER_USERNAME || (isSelf && isCurrentUserOwner);
                      return (
                        <motion.div
                          key={spkId}
                          initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: isSelf
                              ? 'linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.08) 100%)'
                              : isSpkOwner
                                ? 'linear-gradient(135deg, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0.07) 100%)'
                                : 'linear-gradient(135deg, rgba(0,188,212,0.18) 0%, rgba(0,188,212,0.07) 100%)',
                            border: `1.5px solid ${isSelf ? 'rgba(34,197,94,0.55)' : isSpkOwner ? 'rgba(37,99,235,0.55)' : 'rgba(0,188,212,0.45)'}`,
                            borderRadius: 24, padding: '8px 18px',
                            boxShadow: isSelf
                              ? '0 0 20px rgba(34,197,94,0.2)'
                              : isSpkOwner
                                ? '0 0 20px rgba(37,99,235,0.2)'
                                : '0 0 20px rgba(0,188,212,0.15)',
                            minWidth: 200,
                          }}
                        >
                          {/* pulsing dot */}
                          <motion.div
                            animate={{ scale: [1, 1.6, 1], opacity: [1, 0.3, 1] }}
                            transition={{ duration: 0.65, repeat: Infinity, ease: 'easeInOut' }}
                            style={{ width: 10, height: 10, borderRadius: '50%', background: isSelf ? '#22c55e' : isSpkOwner ? '#2563eb' : '#00BCD4', flexShrink: 0 }}
                          />
                          {/* name */}
                          <span style={{
                            color: isSelf ? '#22c55e' : isSpkOwner ? '#2563eb' : '#00BCD4',
                            fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.03em',
                            flex: 1,
                          }}>
                            {isSelf ? 'أنت تتحدث الآن' : name}
                          </span>
                          {/* animated waveform bars */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 18 }}>
                            {[0, 1, 2, 3, 4].map(i => (
                              <motion.div
                                key={i}
                                animate={{ scaleY: [0.25, 1, 0.45, 0.85, 0.25] }}
                                transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.09, ease: 'easeInOut' }}
                                style={{
                                  width: 3, height: 18, borderRadius: 2,
                                  background: isSelf ? '#22c55e' : '#00BCD4',
                                  transformOrigin: 'bottom',
                                  opacity: 0.85,
                                }}
                              />
                            ))}
                          </div>
                          {/* 🔴 LIVE badge */}
                          <motion.span
                            animate={{ opacity: [1, 0.25, 1] }}
                            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                              fontSize: '0.58rem', fontWeight: 900, letterSpacing: '0.14em',
                              color: '#ef4444', background: 'rgba(239,68,68,0.15)',
                              border: '1px solid rgba(239,68,68,0.45)',
                              borderRadius: 7, padding: '2px 7px',
                              flexShrink: 0,
                            }}
                          >
                            LIVE
                          </motion.span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
                {/* ── Mic busy banner — someone else is speaking ── */}
                {(() => {
                  const myId = user?.id ?? '';
                  const otherSpeakers = Array.from(liveSpeakers.entries()).filter(([id]) => id !== myId);
                  const isMicBusy = otherSpeakers.length > 0 && !liveMicActive;
                  if (!isMicBusy) return null;
                  const speakerName = otherSpeakers[0][1];
                  return (
                    <motion.div
                      key="mic-busy"
                      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(239,68,68,0.06) 100%)',
                        border: '1.5px solid rgba(239,68,68,0.45)',
                        borderRadius: 20, padding: '10px 20px',
                        width: '100%', maxWidth: 300,
                        boxShadow: '0 0 24px rgba(239,68,68,0.12)',
                      }}
                    >
                      {/* lock icon */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                          المايك مشغول
                        </div>
                        <div style={{ color: 'rgba(239,68,68,0.65)', fontSize: '0.62rem', fontWeight: 500, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {speakerName} يتحدث الآن
                        </div>
                      </div>
                      {/* pulsing red dot */}
                      <motion.div
                        animate={{ scale: [1, 1.7, 1], opacity: [1, 0.2, 1] }}
                        transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}
                      />
                    </motion.div>
                  );
                })()}
                {/* Mic circle + X button row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* X button — stop mic */}
                  {liveMicActive && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={stopLiveMic}
                      style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'rgba(239,68,68,0.15)',
                        border: '1.5px solid rgba(239,68,68,0.6)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#ef4444',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </motion.button>
                  )}
                  {/* Main mic circle + small record button on its right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Main LIVE mic circle */}
                    {(() => {
                      const myId = user?.id ?? '';
                      const otherSpeakers = Array.from(liveSpeakers.entries()).filter(([id]) => id !== myId);
                      const isMicBusy = otherSpeakers.length > 0 && !liveMicActive;
                      return (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {liveMicActive && (
                        <>
                          <motion.div
                            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
                            style={{ position: 'absolute', width: 96, height: 96, borderRadius: '50%', border: '2px solid #22c55e', pointerEvents: 'none' }}
                          />
                          <motion.div
                            animate={{ scale: [1, 1.7], opacity: [0.35, 0] }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'easeOut', delay: 0.35 }}
                            style={{ position: 'absolute', width: 96, height: 96, borderRadius: '50%', border: '2px solid #22c55e', pointerEvents: 'none' }}
                          />
                        </>
                      )}
                      {/* Busy ripple — red when mic is occupied by someone else */}
                      {isMicBusy && (
                        <>
                          <motion.div
                            animate={{ scale: [1, 2.0], opacity: [0.4, 0] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                            style={{ position: 'absolute', width: 96, height: 96, borderRadius: '50%', border: '2px solid #ef4444', pointerEvents: 'none' }}
                          />
                          <motion.div
                            animate={{ scale: [1, 1.6], opacity: [0.25, 0] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                            style={{ position: 'absolute', width: 96, height: 96, borderRadius: '50%', border: '2px solid #ef4444', pointerEvents: 'none' }}
                          />
                        </>
                      )}
                      <motion.button
                        whileTap={isMicBusy ? { scale: 0.96 } : { scale: 0.9 }}
                        animate={liveMicActive ? {
                          boxShadow: ['0 0 0px 0px rgba(34,197,94,0)', '0 0 26px 10px rgba(34,197,94,0.45)', '0 0 0px 0px rgba(34,197,94,0)'],
                        } : isMicBusy ? {
                          boxShadow: ['0 0 0px 0px rgba(239,68,68,0)', '0 0 18px 6px rgba(239,68,68,0.22)', '0 0 0px 0px rgba(239,68,68,0)'],
                        } : { boxShadow: '0 0 0px 0px rgba(0,188,212,0)' }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                        onClick={isMicBusy ? undefined : toggleLiveMic}
                        style={{
                          width: 96, height: 96, borderRadius: '50%',
                          background: liveMicActive
                            ? 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, rgba(34,197,94,0.08) 100%)'
                            : isMicBusy
                              ? 'radial-gradient(circle, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.06) 100%)'
                              : 'radial-gradient(circle, rgba(0,188,212,0.15) 0%, rgba(0,188,212,0.05) 100%)',
                          border: `2px solid ${liveMicActive ? 'rgba(34,197,94,0.7)' : isMicBusy ? 'rgba(239,68,68,0.55)' : 'rgba(0,188,212,0.35)'}`,
                          cursor: isMicBusy ? 'not-allowed' : 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                          transition: 'background 0.3s, border-color 0.3s',
                          position: 'relative', zIndex: 1,
                          opacity: isMicBusy ? 0.7 : 1,
                        }}
                      >
                        {isMicBusy ? (
                          <>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            <span style={{ fontSize: '0.38rem', fontWeight: 900, letterSpacing: '0.08em', color: '#ef4444', textTransform: 'uppercase' }}>
                              BUSY
                            </span>
                          </>
                        ) : (
                          <>
                            <Mic size={34} color={liveMicActive ? '#22c55e' : '#00BCD4'} strokeWidth={1.8} />
                            <span style={{
                              fontSize: '0.42rem', fontWeight: 800, letterSpacing: '0.1em',
                              color: liveMicActive ? '#22c55e' : 'rgba(0,188,212,0.7)',
                              textTransform: 'uppercase',
                            }}>
                              {liveMicActive ? 'LIVE' : 'MIC'}
                            </span>
                          </>
                        )}
                      </motion.button>
                    </div>
                      );
                    })()}
                    {/* Small hold-to-record circle — right of main circle */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {/* Recording badge */}
                      <AnimatePresence>
                        {holdRecording && (
                          <motion.div
                            key="rec-badge"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 10, padding: '2px 8px' }}
                          >
                            <motion.div animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }}
                              style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                            <span style={{ color: '#ef4444', fontSize: '0.55rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                              {holdDuration}s
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* Lock indicator — someone else recording */}
                      <AnimatePresence>
                        {micLockState.locked && micLockState.lockedBy !== (user?.id ?? '') && !holdRecording && (
                          <motion.div
                            key="lock-badge"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '2px 7px', maxWidth: 80 }}
                          >
                            <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
                              style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                            <span style={{ color: '#ef4444', fontSize: '0.5rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {micLockState.lockedName ?? '...'}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* The small record button */}
                      <motion.button
                        onPointerDown={(e) => { e.preventDefault(); startHoldRecord(); }}
                        onPointerUp={() => stopHoldRecord()}
                        onPointerLeave={() => { if (holdRecording) stopHoldRecord(); }}
                        whileTap={{ scale: 0.88 }}
                        animate={holdRecording ? {
                          boxShadow: ['0 0 0px 0px rgba(239,68,68,0)', '0 0 14px 5px rgba(239,68,68,0.45)', '0 0 0px 0px rgba(239,68,68,0)'],
                        } : {}}
                        transition={holdRecording ? { duration: 0.7, repeat: Infinity } : {}}
                        disabled={micLockState.locked && micLockState.lockedBy !== (user?.id ?? '')}
                        style={{
                          width: 44, height: 44, borderRadius: '50%',
                          background: holdRecording
                            ? 'radial-gradient(circle, rgba(239,68,68,0.35) 0%, rgba(239,68,68,0.12) 100%)'
                            : micLockState.locked && micLockState.lockedBy !== (user?.id ?? '')
                              ? 'rgba(255,255,255,0.03)'
                              : 'radial-gradient(circle, rgba(0,188,212,0.2) 0%, rgba(0,188,212,0.07) 100%)',
                          border: `2px solid ${holdRecording ? 'rgba(239,68,68,0.75)' : micLockState.locked && micLockState.lockedBy !== (user?.id ?? '') ? 'rgba(255,255,255,0.08)' : 'rgba(0,188,212,0.45)'}`,
                          cursor: micLockState.locked && micLockState.lockedBy !== (user?.id ?? '') ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: micLockState.locked && micLockState.lockedBy !== (user?.id ?? '') ? 0.35 : 1,
                          transition: 'background 0.2s, border-color 0.2s, opacity 0.2s',
                          userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
                          flexShrink: 0,
                        }}
                      >
                        <Mic size={18} color={holdRecording ? '#ef4444' : '#00BCD4'} strokeWidth={2} />
                      </motion.button>
                      <span style={{ color: 'rgba(0,188,212,0.4)', fontSize: '0.5rem', textAlign: 'center', lineHeight: 1.2 }}>
                        {holdRecording ? 'ارفع للإرسال' : 'اضغط'}
                      </span>
                    </div>
                  </div>
                  {/* Spacer to balance X button */}
                  {liveMicActive && <div style={{ width: 40 }} />}
                </div>
                {/* Countdown bar — only when mic is active */}
                {liveMicActive && (
                  <div style={{ width: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    {/* Progress track */}
                    <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <motion.div
                        animate={{ width: `${(micCountdown / 30) * 100}%` }}
                        transition={{ duration: 0.4, ease: 'linear' }}
                        style={{
                          height: '100%', borderRadius: 4,
                          background: micCountdown > 15
                            ? 'linear-gradient(90deg, #22c55e, #84cc16)'
                            : micCountdown > 7
                              ? 'linear-gradient(90deg, #eab308, #f97316)'
                              : 'linear-gradient(90deg, #ef4444, #dc2626)',
                          boxShadow: micCountdown <= 7 ? '0 0 8px rgba(239,68,68,0.6)' : 'none',
                          transition: 'background 0.5s',
                        }}
                      />
                    </div>
                    {/* Timer text */}
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
                      color: micCountdown > 15 ? '#22c55e' : micCountdown > 7 ? '#eab308' : '#ef4444',
                      fontVariantNumeric: 'tabular-nums',
                      transition: 'color 0.5s',
                    }}>
                      {micCountdown}s
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* ── Whisper friends strip (whisper screen only) ── */}
        {isWhisper && (
          <WhisperFriendStrip
            friends={allFriends}
            onlineIds={onlineIds}
            selected={selectedWhisperFriend}
            onSelect={selectWhisperFriend}
            theme={theme}
            labelColor={t.labelColor}
            textDim={t.textDim}
          />
        )}
      </div>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full z-50"
            style={{
              background: t.toastBg, border: `1px solid ${t.toastBorder}`,
              backdropFilter: 'blur(10px)', color: t.toastColor,
              fontSize: '0.8rem', letterSpacing: '0.05em', whiteSpace: 'nowrap',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
        <input
          ref={cameraGalleryInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            handleHomeGalleryPick(e.currentTarget.files ?? undefined);
            e.currentTarget.value = '';
          }}
        />
      {galleryPickerOpen && (
        <button
          type="button"
          aria-label="Open gallery"
          autoFocus
          onFocus={e => {
            e.currentTarget.click();
            setGalleryPickerOpen(false);
          }}
          onClick={() => cameraGalleryInputRef.current?.click()}
          style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      )}
      {/* ── Home Camera ── */}
      <AnimatePresence>
        {cameraOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100000,
              background: '#000',
              display: 'flex',
              flexDirection: 'column',
        overflow: 'hidden',
      }}
          >
            {!cameraPreviewUrl ? (
              <>
                {/* معاينة الكاميرا — ملء الشاشة بنفس تصميم كاميرا الشات */}
                <video
                  ref={cameraVideoRef}
                  muted
                  playsInline
                  autoPlay
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                    transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
                  }}
                />

                {/* تعتيم خفيف أعلى/أسفل لوضوح الأيقونات */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />

                {/* ── الأعلى: رجوع + عنوان "نشر بوست" ── */}
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40, zIndex: 2 }}>
                  <button
                    type="button"
                    onClick={closeHomeCamera}
                    aria-label="إغلاق الكاميرا"
                    style={{ position: 'absolute', left: 16, top: 36, width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.3)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ChevronDown size={24} strokeWidth={2.4} />
                  </button>
                  <p style={{ color: '#fff', fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>
                    نشر بوست
                  </p>
                </div>

                {/* ── الجانب: قلب الكاميرا + الفلاش فقط ── */}
                <div style={{ position: 'absolute', right: 16, top: '38%', display: 'flex', flexDirection: 'column', gap: 26, zIndex: 2 }}>
                  <button
                    type="button"
                    onClick={() => void switchHomeCamera()}
                    aria-label="قلب الكاميرا"
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}
                  >
                    <RotateCcw size={26} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleHomeFlash()}
                    aria-label="الفلاش"
                    style={{ background: 'none', border: 'none', color: cameraFlashOn ? '#facc15' : '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}
                  >
                    {cameraFlashOn ? <Zap size={26} strokeWidth={2} fill="#facc15" /> : <ZapOff size={26} strokeWidth={2} />}
                  </button>
                </div>

                {/* ── الأسفل: عداد التسجيل + مكتبة الصور + زر الالتقاط ── */}
                <div style={{ position: 'relative', marginTop: 'auto', paddingBottom: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 2 }}>
                  {cameraRecording && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: '4px 12px' }}>
                      <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' }} />
                      <span style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 600 }}>
                        {formatCameraTime(cameraRecordingSeconds)}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, width: '100%' }}>
                    {/* مكتبة الصور — مدخل واحد لاختيار صورة أو فيديو */}
                    <label
                      htmlFor="home-camera-gallery-input"
                      aria-label="اختيار صورة أو فيديو من المكتبة"
                      style={{
                        width: 46, height: 46, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.22)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <Images size={20} />
                    </label>

                    {/* زر الالتقاط: نقرة = صورة، ضغط مطوّل = فيديو */}
                    <button
                      type="button"
                      aria-label={cameraRecording ? 'إيقاف التسجيل' : 'التقاط صورة أو تسجيل فيديو'}
                      onPointerDown={handleCaptureStart}
                      onPointerUp={handleCaptureEnd}
                      onPointerLeave={() => { if (cameraRecording) handleCaptureEnd(); }}
                      style={{
                        width: 82, height: 82, borderRadius: '50%',
                        background: cameraRecording ? 'rgba(59,130,246,0.25)' : 'transparent',
                        border: `4.5px solid ${cameraRecording ? '#3b82f6' : '#fff'}`,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    />

                    {/* عنصر بديل بنفس عرض زر المكتبة لموازنة التخطيط */}
                    <div style={{ width: 46, height: 46 }} />
                  </div>

                  <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.68rem', margin: 0 }}>
                    اضغط للصورة • اضغط مطولاً للفيديو
                  </p>

                  <input
                    id="home-camera-gallery-input"
                    ref={cameraGalleryInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                    onClick={e => { e.currentTarget.value = ''; }}
                    onChange={e => {
                      handleHomeGalleryPick(e.currentTarget.files ?? undefined);
                      e.currentTarget.value = '';
                    }}
                  />
                </div>
              </>
            ) : (
              <>
            <div style={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 18,
            }}>
                {cameraPreviewType === 'video' ? (
                  <video
                    src={cameraPreviewUrl}
                    muted
                    playsInline
                    autoPlay
                    loop
                    controls={false}
                    onLoadedData={e => { e.currentTarget.play().catch(() => {}); }}
                    style={{ width: '100%', maxWidth: 420, maxHeight: '72dvh', borderRadius: 24, objectFit: 'contain', background: '#000' }}
                  />
                ) : (
                  <img
                    src={cameraPreviewUrl}
                    alt="Captured"
                    style={{ width: '100%', maxWidth: 420, maxHeight: '72dvh', borderRadius: 24, objectFit: 'contain' }}
                  />
                )}
            </div>
            <div style={{
              padding: '12px 20px calc(18px + env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(5,9,9,0.98)',
            }}>
                {cameraPublishError && (
                  <p style={{ color: '#f87171', fontSize: '0.72rem', textAlign: 'center', margin: '0 0 4px', maxWidth: 420 }}>
                    {cameraPublishError}
                  </p>
                )}
                <div style={{ width: '100%', maxWidth: 420, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void retakeHomeMedia()}
                    disabled={cameraPublishing}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff', fontWeight: 700, cursor: cameraPublishing ? 'default' : 'pointer',
                      opacity: cameraPublishing ? 0.5 : 1,
                    }}
                  >
                    إعادة التصوير
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishHomeStory()}
                    disabled={cameraPublishing}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 12,
                      background: 'rgba(0,188,212,0.14)',
                      border: '1px solid rgba(0,188,212,0.45)',
                      color: '#00BCD4', fontWeight: 800, cursor: cameraPublishing ? 'default' : 'pointer',
                      opacity: cameraPublishing ? 0.7 : 1,
                    }}
                  >
                    {cameraPublishing ? 'جاري النشر...' : cameraMediaFiles.length > 1 ? `نشر ${cameraMediaFiles.length} بوستات` : 'نشر البوست'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraOpen(false);
                      // The media remains available in the camera preview until closed; the public-post composer
                      // is opened separately from the post section to keep story publishing isolated.
                    }}
                    disabled={cameraPublishing}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 12,
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      color: '#fbbf24', fontWeight: 700, cursor: cameraPublishing ? 'default' : 'pointer',
                      opacity: cameraPublishing ? 0.7 : 1,
                    }}
                  >
                    إغلاق
                  </button>
                </div>
            </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Status Viewer ── */}
      <AnimatePresence>
        {viewerGroupIdx !== null && statusGroups.length > 0 && (
          <StatusViewer
            groups={statusGroups}
            startGroupIndex={viewerGroupIdx}
            myId={statusMyId}
            onClose={() => setViewerGroupIdx(null)}
            onSeen={(userId, statusId) => {
              setStatusGroups(prev => prev.map(g =>
                g.userId === userId
                  ? { ...g, items: g.items.map(i => i.id === statusId ? { ...i, seen: true } : i) }
                  : g
              ));
            }}
            onDeleted={(deletedId) => {
              setStatusGroups(prev => prev.map(g => ({
                ...g,
                items: g.items.filter(i => i.id !== deletedId),
              })).filter(g => g.items.length > 0));
            }}
          />
        )}
      </AnimatePresence>
      {/* Whisper friend picker modal — kept for legacy broadcast use */}
      {/* ── Floating self-destructing voice note notification ── */}
      <AnimatePresence>
        {floatingNote && (
          <motion.div
            key={floatingNote.id}
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
            style={{
              position: 'fixed',
              top: 18,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              minWidth: 240,
              maxWidth: 320,
              background: 'rgba(10,18,30,0.92)',
              border: `1.5px solid ${floatingNote.isSelf ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.75)'}`,
              borderRadius: 20,
              backdropFilter: 'blur(18px)',
              boxShadow: `0 8px 40px rgba(0,188,212,0.22), 0 2px 12px rgba(0,0,0,0.5)`,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              pointerEvents: 'none',
            }}
          >
            {/* Mic icon pulsing */}
            <motion.div
              animate={floatingNote.playing ? { scale: [1, 1.18, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 0.4 }}
              transition={{ duration: 0.7, repeat: floatingNote.playing ? Infinity : 0 }}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: floatingNote.isSelf ? 'rgba(0,188,212,0.18)' : 'rgba(0,188,212,0.25)',
                border: '1.5px solid rgba(0,188,212,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Mic size={16} color="#00BCD4" />
            </motion.div>
            {/* Text + waveform */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{
                  color: floatingNote.isSelf ? 'rgba(0,188,212,0.85)' : '#00BCD4',
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {floatingNote.isSelf ? 'أنت' : floatingNote.senderName}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem' }}>
                  {floatingNote.isSelf ? '· يُرسَل الآن' : '· رسالة صوتية'}
                </span>
                {floatingNote.duration > 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.58rem', marginLeft: 'auto' }}>
                    {floatingNote.duration}s
                  </span>
                )}
              </div>
              {/* Animated waveform bars */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
                {floatingNote.levels.map((lvl, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: floatingNote.playing ? `${Math.max(6, lvl * 28)}px` : '4px' }}
                    transition={{ duration: 0.08, ease: 'easeOut' }}
                    style={{
                      width: 4,
                      borderRadius: 3,
                      background: floatingNote.playing
                        ? `rgba(0,188,212,${0.5 + lvl * 0.5})`
                        : 'rgba(0,188,212,0.25)',
                      minHeight: 4,
                      alignSelf: 'center',
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Call swipe-up sheet ── */}
      <AnimatePresence>
        {callSheetOpen && (
          <CallSwipeSheet
            progress={callSheetProgress}
            onCancel={closeCallSheet}
            labelColor={t.labelColor}
          />
        )}
      </AnimatePresence>
      {/* ── Global music player — hidden <audio>, stays mounted so playback survives closing the
           search box or navigating within the app; only stops when the user taps the stop button ── */}
      <audio
        ref={musicAudioRef}
        onEnded={() => setMusicIsPlaying(false)}
        onPause={() => setMusicIsPlaying(false)}
        onPlay={() => setMusicIsPlaying(true)}
        style={{ display: 'none' }}
      />
      {/* ── Music search modal ── */}
      <AnimatePresence>
        {musicModalOpen && (
          <MusicSearchModal
            onClose={() => setMusicModalOpen(false)}
            currentTrack={musicCurrentTrack}
            isPlaying={musicIsPlaying}
            onPlayTrack={handleMusicPlayTrack}
            favorites={musicFavorites}
            onToggleFavorite={handleMusicToggleFavorite}
          />
        )}
      </AnimatePresence>
      {/* ── Mini music bar — shown whenever a track is loaded, even after closing the search box,
           so the user can pause/resume or fully stop it with one tap. Docked as a full-width strip
           at the very top of the screen (the header), not a floating center overlay. ── */}
      <AnimatePresence>
        {musicCurrentTrack && !musicModalOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0,
              zIndex: 10000,
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%',
              padding: '10px 16px',
              background: 'linear-gradient(90deg, rgba(4,10,10,0.97) 0%, rgba(0,30,35,0.97) 50%, rgba(4,10,10,0.97) 100%)',
              borderBottom: '1.5px solid rgba(0,188,212,0.4)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {musicCurrentTrack.artwork ? (
              <img src={musicCurrentTrack.artwork} alt="" width={30} height={30} style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
            ) : (
              <Music size={16} color="#00BCD4" style={{ flexShrink: 0 }} />
            )}
            <div
              role="presentation"
              onClick={() => setMusicModalOpen(true)}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <div style={{ color: '#fff', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {musicCurrentTrack.title}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.58rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {musicCurrentTrack.artist}
              </div>
            </div>
            <button
              onClick={() => handleMusicPlayTrack(musicCurrentTrack)}
              style={{
                background: 'rgba(0,188,212,0.15)', border: '1px solid rgba(0,188,212,0.4)',
                borderRadius: '50%', width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {musicIsPlaying ? <Pause size={12} color="#00BCD4" /> : <Play size={12} color="#00BCD4" style={{ marginRight: -1 }} />}
            </button>
            <button
              onClick={handleMusicStop}
              title="إيقاف"
              style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: '50%', width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={13} color="#ef4444" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}