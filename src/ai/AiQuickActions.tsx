import React, { useEffect, useState } from 'react';
import { loadDashboard, type AssistUser, type DashboardNumbers } from './appAssistant';

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
}

export default function AiQuickActions({ user, onAsk }: Props) {
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

  const tiles: Array<{ icon: string; label: string; value: number | null; ask: string; dot?: boolean }> = [
    { icon: '👥', label: ar ? 'الأصدقاء' : 'Friends', value: nums?.friends ?? null, ask: ar ? 'كم مستخدم أنا ضايف؟' : 'How many friends do I have?' },
    { icon: '🟢', label: ar ? 'أونلاين' : 'Online', value: nums?.online ?? null, ask: ar ? 'منو أونلاين من أصدقائي؟' : 'Who is online?', dot: true },
    { icon: '🖼', label: ar ? 'منشوراتي' : 'My posts', value: nums?.posts ?? null, ask: ar ? 'كم بوست أرسلت؟' : 'How many posts did I send?' },
    { icon: '📩', label: ar ? 'الطلبات' : 'Requests', value: nums?.requests ?? null, ask: ar ? 'طلبات الصداقة' : 'Friend requests' },
  ];

  const chips = ar
    ? ['منو أونلاين من أصدقائي؟', 'افتح الشات العام', 'ملخص حسابي', 'كم رصيدي؟', 'وش هو التطبيق؟']
    : ['Who is online?', 'Open the general chat', 'Account summary', 'My balance', 'What is Stooorna?'];

  return (
    <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {tiles.map(t => (
          <button
            key={t.label}
            type="button"
            onClick={() => onAsk(t.ask)}
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
            key={c}
            type="button"
            dir="auto"
            onClick={() => onAsk(c)}
            style={{
              border: '1px solid rgba(10,31,26,0.18)', background: '#f4f4f5', color: DARK_GREEN,
              borderRadius: 999, padding: '8px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
