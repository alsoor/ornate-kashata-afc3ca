/**
 * Stooorna Ai — Music search (v1.0.0)
 * Place at: src/ai/musicSearch.ts
 *
 * Two sources, searched together (no API key needed):
 *   - "songs"  : iTunes Search API  -> real songs / artists (30-second previews)
 *   - "free"   : Openverse audio    -> free-licence music (CC), usually full tracks
 * Used by MediaEditor to attach music to a photo / video.
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  art?: string;
  preview: string; // audio file url
  source: 'songs' | 'free';
  duration?: number; // seconds (0 / undefined = unknown)
  license?: string;
}

export type MusicSource = 'all' | 'songs' | 'free';

async function getJson(url: string, ms = 12000): Promise<any> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? window.setTimeout(() => ctrl.abort(), ms) : 0;
  try {
    const r = await fetch(url, { signal: ctrl?.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    if (t) window.clearTimeout(t);
  }
}

async function searchItunes(q: string): Promise<Track[]> {
  const enc = encodeURIComponent(q);
  const urls = [`https://itunes.apple.com/search?term=${enc}&media=music&entity=song&limit=30`];
  if (/[\u0600-\u06FF]/.test(q)) urls.push(`https://itunes.apple.com/search?term=${enc}&media=music&entity=song&limit=30&country=KW`);
  const out: Track[] = [];
  const seen = new Set<string>();
  const settled = await Promise.allSettled(urls.map(u => getJson(u)));
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const r of s.value?.results || []) {
      if (!r.previewUrl || seen.has(String(r.trackId))) continue;
      seen.add(String(r.trackId));
      out.push({
        id: `it-${r.trackId}`,
        title: String(r.trackName || ''),
        artist: String(r.artistName || ''),
        art: r.artworkUrl100 ? String(r.artworkUrl100) : undefined,
        preview: String(r.previewUrl),
        source: 'songs',
        duration: 30,
      });
    }
  }
  if (!out.length && settled.every(s => s.status === 'rejected')) throw new Error('songs unavailable');
  return out;
}

async function searchOpenverse(q: string): Promise<Track[]> {
  const j = await getJson(`https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&page_size=20&category=music`);
  const out: Track[] = [];
  for (const r of j?.results || []) {
    const url = r.url || r.audio_set?.url;
    if (!url) continue;
    out.push({
      id: `ov-${r.id}`,
      title: String(r.title || 'Untitled'),
      artist: String(r.creator || 'Unknown'),
      art: r.thumbnail ? String(r.thumbnail) : undefined,
      preview: String(url),
      source: 'free',
      duration: r.duration ? Math.round(Number(r.duration) / 1000) : undefined,
      license: r.license ? String(r.license).toUpperCase() : undefined,
    });
  }
  return out;
}

/** Search songs and free music. Results are interleaved so both kinds show up near the top. */
export async function searchMusic(q: string, source: MusicSource = 'all'): Promise<Track[]> {
  const query = q.trim();
  if (!query) return [];
  const jobs: Array<Promise<Track[]>> = [];
  if (source !== 'free') jobs.push(searchItunes(query));
  if (source !== 'songs') jobs.push(searchOpenverse(query));
  const settled = await Promise.allSettled(jobs);
  const lists = settled.filter((s): s is PromiseFulfilledResult<Track[]> => s.status === 'fulfilled').map(s => s.value);
  if (!lists.length) throw new Error('music search unavailable');
  const merged: Track[] = [];
  const max = Math.max(...lists.map(l => l.length));
  for (let i = 0; i < max; i++) lists.forEach(l => { if (l[i]) merged.push(l[i]); });
  return merged;
}

/**
 * Download the audio bytes (needed to mix it into the saved video).
 * Tries the file directly, then through the app's own proxy (same one used for photos).
 */
export async function fetchAudioBlob(url: string): Promise<Blob> {
  const enc = encodeURIComponent(url);
  const tries = [url, `/api/image-proxy?url=${enc}`, `https://www.stooorna.com/api/image-proxy?url=${enc}`];
  for (const t of tries) {
    try {
      const r = await fetch(t);
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size > 2000 && !/^text\/|json|html/.test(b.type || '')) {
        return b.type ? b : new Blob([b], { type: 'audio/mpeg' });
      }
    } catch { /* try next */ }
  }
  throw new Error('audio not reachable');
}
