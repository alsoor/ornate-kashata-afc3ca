import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAppDownloads, uploadRelease, addLinkRelease, deleteRelease, setStoreVisible, releasesOf, formatReleaseDate, formatSize,
  platformFromFileName, RELEASES_EVENT, type AppRelease, type ReleasePlatform,
} from '@/lib/appReleases';

type Theme = Record<string, string>;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/;

/** One independent card per platform: its own version, its own upload, its own show/hide switch. */
function PlatformCard({
  T, platform, releases, visible, onChanged,
}: { T: Theme; platform: ReleasePlatform; releases: AppRelease[]; visible: boolean; onChanged: () => void }) {
  const isAndroid = platform === 'android';
  const [version, setVersion] = useState('');
  const [mode, setMode] = useState<'file' | 'link'>('file');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const primary = T.primary || '#ffffff';

  const fileOk = !!file && platformFromFileName(file.name) === platform;
  const linkOk = /^https?:\/\/\S+\.\S+$/i.test(link.trim());
  const canUpload = (mode === 'file' ? fileOk : linkOk) && VERSION_RE.test(version.trim()) && !busy;

  async function onUpload() {
    if (!canUpload) return;
    setBusy(true);
    setPct(0);
    setMsg(null);
    try {
      const r = mode === 'link'
        ? await addLinkRelease({ platform, version: version.trim(), url: link.trim() })
        : await uploadRelease({ file: file!, version: version.trim(), onProgress: setPct });
      setMsg({ ok: true, text: mode === 'link' ? `Link saved v${r.version}` : `Uploaded v${r.version}` });
      setFile(null);
      setLink('');
      setVersion('');
      if (inputRef.current) inputRef.current.value = '';
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setBusy(false);
    }
  }

  async function onToggle() {
    const ok = await setStoreVisible(platform, !visible);
    if (!ok) setMsg({ ok: false, text: 'Could not change visibility' });
    onChanged();
  }

  return (
    <div
      data-testid={`app-release-${platform}`}
      style={{ background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 14, padding: '14px 16px', color: T.text }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 800 }}>
            {isAndroid ? 'Android · Google Play' : 'iOS · App Store'}
          </div>
          <div style={{ marginTop: 2, fontSize: '0.68rem', color: T.textMuted }}>
            {isAndroid ? '.apk file / link' : '.ipa file / link'} · {releases.length ? `latest v${releases[0].version}` : 'no file yet'}
          </div>
        </div>
        {/* show / hide switch for this store button */}
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          aria-label={visible ? 'Hide store button' : 'Show store button'}
          onClick={onToggle}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.textMuted, fontSize: '0.68rem', fontWeight: 700 }}
        >
          <span>{visible ? 'Visible' : 'Hidden'}</span>
          <span style={{ width: 44, height: 26, borderRadius: 999, position: 'relative', flexShrink: 0, background: visible ? (T.switchOn || '#22c55e') : (T.switchOff || '#000000'), boxShadow: 'inset 0 0 0 2px #22c55e', transition: 'background .2s' }}>
            <span style={{ position: 'absolute', top: 3, left: visible ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left .2s' }} />
          </span>
        </button>
      </div>

      <input
        value={version}
        onChange={e => setVersion(e.target.value)}
        placeholder="Version e.g. 1.0.3"
        dir="ltr"
        style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.surfaceBorder}`, background: 'transparent', color: T.text, fontSize: '0.8rem' }}
      />
      {/* two ways to add: upload a file, or paste a link */}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, padding: 3, borderRadius: 10, border: `1px solid ${T.surfaceBorder}` }}>
        {(['file', 'link'] as const).map(k => (
          <button
            key={k}
            type="button"
            onClick={() => { setMode(k); setMsg(null); }}
            style={{
              flex: 1, height: 30, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800,
              background: mode === k ? primary : 'transparent', color: mode === k ? '#000000' : T.textMuted,
            }}
          >
            {k === 'file' ? (isAndroid ? 'File (.apk)' : 'File (.ipa)') : 'Link'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={isAndroid ? '.apk' : '.ipa'}
            onChange={e => { setFile(e.target.files?.[0] || null); setMsg(null); }}
            style={{ marginTop: 8, width: '100%', fontSize: '0.74rem', color: T.textMuted }}
          />
          {file && !fileOk && <div style={{ marginTop: 6, color: '#ffffff', fontSize: '0.7rem' }}>Only {isAndroid ? '.apk' : '.ipa'} here</div>}
          {fileOk && <div style={{ marginTop: 6, fontSize: '0.7rem', color: T.textMuted }}>{formatSize(file!.size)}</div>}
        </>
      ) : (
        <>
          <input
            value={link}
            onChange={e => { setLink(e.target.value); setMsg(null); }}
            placeholder="https://..."
            dir="ltr"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.surfaceBorder}`, background: 'transparent', color: T.text, fontSize: '0.8rem' }}
          />
          {link.trim() && !linkOk && <div style={{ marginTop: 6, color: '#ffffff', fontSize: '0.7rem' }}>Link must start with https://</div>}
        </>
      )}

      <button
        type="button"
        disabled={!canUpload}
        onClick={onUpload}
        style={{
          marginTop: 10, width: '100%', height: 40, border: canUpload ? 'none' : '1px solid #ffffff', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem',
          background: '#ef4444', color: '#ffffff',
          cursor: canUpload ? 'pointer' : 'default',
        }}
      >
        {busy ? (mode === 'link' ? 'Saving…' : `Uploading ${pct}%`) : (mode === 'link' ? 'Save link' : 'Upload')}
      </button>
      {busy && (
        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: T.surfaceBorder, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: primary, transition: 'width .2s' }} />
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#ffffff' }}>{msg.text}</div>}

      {releases.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', marginTop: 4, borderTop: `1px solid ${T.surfaceBorder}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>v{r.version} · {r.link ? `Link · ${r.fileName}` : formatSize(r.size)}</div>
            <div style={{ fontSize: '0.64rem', color: T.textMuted }}>{formatReleaseDate(r.createdAt, 'en')}</div>
          </div>
          <button
            type="button"
            onClick={async () => { if (window.confirm(`Delete v${r.version}?`)) { await deleteRelease(r.id); onChanged(); } }}
            style={{ border: '1px solid #ffffff', background: '#000000', color: '#ffffff', borderRadius: 8, padding: '4px 10px', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

/** Owner-only, Settings → Company: two separate cards (Android APK / iOS IPA). */
export default function AppReleasesOwnerCard({ T }: { T: Theme }) {
  const [list, setList] = useState<AppRelease[]>([]);
  const [vis, setVis] = useState({ android: true, ios: true });

  const reload = useCallback(async () => {
    const d = await fetchAppDownloads();
    setList(d.releases);
    setVis(d.visibility);
  }, []);
  useEffect(() => {
    void reload();
    window.addEventListener(RELEASES_EVENT, reload);
    return () => window.removeEventListener(RELEASES_EVENT, reload);
  }, [reload]);

  return (
    <>
      <PlatformCard T={T} platform="android" releases={releasesOf(list, 'android')} visible={vis.android} onChanged={reload} />
      <PlatformCard T={T} platform="ios" releases={releasesOf(list, 'ios')} visible={vis.ios} onChanged={reload} />
    </>
  );
}
