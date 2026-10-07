// APK / IPA releases: owner uploads, public list + download (latest or a specific version).
// Framework-agnostic (Web Request/Response). Mount example (Hono):
//   app.all('/api/app-releases', async c => (await handleAppReleases(c.req.raw, { isOwner })) ?? c.notFound());
//   app.all('/api/app-releases/*', async c => (await handleAppReleases(c.req.raw, { isOwner })) ?? c.notFound());
// `isOwner(req)` must return true only for the Stooorna owner session.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Same persistent storage the app already uses (the _private folder is blocked from public URLs by privateAssetsGuard).
const DIR =
  process.env.APP_RELEASES_DIR ||
  path.join(process.env.ASSETS_DIR || '/shared-storage/public/assets', '_private', 'app-releases');
const META = path.join(DIR, 'releases.json');
const VIS = path.join(DIR, 'visibility.json');
const MAX_BYTES = 500 * 1024 * 1024;

type Rel = {
  id: string;
  platform: 'android' | 'ios';
  version: string;
  fileName: string;
  size: number;
  createdAt: string;
  stored: string;
};
export type Ctx = { isOwner: (req: Request) => Promise<boolean> };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function readAll(): Rel[] {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return [];
  }
}
function writeAll(list: Rel[]) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(META, JSON.stringify(list, null, 2));
}
type Vis = { android: boolean; ios: boolean };
function readVis(): Vis {
  try {
    const j = JSON.parse(fs.readFileSync(VIS, 'utf8'));
    return { android: j.android !== false, ios: j.ios !== false };
  } catch {
    return { android: true, ios: true };
  }
}
function writeVis(v: Vis) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(VIS, JSON.stringify(v));
}
const pub = ({ stored: _stored, ...r }: Rel) => r;
const newest = (l: Rel[]) => [...l].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

function download(r: Rel): Response {
  const file = path.join(DIR, r.stored);
  if (!fs.existsSync(file)) return json({ error: 'File missing' }, 404);
  const type = r.platform === 'android' ? 'application/vnd.android.package-archive' : 'application/octet-stream';
  const name = `Stooorna-${r.version}.${r.platform === 'android' ? 'apk' : 'ipa'}`;
  return new Response(Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(r.size),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}


export type UploadMeta = { platform: string; version: string; name: string; declared: number };
export type UploadResult =
  | { ok: true; release: Omit<Rel, 'stored'> }
  | { ok: false; status: number; error: string };

/** Validate + stream an uploaded APK/IPA into DIR and register it. Works with any Node Readable (Express req or Web body). */
export async function storeUpload(src: Readable, m: UploadMeta): Promise<UploadResult> {
  const platform = m.platform;
  const version = (m.version || '').trim();
  const name = (m.name || '').toLowerCase();
  if (platform !== 'android' && platform !== 'ios') return { ok: false, status: 400, error: 'Bad platform' };
  if (!name.endsWith(platform === 'android' ? '.apk' : '.ipa')) {
    return { ok: false, status: 400, error: 'File type does not match platform' };
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)) return { ok: false, status: 400, error: 'Bad version' };
  if (m.declared > MAX_BYTES) return { ok: false, status: 413, error: 'File too large' };

  const id = crypto.randomBytes(8).toString('hex');
  const stored = `${id}.${platform === 'android' ? 'apk' : 'ipa'}`;
  const full = path.join(DIR, stored);
  let size = 0;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        if (size > MAX_BYTES) cb(new Error('File too large'));
        else cb(null, chunk);
      },
    });
    await pipeline(src, counter, fs.createWriteStream(full));
  } catch (e) {
    fs.rmSync(full, { force: true });
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[app-releases] upload failed:', msg, { DIR, size });
    return { ok: false, status: msg === 'File too large' ? 413 : 500, error: `Upload failed: ${msg}` };
  }
  if (size === 0) {
    fs.rmSync(full, { force: true });
    return { ok: false, status: 400, error: 'Empty body (file was not received)' };
  }
  const rel: Rel = { id, platform, version, fileName: path.basename(name), size, createdAt: new Date().toISOString(), stored };
  writeAll([...readAll(), rel]);
  return { ok: true, release: pub(rel) };
}

export async function handleAppReleases(req: Request, ctx: Ctx): Promise<Response | null> {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '');
  if (!p.startsWith('/api/app-releases')) return null;
  const rest = p.slice('/api/app-releases'.length); // '', '/upload', '/latest/android/download', '/<id>/download', '/<id>'

  if (req.method === 'GET' && rest === '') {
    return json({ releases: newest(readAll()).map(pub), visibility: readVis() });
  }

  // Owner: show / hide one store button (and its download) for everyone else.
  if (req.method === 'PUT' && rest === '/visibility') {
    if (!(await ctx.isOwner(req))) return json({ error: 'Owner only' }, 403);
    const pf = url.searchParams.get('platform');
    if (pf !== 'android' && pf !== 'ios') return json({ error: 'Bad platform' }, 400);
    const v = readVis();
    v[pf] = url.searchParams.get('visible') !== '0';
    writeVis(v);
    return json({ visibility: v });
  }

  let m = rest.match(/^\/latest\/(android|ios)\/download$/);
  if (req.method === 'GET' && m) {
    const plat = m[1] as 'android' | 'ios';
    if (!readVis()[plat] && !(await ctx.isOwner(req))) return json({ error: 'Not available' }, 404);
    const r = newest(readAll()).find(x => x.platform === plat);
    return r ? download(r) : json({ error: 'No release yet' }, 404);
  }

  m = rest.match(/^\/([a-f0-9]{16})\/download$/);
  if (req.method === 'GET' && m) {
    const r = readAll().find(x => x.id === m![1]);
    if (r && !readVis()[r.platform] && !(await ctx.isOwner(req))) return json({ error: 'Not available' }, 404);
    return r ? download(r) : json({ error: 'Not found' }, 404);
  }

  if (req.method === 'PUT' && rest === '/upload') {
    if (!(await ctx.isOwner(req))) return json({ error: 'Owner only' }, 403);
    if (!req.body) return json({ error: 'Empty body' }, 400);
    const out = await storeUpload(Readable.fromWeb(req.body as unknown as import('node:stream/web').ReadableStream), {
      platform: url.searchParams.get('platform') || '',
      version: url.searchParams.get('version') || '',
      name: url.searchParams.get('name') || '',
      declared: Number(req.headers.get('content-length') || 0),
    });
    return out.ok ? json({ release: out.release }) : json({ error: out.error }, out.status);
  }

  m = rest.match(/^\/([a-f0-9]{16})$/);
  if (req.method === 'DELETE' && m) {
    if (!(await ctx.isOwner(req))) return json({ error: 'Owner only' }, 403);
    const list = readAll();
    const r = list.find(x => x.id === m![1]);
    if (!r) return json({ error: 'Not found' }, 404);
    fs.rmSync(path.join(DIR, r.stored), { force: true });
    writeAll(list.filter(x => x.id !== r.id));
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}
