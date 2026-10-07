// Client helpers for APK / IPA releases uploaded by the owner.
export type ReleasePlatform = 'android' | 'ios';
export type AppRelease = {
  id: string;
  platform: ReleasePlatform;
  version: string;
  fileName: string;
  size: number;
  createdAt: string; // ISO
};

export const RELEASES_EVENT = 'stooorna:app-releases';

export async function fetchReleases(): Promise<AppRelease[]> {
  try {
    const r = await fetch('/api/app-releases', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    const list: AppRelease[] = Array.isArray(j?.releases) ? j.releases : [];
    return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  } catch {
    return [];
  }
}

/** Newest first. */
export function releasesOf(list: AppRelease[], platform: ReleasePlatform): AppRelease[] {
  return list
    .filter(r => r.platform === platform)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

/** Always points to the newest uploaded file, so Download pulls the latest. */
export const latestDownloadUrl = (p: ReleasePlatform) => `/api/app-releases/latest/${p}/download`;
export const releaseDownloadUrl = (id: string) => `/api/app-releases/${encodeURIComponent(id)}/download`;

export function platformFromFileName(name: string): ReleasePlatform | null {
  const n = name.toLowerCase();
  if (n.endsWith('.apk')) return 'android';
  if (n.endsWith('.ipa')) return 'ios';
  return null;
}

/** Raw-body upload (streamed, with progress). Owner only — enforced on the server. */
export function uploadRelease(opts: {
  file: File;
  version: string;
  onProgress?: (pct: number) => void;
}): Promise<AppRelease> {
  const platform = platformFromFileName(opts.file.name);
  if (!platform) return Promise.reject(new Error('Only .apk or .ipa files are allowed'));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = new URLSearchParams({ platform, version: opts.version, name: opts.file.name });
    xhr.open('PUT', `/api/app-releases/upload?${qs.toString()}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && j.release) {
          window.dispatchEvent(new CustomEvent(RELEASES_EVENT));
          resolve(j.release as AppRelease);
        } else reject(new Error(j.error || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.send(opts.file);
  });
}

export async function deleteRelease(id: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/app-releases/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) window.dispatchEvent(new CustomEvent(RELEASES_EVENT));
    return r.ok;
  } catch {
    return false;
  }
}

/** e.g. "الثلاثاء 6 أكتوبر 2026 · 06:03 م" / "Tuesday 6 Oct 2026 · 06:03 PM" */
export function formatReleaseDate(iso: string, lang: 'ar' | 'en'): string {
  const d = new Date(iso);
  const loc = lang === 'ar' ? 'ar' : 'en-GB';
  const day = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(d);
  const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${day} ${date} · ${time}`;
}

export const formatSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
