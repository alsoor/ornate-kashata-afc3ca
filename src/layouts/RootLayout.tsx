import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollRestoration, useLocation, useNavigate } from "react-router";
import { Home, Mic, MicOff, Settings, MessageCircle, X, Building2, Trash2, Menu, PhoneOff, Phone, Smile, Users, Volume2, VolumeX, Radio, Plus, Image as ImageIcon, Video, MoreVertical, Clock } from 'lucide-react';
import HomepageSameAsJsonLd from '@/components/HomepageSameAsJsonLd';
import Website from '@/layouts/Website';
import LiveKindPicker from '@/components/LiveKindPicker';
import UserAvatar from '@/components/UserAvatar';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSession } from '@/lib/auth/auth-client';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { playNotificationSound } from '@/lib/notificationSound';
import SplashScreen from '@/components/SplashScreen';
import WelcomeGuide from '@/components/WelcomeGuide';
import { startPublicBadgeSync } from '@/lib/publicVisibility';
interface RootLayoutProps {
  children: ReactElement;
}

/** هل الحساب الحالي شركة؟ (نفس منطق التطبيق) */
function isCompanySessionUser(user: any): boolean {
  if (!user) return false;
  const t = String(user.accountType || user.type || user.role || user.userType || '').toLowerCase();
  if (t === 'company' || t === 'business') return true;
  if (user.isCompany === true || user.company === true) return true;
  if (user.companyName || user.tradeName || user.licenseNumber || user.commercialLicense) return true;
  const email = String(user.email || '').trim().toLowerCase();
  const uid = String(user.id || '');
  try {
    const raw = localStorage.getItem('stooorna_companies_registry');
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.some((c: any) => {
      const em = String(c.email || '').toLowerCase();
      const id = String(c.userId || c.id || '');
      return (email && em === email) || (uid && id === uid);
    })) return true;
    const dir = localStorage.getItem('stooorna_companies_directory');
    const dlist = dir ? JSON.parse(dir) : [];
    if (Array.isArray(dlist) && dlist.some((c: any) => String(c.id || '') === uid || (email && String(c.email || '').toLowerCase() === email))) {
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ?? بث صوتي نشط لحساب المستخدم — نفس منطق صفحة البروفايل ??????????????????
function liveChannelForHost(hostId: string): string {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (clean) return `stooorna-live-${clean}`;
  let h = 0;
  const s = String(hostId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  const uid = Math.abs(h) % 100_000 || 1;
  return `stooorna-live-${uid}`;
}

function readLocalLiveActive(hostId: string): boolean {
  try {
    const raw = localStorage.getItem(`stooorna_live_active_${hostId}`);
    if (!raw) return false;
    const data = JSON.parse(raw) as { active?: boolean; at?: number };
    if (!data?.active) return false;
    if (data.at && Date.now() - data.at > 20_000) return false;
    return true;
  } catch {
    return false;
  }
}

function readLocalCamLiveActive(hostId: string): boolean {
  try {
    const raw = localStorage.getItem(`stooorna_livecam_active_${hostId}`);
    if (!raw) return false;
    const data = JSON.parse(raw) as { active?: boolean; at?: number };
    if (!data?.active) return false;
    if (data.at && Date.now() - data.at > 20_000) return false;
    return true;
  } catch {
    return false;
  }
}

function camChannelForHost(hostId: string): string {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (clean) return `stooorna-livecam-${clean}`;
  let h = 0;
  const s = String(hostId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  const uid = Math.abs(h) % 100_000 || 1;
  return `stooorna-livecam-${uid}`;
}

/** Voice or camera live active for this account */
function useLiveBroadcastActive(hostId: string | null | undefined): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!hostId) {
      setActive(false);
      return;
    }
    let cancelled = false;
    const channel = liveChannelForHost(hostId);
    const camChannel = camChannelForHost(hostId);

    const apply = (v: boolean) => {
      if (!cancelled) setActive(v);
    };

    const checkLocal = () => apply(readLocalLiveActive(hostId) || readLocalCamLiveActive(hostId));

    const checkRoom = async () => {
      if (readLocalLiveActive(hostId) || readLocalCamLiveActive(hostId)) {
        apply(true);
      }
      try {
        const rCam = await fetch(`/api/room?id=${encodeURIComponent(camChannel)}`, { credentials: 'include' });
        if (rCam.ok) {
          const data = await rCam.json() as { members?: unknown[] };
          const n = Array.isArray(data.members) ? data.members.length : 0;
          if (n > 0) {
            apply(true);
            return;
          }
        }
      } catch { /* ignore */ }
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!r.ok) {
          checkLocal();
          return;
        }
        const data = await r.json() as { members?: unknown[] };
        const n = Array.isArray(data.members) ? data.members.length : 0;
        if (n > 0) apply(true);
        else apply(readLocalLiveActive(hostId) || readLocalCamLiveActive(hostId));
      } catch {
        checkLocal();
      }
    };

    checkRoom();
    const interval = window.setInterval(checkRoom, 4000);

    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
      if (!d || !d.hostId) return;
      if (String(d.hostId) === String(hostId)) apply(!!d.active);
    };
    window.addEventListener('stooorna:live-active', onEvt);
    window.addEventListener('stooorna:livecam-active', onEvt);

    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_live_active_${hostId}` || e.key === `stooorna_livecam_active_${hostId}`) checkLocal();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('stooorna:live-active', onEvt);
      window.removeEventListener('stooorna:livecam-active', onEvt);
      window.removeEventListener('storage', onStorage);
    };
  }, [hostId]);

  return active;
}

type LiveBannerInfo = {
  hostId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  kind: 'voice' | 'camera';
};

function LiveJoinBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const [banner, setBanner] = useState<LiveBannerInfo | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBanner = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setBanner(null);
  };

  useEffect(() => {
    const path = location.pathname || '';
    const onLivePage =
      path === '/live' ||
      path.startsWith('/live/') ||
      path === '/live-camera' ||
      path.startsWith('/live-camera');

    const show = (info: LiveBannerInfo) => {
      if (user?.id && String(info.hostId) === String(user.id)) return;
      if (onLivePage) return;
      setBanner(info);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setBanner(null), 14000);
      try {
        playNotificationSound('request');
      } catch { /* ignore */ }
    };

    const resolveHost = async (
      hostId: string,
      kind: 'voice' | 'camera',
      partial?: { name?: string; username?: string | null; avatarUrl?: string | null },
    ) => {
      let name = partial?.name || '';
      let username = partial?.username ?? null;
      let avatarUrl = partial?.avatarUrl ?? null;
      if (!name || !avatarUrl) {
        try {
          const r = await fetch('/api/friends', { credentials: 'include' });
          if (r.ok) {
            const d = await r.json();
            const list = (d?.accepted ?? d?.friends ?? []) as Array<{
              friendId?: string;
              id?: string;
              name?: string | null;
              username?: string | null;
              avatarUrl?: string | null;
            }>;
            const f = list.find((x) => String(x.friendId ?? x.id ?? '') === String(hostId));
            if (f) {
              name = name || f.name || f.username || 'User';
              username = username ?? f.username ?? null;
              avatarUrl = avatarUrl ?? f.avatarUrl ?? null;
            }
          }
        } catch { /* ignore */ }
      }
      if (!name) name = 'User';
      show({ hostId, name, username, avatarUrl, kind });
    };

    const onVoice = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        hostId?: string;
        active?: boolean;
        name?: string;
        hostName?: string;
        username?: string;
        hostUsername?: string;
        avatarUrl?: string;
        hostAvatar?: string;
      } | undefined;
      if (!d?.hostId) return;
      if (!d.active) {
        setBanner((prev) => (prev && String(prev.hostId) === String(d.hostId) ? null : prev));
        return;
      }
      void resolveHost(String(d.hostId), 'voice', {
        name: d.hostName || d.name,
        username: d.hostUsername || d.username || null,
        avatarUrl: d.hostAvatar || d.avatarUrl || null,
      });
    };

    const onCam = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        hostId?: string;
        active?: boolean;
        name?: string;
        hostName?: string;
        username?: string;
        hostUsername?: string;
        avatarUrl?: string;
        hostAvatar?: string;
      } | undefined;
      if (!d?.hostId) return;
      if (!d.active) {
        setBanner((prev) => (prev && String(prev.hostId) === String(d.hostId) ? null : prev));
        return;
      }
      void resolveHost(String(d.hostId), 'camera', {
        name: d.hostName || d.name,
        username: d.hostUsername || d.username || null,
        avatarUrl: d.hostAvatar || d.avatarUrl || null,
      });
    };

    const onBanner = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        hostId?: string;
        active?: boolean;
        kind?: 'voice' | 'camera';
        hostName?: string;
        hostUsername?: string | null;
        hostAvatar?: string | null;
        message?: string;
      };
      if (!d?.hostId || !d.active) {
        if (d?.hostId && d.active === false) {
          setBanner((prev) => (prev && String(prev.hostId) === String(d.hostId) ? null : prev));
        }
        return;
      }
      void resolveHost(String(d.hostId), d.kind === 'camera' ? 'camera' : 'voice', {
        name: d.hostName || undefined,
        username: d.hostUsername ?? null,
        avatarUrl: d.hostAvatar ?? null,
      });
    };

    const readStorageLive = () => {
      try {
        for (const kind of ['voice', 'camera'] as const) {
          const curKey = kind === 'camera' ? 'stooorna_livecam_active_current' : 'stooorna_live_active_current';
          const raw = localStorage.getItem(curKey);
          if (!raw) continue;
          const d = JSON.parse(raw) as {
            hostId?: string;
            active?: boolean;
            at?: number;
            name?: string;
            username?: string | null;
            avatarUrl?: string | null;
            kind?: string;
          };
          if (!d?.hostId || !d.active) continue;
          if (d.at && Date.now() - Number(d.at) > 90_000) continue;
          if (user?.id && String(d.hostId) === String(user.id)) continue;
          void resolveHost(String(d.hostId), kind === 'camera' || d.kind === 'camera' ? 'camera' : 'voice', {
            name: d.name || undefined,
            username: d.username ?? null,
            avatarUrl: d.avatarUrl ?? null,
          });
        }
      } catch { /* ignore */ }
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === 'stooorna_live_active_current' ||
        e.key === 'stooorna_livecam_active_current' ||
        e.key.startsWith('stooorna_live_active_') ||
        e.key.startsWith('stooorna_livecam_active_')
      ) {
        readStorageLive();
      }
    };

    window.addEventListener('stooorna:live-active', onVoice);
    window.addEventListener('stooorna:livecam-active', onCam);
    window.addEventListener('stooorna:live-banner', onBanner as EventListener);
    window.addEventListener('storage', onStorage);
    readStorageLive();
    const pollId = window.setInterval(readStorageLive, 4000);
    return () => {
      window.removeEventListener('stooorna:live-active', onVoice);
      window.removeEventListener('stooorna:livecam-active', onCam);
      window.removeEventListener('stooorna:live-banner', onBanner as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(pollId);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [user?.id, location.pathname]);

  if (!banner) return null;

  const join = () => {
    const qs = new URLSearchParams({
      hostId: banner.hostId,
      hostName: banner.name,
      hostUsername: banner.username || '',
      hostAvatar: banner.avatarUrl || '',
    }).toString();
    clearBanner();
    navigate(banner.kind === 'camera' ? `/live-camera?${qs}` : `/live?${qs}`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 13050,
        padding: 'max(env(safe-area-inset-top, 0px), 10px) 12px 0',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={join}
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          borderRadius: 16,
          border: '1px solid rgba(239,68,68,0.45)',
          background: 'rgba(6,14,14,0.96)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 18px rgba(239,68,68,0.25)',
          cursor: 'pointer',
          textAlign: 'left',
          animation: 'stooornaLiveBannerIn 0.35s ease-out',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              borderRadius: '50%',
              padding: 2,
              boxShadow: '0 0 0 2px #ef4444, 0 0 12px rgba(239,68,68,0.5)',
              animation: 'stooornaLivePulse 1s ease-in-out infinite',
            }}
          >
            <UserAvatar name={banner.name} avatarUrl={banner.avatarUrl} size={44} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                background: '#ef4444',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.04em',
              }}
            >
              <Radio size={11} strokeWidth={2.5} />
              LIVE
            </span>
            <span style={{ color: 'rgba(200,230,230,0.55)', fontSize: 11, fontWeight: 600 }}>
              {banner.kind === 'camera' ? 'Camera' : 'Voice'}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {banner.name}
            {banner.username ? ` (@${banner.username})` : ''}
          </p>
          <p style={{ margin: 0, color: 'rgba(200,230,230,0.65)', fontSize: 12 }}>Tap to join live</p>
        </div>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            clearBanner();
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(200,230,230,0.7)',
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </span>
      </button>
    </div>
  );
}

type CompanyInboxPeer = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  lastMessage: string;
  at: number;
  unread: number;
};

const COMPANY_INBOX_KEY = (uid: string) => `stooorna_company_inbox_${uid}`;
const COMPANY_INBOX_SEEN_KEY = (uid: string) => `stooorna_company_inbox_seen_${uid}`;

function loadCompanyInbox(uid: string): CompanyInboxPeer[] {
  try {
    const raw = localStorage.getItem(COMPANY_INBOX_KEY(uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveCompanyInbox(uid: string, list: CompanyInboxPeer[]) {
  try {
    localStorage.setItem(COMPANY_INBOX_KEY(uid), JSON.stringify(list.slice(0, 200)));
    window.dispatchEvent(new CustomEvent('stooorna:company-inbox', { detail: { userId: uid, list } }));
  } catch { /* ignore */ }
}

/** دمج رسالة واردة للاستفسار عن منتج في صندوق الشركة */
export function pushCompanyInboxMessage(companyUserId: string, peer: {
  id: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  text: string;
}) {
  if (!companyUserId || !peer?.id) return;
  const list = loadCompanyInbox(companyUserId);
  const idx = list.findIndex(x => x.id === peer.id);
  const next: CompanyInboxPeer = {
    id: peer.id,
    name: peer.name ?? list[idx]?.name ?? null,
    username: peer.username ?? list[idx]?.username ?? null,
    avatarUrl: peer.avatarUrl ?? list[idx]?.avatarUrl ?? null,
    lastMessage: peer.text || list[idx]?.lastMessage || '',
    at: Date.now(),
    unread: (idx >= 0 ? (list[idx].unread || 0) : 0) + 1,
  };
  const out = idx >= 0 ? [next, ...list.filter((_, i) => i !== idx)] : [next, ...list];
  saveCompanyInbox(companyUserId, out);
}

/** صندوق شات المستخدم مع الشركات (يبدأ من استفسار الشير) */
const USER_PRODUCT_CHATS_KEY = (uid: string) => `stooorna_user_product_chats_${uid}`;
const USER_FRIEND_CHATS_KEY = (uid: string) => `stooorna_user_friend_chats_${uid}`;
function loadUserFriendChats(uid: string): CompanyInboxPeer[] {
  try {
    const raw = localStorage.getItem(USER_FRIEND_CHATS_KEY(uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function saveUserFriendChats(uid: string, list: CompanyInboxPeer[]) {
  try {
    localStorage.setItem(USER_FRIEND_CHATS_KEY(uid), JSON.stringify(list.slice(0, 200)));
    window.dispatchEvent(new CustomEvent('stooorna:user-friend-chats', { detail: { userId: uid, list } }));
  } catch { /* */ }
}

function loadUserProductChats(uid: string): CompanyInboxPeer[] {
  try {
    const raw = localStorage.getItem(USER_PRODUCT_CHATS_KEY(uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveUserProductChats(uid: string, list: CompanyInboxPeer[]) {
  try {
    localStorage.setItem(USER_PRODUCT_CHATS_KEY(uid), JSON.stringify(list.slice(0, 200)));
    window.dispatchEvent(new CustomEvent('stooorna:user-product-chats', { detail: { userId: uid, list } }));
  } catch { /* ignore */ }
}

/** عند إرسال استفسار من الشير — يُسجَّل عند المستخدم في أيقونة الشات السفلية */
export function pushUserProductChat(userId: string, company: {
  id: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  text: string;
  unread?: number;
}) {
  if (!userId || !company?.id) return;
  const list = loadUserProductChats(userId);
  const idx = list.findIndex(x => x.id === company.id);
  const next: CompanyInboxPeer = {
    id: company.id,
    name: company.name ?? list[idx]?.name ?? null,
    username: company.username ?? list[idx]?.username ?? null,
    avatarUrl: company.avatarUrl ?? list[idx]?.avatarUrl ?? null,
    lastMessage: company.text || list[idx]?.lastMessage || '',
    at: Date.now(),
    unread: company.unread != null ? company.unread : (idx >= 0 ? (list[idx].unread || 0) : 0),
  };
  const out = idx >= 0 ? [next, ...list.filter((_, i) => i !== idx)] : [next, ...list];
  saveUserProductChats(userId, out);
}

/** رد الشركة على المستخدم — يزيد غير المقروء ويصفّر الأيقونة للأصفر */
export function markUserProductChatReply(userId: string, companyId: string, text?: string) {
  if (!userId || !companyId) return;
  const list = loadUserProductChats(userId);
  const idx = list.findIndex(x => x.id === companyId);
  if (idx < 0) {
    pushUserProductChat(userId, { id: companyId, text: text || 'رد جديد من الشركة', unread: 1 });
    return;
  }
  const next = {
    ...list[idx],
    lastMessage: text || list[idx].lastMessage,
    at: Date.now(),
    unread: (list[idx].unread || 0) + 1,
  };
  saveUserProductChats(userId, [next, ...list.filter((_, i) => i !== idx)]);
}


type ShareThreadMsg = {
  id: string;
  fromId: string;
  type: 'text' | 'voice' | 'image' | 'video';
  body: string;
  duration?: number | null;
  at: number;
};
const SHARE_THREAD_KEY = (a: string, b: string, postId: string | number) => {
  const [x, y] = [String(a), String(b)].sort();
  return `stooorna_share_thread_${x}_${y}_${postId}`;
};
function loadShareThread(a: string, b: string, postId: string | number = 'share'): ShareThreadMsg[] {
  try {
    const raw = localStorage.getItem(SHARE_THREAD_KEY(a, b, postId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

const HOME_CALL_NO_ANSWER_MS = 45000;
type CallLogEntry = {
  id: string;
  peerId: string;
  peerName: string | null;
  peerAvatar: string | null;
  direction: 'in' | 'out';
  status: 'missed' | 'answered';
  at: number;
  durationSec?: number;
};
const CALL_LOG_KEY = (uid: string) => `stooorna_call_log_${uid}`;
function loadCallLog(uid: string): CallLogEntry[] {
  try {
    const raw = localStorage.getItem(CALL_LOG_KEY(uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function saveCallLog(uid: string, list: CallLogEntry[]) {
  try { localStorage.setItem(CALL_LOG_KEY(uid), JSON.stringify(list.slice(0, 200))); } catch { /* */ }
}
const VIDEO_CALL_LOG_KEY = (uid: string) => `stooorna_video_call_log_${uid}`;
function pushVideoCallLog(uid: string, entry: Omit<CallLogEntry, 'id'>) {
  try {
    const raw = localStorage.getItem(VIDEO_CALL_LOG_KEY(uid));
    const list = raw ? JSON.parse(raw) as CallLogEntry[] : [];
    const row: CallLogEntry = { ...entry, id: `vclog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
    const next = [row, ...(Array.isArray(list) ? list : [])].slice(0, 200);
    localStorage.setItem(VIDEO_CALL_LOG_KEY(uid), JSON.stringify(next));
  } catch { /* */ }
}

