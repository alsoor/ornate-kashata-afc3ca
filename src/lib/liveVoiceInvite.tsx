/**
 * liveVoiceInvite — دعوة أي شخص أونلاين لبثك الصوتي (/live)
 *
 * نفس فكرة دعوى البث المباشر (liveDuetPatch) لكن مختلفة:
 *  - الشخص المدعو ما يحتاج يكون فاتح بث. يكفي يكون أونلاين في التطبيق.
 *  - مربع الدعوى (قبول / رفض) يطلع فوق أي صفحة في التطبيق (مراقب عام يتركّب مرة وحدة في add-friend).
 *  - القبول يدخّل المدعو بث المضيف الصوتي كمستمع: /live?hostId=...
 *
 * التدفق
 *  1. المضيف (صاحب البث الصوتي) يضغط زر الدعوة في الشريط العلوي → قائمة المتصلين الآن + بحث.
 *  2. Invite → POST /api/voice-invite {action:'send'}  (صندوق وارد في السيرفر لمدة 45 ثانية).
 *  3. <VoiceInviteGlobalWatcher/> عند المدعو يسحب GET /api/voice-invite?scope=invites كل ثانيتين
 *     ويعرض مربع Accept / Decline في منتصف الشاشة.
 *  4. قبول → POST accept + navigate إلى /live عند المضيف. رفض → POST decline.
 *  5. المضيف يسحب GET /api/voice-invite?scope=replies ويظهر له "فلان رفض / قبل".
 *
 * السيرفر: server/entry.ts (قسم VOICE INVITE).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, X, Check, Search, Radio } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

/* ───────────────────────── types ───────────────────────── */

export type VoiceInvitePerson = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

export type OnlinePerson = VoiceInvitePerson & { online: boolean };

export type VoiceInviteIncoming = {
  id: string;
  hostId: string;
  hostName: string;
  hostUsername: string | null;
  hostAvatar: string | null;
  /** ms left according to the SERVER clock (no client clock skew) */
  ttlLeftMs: number;
  /** local time we received it */
  receivedAt: number;
};

export type VoiceInviteReply = {
  id: string;
  inviteId: string;
  fromId: string;
  fromName: string;
  status: 'accepted' | 'declined' | 'busy';
  at: number;
};

export const VOICE_INVITE_TTL_MS = 45_000;

/* ───────────────────────── helpers ───────────────────────── */

/** Same formula as `onlineRoomId` in add-friend.tsx (usePublishOnline). */
export function voiceOnlineRoomId(userId: string): string {
  const clean = String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return `stooorna-online-${clean || 'x'}`;
}

/** /live URL of a host's voice room (same params live.tsx reads). */
export function voiceRoomUrl(host: { userId: string; name?: string | null; username?: string | null; avatarUrl?: string | null }): string {
  const q = new URLSearchParams({
    hostId: host.userId,
    hostName: host.name || '',
    hostUsername: host.username || '',
    hostAvatar: host.avatarUrl || '',
  });
  return `/live?${q.toString()}`;
}

