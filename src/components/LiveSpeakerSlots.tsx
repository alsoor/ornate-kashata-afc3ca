/**
 * LiveSpeakerSlots — دوائر المتحدثين على يمين شاشة البث (صوتي ومرئي).
 *
 *  - دوائر فارغة ثابتة على اليمين (أماكنها من TOPS تحت — الأرقام px من أعلى الصفحة).
 *  - أي شخص صاحب البث أعطاه المايك ياخذ أول دائرة فاضية ويثبت فيها.
 *  - صورته تكون مخفية بأقصى اليمين؛ لما يتكلم تنزلق من اليمين لليسار داخل دائرته،
 *    ولما يسكت ترجع تنزلق لليمين وتختفي (مثل الشتر).
 *  - الضغط على الصورة الظاهرة يشغّل نفس onMemberTap (قائمة الدعم / التجميد / الكتم).
 *  - كل صورة عليها data-gift-user عشان أنميشن الهدايا (البركان) يعرف مكانها.
 *
 * ملاحظة: صاحب البث نفسه ما ياخذ دائرة (صورته فوق يسار).
 */
import React, { useRef } from 'react';
import UserAvatar from '@/components/UserAvatar';

export type SlotMember = {
  uid: number;
  userId?: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  isMe?: boolean;
  isHost?: boolean;
};

// أماكن الدوائر (px من أعلى الصفحة). عدّل الأرقام لو تبي تحرّكها.
export const VOICE_SLOT_TOPS = [123, 178, 266, 365];
export const CAMERA_SLOT_TOPS = [147, 220, 311, 388];

const SIZE = 44;            // قطر الدائرة
const RIGHT_MARGIN = 14;    // المسافة من حافة الشاشة اليمين
const EXTRA_GAP = 72;       // مسافة الدوائر الزيادة لو المتحدثين أكثر من 4
const MAX_SLOTS = 8;

export function LiveSpeakerSlots({
  tops,
  speakers,
  speakingUids,
  frozenUids,
  mutedUids,
  micOn,
  micFrozenByHost,
  onTap,
}: {
  tops: number[];
  /** اللي معهم المايك (بدون صاحب البث) */
  speakers: SlotMember[];
  speakingUids: Set<number>;
  frozenUids: Set<number>;
  mutedUids: Set<number>;
  micOn: boolean;
  micFrozenByHost: boolean;
  onTap: (m: SlotMember) => void;
}) {
  // كل متحدث يثبت على دائرته طول ما معه المايك
  const slotOf = useRef<Map<number, number>>(new Map());
  const live = new Set(speakers.map(m => m.uid));
  for (const uid of Array.from(slotOf.current.keys())) if (!live.has(uid)) slotOf.current.delete(uid);
  const used = new Set(slotOf.current.values());
  for (const m of speakers) {
    if (slotOf.current.has(m.uid)) continue;
    let i = 0;
    while (used.has(i)) i++;
    if (i >= MAX_SLOTS) continue;
    slotOf.current.set(m.uid, i);
    used.add(i);
  }

  const maxIdx = slotOf.current.size ? Math.max(...Array.from(slotOf.current.values())) : -1;
  const count = Math.min(MAX_SLOTS, Math.max(tops.length, maxIdx + 1));
  const topAt = (i: number) => (i < tops.length ? tops[i] : tops[tops.length - 1] + EXTRA_GAP * (i - tops.length + 1));
  const bySlot = new Map<number, SlotMember>();
  for (const m of speakers) {
    const i = slotOf.current.get(m.uid);
    if (i !== undefined) bySlot.set(i, m);
  }
  const hideX = RIGHT_MARGIN + SIZE + 24; // يكفي ينزاح بره الشاشة

  return (
    <div
      aria-hidden={speakers.length === 0 ? true : undefined}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: SIZE + RIGHT_MARGIN + 6,
        overflow: 'hidden', pointerEvents: 'none', zIndex: 3,
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const m = bySlot.get(i);
        const talking = !!m && speakingUids.has(m.uid) && !(m.isMe && (micFrozenByHost || !micOn));
        const frozen = !!m && frozenUids.has(m.uid);
        const muted = !!m && mutedUids.has(m.uid);
        const ring = frozen ? '#ef4444' : talking ? '#22c55e' : '#facc15';
        return (
          <div
            key={i}
            style={{ position: 'absolute', top: topAt(i) - SIZE / 2, right: RIGHT_MARGIN, width: SIZE, height: SIZE }}
          >
            {/* الدائرة الفارغة */}
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%', boxSizing: 'border-box',
                border: `2px dashed ${m ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.3)'}`,
                background: 'rgba(0,188,212,0.05)',
              }}
            />
            {m ? (
              <button
                type="button"
                onClick={() => onTap(m)}
                aria-label={m.username ? `@${m.username}` : m.name}
                title={m.username ? `@${m.username}` : m.name}
                style={{
                  position: 'absolute', inset: 0, padding: 0, border: 'none', background: 'none',
                  cursor: m.isMe ? 'default' : 'pointer',
                  pointerEvents: talking ? 'auto' : 'none',
                  transform: talking ? 'translateX(0)' : `translateX(${hideX}px)`,
                  opacity: talking ? 1 : 0,
                  transition: talking
                    ? 'transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 160ms ease-out'
                    : 'transform 320ms cubic-bezier(0.55,0,0.9,0.4), opacity 320ms ease-in',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div data-gift-user={m.userId || undefined} style={{ position: 'relative', width: SIZE, height: SIZE }}>
                  <UserAvatar
                    name={m.name}
                    avatarUrl={m.avatarUrl}
                    size={SIZE}
                    style={{
                      boxSizing: 'border-box',
                      border: `2.5px solid ${ring}`,
                      borderRadius: '50%',
                      boxShadow: talking ? '0 0 0 1px rgba(34,197,94,0.25), 0 0 10px rgba(34,197,94,0.45)' : '0 0 8px rgba(250,204,21,0.35)',
                      opacity: frozen || muted ? 0.55 : 1,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%',
                      background: frozen ? '#ef4444' : talking ? '#22c55e' : '#ef4444',
                      border: '2px solid #060e0e', boxSizing: 'border-box',
                    }}
                  />
                  {m.isMe ? (
                    <span
                      style={{
                        position: 'absolute', bottom: -3, left: -3, fontSize: '0.4rem', fontWeight: 900,
                        background: '#00BCD4', color: '#041414', borderRadius: 6, padding: '1px 3px', border: '2px solid #060e0e',
                      }}
                    >
                      ME
                    </span>
                  ) : null}
                </div>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
