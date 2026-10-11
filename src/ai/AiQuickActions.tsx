import React, { useEffect, useState } from 'react';
import { loadDashboard, type AssistUser, type DashboardNumbers, type PanelKind } from './appAssistant';

/**
 * Stooorna Ai — quick actions (v1.0.0)
 * Place at: src/ai/AiQuickActions.tsx
 *
 * Shown when the chat is empty: 4 live number tiles (friends / online / posts / requests)
 * and one-tap question chips. Tapping anything asks Stooorna Ai that question; the answer
 * (lists + data) comes from appAssistant.ts.
 */

const DARK_GREEN = '#0a1f1a';

interface Props {
  user?: AssistUser | null;
  onAsk: (text: string) => void;
  onOpen: (kind: PanelKind) => void;
}

export default function AiQuickActions({ user, onAsk, onOpen }: Props) {
  const ar = typeof navigator !== 'undefined' && /^ar/i.test(navigator.language || '');
  const [nums, setNums] = useState<DashboardNumbers | null>(null);
  const uid = String(user?.id || '');

  useEffect(() => {
    if (!uid) return;
    let dead = false;
    const run = () => { void loadDashboard(user).then(n => { if (!dead && n) setNums(n); }).catch(() => { /* */ }); };
    run();
    const t = window.setInterval(run, 30000);
    return () => { dead = true; window.clearInterval(t); };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!uid) return null;

  const tiles: Array<{ icon: string; label: string; value: number | null; kind: PanelKind }> = [
    { icon: '👥', label: ar ? 'الأصدقاء' : 'Friends', value: nums?.friends ?? null, kind: 'friends' },
    { icon: '🟢', label: ar ? 'أونلاين' : 'Online', value: nums?.online ?? null, kind: 'online' },
    { icon: '🖼', label: ar ? 'منشوراتي' : 'My posts', value: nums?.posts ?? null, kind: 'posts' },
    { icon: '📩', label: ar ? 'الطلبات' : 'Requests', value: nums?.requests ?? null, kind: 'requests' },
  ];

  const chips: Array<{ label: string; kind?: PanelKind; ask?: string }> = ar
    ? [
        { label: 'افتح الشات العام', ask: 'افتح الشات العام' },
        { label: 'كم رصيدي؟', ask: 'كم رصيدي؟' },
        { label: 'وش هو التطبيق؟', kind: 'app' },
      ]
    : [
        { label: 'Open the general chat', ask: 'Open the general chat' },
        { label: 'My balance', ask: 'My balance' },
        { label: 'What is Stooorna?', kind: 'app' },
      ];

  return (
    <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {tiles.map(t => (
          <button
            key={t.label}
            type="button"
            onClick={() => onOpen(t.kind)}
            style={{
              border: '1px solid #e5e7eb', background: '#fff', borderRadius: 16, padding: '10px 4px 9px',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            <span style={{ fontSize: 17, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: DARK_GREEN, lineHeight: 1.1, minHeight: 22 }}>
              {t.value === null ? '·' : t.value}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280' }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {chips.map(c => (
          <button
            key={c.label}
            type="button"
            dir="auto"
            onClick={() => (c.kind ? onOpen(c.kind) : onAsk(c.ask || c.label))}
            style={{
              border: '1px solid rgba(10,31,26,0.18)', background: '#f4f4f5', color: DARK_GREEN,
              borderRadius: 999, padding: '8px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
