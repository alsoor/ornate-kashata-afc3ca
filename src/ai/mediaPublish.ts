/**
 * Stooorna Ai — Publish to Templates (v1.1.0)
 * Place at: src/ai/mediaPublish.ts
 *
 * Uploads an edited photo / video (with its music + sound) and posts it to the Templates store,
 * exactly like the Templates studio does (same upload routes, same row format, same "TPL" marker).
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

const EP_KEY = 'stooorna_pub_ep_v1'; // remembers the upload route that worked, so the next publish goes straight to it
const readEp = (): string => { try { return localStorage.getItem(EP_KEY) || ''; } catch { return ''; } };
const saveEp = (v: string) => { try { localStorage.setItem(EP_KEY, v); } catch { /* */ } };

const toAbs = (u: string): string => {
  const s = String(u).trim();
  if (/^(https?:|blob:|data:)/i.test(s)) return s;
  try { return new URL(s.startsWith('/') ? s : `/${s}`, window.location.origin).href; } catch { return s; }
};
const usable = (u: string): string | null => (!u || mediaAiIsBrokenHostUrl(u) || /airo-assets/i.test(u) ? null : u);
const validUrl = (u: unknown): u is string => typeof u === 'string' && /^(https?:\/\/|\/)/i.test(u.trim());

function pickUrl(ct: string, loc: string | null, raw: string): string | null {
  if (validUrl(loc)) return usable(toAbs(loc));
  if (ct.includes('json') || /^\s*[{[]/.test(raw)) {
    try {
      const d = JSON.parse(raw) as any;
      for (const u of [d?.url, d?.mediaUrl, d?.fileUrl, d?.path, d?.publicUrl, d?.src, d?.data?.url, d?.result?.url, d?.file?.url, d?.media?.url, d?.location]) {
        if (typeof u === 'string' && u.trim().length > 2) { const a = usable(toAbs(u)); if (a) return a; }
      }
    } catch { /* */ }
    return null;
  }
  const first = raw.trim().split(/\s/)[0];
  return validUrl(first) ? usable(toAbs(first)) : null;
}

async function uploadMedia(blob: Blob, userId: string, isVid: boolean, onPct?: (p: number) => void): Promise<string> {
  const type = (blob.type || '').split(';')[0] || (isVid ? 'video/mp4' : 'image/jpeg');
  const ext = isVid ? (/webm/i.test(type) ? 'webm' : 'mp4') : (/png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg');
  const name = `live-chat-${isVid ? 'video' : 'image'}-${Date.now()}.${ext}`;
  const file = new File([blob], name, { type });
  let lastErr = '';

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
  const post = (endpoint: string, body: FormData, ms: number) =>
    new Promise<string | null>(resolve => {
      const x = new XMLHttpRequest();
      let settled = false;
      const done = (v: string | null, why?: string) => { if (settled) return; settled = true; if (why) lastErr = why; resolve(v); };
      try {
        x.open('POST', endpoint);
        x.withCredentials = true;
        x.timeout = ms;
        if (x.upload && onPct) x.upload.onprogress = ev => { if (ev.lengthComputable && ev.total > 0) onPct(Math.min(0.99, ev.loaded / ev.total)); };
        x.onload = () => {
          if (x.status < 200 || x.status >= 300) { done(null, `${endpoint} ${x.status}`); return; }
          done(pickUrl(x.getResponseHeader('content-type') || '', x.getResponseHeader('location'), x.responseText));
        };
        x.onerror = () => done(null, `${endpoint} network`);
        x.ontimeout = () => done(null, `${endpoint} timeout`);
        x.send(body);
      } catch (e: any) { done(null, String(e?.message || e)); }
    });

  const endpoints: Array<[string, string, number]> = [
    ['/api/chat-images', 'file', 60000],
    ['/api/live-chat/media', 'file', 60000],
    ['/api/live-chat/media', 'media', 60000],
    ['/api/live-chat/upload', 'file', 60000],
    [isVid ? '/api/live-chat/video' : '/api/live-chat/image', 'file', 60000],
    ['/api/video-swap', 'file', 60000],
    ['/api/upload', 'file', 60000],
    ['/api/media', 'file', 60000],
    ['/api/files/upload', 'file', 60000],
    ['/api/posts/media', 'file', 60000],
    ['/api/posts/media', 'media', 60000],
  ];
  // the route that worked last time goes first (saves re-uploading the whole file to routes that refuse it)
  const last = readEp();
  const ordered = last
    ? [...endpoints.filter(e => `${e[0]}|${e[1]}` === last), ...endpoints.filter(e => `${e[0]}|${e[1]}` !== last)]
    : endpoints;
  for (const [ep, field, ms] of ordered) {
    const hit = await post(ep, form(field), ms);
    if (hit && !/^blob:/i.test(hit)) { saveEp(`${ep}|${field}`); onPct?.(1); return hit; }
  }

  // small files: JSON body with a data URL (same last resort the studio uses)
  if (blob.size > 0 && blob.size < 4_500_000) {
    const dataUrl = await new Promise<string | null>(res => {
      const r = new FileReader();
      r.onloadend = () => res(typeof r.result === 'string' && r.result.startsWith('data:') ? r.result : null);
      r.onerror = () => res(null);
      r.readAsDataURL(file);
    });
    if (dataUrl) {
      for (const path of ['/api/chat-images', '/api/live-chat/media', '/api/live-chat/video', '/api/live-chat/upload']) {
        try {
          const r = await fetch(path, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: `up_${Date.now()}`, userId, kind: isVid ? 'video' : 'image', video: isVid ? dataUrl : undefined, image: !isVid ? dataUrl : undefined, media: dataUrl, file: dataUrl, noStory: 1 }),
          });
          if (!r.ok) continue;
          const d: any = await r.json();
          const u = String(d?.url || d?.mediaUrl || d?.fileUrl || '');
          if (validUrl(u)) { const a = usable(toAbs(u)); if (a) return a; }
        } catch { /* next */ }
      }
    }
  }
  throw new Error(lastErr || 'upload failed');
}

/** Upload + post to Templates. Throws on failure. */
export async function publishToTemplates(
  blob: Blob,
  user: PublishUser | null | undefined,
  kind: 'image' | 'video',
  onProgress?: PublishProgress,
): Promise<void> {
  const uid = String(user?.id || '');
  if (!uid) throw new Error('not signed in');
  // 0-90% = upload, 90-99% = posting the row, 100% = done. Never goes backwards (a retry on another route restarts from 0 inside).
  let top = 0;
  const report = (p: number, stage: 'upload' | 'post' | 'done') => { top = Math.max(top, p); onProgress?.(Math.round(top), stage); };
  report(1, 'upload');
  const url = await uploadMedia(blob, uid, kind === 'video', f => report(1 + f * 89, 'upload'));
  report(92, 'post');
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
  report(100, 'done');
  try {
    localStorage.setItem('stooorna_tpl_fresh_at', String(Date.now()));
    window.dispatchEvent(new CustomEvent('stooorna:template-published'));
  } catch { /* */ }
}
