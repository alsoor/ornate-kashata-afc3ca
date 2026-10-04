/**
 * liveDuetPatch — Live-camera duet / invite patch
 *
 * One self-contained file for the "invite another live to join my live" feature
 * (TikTok-style split screen). Used by /live-camera.
 *
 * Flow
 *  1. Host A taps the invite button (top bar) → list of people who are live on camera right now.
 *  2. A taps "Invite" on a user → signal `duet-invite` is sent to that user's own live channel.
 *  3. User B (live host in their own room) sees a centered Accept / Decline box.
 *  4. Decline → `duet-decline` back to A.  Accept → B leaves their own live (their viewers are moved
 *     along with `duet-moved`) and joins A's room as a camera guest (`?duet=1`).
 *  5. Everyone in A's room sees the screen split in two halves: A on the left, B on the right,
 *     with a yellow divider line. A can end the duet at any time.
 *
 * Signals (all travel through the existing publishLiveSignal / postLiveSignalHttp transport and,
 * for in-room ones, the Agora data stream):
 *   duet-invite   A → B's channel     { id, to, from }
 *   duet-cancel   A → B's channel     { id, to }
 *   duet-decline  B → A's channel     { id, to, from }
 *   duet-accept   B → A's channel     { id, to, from }          (informational)
 *   duet-join     guest → A's room    { uid, guest }
 *   duet-set      A → A's room        { guest | null }          (re-sent every 2.5s while active)
 *   duet-end      A → A's room        { uid }
 *   duet-leave    guest → A's room    { uid }
 *   duet-moved    B → B's old room    { hostId, toHostId, toName, ... }
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, X, Check } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { publishLiveSignal, postLiveSignalHttp } from '@/lib/liveRoomStage';

/* ───────────────────────── types ───────────────────────── */

export type DuetPerson = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

/** The guest currently sharing the screen with the room host. */
export type DuetGuest = DuetPerson & { uid: number };

export type DuetInvite = {
  id: string;
  from: DuetPerson;
  at: number;
};

export type AvailableLive = DuetPerson;

export const DUET_INVITE_TTL_MS = 30_000;

/* ───────────────────────── helpers ───────────────────────── */

function uidFromString(s: string): number {
  if (!s || s === '0') return 0;
  return Math.abs(s.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0)) % 100_000 || 1;
}

/** Must stay identical to the `channelName` formula in live-camera.tsx. */
export function camChannelForHost(hostId: string): string {
  const id = hostId || 'none';
  return `stooorna-livecam-${id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || uidFromString(id)}`;
}

/** Send a signal into any live channel (not only the one we are in). */
export function sendDuetSignal(channel: string, payload: Record<string, unknown>): void {
  try { publishLiveSignal(channel, payload as any); } catch { /* ignore */ }
  try { void postLiveSignalHttp(channel, payload as any); } catch { /* ignore */ }
}

export function isDuetMessage(msg: any): boolean {
  return !!msg && typeof msg.t === 'string' && msg.t.startsWith('duet-');
}

