/**
 * Stooorna Ai — Publish to Templates (v1.3.0)
 * Place at: src/ai/mediaPublish.ts
 *
 * Uploads an edited photo / video (with its music + sound) and posts it to the Templates store,
 * exactly like the Templates studio does (same row format, same "TPL" marker).
 *
 * v1.3.0 — "preview size" publishing:
 *   - Photo  -> small 1280px JPEG (about 150-300 KB).
 *   - Video  -> light copy (max 720px, ~1 Mbps, sound kept) made in the background while the preview box is open.
 *   - Small files go as ONE JSON request to /api/live-chat/media (the route the server really has), with real upload progress.
 *   - Cancel works at once (AbortSignal stops the preparation and the upload).
 *   - No more re-uploading the big file to 10 other routes (that was the "stuck at 89%").
 */
import { postTemplateRow, markTemplatePending } from '@/lib/liveTemplatesStore';
import { mediaAiIsBrokenHostUrl } from '@/lib/mediaAiPatch';

export interface PublishUser {
  id?: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  image?: string | null;
}

const LIVE_VIDEO_CAPTION = '🎬 AI Video'; // same markers the Templates gallery already uses
const LIVE_PHOTO_CAPTION = '🖼 Photo';
const LIVE_TPL_SUFFIX = '\u200b\u200bTPL';

export type PublishProgress = (percent: number, stage: 'upload' | 'post' | 'done') => void;

const JSON_LIMIT = 8_000_000; // server JSON body limit is 12 MB; base64 adds 33%
const EP_KEY = 'stooorna_pub_ep_v1'; // remembers the multipart route that worked
const readEp = (): string => { try { return localStorage.getItem(EP_KEY) || ''; } catch { return ''; } };
const saveEp = (v: string) => { try { localStorage.setItem(EP_KEY, v); } catch { /* */ } };

const abortErr = () => new Error('aborted');
const checkAbort = (s?: AbortSignal) => { if (s?.aborted) throw abortErr(); };

const toAbs = (u: string): string => {
  const s = String(u).trim();
  if (/^(https?:|blob:|data:)/i.test(s)) return s;
  try { return new URL(s.startsWith('/') ? s : `/${s}`, window.location.origin).href; } catch { return s; }
};
const usable = (u: string): string | null => (!u || mediaAiIsBrokenHostUrl(u) || /airo-assets/i.test(u) ? null : u);
const validUrl = (u: unknown): u is string => typeof u === 'string' && /^(https?:\/\/|\/)/i.test(u.trim());

/** Looks for the media URL anywhere in a JSON answer (any key name). */
function deepUrl(o: any, depth = 0): string | null {
  if (depth > 4 || o == null) return null;
  if (typeof o === 'string') return validUrl(o) && !/^data:/i.test(o) && o.trim().length > 2 ? o.trim() : null;
  if (Array.isArray(o)) { for (const x of o) { const r = deepUrl(x, depth + 1); if (r) return r; } return null; }
  if (typeof o === 'object') {
    for (const k of ['url', 'mediaUrl', 'fileUrl', 'imageUrl', 'videoUrl', 'publicUrl', 'path', 'src', 'location']) {
      const r = deepUrl(o[k], depth + 1); if (r) return r;
    }
    for (const k of Object.keys(o)) { const r = deepUrl(o[k], depth + 1); if (r) return r; }
  }
  return null;
}

