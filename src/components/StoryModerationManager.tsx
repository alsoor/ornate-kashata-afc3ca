import { useEffect, useState } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import {
  LEVEL_META, loadNotices, fetchNotices, liftBan, loadModerators, setModerator, fetchModerators, onModerationChanged,
} from '@/lib/storyModeration';

type U = { id: string; username: string | null; email: string; name?: string | null };
const GOLD = '#ef4444';

function fmt(iso: string) { try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } }

/** Owner-only sheet (Settings): story moderators + log of every notice sent */
export default function StoryModerationManager({ users, onClose, onRefreshUsers }: { users: U[]; onClose: () => void; onRefreshUsers?: () => void }) {
  const [tab, setTab] = useState<'log' | 'mods'>('log');
  const [q, setQ] = useState('');
  const [, setV] = useState(0);
  useEffect(() => {
    void fetchNotices({ all: true }); void fetchModerators();
    return onModerationChanged(() => setV(x => x + 1));
  }, []);
  const mods = new Set(loadModerators());
  const notices = loadNotices();
  const nameOf = (id: string, fallback?: string | null) => {
    const u = users.find(x => String(x.id) === String(id));
    return u?.username ? `@${String(u.username).replace(/^@/, '')}` : (fallback ? `@${String(fallback).replace(/^@/, '')}` : (u?.name || u?.email || id));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10350, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))', borderBottom: '1px solid rgba(239,68,68,0.3)', background: 'linear-gradient(180deg, #1a0d0d 0%, #0a0e0e 100%)', minHeight: 52, flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: GOLD, padding: 2 }}><X size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: GOLD, fontWeight: 900, fontSize: '0.95rem' }}>Story Moderation</p>
          <p style={{ margin: '1px 0 0', color: 'rgba(230,180,180,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>Owner only · delete any story · warnings &amp; story bans</p>
        </div>
        <button type="button" onClick={() => { void fetchNotices({ all: true }); void fetchModerators(); onRefreshUsers?.(); }}
          style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: GOLD, borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 0' }}>
        {(['log', 'mods'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem', color: tab === t ? '#111' : GOLD, background: tab === t ? GOLD : 'rgba(239,68,68,0.08)', border: `1px solid ${GOLD}55` }}>
            {t === 'log' ? `Sent notices (${notices.length})` : `Moderators (${mods.size})`}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <p style={{ margin: '0 0 10px', color: 'rgba(230,200,200,0.7)', fontSize: '0.7rem', lineHeight: 1.6 }}>
          <ShieldAlert size={12} style={{ verticalAlign: '-2px' }} /> You (@Stooorna) can always delete any story from the story viewer. Moderators are users you allow to do the same.
        </p>

        {tab === 'log' && (
          <>
            {notices.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(200,180,180,0.7)', border: '1px dashed rgba(239,68,68,0.25)', borderRadius: 14 }}>No notices sent yet</div>}
            {notices.map(n => {
              const m = LEVEL_META[n.level];
              const active = !!n.banUntil && !n.banLifted && +new Date(n.banUntil) > Date.now();
              return (
                <div key={n.id} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${m.color}55` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.82rem' }}>{nameOf(n.targetUserId, n.targetUsername)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.66rem' }}>#{n.strikeNumber} · {m.short}</span>
                    <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.4)', fontSize: '0.62rem' }}>{fmt(n.createdAt)}</span>
                  </div>
                  <p dir="auto" style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.74rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.message}</p>
                  {active && (
                    <button type="button" onClick={() => void liftBan(n.id)} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#052e16', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                      Lift ban (until {fmt(n.banUntil!)})
                    </button>
                  )}
                  {n.banLifted && <p style={{ margin: '6px 0 0', color: '#86efac', fontSize: '0.66rem' }}>Ban lifted</p>}
                </div>
              );
            })}
          </>
        )}

        {tab === 'mods' && (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search username or email…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 10, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '0.8rem', outline: 'none' }} />
            {users.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(200,180,180,0.7)', border: '1px dashed rgba(239,68,68,0.25)', borderRadius: 14 }}>No users loaded yet — tap Refresh</div>}
            {users
              .filter(u => { const s = q.trim().toLowerCase().replace(/^@/, ''); return !s || `${u.username || ''} ${u.email || ''} ${u.name || ''}`.toLowerCase().includes(s); })
              .slice(0, 60)
              .map(u => {
                const on = mods.has(String(u.id));
                return (
                  <div key={u.id} style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${on ? GOLD : 'rgba(239,68,68,0.15)'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', color: '#fff', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username ? `@${String(u.username).replace(/^@/, '')}` : (u.name || u.email)}</span>
                      <span style={{ display: 'block', color: 'rgba(200,180,180,0.7)', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                    </span>
                    <button type="button" onClick={() => void setModerator(String(u.id), !on)}
                      style={{ padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.7rem', background: on ? '#ef4444' : GOLD, color: on ? '#fff' : '#111', opacity: on ? 1 : 0.9 }}>
                      {on ? 'Remove' : 'Give'}
                    </button>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}