export function newDuetId(myId: string): string {
  return `${myId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Build the /live-camera URL for someone else's room.
 * asGuest=true  → the person joins as a camera guest (split screen)
 * asGuest=false → plain viewer (used to move the viewers of a host who just joined a duet)
 */
export function duetRoomUrl(host: DuetPerson, asGuest = true): string {
  const q = new URLSearchParams({
    hostId: host.userId,
    hostName: host.name || '',
    hostUsername: host.username || '',
    hostAvatar: host.avatarUrl || '',
  });
  if (asGuest) q.set('duet', '1');
  return `/live-camera?${q.toString()}`;
}

/**
 * Who is live on camera right now?
 *  1) server presence (public lives) — GET /api/live-presence?kind=camera (ignored if it does not exist)
 *  2) friends whose camera room currently has members — same /api/room check the home page uses
 */
export async function fetchAvailableCamLives(myId: string): Promise<AvailableLive[]> {
  const out = new Map<string, AvailableLive>();
  const add = (p: Partial<DuetPerson> & { userId?: string }) => {
    const id = String(p.userId || '');
    if (!id || id === myId || out.has(id)) return;
    out.set(id, {
      userId: id,
      name: p.name || p.username || 'User',
      username: p.username ?? null,
      avatarUrl: p.avatarUrl ?? null,
    });
  };

  try {
    const r = await fetch('/api/live-presence?kind=camera', { credentials: 'include' });
    if (r.ok) {
      const d: any = await r.json();
      const list: any[] = Array.isArray(d) ? d : d?.lives ?? d?.presence ?? d?.items ?? d?.hosts ?? [];
      for (const x of list) {
        if (!x) continue;
        if (x.kind && x.kind !== 'camera') continue;
        if (x.active === false) continue;
        add({
          userId: x.hostId ?? x.userId ?? x.id,
          name: x.hostName ?? x.name,
          username: x.hostUsername ?? x.username,
          avatarUrl: x.hostAvatar ?? x.avatarUrl,
        });
      }
    }
  } catch { /* endpoint optional */ }

  try {
    const r = await fetch('/api/friends', { credentials: 'include' });
    if (r.ok) {
      const d: any = await r.json();
      const friends: any[] = (d?.accepted ?? d?.friends ?? []).slice(0, 80);
      const alive = await Promise.all(
        friends.map(async (f) => {
          const fid = String(f.friendId ?? f.id ?? '');
          if (!fid || out.has(fid) || fid === myId) return null;
          try {
            const rr = await fetch(`/api/room?id=${encodeURIComponent(camChannelForHost(fid))}`, { credentials: 'include' });
            if (!rr.ok) return null;
            const room: any = await rr.json();
            const m: any[] = Array.isArray(room?.members) ? room.members : [];
            if (!m.length) return null;
            const hasIds = m.some(x => x && x.userId);
            if (hasIds && !m.some(x => String(x.userId) === fid)) return null;
            return f;
          } catch { return null; }
        }),
      );
      for (const f of alive) {
        if (!f) continue;
        add({
          userId: String(f.friendId ?? f.id),
          name: f.name,
          username: f.username,
          avatarUrl: f.avatarUrl,
        });
      }
    }
  } catch { /* ignore */ }

  return [...out.values()];
}

/* ───────────────────────── UI: header button ───────────────────────── */

export function DuetInviteButton({ onClick, active }: { onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Invite a live to join"
      title="Invite to duet"
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

/* ───────────────────────── UI: invite list (host side) ───────────────────────── */

export function DuetInvitePanel({
  open,
  myId,
  sent,
  onInvite,
  onCancel,
  onClose,
}: {
  open: boolean;
  myId: string | undefined;
  /** hostId → time the invite was sent */
  sent: Record<string, number>;
  onInvite: (p: AvailableLive) => void;
  onCancel: (p: AvailableLive) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<AvailableLive[]>([]);
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!open || !myId) return;
    let stop = false;
    let first = true;
    const run = async () => {
      if (first) setLoading(true);
      const l = await fetchAvailableCamLives(myId);
      if (stop || !alive.current) return;
      setList(l);
      setLoading(false);
      first = false;
    };
    void run();
    const iv = window.setInterval(run, 4000);
    const iv2 = window.setInterval(() => tick(n => n + 1), 1000); // refresh "Invited" states
    return () => { stop = true; window.clearInterval(iv); window.clearInterval(iv2); };
  }, [open, myId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="duet-invite-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-start', // opens from the TOP
          }}
        >
          <motion.div
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '66vh',
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
                <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>Invite to your live</p>
                <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: '0.66rem' }}>People live on camera right now</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: 'rgba(200,230,230,0.8)', cursor: 'pointer', padding: 6 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', WebkitOverflowScrolling: 'touch', minHeight: 120 }}>
              {loading && list.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>Looking for live users…</p>
              )}
              {!loading && list.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>
                  No one is live on camera right now
                </p>
              )}
              {list.map(p => {
                const at = sent[p.userId];
                const pending = !!at && Date.now() - at < DUET_INVITE_TTL_MS;
                return (
                  <div
                    key={p.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 4px',
                      borderBottom: '1px solid rgba(0,188,212,0.08)',
                    }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <UserAvatar
                        name={p.name}
                        avatarUrl={p.avatarUrl}
                        size={40}
                        style={{ borderRadius: '50%', border: '2.5px solid #22c55e' }}
                      />
                      <span style={{
                        position: 'absolute', bottom: -2, right: -2, width: 11, height: 11, borderRadius: '50%',
                        background: '#22c55e', border: '2px solid #060e0e', boxSizing: 'border-box',
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, color: '#dff6f6', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.64rem', color: 'rgba(150,200,200,0.55)', display: 'flex', gap: 6, alignItems: 'center' }}>
                        {p.username ? <span>@{p.username}</span> : null}
                        <span style={{ color: '#ef4444', fontWeight: 800 }}>● LIVE</span>
                      </p>
                    </div>
                    {pending ? (
                      <button
                        type="button"
                        onClick={() => onCancel(p)}
                        style={{
                          padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 800, fontSize: '0.74rem',
                          border: '1px solid rgba(150,200,200,0.35)', background: 'rgba(150,200,200,0.08)', color: 'rgba(200,230,230,0.8)',
                        }}
                      >
                        Invited · Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onInvite(p)}
                        style={{
                          padding: '7px 18px', borderRadius: 999, cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem',
                          border: 'none', background: '#facc15', color: '#1a1400',
                        }}
                      >
                        Invite
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── UI: incoming invite (centered Accept / Decline) ───────────────────────── */

export function DuetIncomingDialog({
  invite,
  onAccept,
  onDecline,
}: {
  invite: DuetInvite | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [left, setLeft] = useState(0);
  const declineRef = useRef(onDecline);
  declineRef.current = onDecline;

  useEffect(() => {
    if (!invite) return;
    const end = invite.at + DUET_INVITE_TTL_MS;
    const upd = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) declineRef.current();
    };
    upd();
    const iv = window.setInterval(upd, 500);
    return () => window.clearInterval(iv);
  }, [invite?.id]);

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          key={`duet-incoming-${invite.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0,0,0,0.5)',
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
            <UserAvatar
              name={invite.from.name}
              avatarUrl={invite.from.avatarUrl}
              size={64}
              style={{ borderRadius: '50%', border: '3px solid #facc15' }}
            />
            <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.95rem', textAlign: 'center' }}>
              {invite.from.username ? `@${invite.from.username}` : invite.from.name}
            </p>
            <p style={{ margin: 0, color: 'rgba(200,230,230,0.8)', fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.45 }}>
              invites you to go live together
            </p>
            <p style={{ margin: 0, color: 'rgba(150,200,200,0.5)', fontSize: '0.62rem' }}>{left}s</p>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
              <button
                type="button"
                onClick={onDecline}
                style={{
                  flex: 1, padding: '11px 8px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                  border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <X size={15} /> Decline
              </button>
              <button
                type="button"
                onClick={onAccept}
                style={{
                  flex: 1, padding: '11px 8px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                  border: 'none', background: '#22c55e', color: '#04140a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Check size={15} /> Accept
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── UI: split-screen bits ───────────────────────── */

/** Yellow vertical line between the two halves. */
export function DuetDivider() {
  return (
    <div
      aria-hidden
      style={{
        width: 3,
        flexShrink: 0,
        background: '#facc15',
        boxShadow: '0 0 10px rgba(250,204,21,0.7)',
        zIndex: 1,
      }}
    />
  );
}

/** Small name tag shown on top of each half. */
export function DuetNameTag({ name, username }: { name: string; username?: string | null }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 6,
        right: 6,
        top: 'calc(max(env(safe-area-inset-top,0px),14px) + 98px)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <span
        style={{
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          fontSize: '0.64rem',
          fontWeight: 800,
          padding: '3px 9px',
          borderRadius: 999,
          border: '1px solid rgba(250,204,21,0.5)',
        }}
      >
        {username ? `@${username}` : name}
      </span>
    </div>
  );
}

/** Host-only button to stop the duet. */
export function DuetEndButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 'calc(max(env(safe-area-inset-top,0px),14px) + 128px)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        fontWeight: 800,
        fontSize: '0.66rem',
        color: '#ef4444',
        background: 'rgba(6,14,14,0.85)',
        border: '1px solid rgba(239,68,68,0.6)',
      }}
    >
      <X size={12} /> End duet
    </button>
  );
}

/** Small toast ("X declined", "X joined", ...). */
export function DuetToast({ text }: { text: string }) {
  return (
    <AnimatePresence>
      {text ? (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
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
