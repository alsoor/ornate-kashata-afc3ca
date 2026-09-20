import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollRestoration, useLocation, useNavigate } from "react-router";
import { Home, Mic, MicOff, Settings, MessageCircle, X, Building2, Trash2, Menu, PhoneOff, Phone, Smile, Users, Volume2, VolumeX, Radio, Plus, Image as ImageIcon, Video } from 'lucide-react';
import HomepageSameAsJsonLd from '@/components/HomepageSameAsJsonLd';
import Website from '@/layouts/Website';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSession } from '@/lib/auth/auth-client';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { playNotificationSound } from '@/lib/notificationSound';

interface RootLayoutProps {
  children: ReactElement;
}

/** Â· «·Õ”«» «·Õ«·Ì ‘—ﬂ…ø (‰›” „‰ÿﬁ «· ÿ»Ìﬁ) */
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

// ?? »À ’Ê Ì ‰‘ÿ ·Õ”«» «·„” Œœ„ ó ‰›” „‰ÿﬁ ’›Õ… «·»—Ê›«Ì· ??????????????????
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

/** Â· ÌÊÃœ »À ’Ê Ì ‘€¯«· ·Â–« «·Õ”«» «·¬‰ø */
function useLiveBroadcastActive(hostId: string | null | undefined): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!hostId) {
      setActive(false);
      return;
    }
    let cancelled = false;
    const channel = liveChannelForHost(hostId);

    const apply = (v: boolean) => {
      if (!cancelled) setActive(v);
    };

    const checkLocal = () => apply(readLocalLiveActive(hostId));

    const checkRoom = async () => {
      if (readLocalLiveActive(hostId)) {
        apply(true);
      }
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!r.ok) {
          checkLocal();
          return;
        }
        const data = await r.json() as { members?: unknown[] };
        const n = Array.isArray(data.members) ? data.members.length : 0;
        if (n > 0) apply(true);
        else apply(readLocalLiveActive(hostId));
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

    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_live_active_${hostId}`) checkLocal();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('stooorna:live-active', onEvt);
      window.removeEventListener('storage', onStorage);
    };
  }, [hostId]);

  return active;
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

/** œ„Ã —”«·… Ê«—œ… ··«” ›”«— ⁄‰ „‰ Ã ›Ì ’‰œÊﬁ «·‘—ﬂ… */
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

/** ’‰œÊﬁ ‘«  «·„” Œœ„ „⁄ «·‘—ﬂ«  (Ì»œ√ „‰ «” ›”«— «·‘Ì—) */
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

/** ⁄‰œ ≈—”«· «” ›”«— „‰ «·‘Ì— ó Ìı”Ã¯Û· ⁄‰œ «·„” Œœ„ ›Ì √ÌﬁÊ‰… «·‘«  «·”›·Ì… */
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

/** —œ «·‘—ﬂ… ⁄·Ï «·„” Œœ„ ó Ì“Ìœ €Ì— «·„ﬁ—Ê¡ ÊÌ’›¯— «·√ÌﬁÊ‰… ··√’›— */
export function markUserProductChatReply(userId: string, companyId: string, text?: string) {
  if (!userId || !companyId) return;
  const list = loadUserProductChats(userId);
  const idx = list.findIndex(x => x.id === companyId);
  if (idx < 0) {
    pushUserProductChat(userId, { id: companyId, text: text || '—œ ÃœÌœ „‰ «·‘—ﬂ…', unread: 1 });
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

  // ?? ’‰œÊﬁ ‘«  «·‘—ﬂ«  («” ›”«—«  «·„‰ Ã« ) ó »œ· «·„«Ìﬂ «·√Õ„— ??
  const [companyChatOpen, setCompanyChatOpen] = useState(false);
  const [companyInbox, setCompanyInbox] = useState<CompanyInboxPeer[]>([]);
  const [companyUnreadTotal, setCompanyUnreadTotal] = useState(0);
  const [companyIconAlert, setCompanyIconAlert] = useState(false);
  const prevUnreadRef = useRef(0);

  // ?? ’‰œÊﬁ ‘«  «·„” Œœ„ „⁄ «·‘—ﬂ«  („‰ «·‘Ì— ? «” ›”«—) ??
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
  const [navBubble, setNavBubble] = useState<Record<string, number>>({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [friendsPanelOpen, setFriendsPanelOpen] = useState(false);
  const [storyMediaOpen, setStoryMediaOpen] = useState(false);
  const settingsSheetOpen = location.pathname === '/settings' || location.pathname.startsWith('/settings');

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
    return () => {
      window.removeEventListener('stooorna:friends-panel-opened', onOpen);
      window.removeEventListener('stooorna:friends-panel-closed', onClose);
      window.removeEventListener('stooorna:close-friends-panel', onClose);
      window.removeEventListener('stooorna:story-media-opened', onMediaOpen);
      window.removeEventListener('stooorna:story-media-closed', onMediaClose);
      window.removeEventListener('stooorna:close-story-media', onMediaClose);
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

  // »«ﬁÌ «·ﬂÊœ ﬂ«„· »œÊ‰ √Ì Õ–› (company chat + user chat + live + ≈‘⁄«—« )
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
    };
    refresh();
    const initial = loadCompanyInbox(uid);
    const initialTotal = initial.reduce((s, p) => s + (p.unread || 0), 0);
    if (initialTotal > 0) {
      prevUnreadRef.current = 0;
      setCompanyUnreadTotal(initialTotal);
    }

    let cancelled = false;
    const poll = () => {
      try {
        const endpoints = ['/api/messages?inbox=1', '/api/messages?role=company', '/api/company/messages', '/api/messages'];
        for (const url of endpoints) {
          try {
            const r = fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = r.json();
            const rows: any[] = Array.isArray(d) ? d : (d.messages || d.inbox || d.items || d.conversations || []);
            if (!rows.length) continue;
            let list = loadCompanyInbox(uid);
            let changed = false;
            for (const m of rows) {
              const fromId = String(m.fromUserId || m.senderId || m.userId || m.peerId || m.from || '');
              if (!fromId || fromId === uid) continue;
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
                lastMessage: text || existing?.lastMessage || '—”«·… ÃœÌœ…',
                at,
                unread: (existing?.unread || 0) + unreadAdd,
              };
              list = [next, ...list.filter(x => x.id !== fromId)];
              changed = true;
            }
            if (changed) saveCompanyInbox(uid, list);
            break;
          } catch { /* next */ }
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

  useEffect(() => {
    if (!user?.id) return;
    const onBlink = (e: Event) => {
      const d = (e as CustomEvent).detail as { target?: string; userId?: string; yellow?: boolean } | undefined;
      if (!d?.yellow) return;
      if (d.target === 'company' && isCompanyAccount) {
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
      if (total > prevUnreadRef.current) setCompanyIconAlert(true);
      setCompanyUnreadTotal(total);
    };
    const onUserProduct = (e: Event) => {
      if (isCompanyAccount) return;
      const d = (e as CustomEvent).detail as { userId?: string; list?: CompanyInboxPeer[]; yellowBlink?: boolean } | undefined;
      if (d?.userId && String(d.userId) !== String(user.id)) return;
      const list = Array.isArray(d?.list) ? d!.list! : loadUserProductChats(user.id);
      setUserProductChats(list);
      const total = list.reduce((s, p) => s + (p.unread || 0), 0);
      if (d?.yellowBlink || total > prevUserUnreadRef.current) setUserChatIconAlert(true);
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
      try { localStorage.setItem(COMPANY_INBOX_SEEN_KEY(user.id), String(Date.now())); } catch {}
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
    if (!window.confirm('Õ–› Â–Â «·„Õ«œÀ… „‰ ﬁ«∆„… ‘«  «·‘—ﬂ…ø')) return;
    const list = loadCompanyInbox(user.id).filter(p => p.id !== peerId);
    saveCompanyInbox(user.id, list);
    setCompanyInbox(list);
    setCompanyUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
  }

  // ??  Õ„Ì· ‘«  «·„” Œœ„ „⁄ «·√’œﬁ«¡ ??
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

  // ??  Õ„Ì· ‘«  «·„” Œœ„ „⁄ «·‘—ﬂ«  ??
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

    let cancelled = false;
    const pollCompanyReplies = () => {
      const list = loadUserProductChats(uid);
      if (!list.length) return;
      let changed = false;
      const nextList = [...list];
      for (let i = 0; i < Math.min(nextList.length, 12); i++) {
        const peer = nextList[i];
        try {
          const dm = fetch('/api/secret-chat/dm', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ peerId: peer.id }),
          });
          if (!dm.ok) continue;
          const dmData = dm.json();
          const chatId = dmData.chatId || dmData.id;
          if (!chatId) continue;
          const mr = fetch(`/api/secret-chat/messages?chatId=${chatId}`, { credentials: 'include' });
          if (!mr.ok) continue;
          const raw = mr.json();
          const msgs = Array.isArray(raw) ? raw : (raw.messages || []);
          if (!msgs.length) continue;
          const last = msgs[msgs.length - 1];
          const senderId = String(last.senderId ?? last.sender_id ?? '');
          if (!senderId || senderId === uid) continue;
          const at = last.createdAt || last.created_at
            ? new Date(last.createdAt || last.created_at).getTime()
            : Date.now();
          if (at > (peer.at || 0) + 500) {
            const body = String(last.body || last.text || last.content || '');
            const preview = body.startsWith('__PRODUCT_INQUIRY__')
              ? '?? «” ›”«— „‰ Ã'
              : (body.slice(0, 80) || '—œ „‰ «·‘—ﬂ…');
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
    if (!window.confirm('Õ–› Â–Â «·„Õ«œÀ… „‰ Chat Friendsø')) return;
    const list = loadUserFriendChats(user.id).filter(p => p.id !== peerId);
    saveUserFriendChats(user.id, list);
    setUserFriendChats(list);
    setUserChatUnreadTotal(list.reduce((s, p) => s + (p.unread || 0), 0));
  }

  // ?? Live Active ??
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const channel = liveChannelForHost(user.id);
    const checkRoom = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json() as { members?: unknown[] };
        const n = Array.isArray(data.members) ? data.members.length : 0;
        if (n > 0) {
          try { localStorage.setItem(`stooorna_live_active_${user.id}`, JSON.stringify({ active: true, at: Date.now() })); } catch {}
          try { window.dispatchEvent(new CustomEvent('stooorna:live-active', { detail: { hostId: user.id, active: true } })); } catch {}
        }
      } catch {}
    };
    checkRoom();
    const interval = window.setInterval(checkRoom, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  // ?? ≈⁄œ«œ«  «·’›Õ… ??
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/add-friend?tab=friends&openTextPosts=1', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!session?.user) return;
    const enablePush = () => { void subscribe(); };
    window.addEventListener('pointerdown', enablePush, { once: true, passive: true });
    window.addEventListener('keydown', enablePush, { once: true });
    return () => {
      window.removeEventListener('pointerdown', enablePush);
      window.removeEventListener('keydown', enablePush);
    };
  }, [session?.user?.id, subscribe]);

  const isFullScreenChat = location.pathname === '/chat';
  const isPrivacyPage = location.pathname === '/privacy' || location.pathname.startsWith('/privacy/');
  const isVoiceRoom = location.pathname === '/live' || location.pathname.startsWith('/live/');
  const isFullBleed = isFullScreenChat || isPrivacyPage || isVoiceRoom;
  const isSettingsPage = location.pathname === '/settings' || location.pathname.startsWith('/settings');
  const [settingsClosing, setSettingsClosing] = useState(false);

  const closeSettingsSheet = () => {
    if (settingsClosing) return;
    setSettingsClosing(true);
    window.setTimeout(() => {
      setSettingsClosing(false);
      navigate('/add-friend?tab=friends');
    }, 320);
  };

  useEffect(() => {
    if (!isSettingsPage) setSettingsClosing(false);
    const onClose = () => closeSettingsSheet();
    window.addEventListener('stooorna:close-settings-sheet', onClose);
    return () => window.removeEventListener('stooorna:close-settings-sheet', onClose);
  }, [isSettingsPage, settingsClosing, navigate]);

  return <Website>
      <Helmet>
        <title>Stooorna ó Voice, Whisper &amp; Connect</title>
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
              zIndex: 10150,
              background: settingsClosing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.32)',
              transition: 'background 0.32s ease',
            }}
          >
            <div
              role="dialog"
              aria-label="«·≈⁄œ«œ« "
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
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

      <nav aria-label="Main navigation" style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10200,
        height: 'calc(52px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'linear-gradient(180deg, rgba(6,14,14,0.92) 0%, rgba(6,14,14,0.99) 100%)',
        boxSizing: 'border-box',
        borderTop: '1px solid rgba(0,188,212,0.12)',
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

          {/* New Post Button ó «·“— «·ÃœÌœ ›Ì «·„‰ ’› */}
          <button
            type="button"
            onClick={() => {
              popNavBubble('storyMedia');
              const open = () => {
                try { window.dispatchEvent(new CustomEvent('stooorna:open-text-posts')); } catch {}
              };
              if (location.pathname === '/add-friend' || location.pathname.startsWith('/add-friend')) {
                open();
                return;
              }
              navigate('/add-friend?tab=friends&openTextPosts=1');
              window.setTimeout(open, 100);
            }}
            aria-label="New Post"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 48,
              height: 36,
              border: 'none',
              background: 'transparent',
              borderRadius: 12,
              color: 'rgba(0,188,212,0.9)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              WebkitTapHighlightColor: 'transparent',
              gap: 3,
            }}
          >
            <NavBubble id="storyMedia" color="rgba(0,188,212,0.65)" />
            <ImageIcon size={17} strokeWidth={2.2} />
            <Video size={15} strokeWidth={2.2} />
          </button>

          {/* Plus Menu (ﬂ«„· »œÊ‰  €ÌÌ—) */}
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
                    {homeIncoming && homeCallPhase === 'idle' && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          right: 52,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 'max-content',
                          maxWidth: 168,
                          background: 'rgba(6,14,14,0.96)',
                          color: '#fff',
                          border: '1px solid rgba(34,197,94,0.55)',
                          borderRadius: 12,
                          padding: '8px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'left',
                          lineHeight: 1.4,
                          boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                          pointerEvents: 'none',
                          zIndex: 10230,
                        }}
                      >
                        <div style={{ color: '#86efac' }}>Tap to answer</div>
                        <div style={{ color: 'rgba(200,230,210,0.95)', fontWeight: 600, marginTop: 3 }}>
                          Long-press to decline
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        const target = e.currentTarget as any;
                        if (target._homeLongPress) {
                          target._homeLongPress = false;
                          return;
                        }
                        if (homeIncoming && homeCallPhase === 'idle') {
                          setPlusMenuOpen(false);
                          void answerHomeIncoming();
                          return;
                        }
                        setPlusMenuOpen(false);
                        setHomeCallPickerOpen(true);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (homeIncoming && homeCallPhase === 'idle') {
                          ignoreHomeIncoming();
                          setPlusMenuOpen(false);
                        }
                      }}
                      onPointerDown={(e) => {
                        if (!(homeIncoming && homeCallPhase === 'idle')) return;
                        const target = e.currentTarget;
                        const timer = window.setTimeout(() => {
                          (target as any)._homeLongPress = true;
                          ignoreHomeIncoming();
                          setPlusMenuOpen(false);
                        }, 550);
                        (target as any)._homeLongPressTimer = timer;
                        (target as any)._homeLongPress = false;
                      }}
                      onPointerUp={(e) => {
                        const target = e.currentTarget as any;
                        if (target._homeLongPressTimer) {
                          window.clearTimeout(target._homeLongPressTimer);
                          target._homeLongPressTimer = null;
                        }
                      }}
                      onPointerLeave={(e) => {
                        const target = e.currentTarget as any;
                        if (target._homeLongPressTimer) {
                          window.clearTimeout(target._homeLongPressTimer);
                          target._homeLongPressTimer = null;
                        }
                      }}
                      onPointerCancel={(e) => {
                        const target = e.currentTarget as any;
                        if (target._homeLongPressTimer) {
                          window.clearTimeout(target._homeLongPressTimer);
                          target._homeLongPressTimer = null;
                        }
                      }}
                      aria-label={homeIncoming ? 'Answer call ó long press to decline' : 'Call'}
                      style={{
                        width: 44, height: 44, borderRadius: '50%',
                        border: '1px solid ' + (homeIncoming ? 'rgba(34,197,94,0.55)' : 'rgba(0,188,212,0.4)'),
                        background: 'rgba(6,20,22,0.96)',
                        color: homeIncoming ? '#22c55e' : '#00BCD4',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: homeIncoming
                          ? '0 0 14px rgba(34,197,94,0.5)'
                          : '0 4px 16px rgba(0,0,0,0.45)',
                        animation: homeIncoming ? 'stooornaHomeRingShake 0.45s ease-in-out infinite' : 'none',
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
                      popNavBubble('friends');
                      setFriendsPanelOpen(true);
                      const open = () => {
                        try {
                          window.dispatchEvent(new CustomEvent('stooorna:open-friends-panel', {
                            detail: { tab: 'friends' },
                          }));
                        } catch {}
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
                      const qs = new URLSearchParams({
                        hostId: String(user.id),
                        hostName: String((user as any).name || (user as any).username || 'Host'),
                      });
                      if ((user as any).username) qs.set('hostUsername', String((user as any).username));
                      const av = (user as any).avatarUrl || (user as any).image;
                      if (av) qs.set('hostAvatar', String(av));
                      navigate('/live?' + qs.toString());
                    }}
                    aria-label="Account live broadcast"
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      border: '1px solid rgba(0,188,212,0.4)',
                      background: 'rgba(6,20,22,0.96)',
                      color: myLiveActive ? '#ef4444' : '#00BCD4',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: myLiveActive
                        ? '0 0 14px rgba(239,68,68,0.45)'
                        : '0 4px 16px rgba(0,0,0,0.45)',
                    }}
                  >
                    <Radio size={20} strokeWidth={2.2} />
                  </button>
                  )}
                  {user && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      popNavBubble('radar');
                      if (!(location.pathname === '/add-friend' && !isChatsPanel)) {
                        navigate('/add-friend?tab=friends&openTextPosts=1');
                        return;
                      }
                      window.dispatchEvent(new CustomEvent(textPostsOpen ? 'stooorna:close-text-posts' : 'stooorna:open-text-posts'));
                    }}
                    aria-label={textPostsOpen ? 'Close text posts' : textPostsAlert.newPosts ? 'New text posts available' : 'Text posts'}
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      border: '1px solid rgba(234,179,8,0.55)',
                      background: 'rgba(6,20,22,0.96)',
                      color: '#eab308',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: textPostsAlert.alert
                        ? '0 0 14px rgba(234,179,8,0.55)'
                        : '0 4px 16px rgba(0,0,0,0.45)',
                      animation: textPostsAlert.alert ? 'stooornaYellowPulse 1.6s ease-in-out infinite' : 'none',
                    }}
                  >
                    <span aria-hidden style={{ display: 'flex', width: 20, height: 20 }}>
                      <span
                        aria-hidden
                        style={{
                          position: 'relative',
                          width: 20,
                          height: 20,
                          display: 'block',
                          animation: 'stooornaTextPostSpin 7s linear infinite',
                        }}
                      >
                        <span style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          border: '1.5px solid rgba(234,179,8,0.7)',
                          boxSizing: 'border-box',
                        }} />
                        <span style={{
                          position: 'absolute',
                          inset: 3.5,
                          borderRadius: '50%',
                          background: textPostsAlert.newPosts ? '#ef4444' : 'rgba(234,179,8,0.35)',
                          boxShadow: textPostsAlert.newPosts
                            ? '0 0 8px rgba(239,68,68,0.55)'
                            : '0 0 6px rgba(234,179,8,0.4)',
                        }} />
                        <span style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: 12,
                          height: 2,
                          marginLeft: -1.5,
                          marginTop: -1,
                          borderRadius: 2,
                          background: textPostsAlert.newPosts ? '#ffffff' : '#eab308',
                          transformOrigin: '1.5px 50%',
                          boxShadow: '0 0 4px rgba(234,179,8,0.7)',
                        }} />
                        <span style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: 4,
                          height: 4,
                          marginLeft: 8,
                          marginTop: -2,
                          borderRadius: 50,
                          background: textPostsAlert.newPosts ? '#ffffff' : '#eab308',
                          boxShadow: '0 0 5px rgba(234,179,8,0.85)',
                        }} />
                      </span>
                    </span>
                  </button>
                  )}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                popNavBubble('plus');
                if (plusMenuOpen) {
                  setPlusMenuOpen(false);
                  return;
                }
                if (settingsSheetOpen) {
                  window.dispatchEvent(new CustomEvent('stooorna:close-settings-sheet'));
                  return;
                }
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
                background: (homeIncoming && homeCallPhase === 'idle')
                  ? 'rgba(34,197,94,0.18)'
                  : (plusMenuOpen || settingsSheetOpen || friendsPanelOpen) ? 'rgba(0,188,212,0.14)' : 'transparent',
                borderRadius: 12,
                color: (homeIncoming && homeCallPhase === 'idle')
                  ? '#22c55e'
                  : (plusMenuOpen || settingsSheetOpen || friendsPanelOpen) ? '#00BCD4' : 'rgba(0,188,212,0.85)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                WebkitTapHighlightColor: 'transparent',
                boxShadow: (homeIncoming && homeCallPhase === 'idle') ? '0 0 12px rgba(34,197,94,0.45)' : 'none',
              }}
            >
              <NavBubble id="plus" color={(homeIncoming && homeCallPhase === 'idle') ? 'rgba(34,197,94,0.65)' : 'rgba(0,188,212,0.65)' } />
              <span style={{
                display: 'flex',
                transition: (homeIncoming && homeCallPhase === 'idle') ? 'none' : 'transform 0.25s ease',
                transform: (plusMenuOpen || settingsSheetOpen || friendsPanelOpen) ? 'rotate(45deg)' : 'rotate(0deg)',
                animation: (homeIncoming && homeCallPhase === 'idle' && !(plusMenuOpen || settingsSheetOpen || friendsPanelOpen))
                  ? 'stooornaHomeRingShake 0.45s ease-in-out infinite'
                  : 'none',
                transformOrigin: 'center center',
              }}>
                <Plus size={26} strokeWidth={2.4} />
              </span>
            </button>
          </div>

        </div>
      </nav>
    </Website>;
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

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/add-friend?tab=friends&openTextPosts=1', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!session?.user) return;
    const enablePush = () => { void subscribe(); };
    window.addEventListener('pointerdown', enablePush, { once: true, passive: true });
    window.addEventListener('keydown', enablePush, { once: true });
    return () => {
      window.removeEventListener('pointerdown', enablePush);
      window.removeEventListener('keydown', enablePush);
    };
  }, [session?.user?.id, subscribe]);

  const isFullScreenChat = location.pathname === '/chat';
  const isPrivacyPage = location.pathname === '/privacy' || location.pathname.startsWith('/privacy/');
  const isVoiceRoom = location.pathname === '/live' || location.pathname.startsWith('/live/');
  const isFullBleed = isFullScreenChat || isPrivacyPage || isVoiceRoom;
  const isSettingsPage = location.pathname === '/settings' || location.pathname.startsWith('/settings');
  const [settingsClosing, setSettingsClosing] = useState(false);

  const closeSettingsSheet = () => {
    if (settingsClosing) return;
    setSettingsClosing(true);
    window.setTimeout(() => {
      setSettingsClosing(false);
      navigate('/add-friend?tab=friends');
    }, 320);
  };

  useEffect(() => {
    if (!isSettingsPage) setSettingsClosing(false);
    const onClose = () => closeSettingsSheet();
    window.addEventListener('stooorna:close-settings-sheet', onClose);
    return () => window.removeEventListener('stooorna:close-settings-sheet', onClose);
  }, [isSettingsPage, settingsClosing, navigate]);

  return <Website>
      <Helmet>
        <title>Stooorna ó Voice, Whisper &amp; Connect</title>
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
              zIndex: 10150,
              background: settingsClosing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.32)',
              transition: 'background 0.32s ease',
            }}
          >
            <div
              role="dialog"
              aria-label="«·≈⁄œ«œ« "
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
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
      <GlobalBottomNavigation />
      <style>{`@keyframes stooornaFeedOrbit { 0% { transform: rotate(0deg) scale(1); } 45% { transform: rotate(180deg) scale(1.14); } 100% { transform: rotate(360deg) scale(1); } } @keyframes stooornaFeedWave { 0%,100% { transform: scaleX(0.55); opacity: 0.45; } 50% { transform: scaleX(1); opacity: 1; } } @keyframes stooornaNavBubble { 0% { transform: scale(0.25); opacity: 1; } 55% { transform: scale(1.55); opacity: 0.45; } 100% { transform: scale(2.1); opacity: 0; } } @keyframes stooornaYellowPulse { 0%,100% { box-shadow: 0 0 6px rgba(234,179,8,0.25); border-color: rgba(234,179,8,0.55); } 50% { box-shadow: 0 0 16px rgba(234,179,8,0.55); border-color: rgba(234,179,8,0.95); } } @keyframes stooornaSettingsSheetIn { from { transform: translateX(100%); } to { transform: translateX(0); } } @keyframes stooornaHomeCallIn { from { opacity: 0; transform: translateY(18%); } to { opacity: 1; transform: translateY(0); } } @keyframes stooornaHomeCallSheet { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes stooornaHomeRingShake { 0%,100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg); } } @keyframes stooornaHomeHintArrow { 0%,100% { transform: translateY(0); opacity: 0.7; } 50% { transform: translateY(7px); opacity: 1; } } @keyframes stooornaLivePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes stooornaTextPostSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Website>;
}