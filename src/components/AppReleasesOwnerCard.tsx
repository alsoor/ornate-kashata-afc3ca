import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchReleases, uploadRelease, deleteRelease, releasesOf, formatReleaseDate, formatSize,
  platformFromFileName, RELEASES_EVENT, type AppRelease,
} from '@/lib/appReleases';

type Theme = Record<string, string>;

/** Owner-only section inside Settings → Company: upload the Android (.apk) / iOS (.ipa) build.
 *  Users' Download buttons always pull the newest upload from here. */
export default function AppReleasesOwnerCard({ T }: { T: Theme }) {
  const [list, setList] = useState<AppRelease[]>([]);
  const [version, setVersion] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => setList(await fetchReleases()), []);
  useEffect(() => {
    void reload();
    window.addEventListener(RELEASES_EVENT, reload);
    return () => window.removeEventListener(RELEASES_EVENT, reload);
  }, [reload]);

  const platform = file ? platformFromFileName(file.name) : null;
  const canUpload = !!file && !!platform && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version.trim()) && !busy;

  async function onUpload() {
    if (!file || !canUpload) return;
    setBusy(true);
    setPct(0);
    setMsg(null);
    try {
      const r = await uploadRelease({ file, version: version.trim(), onProgress: setPct });
      setMsg({ ok: true, text: `Uploaded ${r.platform === 'android' ? 'Android' : 'iOS'} v${r.version}` });
      setFile(null);
      setVersion('');
      if (inputRef.current) inputRef.current.value = '';
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setBusy(false);
    }
  }

  const primary = T.primary || '#00BCD4';
  const box: React.CSSProperties = {
    background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 14, padding: '14px 16px', color: T.text,
  };

  const Row = ({ r }: { r: AppRelease }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: `1px solid ${T.surfaceBorder}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>v{r.version} · {formatSize(r.size)}</div>
        <div style={{ fontSize: '0.66rem', color: T.textMuted }}>{formatReleaseDate(r.createdAt, 'en')}</div>
      </div>
      <button
        type="button"
        onClick={() => { if (window.confirm(`Delete v${r.version}?`)) void deleteRelease(r.id); }}
        style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
      >
        Delete
      </button>
    </div>
  );

  return (
    <div style={box} data-testid="app-releases-owner">
      <div style={{ fontSize: '0.86rem', fontWeight: 800 }}>App Downloads</div>
      <div style={{ marginTop: 2, fontSize: '0.68rem', color: T.textMuted }}>
        Upload a new .apk (Google Play button) or .ipa (App Store button). Users always download the newest one.
      </div>

      <input
        value={version}
        onChange={e => setVersion(e.target.value)}
        placeholder="Version e.g. 1.0.3"
        dir="ltr"
        style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.surfaceBorder}`, background: 'transparent', color: T.text, fontSize: '0.8rem' }}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".apk,.ipa"
        onChange={e => { setFile(e.target.files?.[0] || null); setMsg(null); }}
        style={{ marginTop: 8, width: '100%', fontSize: '0.74rem', color: T.textMuted }}
      />
      {file && !platform && <div style={{ marginTop: 6, color: '#ef4444', fontSize: '0.7rem' }}>Only .apk or .ipa</div>}
      {file && platform && (
        <div style={{ marginTop: 6, fontSize: '0.7rem', color: T.textMuted }}>
          {platform === 'android' ? 'Android' : 'iOS'} · {formatSize(file.size)}
        </div>
      )}

      <button
        type="button"
        disabled={!canUpload}
        onClick={onUpload}
        style={{
          marginTop: 10, width: '100%', height: 40, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem',
          background: canUpload ? primary : 'rgba(0,188,212,0.18)', color: canUpload ? '#041414' : 'rgba(180,210,210,0.5)',
          cursor: canUpload ? 'pointer' : 'default',
        }}
      >
        {busy ? `Uploading ${pct}%` : 'Upload'}
      </button>
      {busy && (
        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: T.surfaceBorder, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: primary, transition: 'width .2s' }} />
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: '0.72rem', color: msg.ok ? '#22c55e' : '#ef4444' }}>{msg.text}</div>}

      {(['android', 'ios'] as const).map(p => {
        const rs = releasesOf(list, p);
        return (
          <div key={p} style={{ marginTop: 14 }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: primary }}>
              {p === 'android' ? 'Android (.apk)' : 'iOS (.ipa)'} — {rs.length ? `latest v${rs[0].version}` : 'none yet'}
            </div>
            {rs.map(r => <Row key={r.id} r={r} />)}
          </div>
        );
      })}
    </div>
  );
}