function pushCallLog(uid: string, entry: Omit<CallLogEntry, 'id'>) {
  if (!uid || !entry.peerId) return;
  const list = loadCallLog(uid);
  const next: CallLogEntry = { ...entry, id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  saveCallLog(uid, [next, ...list.filter(x => !(x.peerId === entry.peerId && Math.abs(x.at - entry.at) < 4000))]);
}
function recordMissedCallChat(a: string, b: string, fromId: string) {
  if (!a || !b) return;
  pushShareThreadMsg(a, b, 'direct', { fromId, type: 'text', body: 'Missed call' });
}
function isFreshHomeInvite(raw: any): boolean {
  if (!raw) return false;
  if (raw.ended || raw.answered || raw.clear) return false;
  const at = Number(raw?.at || 0);
  // Missing at: treat as fresh so API invites without a timestamp still ring
  if (!at) return true;
  return Date.now() - at <= HOME_CALL_NO_ANSWER_MS;
}

// Declined-call registry, persisted in localStorage (not just an in-memory
// ref) so a decline survives a page refresh: the in-memory "ignored" lock
// resets on reload, but this does not, so a call just declined never rings
// again on this device even if the server-side clear request for it is
// still in flight when the refresh happens. Keyed per exact call instance
// (channel + its start time) so a brand-new call from the same peer (same
// 1:1 channel, different start time) is never suppressed by an old decline.
const HOME_CALL_DECLINED_WINDOW_MS = 120000;
function homeCallDeclinedKey(uid: string): string {
  return `stooorna_home_call_declined_${uid}`;
}
function loadHomeCallDeclinedMap(uid: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(homeCallDeclinedKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}
function markHomeCallDeclined(uid: string, inviteKey: string) {
  if (!uid || !inviteKey) return;
  try {
    const map = loadHomeCallDeclinedMap(uid);
    const now = Date.now();
    map[inviteKey] = now;
    for (const key of Object.keys(map)) {
      if (now - map[key] > HOME_CALL_DECLINED_WINDOW_MS) delete map[key];
    }
    localStorage.setItem(homeCallDeclinedKey(uid), JSON.stringify(map));
  } catch { /* */ }
}
function isHomeCallRecentlyDeclined(uid: string, inviteKey: string): boolean {
  if (!uid || !inviteKey) return false;
  const at = loadHomeCallDeclinedMap(uid)[inviteKey];
  if (!at) return false;
  return Date.now() - at <= HOME_CALL_DECLINED_WINDOW_MS;
}
function homeInviteKey(channel: string, at: number | null | undefined): string {
  return `${channel}@${Number(at) || 0}`;
}

function pushShareThreadMsg(a: string, b: string, postId: string | number, msg: Omit<ShareThreadMsg, 'id' | 'at'>) {
  const list = loadShareThread(a, b, postId);
  list.push({ ...msg, id: `stm-${Date.now()}`, at: Date.now() });
  try {
    localStorage.setItem(SHARE_THREAD_KEY(a, b, postId), JSON.stringify(list.slice(-200)));
    window.dispatchEvent(new CustomEvent('stooorna:share-thread'));
  } catch { /* */ }
}

function GlobalBottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user
  } = useSession();
  const notifCounts = useNotificationCounts(!!user);
  const isCompanyAccount = useMemo(() => isCompanySessionUser(user), [user, (user as any)?.id, (user as any)?.email, (user as any)?.accountType]);
  const myLiveActive = useLiveBroadcastActive((user as any)?.id);

  // ?? صندوق شات الشركات (استفسارات المنتجات) — بدل المايك الأحمر ??
  const [companyChatOpen, setCompanyChatOpen] = useState(false);
  const [companyInbox, setCompanyInbox] = useState<CompanyInboxPeer[]>([]);
  const [companyUnreadTotal, setCompanyUnreadTotal] = useState(0);
  /** إشعار الأيقونة الخارجية — يُصفَّر عند فتح القائمة، يشتعل عند رسالة جديدة */
  const [companyIconAlert, setCompanyIconAlert] = useState(false);
  const prevUnreadRef = useRef(0);

  // ?? صندوق شات المستخدم مع الشركات (من الشير ? استفسار) ??
  const [userChatOpen, setUserChatOpen] = useState(false);
  const [userProductChats, setUserProductChats] = useState<CompanyInboxPeer[]>([]);
  const [userFriendChats, setUserFriendChats] = useState<CompanyInboxPeer[]>([]);
  const [userChatTab, setUserChatTab] = useState<'friends' | 'company'>('friends');
  const [userChatUnreadTotal, setUserChatUnreadTotal] = useState(0);
  const friendUnread = userFriendChats.reduce((s, p) => s + (p.unread || 0), 0);
  const bottomUserUnread = userChatUnreadTotal + friendUnread;

  const [userChatIconAlert, setUserChatIconAlert] = useState(false);
  const [miniChat, setMiniChat] = useState<{
    peerId: string; name: string | null; username: string | null; avatarUrl: string | null;
    postText?: string; note?: string; postId?: string | number;
    mediaItems?: { url: string; type: string }[];
  } | null>(null);
  const [miniText, setMiniText] = useState('');
  const [miniMsgs, setMiniMsgs] = useState<ShareThreadMsg[]>([]);
  const [miniRec, setMiniRec] = useState(false);
  const [chatPageClosing, setChatPageClosing] = useState(false);
  const miniRecRef = useRef<MediaRecorder | null>(null);
  const miniChunks = useRef<Blob[]>([]);
  const miniFileRef = useRef<HTMLInputElement | null>(null);
  const prevUserUnreadRef = useRef(0);
  /** فقاعات النقر — مرة واحدة عند الضغط ثم تُزال تلقائياً (لا تتكرر كل ثانية) */
  const [navBubble, setNavBubble] = useState<Record<string, number>>({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [liveKindOpen, setLiveKindOpen] = useState(false);
  const [friendsPanelOpen, setFriendsPanelOpen] = useState(false);
  const [storyMediaOpen, setStoryMediaOpen] = useState(false);
  const settingsSheetOpen = location.pathname === '/settings' || location.pathname.startsWith('/settings');

  // ── Auto-hide bottom bar on scroll ──────────────────────────────────────
  // The feed's scroll container (add-friend.tsx) dispatches a direction event
  // as the person scrolls. Scrolling further into the feed hides this bar so
  // posts get the full screen; scrolling back toward the top brings it back.
  // Purely local to the bar itself — nothing above it is ever affected.
  const [navBarHidden, setNavBarHidden] = useState(false);
  const [liveMapOpen, setLiveMapOpen] = useState(false);
  useEffect(() => {
    const onFeedScroll = (e: Event) => {
      const dir = (e as CustomEvent).detail?.dir as 'down' | 'up' | undefined;
      if (dir === 'down') setNavBarHidden(true);
      else if (dir === 'up') setNavBarHidden(false);
    };
    window.addEventListener('stooorna:feed-scroll', onFeedScroll);
    return () => window.removeEventListener('stooorna:feed-scroll', onFeedScroll);
  }, []);
  useEffect(() => {
    if (!location.pathname.startsWith('/add-friend')) setNavBarHidden(false);
  }, [location.pathname]);
  useEffect(() => {
    const onOpen = () => setFriendsPanelOpen(true);
    const onClose = () => setFriendsPanelOpen(false);
    window.addEventListener('stooorna:friends-panel-opened', onOpen);
    window.addEventListener('stooorna:friends-panel-closed', onClose);
    window.addEventListener('stooorna:close-friends-panel', onClose);
    const onMediaOpen = () => setStoryMediaOpen(true);
    const onMediaClose = () => setStoryMediaOpen(false);
    window.addEventListener('stooorna:story-media-opened', onMediaOpen);
    window.addEventListener('stooorna:story-media-closed', onMediaClose);
    window.addEventListener('stooorna:close-story-media', onMediaClose);
    const onLiveKind = (e: Event) => {
      setPlusMenuOpen(false);
      setLiveKindOpen(true);
      const overPosts = !!(e as CustomEvent).detail?.overPosts;
      try {
        if (overPosts) sessionStorage.setItem('stooorna_return_text_posts', '1');
      } catch { /* ignore */ }
    };
    window.addEventListener('stooorna:open-live-kind', onLiveKind);
    const onLiveMap = (e: Event) => {
      const d = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setLiveMapOpen(!!d?.open);
    };
    window.addEventListener('stooorna:live-map', onLiveMap);
    return () => {
      window.removeEventListener('stooorna:friends-panel-opened', onOpen);
      window.removeEventListener('stooorna:friends-panel-closed', onClose);
      window.removeEventListener('stooorna:close-friends-panel', onClose);
      window.removeEventListener('stooorna:story-media-opened', onMediaOpen);
      window.removeEventListener('stooorna:story-media-closed', onMediaClose);
      window.removeEventListener('stooorna:close-story-media', onMediaClose);
      window.removeEventListener('stooorna:open-live-kind', onLiveKind);
      window.removeEventListener('stooorna:live-map', onLiveMap);
    };
  }, []);
  useEffect(() => {
    if (!settingsSheetOpen) return;
    setPlusMenuOpen(false);
  }, [settingsSheetOpen]);
  const navBubbleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function popNavBubble(id: string) {
    if (navBubbleTimers.current[id]) clearTimeout(navBubbleTimers.current[id]);
    const tick = Date.now();
    setNavBubble(prev => ({ ...prev, [id]: tick }));
    navBubbleTimers.current[id] = setTimeout(() => {
      setNavBubble(prev => {
        if (prev[id] !== tick) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete navBubbleTimers.current[id];
    }, 560);
  }
  function NavBubble({ id, color = 'rgba(0,188,212,0.55)' }: { id: string; color?: string }) {
    const tick = navBubble[id];
    if (!tick) return null;
    return (
      <span
        key={tick}
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 52,
          height: 52,
          marginLeft: -26,
          marginTop: -26,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          boxShadow: `0 0 16px ${color}`,
          pointerEvents: 'none',
          animation: 'stooornaNavBubble 0.55s ease-out forwards',
          zIndex: 2,
        }}
      />
    );
  }

  useEffect(() => {
    if (!user?.id || !isCompanyAccount) {
      setCompanyInbox([]);
      setCompanyUnreadTotal(0);
      return;
    }
    const uid = user.id;
    const refresh = () => {
      const list = loadCompanyInbox(uid);
      setCompanyInbox(list);
      const total = list.reduce((s, p) => s + (p.unread || 0), 0);
      setCompanyUnreadTotal(total);
      // لا نُشعل الأيقونة هنا — فقط عند زيادة العداد (useEffect أدناه)
    };
    refresh();
    // أول تحميل: إن وُجدت رسائل غير مقروءة أظهر الإشعار
    const initial = loadCompanyInbox(uid);
    const initialTotal = initial.reduce((s, p) => s + (p.unread || 0), 0);
    if (initialTotal > 0) {
      prevUnreadRef.current = 0; // حتى يلتقط useEffect الزيادة
      setCompanyUnreadTotal(initialTotal);
    }

    // جلب رسائل واردة من الـ API إن وُجدت ودمجها
    let cancelled = false;
    const poll = async () => {
      try {
        const endpoints = [
          '/api/messages?inbox=1',
          '/api/messages?role=company',
          '/api/company/messages',
          '/api/messages',
        ];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const rows: any[] = Array.isArray(d) ? d : (d.messages || d.inbox || d.items || d.conversations || []);
            if (!rows.length) continue;
            let list = loadCompanyInbox(uid);
            let changed = false;
            for (const m of rows) {
              const fromId = String(m.fromUserId || m.senderId || m.userId || m.peerId || m.from || '');
              if (!fromId || fromId === uid) continue;
              // تجاهل رسائل الدعم / النظام إن وُجدت علامة
              if (m.isSupportTicket || m.isSupportReply) continue;
              const text = String(m.text || m.content || m.body || m.message || m.lastMessage || '');
              const at = m.at ? new Date(m.at).getTime() : (m.createdAt ? new Date(m.createdAt).getTime() : Date.now());
              const existing = list.find(x => x.id === fromId);
              if (existing && existing.at >= at) continue;
              const unreadAdd = m.unread === false || m.read === true ? 0 : 1;
              const next: CompanyInboxPeer = {
                id: fromId,
                name: m.fromName || m.senderName || m.name || existing?.name || null,
                username: m.fromUsername || m.username || existing?.username || null,
                avatarUrl: m.fromAvatarUrl || m.avatarUrl || existing?.avatarUrl || null,
                lastMessage: text || existing?.lastMessage || 'رسالة جديدة',
                at,
                unread: (existing?.unread || 0) + unreadAdd,
              };
              list = [next, ...list.filter(x => x.id !== fromId)];
              changed = true;
            }
            if (changed) saveCompanyInbox(uid, list);
            break;
          } catch { /* next endpoint */ }
        }
      } catch { /* silent */ }
      if (!cancelled) refresh();
    };
    poll();
    const interval = window.setInterval(poll, 5000);

    const onLocal = () => refresh();
    window.addEventListener('stooorna:company-inbox', onLocal);
    window.addEventListener('storage', onLocal);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('stooorna:company-inbox', onLocal);
      window.removeEventListener('storage', onLocal);
    };
  }, [user?.id, isCompanyAccount]);

  // صوت + تفعيل اللون الأصفر على الأيقونة عند رسالة جديدة
  useEffect(() => {
    if (!isCompanyAccount) return;
    if (companyUnreadTotal > prevUnreadRef.current) {
      setCompanyIconAlert(true);
      try { playNotificationSound('message' as any); } catch {
        try { playNotificationSound('request'); } catch { /* */ }
      }
    }
    prevUnreadRef.current = companyUnreadTotal;
  }, [companyUnreadTotal, isCompanyAccount]);

  // استقبال فوري من صفحات الشير/الشات: وميض أصفر + تحديث الصندوق
  useEffect(() => {
    if (!user?.id) return;
    const onBlink = (e: Event) => {
      const d = (e as CustomEvent).detail as { target?: string; userId?: string; yellow?: boolean } | undefined;
      if (!d?.yellow) return;
      if (d.target === 'company' && isCompanyAccount) {
        // تحديث فوري من localStorage
        const list = loadCompanyInbox(user.id);
        setCompanyInbox(list);
        const total = list.reduce((s, p) => s + (p.unread || 0), 0);
        setCompanyUnreadTotal(total);
        setCompanyIconAlert(true);
        try { playNotificationSound('message' as any); } catch {
          try { playNotificationSound('request'); } catch { /* */ }
        }
      }
      if (d.target === 'user' && !isCompanyAccount) {
        const list = loadUserProductChats(user.id);
        setUserProductChats(list);
        const total = list.reduce((s, p) => s + (p.unread || 0), 0);
        setUserChatUnreadTotal(total);
        setUserChatIconAlert(true);
        try { playNotificationSound('message' as any); } catch {
          try { playNotificationSound('request'); } catch { /* */ }
        }
      }
    };
    const onCompanyInbox = (e: Event) => {
      if (!isCompanyAccount) return;
      const d = (e as CustomEvent).detail as { userId?: string; list?: CompanyInboxPeer[] } | undefined;
      if (d?.userId && String(d.userId) !== String(user.id)) return;
      const list = Array.isArray(d?.list) ? d!.list! : loadCompanyInbox(user.id);
      setCompanyInbox(list);
      const total = list.reduce((s, p) => s + (p.unread || 0), 0);
      if (total > prevUnreadRef.current) {
        setCompanyIconAlert(true);
      }
      setCompanyUnreadTotal(total);
    };
    const onUserProduct = (e: Event) => {
      if (isCompanyAccount) return;
      const d = (e as CustomEvent).detail as { userId?: string; list?: CompanyInboxPeer[]; yellowBlink?: boolean } | undefined;
      if (d?.userId && String(d.userId) !== String(user.id)) return;
      const list = Array.isArray(d?.list) ? d!.list! : loadUserProductChats(user.id);
      setUserProductChats(list);
      const total = list.reduce((s, p) => s + (p.unread || 0), 0);
      if (d?.yellowBlink || total > prevUserUnreadRef.current) {
        setUserChatIconAlert(true);
      }
      setUserChatUnreadTotal(total);
    };
    window.addEventListener('stooorna:bottom-chat-blink', onBlink as EventListener);
    window.addEventListener('stooorna:company-inbox', onCompanyInbox as EventListener);
    window.addEventListener('stooorna:user-product-chats', onUserProduct as EventListener);
    return () => {
      window.removeEventListener('stooorna:bottom-chat-blink', onBlink as EventListener);
      window.removeEventListener('stooorna:company-inbox', onCompanyInbox as EventListener);
      window.removeEventListener('stooorna:user-product-chats', onUserProduct as EventListener);
    };
  }, [user?.id, isCompanyAccount]);


  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const peerId = String(d.peerId || d.id || '');
      if (!peerId) return;
      setMiniChat({
        peerId,
        name: d.name ?? null,
        username: d.username ?? null,
        avatarUrl: d.avatarUrl ?? null,
        postText: d.post?.text || d.postText || '',
        note: d.note || '',
        postId: d.post?.id || d.postId || 'share',
        mediaItems: d.mediaItems || d.post?.mediaItems || [],
      });
      setMiniMsgs(loadShareThread(user?.id || 'me', peerId, d.post?.id || d.postId || 'share'));
      setMiniText('');
    };
    window.addEventListener('stooorna:open-mini-share-chat', onOpen as EventListener);
    return () => window.removeEventListener('stooorna:open-mini-share-chat', onOpen as EventListener);
  }, [user?.id]);

  function openCompanyChatList() {
    setCompanyChatOpen(true);
    setCompanyIconAlert(false);
    navigate('/add-friend?panel=chats');
    if (user?.id) {
      try {
        localStorage.setItem(COMPANY_INBOX_SEEN_KEY(user.id), String(Date.now()));
      } catch { /* */ }
    }
  }

  function closeCompanyChatList() {
    setCompanyChatOpen(false);
  }

  function markPeerRead(peerId: string) {
    if (!user?.id) return;
    const list = loadCompanyInbox(user.id).map(p =>
      p.id === peerId ? { ...p, unread: 0 } : p,
    );
    saveCompanyInbox(user.id, list);
    setCompanyInbox(list);
    setCompanyUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
  }

  function openPeerChat(peer: CompanyInboxPeer) {
    markPeerRead(peer.id);
    setMiniChat({
      peerId: peer.id,
      name: peer.name,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
      postText: '',
      note: peer.lastMessage || '',
      postId: 'share',
    });
    setMiniMsgs(loadShareThread(user?.id || 'me', peer.id, 'share'));
    setMiniText('');
  }

  function deleteCompanyPeer(peerId: string) {
    if (!user?.id) return;
    if (!window.confirm('حذف هذه المحادثة من قائمة شات الشركة؟')) return;
    const list = loadCompanyInbox(user.id).filter(p => p.id !== peerId);
    saveCompanyInbox(user.id, list);
    setCompanyInbox(list);
    setCompanyUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
  }

  // ?? تحميل شات المستخدم مع الأصدقاء (من الشير) ??
  useEffect(() => {
    if (!user?.id || isCompanyAccount) {
      setUserFriendChats([]);
      return;
    }
    const uid = user.id;
    const refresh = () => setUserFriendChats(loadUserFriendChats(uid));
    refresh();
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as { userId?: string; list?: CompanyInboxPeer[] } | undefined;
      if (d?.userId && String(d.userId) !== String(uid)) return;
      setUserFriendChats(Array.isArray(d?.list) ? d!.list! : loadUserFriendChats(uid));
    };
    window.addEventListener('stooorna:user-friend-chats', onEvt as EventListener);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('stooorna:user-friend-chats', onEvt as EventListener);
      window.removeEventListener('storage', refresh);
    };
  }, [user?.id, isCompanyAccount]);

  // ?? تحميل شات المستخدم (مع الشركات) ??
  useEffect(() => {
    if (!user?.id || isCompanyAccount) {
      setUserProductChats([]);
      setUserChatUnreadTotal(0);
      return;
    }
    const uid = user.id;
    const refresh = () => {
      const list = loadUserProductChats(uid);
      setUserProductChats(list);
      setUserChatUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
    };
    refresh();
    const initial = loadUserProductChats(uid);
    const initialTotal = initial.reduce((s, p) => s + (p.unread || 0), 0);
    if (initialTotal > 0) {
      prevUserUnreadRef.current = 0;
      setUserChatUnreadTotal(initialTotal);
    }

    // استطلاع ردود الشركات على استفسارات المنتجات ? أصفر + صوت
    let cancelled = false;
    const pollCompanyReplies = async () => {
      const list = loadUserProductChats(uid);
      if (!list.length) return;
      let changed = false;
      const nextList = [...list];
      for (let i = 0; i < Math.min(nextList.length, 12); i++) {
        const peer = nextList[i];
        try {
          const dm = await fetch('/api/secret-chat/dm', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ peerId: peer.id }),
          });
          if (!dm.ok) continue;
          const dmData = await dm.json();
          const chatId = dmData.chatId || dmData.id;
          if (!chatId) continue;
          const mr = await fetch(`/api/secret-chat/messages?chatId=${chatId}`, { credentials: 'include' });
          if (!mr.ok) continue;
          const raw = await mr.json();
          const msgs = Array.isArray(raw) ? raw : (raw.messages || []);
          if (!msgs.length) continue;
          const last = msgs[msgs.length - 1];
          const senderId = String(last.senderId ?? last.sender_id ?? '');
          if (!senderId || senderId === uid) continue;
          const at = last.createdAt || last.created_at
            ? new Date(last.createdAt || last.created_at).getTime()
            : Date.now();
          // رسالة جديدة من الشركة بعد آخر تحديث محلي
          if (at > (peer.at || 0) + 500) {
            const body = String(last.body || last.text || last.content || '');
            const preview = body.startsWith('__PRODUCT_INQUIRY__')
              ? '?? استفسار منتج'
              : (body.slice(0, 80) || 'رد من الشركة');
            nextList[i] = {
              ...peer,
              name: last.senderName || last.sender_name || peer.name,
              username: last.senderUsername || last.sender_username || peer.username,
              avatarUrl: last.senderAvatarUrl || last.sender_avatar_url || peer.avatarUrl,
              lastMessage: preview,
              at,
              unread: (peer.unread || 0) + 1,
            };
            changed = true;
          }
        } catch { /* next peer */ }
      }
      if (changed && !cancelled) {
        // إعادة ترتيب حسب الأحدث
        nextList.sort((a, b) => (b.at || 0) - (a.at || 0));
        saveUserProductChats(uid, nextList);
        refresh();
      }
    };

    const onLocal = () => refresh();
    window.addEventListener('stooorna:user-product-chats', onLocal);
    window.addEventListener('storage', onLocal);
    void pollCompanyReplies();
    const interval = window.setInterval(() => {
      refresh();
      void pollCompanyReplies();
    }, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener('stooorna:user-product-chats', onLocal);
      window.removeEventListener('storage', onLocal);
      window.clearInterval(interval);
    };
  }, [user?.id, isCompanyAccount]);

  useEffect(() => {
    if (isCompanyAccount) return;
    if (userChatUnreadTotal > prevUserUnreadRef.current) {
      setUserChatIconAlert(true);
      try { playNotificationSound('message' as any); } catch {
        try { playNotificationSound('request'); } catch { /* */ }
      }
    }
    prevUserUnreadRef.current = userChatUnreadTotal;
  }, [userChatUnreadTotal, isCompanyAccount]);

  function openUserChatList() {
    setUserChatIconAlert(false);
    setUserChatOpen(true);
    navigate('/add-friend?panel=chats');
  }
  function closeUserChatList() {
    setUserChatOpen(false);
  }
  useEffect(() => {
    const onClose = () => {
      setMiniChat(null);
      setUserChatOpen(false);
      setCompanyChatOpen(false);
    };
    window.addEventListener('stooorna:close-chat-panels', onClose);
    return () => window.removeEventListener('stooorna:close-chat-panels', onClose);
  }, []);
  function dismissChatPage() {
    if (chatPageClosing) return;
    setChatPageClosing(true);
    window.setTimeout(() => {
      setChatPageClosing(false);
      setMiniChat(null);
      setUserChatOpen(false);
      setCompanyChatOpen(false);
      navigate('/add-friend?tab=friends');
    }, 280);
  }
  function markUserPeerRead(peerId: string) {
    if (!user?.id) return;
    const list = loadUserProductChats(user.id).map(p =>
      p.id === peerId ? { ...p, unread: 0 } : p,
    );
    saveUserProductChats(user.id, list);
    setUserProductChats(list);
    setUserChatUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
  }
  function openUserPeerChat(peer: CompanyInboxPeer) {
    markUserPeerRead(peer.id);
    setMiniChat({
      peerId: peer.id,
      name: peer.name,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
      postText: '',
      note: peer.lastMessage || '',
      postId: 'share',
    });
    setMiniMsgs(loadShareThread(user?.id || 'me', peer.id, 'share'));
    setMiniText('');
  }
  function deleteFriendPeer(peerId: string) {
    if (!user?.id) return;
    if (!window.confirm('حذف هذه المحادثة من Chat Friends؟')) return;
    const list = loadUserFriendChats(user.id).filter(p => p.id !== peerId);
    saveUserFriendChats(user.id, list);
    setUserFriendChats(list);
  }
  function openFriendPeerChat(peer: CompanyInboxPeer) {
    if (user?.id) {
      const list = loadUserFriendChats(user.id).map(p => p.id === peer.id ? { ...p, unread: 0 } : p);
      saveUserFriendChats(user.id, list);
      setUserFriendChats(list);
    }
    setMiniChat({
      peerId: peer.id,
      name: peer.name,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
      postText: (peer as any).postText || '',
      note: (peer as any).note || peer.lastMessage || '',
      postId: (peer as any).postId || 'share',
      mediaItems: (peer as any).mediaItems || [],
    });
    setMiniMsgs(loadShareThread(user?.id || 'me', peer.id, (peer as any).postId || 'share'));
    setMiniText('');
  }
  function deleteUserPeer(peerId: string) {
    if (!user?.id) return;
    if (!window.confirm('حذف هذه المحادثة من قائمتك؟ لن تُحذف رسائل الشات نفسها إلا إذا مسحتها من داخل المحادثة.')) return;
    const list = loadUserProductChats(user.id).filter(p => p.id !== peerId);
    saveUserProductChats(user.id, list);
    setUserProductChats(list);
    setUserChatUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
  }

  // Track secret-chat open/closed via event from the chat page
  const [secretChatOpen, setSecretChatOpen] = useState(false);
  useEffect(() => {
    function handleSecretChatState(e: Event) {
      const detail = (e as CustomEvent<{
        open: boolean;
      }>).detail;
      setSecretChatOpen(!!detail?.open);
    }
    window.addEventListener('stooorna:secret-chat-state', handleSecretChatState);
    return () => window.removeEventListener('stooorna:secret-chat-state', handleSecretChatState);
  }, []);

  // Track friend / share chat overlays on /add-friend so the bottom bar can hide
  const [friendChatOpen, setFriendChatOpen] = useState(false);
  useEffect(() => {
    function handleFriendChatState(e: Event) {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail;
      setFriendChatOpen(!!detail?.open);
    }
    window.addEventListener('stooorna:friend-chat-state', handleFriendChatState);
    return () => window.removeEventListener('stooorna:friend-chat-state', handleFriendChatState);
  }, []);

  /** صفحة دخول/تسجيل الشركات — تخفي الشريط السفلي */
  const [companyAuthOpen, setCompanyAuthOpen] = useState(false);
  useEffect(() => {
    function onCompanyAuth(e: Event) {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail;
      setCompanyAuthOpen(!!detail?.open);
    }
    window.addEventListener('stooorna:company-auth-open', onCompanyAuth);
    return () => window.removeEventListener('stooorna:company-auth-open', onCompanyAuth);
  }, []);

  // شات الدعم / Privacy / أي شاشة تطلب إخفاء الشريط عبر الحدث أو كلاس body
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  useEffect(() => {
    function handleBottomNav(e: Event) {
      const detail = (e as CustomEvent<{ hidden?: boolean }>).detail;
      setSupportChatOpen(!!detail?.hidden);
    }
    function syncFromBodyClass() {
      const hide =
        document.body.classList.contains('stooorna-support-chat-open') ||
        document.body.classList.contains('stooorna-privacy-open');
      setSupportChatOpen(hide);
    }
    window.addEventListener('stooorna:bottom-nav', handleBottomNav);
    syncFromBodyClass();
    const obs = new MutationObserver(syncFromBodyClass);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => {
      window.removeEventListener('stooorna:bottom-nav', handleBottomNav);
      obs.disconnect();
    };
  }, []);

  // يتبع حالة نافذة كتابة المنشور الجديد (مفتوحة/مغلقة) عبر الحدث المُطلق من صفحة الشات
  const [postComposerOpen, setPostComposerOpen] = useState(false);
  useEffect(() => {
    function handlePostComposerState(e: Event) {
      const detail = (e as CustomEvent<{
        open: boolean;
      }>).detail;
      setPostComposerOpen(!!detail?.open);
    }
    window.addEventListener('stooorna:post-composer-state', handlePostComposerState);
    return () => window.removeEventListener('stooorna:post-composer-state', handlePostComposerState);
  }, []);

  // يتبع حالة شيت "إرسال المنشور إلى الأصدقاء" (مفتوح/مغلق) عبر الحدث المُطلق من صفحة الشات
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  useEffect(() => {
    function handleShareSheetState(e: Event) {
      const detail = (e as CustomEvent<{
        open: boolean;
      }>).detail;
      setShareSheetOpen(!!detail?.open);
    }
    window.addEventListener('stooorna:share-sheet-state', handleShareSheetState);
    return () => window.removeEventListener('stooorna:share-sheet-state', handleShareSheetState);
  }, []);

  const [storyCameraOpen, setStoryCameraOpen] = useState(false);
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setStoryCameraOpen(!!detail?.open);
    };
    window.addEventListener('stooorna:story-camera-state', handle);
    return () => window.removeEventListener('stooorna:story-camera-state', handle);
  }, []);

  // يُبدأ من الرابط (?openTextPosts=1) أو class على body فقط — لا نفترض true لكل /add-friend
  // حتى لا يختفي الشريط السفلي ويتعطّل التنقل للهوم/شات/لايف.
  const [textPostsOpen, setTextPostsOpen] = useState(() => {
    try {
      if (typeof document !== 'undefined' && document.body.classList.contains('stooorna-text-posts-open')) return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get('openTextPosts') === '1') return true;
      return false;
    } catch {
      return false;
    }
  });
  // مزامنة من الرابط طالما العلامة موجودة (تُحذف بعد استهلاكها في add-friend)
  useEffect(() => {
    if (new URLSearchParams(location.search).get('openTextPosts') === '1') {
      setTextPostsOpen(true);
    }
  }, [location.search]);
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setTextPostsOpen(!!detail?.open);
    };
    const syncFromBodyClass = () => {
      setTextPostsOpen(document.body.classList.contains('stooorna-text-posts-open'));
    };
    window.addEventListener('stooorna:text-posts-state', handle);
    // class على body أوثق من الحدث وحده عند الخروج/الدخول للتطبيق
    const obs = new MutationObserver(syncFromBodyClass);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    syncFromBodyClass();
    return () => {
      window.removeEventListener('stooorna:text-posts-state', handle);
      obs.disconnect();
    };
  }, []);

  // Alert state of the text-posts radar button (published by the add-friend page)
  const [textPostsAlert, setTextPostsAlert] = useState<{ alert: boolean; newPosts: boolean }>(() => {
    try {
      const d = (window as any).__stooornaTextPostsAlert;
      if (d) return { alert: !!d.alert, newPosts: !!d.newPosts };
    } catch { /* ignore */ }
    return { alert: false, newPosts: false };
  });
  useEffect(() => {
    const handle = (event: Event) => {
      const d = (event as CustomEvent<{ alert?: boolean; newPosts?: boolean }>).detail;
      setTextPostsAlert({ alert: !!d?.alert, newPosts: !!d?.newPosts });
    };
    window.addEventListener('stooorna:text-posts-alert', handle);
    try {
      const d = (window as any).__stooornaTextPostsAlert;
      if (d) setTextPostsAlert({ alert: !!d.alert, newPosts: !!d.newPosts });
    } catch { /* ignore */ }
    return () => window.removeEventListener('stooorna:text-posts-alert', handle);
  }, []);

  // الشريط السفلي: يسار Home — منتصف مايك — يمين إعدادات
  // صفحة الشات الفردي (المحادثة المفتوحة)
  const isConversation = location.pathname === '/chat';
  const previousFriendRequestsRef = useRef(notifCounts.friendReqs);
  useEffect(() => {
    if (notifCounts.friendReqs > previousFriendRequestsRef.current) {
      playNotificationSound('request');
    }
    previousFriendRequestsRef.current = notifCounts.friendReqs;
  }, [notifCounts.friendReqs]);
  const panelParam = new URLSearchParams(location.search).get('panel');
  const isChatsPanel = panelParam === 'chats' || location.pathname === '/chats';
  const isHomeActive =
    (location.pathname === '/add-friend' || location.pathname === '/' || location.pathname === '') && !isChatsPanel;
  const isChatNavActive = isChatsPanel;
  useEffect(() => {
    if (isChatsPanel) {
      if (isCompanyAccount) setCompanyChatOpen(true);
      else setUserChatOpen(true);
    } else {
      setCompanyChatOpen(false);
      setUserChatOpen(false);
      setMiniChat(null);
      setMiniText('');
      setMiniRec(false);
    }
  }, [isChatsPanel, isCompanyAccount, location.pathname]);

  // انتقال مباشر للهوم (قصة/أصدقاء) — بدون وميض
  const openStoryHome = () => {
    if (textPostsOpen) {
      window.dispatchEvent(new CustomEvent('stooorna:close-text-posts'));
    }
    navigate('/add-friend?tab=friends');
  };

  // ?? مكالمة جماعية من سحب الهوم للأعلى (شكل واتساب) ??
  type HomeCallFriend = {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  type HomeCallMember = HomeCallFriend & { joined?: boolean };
  const [homeCallPickerOpen, setHomeCallPickerOpen] = useState(false);
  const [homeCallLogOpen, setHomeCallLogOpen] = useState(false);
  const [homeCallLogMenuOpen, setHomeCallLogMenuOpen] = useState(false);
  const [homeCallLogTick, setHomeCallLogTick] = useState(0);
  const homeCallNoAnswerTimer = useRef<number | null>(null);
  const homeCallSessionRef = useRef(0);
  const homeCallVideoRef = useRef(false);
  const homeCallCamRef = useRef<any>(null);
  const [homeCallIsVideo, setHomeCallIsVideo] = useState(false);
  const [pipPos, setPipPos] = useState({ x: 16, y: 80 });
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLDivElement | null>(null);
  const homeCallLiveStartedAt = useRef<number | null>(null);
  const [homeCallFriends, setHomeCallFriends] = useState<HomeCallFriend[]>([]);
  const [homeCallSelected, setHomeCallSelected] = useState<Record<string, boolean>>({});
  const [pendingDirectCallId, setPendingDirectCallId] = useState<string | null>(null);
  const pendingVideoRef = useRef(false);
  const [homeCallPhase, setHomeCallPhase] = useState<'idle' | 'animating' | 'connecting' | 'live'>('idle');
  const homeCallPhaseRef = useRef(homeCallPhase);
  useEffect(() => { homeCallPhaseRef.current = homeCallPhase; }, [homeCallPhase]);

  const [homeCallMembers, setHomeCallMembers] = useState<HomeCallMember[]>([]);
  const [homeCallMuted, setHomeCallMuted] = useState(false);
  const [homeCallSpeakerOn, setHomeCallSpeakerOn] = useState(true);
  const [homeCallEmojiOpen, setHomeCallEmojiOpen] = useState(false);
  const [homeCallEmojiBurst, setHomeCallEmojiBurst] = useState<string | null>(null);
  const [homeCallEmojiFrom, setHomeCallEmojiFrom] = useState<string | null>(null);
  const [homeCallMembersOpen, setHomeCallMembersOpen] = useState(false);
  const [homeCallAddOpen, setHomeCallAddOpen] = useState(false);
  const [homeCallAddSelected, setHomeCallAddSelected] = useState<Record<string, boolean>>({});
  const [homeCallMinimized, setHomeCallMinimized] = useState(false);
  const [homeCallElapsedSec, setHomeCallElapsedSec] = useState(0);
  const [homeCallPanel, setHomeCallPanel] = useState<'main' | 'react'>('main');
  const [homeCallNoiseCancel, setHomeCallNoiseCancel] = useState(true);
  const [homeIncomingExpanded, setHomeIncomingExpanded] = useState(false);
  const homeIncomingSwipeY = useRef<number | null>(null);
  const homeIncomingSwipeStart = useRef<number | null>(null);
  const [homeCallChannel, setHomeCallChannel] = useState<string | null>(null);
  useEffect(() => { homeCallChannelRef.current = homeCallChannel; }, [homeCallChannel]);
  const [homeIncoming, setHomeIncoming] = useState<{
    video?: boolean;
    channel: string;
    hostId: string;
    hostName: string | null;
    hostUsername?: string | null;
    hostAvatar: string | null;
    members: HomeCallMember[];
    at?: number;
  } | null>(null);
  const homeRingTimer = useRef<number | null>(null);
  const homeSwipeY = useRef<number | null>(null);
  const homeLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeLongPressFired = useRef(false);
  const homeCallPollRef = useRef<number | null>(null);
  const homeRingLockRef = useRef<{ mode: 'none' | 'answered' | 'ignored'; channel: string; at: number }>({ mode: 'none', channel: '', at: 0 });
  const staleInviteHandledRef = useRef<Set<string>>(new Set());
  const homeCallAgoraRef = useRef<any>(null);
  const homeCallMicRef = useRef<any>(null);
  const homeCallSignalWsRef = useRef<WebSocket | null>(null);
  const homeCallApplyInviteRef = useRef<(raw: any) => void>(() => {});
  const homeCallEndedAtRef = useRef<Map<string, number>>(new Map());
  const homeCallChannelRef = useRef<string | null>(null);

  function markHomeCallChannelEnded(channel: string) {
    const ch = String(channel || '').trim();
    if (!ch) return;
    homeCallEndedAtRef.current.set(ch, Date.now());
  }

  function isHomeCallChannelJustEnded(channel: string) {
    const ch = String(channel || '').trim();
    if (!ch) return false;
    const at = homeCallEndedAtRef.current.get(ch);
    return !!at && Date.now() - at < 20_000;
  }

  function clearServerCallInvite(targetUserId?: string | null, channel?: string | null) {
    const uid = String(targetUserId || '').trim();
    if (!uid) return;
    try {
      void fetch('/api/call/invite/clear', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, channel: channel || undefined }),
        keepalive: true,
      });
    } catch { /* */ }
  }

  function homeCallSignalUrl() {
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws/call-signal`;
    } catch {
      return '/ws/call-signal';
    }
  }

  function sendHomeCallSignal(msg: Record<string, unknown>) {
    const ws = homeCallSignalWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); return true; } catch { /* */ }
    }
    return false;
  }

  useEffect(() => {
    if (!homeCallPickerOpen || !user?.id) return;
    let cancelled = false;

    const companyIds = new Set<string>();
    const companyEmails = new Set<string>();
    const companyUsernames = new Set<string>();
    try {
      for (const key of ['stooorna_companies_registry', 'stooorna_companies_directory']) {
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) continue;
        for (const c of list) {
          const id = String(c.userId || c.id || '').trim();
          const em = String(c.email || '').trim().toLowerCase();
          const un = String(c.username || '').replace(/^@/, '').trim().toLowerCase();
          if (id) companyIds.add(id);
          if (em) companyEmails.add(em);
          if (un) companyUsernames.add(un);
        }
      }
    } catch { /* */ }

    const isCompanyFriend = (f: any) => {
      const t = String(f.accountType || f.type || f.role || f.userType || f.publisherType || '').toLowerCase();
      if (t === 'company' || t === 'business') return true;
      if (f.isCompany === true || f.company === true || f.authorIsCompany === true) return true;
      if (f.companyName || f.tradeName || f.licenseNumber || f.commercialLicense) return true;
      const id = String(f.friendId || f.id || f.userId || '').trim();
      const em = String(f.email || '').trim().toLowerCase();
      const un = String(f.username || '').replace(/^@/, '').trim().toLowerCase();
      if (id && companyIds.has(id)) return true;
      if (em && companyEmails.has(em)) return true;
      if (un && companyUsernames.has(un)) return true;
      return false;
    };

    const mapRows = (rows: any[]): HomeCallFriend[] => {
      const seen = new Set<string>();
      const out: HomeCallFriend[] = [];
      for (const f of rows) {
        if (!f || isCompanyFriend(f)) continue;
        const id = String(f.friendId || f.id || f.userId || '').trim();
        if (!id || id === user.id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          name: f.name ?? null,
          username: f.username ?? null,
          avatarUrl: f.avatarUrl ?? f.image ?? null,
        });
      }
      return out;
    };

    (async () => {
      let mapped: HomeCallFriend[] = [];
      try {
        const r = await fetch('/api/friends', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          const rows: any[] = Array.isArray(d)
            ? d
            : (d.accepted || d.friends || d.items || d.data || []);
          mapped = mapRows(rows);
        }
      } catch { /* */ }

      if (!mapped.length) {
        try {
          const raw = localStorage.getItem(`stooorna_user_friend_chats_${user.id}`);
          const list = raw ? JSON.parse(raw) : [];
          if (Array.isArray(list)) mapped = mapRows(list);
        } catch { /* */ }
      }

      if (!cancelled) setHomeCallFriends(mapped);
    })();
    return () => { cancelled = true; };
  }, [homeCallPickerOpen, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const applyInvite = (rawIn: any) => {
      if (!rawIn || typeof rawIn !== 'object') return;
      const hostId = String(rawIn.hostId || rawIn.fromId || rawIn.callerId || '');
      const channel = String(rawIn.channel || rawIn.roomId || rawIn.room || '');
      if (!channel || !hostId || hostId === String(user.id)) return;
      if (isHomeCallChannelJustEnded(channel)) return;
      const raw = {
        ...rawIn,
        channel,
        hostId,
        hostName: rawIn.hostName || rawIn.fromName || rawIn.callerName || rawIn.name || null,
        hostAvatar: rawIn.hostAvatar || rawIn.fromAvatar || rawIn.avatarUrl || null,
        at: Number(rawIn.at || rawIn.ts || rawIn.createdAt) || Date.now(),
        video: !!(rawIn.video || rawIn.kind === 'video'),
        members: Array.isArray(rawIn.members) ? rawIn.members : [],
      };
      const ch = String(raw.channel);
      const inviteKey = homeInviteKey(ch, raw.at);
      if (isHomeCallRecentlyDeclined(user.id, inviteKey)) {
        // Already declined this exact call on this device — never ring for
        // it again, even after a refresh (the in-memory lock below resets
        // on reload, this persisted registry does not).
        try {
          localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
          localStorage.removeItem('stooorna_home_call_active_invite');
        } catch { /* */ }
        return;
      }
      // A call that was already ended or answered (elsewhere) should never
      // ring here, regardless of how fresh its timestamp still looks.
      const finished = !!(raw.ended || raw.answered);
      if (finished || !isFreshHomeInvite(raw)) {
        // Either the invite already expired before this device saw it
        // (e.g. the app was opened after the caller stopped ringing), or
        // the call is already over. Don't ring — just log a missed call
        // in the chat, once, and only when it genuinely went unanswered.
        if (raw.hostId && !finished) {
          const staleKey = `${raw.channel}@${raw.at || 0}`;
          if (!staleInviteHandledRef.current.has(staleKey)) {
            staleInviteHandledRef.current.add(staleKey);
            recordMissedCallChat(user.id, String(raw.hostId), String(raw.hostId));
            pushCallLog(user.id, {
              peerId: String(raw.hostId),
              peerName: raw.hostName ?? null,
              peerAvatar: raw.hostAvatar ?? null,
              direction: 'in',
              status: 'missed',
              at: Number(raw.at) || Date.now(),
            });
            setHomeCallLogTick(x => x + 1);
          }
        }
        try {
          localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
          localStorage.removeItem('stooorna_home_call_active_invite');
        } catch { /* */ }
        return;
      }
      const lock = homeRingLockRef.current;
      // Only suppress a brand-new ring for a few seconds after answer/decline on THIS channel
      if (lock.mode === 'answered' && lock.channel === ch && Date.now() - lock.at < 4000) return;
      if (lock.mode === 'ignored' && lock.channel === ch && Date.now() - lock.at < 8000) return;
      beginHomeIncoming({
        channel: ch,
        hostId: String(raw.hostId || ''),
        hostName: raw.hostName ?? null,
        hostUsername: raw.hostUsername ?? raw.username ?? (Array.isArray(raw.members) ? (raw.members.find((m: any) => String(m.id) === String(raw.hostId || ''))?.username) : null) ?? null,
        hostAvatar: raw.hostAvatar ?? null,
        members: Array.isArray(raw.members) ? raw.members : [],
        video: !!raw.video,
        at: Number(raw.at) || Date.now(),
      });
    };
    homeCallApplyInviteRef.current = applyInvite;
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d && Array.isArray(d.inviteeIds) && d.inviteeIds.includes(user.id)) applyInvite(d);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_home_call_invite_${user.id}` && e.newValue) {
        try { applyInvite(JSON.parse(e.newValue)); } catch { /* */ }
      }
    };
    window.addEventListener('stooorna:home-group-call', onLocal as EventListener);
    window.addEventListener('storage', onStorage);
    let callBc: BroadcastChannel | null = null;
    try {
      callBc = new BroadcastChannel('stooorna-home-call');
      callBc.onmessage = (ev) => {
        const d = ev?.data;
        if (d && d.channel && String(d.hostId || '') !== String(user.id)) applyInvite(d);
      };
    } catch { /* */ }
    const poll = async () => {
      if (homeCallPhase !== 'idle') return;
      try {
        const raw = localStorage.getItem(`stooorna_home_call_invite_${user.id}`);
        if (raw) applyInvite(JSON.parse(raw));
        try {
          const invRes = await fetch(`/api/call/invite?userId=${encodeURIComponent(user.id)}&toUserId=${encodeURIComponent(user.id)}`, { credentials: 'include' });
          if (invRes.ok) {
            const invData = await invRes.json() as any;
            const inviteObj = invData?.invite || invData?.data || invData?.call || (invData?.channel ? invData : null);
            if (inviteObj) applyInvite(inviteObj);
          }
        } catch { /* */ }
        const active = localStorage.getItem('stooorna_home_call_active_invite');
        if (active) {
          const parsed = JSON.parse(active);
          const ids: string[] = parsed.inviteeIds || [];
          if (ids.includes(user.id)) applyInvite(parsed);
        }
      } catch { /* */ }
      try {
        for (const ringId of homeRingRoomIds(user.id)) {
          const r = await fetch(`/api/room?id=${encodeURIComponent(ringId)}`, { credentials: 'include' });
          if (!r.ok) continue;
          const d = await r.json() as { members?: { name?: string; username?: string; userId?: string; id?: string; avatarUrl?: string }[] };
          const other = (d.members || []).find(m => String(m.userId || m.id || '') !== String(user.id));
          if (!other) continue;
          let parsed: any = null;
          for (const raw of [other.name, other.username]) {
            if (!raw || typeof raw !== 'string') continue;
            if (raw.startsWith('{')) {
              try { parsed = JSON.parse(raw); } catch { parsed = null; }
            }
          }
          const ch = parsed?.channel
            || (other.name && (String(other.name).startsWith('private_') || String(other.name).startsWith('home_group_')) ? other.name : null);
          const hostId = String(parsed?.hostId || other.userId || other.id || '');
          const skipped = !ch || !hostId || hostId === String(user.id) || !!(parsed?.ended || parsed?.answered || parsed?.clear);
          if (!skipped) {
            applyInvite({
              channel: String(ch),
              hostId,
              hostName: parsed?.hostName || null,
              hostAvatar: parsed?.hostAvatar || other.avatarUrl || null,
              members: parsed?.members || [],
              at: Number(parsed?.at) || Date.now(),
              video: !!parsed?.video,
            });
            break;
          }
        }
      } catch { /* */ }
      // Do NOT invent incoming calls from profile-visit alone.
      // Only explicit invites (localStorage /api/call/invite / ring-room JSON) may ring.

    };
    void poll();
    const interval = window.setInterval(poll, 1200);
    return () => {
      window.removeEventListener('stooorna:home-group-call', onLocal as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
      try { callBc?.close(); } catch { /* */ }
    };
  }, [user?.id, homeCallPhase, homeIncoming]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    let closed = false;
    let retryTimer: number | null = null;
    const connect = () => {
      if (closed) return;
      try { homeCallSignalWsRef.current?.close(); } catch { /* */ }
      let ws: WebSocket;
      try {
        ws = new WebSocket(homeCallSignalUrl());
      } catch {
        retryTimer = window.setTimeout(connect, 2500);
        return;
      }
      homeCallSignalWsRef.current = ws;
      ws.onopen = () => {
        if (closed) return;
        try { ws.send(JSON.stringify({ type: 'register', userId: user.id })); } catch { /* */ }
      };
      ws.onmessage = (ev) => {
        if (closed) return;
        let msg: any = null;
        try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        const type = String(msg.type || '');
        if (type === 'answered' || type === 'call-answered') {
          const ch = String(msg.channel || '');
          if (ch && homeCallChannelRef.current && ch === String(homeCallChannelRef.current)) {
            if (homeCallPhaseRef.current === 'connecting' || homeCallPhaseRef.current === 'animating') {
              setHomeCallPhase('live');
              if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
              if (homeCallNoAnswerTimer.current) {
                window.clearTimeout(homeCallNoAnswerTimer.current);
                homeCallNoAnswerTimer.current = null;
              }
              stopHomeIncomingRing();
              try { window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring')); } catch { /* */ }
            }
          }
          return;
        }
        if (type === 'hangup' || type === 'call-end' || type === 'ended') {
          const ch = String(msg.channel || '');
          if (ch) markHomeCallChannelEnded(ch);
          if (homeCallPhaseRef.current !== 'idle' || homeIncoming) {
            void leaveHomeGroupCall({ remote: true });
          }
          return;
        }
        if (type !== 'call' && type !== 'incoming-call' && type !== 'home-call') return;
        const to = String(msg.to || msg.toUserId || '');
        if (to && to !== String(user.id)) return;
        if (isHomeCallChannelJustEnded(String(msg.channel || ''))) return;
        homeCallApplyInviteRef.current({
          channel: msg.channel,
          hostId: msg.from || msg.hostId || msg.fromId,
          hostName: msg.fromName || msg.hostName,
          hostAvatar: msg.fromAvatar || msg.hostAvatar,
          hostUsername: msg.fromUsername || msg.hostUsername,
          members: msg.members || [],
          video: msg.callType === 'video' || msg.video === true,
          at: Number(msg.at) || Date.now(),
        });
      };
      ws.onclose = () => {
        if (closed) return;
        retryTimer = window.setTimeout(connect, 2500);
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* */ }
      };
    };
    connect();
    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      try { homeCallSignalWsRef.current?.close(); } catch { /* */ }
      homeCallSignalWsRef.current = null;
    };
  }, [user?.id]);

  // Incoming ring: if caller hangs up, close the green Answer bar on this device
  useEffect(() => {
    if (!homeIncoming || homeCallPhase !== 'idle') return;
    const channel = String(homeIncoming.channel || '');
    if (!channel) return;
    const closeIncoming = () => {
      stopHomeIncomingRing();
      setHomeIncoming(null);
      setHomeIncomingExpanded(false);
      homeRingLockRef.current = { mode: 'none', channel: '', at: Date.now() };
      try {
        window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
        window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
      } catch { /* */ }
      try {
        localStorage.removeItem(`stooorna_home_call_invite_${user?.id || ''}`);
        localStorage.removeItem('stooorna_home_call_active_invite');
      } catch { /* */ }
    };
    const onEnded = (e: Event) => {
      const d = (e as CustomEvent).detail as { channel?: string } | undefined;
      if (d?.channel && String(d.channel) === channel) closeIncoming();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_call_ended_${channel}` && e.newValue) closeIncoming();
    };
    window.addEventListener('stooorna:home-call-ended', onEnded as EventListener);
    window.addEventListener('storage', onStorage);
    const poll = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(`stooorna_call_ended_${channel}`);
        if (raw) {
          const p = JSON.parse(raw);
          if (p?.at && Date.now() - Number(p.at) < 120000) {
            closeIncoming();
            return;
          }
        }
      } catch { /* */ }
      // Cross-device: if ring room is empty, caller left
      void (async () => {
        try {
          if (!user?.id) return;
          const ringId = `home_ring_${homeCallShortHash(user.id)}`;
          const r = await fetch(`/api/room?id=${encodeURIComponent(ringId)}`, { credentials: 'include' });
          if (!r.ok) return;
          const d = await r.json() as { members?: { userId?: string }[] };
          const others = (d.members || []).filter(m => String(m.userId || '') !== String(user.id));
          if (others.length === 0) closeIncoming();
        } catch { /* */ }
        try {
          const r2 = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
          if (!r2.ok) return;
          const d2 = await r2.json() as { members?: { userId?: string }[] };
          const hostId = homeIncoming?.hostId;
          const hostStill = (d2.members || []).some(m => String(m.userId || '') === String(hostId));
          if (!hostStill && hostId) closeIncoming();
        } catch { /* */ }
      })();
    }, 900);
    return () => {
      window.removeEventListener('stooorna:home-call-ended', onEnded as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
    };
  }, [homeIncoming, homeCallPhase, user?.id]);

  // Answer from any screen (chat header Phone / Video, plus menu on other pages) when ringing
  useEffect(() => {
    const onAnswer = (e: Event) => {
      if (homeCallPhase !== 'idle') return;
      if (homeIncoming) {
        void answerHomeIncoming();
        return;
      }
      const d = (e as CustomEvent).detail as {
        channel?: string | null;
        hostId?: string | null;
        hostName?: string | null;
        hostAvatar?: string | null;
        video?: boolean;
      } | undefined;
      if (d?.channel) {
        void answerHomeIncoming({
          channel: String(d.channel),
          hostId: String(d.hostId || ''),
          hostName: d.hostName ?? null,
          hostAvatar: d.hostAvatar ?? null,
          members: [],
          video: !!d.video,
        });
      }
    };
    window.addEventListener('stooorna:answer-home-incoming', onAnswer);
    return () => window.removeEventListener('stooorna:answer-home-incoming', onAnswer);
  }, [homeIncoming, homeCallPhase]);

  // Decline from another screen (long-press on the phone icon in its plus menu)
  useEffect(() => {
    const onDecline = () => {
      if (homeIncoming && homeCallPhase === 'idle') ignoreHomeIncoming();
    };
    window.addEventListener('stooorna:decline-home-incoming', onDecline);
    return () => window.removeEventListener('stooorna:decline-home-incoming', onDecline);
  }, [homeIncoming, homeCallPhase]);

  // Bridge so other screens can open this call sheet.
  // detail.friendId pre-checks a friend; detail.direct + friendId starts the call immediately.
  useEffect(() => {
    const onOpenCallPicker = (e: Event) => {
      const detail = (e as CustomEvent).detail as { friendId?: string; direct?: boolean } | undefined;
      setPlusMenuOpen(false);
      if (detail?.friendId && detail?.direct) {
        const fid = String(detail.friendId);
        pendingVideoRef.current = !!(detail as any).video;
        setHomeCallSelected({ [fid]: true });
        setHomeCallPickerOpen(false);
        setPendingDirectCallId(fid);
        return;
      }
      setPendingDirectCallId(null);
      setHomeCallPickerOpen(true);
      if (detail?.friendId) {
        const fid = detail.friendId;
        setHomeCallSelected(s => ({ ...s, [fid]: true }));
      }
    };
    window.addEventListener('stooorna:open-home-call-picker', onOpenCallPicker as EventListener);
    return () => window.removeEventListener('stooorna:open-home-call-picker', onOpenCallPicker as EventListener);
  }, []);

  function homeCallShortHash(input: string): string {
    let h1 = 0xdeadbeef ^ input.length;
    let h2 = 0x41c6ce57 ^ input.length;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function homeRingRoomIds(userId: string): string[] {
    const clean = String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const ids = [
      `home_ring_${homeCallShortHash(String(userId || ''))}`,
      clean ? `hr_${clean}`.slice(0, 64) : '',
    ].filter(Boolean);
    return [...new Set(ids)];
  }

  async function leaveHomeGroupCall(opts?: { remote?: boolean }) {
    const remoteEnd = !!opts?.remote;
    const endedPhase = homeCallPhaseRef.current;
    const endedMembers = homeCallMembers.slice();
    const endedChannel = homeCallChannel;
    const endedAt = Date.now();
    // Instant UI close for both local and remote — do not wait for Agora teardown
    homeCallPhaseRef.current = 'idle';
    setHomeCallPhase('idle');
    setHomeCallMinimized(false);
    setHomeIncoming(null);
    setHomeIncomingExpanded(false);
    setHomeCallChannel(null);
    setHomeCallMembers([]);
    setHomeCallElapsedSec(0);
    setHomeCallPickerOpen(false);
    stopHomeIncomingRing();
    try {
      const pulse = (homeCallAgoraRef as any)._invitePulse as number | undefined;
      if (pulse) {
        window.clearInterval(pulse);
        (homeCallAgoraRef as any)._invitePulse = null;
      }
    } catch { /* */ }
    try {
      window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
      window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
    } catch { /* */ }
    const durationSec = homeCallLiveStartedAt.current
      ? Math.max(1, Math.round((endedAt - homeCallLiveStartedAt.current) / 1000))
      : 0;
    homeCallLiveStartedAt.current = null;
    homeCallSessionRef.current += 1;
    if (endedChannel) markHomeCallChannelEnded(endedChannel);
    // Notify remote party so their UI closes automatically (local hang-up only)
    if (!remoteEnd && endedChannel && user?.id) {
      try {
        const payload = { channel: endedChannel, by: user.id, at: endedAt };
        // Write end marker multiple times so peer poll / storage listeners always see it
        for (let i = 0; i < 3; i++) {
          try { localStorage.setItem(`stooorna_call_ended_${endedChannel}`, JSON.stringify({ ...payload, n: i })); } catch { /* */ }
        }
        window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: payload }));
        window.dispatchEvent(new StorageEvent('storage', { key: `stooorna_call_ended_${endedChannel}`, newValue: JSON.stringify(payload) }));
        try { localStorage.removeItem('stooorna_home_call_active_invite'); } catch { /* */ }
        try { localStorage.removeItem(`stooorna_home_call_invite_${user.id}`); } catch { /* */ }
        try { localStorage.removeItem('stooorna_home_call_live_session'); } catch { /* */ }
        for (const m of endedMembers) {
          if (!m.id || m.id === user.id) continue;
          try {
            localStorage.setItem(`stooorna_home_call_invite_${m.id}`, JSON.stringify({ ended: true, channel: endedChannel, at: endedAt, clear: true }));
            localStorage.removeItem(`stooorna_home_call_invite_${m.id}`);
          } catch { /* */ }
          clearServerCallInvite(m.id, endedChannel);
          sendHomeCallSignal({
            type: 'hangup',
            to: m.id,
            from: user.id,
            channel: endedChannel,
            at: endedAt,
          });
          try {
            for (const roomId of homeRingRoomIds(m.id)) {
              void fetch('/api/room/leave', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, userId: user.id, endRoom: true }),
                keepalive: true,
              });
            }
          } catch { /* */ }
        }
        try {
          void fetch('/api/room/leave', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: endedChannel, userId: user.id, endRoom: true }),
          });
        } catch { /* */ }
      } catch { /* */ }
    } else if (remoteEnd && endedChannel) {
      // Peer already ended — still wipe local invite + session markers
      try { localStorage.removeItem('stooorna_home_call_active_invite'); } catch { /* */ }
      try { if (user?.id) localStorage.removeItem(`stooorna_home_call_invite_${user.id}`); } catch { /* */ }
      try { localStorage.removeItem('stooorna_home_call_live_session'); } catch { /* */ }
    }
    // After peers had time to poll the end marker, clear it so a NEW call on the same
    // private channel is not immediately treated as already ended.
    if (endedChannel) {
      const chClear = endedChannel;
      window.setTimeout(() => {
        try {
          const raw = localStorage.getItem(`stooorna_call_ended_${chClear}`);
          if (raw) {
            const p = JSON.parse(raw);
            if (p?.at && Date.now() - Number(p.at) >= 2500) {
              localStorage.removeItem(`stooorna_call_ended_${chClear}`);
            }
          }
          localStorage.removeItem(`stooorna_call_answered_${chClear}`);
        } catch { /* */ }
      }, 3500);
    }
    if (homeCallNoAnswerTimer.current) {
      window.clearTimeout(homeCallNoAnswerTimer.current);
      homeCallNoAnswerTimer.current = null;
    }
    setPendingDirectCallId(null);
    if (user?.id && endedPhase !== 'idle') {
      const peers = endedMembers.filter(m => m.id && m.id !== user.id);
      for (const peer of peers) {
        recordMissedCallChat(user.id, peer.id, user.id);
        const outRow = {
          peerId: peer.id,
          peerName: peer.name ?? null,
          peerAvatar: peer.avatarUrl ?? null,
          direction: 'out' as const,
          status: (endedPhase === 'live' ? 'answered' : 'missed') as 'answered' | 'missed',
          at: endedAt,
          durationSec: endedPhase === 'live' ? durationSec : undefined,
        };
        const inRow = {
          peerId: user.id,
          peerName: (user as any).name ?? (user as any).username ?? null,
          peerAvatar: (user as any).avatarUrl ?? (user as any).image ?? null,
          direction: 'in' as const,
          status: (endedPhase === 'live' ? 'answered' : 'missed') as 'answered' | 'missed',
          at: endedAt,
          durationSec: endedPhase === 'live' ? durationSec : undefined,
        };
        if (homeCallVideoRef.current) {
          pushVideoCallLog(user.id, outRow);
          pushVideoCallLog(peer.id, inRow);
        } else {
          pushCallLog(user.id, outRow);
          pushCallLog(peer.id, inRow);
        }
      }
      setHomeCallLogTick(x => x + 1);
    }
    if (homeCallPollRef.current) {
      window.clearInterval(homeCallPollRef.current);
      homeCallPollRef.current = null;
    }
    try {
      const track = homeCallMicRef.current;
      if (track) {
        await homeCallAgoraRef.current?.unpublish?.([track]);
        track.stop?.();
        track.close?.();
      }
      await homeCallAgoraRef.current?.leave?.();
    } catch { /* */ }
    homeCallMicRef.current = null;
    homeCallAgoraRef.current = null;
    if (endedChannel && user?.id) {
      void fetch('/api/room/leave', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: endedChannel, userId: user.id, endRoom: !remoteEnd }),
      });
    }
    setHomeCallPhase('idle');
    setHomeCallMinimized(false);
    setHomeCallElapsedSec(0);
    setHomeCallPanel('main');
    setHomeCallNoiseCancel(true);
    setHomeIncomingExpanded(false);
    setHomeCallIsVideo(false);
    homeCallVideoRef.current = false;
    try { homeCallCamRef.current?.stop?.(); homeCallCamRef.current?.close?.(); } catch { /* */ }
    homeCallCamRef.current = null;
    setHomeCallMembers([]);
    setHomeCallChannel(null);
    setHomeCallMuted(false);
    setHomeCallSpeakerOn(true);
    setHomeCallEmojiOpen(false);
    setHomeCallMembersOpen(false);
    setHomeCallAddOpen(false);
    setHomeCallAddSelected({});
    setHomeCallSelected({});
    // Do NOT lock as ignored on hang-up — that blocked the next call for 60s.
    // Only explicit decline uses mode 'ignored'.
    homeRingLockRef.current = { mode: 'none', channel: endedChannel || '', at: Date.now() };
    stopHomeIncomingRing();
    setHomeIncoming(null);
    try {
      window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
      window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
      if (user?.id) {
        localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
        localStorage.removeItem('stooorna_home_call_active_invite');
        try {
          void fetch('/api/call/invite/clear', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
        } catch { /* */ }
        for (const m of homeCallMembers) {
          if (m.id && m.id !== user.id) {
            try { localStorage.removeItem(`stooorna_home_call_invite_${m.id}`); } catch { /* */ }
            void fetch('/api/room/leave', {
              method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: `home_ring_${homeCallShortHash(m.id)}`, userId: user.id }),
            });
          }
        }
      }
    } catch { /* */ }
    if (user?.id) {
      const ringId = `home_ring_${homeCallShortHash(user.id)}`;
      void fetch('/api/room/leave', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: ringId, userId: user.id }),
      });
    }
  }

  useEffect(() => {
    if (homeCallPhase !== 'live') {
      if (homeCallPhase === 'idle') setHomeCallElapsedSec(0);
      return;
    }
    if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
    const tick = () => {
      const start = homeCallLiveStartedAt.current || Date.now();
      setHomeCallElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [homeCallPhase]);

  // Remote party ended the call — close local UI
  useEffect(() => {
    if (homeCallPhase !== 'connecting' && homeCallPhase !== 'live') return;
    const channel = homeCallChannel;
    if (!channel) return;
    const onEnd = (detail: { channel?: string } | null) => {
      if (!detail?.channel) return;
      if (String(detail.channel) !== String(channel)) return;
      void leaveHomeGroupCall({ remote: true });
    };
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as { channel?: string } | undefined;
      onEnd(d || null);
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      if (e.key === `stooorna_call_ended_${channel}`) {
        try { onEnd(JSON.parse(e.newValue)); } catch { /* */ }
      }
    };
    window.addEventListener('stooorna:home-call-ended', onEvt as EventListener);
    window.addEventListener('storage', onStorage);
    let aloneTicks = 0;
    const pollEnd = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(`stooorna_call_ended_${channel}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.at && Date.now() - Number(parsed.at) < 120000) onEnd(parsed);
        }
      } catch { /* */ }
      // Cross-device hang-up: room empty means peer left
      void (async () => {
        try {
          if (!user?.id) return;
          const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
          if (!r.ok) return;
          const d = await r.json() as { members?: { userId?: string }[] };
          const others = (d.members || []).filter(m => String(m.userId || '') !== String(user.id));
          if (others.length === 0 && homeCallPhaseRef.current === 'live') {
            aloneTicks += 1;
            if (aloneTicks >= 2) onEnd({ channel });
          } else {
            aloneTicks = 0;
          }
        } catch { /* */ }
      })();
    }, 800);
    return () => {
      window.removeEventListener('stooorna:home-call-ended', onEvt as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(pollEnd);
    };
  }, [homeCallPhase, homeCallChannel]);

  // Peer declined or remote end while ringing/connecting — close local call chrome for both
  useEffect(() => {
    if (homeCallPhase !== 'connecting' && homeCallPhase !== 'animating' && homeCallPhase !== 'live') return;
    const channel = homeCallChannel;
    if (!channel) return;
    const closeBoth = (detail: { channel?: string } | null) => {
      if (!detail?.channel) return;
      if (String(detail.channel) !== String(channel)) return;
      void leaveHomeGroupCall({ remote: true });
    };
    const onDeclined = (e: Event) => {
      const d = (e as CustomEvent).detail as { channel?: string } | undefined;
      closeBoth(d || null);
    };
    const onEnded = (e: Event) => {
      const d = (e as CustomEvent).detail as { channel?: string } | undefined;
      closeBoth(d || null);
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      if (e.key === `stooorna_call_ended_${channel}` || e.key.startsWith('stooorna_call_ended_')) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (String(parsed?.channel || '') === String(channel)) closeBoth(parsed);
        } catch { /* */ }
      }
    };
    window.addEventListener('stooorna:call-declined', onDeclined as EventListener);
    window.addEventListener('stooorna:home-call-ended', onEnded as EventListener);
    window.addEventListener('storage', onStorage);
    const poll = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(`stooorna_call_ended_${channel}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.at && Date.now() - Number(parsed.at) < 120000) closeBoth(parsed);
        }
      } catch { /* */ }
    }, 350);
    return () => {
      window.removeEventListener('stooorna:call-declined', onDeclined as EventListener);
      window.removeEventListener('stooorna:home-call-ended', onEnded as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
    };
  }, [homeCallPhase, homeCallChannel]);

  // Caller: when peer answers, switch to live + start duration timer
  useEffect(() => {
    if (homeCallPhase !== 'connecting' && homeCallPhase !== 'animating') return;
    const channel = homeCallChannel;
    if (!channel) return;
    const promote = () => {
      if (homeCallPhaseRef.current === 'live') return;
      setHomeCallPhase('live');
      if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
      if (homeCallNoAnswerTimer.current) {
        window.clearTimeout(homeCallNoAnswerTimer.current);
        homeCallNoAnswerTimer.current = null;
      }
      stopHomeIncomingRing();
      try { window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring')); } catch { /* */ }
    };
    const onAnswered = (e: Event) => {
      const d = (e as CustomEvent).detail as { channel?: string } | undefined;
      if (d?.channel && String(d.channel) === String(channel)) promote();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_call_answered_${channel}` && e.newValue) promote();
    };
    window.addEventListener('stooorna:call-answered', onAnswered as EventListener);
    window.addEventListener('storage', onStorage);
    const pollAns = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(`stooorna_call_answered_${channel}`);
        if (raw) {
          const p = JSON.parse(raw);
          if (p?.at && Date.now() - Number(p.at) < 120000) promote();
        }
      } catch { /* */ }
    }, 1000);
    return () => {
      window.removeEventListener('stooorna:call-answered', onAnswered as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(pollAns);
    };
  }, [homeCallPhase, homeCallChannel]);

  async function startHomeGroupCall(overrideFriendIds?: string[], asVideo = false) {
    if (!user?.id) return;
    homeCallVideoRef.current = !!asVideo;
    setHomeCallIsVideo(!!asVideo);
    const ids = overrideFriendIds?.length
      ? overrideFriendIds
      : Object.keys(homeCallSelected).filter(id => homeCallSelected[id]);
    let picked = homeCallFriends.filter(f => ids.includes(f.id));
    if (!picked.length && ids.length) {
      // Peer may not be in the cached friends list yet — still start 1:1
      picked = ids.map(id => ({
        id,
        name: 'User',
        username: null as string | null,
        avatarUrl: null as string | null,
      }));
    }
    if (!picked.length) return;
    const me: HomeCallMember = {
      id: user.id,
      name: (user as any).name ?? 'You',
      username: (user as any).username ?? null,
      avatarUrl: (user as any).avatarUrl ?? (user as any).image ?? null,
      joined: true,
    };
    const others: HomeCallMember[] = picked.map(f => ({ ...f, joined: false }));
    const channel = picked.length === 1
      ? `private_${homeCallShortHash([user.id, picked[0].id].sort().join('_'))}`
      : `home_group_${homeCallShortHash([user.id, ...picked.map(p => p.id)].sort().join('_'))}`;
    // Fresh call on this channel — wipe stale end/answer markers from the previous session
    try {
      localStorage.removeItem(`stooorna_call_ended_${channel}`);
      localStorage.removeItem(`stooorna_call_answered_${channel}`);
    } catch { /* */ }
    homeRingLockRef.current = { mode: 'none', channel: '', at: 0 };
    setHomeIncoming(null);
    setHomeCallChannel(channel);
    setHomeCallMembers([me, ...others]);
    setHomeCallPickerOpen(false);
    setHomeCallPhase('animating');
    // Do not open the full call screen while ringing out — keep it as a
    // minimized top bar. Tapping the bar opens the full call UI.
    setHomeCallMinimized(true);
    const invitePayload = { channel, hostId: user.id, hostName: me.name, hostUsername: me.username, hostAvatar: me.avatarUrl, members: [me, ...others], at: Date.now(), video: homeCallVideoRef.current };
    window.dispatchEvent(new CustomEvent('stooorna:home-group-call', {
      detail: { ...invitePayload, inviteeIds: picked.map(p => p.id) },
    }));
    try {
      localStorage.setItem('stooorna_home_call_active_invite', JSON.stringify({
        ...invitePayload,
        inviteeIds: picked.map(p => p.id),
      }));
    } catch { /* */ }
    const pushInviteToPeer = (peer: HomeCallFriend, at: number) => {
      const body = {
        toUserId: peer.id,
        userId: peer.id,
        targetUserId: peer.id,
        channel: invitePayload.channel,
        roomId: invitePayload.channel,
        video: !!(invitePayload as any).video,
        kind: (invitePayload as any).video ? 'video' : 'voice',
        hostId: invitePayload.hostId,
        fromId: invitePayload.hostId,
        hostName: invitePayload.hostName,
        hostAvatar: invitePayload.hostAvatar,
        members: invitePayload.members,
        at,
        ts: at,
        hostUsername: invitePayload.hostUsername,
        inviteeIds: picked.map(p => p.id),
      };
      try { localStorage.setItem(`stooorna_home_call_invite_${peer.id}`, JSON.stringify({ ...invitePayload, at })); } catch { /* */ }
      sendHomeCallSignal({
        type: 'call',
        to: peer.id,
        from: user.id,
        fromName: me.name,
        fromAvatar: me.avatarUrl,
        fromUsername: me.username,
        channel: invitePayload.channel,
        callType: homeCallVideoRef.current ? 'video' : 'voice',
        video: !!homeCallVideoRef.current,
        hostId: user.id,
        hostName: me.name,
        hostAvatar: me.avatarUrl,
        members: invitePayload.members,
        at,
      });
      try {
        const bc = new BroadcastChannel('stooorna-home-call');
        bc.postMessage({ ...invitePayload, at, toUserId: peer.id, inviteeIds: picked.map(p => p.id) });
        bc.close();
      } catch { /* */ }
      try {
        void fetch('/api/call/invite', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        });
      } catch { /* */ }
      const ringMeta = JSON.stringify({
        channel: invitePayload.channel,
        hostId: user.id,
        hostName: me.name,
        hostUsername: me.username,
        hostAvatar: me.avatarUrl,
        at,
        video: !!homeCallVideoRef.current,
      });
      for (const roomId of homeRingRoomIds(peer.id)) {
        try {
          void fetch('/api/room/join', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId,
              userId: user.id,
              name: invitePayload.channel,
              username: ringMeta.slice(0, 240),
              avatarUrl: me.avatarUrl,
            }),
            keepalive: true,
          });
        } catch { /* */ }
      }
    };
    for (const peer of picked) pushInviteToPeer(peer, invitePayload.at);
    const callSession = ++homeCallSessionRef.current;
    const invitePulse = window.setInterval(() => {
      if (homeCallSessionRef.current !== callSession) {
        window.clearInterval(invitePulse);
        return;
      }
      if (homeCallPhaseRef.current === 'live' || homeCallPhaseRef.current === 'idle') {
        window.clearInterval(invitePulse);
        return;
      }
      try {
        localStorage.setItem('stooorna_home_call_active_invite', JSON.stringify({
          ...invitePayload,
          inviteeIds: picked.map(p => p.id),
        }));
      } catch { /* */ }
      window.dispatchEvent(new CustomEvent('stooorna:home-group-call', {
        detail: { ...invitePayload, inviteeIds: picked.map(p => p.id) },
      }));
      for (const peer of picked) pushInviteToPeer(peer, invitePayload.at);
    }, 2000);
    (homeCallAgoraRef as any)._invitePulse = invitePulse;
    window.setTimeout(() => {
      if (homeCallSessionRef.current !== callSession) return;
      setHomeCallMinimized(true); setHomeCallPhase('connecting');
      // Outgoing ringback while waiting for answer
      try {
        playHomeIncomingRing();
        if (homeRingTimer.current) window.clearInterval(homeRingTimer.current);
        homeRingTimer.current = window.setInterval(() => {
          if (homeCallPhaseRef.current === 'live' || homeCallPhaseRef.current === 'idle') {
            stopHomeIncomingRing();
            return;
          }
          playHomeIncomingRing();
        }, 2600);
      } catch { /* */ }
    }, 900);
    if (homeCallNoAnswerTimer.current) window.clearTimeout(homeCallNoAnswerTimer.current);
    homeCallNoAnswerTimer.current = window.setTimeout(() => {
      if (homeCallSessionRef.current !== callSession) return;
      if (homeCallPhaseRef.current === 'live') return;
      const myId = user?.id;
      if (myId) {
        for (const peer of picked) {
          recordMissedCallChat(myId, peer.id, myId);
          const miss = {
            peerId: peer.id,
            peerName: peer.name ?? null,
            peerAvatar: peer.avatarUrl ?? null,
            direction: 'out' as const,
            status: 'missed' as const,
            at: Date.now(),
          };
          if (homeCallVideoRef.current) {
            pushVideoCallLog(myId, miss);
            pushVideoCallLog(peer.id, { ...miss, direction: 'in', peerId: myId, peerName: me.name, peerAvatar: me.avatarUrl });
          } else {
            pushCallLog(myId, miss);
          }
          try { localStorage.removeItem(`stooorna_home_call_invite_${peer.id}`); } catch { /* */ }
          void fetch('/api/room/leave', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: `home_ring_${homeCallShortHash(peer.id)}`, userId: myId }),
          });
        }
        setHomeCallLogTick(x => x + 1);
      }
      void leaveHomeGroupCall();
    }, HOME_CALL_NO_ANSWER_MS);
    const joinCallerAgora = async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        if (homeCallAgoraRef.current) {
          try { await homeCallAgoraRef.current.leave?.(); } catch { /* */ }
        }
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
        homeCallAgoraRef.current = client;
        client.on('user-published', async (remoteUser: any, mediaType: string) => {
          try {
            await client.subscribe(remoteUser, mediaType);
            if (mediaType === 'audio') remoteUser.audioTrack?.play();
            if (mediaType === 'video') {
              requestAnimationFrame(() => { try { remoteUser.videoTrack?.play(remoteVideoRef.current || undefined); } catch { /* */ } });
            }
            if (homeCallPhaseRef.current === 'connecting' || homeCallPhaseRef.current === 'animating') {
              setHomeCallPhase('live');
              if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
              if (homeCallNoAnswerTimer.current) {
                window.clearTimeout(homeCallNoAnswerTimer.current);
                homeCallNoAnswerTimer.current = null;
              }
              stopHomeIncomingRing();
            }
          } catch { /* */ }
        });
        const [tokenResponse, micTrack] = await Promise.all([
          fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(user.id)}`, { credentials: 'include' }),
          AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' }),
        ]);
        if (!tokenResponse.ok) return;
        const tokenData = await tokenResponse.json() as { token: string; uid: number; appId?: string };
        await client.join(tokenData.appId || '149ef04e839c4132a08efb49d717c436', channel, tokenData.token, tokenData.uid);
        try { await micTrack.setMuted(false); } catch { /* */ }
        try { await micTrack.setEnabled(true); } catch { /* */ }
        homeCallMicRef.current = micTrack;
        await client.publish([micTrack]);
        await Promise.all((client.remoteUsers || []).map(async (remoteUser: any) => {
          try {
            if (remoteUser.hasAudio) {
              await client.subscribe(remoteUser, 'audio');
              remoteUser.audioTrack?.play();
            }
          } catch { /* */ }
        }));
      } catch { /* */ }
    };
    void joinCallerAgora();
    try {
      void fetch('/api/room/join', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: channel, userId: user.id, name: me.name }),
        keepalive: true,
      });
      for (const peer of picked) {
        try {
          await fetch('/api/profile-visit/heartbeat', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerId: peer.id,
              viewerId: user.id,
              viewerName: me.name,
              viewerUsername: me.username,
              viewerAvatarUrl: me.avatarUrl,
            }),
          });
        } catch { /* */ }
        try {
          const ringMeta = JSON.stringify({
            channel,
            hostId: user.id,
            hostName: me.name,
            hostUsername: me.username,
            at: invitePayload.at,
            video: !!homeCallVideoRef.current,
          });
          for (const roomId of homeRingRoomIds(peer.id)) {
            await fetch('/api/room/join', {
              method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomId,
                userId: user.id,
                name: channel,
                username: ringMeta.slice(0, 240),
                avatarUrl: me.avatarUrl,
              }),
            });
          }
        } catch { /* */ }
        try {
          const pairChannel = `private_${homeCallShortHash([user.id, peer.id].sort().join('_'))}`;
          await fetch('/api/room/join', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: pairChannel, userId: user.id, name: me.name }),
          });
        } catch { /* */ }
      }
    } catch { /* partial room connect even if Agora fails */ }
    if (homeCallSessionRef.current !== callSession) return;
    // Stay on connecting (Ringing) until the other party joins the room
    setHomeCallMinimized(true); setHomeCallPhase('connecting');
    const poll = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json() as { members?: { userId?: string; id?: string; name?: string; username?: string; avatarUrl?: string }[] };
        const remote = d.members || [];
        setHomeCallMembers(prev => prev.map(m => ({
          ...m,
          joined: m.id === user.id || remote.some(x => String(x.userId || x.id) === m.id),
        })));
        const others = remote.filter(x => String(x.userId || x.id) !== String(user.id));
        if (others.length > 0 && (homeCallPhaseRef.current === 'connecting' || homeCallPhaseRef.current === 'animating')) {
          setHomeCallPhase('live');
          if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
          if (homeCallNoAnswerTimer.current) {
            window.clearTimeout(homeCallNoAnswerTimer.current);
            homeCallNoAnswerTimer.current = null;
          }
        }
        // Only auto-end if we were live for a while and peer clearly left (avoid false ends while ringing)
        if (homeCallPhaseRef.current === 'live' && others.length === 0) {
          const started = homeCallLiveStartedAt.current;
          // Peer left Agora/room — close local UI quickly so the bar does not stay stuck
          if (started && Date.now() - started > 3000) {
            void leaveHomeGroupCall({ remote: true });
          }
        }
      } catch { /* */ }
    };
    void poll();
    homeCallPollRef.current = window.setInterval(poll, 800);
  }

  // Direct 1:1 call from chat header: start immediately with that peer only
  useEffect(() => {
    if (!pendingDirectCallId || !user?.id) return;
    if (homeCallPhase !== 'idle') return;
    const fid = pendingDirectCallId;
    setPendingDirectCallId(null);
    setHomeCallSelected({ [fid]: true });
    // Enrich name/avatar from loaded friends when available
    const asVideo = pendingVideoRef.current;
    pendingVideoRef.current = false;
    void startHomeGroupCall([fid], asVideo);
  }, [pendingDirectCallId, user?.id, homeCallPhase]);

  useEffect(() => {
    const onVideo = (ev: Event) => {
      const d = (ev as CustomEvent).detail || {};
      // Friend chat video is handled by FriendVideoCallController on /add-friend.
      // Do not open a second Agora camera session here (causes NOT_READABLE).
      if (d.handledBy === 'friend-video' || d.skipHomeCall) return;
      try {
        const path = window.location.pathname || '';
        if (path === '/add-friend' || path.startsWith('/add-friend')) return;
      } catch { /* ignore */ }
      const friendId = String(d.friendId || d.peerId || '');
      if (!friendId || !user?.id) return;
      pendingVideoRef.current = true;
      setHomeCallSelected({ [friendId]: true });
      setHomeCallPickerOpen(false);
      if (homeCallPhase === 'idle') setPendingDirectCallId(friendId);
      else void startHomeGroupCall([friendId], true);
    };
    window.addEventListener('stooorna:start-video-call', onVideo as EventListener);
    return () => window.removeEventListener('stooorna:start-video-call', onVideo as EventListener);
  }, [user?.id, homeCallPhase]);

  useEffect(() => {
    if (!homeCallIsVideo || homeCallPhase === 'idle') return;
    const bind = () => {
      try { homeCallCamRef.current?.play?.(localVideoRef.current || undefined); } catch { /* */ }
      try {
        const client = homeCallAgoraRef.current;
        const remotes = client?.remoteUsers || [];
        for (const ru of remotes) {
          if (ru.videoTrack) ru.videoTrack.play(remoteVideoRef.current || undefined);
        }
      } catch { /* */ }
    };
    bind();
    const t = window.setInterval(bind, 800);
    // Do not open a second getUserMedia stream — Agora already owns the camera.
    // A second stream causes NOT_READABLE on many mobile browsers.
    return () => {
      window.clearInterval(t);
    };
  }, [homeCallIsVideo, homeCallPhase]);

  useEffect(() => {
    if (!user?.id || !homeCallChannel || (homeCallPhase !== 'live' && homeCallPhase !== 'connecting')) return;
    const beat = () => {
      void fetch('/api/room/heartbeat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: homeCallChannel, userId: user.id }),
      }).catch(() => {});
      homeCallMembers.filter(m => m.id !== user.id).forEach(peer => {
        void fetch('/api/profile-visit/heartbeat', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerId: peer.id,
            viewerId: user.id,
            viewerName: (user as any).name ?? null,
            viewerUsername: (user as any).username ?? null,
            viewerAvatarUrl: (user as any).avatarUrl ?? (user as any).image ?? null,
          }),
        }).catch(() => {});
        const pairChannel = `private_${homeCallShortHash([user.id, peer.id].sort().join('_'))}`;
        void fetch('/api/room/heartbeat', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: pairChannel, userId: user.id }),
        }).catch(() => {});
      });
    };
    beat();
    const interval = window.setInterval(beat, 4000);
    return () => window.clearInterval(interval);
  }, [user?.id, homeCallChannel, homeCallPhase, homeCallMembers]);

  async function notifyHomeCallAgain(opts?: { onlyUnanswered?: boolean }) {
    if (!user?.id || !homeCallChannel) return;
    const meName = (user as any).name ?? null;
    const meAvatar = (user as any).avatarUrl ?? (user as any).image ?? null;
    const onlyUnanswered = opts?.onlyUnanswered !== false;
    let targets = homeCallMembers.filter(m => m.id !== user.id && (!onlyUnanswered || !m.joined));
    // If everyone already joined, still allow a nudge to all peers
    if (!targets.length) {
      targets = homeCallMembers.filter(m => m.id !== user.id);
    }
    if (!targets.length) return;
    const invitePayload = {
      channel: homeCallChannel,
      hostId: user.id,
      hostName: meName,
      hostAvatar: meAvatar,
      members: homeCallMembers,
      at: Date.now(),
      nudge: Date.now(),
    };
    window.dispatchEvent(new CustomEvent('stooorna:home-group-call', {
      detail: { ...invitePayload, inviteeIds: targets.map(t => t.id) },
    }));
    try { localStorage.setItem('stooorna_home_call_active_invite', JSON.stringify({ ...invitePayload, inviteeIds: targets.map(t => t.id) })); } catch { /* */ }
    for (const peer of targets) {
      try { localStorage.setItem(`stooorna_home_call_invite_${peer.id}`, JSON.stringify(invitePayload)); } catch { /* */ }
      try {
        void fetch('/api/call/invite', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toUserId: peer.id,
            channel: invitePayload.channel,
            video: !!(invitePayload as any).video,
            kind: (invitePayload as any).video ? 'video' : 'voice',
            hostId: invitePayload.hostId,
            hostName: invitePayload.hostName,
            hostAvatar: invitePayload.hostAvatar,
            members: invitePayload.members,
            at: invitePayload.at,
            hostUsername: invitePayload.hostUsername,
          }),
        });
      } catch { /* */ }
      try {
        await fetch('/api/profile-visit/heartbeat', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerId: peer.id,
            viewerId: user.id,
            viewerName: meName,
            viewerUsername: (user as any).username ?? null,
            viewerAvatarUrl: meAvatar,
          }),
        });
      } catch { /* */ }
      try {
        await fetch('/api/room/join', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: `home_ring_${homeCallShortHash(peer.id)}`,
            userId: user.id,
            name: JSON.stringify({
              channel: homeCallChannel,
              hostId: user.id,
              hostName: meName,
              hostAvatar: meAvatar,
              members: homeCallMembers,
              at: Date.now(),
              video: !!homeCallVideoRef.current,
            }),
          }),
        });
      } catch { /* */ }
      try {
        const pairChannel = `private_${homeCallShortHash([user.id, peer.id].sort().join('_'))}`;
        await fetch('/api/room/join', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: pairChannel, userId: user.id, name: meName }),
        });
      } catch { /* */ }
    }
    try { navigator.vibrate?.(40); } catch { /* */ }
  }

  function playHomeIncomingRing() {
    try {
      const w = window as any;
      const Ctx: typeof AudioContext | undefined = w.AudioContext || w.webkitAudioContext;
      if (Ctx) {
        if (!w.__stooornaRingCtx) w.__stooornaRingCtx = new Ctx();
        const ctx: AudioContext = w.__stooornaRingCtx;
        if (ctx.state === 'suspended') void ctx.resume();
        const notes = [523.25, 659.25, 783.99, 1046.5];
        const base = ctx.currentTime;
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          const t = base + i * 0.09;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.2);
        });
        // Second trill
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          const t = base + 0.42 + i * 0.09;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.24, t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.2);
        });
      }
    } catch { /* */ }
    try { navigator.vibrate?.([300, 180, 300, 180, 300]); } catch { /* */ }
  }

  function stopHomeIncomingRing() {
    if (homeRingTimer.current) {
      window.clearInterval(homeRingTimer.current);
      homeRingTimer.current = null;
    }
    try {
      if ((window as any).__stooornaIncomingVibrateTimer) {
        window.clearInterval((window as any).__stooornaIncomingVibrateTimer);
        (window as any).__stooornaIncomingVibrateTimer = null;
      }
      navigator.vibrate?.(0);
    } catch { /* */ }
  }

  // Stop ring only when call is live (answered) or fully idle — keep ringback during connecting
  useEffect(() => {
    if (homeCallPhase === 'live') {
      stopHomeIncomingRing();
      try { window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } })); } catch { /* */ }
      try { window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring')); } catch { /* */ }
      try {
        if (user?.id && homeCallChannel) {
          void fetch('/api/call/invite', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clear: true, toUserId: user.id, userId: user.id, channel: homeCallChannel, answered: true }),
          });
        }
      } catch { /* */ }
    }
    if (homeCallPhase === 'idle') {
      stopHomeIncomingRing();
    }
  }, [homeCallPhase, homeCallChannel, user?.id]);

  function beginHomeIncoming(invite: { channel: string; hostId: string; hostName: string | null; hostUsername?: string | null; hostAvatar: string | null; members: HomeCallMember[]; video?: boolean; at?: number }) {
    if (homeCallPhase !== 'idle') return;
    const lock = homeRingLockRef.current;
    if (lock.mode === 'answered' && Date.now() - lock.at < 4000) return;
    if (lock.mode === 'ignored' && lock.channel === invite.channel && Date.now() - lock.at < 8000) return;
    // Already ringing for this call — do not restart the ring tone
    if (homeIncoming && String(homeIncoming.channel) === String(invite.channel)) {
      setHomeIncoming(invite);
      return;
    }
    setHomeIncoming(invite);
    setHomeIncomingExpanded(false);
    stopHomeIncomingRing();
    playHomeIncomingRing();
    homeRingTimer.current = window.setInterval(() => playHomeIncomingRing(), 2600);
    // Strong continuous-style vibration pattern for incoming call
    try {
      navigator.vibrate?.([400, 200, 400, 200, 400, 200, 400]);
    } catch { /* */ }
    try {
      window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', {
        detail: {
          ringing: true,
          channel: invite.channel,
          hostId: invite.hostId,
          hostName: invite.hostName,
          hostAvatar: invite.hostAvatar,
          hostUsername: (invite as any).hostUsername || null,
          video: !!(invite as any).video,
          kind: (invite as any).video ? 'video' : 'voice',
          at: invite.at,
        },
      }));
    } catch { /* */ }
    try {
      if (typeof Notification !== 'undefined') {
        const label = invite.hostName || 'Friend';
        const body = (invite as any).video ? 'Incoming video call' : 'Incoming voice call';
        const show = () => {
          if (Notification.permission !== 'granted') return;
          try {
            const n = new Notification(`${label}`, {
              body,
              tag: 'stooorna-incoming-call',
              requireInteraction: true,
              icon: invite.hostAvatar || undefined,
              badge: invite.hostAvatar || undefined,
              // @ts-expect-error vibrate is supported on some browsers
              vibrate: [400, 200, 400, 200, 400],
            } as NotificationOptions);
            n.onclick = () => {
              try { window.focus(); } catch { /* */ }
              n.close();
            };
          } catch { /* */ }
        };
        if (Notification.permission === 'granted') show();
        else if (Notification.permission !== 'denied') {
          void Notification.requestPermission().then(p => { if (p === 'granted') show(); });
        }
      }
    } catch { /* */ }
    // Keep vibrating on a loop while ringing
    try {
      if ((window as any).__stooornaIncomingVibrateTimer) {
        window.clearInterval((window as any).__stooornaIncomingVibrateTimer);
      }
      (window as any).__stooornaIncomingVibrateTimer = window.setInterval(() => {
        if (homeCallPhaseRef.current !== 'idle') {
          window.clearInterval((window as any).__stooornaIncomingVibrateTimer);
          (window as any).__stooornaIncomingVibrateTimer = null;
          return;
        }
        try { navigator.vibrate?.([350, 180, 350]); } catch { /* */ }
      }, 2800);
    } catch { /* */ }
    if (homeCallNoAnswerTimer.current) window.clearTimeout(homeCallNoAnswerTimer.current);
    homeCallNoAnswerTimer.current = window.setTimeout(() => {
      const hostId = invite.hostId;
      const myId = user?.id;
      ignoreHomeIncoming();
      if (myId && hostId) {
        recordMissedCallChat(myId, hostId, hostId);
        pushCallLog(myId, {
          peerId: hostId,
          peerName: invite.hostName ?? null,
          peerAvatar: invite.hostAvatar ?? null,
          direction: 'in',
          status: 'missed',
          at: Date.now(),
        });
        setHomeCallLogTick(x => x + 1);
      }
    }, HOME_CALL_NO_ANSWER_MS);
  }

  function ignoreHomeIncoming() {
    const inviteSnap = homeIncoming;
    const endedAt = Date.now();
    const channel = String(inviteSnap?.channel || '').trim();
    try {
      window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
    } catch { /* */ }

    if (homeCallNoAnswerTimer.current) {
      window.clearTimeout(homeCallNoAnswerTimer.current);
      homeCallNoAnswerTimer.current = null;
    }
    stopHomeIncomingRing();
    homeRingLockRef.current = { mode: 'ignored', channel: channel || homeIncoming?.channel || '', at: endedAt };
    // Persist the decline for this exact call instance so it can never ring
    // again on this device, even across an immediate page refresh (the ref
    // above is in-memory only and would be lost).
    if (user?.id && channel) {
      markHomeCallDeclined(user.id, homeInviteKey(channel, inviteSnap?.at));
    }
    setHomeIncomingExpanded(false);
    setHomeIncoming(null);
    setHomeCallPhase('idle');
    setHomeCallMinimized(false);
    setHomeCallChannel(null);
    setHomeCallMembers([]);
    try {
      window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
      window.dispatchEvent(new CustomEvent('stooorna:call-declined', { detail: { channel, at: endedAt } }));
      // Signal caller immediately so their connecting UI closes at the same moment
      if (channel) {
        const payload = { channel, by: user?.id || '', at: endedAt, reason: 'declined' };
        try { localStorage.setItem(`stooorna_call_ended_${channel}`, JSON.stringify(payload)); } catch { /* */ }
        try { window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: payload })); } catch { /* */ }
        try { window.dispatchEvent(new CustomEvent('stooorna:call-declined', { detail: payload })); } catch { /* */ }
        try { window.dispatchEvent(new StorageEvent('storage', { key: `stooorna_call_ended_${channel}`, newValue: JSON.stringify(payload) })); } catch { /* */ }
        const hostId = inviteSnap?.hostId;
        if (hostId) {
          try {
            localStorage.setItem(`stooorna_home_call_invite_${hostId}`, JSON.stringify({ ended: true, channel, at: endedAt, reason: 'declined' }));
            localStorage.removeItem(`stooorna_home_call_invite_${hostId}`);
          } catch { /* */ }
          clearServerCallInvite(hostId, channel);
          sendHomeCallSignal({ type: 'hangup', to: hostId, from: user?.id, channel, at: endedAt, reason: 'declined' });
          if (channel) markHomeCallChannelEnded(channel);
        }
      }
      if (user?.id) {
        localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
        localStorage.removeItem('stooorna_home_call_active_invite');
        try {
          // keepalive so this still reaches the server even if the tab is
          // refreshed or closed right after declining
          void fetch('/api/call/invite/clear', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
            keepalive: true,
          });
        } catch { /* */ }
        void fetch('/api/room/leave', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: `home_ring_${homeCallShortHash(user.id)}`, userId: user.id }),
          keepalive: true,
        });
        // Missed call into 1:1 chat when declining
        if (inviteSnap?.hostId) {
          recordMissedCallChat(user.id, inviteSnap.hostId, inviteSnap.hostId);
          pushCallLog(user.id, {
            peerId: inviteSnap.hostId,
            peerName: inviteSnap.hostName ?? null,
            peerAvatar: inviteSnap.hostAvatar ?? null,
            direction: 'in',
            status: 'missed',
            at: endedAt,
          });
          setHomeCallLogTick(x => x + 1);
        }
      }
    } catch { /* */ }
  }

  async function answerHomeIncoming(inviteOverride?: NonNullable<typeof homeIncoming>) {
    const invite = inviteOverride ?? homeIncoming;
    if (!user?.id || !invite) return;
    // Stop ring immediately on BOTH devices before any async work
    stopHomeIncomingRing();
    homeRingLockRef.current = { mode: 'answered', channel: invite.channel, at: Date.now() };
    // Keep top bar visible: enter connecting before async so UI does not vanish on answer
    setHomeCallMinimized(true);
    setHomeCallPhase('connecting');
    setHomeCallChannel(String(invite.channel || '').trim() || null);
    setHomeCallMembers([
      { id: user.id, name: (user as any).name ?? null, username: (user as any).username ?? null, avatarUrl: (user as any).avatarUrl ?? (user as any).image ?? null, joined: true },
      { id: invite.hostId, name: invite.hostName, username: (invite as any).hostUsername ?? null, avatarUrl: invite.hostAvatar, joined: false },
    ]);
    setHomeIncoming(null);
    try { window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } })); } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring')); } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent('stooorna:call-answered', { detail: { channel: invite.channel, hostId: invite.hostId } })); } catch { /* */ }
    clearServerCallInvite(user.id, invite.channel);
    if (invite.hostId) clearServerCallInvite(invite.hostId, invite.channel);
    sendHomeCallSignal({
      type: 'answered',
      to: invite.hostId,
      from: user.id,
      channel: invite.channel,
      at: Date.now(),
    });
    try {
      localStorage.setItem(`stooorna_call_answered_${invite.channel}`, JSON.stringify({ at: Date.now(), by: user.id }));
      window.dispatchEvent(new StorageEvent('storage', { key: `stooorna_call_answered_${invite.channel}` }));
    } catch { /* */ }
    try {
      localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
      localStorage.removeItem('stooorna_home_call_active_invite');
    } catch { /* */ }
    let channel = String(invite.channel || '').trim();
    if (!channel && invite.hostId) {
      channel = `private_${homeCallShortHash([user.id, invite.hostId].sort().join('_'))}`;
    }
    homeRingLockRef.current = { mode: 'answered', channel, at: Date.now() };
    if (homeCallNoAnswerTimer.current) {
      window.clearTimeout(homeCallNoAnswerTimer.current);
      homeCallNoAnswerTimer.current = null;
    }
    stopHomeIncomingRing();
    try {
      window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
    } catch { /* */ }
    homeCallVideoRef.current = !!(invite as any).video;
    setHomeCallIsVideo(!!(invite as any).video);
    setHomeIncoming(null);
    setHomeIncomingExpanded(false);
    try { window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring')); } catch { /* */ }
    try {
      localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
      localStorage.removeItem('stooorna_home_call_active_invite');
    } catch { /* */ }
    const me: HomeCallMember = {
      id: user.id,
      name: (user as any).name ?? 'You',
      username: (user as any).username ?? null,
      avatarUrl: (user as any).avatarUrl ?? (user as any).image ?? null,
      joined: true,
    };
    const host: HomeCallMember = {
      id: invite.hostId,
      name: invite.hostName,
      username: (invite as any).hostUsername
        ?? invite.members?.find((m: any) => String(m.id) === String(invite.hostId))?.username
        ?? null,
      avatarUrl: invite.hostAvatar,
      joined: true,
    };
    const members = (invite.members || []).map(m => m.id === user.id ? { ...m, ...me, joined: true } : { ...m, joined: true });
    if (!members.some(m => m.id === user.id)) members.unshift(me);
    if (invite.hostId && !members.some(m => m.id === invite.hostId)) members.push(host);
    setHomeCallChannel(channel);
    setHomeCallMembers(members);
    const session = ++homeCallSessionRef.current;
    setHomeCallPhase('connecting');
    setHomeCallMinimized(true);
    try {
      void fetch('/api/room/join', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: channel, userId: user.id, name: me.name }),
        keepalive: true,
      });
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      if (homeCallAgoraRef.current) {
        try { await homeCallAgoraRef.current.leave?.(); } catch { /* */ }
      }
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      homeCallAgoraRef.current = client;
      client.on('user-published', async (remoteUser: any, mediaType: string) => {
        try {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === 'audio') remoteUser.audioTrack?.play();
          if (mediaType === 'video') {
            requestAnimationFrame(() => { try { remoteUser.videoTrack?.play(remoteVideoRef.current || undefined); } catch { /* */ } });
          }
          if (homeCallPhaseRef.current === 'connecting') {
            setHomeCallPhase('live');
            if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
            if (homeCallNoAnswerTimer.current) {
              window.clearTimeout(homeCallNoAnswerTimer.current);
              homeCallNoAnswerTimer.current = null;
            }
          }
        } catch { /* */ }
      });
      client.on('user-unpublished', (remoteUser: any) => remoteUser.audioTrack?.stop?.());
      client.on('user-left', () => {
        try {
          const remotes = client.remoteUsers || [];
          if (remotes.length === 0 && homeCallPhaseRef.current === 'live') {
            void leaveHomeGroupCall({ remote: true });
          }
        } catch { /* */ }
      });
      const [tokenResponse, micTrack] = await Promise.all([
        fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(user.id)}`, { credentials: 'include' }),
        AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' }),
      ]);
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json() as { token: string; uid: number; appId?: string };
        await client.join(tokenData.appId || '149ef04e839c4132a08efb49d717c436', channel, tokenData.token, tokenData.uid);
        try { await micTrack.setMuted(false); } catch { /* */ }
        try { await micTrack.setEnabled(true); } catch { /* */ }
        homeCallMicRef.current = micTrack;
        const tracks: any[] = [micTrack];
        if (homeCallVideoRef.current) {
          try {
            const cam = await AgoraRTC.createCameraVideoTrack();
            homeCallCamRef.current = cam;
            tracks.push(cam);
            requestAnimationFrame(() => { try { cam.play(localVideoRef.current || undefined); } catch { /* */ } });
          } catch { /* camera permission */ }
        }
        await client.publish(tracks);
        await Promise.all((client.remoteUsers || []).map(async (remoteUser: any) => {
          try {
            if (remoteUser.hasAudio) {
              await client.subscribe(remoteUser, 'audio');
              remoteUser.audioTrack?.play();
            }
            if (remoteUser.hasVideo) {
              await client.subscribe(remoteUser, 'video');
              requestAnimationFrame(() => { try { remoteUser.videoTrack?.play(remoteVideoRef.current || undefined); } catch { /* */ } });
            }
          } catch { /* */ }
        }));
      }
    } catch { /* */ }
    if (homeCallSessionRef.current !== session) return;
    // Callee answered and joined Agora — mark live and start timer
    setHomeCallMinimized(true);
    setHomeCallPhase('live');
    if (!homeCallLiveStartedAt.current) homeCallLiveStartedAt.current = Date.now();
    try {
      localStorage.setItem(`stooorna_call_answered_${channel}`, JSON.stringify({ at: Date.now(), by: user.id, channel }));
      window.dispatchEvent(new CustomEvent('stooorna:call-answered', { detail: { channel, hostId: invite.hostId, by: user.id } }));
    } catch { /* */ }
    const poll = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json() as { members?: { userId?: string; id?: string }[] };
        const remote = d.members || [];
        setHomeCallMembers(prev => prev.map(m => ({
          ...m,
          joined: m.id === user.id || remote.some(x => String(x.userId || x.id) === m.id),
        })));
      } catch { /* */ }
    };
    void poll();
    if (homeCallPollRef.current) window.clearInterval(homeCallPollRef.current);
    homeCallPollRef.current = window.setInterval(poll, 800);
    try { localStorage.removeItem(`stooorna_home_call_invite_${user.id}`); } catch { /* */ }
  }

  function toggleHomeCallMute() {
    const next = !homeCallMuted;
    try { void homeCallMicRef.current?.setMuted?.(next); } catch { /* */ }
    setHomeCallMuted(next);
  }

  /** Invite extra friends into an already-live home call (does not restart Agora). */
  async function inviteMoreToHomeCall(friendIds: string[]) {
    if (!user?.id || !homeCallChannel || !friendIds.length) return;
    if (homeCallPhase !== 'live' && homeCallPhase !== 'connecting') return;
    const existing = new Set(homeCallMembers.map(m => m.id));
    const toAdd: HomeCallFriend[] = homeCallFriends.filter(f => friendIds.includes(f.id) && !existing.has(f.id));
    if (!toAdd.length) {
      // Allow ids not yet in friends cache
      for (const id of friendIds) {
        if (existing.has(id) || id === user.id) continue;
        toAdd.push({ id, name: 'User', username: null, avatarUrl: null });
      }
    }
    if (!toAdd.length) return;
    const nextMembers = [
      ...homeCallMembers,
      ...toAdd.map(f => ({ ...f, joined: false as boolean })),
    ];
    setHomeCallMembers(nextMembers);
    const meName = (user as any).name ?? null;
    const meAvatar = (user as any).avatarUrl ?? (user as any).image ?? null;
    const invitePayload = {
      channel: homeCallChannel,
      hostId: user.id,
      hostName: meName,
      hostUsername: (user as any).username ?? null,
      hostAvatar: meAvatar,
      members: nextMembers,
      at: Date.now(),
      video: !!homeCallVideoRef.current,
    };
    for (const peer of toAdd) {
      try { localStorage.setItem(`stooorna_home_call_invite_${peer.id}`, JSON.stringify(invitePayload)); } catch { /* */ }
      try {
        void fetch('/api/call/invite', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toUserId: peer.id,
            channel: invitePayload.channel,
            video: !!invitePayload.video,
            kind: invitePayload.video ? 'video' : 'voice',
            hostId: invitePayload.hostId,
            hostName: invitePayload.hostName,
            hostAvatar: invitePayload.hostAvatar,
            members: invitePayload.members,
            at: invitePayload.at,
            hostUsername: invitePayload.hostUsername,
          }),
        });
      } catch { /* */ }
      try {
        await fetch('/api/room/join', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: `home_ring_${homeCallShortHash(peer.id)}`,
            userId: user.id,
            name: JSON.stringify(invitePayload),
          }),
        });
      } catch { /* */ }
    }
    try {
      localStorage.setItem('stooorna_home_call_active_invite', JSON.stringify({
        ...invitePayload,
        inviteeIds: toAdd.map(t => t.id),
      }));
    } catch { /* */ }
    setHomeCallAddOpen(false);
    setHomeCallAddSelected({});
  }

  function playHomeCallTapFeedback() {
    try { navigator.vibrate?.(28); } catch { /* */ }
    try {
      const w = window as any;
      const Ctx: typeof AudioContext | undefined = w.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;
      if (!w.__stooornaTapCtx) w.__stooornaTapCtx = new Ctx();
      const ctx: AudioContext = w.__stooornaTapCtx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    } catch { /* */ }
  }

  function homeCallAction(fn: () => void) {
    playHomeCallTapFeedback();
    try { fn(); } catch { /* */ }
  }

  function toggleHomeCallSpeaker() {
    const next = !homeCallSpeakerOn;
    setHomeCallSpeakerOn(next);
    try {
      const client = homeCallAgoraRef.current;
      const remotes = client?.remoteUsers || [];
      for (const ru of remotes) {
        try { ru.audioTrack?.setVolume?.(next ? 100 : 35); } catch { /* */ }
      }
    } catch { /* */ }
    try {
      const audios = document.querySelectorAll('audio');
      audios.forEach((el) => { (el as HTMLAudioElement).volume = next ? 1 : 0.35; });
    } catch { /* */ }
  }

  async function toggleHomeCallVideo() {
    playHomeCallTapFeedback();
    const client = homeCallAgoraRef.current;
    if (!client) return;
    try {
      if (homeCallIsVideo && homeCallCamRef.current) {
        try { await client.unpublish([homeCallCamRef.current]); } catch { /* */ }
        try { homeCallCamRef.current.stop?.(); homeCallCamRef.current.close?.(); } catch { /* */ }
        homeCallCamRef.current = null;
        setHomeCallIsVideo(false);
        homeCallVideoRef.current = false;
        return;
      }
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const cam = await AgoraRTC.createCameraVideoTrack();
      homeCallCamRef.current = cam;
      await client.publish([cam]);
      requestAnimationFrame(() => { try { cam.play(localVideoRef.current || undefined); } catch { /* */ } });
      setHomeCallIsVideo(true);
      homeCallVideoRef.current = true;
    } catch {
      setHomeCallIsVideo(false);
      homeCallVideoRef.current = false;
    }
  }

  function sendHomeCallEmoji(emoji: string) {
    setHomeCallEmojiBurst(emoji);
    setHomeCallEmojiFrom(user?.id ?? 'me');
    window.setTimeout(() => { setHomeCallEmojiBurst(null); setHomeCallEmojiFrom(null); }, 1800);
    setHomeCallEmojiOpen(false);
    if (!user?.id || !homeCallChannel) return;
    const payload = { emoji, fromId: user.id, fromName: (user as any).name ?? null, at: Date.now(), channel: homeCallChannel };
    try { localStorage.setItem(`stooorna_home_call_emoji_${homeCallChannel}`, JSON.stringify(payload)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('stooorna:home-call-emoji', { detail: payload }));
    void fetch('/api/room/join', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: `home_emoji_${homeCallChannel}`.slice(0, 64),
        userId: user.id,
        name: `EMOJI:${emoji}`,
      }),
    }).catch(() => {});
  }

  useEffect(() => {
    if (!homeCallChannel || homeCallPhase === 'idle') return;
    const onEmoji = (e: Event) => {
      const d = (e as CustomEvent).detail as { emoji?: string; fromId?: string; channel?: string } | undefined;
      if (!d?.emoji || d.channel !== homeCallChannel) return;
      if (d.fromId && d.fromId === user?.id) return;
      setHomeCallEmojiBurst(d.emoji);
      setHomeCallEmojiFrom(d.fromId || 'peer');
      window.setTimeout(() => { setHomeCallEmojiBurst(null); setHomeCallEmojiFrom(null); }, 1800);
    };
    window.addEventListener('stooorna:home-call-emoji', onEmoji as EventListener);
    const pollEmoji = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(`home_emoji_${homeCallChannel}`.slice(0, 64))}`, { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json() as { members?: { userId?: string; name?: string }[] };
        const other = (d.members || []).find(m => String(m.userId || '') !== user?.id && String(m.name || '').startsWith('EMOJI:'));
        if (!other?.name) return;
        const emoji = other.name.slice('EMOJI:'.length);
        if (!emoji || emoji === homeCallEmojiBurst) return;
        setHomeCallEmojiBurst(emoji);
        setHomeCallEmojiFrom(String(other.userId || 'peer'));
        window.setTimeout(() => { setHomeCallEmojiBurst(null); setHomeCallEmojiFrom(null); }, 1800);
      } catch { /* */ }
    };
    const interval = window.setInterval(pollEmoji, 2000);
    return () => {
      window.removeEventListener('stooorna:home-call-emoji', onEmoji as EventListener);
      window.clearInterval(interval);
    };
  }, [homeCallChannel, homeCallPhase, user?.id]);

  const openFriendRequests = () => {
    navigate('/add-friend?tab=requests');
  };

  const openVoiceRoom = () => {
    navigate('/live');
  };

  // قائمة الشات نُقلت داخل أيقونة الأصدقاء (تبويب Friends / Chat)

  // إخفاء الشريط تلقائياً داخل أي شات (فردي أو سري أو دعم)، أو عند فتح نافذة كتابة منشور جديد،
  // أو عند فتح شيت "إرسال المنشور إلى الأصدقاء" — وإرجاعه تلقائياً عند الخروج من كل حالة
  // إخفاء الشريط السفلي أيضاً أثناء صفحة البوست النصي
  const isVoiceRoom = location.pathname === '/live' || location.pathname.startsWith('/live/') || location.pathname === '/live-camera' || location.pathname.startsWith('/live-camera');
  const isPrivacyPage = location.pathname === '/privacy' || location.pathname.startsWith('/privacy/');
  const miniChatOverlay = miniChat && user ? (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      bottom: (homeCallPhase === 'connecting' || homeCallPhase === 'live' || homeIncoming) ? 0 : 'calc(52px + env(safe-area-inset-bottom))',
      zIndex: (homeCallPhase === 'connecting' || homeCallPhase === 'live' || homeIncoming) ? 10990 : 10380,
      background: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
        borderBottom: '1px solid rgba(0,188,212,0.2)',
        background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#eab308', fontWeight: 800 }}>{miniChat.name || miniChat.username || 'محادثة'}</div>
          <div style={{ color: 'rgba(150,200,200,0.5)', fontSize: 12 }}>شات المشاركة · شركة / مستخدم</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(miniChat.postText || miniChat.note) && (
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            border: '1.5px solid rgba(234,179,8,0.55)',
            background: 'rgba(234,179,8,0.08)',
            direction: 'rtl',
          }}>
            {(miniChat.postText || (miniChat.mediaItems && miniChat.mediaItems.length)) ? (
              <div style={{ padding: 12, borderBottom: miniChat.note ? '1px solid rgba(234,179,8,0.25)' : 'none' }}>
                <div style={{ color: '#eab308', fontSize: 12, fontWeight: 800 }}>المنشور / المنتج</div>
                {(miniChat.mediaItems || []).map((m, i) => {
                  const ty = String(m.type || '').toLowerCase();
                  if (ty === 'video') return <video key={i} src={m.url} controls style={{ width: '100%', maxHeight: 220, borderRadius: 10, margin: '8px 0', background: '#000' }} />;
                  if (ty === 'pdf') return <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ display: 'block', margin: '8px 0', color: '#00BCD4', fontWeight: 800 }}>فتح ملف PDF</a>;
                  return <img key={i} src={m.url} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, margin: '8px 0', display: 'block' }} />;
                })}
                {miniChat.postText ? <div style={{ color: 'rgba(200,230,230,0.9)', whiteSpace: 'pre-wrap' }}>{miniChat.postText.slice(0, 800)}</div> : null}
              </div>
            ) : null}
            {miniChat.note ? (
              <div style={{ padding: 12 }}>
                <div style={{ color: '#eab308', fontSize: 12, fontWeight: 800 }}>التعليق / آخر رسالة</div>
                <div style={{ color: 'rgba(200,230,230,0.95)', whiteSpace: 'pre-wrap' }}>{miniChat.note}</div>
              </div>
            ) : null}
          </div>
        )}
        {miniMsgs.map(m => (
          <div key={m.id} style={{
            alignSelf: m.fromId === user.id ? 'flex-end' : 'flex-start',
            maxWidth: '86%', padding: '8px 10px', borderRadius: 14,
            background: m.fromId === user.id ? 'rgba(0,188,212,0.18)' : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(0,188,212,0.2)',
          }}>
            {m.type === 'text' && <span style={{ color: 'rgba(200,230,230,0.95)', fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.body}</span>}
            {m.type === 'voice' && <audio src={m.body} controls style={{ width: 210, height: 36 }} />}
            {m.type === 'image' && <img src={m.body} alt="" style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />}
            {m.type === 'video' && <video src={m.body} controls style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />}
          </div>
        ))}
      </div>
      <div style={{
        padding: '10px 12px max(12px, env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(0,188,212,0.2)',
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'rgba(6,14,14,0.96)',
      }}>
        <input ref={miniFileRef} type="file" accept="image/*,video/*" hidden onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !miniChat) return;
          const url = URL.createObjectURL(file);
          const type = file.type.startsWith('video') ? 'video' as const : 'image' as const;
          pushShareThreadMsg(user.id, miniChat.peerId, miniChat.postId || 'share', { fromId: user.id, type, body: url });
          setMiniMsgs(loadShareThread(user.id, miniChat.peerId, miniChat.postId || 'share'));
        }} />
        <button type="button" onClick={() => miniFileRef.current?.click()}
          style={{ width: 40, height: 40, borderRadius: 20, border: '1px solid rgba(0,188,212,0.3)', background: 'rgba(0,188,212,0.08)', color: '#00BCD4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0 }}>??</button>
        <button type="button" onClick={async () => {
          if (!miniChat) return;
          if (miniRec) { miniRecRef.current?.stop(); setMiniRec(false); return; }
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const rec = new MediaRecorder(stream);
            miniChunks.current = [];
            rec.ondataavailable = ev => { if (ev.data.size) miniChunks.current.push(ev.data); };
            rec.onstop = () => {
              stream.getTracks().forEach(tr => tr.stop());
              const blob = new Blob(miniChunks.current, { type: 'audio/webm' });
              const url = URL.createObjectURL(blob);
              pushShareThreadMsg(user.id, miniChat.peerId, miniChat.postId || 'share', { fromId: user.id, type: 'voice', body: url });
              setMiniMsgs(loadShareThread(user.id, miniChat.peerId, miniChat.postId || 'share'));
            };
            miniRecRef.current = rec; rec.start(); setMiniRec(true);
          } catch { /* */ }
        }}
          style={{ width: 40, height: 40, borderRadius: 20, border: '1px solid rgba(0,188,212,0.3)', background: miniRec ? 'rgba(239,68,68,0.15)' : 'rgba(0,188,212,0.08)', color: miniRec ? '#ef4444' : '#00BCD4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0 }}>
          {miniRec ? '?' : '??'}
        </button>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <input value={miniText} onChange={e => setMiniText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && miniText.trim() && miniChat) {
              e.preventDefault();
              pushShareThreadMsg(user.id, miniChat.peerId, miniChat.postId || 'share', { fromId: user.id, type: 'text', body: miniText.trim() });
              setMiniMsgs(loadShareThread(user.id, miniChat.peerId, miniChat.postId || 'share'));
              setMiniText('');
            }
          }}
          placeholder="اكتب رسالة…"
          style={{ width: '100%', boxSizing: 'border-box', borderRadius: 20, padding: '10px 42px 10px 14px', background: 'rgba(0,30,35,0.85)', border: '1px solid rgba(0,188,212,0.2)', color: 'rgba(200,230,230,0.9)', outline: 'none' }}
        />
        <button type="button" disabled={!miniText.trim()} onClick={() => {
          if (!miniChat || !miniText.trim()) return;
          pushShareThreadMsg(user.id, miniChat.peerId, miniChat.postId || 'share', { fromId: user.id, type: 'text', body: miniText.trim() });
          setMiniMsgs(loadShareThread(user.id, miniChat.peerId, miniChat.postId || 'share'));
          setMiniText('');
        }}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', border: 'none', background: miniText.trim() ? '#00BCD4' : 'transparent', color: miniText.trim() ? '#041018' : 'rgba(150,200,200,0.5)', cursor: miniText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>?</button>
        </div>
      </div>
    </div>
  ) : null;

  // قائمة شات الشركة (استفسارات المنتجات) — ملء الشاشة فوق المحتوى
  const companyListPanel = (companyChatOpen && isCompanyAccount) ? (
      <>
      {miniChatOverlay}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 'calc(52px + env(safe-area-inset-bottom))',
          zIndex: 10350,
          background: 'rgba(0,0,0,0.96)',
          transform: chatPageClosing ? 'translateY(110%)' : 'translateY(0)',
          opacity: chatPageClosing ? 0 : 1,
          transition: 'transform 280ms ease-in, opacity 220ms ease-in',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
          borderBottom: '1px solid rgba(0,188,212,0.25)',
          background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
          minHeight: 52, flexShrink: 0,
        }}>
          <Building2 size={18} style={{ color: '#00BCD4' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, color: '#00BCD4', fontWeight: 900, fontSize: '0.95rem' }}>شات العملاء</p>
            <p style={{ margin: '1px 0 0', color: 'rgba(150,190,190,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
              استفسارات المنتجات · الرسائل الواردة
            </p>
          </div>
          <button type="button" onClick={dismissChatPage} aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 16, border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
            <X size={16} />
          </button>
          {companyUnreadTotal > 0 && (
            <span style={{
              minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
              background: '#eab308', color: '#1a1400', fontSize: '0.65rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {companyUnreadTotal > 99 ? '99+' : companyUnreadTotal}
            </span>
          )}
        </div>

        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px 24px',
          background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {companyInbox.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 56, padding: '0 20px' }}>
              <MessageCircle size={36} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 12 }} />
              <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 6px' }}>
                لا رسائل بعد
              </p>
              <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                عند استفسار أي مستخدم عن منتج ستظهر المحادثات هنا تحت بعض.
              </p>
            </div>
          )}
          {companyInbox.map(peer => {
            const hasUnread = (peer.unread || 0) > 0;
            const label = peer.name || (peer.username ? `@${peer.username}` : 'مستخدم');
            const timeStr = peer.at
              ? new Date(peer.at).toLocaleString('ar-KW', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
              : '';
            return (
              <div
                key={peer.id}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: 0,
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: hasUnread ? 'rgba(234,179,8,0.1)' : 'rgba(0,188,212,0.05)',
                  border: `1.5px solid ${hasUnread ? 'rgba(234,179,8,0.75)' : 'rgba(0,188,212,0.18)'}`,
                  boxShadow: hasUnread ? '0 0 14px rgba(234,179,8,0.28)' : 'none',
                  boxSizing: 'border-box',
                  animation: hasUnread ? 'stooornaYellowPulse 1.8s ease-in-out infinite' : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => openPeerChat(peer)}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12,
                    padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'right', direction: 'rtl', color: 'rgba(200,230,230,0.95)',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    background: 'rgba(0,188,212,0.15)',
                    border: `2px solid ${hasUnread ? '#eab308' : 'rgba(0,188,212,0.35)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: hasUnread ? '#eab308' : '#00BCD4', fontWeight: 800, fontSize: '0.75rem',
                  }}>
                    {peer.avatarUrl
                      ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (label[0] || '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{
                        fontWeight: 800, fontSize: '0.88rem',
                        color: hasUnread ? '#eab308' : '#00BCD4',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {label}
                        {peer.username ? <span style={{ fontWeight: 500, fontSize: '0.72rem', opacity: 0.75 }}> @{peer.username}</span> : null}
                      </span>
                      {timeStr && (
                        <span style={{ fontSize: '0.62rem', color: 'rgba(150,190,190,0.55)', flexShrink: 0 }}>{timeStr}</span>
                      )}
                    </div>
                    <p style={{
                      margin: '4px 0 0', color: 'rgba(150,190,190,0.7)', fontSize: '0.74rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
                    }}>
                      {peer.lastMessage || 'فتح المحادثة'}
                    </p>
                  </div>
                  {hasUnread && (
                    <span style={{
                      minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
                      background: '#eab308', color: '#1a1400', fontSize: '0.65rem', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {peer.unread > 99 ? '99+' : peer.unread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  title="حذف"
                  onClick={(e) => { e.stopPropagation(); deleteCompanyPeer(peer.id); }}
                  style={{
                    width: 48, flexShrink: 0, border: 'none', borderLeft: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      </>
  ) : null;

  // قائمة شات المستخدم مع الشركات (من استفسار الشير)
  const userListPanel = (userChatOpen && !isCompanyAccount) ? (
      <>
      {miniChatOverlay}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 'calc(52px + env(safe-area-inset-bottom))',
          zIndex: 10350,
          background: 'rgba(0,0,0,0.96)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          transform: chatPageClosing ? 'translateY(110%)' : 'translateY(0)',
          opacity: chatPageClosing ? 0 : 1,
          transition: 'transform 280ms ease-in, opacity 220ms ease-in',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
          borderBottom: '1px solid rgba(0,188,212,0.25)',
          background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
          minHeight: 52, flexShrink: 0,
        }}>
          <MessageCircle size={18} style={{ color: '#00BCD4' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, color: '#00BCD4', fontWeight: 900, fontSize: '0.95rem' }}>الشات</p>
            <p style={{ margin: '1px 0 0', color: 'rgba(150,190,190,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
              Chat Friends · Chat Company
            </p>
          </div>
          <button type="button" onClick={dismissChatPage} aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 16, border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
            <X size={16} />
          </button>
          {bottomUserUnread > 0 && (
            <span style={{
              minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
              background: '#eab308', color: '#1a1400', fontSize: '0.65rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {bottomUserUnread > 99 ? '99+' : bottomUserUnread}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '10px 14px 0' }}>
          {([
            { k: 'friends' as const, label: 'Chat Friends', n: userFriendChats.length },
            { k: 'company' as const, label: 'Chat Company', n: userProductChats.length },
          ]).map(tab => (
            <button key={tab.k} type="button" onClick={() => setUserChatTab(tab.k)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '0.72rem',
                border: `1px solid ${userChatTab === tab.k ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.18)'}`,
                background: userChatTab === tab.k ? 'rgba(0,188,212,0.16)' : 'transparent',
                color: userChatTab === tab.k ? '#00BCD4' : 'rgba(150,190,190,0.75)',
              }}>
              {tab.label}{tab.n ? ` (${tab.n})` : ''}
            </button>
          ))}
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px 24px',
          background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {userChatTab === 'friends' && userFriendChats.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, padding: '0 20px' }}>
              <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.88rem', fontWeight: 600 }}>لا محادثات أصدقاء بعد</p>
              <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem' }}>عند مشاركة منشور لصديق تظهر المحادثة هنا.</p>
            </div>
          )}
          {userChatTab === 'friends' && userFriendChats.map(peer => {
            const hasUnread = (peer.unread || 0) > 0;
            const label = peer.name || (peer.username ? `@${peer.username}` : 'صديق');
            return (
              <div key={peer.id} style={{
                width: '100%', display: 'flex', alignItems: 'stretch', borderRadius: 10, overflow: 'hidden',
                background: hasUnread ? 'rgba(234,179,8,0.1)' : 'rgba(0,188,212,0.05)',
                border: `1px solid ${hasUnread ? 'rgba(234,179,8,0.75)' : 'rgba(0,188,212,0.18)'}`,
              }}>
                <button type="button" onClick={() => openFriendPeerChat(peer)} style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right', direction: 'rtl', color: 'rgba(200,230,230,0.95)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    background: 'rgba(0,188,212,0.15)', border: `2px solid ${hasUnread ? '#eab308' : 'rgba(0,188,212,0.35)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4', fontWeight: 800,
                  }}>
                    {peer.avatarUrl ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (label[0] || '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: hasUnread ? '#eab308' : '#00BCD4' }}>{label}</span>
                    <p style={{ margin: '4px 0 0', color: 'rgba(150,190,190,0.7)', fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {peer.lastMessage || 'مشاركة منشور'}
                    </p>
                  </div>
                </button>
                <button type="button" title="حذف" onClick={(e) => { e.stopPropagation(); deleteFriendPeer(peer.id); }}
                  style={{ width: 36, flexShrink: 0, border: 'none', borderLeft: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            );
          })}
          {userChatTab === 'company' && userProductChats.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 56, padding: '0 20px' }}>
              <MessageCircle size={36} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 12 }} />
              <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 6px' }}>
                لا محادثات بعد
              </p>
              <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                عند الاستفسار عن منتج من الشير تظهر الشركة هنا للتواصل المباشر.
              </p>
            </div>
          )}
          {userChatTab === 'company' && userProductChats.map(peer => {
            const hasUnread = (peer.unread || 0) > 0;
            const label = peer.name || (peer.username ? `@${peer.username}` : 'شركة');
            const timeStr = peer.at
              ? new Date(peer.at).toLocaleString('ar-KW', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
              : '';
            return (
              <div
                key={peer.id}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'stretch',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: hasUnread ? 'rgba(234,179,8,0.1)' : 'rgba(0,188,212,0.05)',
                  border: `1.5px solid ${hasUnread ? 'rgba(234,179,8,0.75)' : 'rgba(0,188,212,0.18)'}`,
                  boxShadow: hasUnread ? '0 0 14px rgba(234,179,8,0.28)' : 'none',
                  boxSizing: 'border-box',
                  animation: hasUnread ? 'stooornaYellowPulse 1.8s ease-in-out infinite' : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => openUserPeerChat(peer)}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12,
                    padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'right', direction: 'rtl', color: 'rgba(200,230,230,0.95)',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    background: 'rgba(0,188,212,0.15)',
                    border: `2px solid ${hasUnread ? '#eab308' : 'rgba(0,188,212,0.35)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: hasUnread ? '#eab308' : '#00BCD4', fontWeight: 800, fontSize: '0.75rem',
                  }}>
                    {peer.avatarUrl
                      ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (label[0] || '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{
                        fontWeight: 800, fontSize: '0.88rem',
                        color: hasUnread ? '#eab308' : '#00BCD4',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {label}
                        {peer.username ? <span style={{ fontWeight: 500, fontSize: '0.72rem', opacity: 0.75 }}> @{peer.username}</span> : null}
                      </span>
                      {timeStr && (
                        <span style={{ fontSize: '0.62rem', color: 'rgba(150,190,190,0.55)', flexShrink: 0 }}>{timeStr}</span>
                      )}
                    </div>
                    <p style={{
                      margin: '4px 0 0', color: 'rgba(150,190,190,0.7)', fontSize: '0.74rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
                    }}>
                      {peer.lastMessage || 'فتح المحادثة'}
                    </p>
                  </div>
                  {hasUnread && (
                    <span style={{
                      minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
                      background: '#eab308', color: '#1a1400', fontSize: '0.65rem', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {peer.unread > 99 ? '99+' : peer.unread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  title="حذف"
                  onClick={(e) => { e.stopPropagation(); deleteUserPeer(peer.id); }}
                  style={{
                    width: 48, flexShrink: 0, border: 'none', borderLeft: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      </>
  ) : null;

  if (isPrivacyPage || isVoiceRoom || postComposerOpen || shareSheetOpen || storyCameraOpen || supportChatOpen || companyAuthOpen) return null;

  const itemStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    height: 48,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: active ? '#00BCD4' : 'rgba(0,188,212,0.55)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
    zIndex: 1,
    WebkitTapHighlightColor: 'transparent',
    transition: 'color 0.15s ease',
  });

  // مستطيل بسيط بحجم الأيقونة فقط — بدون وميض/توهج كبير
  const activePill = (active: boolean, accent = 'rgba(0,188,212,0.14)', border = 'rgba(0,188,212,0.28)'): React.CSSProperties =>
    active
      ? {
          background: accent,
          border: `1px solid ${border}`,
          borderRadius: 12,
          width: 44,
          height: 36,
        }
      : {
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 12,
          width: 44,
          height: 36,
        };




  // Video UI is handled by FriendVideoCallStage on /add-friend (My Live).
  // Do not mount a second full-screen "Waiting for video" layer on top of it.
  const homeVideoOverlay = null;

  const peerOnCall = (() => {
    const others = homeCallMembers.filter(m => m.id !== user?.id);
    const joined = others.find(m => m.joined) || others[0];
    if (joined) return joined;
    if (homeIncoming) {
      return {
        id: homeIncoming.hostId,
        name: homeIncoming.hostName,
        username: (homeIncoming as any).hostUsername ?? homeIncoming.members?.find((m: any) => m.id === homeIncoming.hostId)?.username ?? null,
        avatarUrl: homeIncoming.hostAvatar,
        joined: false,
      } as HomeCallMember;
    }
    return null;
  })();

  const formatCallDuration = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const homeCallStatusLabel = homeCallPhase === 'live'
    ? formatCallDuration(homeCallElapsedSec)
    : homeCallPhase === 'connecting'
      ? 'Ringing…'
      : '';

  const homeIncomingOverlay = null;
  const homeCallSheetShown = homeCallPhase === 'animating' || homeCallPhase === 'connecting' || homeCallPhase === 'live';
  // Top sticky call bar: incoming (idle+invite) OR active outgoing/live
  const showTopCallBar = homeCallSheetShown || !!(homeIncoming && homeCallPhase === 'idle');
  const isIncomingRinging = !!(homeIncoming && homeCallPhase === 'idle');


  const homeCallOverlay = (homeCallPickerOpen || homeCallPhase !== 'idle' || !!homeIncoming) ? (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10950,
      background: homeCallPickerOpen && homeCallPhase === 'idle' ? 'rgba(6,10,12,0.55)' : 'transparent',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      pointerEvents: homeCallPickerOpen && homeCallPhase === 'idle' ? 'auto' : 'none',
    }}>
      {homeCallPickerOpen && homeCallPhase === 'idle' && (
        <div
          style={{ pointerEvents: 'auto', width: '100%', maxHeight: '70vh', background: 'linear-gradient(180deg,#0a1f22 0%,#061014 100%)', borderTopLeftRadius: 18, borderTopRightRadius: 18, border: '1px solid rgba(0,188,212,0.25)', padding: '14px 14px max(16px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <p style={{ margin: 0, flex: 1, color: '#00BCD4', fontWeight: 800, fontSize: 16 }}>Call a friend</p>
            <button
              type="button"
              onClick={() => { setHomeCallLogOpen(true); setHomeCallLogTick(x => x + 1); }}
              aria-label="Call history"
              title="Call history"
              style={{
                width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(0,188,212,0.4)',
                background: 'rgba(0,188,212,0.12)', color: '#00BCD4', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
              }}
            >
              <Clock size={17} strokeWidth={2.3} />
            </button>
            <button type="button" onClick={() => setHomeCallPickerOpen(false)} aria-label="Close" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 0 }}>
              <X size={18} strokeWidth={2.4} style={{ display: 'block' }} />
            </button>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '48vh', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {homeCallFriends.map(f => {
              const on = !!homeCallSelected[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setHomeCallSelected(s => ({ ...s, [f.id]: !s[f.id] }))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 12, border: on ? '1px solid rgba(0,188,212,0.55)' : '1px solid rgba(0,188,212,0.18)',
                    background: on ? 'rgba(0,188,212,0.14)' : 'rgba(0,188,212,0.05)',
                    color: '#d7eeee', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', background: 'rgba(0,188,212,0.2)', flexShrink: 0 }}>
                    {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (f.name || f.username || '?')[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || f.username || 'Friend'}</span>
                    {f.username ? <span style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(150,200,200,0.65)' }}>@{f.username}</span> : null}
                  </div>
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, border: '2px solid #00BCD4',
                    background: on ? '#00BCD4' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: on ? '#041018' : 'transparent', fontSize: 13, fontWeight: 900,
                  }}>{on ? '\u2713' : ''}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!Object.values(homeCallSelected).some(Boolean)}
            onClick={() => { void startHomeGroupCall(); }}
            style={{
              width: '100%', marginTop: 12, padding: 14, borderRadius: 14, border: 'none',
              background: Object.values(homeCallSelected).some(Boolean) ? '#00BCD4' : 'rgba(0,188,212,0.2)',
              color: '#041018', fontWeight: 800, cursor: Object.values(homeCallSelected).some(Boolean) ? 'pointer' : 'default',
            }}
          >
            Call
          </button>
        </div>
      )}

      {/* WhatsApp-style bottom call pill — active call only (dark app chrome + moving border shine) */}
      {showTopCallBar && (
        <div
          style={{
            pointerEvents: 'auto',
            position: 'fixed',
            left: 12,
            right: 12,
            top: 'max(10px, env(safe-area-inset-top, 0px))',
            zIndex: 10960,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <style>{`
            @keyframes stooornaCallBorderShine {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          {/* Outer ring: rotating cyan shine around the pill */}
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 999,
              padding: 2,
              position: 'relative',
              overflow: 'hidden',
              boxSizing: 'border-box',
              animation: 'stooornaHomeCallSheet 0.34s cubic-bezier(0.32, 0.72, 0, 1)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 18px rgba(0,188,212,0.18)',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: '-40%',
                background: 'conic-gradient(from 0deg, transparent 0%, transparent 55%, rgba(0,188,212,0.15) 62%, #00BCD4 70%, #e0fbff 74%, #00BCD4 78%, rgba(0,188,212,0.15) 85%, transparent 92%, transparent 100%)',
                animation: 'stooornaCallBorderShine 2.8s linear infinite',
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                width: '100%',
                background: 'linear-gradient(180deg, #0c2226 0%, #071416 55%, #050e10 100%)',
                borderRadius: 999,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                boxSizing: 'border-box',
              }}
            >
            {isIncomingRinging ? (
              <button
                type="button"
                onClick={() => homeCallAction(() => { ignoreHomeIncoming(); })}
                aria-label="Decline"
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none',
                  background: 'rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                }}
              >
                <X size={20} strokeWidth={2.4} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => homeCallAction(() => toggleHomeCallMute())}
                aria-label={homeCallMuted ? 'Unmute' : 'Mute'}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.28)',
                  background: homeCallMuted ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                  color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                }}
              >
                {homeCallMuted ? <MicOff size={20} strokeWidth={2.2} /> : <Mic size={20} strokeWidth={2.2} />}
              </button>
            )}

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, gap: 6 }}>
              {/* Participant list circle — green dot in center; opens full member list */}
              {!isIncomingRinging && (homeCallPhase === 'live' || homeCallPhase === 'connecting') && (
                <button
                  type="button"
                  onClick={() => homeCallAction(() => { setHomeCallMembersOpen(o => !o); setHomeCallAddOpen(false); })}
                  aria-label="Call participants"
                  style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    border: '1.5px solid rgba(255,255,255,0.28)',
                    background: homeCallMembersOpen ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, position: 'relative',
                  }}
                >
                  <Users size={16} strokeWidth={2.2} />
                  <span style={{
                    position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: '50%',
                    background: '#22c55e', border: '1.5px solid #0a1a1a',
                  }} />
                </button>
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(() => {
                  // Outer bar: at most 3 profiles side-by-side. Prefer joined members; fill gaps when someone leaves.
                  const meId = user?.id ? String(user.id) : '';
                  const sorted = [...homeCallMembers].sort((a, b) => {
                    const aj = a.joined || a.id === meId ? 1 : 0;
                    const bj = b.joined || b.id === meId ? 1 : 0;
                    if (bj !== aj) return bj - aj;
                    if (a.id === meId) return -1;
                    if (b.id === meId) return 1;
                    return 0;
                  });
                  let outer = sorted.slice(0, 3);
                  if (outer.length === 0 && peerOnCall) {
                    outer = [{
                      id: peerOnCall.id,
                      name: peerOnCall.name,
                      username: peerOnCall.username,
                      avatarUrl: peerOnCall.avatarUrl,
                      joined: !!peerOnCall.joined,
                    }];
                  }
                  if (outer.length === 0 && meId) {
                    outer = [{
                      id: meId,
                      name: (user as any)?.name ?? null,
                      username: (user as any)?.username ?? null,
                      avatarUrl: (user as any)?.avatarUrl ?? (user as any)?.image ?? null,
                      joined: true,
                    }];
                  }
                  const size = outer.length >= 4 ? 36 : outer.length === 3 ? 40 : 44;
                  const overlap = outer.length >= 4 ? -12 : -14;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                      {outer.map((m, i) => {
                        const isMe = meId && m.id === meId;
                        const muted = isMe && homeCallMuted;
                        const label = m.name || m.username || '?';
                        return (
                          <div
                            key={m.id || i}
                            title={label}
                            style={{
                              width: size, height: size, borderRadius: '50%', overflow: 'hidden',
                              background: '#e8e8e8', border: '2px solid #fff',
                              boxShadow: muted
                                ? '0 0 0 2px rgba(239,68,68,0.55)'
                                : '0 0 0 2px rgba(34,197,94,0.35)',
                              marginLeft: i === 0 ? 0 : overlap,
                              zIndex: i + 1, position: 'relative', flexShrink: 0,
                            }}
                          >
                            {m.avatarUrl ? (
                              <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: muted ? 'grayscale(0.35)' : undefined }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#333', fontSize: size * 0.38 }}>
                                {(label || '?')[0]}
                              </div>
                            )}
                            {muted && (
                              <span style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <MicOff size={Math.max(12, size * 0.38)} color="#fff" strokeWidth={2.4} />
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {homeCallPhase === 'live' && (
                        <span style={{
                          position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%)',
                          display: 'flex', gap: 2, alignItems: 'flex-end', height: 12, pointerEvents: 'none',
                        }}>
                          {[0,1,2].map(i => (
                            <span key={i} style={{
                              width: 3, borderRadius: 2, background: '#22c55e',
                              height: 6 + (i === 1 ? 6 : 0),
                              animation: 'stooornaLivePulse 0.9s ease-in-out infinite',
                              animationDelay: `${i * 0.12}s`,
                            }} />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <button
              type="button"
              onClick={() => homeCallAction(() => {
                setHomeCallEmojiBurst('👋');
                window.setTimeout(() => setHomeCallEmojiBurst(null), 900);
                // Re-ring anyone who has not joined yet so they can answer and enter the call
                if (homeCallPhase === 'connecting' || homeCallPhase === 'live' || homeCallPhase === 'animating') {
                  void notifyHomeCallAgain({ onlyUnanswered: true });
                }
              })}
              aria-label="Wave and re-ring"
              title="Wave / ring again"
              style={{
                width: 44, height: 44, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.28)',
                background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, fontSize: 22,
              }}
            >
              👋
            </button>

            {isIncomingRinging ? (
              <button
                type="button"
                onClick={() => homeCallAction(() => { void answerHomeIncoming(); })}
                aria-label="Answer"
                style={{
                  width: 48, height: 48, borderRadius: '50%', border: 'none',
                  background: '#22c55e', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(34,197,94,0.45)',
                }}
              >
                <Phone size={20} strokeWidth={2.3} color="#fff" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => homeCallAction(() => { void leaveHomeGroupCall(); })}
                aria-label="End call"
                style={{
                  width: 48, height: 48, borderRadius: '50%', border: 'none',
                  background: '#e11d48', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(225,29,72,0.35)',
                }}
              >
                <PhoneOff size={20} strokeWidth={2.3} color="#fff" />
              </button>
            )}
            </div>
          </div>
          <p style={{
            margin: 0, color: 'rgba(180,220,220,0.85)', fontSize: 12, fontWeight: 600,
            background: 'rgba(6,16,20,0.92)', border: '1px solid rgba(0,188,212,0.2)', borderRadius: 12, padding: '4px 12px',
          }}>
            {isIncomingRinging
              ? `Incoming · ${peerOnCall?.name || peerOnCall?.username || 'Call'}`
              : homeCallPhase === 'live'
                ? (homeCallStatusLabel || formatCallDuration(homeCallElapsedSec))
                : (peerOnCall ? `Calling ${peerOnCall.name || peerOnCall.username || '…'}…` : 'Connecting…')}
            {homeCallPhase === 'live' && homeCallMembers.filter(m => m.id !== user?.id && m.joined).length === 0
              ? ' · No one else is here yet…'
              : ''}
          </p>
          {/* In-call participant list (green = active, muted mic when self muted) */}
          {homeCallMembersOpen && !isIncomingRinging && (
            <div style={{
              width: '100%', maxWidth: 420, marginTop: 4,
              background: 'rgba(6,16,20,0.96)', border: '1px solid rgba(0,188,212,0.25)',
              borderRadius: 16, padding: '10px 12px', boxSizing: 'border-box',
              maxHeight: 220, overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <p style={{ margin: 0, flex: 1, color: '#00BCD4', fontWeight: 800, fontSize: 13 }}>
                  In this call · {homeCallMembers.length}
                </p>
                <button
                  type="button"
                  onClick={() => homeCallAction(() => {
                    setHomeCallAddOpen(true);
                    if (!homeCallFriends.length) setHomeCallPickerOpen(true);
                  })}
                  aria-label="Add people"
                  style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    border: '1.5px solid rgba(0,188,212,0.45)',
                    background: homeCallAddOpen ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.1)',
                    color: '#00BCD4', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}
                >
                  <Plus size={16} strokeWidth={2.6} />
                </button>
              </div>
              {homeCallMembers.map(m => {
                const isMe = user?.id && m.id === user.id;
                const muted = isMe && homeCallMuted;
                const label = m.name || m.username || 'User';
                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                    borderBottom: '1px solid rgba(0,188,212,0.08)',
                  }}>
                    <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
                        background: 'rgba(0,188,212,0.15)', border: '1.5px solid rgba(255,255,255,0.2)',
                      }}>
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                            {(label || '?')[0]}
                          </div>
                        )}
                      </div>
                      <span style={{
                        position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: '50%',
                        background: muted ? 'rgba(239,68,68,0.95)' : '#22c55e',
                        border: '1.5px solid #061014',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {muted ? <MicOff size={8} color="#fff" strokeWidth={2.6} /> : null}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, color: '#e8f6f6', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}{isMe ? ' (you)' : ''}
                      </p>
                      {m.username ? (
                        <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: 11 }}>@{m.username}</p>
                      ) : null}
                    </div>
                    <span style={{ color: muted ? '#ef4444' : (m.joined ? '#22c55e' : 'rgba(150,200,200,0.45)'), fontSize: 11, fontWeight: 700 }}>
                      {muted ? 'Muted' : (m.joined ? 'In call' : 'Ringing')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add people while call is live */}
          {homeCallAddOpen && !isIncomingRinging && (
            <div style={{
              width: '100%', maxWidth: 420, marginTop: 4,
              background: 'rgba(6,16,20,0.96)', border: '1px solid rgba(0,188,212,0.25)',
              borderRadius: 16, padding: '10px 12px', boxSizing: 'border-box',
              maxHeight: 240, overflowY: 'auto',
            }}>
              <p style={{ margin: '0 0 8px', color: '#00BCD4', fontWeight: 800, fontSize: 13 }}>Add people</p>
              {homeCallFriends.filter(f => !homeCallMembers.some(m => m.id === f.id)).length === 0 && (
                <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: 12, textAlign: 'center', padding: 12 }}>No more friends to add</p>
              )}
              {homeCallFriends.filter(f => !homeCallMembers.some(m => m.id === f.id)).map(f => {
                const on = !!homeCallAddSelected[f.id];
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHomeCallAddSelected(s => ({ ...s, [f.id]: !s[f.id] }))}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
                      border: 'none', background: on ? 'rgba(0,188,212,0.12)' : 'transparent',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left', color: '#d7eeee',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: 'rgba(0,188,212,0.2)', flexShrink: 0 }}>
                      {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (f.name || f.username || '?')[0]}
                    </div>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{f.name || f.username || 'Friend'}</span>
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, border: '2px solid #00BCD4',
                      background: on ? '#00BCD4' : 'transparent', color: on ? '#041018' : 'transparent',
                      fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{on ? '\u2713' : ''}</span>
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!Object.values(homeCallAddSelected).some(Boolean)}
                onClick={() => {
                  const ids = Object.keys(homeCallAddSelected).filter(id => homeCallAddSelected[id]);
                  void inviteMoreToHomeCall(ids);
                }}
                style={{
                  width: '100%', marginTop: 10, padding: 12, borderRadius: 12, border: 'none',
                  background: Object.values(homeCallAddSelected).some(Boolean) ? '#00BCD4' : 'rgba(0,188,212,0.2)',
                  color: '#041018', fontWeight: 800, cursor: Object.values(homeCallAddSelected).some(Boolean) ? 'pointer' : 'default',
                }}
              >
                Invite to call
              </button>
            </div>
          )}

          {homeCallEmojiBurst && (
            <div style={{ position: 'absolute', bottom: 90, fontSize: 40, animation: 'stooornaNavBubble 0.9s ease-out', pointerEvents: 'none' }}>
              {homeCallEmojiBurst}
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;


  return (
  <>
  {companyListPanel}
  {userListPanel}
  {miniChatOverlay}
  {homeVideoOverlay}{homeIncomingOverlay}{homeCallOverlay}

      {homeCallLogOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10980, background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <p style={{ margin: 0, flex: 1, color: '#111', fontWeight: 800, fontSize: 22 }}>Calls</p>
            <button type="button" aria-label="Search" style={{ width: 36, height: 36, border: 'none', background: 'none', color: '#111', cursor: 'pointer' }}><Clock size={18} /></button>
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setHomeCallLogMenuOpen(o => !o)} aria-label="Call menu" style={{ width: 36, height: 36, border: 'none', background: 'none', color: '#111', cursor: 'pointer' }}>
                <MoreVertical size={18} />
              </button>
              {homeCallLogMenuOpen && (
                <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 180, zIndex: 2 }}>
                  <button type="button" onClick={() => {
                    if (user?.id) saveCallLog(user.id, []);
                    setHomeCallLogTick(x => x + 1);
                    setHomeCallLogMenuOpen(false);
                  }} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, color: '#111' }}>
                    Clear History
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={() => { setHomeCallLogOpen(false); setHomeCallLogMenuOpen(false); }} style={{ width: 36, height: 36, border: 'none', background: 'none', color: '#111', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f2f2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Phone size={26} color="#666" />
            </div>
            <p style={{ margin: 0, color: '#111', fontWeight: 800, fontSize: 18 }}>Recent</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 20px' }}>
            {(() => {
              void homeCallLogTick;
              const rows = user?.id ? loadCallLog(user.id) : [];
              if (!rows.length) {
                return <p style={{ color: '#888', textAlign: 'center', padding: 28 }}>No recent calls</p>;
              }
              return rows.map(row => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    if (!row.peerId || homeCallPhase !== 'idle') return;
                    setHomeCallLogOpen(false);
                    setHomeCallPickerOpen(false);
                    setHomeCallSelected({ [row.peerId]: true });
                    void startHomeGroupCall([row.peerId]);
                  }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px',
                    border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                    background: row.status === 'answered' ? '#22c55e' : (row.status === 'missed' && row.direction === 'in' ? '#ef4444' : '#9ca3af'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {row.peerAvatar ? (
                      <img src={row.peerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Phone size={18} color="#fff" strokeWidth={2.3} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, color: row.status === 'missed' ? '#e11d48' : '#111', fontSize: 15 }}>{row.peerName || 'User'}</p>
                    <p style={{ margin: 0, color: row.status === 'missed' ? '#e11d48' : '#16a34a', fontSize: 12, fontWeight: 600 }}>
                      {row.status === 'missed' && row.direction === 'in' ? 'Missed call' : row.status === 'missed' && row.direction === 'out' ? 'No answer' : (row.direction === 'out' ? 'Outgoing' : 'Incoming')}
                      {row.durationSec ? ` · ${Math.floor(row.durationSec / 60)}:${String(row.durationSec % 60).padStart(2, '0')}` : ''}
                      {' · '}
                      {new Date(row.at).toLocaleString()}
                    </p>
                  </div>
                  <Phone size={18} color="#111" />
                </button>
              ));
            })()}
          </div>
        </div>
      )}

  {(() => {
    const hideBottomBar =
      navBarHidden
      || textPostsOpen
      || liveMapOpen
      || isConversation
      || secretChatOpen
      || friendChatOpen
      || !!miniChat;
    return (
  <nav aria-label="Main navigation" style={{
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 12000,
    height: 'calc(52px + env(safe-area-inset-bottom))',
    paddingBottom: 'env(safe-area-inset-bottom)',
    background: 'linear-gradient(180deg, rgba(6,14,14,0.92) 0%, rgba(6,14,14,0.99) 100%)',
    boxSizing: 'border-box',
    borderTop: '1px solid rgba(0,188,212,0.12)',
    transform: hideBottomBar ? 'translateY(100%)' : 'translateY(0)',
    opacity: hideBottomBar ? 0 : 1,
    pointerEvents: hideBottomBar ? 'none' : 'auto',
    transition: 'transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease',
  }}>
      <div style={{
      width: '100%',
      maxWidth: 520,
      height: 48,
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    }}>

        {/* Plus menu — Settings / Friends / Account live */}
        <div style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 48,
          height: 40,
          zIndex: 3,
        }}>
          {plusMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setPlusMenuOpen(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 10210,
                  background: 'transparent', border: 'none', cursor: 'default',
                }}
              />
              <div style={{
                position: 'absolute',
                bottom: 48,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                zIndex: 10220,
                animation: 'stooornaPlusFanIn 0.28s ease-out',
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    popNavBubble('menu');
                    if (settingsSheetOpen) {
                      window.dispatchEvent(new CustomEvent('stooorna:close-settings-sheet'));
                      return;
                    }
                    navigate('/settings');
                  }}
                  aria-label="Settings"
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: '1px solid rgba(0,188,212,0.4)',
                    background: 'rgba(6,20,22,0.96)',
                    color: '#00BCD4',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                  }}
                >
                  <Settings size={20} strokeWidth={2.2} />
                </button>
                {user && (
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setHomeCallPickerOpen(true);
                    }}
                    aria-label="Call"
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      border: '1px solid rgba(0,188,212,0.4)',
                      background: 'rgba(6,20,22,0.96)',
                      color: '#00BCD4',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                    }}
                  >
                    <Phone size={20} strokeWidth={2.2} />
                  </button>
                </div>
                )}
                {user && (
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    popNavBubble('chat');
                    try {
                      window.dispatchEvent(new CustomEvent('stooorna:open-normal-chat-picker'));
                    } catch { /* */ }
                    if (!(location.pathname === '/add-friend' || location.pathname.startsWith('/add-friend'))) {
                      navigate('/add-friend?tab=friends&openChatPicker=1');
                    }
                  }}
                  aria-label="Chat"
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: '1px solid rgba(0,188,212,0.4)',
                    background: 'rgba(6,20,22,0.96)',
                    color: '#00BCD4',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                  }}
                >
                  <MessageCircle size={20} strokeWidth={2.2} />
                </button>
                )}
                {user && (
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    popNavBubble('friends');
                    setFriendsPanelOpen(true);
                    const open = () => {
                      try {
                        window.dispatchEvent(new CustomEvent('stooorna:open-friends-panel', {
                          detail: { tab: 'friends' },
                        }));
                      } catch { /* */ }
                    };
                    if (location.pathname === '/add-friend' || location.pathname.startsWith('/add-friend')) {
                      open();
                      return;
                    }
                    navigate('/add-friend?tab=friends&openFriendsPanel=1');
                    window.setTimeout(open, 80);
                  }}
                  aria-label="Friends"
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: '1px solid rgba(0,188,212,0.4)',
                    background: 'rgba(6,20,22,0.96)',
                    color: '#00BCD4',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                  }}
                >
                  <Users size={20} strokeWidth={2.2} />
                </button>
                )}
                {user && (
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    try { sessionStorage.removeItem('stooorna_return_text_posts'); } catch { /* ignore */ }
                    setLiveKindOpen(true);
                  }}
                  aria-label="Account live broadcast"
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: myLiveActive ? '1px solid rgba(239,68,68,0.65)' : '1px solid rgba(0,188,212,0.4)',
                    background: myLiveActive ? 'rgba(239,68,68,0.12)' : 'rgba(6,20,22,0.96)',
                    color: myLiveActive ? '#ef4444' : '#00BCD4',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: myLiveActive
                      ? '0 0 14px rgba(239,68,68,0.55)'
                      : '0 4px 16px rgba(0,0,0,0.45)',
                    animation: myLiveActive ? 'stooornaLivePulse 1s ease-in-out infinite' : 'none',
                  }}
                >
                  <Radio size={20} strokeWidth={2.2} />
                </button>
                )}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              popNavBubble('plus');
              // If fan open -> close fan
              if (plusMenuOpen) {
                setPlusMenuOpen(false);
                return;
              }
              // If settings open -> close settings
              if (settingsSheetOpen) {
                window.dispatchEvent(new CustomEvent('stooorna:close-settings-sheet'));
                return;
              }
              // If friends square open -> close it
              if (friendsPanelOpen) {
                window.dispatchEvent(new CustomEvent('stooorna:close-friends-panel'));
                setFriendsPanelOpen(false);
                return;
              }
              if (homeCallPickerOpen) {
                setHomeCallPickerOpen(false);
                return;
              }
              if (storyMediaOpen) {
                window.dispatchEvent(new CustomEvent('stooorna:close-story-media'));
                setStoryMediaOpen(false);
                return;
              }
              // Otherwise open fan
              setPlusMenuOpen(true);
            }}
            aria-label="Open menu"
            aria-expanded={plusMenuOpen || settingsSheetOpen || friendsPanelOpen}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 36,
              border: 'none',
              background: (plusMenuOpen || settingsSheetOpen || friendsPanelOpen) ? 'rgba(0,188,212,0.14)' : 'transparent',
              borderRadius: 12,
              color: (plusMenuOpen || settingsSheetOpen || friendsPanelOpen) ? '#00BCD4' : 'rgba(0,188,212,0.85)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              WebkitTapHighlightColor: 'transparent',
              boxShadow: 'none',
            }}
          >
            <NavBubble id="plus" color="rgba(0,188,212,0.65)" />
            <span style={{
              display: 'flex',
              transition: 'transform 0.25s ease',
              transform: (plusMenuOpen || settingsSheetOpen || friendsPanelOpen) ? 'rotate(45deg)' : 'rotate(0deg)',
              transformOrigin: 'center center',
            }}>
              <Plus size={26} strokeWidth={2.4} />
            </span>
          </button>
        </div>

        {/* طلبات الإضافة تُستقبل من كاميرا نشر القصة — لا شارة عائمة هنا */}
      </div>

    </nav>
    );
  })()}
  {user ? (
    <LiveKindPicker
      open={liveKindOpen}
      onClose={() => setLiveKindOpen(false)}
      hostId={String(user.id)}
      hostName={String((user as any).name || (user as any).username || 'Host')}
      hostUsername={(user as any).username ?? null}
      hostAvatar={(user as any).avatarUrl || (user as any).image || null}
    />
  ) : null}
  </>

  );
}
export default function RootLayout({
  children
}: RootLayoutProps) {
  const {
    subscribe
  } = usePushNotifications();
  const sessionResult = useSession();
  const session = (sessionResult as any).session ?? (sessionResult as any).data;
  const location = useLocation();
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return localStorage.getItem('stooorna_welcome_ok') !== '1';
    } catch {
      return true;
    }
  });
  const [showSplash, setShowSplash] = useState(false);
  const finishSplash = () => {
    try {
      sessionStorage.setItem('stooorna_splash_seen', '1');
    } catch { /* ignore */ }
    setShowSplash(false);
  };
  const finishWelcome = () => {
    try {
      localStorage.setItem('stooorna_welcome_ok', '1');
    } catch { /* ignore */ }
    setShowWelcome(false);
    setShowSplash(true);
  };

  // عند فتح التطبيق على / نوجّه مباشرة لصفحة الهوم مع فتح البوستات النصية
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/add-friend?tab=friends&openTextPosts=1', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const path = location.pathname || '';
    const isLive = path === '/live' || path.startsWith('/live/') || path === '/live-camera' || path.startsWith('/live-camera');
    if (isLive) return;
    if (path !== '/add-friend' && !path.startsWith('/add-friend')) return;
    try {
      if (sessionStorage.getItem('stooorna_return_text_posts') !== '1') return;
    } catch {
      return;
    }
    const params = new URLSearchParams(location.search);
    if (params.get('openTextPosts') === '1') return;
    navigate('/add-friend?tab=friends&openTextPosts=1', { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!session?.user) return;
    // Browser notification permission must be requested from a user gesture.
    // Registering the service worker still happens on load; this listener
    // completes the subscription on the user's first tap or key press.
    const enablePush = () => { void subscribe(); };
    window.addEventListener('pointerdown', enablePush, { once: true, passive: true });
    window.addEventListener('keydown', enablePush, { once: true });
    return () => {
      window.removeEventListener('pointerdown', enablePush);
      window.removeEventListener('keydown', enablePush);
    };
  }, [session?.user?.id, subscribe]);

  // Keep public VIP + Business badges in sync for every viewer (mounted once
  // for the whole app here in RootLayout).
  useEffect(() => {
    startPublicBadgeSync(session?.user?.id ?? null);
  }, [session?.user?.id]);

  // صفحات "ملء الشاشة" مثل الشات الفردي (/chat) تدير ارتفاعها وسكرولها الداخلي
  // بنفسها (height: 100dvh + overflow: hidden) وتُخفي الشريط السفلي أصلاً.
  // لو أبقينا الـ padding-bottom المحجوز لشريط التنقل، يصير ارتفاع المحتوى
  // الكلي أطول من الشاشة، فتصير الصفحة قابلة للسكرول رغم أنها يفترض تكون
  // ثابتة — وأي سكرول تلقائي (استرجاع موضع السكرول، تصغير شريط عنوان
  // المتصفح، إلخ) يسحب الهيدر الملتصق فوق المحادثة خارج نطاق الرؤية.
  // لذلك نلغي هذا الحجز تحديدًا بهذه الصفحات.
  const isFullScreenChat = location.pathname === '/chat';
  const isPrivacyPage = location.pathname === '/privacy' || location.pathname.startsWith('/privacy/');
  const isVoiceRoom = location.pathname === '/live' || location.pathname.startsWith('/live/') || location.pathname === '/live-camera' || location.pathname.startsWith('/live-camera');
  const isFullBleed = isFullScreenChat || isPrivacyPage || isVoiceRoom;
  const isSettingsPage = location.pathname === '/settings' || location.pathname.startsWith('/settings');
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [textPostsOverlayOpen, setTextPostsOverlayOpen] = useState(() => {
    try {
      return typeof document !== 'undefined' && document.body.classList.contains('stooorna-text-posts-open');
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onTextPosts = (e: Event) => {
      const d = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setTextPostsOverlayOpen(!!d?.open);
    };
    window.addEventListener('stooorna:text-posts-state', onTextPosts);
    return () => window.removeEventListener('stooorna:text-posts-state', onTextPosts);
  }, []);

  const closeSettingsSheet = () => {
    if (settingsClosing) return;
    setSettingsClosing(true);
    window.setTimeout(() => {
      setSettingsClosing(false);
      // Public posts is the primary app page — always return there
      navigate('/add-friend?tab=friends&openTextPosts=1');
    }, 320);
  };

  useEffect(() => {
    if (!isSettingsPage) setSettingsClosing(false);
    const onClose = () => closeSettingsSheet();
    window.addEventListener('stooorna:close-settings-sheet', onClose);
    return () => window.removeEventListener('stooorna:close-settings-sheet', onClose);
  }, [isSettingsPage, settingsClosing, navigate]);

  return <Website>
      {showWelcome ? <WelcomeGuide onEnter={finishWelcome} /> : null}
      {!showWelcome && showSplash ? <SplashScreen onDone={finishSplash} /> : null}
      <Helmet>
        <title>Stooorna — Voice, Whisper &amp; Connect</title>
        <meta name="description" content="Stooorna is a real-time voice app for push-to-talk broadcasts, private whispers, group voice rooms, and instant messaging." />
        <meta property="og:site_name" content="Stooorna" />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
      </Helmet>
      <HomepageSameAsJsonLd />

      <ScrollRestoration />
      <div style={isFullBleed ? {
      height: (isFullScreenChat || isVoiceRoom) ? '100dvh' : undefined,
      maxHeight: (isFullScreenChat || isVoiceRoom) ? '100dvh' : undefined,
      minHeight: isPrivacyPage ? '100dvh' : undefined,
      overflow: (isFullScreenChat || isVoiceRoom) ? 'hidden' : undefined,
      boxSizing: 'border-box'
    } : {
      minHeight: '100dvh',
      paddingBottom: 'calc(52px + env(safe-area-inset-bottom))',
      boxSizing: 'border-box'
    }}>
        {isSettingsPage ? (
          <div
            role="presentation"
            onClick={closeSettingsSheet}
            style={{
              position: 'fixed',
              inset: 0,
              // Above public posts page (10300) when opened from its plus menu
              zIndex: textPostsOverlayOpen ? 10680 : 10150,
              background: settingsClosing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.32)',
              transition: 'background 0.32s ease',
            }}
          >
            <div
              role="dialog"
              aria-label="الإعدادات"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
                right: 0,
                left: 42,
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                boxShadow: '-16px 0 40px rgba(0,0,0,0.45)',
                overflow: 'auto',
                WebkitOverflowScrolling: 'touch',
                transform: settingsClosing ? 'translateX(100%)' : 'translateX(0)',
                transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
                animation: settingsClosing ? undefined : 'stooornaSettingsSheetIn 0.34s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              {children}
            </div>
          </div>
        ) : children}
      </div>
      <LiveJoinBanner />
      <GlobalBottomNavigation />
      <style>{`@keyframes stooornaFeedOrbit { 0% { transform: rotate(0deg) scale(1); } 45% { transform: rotate(180deg) scale(1.14); } 100% { transform: rotate(360deg) scale(1); } } @keyframes stooornaFeedWave { 0%,100% { transform: scaleX(0.55); opacity: 0.45; } 50% { transform: scaleX(1); opacity: 1; } } @keyframes stooornaNavBubble { 0% { transform: scale(0.25); opacity: 1; } 55% { transform: scale(1.55); opacity: 0.45; } 100% { transform: scale(2.1); opacity: 0; } } @keyframes stooornaYellowPulse { 0%,100% { box-shadow: 0 0 6px rgba(234,179,8,0.25); border-color: rgba(234,179,8,0.55); } 50% { box-shadow: 0 0 16px rgba(234,179,8,0.55); border-color: rgba(234,179,8,0.95); } } @keyframes stooornaSettingsSheetIn { from { transform: translateX(100%); } to { transform: translateX(0); } } @keyframes stooornaHomeCallIn { from { opacity: 0; transform: translateY(18%); } to { opacity: 1; transform: translateY(0); } } @keyframes stooornaHomeCallSheet { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes stooornaHomeIncomingSheetIn { from { transform: translateY(-100%); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } } @keyframes stooornaHomeRingShake { 0%,100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg); } } @keyframes stooornaHomeHintArrow { 0%,100% { transform: translateY(0); opacity: 0.7; } 50% { transform: translateY(7px); opacity: 1; } } @keyframes stooornaLivePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes stooornaLiveBannerIn { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } } @keyframes stooornaTextPostSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Website>;
}