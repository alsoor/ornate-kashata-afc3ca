import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Heart, Volume2, VolumeX, X, Play, Pause } from 'lucide-react';
import {
  getVipFeats,
  getVipMaxSpeakers,
  isVip,
  readVipFavs,
  saveVipFav,
} from '@/lib/vipPatch';
import { publishLiveSignal, postLiveSignalHttp, subscribeLiveSignals } from '@/lib/liveRoomStage';

type Track = { id: string; title: string; artist?: string; url: string };

function liveChannel(hostId: string) {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return clean ? `stooorna-live-${clean}` : 'stooorna-live';
}

export function LiveVipDock({
  hostId,
  currentUserId,
}: {
  hostId?: string | null;
  currentUserId?: string | null;
}) {
  const vipHost = isVip(hostId);
  const feats = getVipFeats(hostId);
  const cap = getVipMaxSpeakers(hostId);
  const canMusic = vipHost;
  const isHost = !!currentUserId && String(currentUserId) === String(hostId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [musicVol, setMusicVol] = useState(0.55);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channel = useMemo(() => (hostId ? liveChannel(hostId) : ''), [hostId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).getVipMaxSpeakers = getVipMaxSpeakers;
    (window as any).__stooornaVipMicCap = cap;
    window.dispatchEvent(new CustomEvent('stooorna:vip-mic-cap', { detail: { hostId, cap } }));
  }, [hostId, cap]);

  useEffect(() => {
    if (!channel) return;
    return subscribeLiveSignals(channel, (msg) => {
      if (msg.t !== 'vip-music') return;
      const url = String((msg as any).url || '');
      const title = String((msg as any).title || 'Track');
      if (!url) {
        setTrack(null);
        setPlaying(false);
        audioRef.current?.pause();
        return;
      }
      const next = { id: String((msg as any).id || url), title, url, artist: String((msg as any).artist || '') };
      setTrack(next);
      setPlaying(true);
    });
  }, [channel]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : musicVol;
    if (track && playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [track, playing, musicVol, muted]);

  function broadcast(next: Track | null) {
    if (!channel) return;
    const payload = next
      ? { t: 'vip-music', id: next.id, title: next.title, artist: next.artist, url: next.url, at: Date.now() }
      : { t: 'vip-music', url: '', at: Date.now() };
    publishLiveSignal(channel, payload);
    void postLiveSignalHttp(channel, payload);
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=20`);
      const d = await r.json();
      const items: Track[] = (d.results || [])
        .filter((x: any) => x.previewUrl)
        .map((x: any) => ({
          id: String(x.trackId),
          title: String(x.trackName || 'Track'),
          artist: String(x.artistName || ''),
          url: String(x.previewUrl),
        }));
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  const favs = currentUserId ? readVipFavs(currentUserId) : [];

  if (!vipHost && !canMusic) return null;

  return (
    <div style={{ position: 'fixed', right: 14, bottom: 92, zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ fontSize: 10, color: '#eab308', fontWeight: 800 }}>Mic {cap}</div>
      {canMusic && (
        <button
          type="button"
          title="Room music"
          onClick={() => setOpen(true)}
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            border: '1.5px solid rgba(234,179,8,0.7)',
            background: 'radial-gradient(circle at 30% 30%, #ffe08a, #eab308)',
            color: '#111',
            boxShadow: '0 0 14px rgba(234,179,8,0.55)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Music size={18} />
        </button>
      )}

      {track && (
        <audio ref={audioRef} src={track.url} loop onEnded={() => setPlaying(false)} />
      )}

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: 'min(96vw, 420px)', maxHeight: '78vh', overflow: 'auto', background: '#0a1f22', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '16px 16px 0 0', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ margin: 0, color: '#eab308', fontWeight: 900 }}>Room music</p>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {isHost ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} placeholder="Song, music, or Quran" style={{ flex: 1, borderRadius: 10, border: '1px solid rgba(234,179,8,0.35)', background: 'transparent', color: '#dff', padding: '10px 12px' }} />
                <button type="button" onClick={() => void search()} style={{ border: 'none', borderRadius: 10, background: '#eab308', color: '#111', fontWeight: 800, padding: '0 12px' }}>{busy ? '...' : 'Search'}</button>
              </div>
            ) : (
              <p style={{ color: 'rgba(200,220,220,0.7)', fontSize: 12 }}>Only the host picks the track. You still hear it and can change music volume.</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
              <button type="button" onClick={() => setMuted((m) => !m)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : musicVol} onChange={(e) => { setMuted(false); setMusicVol(Number(e.target.value)); }} style={{ flex: 1 }} />
              <span style={{ color: '#eab308', fontSize: 11, width: 36 }}>{Math.round((muted ? 0 : musicVol) * 100)}</span>
            </div>
            <p style={{ margin: '0 0 10px', color: 'rgba(180,200,200,0.65)', fontSize: 11 }}>Music volume only. Voice stays unchanged.</p>

            {track && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#fff' }}>
                <button type="button" onClick={() => setPlaying((v) => !v)} style={{ background: '#eab308', border: 'none', borderRadius: 20, width: 32, height: 32 }}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{track.title}</p>
                  <p style={{ margin: 0, fontSize: 11, color: 'rgba(200,220,220,0.6)' }}>{track.artist}</p>
                </div>
                {isHost && <button type="button" onClick={() => { setTrack(null); setPlaying(false); broadcast(null); }} style={{ background: 'none', border: 'none', color: '#eab308' }}>Stop</button>}
              </div>
            )}

            {(isHost ? results : []).map((t) => (
              <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, color: '#fff', fontSize: 13 }}>{t.title}</p>
                  <p style={{ margin: 0, color: 'rgba(180,200,200,0.65)', fontSize: 11 }}>{t.artist}</p>
                </div>
                {currentUserId && (
                  <button type="button" onClick={() => saveVipFav(currentUserId, t)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Heart size={14} /></button>
                )}
                <button type="button" onClick={() => { setTrack(t); setPlaying(true); broadcast(t); }} style={{ border: 'none', borderRadius: 8, background: '#eab308', color: '#111', fontWeight: 800, padding: '6px 8px' }}>Play</button>
              </div>
            ))}

            {isHost && favs.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: '#eab308', fontWeight: 800, fontSize: 12 }}>Favorites</p>
                {favs.map((t) => (
                  <button key={t.id} type="button" onClick={() => { const full = { ...t, artist: '' }; setTrack(full); setPlaying(true); broadcast(full); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#dff', padding: '6px 0' }}>{t.title}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveVipDock;
