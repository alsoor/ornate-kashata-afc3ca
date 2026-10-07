// Client helpers for APK / IPA releases (file upload OR external link).
// Server: /api/app-releases (server/app-releases.ts)

export type ReleasePlatform = 'android' | 'ios';
export type StoreVisibility = { android: boolean; ios: boolean };
export type AppRelease = {
  id: string;
  platform: ReleasePlatform;
  version: string;
  fileName: string;
  size: number;
  createdAt: string;
  /** Set when this release is an external link instead of an uploaded file. */
  link?: string;
};

export const RELEASES_EVENT = 'stooorna:app-releases-changed';
const BASE = '/api/app-releases';
const notify = () => {
  try { window.dispatchEvent(new Event(RELEASES_EVENT)); } catch { /* */ }
};

export function platformFromFileName(name: string): ReleasePlatform | null {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.apk')) return 'android';
  if (n.endsWith('.ipa')) return 'ios';
  return null;
}

export const latestDownloadUrl = (platform: ReleasePlatform) => `${BASE}/latest/${platform}/download`;
export const releaseDownloadUrl = (id: string) => `${BASE}/${id}/download`;

export const releasesOf = (list: AppRelease[], platform: ReleasePlatform) =>
  list
    .filter(r => r.platform === platform)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

export function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** e.g. "Wednesday 7 Oct 2026 · 11:33" */
export function formatReleaseDate(iso: string, lang: 'ar' | 'en' = 'en'): string {
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  const loc = lang === 'ar' ? 'ar' : 'en-GB';
  const day = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).replace(/,/g, '');
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}

export async function fetchAppDownloads(): Promise<{ releases: AppRelease[]; visibility: StoreVisibility }> {
  try {
    const r = await fetch(BASE, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('bad status');
    const j = await r.json();
    return {
      releases: Array.isArray(j.releases) ? j.releases : [],
      visibility: { android: j.visibility?.android !== false, ios: j.visibility?.ios !== false },
    };
  } catch {
    return { releases: [], visibility: { android: true, ios: true } };
  }
}

/** Upload an .apk / .ipa file (owner only). */
export function uploadRelease(a: { file: File; version: string; onProgress?: (pct: number) => void }): Promise<AppRelease> {
  return new Promise((resolve, reject) => {
    const platform = platformFromFileName(a.file.name);
    if (!platform) return reject(new Error('Only .apk or .ipa files'));
    const q = new URLSearchParams({ platform, version: a.version, name: a.file.name });
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${BASE}/upload?${q}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) a.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onload = () => {
      let j: { error?: string; release?: AppRelease } = {};
      try { j = JSON.parse(xhr.responseText || '{}'); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300 && j.release) {
        notify();
        resolve(j.release);
      } else {
        reject(new Error(j.error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.send(a.file);
  });
}

/** Save an external link (store / website / direct download) as the release (owner only). */
export async function addLinkRelease(a: { platform: ReleasePlatform; version: string; url: string }): Promise<AppRelease> {
  const q = new URLSearchParams({ platform: a.platform, version: a.version, link: a.url });
  const r = await fetch(`${BASE}/link?${q}`, { method: 'PUT', credentials: 'include' });
  const j = await r.json().catch(() => ({} as { error?: string; release?: AppRelease }));
  if (!r.ok || !j.release) throw new Error(j.error || 'Failed');
  notify();
  return j.release as AppRelease;
}

export async function deleteRelease(id: string): Promise<boolean> {
  const r = await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
  notify();
  return r.ok;
}

export async function setStoreVisible(platform: ReleasePlatform, visible: boolean): Promise<boolean> {
  const q = new URLSearchParams({ platform, visible: visible ? '1' : '0' });
  const r = await fetch(`${BASE}/visibility?${q}`, { method: 'PUT', credentials: 'include' });
  notify();
  return r.ok;
}
