/**
 * Store links set by the owner (settings -> User Control area):
 *  - App Store link   -> opened by the "Open App" banner on iPhone / iPad
 *  - Google Play link -> opened by the "Open App" banner on Android
 * Server route (public GET, owner-only POST):  /api/app-settings/store-links  ->  { ok, appStore, googlePlay, showBanner }
 * A local copy is kept so the owner's own device always works, even before the route answers.
 */
export type StoreKind = 'appStore' | 'googlePlay';
export type IntroSlot = 'video' | 'photo' | 'pdf';
export type StoreLinks = {
  appStore: string; googlePlay: string; showBanner: boolean; showIntro: boolean;
  slots: Record<IntroSlot, string>; // one stored file per type
  active: IntroSlot | '';           // the one published as the welcome screen ('' = built-in video)
  videoUrl: string;                 // = slots[active]
};
const EMPTY_SLOTS: Record<IntroSlot, string> = { video: '', photo: '', pdf: '' };
/** How the last read of the server went: 'server' = answered with links, 'no-route' = answered with a page (route missing / not deployed), 'error' = no answer. */
export let lastFetchStatus: 'unknown' | 'server' | 'no-route' | 'error' = 'unknown';

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

function cleanIntroUrl(v: any): string {
  return typeof v === 'string' && /^\/[^/\\]/.test(v) ? v : '';
}

function clean(src: any): StoreLinks {
  const slots = {
    video: cleanIntroUrl(src && src.slots && src.slots.video),
    photo: cleanIntroUrl(src && src.slots && src.slots.photo),
    pdf: cleanIntroUrl(src && src.slots && src.slots.pdf),
  };
  const active: IntroSlot | '' = src && (src.active === 'video' || src.active === 'photo' || src.active === 'pdf') && slots[src.active as IntroSlot] ? src.active : '';
  return {
    appStore: normalizeStoreUrl(src && src.appStore),
    googlePlay: normalizeStoreUrl(src && src.googlePlay),
    showBanner: !(src && src.showBanner === false),
    showIntro: !(src && src.showIntro === false),
    slots,
    active,
    videoUrl: active ? slots[active] : '',
  };
}

export function readStoreLinks(): StoreLinks {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return clean(JSON.parse(raw));
  } catch { /* ignore */ }
  return { appStore: '', googlePlay: '', showBanner: true, showIntro: true, slots: { ...EMPTY_SLOTS }, active: '', videoUrl: '' };
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
      lastFetchStatus = d && typeof d === 'object' ? 'server' : 'no-route';
      const src = d && typeof d === 'object' ? (d.links && typeof d.links === 'object' ? d.links : d) : null;
      if (src && ('appStore' in src || 'googlePlay' in src)) {
        const next = clean(src);
        writeStoreLinks(next);
        return next;
      }
    }
  } catch { lastFetchStatus = 'error'; }
  return readStoreLinks();
}

async function pushStoreLinks(next: StoreLinks, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; synced: boolean }> {
  writeStoreLinks(next);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appStore: next.appStore, googlePlay: next.googlePlay, showBanner: next.showBanner, showIntro: next.showIntro, ...extra }),
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

/** Uploads one file into its own slot (video / photo / pdf, owner only) and publishes it as the welcome screen. */
export async function uploadIntroFile(slot: IntroSlot, file: File): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/app-settings/intro-video?slot=' + slot, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || (slot === 'pdf' ? 'application/pdf' : slot === 'photo' ? 'image/jpeg' : 'video/mp4') },
      body: file,
    });
    const d: any = await r.json().catch(() => null);
    if (!r.ok || !d || d.ok === false) return { ok: false, error: (d && d.error) || ('HTTP ' + r.status) };
    writeStoreLinks({ ...readStoreLinks(), ...clean(d) });
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Publishes one stored file as the welcome screen ('' = back to the built-in video). */
export async function setIntroActive(active: IntroSlot | ''): Promise<{ ok: boolean; synced: boolean }> {
  const cur = readStoreLinks();
  const slotsOk = active === '' || !!cur.slots[active];
  if (!slotsOk) return { ok: false, synced: false };
  return pushStoreLinks({ ...cur, active, videoUrl: active ? cur.slots[active] : '' }, { active });
}

/** Deletes the stored file of one type. */
export async function clearIntroSlot(slot: IntroSlot): Promise<{ ok: boolean; synced: boolean }> {
  const cur = readStoreLinks();
  const slots = { ...cur.slots, [slot]: '' };
  const active = cur.active === slot ? '' : cur.active;
  const next: StoreLinks = { ...cur, slots, active, videoUrl: active ? slots[active] : '' };
  writeStoreLinks(next);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearSlot: slot }),
    });
    const d: any = r.ok ? await r.json().catch(() => null) : null;
    return { ok: true, synced: !!d && typeof d === 'object' && d.ok !== false };
  } catch {
    return { ok: true, synced: false };
  }
}

/** Asks the server directly (no local fallback) what it really holds. links = null when the server did not answer with links. */
export async function verifyStoreLinks(): Promise<{ status: 'server' | 'no-route' | 'error'; links: StoreLinks | null }> {
  try {
    const r = await fetch(ENDPOINT, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return { status: 'error', links: null };
    const d: any = await r.json().catch(() => null);
    if (!d || typeof d !== 'object') return { status: 'no-route', links: null };
    return { status: 'server', links: clean(d) };
  } catch {
    return { status: 'error', links: null };
  }
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
  if (p === 'ios') return links.appStore;
  if (p === 'android') return links.googlePlay;
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
