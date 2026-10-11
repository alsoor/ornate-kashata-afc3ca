import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X as XIcon } from 'lucide-react';
import { AI_PLAN, AI_POST_COST, canAfford, startPayment } from './aiCredits';

/** Header chip: "30 P" while there are points, "Upgrade" (light-blue pill, white text, black frame) when the balance is empty. */
export function CreditsChip({ balance, onClick }: { balance: number | null; onClick: () => void }) {
  if (balance === null) return <span style={{ width: 8 }} />;
  const empty = !canAfford(balance);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={empty ? 'Upgrade' : 'Balance'}
      style={{
        border: empty ? '2px solid #000' : '1px solid rgba(0,0,0,0.08)',
        background: empty ? '#9fd0fd' : 'rgba(0,0,0,0.045)',
        color: empty ? '#fff' : '#111',
        textShadow: empty ? '0 1px 2px rgba(0,0,0,0.45)' : 'none',
        borderRadius: 999, padding: empty ? '5px 14px' : '5px 11px',
        fontWeight: 800, fontSize: 13, letterSpacing: '0.01em', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.1, flexShrink: 0,
      }}
    >
      {empty ? 'Upgrade' : (
        <>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 0 2px rgba(245,158,11,0.25)' }} />
          {balance} P
        </>
      )}
    </button>
  );
}

/** Centered box: animated black app icon + "Stooorna Ai", balance and the monthly plan. */
export function AiPlanDialog({ open, balance, onClose }: { open: boolean; balance: number | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  if (!open) return null;
  const empty = !canAfford(balance);
  const pay = async () => {
    setNote('');
    const ok = await startPayment(); // opens nothing until Google Pay is connected
    if (!ok) setNote('Payments will be available soon.');
  };
  const stats = [
    { big: `${AI_POST_COST} P`, small: 'per post' },
    { big: `${AI_PLAN.posts}`, small: 'posts' },
    { big: `${AI_PLAN.perDay}/day`, small: 'avg. a month' },
  ];
  const perks = [
    `${AI_PLAN.points} P added to your balance`,
    `Publish up to ${AI_PLAN.posts} edited photos or videos`,
    `${AI_POST_COST} P taken automatically per post`,
    'About 3 posts every day for a month',
  ];

  return createPortal(
    <div
      onClick={e => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 33000, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 360, borderRadius: 30, padding: '26px 20px 20px',
          background: 'linear-gradient(180deg, #151a19 0%, #0a0d0c 100%)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          animation: 'stooornaAiPlanIn 0.32s cubic-bezier(0.22,1,0.36,1)', textAlign: 'center',
        }}
      >
        <button
          type="button" aria-label="Close" onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <XIcon size={18} />
        </button>

        {/* animated app icon */}
        <div style={{ width: 74, height: 74, margin: '0 auto 12px', borderRadius: 22, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px rgba(255,255,255,0.08), 0 10px 28px rgba(0,0,0,0.5)' }}>
          <svg width={54} height={54} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: 'stooornaAiPlanGlobe 9s linear infinite', transformOrigin: '50% 50%' }}>
            <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
            <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" />
            <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: '0.02em' }}>Stooorna Ai</div>
        <div style={{ marginTop: 4, fontSize: 13, color: empty ? '#fca5a5' : 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
          {empty ? "You're out of points" : 'Your balance'}
        </div>
        <div style={{ margin: '8px auto 16px', display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '6px 18px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: empty ? '#fca5a5' : '#facc15' }}>{balance ?? 0}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.75)' }}>P</span>
        </div>

        {/* plan */}
        <div style={{ borderRadius: 22, padding: '16px 14px 14px', background: 'linear-gradient(135deg, rgba(250,204,21,0.14), rgba(239,68,68,0.12))', border: '1px solid rgba(250,204,21,0.35)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: '#facc15' }}>MONTHLY PLAN</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, margin: '6px 0 12px' }}>
            <span style={{ fontSize: 38, fontWeight: 900 }}>{AI_PLAN.price}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>for {AI_PLAN.points} P</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {stats.map(s => (
              <div key={s.small} style={{ borderRadius: 14, background: 'rgba(0,0,0,0.35)', padding: '9px 4px' }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{s.big}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{s.small}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            {perks.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={13} strokeWidth={3.4} color="#fff" />
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button" onClick={() => { void pay(); }}
          style={{ marginTop: 16, width: '100%', border: 'none', borderRadius: 999, padding: '15px 18px', background: '#ef4444', color: '#fff', fontSize: 17, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 22px rgba(239,68,68,0.4)' }}
        >
          Pay {AI_PLAN.price}
        </button>
        <div style={{ minHeight: 18, marginTop: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{note}</div>

        <style>{`
          @keyframes stooornaAiPlanIn { from { transform: translateY(18px) scale(0.94); opacity: 0; } to { transform: none; opacity: 1; } }
          @keyframes stooornaAiPlanGlobe { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) { [aria-hidden="true"][style*="stooornaAiPlanGlobe"] { animation: none !important; } }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
