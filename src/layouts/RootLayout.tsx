import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollRestoration, useLocation, useNavigate } from "react-router";
import { Home, Mic, MicOff, Settings, MessageCircle, X, Building2, Trash2, Menu, PhoneOff, Phone, Smile, Users, Volume2, VolumeX, Radio, Plus, Image as ImageIcon, Video, PenLine } from 'lucide-react';
import HomepageSameAsJsonLd from '@/components/HomepageSameAsJsonLd';
import Website from '@/layouts/Website';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSession } from '@/lib/auth/auth-client';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { playNotificationSound } from '@/lib/notificationSound';
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

/** هل يوجد بث صوتي شغّال لهذا الحساب الآن؟ */
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

  // يتبع حالة الدردشة السرية (مفتوحة/مغلقة) عبر الحدث المُطلق من صفحة الشات
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
  const [homeCallFriends, setHomeCallFriends] = useState<HomeCallFriend[]>([]);
  const [homeCallSelected, setHomeCallSelected] = useState<Record<string, boolean>>({});
  const [homeCallPhase, setHomeCallPhase] = useState<'idle' | 'animating' | 'connecting' | 'live'>('idle');
  const [homeCallMembers, setHomeCallMembers] = useState<HomeCallMember[]>([]);
  const [homeCallMuted, setHomeCallMuted] = useState(false);
  const [homeCallSpeakerOn, setHomeCallSpeakerOn] = useState(true);
  const [homeCallEmojiOpen, setHomeCallEmojiOpen] = useState(false);
  const [homeCallEmojiBurst, setHomeCallEmojiBurst] = useState<string | null>(null);
  const [homeCallEmojiFrom, setHomeCallEmojiFrom] = useState<string | null>(null);
  const [homeCallMembersOpen, setHomeCallMembersOpen] = useState(false);
  const [homeCallChannel, setHomeCallChannel] = useState<string | null>(null);
  const [homeIncoming, setHomeIncoming] = useState<{
    channel: string;
    hostId: string;
    hostName: string | null;
    hostAvatar: string | null;
    members: HomeCallMember[];
  } | null>(null);
  const homeRingTimer = useRef<number | null>(null);
  const homeSwipeY = useRef<number | null>(null);
  const homeLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeLongPressFired = useRef(false);
  const homeCallPollRef = useRef<number | null>(null);
  const homeRingLockRef = useRef<{ mode: 'none' | 'answered' | 'ignored'; channel: string; at: number }>({ mode: 'none', channel: '', at: 0 });
  const homeCallAgoraRef = useRef<any>(null);
  const homeCallMicRef = useRef<any>(null);

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
    const applyInvite = (raw: any) => {
      if (!raw?.channel || raw.hostId === user.id) return;
      const ch = String(raw.channel);
      const lock = homeRingLockRef.current;
      if (lock.mode === 'answered' && (lock.channel === ch || Date.now() - lock.at < 120000)) return;
      if (lock.mode === 'ignored' && lock.channel === ch && Date.now() - lock.at < 10000) return;
      beginHomeIncoming({
        channel: String(raw.channel),
        hostId: String(raw.hostId || ''),
        hostName: raw.hostName ?? null,
        hostAvatar: raw.hostAvatar ?? null,
        members: Array.isArray(raw.members) ? raw.members : [],
      });
    };
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
    const poll = async () => {
      if (homeCallPhase !== 'idle') return;
      try {
        const raw = localStorage.getItem(`stooorna_home_call_invite_${user.id}`);
        if (raw) applyInvite(JSON.parse(raw));
        const active = localStorage.getItem('stooorna_home_call_active_invite');
        if (active) {
          const parsed = JSON.parse(active);
          const ids: string[] = parsed.inviteeIds || [];
          if (ids.includes(user.id)) applyInvite(parsed);
        }
      } catch { /* */ }
      try {
        const ringId = `home_ring_${homeCallShortHash(user.id)}`;
        const r = await fetch(`/api/room?id=${encodeURIComponent(ringId)}`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json() as { members?: { name?: string; userId?: string; avatarUrl?: string }[] };
          const other = (d.members || []).find(m => String(m.userId || '') !== user.id);
          if (other) {
            let parsed: any = null;
            try { parsed = other.name ? JSON.parse(other.name) : null; } catch { parsed = null; }
            applyInvite({
              channel: (parsed?.channel
                || (other.name && (other.name.startsWith('private_') || other.name.startsWith('home_group_')) ? other.name : null)
                || `private_${homeCallShortHash([user.id, String(other.userId || '')].sort().join('_'))}`),
              hostId: parsed?.hostId || other.userId,
              hostName: parsed?.hostName || other.name || null,
              hostAvatar: parsed?.hostAvatar || other.avatarUrl || null,
              members: parsed?.members || [],
            });
          }
        }
      } catch { /* */ }
      try {
        const vis = await fetch(`/api/profile-visit/visitors?ownerId=${encodeURIComponent(user.id)}`, { credentials: 'include' });
        if (!vis.ok) return;
        const vd = await vis.json() as { visitors?: { userId?: string; name?: string | null; username?: string | null; avatarUrl?: string | null }[] };
        const visitor = (vd.visitors || [])[0];
        if (!visitor?.userId) return;
        const pairChannel = `private_${homeCallShortHash([user.id, String(visitor.userId)].sort().join('_'))}`;
        const roomRes = await fetch(`/api/room?id=${encodeURIComponent(pairChannel)}`, { credentials: 'include' });
        let callerActive = true;
        if (roomRes.ok) {
          const roomData = await roomRes.json() as { members?: { userId?: string }[] };
          callerActive = (roomData.members || []).some(m => String(m.userId || '') !== user.id);
        }
        if (!callerActive) return;
        applyInvite({
          channel: pairChannel,
          hostId: String(visitor.userId),
          hostName: visitor.name || visitor.username || null,
          hostAvatar: visitor.avatarUrl || null,
          members: [{
            id: String(visitor.userId),
            name: visitor.name ?? null,
            username: visitor.username ?? null,
            avatarUrl: visitor.avatarUrl ?? null,
            joined: true,
          }],
        });
      } catch { /* */ }
    };
    void poll();
    const interval = window.setInterval(poll, 2500);
    return () => {
      window.removeEventListener('stooorna:home-group-call', onLocal as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [user?.id, homeCallPhase, homeIncoming]);

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

  async function leaveHomeGroupCall() {
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
    if (homeCallChannel && user?.id) {
      void fetch('/api/room/leave', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: homeCallChannel, userId: user.id }),
      });
    }
    setHomeCallPhase('idle');
    setHomeCallMembers([]);
    setHomeCallChannel(null);
    setHomeCallMuted(false);
    setHomeCallSpeakerOn(true);
    setHomeCallEmojiOpen(false);
    setHomeCallMembersOpen(false);
    setHomeCallSelected({});
    homeRingLockRef.current = { mode: 'ignored', channel: homeCallChannel || homeIncoming?.channel || '', at: Date.now() };
    stopHomeIncomingRing();
    setHomeIncoming(null);
    try {
      window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
      if (user?.id) {
        localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
        localStorage.removeItem('stooorna_home_call_active_invite');
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

  async function startHomeGroupCall() {
    if (!user?.id) return;
    const picked = homeCallFriends.filter(f => homeCallSelected[f.id]);
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
    setHomeCallChannel(channel);
    setHomeCallMembers([me, ...others]);
    setHomeCallPickerOpen(false);
    setHomeCallPhase('animating');
    const invitePayload = { channel, hostId: user.id, hostName: me.name, hostAvatar: me.avatarUrl, members: [me, ...others], at: Date.now() };
    window.dispatchEvent(new CustomEvent('stooorna:home-group-call', {
      detail: { ...invitePayload, inviteeIds: picked.map(p => p.id) },
    }));
    try {
      localStorage.setItem('stooorna_home_call_active_invite', JSON.stringify({
        ...invitePayload,
        inviteeIds: picked.map(p => p.id),
      }));
    } catch { /* */ }
    for (const peer of picked) {
      try { localStorage.setItem(`stooorna_home_call_invite_${peer.id}`, JSON.stringify(invitePayload)); } catch { /* */ }
    }
    window.setTimeout(() => setHomeCallPhase('connecting'), 900);
    try {
      await fetch('/api/room/join', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: channel, userId: user.id, name: me.name }),
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
          await fetch('/api/room/join', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: `home_ring_${homeCallShortHash(peer.id)}`,
              userId: user.id,
              name: channel,
            }),
          });
        } catch { /* */ }
        try {
          const pairChannel = `private_${homeCallShortHash([user.id, peer.id].sort().join('_'))}`;
          await fetch('/api/room/join', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: pairChannel, userId: user.id, name: me.name }),
          });
        } catch { /* */ }
      }
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      homeCallAgoraRef.current = client;
      client.on('user-published', async (remoteUser: any, mediaType: string) => {
        if (mediaType !== 'audio') return;
        try {
          await client.subscribe(remoteUser, 'audio');
          remoteUser.audioTrack?.play();
        } catch { /* */ }
      });
      const tokenResponse = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(user.id)}`, { credentials: 'include' });
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json() as { token: string; uid: number };
        await client.join('149ef04e839c4132a08efb49d717c436', channel, tokenData.token, tokenData.uid);
        const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' });
        homeCallMicRef.current = micTrack;
        await client.publish([micTrack]);
        await Promise.all((client.remoteUsers || []).map(async (remoteUser: any) => {
          if (!remoteUser.hasAudio) return;
          try {
            await client.subscribe(remoteUser, 'audio');
            remoteUser.audioTrack?.play();
          } catch { /* */ }
        }));
      }
    } catch { /* اتصال جزئي عبر الغرفة حتى لو فشل أغورا */ }
    setHomeCallPhase('live');
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
      } catch { /* */ }
    };
    void poll();
    homeCallPollRef.current = window.setInterval(poll, 3000);
  }

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

  async function notifyHomeCallAgain() {
    if (!user?.id || !homeCallChannel) return;
    const meName = (user as any).name ?? null;
    const meAvatar = (user as any).avatarUrl ?? (user as any).image ?? null;
    const targets = homeCallMembers.filter(m => m.id !== user.id);
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
            name: homeCallChannel,
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
      const Ctx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
      });
    } catch { /* */ }
    try { navigator.vibrate?.([280, 160, 280, 160]); } catch { /* */ }
  }

  function stopHomeIncomingRing() {
    if (homeRingTimer.current) {
      window.clearInterval(homeRingTimer.current);
      homeRingTimer.current = null;
    }
  }

  function beginHomeIncoming(invite: { channel: string; hostId: string; hostName: string | null; hostAvatar: string | null; members: HomeCallMember[] }) {
    if (homeCallPhase !== 'idle') return;
    const lock = homeRingLockRef.current;
    if (lock.mode === 'answered') return;
    if (lock.mode === 'ignored' && lock.channel === invite.channel && Date.now() - lock.at < 10000) return;
    setHomeIncoming(invite);
    stopHomeIncomingRing();
    playHomeIncomingRing();
    homeRingTimer.current = window.setInterval(() => playHomeIncomingRing(), 2600);
  }

  function ignoreHomeIncoming() {
    stopHomeIncomingRing();
    homeRingLockRef.current = { mode: 'ignored', channel: homeIncoming?.channel || '', at: Date.now() };
    setHomeIncoming(null);
    try {
      window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
      if (user?.id) {
        localStorage.removeItem(`stooorna_home_call_invite_${user.id}`);
        localStorage.removeItem('stooorna_home_call_active_invite');
        void fetch('/api/room/leave', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: `home_ring_${homeCallShortHash(user.id)}`, userId: user.id }),
        });
      }
    } catch { /* */ }
  }

  async function answerHomeIncoming() {
    if (!user?.id || !homeIncoming) return;
    const invite = homeIncoming;
    let channel = invite.channel;
    try {
      const ringId = `home_ring_${homeCallShortHash(user.id)}`;
      const rr = await fetch(`/api/room?id=${encodeURIComponent(ringId)}`, { credentials: 'include' });
      if (rr.ok) {
        const rd = await rr.json() as { members?: { name?: string; userId?: string }[] };
        const other = (rd.members || []).find(m => String(m.userId || '') !== user.id);
        if (other?.name) {
          if (other.name.startsWith('private_') || other.name.startsWith('home_group_')) channel = other.name;
          else {
            try {
              const parsed = JSON.parse(other.name);
              if (parsed?.channel) channel = String(parsed.channel);
            } catch { /* */ }
          }
        }
      }
    } catch { /* */ }
    if (invite.hostId) {
      const pair = `private_${homeCallShortHash([user.id, invite.hostId].sort().join('_'))}`;
      if (!channel || channel === invite.channel) channel = pair;
    }
    homeRingLockRef.current = { mode: 'answered', channel, at: Date.now() };
    stopHomeIncomingRing();
    setHomeIncoming(null);
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
      username: null,
      avatarUrl: invite.hostAvatar,
      joined: true,
    };
    const members = (invite.members || []).map(m => m.id === user.id ? { ...m, ...me, joined: true } : { ...m, joined: true });
    if (!members.some(m => m.id === user.id)) members.unshift(me);
    if (invite.hostId && !members.some(m => m.id === invite.hostId)) members.push(host);
    setHomeCallChannel(channel);
    setHomeCallMembers(members);
    setHomeCallPhase('animating');
    window.setTimeout(() => setHomeCallPhase('connecting'), 400);
    try {
      await fetch('/api/room/join', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: channel, userId: user.id, name: me.name }),
      });
      if (invite.hostId) {
        const pair = `private_${homeCallShortHash([user.id, invite.hostId].sort().join('_'))}`;
        if (pair !== channel) {
          await fetch('/api/room/join', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: pair, userId: user.id, name: me.name }),
          });
        }
      }
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      if (homeCallAgoraRef.current) {
        try { await homeCallAgoraRef.current.leave?.(); } catch { /* */ }
      }
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      homeCallAgoraRef.current = client;
      client.on('user-published', async (remoteUser: any, mediaType: string) => {
        if (mediaType !== 'audio') return;
        try {
          await client.subscribe(remoteUser, 'audio');
          remoteUser.audioTrack?.play();
        } catch { /* */ }
      });
      client.on('user-unpublished', (remoteUser: any) => remoteUser.audioTrack?.stop?.());
      const tokenResponse = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(user.id)}`, { credentials: 'include' });
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json() as { token: string; uid: number };
        await client.join('149ef04e839c4132a08efb49d717c436', channel, tokenData.token, tokenData.uid);
        const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' });
        homeCallMicRef.current = micTrack;
        await client.publish([micTrack]);
        await Promise.all((client.remoteUsers || []).map(async (remoteUser: any) => {
          if (!remoteUser.hasAudio) return;
          try {
            await client.subscribe(remoteUser, 'audio');
            remoteUser.audioTrack?.play();
          } catch { /* */ }
        }));
      }
    } catch { /* */ }
    setHomeCallPhase('live');
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
    homeCallPollRef.current = window.setInterval(poll, 3000);
    try { localStorage.removeItem(`stooorna_home_call_invite_${user.id}`); } catch { /* */ }
  }

  function toggleHomeCallMute() {
    const next = !homeCallMuted;
    try { void homeCallMicRef.current?.setMuted?.(next); } catch { /* */ }
    setHomeCallMuted(next);
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
  const isVoiceRoom = location.pathname === '/live' || location.pathname.startsWith('/live/');
  const isPrivacyPage = location.pathname === '/privacy' || location.pathname.startsWith('/privacy/');
  const miniChatOverlay = miniChat && user ? (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      bottom: 'calc(52px + env(safe-area-inset-bottom))',
      zIndex: 10380,
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




  const homeCallOverlay = (homeCallPickerOpen || homeCallPhase !== 'idle') ? (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10950,
      background: homeCallPhase === 'animating'
        ? 'radial-gradient(ellipse 60% 50% at 50% 80%, rgba(0,188,212,0.35), rgba(6,14,14,0.92) 70%)'
        : 'rgba(6,10,12,0.55)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end',
      animation: homeCallPhase === 'animating' ? 'stooornaHomeCallIn 0.9s ease-out' : undefined,
    }}>
      {homeCallPhase === 'animating' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            border: '3px solid #00BCD4',
            boxShadow: '0 0 28px rgba(0,188,212,0.55)',
            animation: 'stooornaFeedOrbit 1.1s linear infinite',
          }} />
          <p style={{ color: '#00BCD4', fontWeight: 800, margin: 0 }}>جاري الدخول للمكالمة…</p>
        </div>
      )}

      {homeCallPickerOpen && homeCallPhase === 'idle' && (
        <div
          onClick={() => setHomeCallPickerOpen(false)}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '12px 16px calc(64px + env(safe-area-inset-bottom))',
            boxSizing: 'border-box',
          }}
        >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(92vw, 360px)',
            height: 'min(56vh, 420px)',
            maxHeight: 'min(56vh, 420px)',
            background: 'linear-gradient(180deg,#0a1f22 0%,#061014 100%)',
            border: '1px solid rgba(0,188,212,0.25)',
            borderRadius: 18,
            padding: '12px 12px 14px',
            direction: 'rtl',
            boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
            animation: 'stooornaPlusFanIn 0.28s ease-out',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10, flexShrink: 0, gap: 8,
          }}>
            <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.88rem' }}>Call</p>
            <button type="button" onClick={() => setHomeCallPickerOpen(false)} style={{
              width: 28, height: 28, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.08)', color: '#00BCD4', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {homeCallFriends.length === 0 && (
              <p style={{ color: 'rgba(180,210,210,0.7)', textAlign: 'center' }}>لا أصدقاء بعد</p>
            )}
            {homeCallFriends.map(f => {
              const on = !!homeCallSelected[f.id];
              return (
                <button key={f.id} type="button" onClick={() => setHomeCallSelected(s => ({ ...s, [f.id]: !s[f.id] }))} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 14, border: `1px solid ${on ? '#00BCD4' : 'rgba(0,188,212,0.2)'}`,
                  background: on ? 'rgba(0,188,212,0.14)' : 'rgba(0,188,212,0.05)',
                  color: '#d7eeee', cursor: 'pointer', textAlign: 'right',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', background: 'rgba(0,188,212,0.2)', flexShrink: 0 }}>
                    {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (f.name || f.username || '?')[0]}
                  </div>
                  <span style={{ flex: 1, fontWeight: 700 }}>{f.name || f.username || 'صديق'}</span>
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, border: '2px solid #00BCD4',
                    background: on ? '#00BCD4' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, boxSizing: 'border-box',
                    color: on ? '#041018' : 'transparent',
                    fontSize: 13, fontWeight: 900, lineHeight: 1,
                  }}>{on ? '?' : ''}</span>
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
        </div>
      )}

      {(homeCallPhase === 'connecting' || homeCallPhase === 'live') && (
        <div style={{
          background: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
          animation: 'stooornaHomeCallSheet 0.38s cubic-bezier(0.32,0.72,0,1)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, direction: 'ltr' }}>
            <button type="button" onClick={() => setHomeCallMembersOpen(o => !o)} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111' }} aria-label="الموجودون">
              <Users size={18} />
            </button>
            <div style={{ textAlign: 'center', flex: 1, padding: '0 8px' }}>
              <p style={{ margin: 0, fontWeight: 800, color: '#111', fontSize: 16 }}>
                {(() => {
                  const me = homeCallMembers.find(m => m.id === user?.id);
                  const joinedOthers = homeCallMembers.filter(m => m.id !== user?.id && m.joined);
                  const hostName = me?.name || me?.username || 'أنت';
                  if (!joinedOthers.length) return hostName;
                  return [hostName, ...joinedOthers.map(m => m.name || m.username || 'مستخدم')].join(' · ');
                })()}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{homeCallPhase === 'live' ? 'مكالمة صوتية' : 'جاري الاتصال…'}</p>
            </div>
            <span style={{ width: 40 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, padding: '10px 0 18px', flexWrap: 'wrap', direction: 'ltr' }}>
            {homeCallMembers.filter(m => m.joined || m.id === user?.id).map(m => (
              <div key={m.id} style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ position: 'relative', width: 76, height: 76, margin: '0 auto 8px' }}>
                  <div style={{
                    width: 76, height: 76, borderRadius: '50%', overflow: 'hidden',
                    background: '#eee',
                  }}>
                    {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.name || '?')[0]}
                  </div>
                  {homeCallMuted && m.id === user?.id && (
                    <span style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -4,
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#111',
                      border: '3px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                    }}>
                      <MicOff size={16} strokeWidth={2.6} color="#fff" />
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: m.id === user?.id ? '#e11d48' : '#111' }}>{m.id === user?.id ? 'You' : (m.name || m.username)}</span>
              </div>
            ))}
            <button type="button" onClick={() => { void notifyHomeCallAgain(); }} style={{ textAlign: 'center', minWidth: 72, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%', margin: '0 auto 6px',
                background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
              }}>
                ??
              </div>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Notify group</span>
            </button>
          </div>

          {homeCallEmojiBurst && (
            <div style={{ position: 'absolute', left: '50%', top: 20, transform: 'translateX(-50%)', fontSize: 42, animation: 'stooornaNavBubble 1s ease-out' }}>{homeCallEmojiBurst}</div>
          )}

          {homeCallMembersOpen && (
            <div style={{
              position: 'absolute', top: 56, left: 12, right: 12, background: '#fff',
              border: '1px solid #e5e7eb', borderRadius: 14, padding: 10, zIndex: 3, maxHeight: 200, overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}>
              {homeCallMembers.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', direction: 'rtl' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.joined ? '#22c55e' : '#d1d5db', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1, textAlign: 'right' }}>{m.name || m.username || 'مستخدم'}</span>
                  <span style={{ fontSize: 12, color: '#4b5563', flexShrink: 0 }}>{m.joined ? 'في المكالمة' : 'يُدعى…'}</span>
                </div>
              ))}
            </div>
          )}

          {homeCallEmojiOpen && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              {['??', '??', '??', '??', '??', '??'].map(em => (
                <button key={em} type="button" onClick={() => sendHomeCallEmoji(em)} style={{ width: 40, height: 40, borderRadius: 20, border: '1px solid #eee', background: '#fff', fontSize: 20, cursor: 'pointer' }}>{em}</button>
              ))}
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            direction: 'ltr',
            width: '100%',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: '#fff',
              border: '1px solid #eceff1',
              borderRadius: 999,
              padding: '8px 10px',
              boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
            }}>
              <button type="button" onClick={toggleHomeCallSpeaker} aria-label="السماعة" style={{
                width: 52, height: 52, borderRadius: '50%', border: 'none',
                background: homeCallSpeakerOn ? '#111' : '#eceff1',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {homeCallSpeakerOn
                  ? <Volume2 size={22} strokeWidth={2.3} color="#fff" />
                  : <VolumeX size={22} strokeWidth={2.3} color="#111" />}
              </button>
              <button type="button" onClick={toggleHomeCallMute} aria-label="كتم" style={{
                width: 52, height: 52, borderRadius: '50%', border: 'none',
                background: homeCallMuted ? '#111' : '#eceff1',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {homeCallMuted ? <MicOff size={22} strokeWidth={2.3} color="#fff" /> : <Mic size={22} strokeWidth={2.3} color="#111" />}
              </button>
              <button type="button" onClick={() => setHomeCallEmojiOpen(o => !o)} aria-label="إيموجي" style={{
                width: 52, height: 52, borderRadius: '50%', border: 'none',
                background: '#eceff1',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Smile size={22} strokeWidth={2.3} color="#111" />
              </button>
              <button type="button" onClick={() => { void leaveHomeGroupCall(); }} aria-label="إنهاء المكالمة" style={{
                width: 52, height: 52, borderRadius: '50%', border: 'none',
                background: '#e11d48',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <PhoneOff size={22} strokeWidth={2.3} color="#fff" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
  <>
  {companyListPanel}
  {userListPanel}
  {miniChatOverlay}
  {homeCallOverlay}
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

        {user && (
        <button
          type="button"
          onClick={() => {
            popNavBubble('storyMedia');
            const open = () => {
              try { window.dispatchEvent(new CustomEvent('stooorna:open-text-composer')); } catch { /* */ }
            };
            if (location.pathname === '/add-friend' || location.pathname.startsWith('/add-friend')) {
              open();
              return;
            }
            navigate('/add-friend?tab=friends');
            window.setTimeout(open, 100);
          }}
          aria-label="New Post"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 64,
            height: 36,
            border: `1.5px solid ${storyMediaOpen ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.5)'}`,
            background: storyMediaOpen ? 'rgba(239,68,68,0.16)' : 'rgba(6,20,22,0.85)',
            borderRadius: 999,
            color: storyMediaOpen ? '#ef4444' : 'rgba(239,68,68,0.9)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <NavBubble id="storyMedia" color="rgba(239,68,68,0.65)" />
          <span
            aria-hidden
            style={{
              display: 'block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: storyMediaOpen ? '#ef4444' : 'rgba(239,68,68,0.9)',
            }}
          />
        </button>
        )}

        {/* Plus menu — Settings / Friends / Account live / Text posts radar */}
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
                    aria-label={homeIncoming ? 'Answer call — long press to decline' : 'Call'}
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
                        borderRadius: '50%',
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
            <NavBubble id="plus" color={(homeIncoming && homeCallPhase === 'idle') ? 'rgba(34,197,94,0.65)' : 'rgba(0,188,212,0.65)'} />
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

        {/* طلبات الإضافة تُستقبل من كاميرا نشر القصة — لا شارة عائمة هنا */}
      </div>

    </nav>
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

  // عند فتح التطبيق على / نوجّه مباشرة لصفحة الهوم مع فتح البوستات النصية
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/add-friend?tab=friends&openTextPosts=1', { replace: true });
    }
  }, [location.pathname, navigate]);

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

  // صفحات "ملء الشاشة" مثل الشات الفردي (/chat) تدير ارتفاعها وسكرولها الداخلي
  // بنفسها (height: 100dvh + overflow: hidden) وتُخفي الشريط السفلي أصلاً.
  // لو أبقينا الـ padding-bottom المحجوز لشريط التنقل، يصير ارتفاع المحتوى
  // الكلي أطول من الشاشة، فتصير الصفحة قابلة للسكرول رغم أنها يفترض تكون
  // ثابتة — وأي سكرول تلقائي (استرجاع موضع السكرول، تصغير شريط عنوان
  // المتصفح، إلخ) يسحب الهيدر الملتصق فوق المحادثة خارج نطاق الرؤية.
  // لذلك نلغي هذا الحجز تحديدًا بهذه الصفحات.
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
              zIndex: 10150,
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