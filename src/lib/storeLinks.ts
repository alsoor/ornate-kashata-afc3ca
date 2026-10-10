/**
 * Store links set by the owner (settings -> User Control area):
 *  - App Store link   -> opened by the "Open App" banner on iPhone / iPad
 *  - Google Play link -> opened by the "Open App" banner on Android
 * Server route (public GET, owner-only POST):  /api/app-settings/store-links  ->  { ok, appStore, googlePlay, showBanner }
 * A local copy is kept so the owner's own device always works, even before the route answers.
 */
export type StoreKind = 'appStore' | 'googlePlay';
export type StoreLinks = { appStore: string; googlePlay: string; showBanner: boolean; showIntro: boolean; videoUrl: string };

const CACHE_KEY = 'stooorna_store_links';
const ENDPOINT = '/api/app-settings/store-links';
export const STORE_LINKS_EVENT = 'stooorna:store-links';

/** Only http(s) links are accepted. Adds https:// when the scheme is missing. Returns '' when invalid. */
export function normalizeStoreUrl(raw: unknown): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

function clean(src: any): StoreLinks {
  return {
    appStore: normalizeStoreUrl(src && src.appStore),
    googlePlay: normalizeStoreUrl(src && src.googlePlay),
    showBanner: !(src && src.showBanner === false),
    showIntro: !(src && src.showIntro === false),
    videoUrl: typeof (src && src.videoUrl) === 'string' && /^\/[^/\\]/.test(src.videoUrl) ? src.videoUrl : '',
  };
}

export function readStoreLinks(): StoreLinks {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return clean(JSON.parse(raw));
  } catch { /* ignore */ }
  return { appStore: '', googlePlay: '', showBanner: true, showIntro: true, videoUrl: '' };
}

function writeStoreLinks(next: StoreLinks) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(STORE_LINKS_EVENT, { detail: next })); } catch { /* ignore */ }
}

/** Reads the links from the server (public). Falls back to the local copy when the server does not answer. */
export async function fetchStoreLinks(): Promise<StoreLinks> {
  try {
    const r = await fetch(ENDPOINT, { credentials: 'include', cache: 'no-store' });
    if (r.ok) {
      const d: any = await r.json().catch(() => null);
      const src = d && typeof d === 'object' ? (d.links && typeof d.links === 'object' ? d.links : d) : null;
      if (src && ('appStore' in src || 'googlePlay' in src)) {
        const next = clean(src);
        const local = readStoreLinks();
        // the server answered with empty links but this device still holds saved ones (a save that never reached the server): keep them
        if (!next.appStore && !next.googlePlay && (local.appStore || local.googlePlay)) {
          next.appStore = local.appStore; next.googlePlay = local.googlePlay;
        }
        writeStoreLinks(next);
        return next;
      }
    }
  } catch { /* ignore */ }
  return readStoreLinks();
}

async function pushStoreLinks(next: StoreLinks): Promise<{ ok: boolean; synced: boolean }> {
  writeStoreLinks(next);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const d: any = r.ok ? await r.json().catch(() => null) : null;
    return { ok: true, synced: !!d && typeof d === 'object' && d.ok !== false };
  } catch {
    return { ok: true, synced: false };
  }
}

/**
 * Saves one link (an empty url deletes it). The local copy is always updated.
 * ok = the link was valid, synced = the server confirmed it.
 */
export async function setStoreLink(kind: StoreKind, url: string): Promise<{ ok: boolean; synced: boolean }> {
  const value = normalizeStoreUrl(url);
  if (String(url || '').trim() && !value) return { ok: false, synced: false };
  return pushStoreLinks({ ...readStoreLinks(), [kind]: value });
}

/** Master switch: show / hide the whole welcome video (video + "Log in" + "Open App" banners) for everybody. */
export async function setIntroShown(show: boolean): Promise<{ ok: boolean; synced: boolean }> {
  return pushStoreLinks({ ...readStoreLinks(), showIntro: show });
}

export type IntroKind = 'video' | 'image' | 'pdf';
/** What the saved welcome file is, judged by its extension. */
export function introKind(url: string): IntroKind {
  if (/\.pdf$/i.test(url)) return 'pdf';
  if (/\.(jpe?g|png|webp|gif)$/i.test(url)) return 'image';
  return 'video';
}

/** Uploads a new welcome video / image / PDF (owner only). It becomes the welcome screen for everybody. */
export async function uploadIntroVideo(file: File): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/app-settings/intro-video', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'video/mp4' },
      body: file,
    });
    const d: any = await r.json().catch(() => null);
    if (!r.ok || !d || d.ok === false) return { ok: false, error: (d && d.error) || ('HTTP ' + r.status) };
    writeStoreLinks({ ...readStoreLinks(), videoUrl: String(d.videoUrl || ''), showIntro: true });
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Goes back to the built-in /intro.mp4 video. */
export async function resetIntroVideo(): Promise<{ ok: boolean; synced: boolean }> {
  return pushStoreLinks({ ...readStoreLinks(), videoUrl: '' });
}

/** Switch: show / hide the white "Open App" banner on the welcome video. */
export async function setBannerShown(show: boolean): Promise<{ ok: boolean; synced: boolean }> {
  return pushStoreLinks({ ...readStoreLinks(), showBanner: show });
}

function platform(): 'ios' | 'android' | 'other' {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 1) return 'ios';
  return 'other';
}

/** The link the "Open App" banner should open on this device ('' = none saved for it). */
export function openAppUrl(links: StoreLinks): string {
  if (!links.showIntro || !links.showBanner) return '';
  const p = platform();
  if (p === 'ios') return links.appStore || links.googlePlay;
  if (p === 'android') return links.googlePlay || links.appStore;
  return links.googlePlay || links.appStore;
}

export function openStoreUrl(url: string) {
  const href = normalizeStoreUrl(url);
  if (!href) return;
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