async function postInvite(body: Record<string, unknown>): Promise<any | null> {
  try {
    const r = await fetch('/api/voice-invite', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function isOnline(userId: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/room?id=${encodeURIComponent(voiceOnlineRoomId(userId))}`, { credentials: 'include' });
    if (!r.ok) return false;
    const d: any = await r.json();
    return Array.isArray(d?.members) && d.members.length > 0;
  } catch {
    return false;
  }
}

/** Friends who are online right now (same presence room the home page uses). */
export async function fetchOnlineFriends(myId: string): Promise<OnlinePerson[]> {
  try {
    const r = await fetch('/api/friends', { credentials: 'include' });
    if (!r.ok) return [];
    const d: any = await r.json();
    const friends: any[] = (d?.accepted ?? d?.friends ?? []).slice(0, 120);
    const rows = await Promise.all(
      friends.map(async (f) => {
        const id = String(f.friendId ?? f.id ?? '');
        if (!id || id === myId) return null;
        if (!(await isOnline(id))) return null;
        return {
          userId: id,
          name: f.name || f.username || 'User',
          username: f.username ?? null,
          avatarUrl: f.avatarUrl ?? null,
          online: true,
        } as OnlinePerson;
      }),
    );
    return rows.filter(Boolean) as OnlinePerson[];
  } catch {
    return [];
  }
}

/** Any user by name / @username, with their online flag. */
export async function searchUsersWithPresence(q: string, myId: string): Promise<OnlinePerson[]> {
  try {
    const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
    if (!r.ok) return [];
    const d: any = await r.json();
    const users: any[] = (Array.isArray(d) ? d : []).slice(0, 12);
    const rows = await Promise.all(
      users.map(async (u) => {
        const id = String(u?.id ?? '');
        if (!id || id === myId) return null;
        return {
          userId: id,
          name: u.name || u.username || 'User',
          username: u.username ?? null,
          avatarUrl: u.avatarUrl ?? null,
          online: await isOnline(id),
        } as OnlinePerson;
      }),
    );
    return (rows.filter(Boolean) as OnlinePerson[]).sort((a, b) => Number(b.online) - Number(a.online));
  } catch {
    return [];
  }
}

/* ───────────────────────── sent-invites store (host side) ───────────────────────── */

type SentMap = Record<string, { id: string; at: number }>;
let sentInvites: SentMap = {};
const sentListeners = new Set<() => void>();
const emitSent = () => sentListeners.forEach((fn) => fn());

function useSentInvites(): SentMap {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    sentListeners.add(fn);
    return () => { sentListeners.delete(fn); };
  }, []);
  return sentInvites;
}

export async function sendVoiceInvite(to: VoiceInvitePerson, me: VoiceInvitePerson): Promise<boolean> {
  const res = await postInvite({
    action: 'send',
    toUserId: to.userId,
    hostName: me.name,
    hostUsername: me.username,
    hostAvatar: me.avatarUrl,
  });
  if (!res?.ok) return false;
  sentInvites = { ...sentInvites, [to.userId]: { id: String(res.id || ''), at: Date.now() } };
  emitSent();
  return true;
}

export async function cancelVoiceInvite(toUserId: string): Promise<void> {
  const next = { ...sentInvites };
  delete next[toUserId];
  sentInvites = next;
  emitSent();
  await postInvite({ action: 'cancel', toUserId });
}

/** Host left / ended the live → withdraw every pending invite. */
export function cancelAllVoiceInvites(): void {
  if (!Object.keys(sentInvites).length) return;
  sentInvites = {};
  emitSent();
  void postInvite({ action: 'cancel-all' });
}

/* ───────────────────────── hook: host receives accept / decline ───────────────────────── */

export function useVoiceInviteReplies(enabled: boolean, onReply: (r: VoiceInviteReply) => void): void {
  const cbRef = useRef(onReply);
  cbRef.current = onReply;
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const seen = new Set<string>();
    const tick = async () => {
      try {
        const r = await fetch('/api/voice-invite?scope=replies', { credentials: 'include' });
        if (!r.ok || stop) return;
        const d: any = await r.json();
        for (const x of (Array.isArray(d?.replies) ? d.replies : []) as VoiceInviteReply[]) {
          if (!x || seen.has(x.id)) continue;
          seen.add(x.id);
          const next = { ...sentInvites };
          delete next[String(x.fromId)];
          sentInvites = next;
          emitSent();
          cbRef.current(x);
        }
      } catch { /* ignore */ }
    };
    void tick();
    const iv = window.setInterval(tick, 2000);
    return () => { stop = true; window.clearInterval(iv); };
  }, [enabled]);
}

/* ───────────────────────── UI: header button ───────────────────────── */

export function VoiceInviteButton({ onClick, active }: { onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="استدعاء شخص لبثك الصوتي"
      title="استدعاء للبث"
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#facc15',
        background: active ? 'rgba(250,204,21,0.28)' : 'rgba(250,204,21,0.12)',
        border: '1.5px solid rgba(250,204,21,0.85)',
        boxShadow: '0 0 8px rgba(250,204,21,0.45)',
        flexShrink: 0,
      }}
    >
      <UserPlus size={17} strokeWidth={2.3} />
    </button>
  );
}

/* ───────────────────────── UI: invite panel (host side) ───────────────────────── */

export function VoiceInvitePanel({
  open,
  me,
  onClose,
}: {
  open: boolean;
  me: VoiceInvitePerson | null;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<OnlinePerson[]>([]);
  const [found, setFound] = useState<OnlinePerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [, tick] = useState(0);
  const sent = useSentInvites();
  const alive = useRef(true);
  const myId = me?.userId;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // online friends — refreshed every 4s while the panel is open
  useEffect(() => {
    if (!open || !myId) return;
    let stop = false;
    let first = true;
    const run = async () => {
      if (first) setLoading(true);
      const l = await fetchOnlineFriends(myId);
      if (stop || !alive.current) return;
      setFriends(l);
      setLoading(false);
      first = false;
    };
    void run();
    const iv = window.setInterval(run, 4000);
    const iv2 = window.setInterval(() => tick((n) => n + 1), 1000); // refresh "Invited" state
    return () => { stop = true; window.clearInterval(iv); window.clearInterval(iv2); };
  }, [open, myId]);

  // search any user (debounced)
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!open || !myId || term.length < 2) { setFound([]); return; }
    let stop = false;
    const t = window.setTimeout(async () => {
      const l = await searchUsersWithPresence(term, myId);
      if (!stop && alive.current) setFound(l);
    }, 350);
    return () => { stop = true; window.clearTimeout(t); };
  }, [q, open, myId]);

  useEffect(() => { if (!open) setQ(''); }, [open]);

  const searching = q.trim().replace(/^@/, '').length >= 2;
  const list = searching ? found : friends;

  const row = (p: OnlinePerson) => {
    const s = sent[p.userId];
    const pending = !!s && Date.now() - s.at < VOICE_INVITE_TTL_MS;
    return (
      <div
        key={p.userId}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid rgba(0,188,212,0.08)' }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <UserAvatar
            name={p.name}
            avatarUrl={p.avatarUrl}
            size={40}
            style={{ borderRadius: '50%', border: `2.5px solid ${p.online ? '#22c55e' : 'rgba(150,200,200,0.3)'}` }}
          />
          <span
            style={{
              position: 'absolute', bottom: -2, right: -2, width: 11, height: 11, borderRadius: '50%',
              background: p.online ? '#22c55e' : '#6b7280', border: '2px solid #060e0e', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: '#dff6f6', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </p>
          <p style={{ margin: 0, fontSize: '0.64rem', color: 'rgba(150,200,200,0.55)', display: 'flex', gap: 6, alignItems: 'center' }}>
            {p.username ? <span>@{p.username}</span> : null}
            <span style={{ color: p.online ? '#22c55e' : '#9ca3af', fontWeight: 800 }}>
              {p.online ? '● أونلاين' : 'غير متصل'}
            </span>
          </p>
        </div>
        {pending ? (
          <button
            type="button"
            onClick={() => void cancelVoiceInvite(p.userId)}
            style={{
              padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 800, fontSize: '0.74rem',
              border: '1px solid rgba(150,200,200,0.35)', background: 'rgba(150,200,200,0.08)', color: 'rgba(200,230,230,0.8)',
            }}
          >
            تم · إلغاء
          </button>
        ) : (
          <button
            type="button"
            disabled={!p.online || !me}
            onClick={() => { if (me) void sendVoiceInvite(p, me); }}
            style={{
              padding: '7px 18px', borderRadius: 999, fontWeight: 800, fontSize: '0.78rem', border: 'none',
              cursor: p.online ? 'pointer' : 'not-allowed',
              background: p.online ? '#facc15' : 'rgba(150,200,200,0.15)',
              color: p.online ? '#1a1400' : 'rgba(200,230,230,0.4)',
            }}
          >
            استدعاء
          </button>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="voice-invite-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start' }}
        >
          <motion.div
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            style={{
              width: '100%',
              maxHeight: '70vh',
              marginTop: 'max(env(safe-area-inset-top, 0px), 8px)',
              background: 'rgba(6,16,18,0.98)',
              borderRadius: '0 0 18px 18px',
              border: '1px solid rgba(250,204,21,0.3)',
              borderTop: 'none',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px', borderBottom: '1px solid rgba(250,204,21,0.15)' }}>
              <UserPlus size={18} color="#facc15" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>استدعاء لبثك الصوتي</p>
                <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: '0.66rem' }}>
                  أي شخص أونلاين يوصله المربع حتى لو ما هو في بث
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                style={{ background: 'none', border: 'none', color: 'rgba(200,230,230,0.8)', cursor: 'pointer', padding: 6 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '10px 12px 4px' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
                  background: 'rgba(0,188,212,0.08)', border: '1px solid rgba(0,188,212,0.25)',
                }}
              >
                <Search size={15} color="rgba(150,200,200,0.7)" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث عن مستخدم بالاسم أو @اليوزر"
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#dff6f6', fontSize: '0.82rem' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px', WebkitOverflowScrolling: 'touch', minHeight: 120 }}>
              {!searching && (
                <p style={{ margin: '6px 2px 2px', color: 'rgba(150,200,200,0.55)', fontSize: '0.66rem', fontWeight: 700 }}>
                  المتصلون الآن من أصدقائك
                </p>
              )}
              {loading && !searching && list.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>جاري البحث عن المتصلين…</p>
              )}
              {!loading && !searching && list.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>
                  ما فيه أحد من أصدقائك أونلاين الحين — جرّب البحث بالاسم
                </p>
              )}
              {searching && list.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>لا نتائج</p>
              )}
              {list.map(row)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── UI: toast (host side) ───────────────────────── */

export function VoiceInviteToast({ text }: { text: string }) {
  return (
    <AnimatePresence>
      {text ? (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          dir="rtl"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 'calc(max(env(safe-area-inset-top,0px),14px) + 62px)',
            zIndex: 95,
            background: 'rgba(6,16,18,0.95)',
            border: '1px solid rgba(250,204,21,0.45)',
            color: '#fde68a',
            fontSize: '0.74rem',
            fontWeight: 800,
            padding: '8px 14px',
            borderRadius: 12,
            pointerEvents: 'none',
            maxWidth: '86%',
            textAlign: 'center',
          }}
        >
          {text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function voiceReplyText(r: VoiceInviteReply): string {
  const n = r.fromName || 'مستخدم';
  if (r.status === 'accepted') return `${n} قبل الدعوة وهو داخل البث`;
  if (r.status === 'busy') return `${n} مشغول الحين`;
  return `${n} رفض الدعوة`;
}

/* ───────────────────────── UI: GLOBAL incoming dialog (any screen) ───────────────────────── */

const answeredInvites = new Set<string>();

/**
 * Mount ONCE at the app root (next to GlobalIncomingCallWatcher in add-friend.tsx).
 * The invited person does NOT need to be live — the box appears on top of whatever screen they are on.
 */
export function VoiceInviteGlobalWatcher({ myId, myName }: { myId: string | null; myName?: string | null }) {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<VoiceInviteIncoming | null>(null);
  const inviteRef = useRef<VoiceInviteIncoming | null>(null);
  inviteRef.current = invite;
  const [left, setLeft] = useState(0);

  const answer = useCallback(
    (status: 'accepted' | 'declined' | 'busy') => {
      const inv = inviteRef.current;
      if (!inv) return;
      answeredInvites.add(inv.id);
      inviteRef.current = null;
      setInvite(null);
      void postInvite({
        action: status === 'accepted' ? 'accept' : status === 'busy' ? 'busy' : 'decline',
        inviteId: inv.id,
        hostId: inv.hostId,
        name: myName || undefined,
      });
      if (status === 'accepted') {
        navigate(voiceRoomUrl({ userId: inv.hostId, name: inv.hostName, username: inv.hostUsername, avatarUrl: inv.hostAvatar }));
      }
    },
    [navigate, myName],
  );

  // poll the inbox
  useEffect(() => {
    if (!myId) return;
    let stop = false;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const r = await fetch('/api/voice-invite?scope=invites', { credentials: 'include' });
        if (!r.ok || stop) return;
        const d: any = await r.json();
        const list: any[] = Array.isArray(d?.invites) ? d.invites : [];
        const fresh = list
          .filter((i) => i && i.id && !answeredInvites.has(String(i.id)) && String(i.hostId) !== String(myId))
          .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0];

        const cur = inviteRef.current;
        if (!fresh) {
          // the host cancelled / it expired
          if (cur) { inviteRef.current = null; setInvite(null); }
          return;
        }
        if (cur && cur.id === fresh.id) return;

        // already inside this host's voice room → nothing to ask
        try {
          const here = window.location;
          if (here.pathname.startsWith('/live') && new URLSearchParams(here.search).get('hostId') === String(fresh.hostId)) {
            answeredInvites.add(String(fresh.id));
            void postInvite({ action: 'accept', inviteId: fresh.id, hostId: fresh.hostId });
            return;
          }
        } catch { /* ignore */ }

        const inc: VoiceInviteIncoming = {
          id: String(fresh.id),
          hostId: String(fresh.hostId),
          hostName: String(fresh.hostName || 'User'),
          hostUsername: fresh.hostUsername ? String(fresh.hostUsername) : null,
          hostAvatar: fresh.hostAvatar ? String(fresh.hostAvatar) : null,
          ttlLeftMs: Math.max(0, Number(fresh.ttlLeftMs ?? VOICE_INVITE_TTL_MS)),
          receivedAt: Date.now(),
        };
        inviteRef.current = inc;
        setInvite(inc);
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
      } catch { /* ignore */ }
    };
    void poll();
    const iv = window.setInterval(poll, 2000);
    const onVis = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; window.clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [myId]);

  // countdown → auto decline at 0
  useEffect(() => {
    if (!invite) return;
    const end = invite.receivedAt + invite.ttlLeftMs;
    const upd = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) answer('declined');
    };
    upd();
    const iv = window.setInterval(upd, 500);
    return () => window.clearInterval(iv);
  }, [invite?.id, answer]);

  // Rendered through a portal on <body> so no parent stacking context (live card, transforms, overflow) can cover it.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);
  if (!portalReady || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {invite && (
        <motion.div
          key={`voice-invite-${invite.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          dir="rtl"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            style={{
              width: '100%',
              maxWidth: 320,
              background: '#0b1618',
              border: '1px solid rgba(250,204,21,0.45)',
              borderRadius: 20,
              padding: '20px 18px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 14px 44px rgba(0,0,0,0.55), 0 0 22px rgba(250,204,21,0.18)',
            }}
          >
            <div style={{ position: 'relative' }}>
              <UserAvatar
                name={invite.hostName}
                avatarUrl={invite.hostAvatar}
                size={64}
                style={{ borderRadius: '50%', border: '3px solid #facc15' }}
              />
              <span
                style={{
                  position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: '50%',
                  background: '#ef4444', border: '2px solid #0b1618', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Radio size={12} color="#fff" />
              </span>
            </div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.95rem', textAlign: 'center' }}>
              {invite.hostUsername ? `@${invite.hostUsername}` : invite.hostName}
            </p>
            <p style={{ margin: 0, color: 'rgba(200,230,230,0.8)', fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.5 }}>
              يدعوك للانضمام إلى بثه الصوتي
            </p>
            <p style={{ margin: 0, color: 'rgba(150,200,200,0.5)', fontSize: '0.62rem' }}>{left}s</p>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => answer('declined')}
                style={{
                  flex: 1, padding: '11px 8px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                  border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <X size={15} /> رفض
              </button>
              <button
                type="button"
                onClick={() => answer('accepted')}
                style={{
                  flex: 1, padding: '11px 8px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                  border: 'none', background: '#22c55e', color: '#04140a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Check size={15} /> قبول
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
