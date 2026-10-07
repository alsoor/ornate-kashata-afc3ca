import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import AppReleasesOwnerCard from '@/components/AppReleasesOwnerCard';
import { fetchLiveSwitches, setLiveSwitch, type LiveSwitchKey, type LiveSwitches } from '@/lib/liveIconsVisibility';

type Theme = Record<string, string>;

const SWITCH_ROWS: { key: LiveSwitchKey; title: string; hint: string }[] = [
  { key: 'gifts', title: 'Gifts icon', hint: 'Gift icon in video LIVE and voice LIVE · off = hidden for all users' },
  { key: 'coins', title: 'Coins ($) icon', hint: 'Charge icon in video LIVE and voice LIVE · off = hidden for all users' },
  { key: 'deposit', title: 'Deposit box', hint: 'Deposit (+) inside the Wallet page, in LIVE and in user Settings · off = hidden' },
];

/** Owner switches: each one is independent. Visible (green) = shown to users, Hidden (white) = removed for everyone. */
function LiveSwitchesCard({ T }: { T: Theme }) {
  const [sw, setSw] = useState<LiveSwitches>({ gifts: true, coins: true, deposit: true });
  const [busy, setBusy] = useState<LiveSwitchKey | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void fetchLiveSwitches().then(v => { if (alive && v) setSw(v); });
    return () => { alive = false; };
  }, []);

  async function onToggle(key: LiveSwitchKey) {
    if (busy) return;
    const next = !sw[key];
    setBusy(key);
    setErr('');
    setSw(o => ({ ...o, [key]: next }));
    const saved = await setLiveSwitch(key, next);
    if (saved) setSw(saved);
    else { setSw(o => ({ ...o, [key]: !next })); setErr('Could not save — try again'); }
    setBusy(null);
  }

  return (
    <>
      {SWITCH_ROWS.map(r => {
        const visible = sw[r.key];
        return (
          <div
            key={r.key}
            data-testid={`live-switch-${r.key}`}
            style={{ background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 14, padding: '14px 16px', color: T.text }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 800 }}>{r.title}</div>
                <div style={{ marginTop: 2, fontSize: '0.68rem', color: T.textMuted }}>{r.hint}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                aria-label={`${visible ? 'Hide' : 'Show'} ${r.title}`}
                onClick={() => onToggle(r.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.textMuted, fontSize: '0.68rem', fontWeight: 700, opacity: busy === r.key ? 0.7 : 1 }}
              >
                <span>{visible ? 'Visible' : 'Hidden'}</span>
                <span style={{ width: 44, height: 26, borderRadius: 999, position: 'relative', flexShrink: 0, background: visible ? (T.switchOn || '#22c55e') : '#ffffff', boxShadow: 'inset 0 0 0 2px #22c55e', transition: 'background .2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: visible ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left .2s' }} />
                </span>
              </button>
            </div>
          </div>
        );
      })}
      {err && <div style={{ fontSize: '0.72rem', color: '#ef4444', padding: '0 4px' }}>{err}</div>}
    </>
  );
}

/**
 * Owner-only, Settings → Company, right under "User Control".
 * Collapsible "App Upload" section holding the Android / iOS upload boxes and the live-icons switch.
 */
export default function AppUploadSection({ T }: { T: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="App Upload"
        className="flex items-center justify-between"
        style={{
          width: '100%', background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 14,
          padding: '14px 16px', color: T.text, cursor: 'pointer',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center" style={{
            width: 38, height: 38, borderRadius: 12, background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444',
          }}>
            <Upload size={19} strokeWidth={2.1} />
          </span>
          <span style={{ textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>App Upload</span>
            <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
              Android · iOS · Gifts / Coins / Deposit switches
            </span>
          </span>
        </div>
        <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1, transform: open ? 'rotate(-90deg)' : 'none', transition: 'transform .2s' }}>‹</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          <AppReleasesOwnerCard T={T} />
          <LiveSwitchesCard T={T} />
        </div>
      )}
    </>
  );
}
