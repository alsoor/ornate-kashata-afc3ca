/**
 * Stooorna Ai — Publish to Templates (v1.0.0)
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

async function uploadMedia(blob: Blob, userId: string, isVid: boolean): Promise<string> {
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
  for (const [ep, field, ms] of endpoints) {
    const hit = await post(ep, form(field), ms);
    if (hit && !/^blob:/i.test(hit)) return hit;
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
export async function publishToTemplates(blob: Blob, user: PublishUser | null | undefined, kind: 'image' | 'video'): Promise<void> {
  const uid = String(user?.id || '');
  if (!uid) throw new Error('not signed in');
  const url = await uploadMedia(blob, uid, kind === 'video');
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
  try {
    localStorage.setItem('stooorna_tpl_fresh_at', String(Date.now()));
    window.dispatchEvent(new CustomEvent('stooorna:template-published'));
  } catch { /* */ }
}