function pickUrl(ct: string, loc: string | null, raw: string): string | null {
  if (validUrl(loc)) return usable(toAbs(loc));
  if (ct.includes('json') || /^\s*[{[]/.test(raw)) {
    try { const u = deepUrl(JSON.parse(raw)); return u ? usable(toAbs(u)) : null; } catch { return null; }
  }
  const first = raw.trim().split(/\s/)[0];
  return validUrl(first) ? usable(toAbs(first)) : null;
}

/** Photo -> small JPEG (max side `maxSide`). Smaller photos are left alone. */
async function shrinkImage(blob: Blob, maxSide = 1280, q = 0.82): Promise<Blob> {
  try {
    if (!/^image\//.test(blob.type) || /gif|svg/.test(blob.type) || blob.size < 250 * 1024) return blob;
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext('2d');
    if (!ctx) return blob;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    (bmp as any).close?.();
    const out: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    return out && out.size < blob.size ? out : blob;
  } catch { return blob; }
}

/**
 * Video -> light preview copy (max 720px, ~1 Mbps, sound kept). Runs in real time (as long as the clip),
 * in the background while the preview box is open. Any problem -> the original video is returned.
 */
async function makeLightVideo(blob: Blob, onPct: (f: number) => void, signal?: AbortSignal): Promise<Blob> {
  const MR: any = (window as any).MediaRecorder;
  if (!MR || blob.size < 2_500_000) return blob;
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find(m => MR.isTypeSupported?.(m));
  if (!mime) return blob;

  return new Promise<Blob>(resolve => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.src = url;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);

    let ac: AudioContext | null = null;
    let rec: any = null;
    let raf = 0;
    let timer = 0;
    let done = false;
    const chunks: Blob[] = [];

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* */ }
      try { v.pause(); } catch { /* */ }
      try { ac?.close(); } catch { /* */ }
      v.remove();
      URL.revokeObjectURL(url);
      signal?.removeEventListener('abort', giveUp);
    };
    const finish = (out: Blob) => { if (done) return; done = true; cleanup(); resolve(out); };
    const giveUp = () => finish(blob);
    signal?.addEventListener('abort', giveUp, { once: true });
    v.onerror = giveUp;

    v.onloadeddata = () => {
      try {
        const sw = v.videoWidth || 720, sh = v.videoHeight || 1280;
        const k = Math.min(1, 720 / Math.max(sw, sh));
        const w = Math.max(2, Math.round((sw * k) / 2) * 2);
        const h = Math.max(2, Math.round((sh * k) / 2) * 2);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return giveUp();
        const tracks: MediaStreamTrack[] = [...(canvas as any).captureStream(30).getVideoTracks()];
        try { // sound goes only into the recording, never to the speaker
          ac = new AudioContext();
          void ac.resume();
          const src = ac.createMediaElementSource(v);
          const dest = ac.createMediaStreamDestination();
          src.connect(dest);
          tracks.push(...dest.stream.getAudioTracks());
        } catch { /* video without sound is still better than no video */ }
        rec = new MR(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 96_000 });
        rec.ondataavailable = (e: any) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => finish(new Blob(chunks, { type: mime.split(';')[0] }));
        const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 30;
        const draw = () => {
          ctx.drawImage(v, 0, 0, w, h);
          onPct(Math.min(0.99, v.currentTime / dur));
          raf = requestAnimationFrame(draw);
        };
        v.onended = () => { onPct(1); try { rec.stop(); } catch { giveUp(); } };
        timer = window.setTimeout(giveUp, dur * 1000 * 1.6 + 15000);
        rec.start(1000);
        draw();
        void v.play().catch(giveUp);
      } catch { giveUp(); }
    };
  });
}

/** One upload request with: real upload progress, abort, and a watchdog (gives up only when nothing moves). */
function sendRequest(
  endpoint: string,
  body: FormData | string,
  contentType: string | null,
  onPct: ((f: number) => void) | undefined,
  signal: AbortSignal | undefined,
  note: (why: string) => void,
): Promise<string | null> {
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    let settled = false;
    let wd = 0;
    const done = (v: string | null, why?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(wd);
      signal?.removeEventListener('abort', onAbort);
      if (why) note(why);
      resolve(v);
    };
    const onAbort = () => { try { x.abort(); } catch { /* */ } done(null, 'aborted'); };
    const arm = (ms: number) => { window.clearTimeout(wd); wd = window.setTimeout(() => { try { x.abort(); } catch { /* */ } done(null, `${endpoint} stalled`); }, ms); };
    if (signal?.aborted) return done(null, 'aborted');
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      x.open('POST', endpoint);
      x.withCredentials = true;
      if (contentType) x.setRequestHeader('Content-Type', contentType);
      arm(30000);
      x.upload.onprogress = ev => {
        arm(30000);
        if (onPct && ev.lengthComputable && ev.total > 0) onPct(Math.min(0.99, ev.loaded / ev.total));
      };
      x.upload.onload = () => arm(60000); // all bytes sent -> the server has up to 60s to answer
      x.onload = () => {
        if (x.status < 200 || x.status >= 300) return done(null, `${endpoint} ${x.status}`);
        const u = pickUrl(x.getResponseHeader('content-type') || '', x.getResponseHeader('location'), x.responseText);
        done(u, u ? undefined : `${endpoint} no-url`);
      };
      x.onerror = () => done(null, `${endpoint} network`);
      x.ontimeout = () => done(null, `${endpoint} timeout`);
      x.send(body as any);
    } catch (e: any) { done(null, String(e?.message || e)); }
  });
}

const readDataUrl = (blob: Blob) =>
  new Promise<string | null>(res => {
    const r = new FileReader();
    r.onloadend = () => res(typeof r.result === 'string' && r.result.startsWith('data:') ? r.result : null);
    r.onerror = () => res(null);
    r.readAsDataURL(blob);
  });

