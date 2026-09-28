import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Trash2, ShieldAlert, Clock } from 'lucide-react';
import {
  LEVEL_META, type StrikeLevel, type ModerationNotice,
  noticesForUser, unseenCountForUser, markNoticesSeen, fetchNotices, onModerationChanged,
  getActiveBan, formatBanCountdown, createModerationNotice, snapshotStoryMedia, strikeCountForUser,
} from '@/lib/storyModeration';

const LEVELS: StrikeLevel[] = ['gray', 'orange', 'red'];

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
function useModerationVersion() {
  const [v, setV] = useState(0);
  useEffect(() => onModerationChanged(() => setV(x => x + 1)), []);
  return v;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; }
}

/** Colored strike dots (gray / orange / red) — one dot per recorded strike */
export function StrikeDots({ userId, extra }: { userId: string; extra?: StrikeLevel }) {
  useModerationVersion();
  const list = [...noticesForUser(userId)].reverse();
  const dots = list.map(n => n.level);
  if (extra) dots.push(extra);
  if (!dots.length) return <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem' }}>لا توجد مخالفات سابقة</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {dots.map((lv, i) => (
        <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: LEVEL_META[lv].color, opacity: extra && i === dots.length - 1 ? 0.55 : 1, outline: extra && i === dots.length - 1 ? '1px dashed #fff' : 'none' }} />
      ))}
    </span>
  );
}

/** Owner/moderator dialog: delete a user's story + message + level (gray / orange / red) */
export function StoryModerateDialog({
  story, target, onClose, onConfirmDelete,
}: {
  story: { id: number; mediaUrl: string; mediaType: string; overlayText?: string | null };
  target: { userId: string; username?: string | null; name?: string | null };
  onClose: () => void;
  /** called AFTER the notice is saved — must remove the story (UI + server) */
  onConfirmDelete: () => void;
}) {
  const [level, setLevel] = useState<StrikeLevel>('gray');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const strikes = strikeCountForUser(target.userId);
  const isVideo = /video/i.test(story.mediaType);
  const label = target.username ? `@${String(target.username).replace(/^@/, '')}` : (target.name || 'المستخدم');

  async function submit() {
    if (busy) return;
    if (message.trim().length < 3) { setErr('اكتب رسالة للمستخدم توضّح سبب الحذف'); return; }
    setBusy(true); setErr('');
    try {
      // snapshot BEFORE deleting so the user can still see what was removed
      const thumb = await snapshotStoryMedia(story.mediaUrl, story.mediaType);
      await createModerationNotice({ target, story, level, message, thumbDataUrl: thumb });
      onConfirmDelete();
      onClose();
    } catch {
      setErr('تعذّر إكمال العملية، حاول مرة ثانية');
      setBusy(false);
    }
  }

  return createPortal(
    <div dir="rtl" onClick={e => { e.stopPropagation(); }} style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, maxHeight: '92vh', overflowY: 'auto', background: '#0b1416', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 18, padding: 16, color: '#fff', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ShieldAlert size={20} color="#ef4444" />
          <p style={{ margin: 0, flex: 1, fontWeight: 800, fontSize: '0.95rem' }}>حذف ستوري {label}</p>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ width: 64, height: 84, borderRadius: 10, overflow: 'hidden', background: '#000', flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }}>
            {isVideo
              ? <video src={story.mediaUrl} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={story.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
            <div>المخالفات المسجّلة: <StrikeDots userId={target.userId} extra={level} /></div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>{strikes === 0 ? 'هذه أول مخالفة له' : `له ${strikes} مخالفة سابقة`}</div>
          </div>
        </div>

        <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700 }}>رسالة للمستخدم (تصله في الجرس)</p>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={600}
          placeholder="مثال: تم حذف الستوري لمخالفته حقوق النشر وقوانين التطبيق…"
          style={{ width: '100%', boxSizing: 'border-box', resize: 'none', padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit' }}
        />

        <p style={{ margin: '12px 0 6px', fontSize: '0.75rem', fontWeight: 700 }}>اختر الإجراء</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEVELS.map(lv => {
            const on = level === lv;
            return (
              <button key={lv} type="button" onClick={() => setLevel(lv)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit',
                background: on ? `${LEVEL_META[lv].color}22` : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${on ? LEVEL_META[lv].color : 'rgba(255,255,255,0.12)'}`, color: '#fff',
              }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: LEVEL_META[lv].color, flexShrink: 0, boxShadow: on ? `0 0 10px ${LEVEL_META[lv].color}` : 'none' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{LEVEL_META[lv].label}</span>
              </button>
            );
          })}
        </div>

        {err && <p style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: '0.75rem' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, padding: '10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
          <button type="button" onClick={() => void submit()} disabled={busy} style={{ flex: 1.6, padding: '10px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
            <Trash2 size={15} /> {busy ? '…' : 'حذف نهائي وإرسال'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Bell (under the Settings icon) — every user sees the notices the owner sent to them */
export function StoryModerationBell({ userId, style }: { userId?: string | null; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const ver = useModerationVersion();
  useTick(open ? 1000 : 30000);

  const refresh = useCallback(() => { if (userId) void fetchNotices({ userId }); }, [userId]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const unseen = useMemo(() => unseenCountForUser(userId), [userId, ver, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = noticesForUser(userId);
  const ban = getActiveBan(userId);
  if (!userId) return null;

  return (
    <>
      <button
        type="button"
        aria-label="الإشعارات"
        title="الإشعارات"
        onClick={() => { setOpen(true); void markNoticesSeen(userId); }}
        style={{
          position: 'relative', width: 38, height: 38, borderRadius: '50%', padding: 0, cursor: 'pointer',
          border: `1.5px solid ${unseen > 0 ? '#ef4444' : 'rgba(255,255,255,0.6)'}`,
          background: 'rgba(255,255,255,0.1)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: unseen > 0 ? '0 0 12px rgba(239,68,68,0.55)' : '0 0 12px rgba(255,255,255,0.28), 0 4px 16px rgba(0,0,0,0.45)',
          ...style,
        }}
      >
        <Bell size={18} strokeWidth={2.2} color="#fff" />
        {unseen > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #0b1416' }}>{unseen}</span>
        )}
      </button>

      {open && createPortal(
        <div dir="rtl" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column' }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))', borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
            <Bell size={18} />
            <p style={{ margin: 0, flex: 1, fontWeight: 800 }}>الإشعارات</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={22} /></button>
          </div>

          <div onClick={e => e.stopPropagation()} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ban && (
              <div style={{ padding: 12, borderRadius: 14, background: `${LEVEL_META[ban.level].color}18`, border: `1px solid ${LEVEL_META[ban.level].color}`, color: '#fff' }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={15} /> أنت ممنوع من نشر الستوري</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', direction: 'ltr', textAlign: 'right' }}>باقي: {formatBanCountdown(ban.until - Date.now()).text}</p>
              </div>
            )}
            {list.length === 0 && (
              <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>لا توجد إشعارات</div>
            )}
            {list.map(n => <NoticeCard key={n.id} n={n} />)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function NoticeCard({ n }: { n: ModerationNotice }) {
  const meta = LEVEL_META[n.level];
  const isVideo = /video/i.test(n.mediaType);
  const [broken, setBroken] = useState(false);
  const thumb = n.thumbDataUrl || (!isVideo && !broken ? n.mediaUrl : null);
  const banActive = !!n.banUntil && !n.banLifted && +new Date(n.banUntil) > Date.now();
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${meta.color}66`, background: 'rgba(255,255,255,0.04)', padding: 12, color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: meta.color }} />
        <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>تم حذف ستوري لك — {meta.short}</span>
        <span style={{ marginRight: 'auto', color: 'rgba(255,255,255,0.45)', fontSize: '0.66rem' }}>{fmtDate(n.createdAt)}</span>
      </div>
      {thumb ? (
        <img src={thumb} alt="" onError={() => setBroken(true)} style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12, background: '#000', marginBottom: 8 }} />
      ) : isVideo && !broken ? (
        <video src={n.mediaUrl} controls muted playsInline onError={() => setBroken(true)} style={{ width: '100%', maxHeight: 260, borderRadius: 12, background: '#000', marginBottom: 8 }} />
      ) : (
        <div style={{ padding: 18, textAlign: 'center', borderRadius: 12, background: '#000', color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginBottom: 8 }}>تم حذف الوسائط نهائياً</div>
      )}
      <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.message}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>
        <span>المخالفة رقم {n.strikeNumber}</span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {Array.from({ length: n.strikeNumber }).map((_, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === n.strikeNumber - 1 ? meta.color : 'rgba(255,255,255,0.3)' }} />
          ))}
        </span>
        {banActive && <span style={{ marginRight: 'auto', color: meta.color, fontWeight: 700 }}>الحظر ساري حتى {fmtDate(n.banUntil!)}</span>}
        {n.banLifted && <span style={{ marginRight: 'auto', color: '#86efac' }}>تم رفع الحظر</span>}
      </div>
    </div>
  );
}