async function uploadMedia(blob: Blob, userId: string, isVid: boolean, onPct?: (f: number) => void, signal?: AbortSignal): Promise<string> {
  const type = (blob.type || '').split(';')[0] || (isVid ? 'video/mp4' : 'image/jpeg');
  const ext = isVid ? (/webm/i.test(type) ? 'webm' : 'mp4') : (/png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg');
  const name = `live-chat-${isVid ? 'video' : 'image'}-${Date.now()}.${ext}`;
  const file = new File([blob], name, { type });
  let lastErr = '';
  const note = (w: string) => { lastErr = w; };

  // 1) ONE JSON request (data URL) to the live-chat media route — fast, and the server really has it.
  if (blob.size > 0 && blob.size < JSON_LIMIT) {
    const dataUrl = await readDataUrl(file);
    checkAbort(signal);
    if (dataUrl) {
      const hit = await sendRequest(
        '/api/live-chat/media',
        JSON.stringify({ id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, userId, kind: isVid ? 'video' : 'image', media: dataUrl, noStory: 1 }),
        'application/json', onPct, signal, note,
      );
      checkAbort(signal);
      if (hit && !/^blob:/i.test(hit)) { onPct?.(1); return hit; }
    }
  }

  // 2) multipart routes (kept as fallbacks, remembered route first)
  const form = (field: string) => {
    const fd = new FormData();
    fd.append(field, file, name);
    fd.append('userId', userId);
    fd.append('kind', isVid ? 'video' : 'image');
    fd.append('type', isVid ? 'video' : 'image');
    fd.append('mediaType', isVid ? 'video' : 'image');
    fd.append('destination', 'live-chat');
    fd.append('scope', 'live-chat');
    fd.append('channel', 'live-chat');
    fd.append('noStory', '1');
    fd.append('createStory', 'false');
    fd.append('story', '0');
    fd.append('skipStory', '1');
    return fd;
  };
  const endpoints: Array<[string, string]> = [
    ['/api/chat-images', 'file'],
    ['/api/live-chat/upload', 'file'],
    [isVid ? '/api/live-chat/video' : '/api/live-chat/image', 'file'],
    ['/api/upload', 'file'],
    ['/api/media', 'file'],
    ['/api/files/upload', 'file'],
    ['/api/posts/media', 'file'],
  ];
  const last = readEp();
  const ordered = last
    ? [...endpoints.filter(e => `${e[0]}|${e[1]}` === last), ...endpoints.filter(e => `${e[0]}|${e[1]}` !== last)]
    : endpoints;
  for (const [ep, field] of ordered) {
    checkAbort(signal);
    const hit = await sendRequest(ep, form(field), null, onPct, signal, note);
    checkAbort(signal);
    if (hit && !/^blob:/i.test(hit)) { saveEp(`${ep}|${field}`); onPct?.(1); return hit; }
  }
  throw new Error(lastErr || 'upload failed');
}

/**
 * Step 1: make the small "preview size" copy + upload it (can start early, e.g. while the preview box is open).
 * Progress: video 0-45% preparing, 45-92% upload; photo 0-6% preparing, 6-92% upload. Resolves to the media URL.
 */
export async function startTemplateUpload(
  blob: Blob,
  user: PublishUser | null | undefined,
  kind: 'image' | 'video',
  onProgress?: PublishProgress,
  signal?: AbortSignal,
): Promise<string> {
  const uid = String(user?.id || '');
  if (!uid) throw new Error('not signed in');
  let top = 0;
  const report = (p: number) => { top = Math.max(top, p); onProgress?.(Math.round(top), 'upload'); };
  report(1);
  const isVid = kind === 'video';
  const heavy = isVid && blob.size > 2_500_000;
  const prepEnd = heavy ? 45 : 6;
  let light: Blob = blob;
  if (heavy) {
    const out = await makeLightVideo(blob, f => report(1 + f * (prepEnd - 1)), signal);
    if (out.size > 0 && out.size < blob.size) light = out;
  } else if (!isVid) {
    light = await shrinkImage(blob);
  }
  checkAbort(signal);
  report(prepEnd);
  return uploadMedia(light, uid, isVid, f => report(prepEnd + f * (92 - prepEnd)), signal);
}

/** Upload (or reuse an upload already started with startTemplateUpload) + post to Templates. Throws on failure. */
export async function publishToTemplates(
  blob: Blob,
  user: PublishUser | null | undefined,
  kind: 'image' | 'video',
  onProgress?: PublishProgress,
  preUpload?: Promise<string> | null,
  signal?: AbortSignal,
): Promise<void> {
  const uid = String(user?.id || '');
  if (!uid) throw new Error('not signed in');
  const url = await (preUpload || startTemplateUpload(blob, user, kind, onProgress, signal));
  checkAbort(signal);
  onProgress?.(95, 'post');
  const row = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: uid,
    name: user?.name || user?.username || null,
    username: user?.username || null,
    avatarUrl: user?.avatarUrl || user?.image || null,
    text: (kind === 'video' ? LIVE_VIDEO_CAPTION : LIVE_PHOTO_CAPTION) + LIVE_TPL_SUFFIX,
    imageUrl: url,
    voiceUrl: null,
    voiceDuration: null,
    likes: [] as string[],
    createdAt: Date.now(),
  };
  markTemplatePending(row.id);
  await postTemplateRow(row as any);
  onProgress?.(100, 'done');
  try {
    localStorage.setItem('stooorna_tpl_fresh_at', String(Date.now()));
    window.dispatchEvent(new CustomEvent('stooorna:template-published'));
  } catch { /* */ }
}