/** Shown when a banned user tries to publish a story — live countdown */
export function StoryBanModal({ userId, onClose }: { userId?: string | null; onClose: () => void }) {
  useTick(1000);
  const ban = getActiveBan(userId);
  useEffect(() => { if (!ban) onClose(); }, [ban, onClose]);
  if (!ban) return null;
  const cd = formatBanCountdown(ban.until - Date.now());
  const color = LEVEL_META[ban.level].color;
  return createPortal(
    <div dir="rtl" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, textAlign: 'center', background: '#0b1416', border: `1.5px solid ${color}`, borderRadius: 20, padding: 20, color: '#fff', fontFamily: 'inherit' }}>
        <ShieldAlert size={38} color={color} />
        <p style={{ margin: '10px 0 4px', fontWeight: 800, fontSize: '1rem' }}>غير مسموح لك بالنشر</p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
          {cd.days > 0 ? `باقي ${cd.days === 1 ? 'يوم' : cd.days === 2 ? 'يومين' : cd.days + ' أيام'} تقدر بعدها تنشر ستوري` : 'باقي القليل وتقدر تنشر ستوري'}
        </p>
        <div style={{ margin: '14px 0', direction: 'ltr', display: 'flex', justifyContent: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
          {[['يوم', String(cd.days).padStart(2, '0')], ['ساعة', cd.hh], ['دقيقة', cd.mm], ['ثانية', cd.ss]].map(([l, v]) => (
            <div key={l} style={{ minWidth: 56, padding: '8px 4px', borderRadius: 12, background: `${color}22`, border: `1px solid ${color}66` }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)' }}>{l}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onClose} style={{ padding: '9px 26px', borderRadius: 20, border: 'none', background: color, color: '#111', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>حسناً</button>
      </div>
    </div>,
    document.body,
  );
}
