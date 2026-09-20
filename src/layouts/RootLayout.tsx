import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ScrollRestoration, useLocation, useNavigate } from "react-router";
import { Home, Settings } from 'lucide-react';
import Website from '@/layouts/Website';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSession } from '@/lib/auth/auth-client';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { playNotificationSound } from '@/lib/notificationSound';
interface RootLayoutProps {
  children: ReactElement;
}

function GlobalBottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user
  } = useSession();
  const notifCounts = useNotificationCounts(!!user);

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

  // شات الدعم من الإعدادات — يخفي الشريط السفلي حتى لا يغطي مربع الكتابة
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  useEffect(() => {
    function handleBottomNav(e: Event) {
      const detail = (e as CustomEvent<{ hidden?: boolean }>).detail;
      setSupportChatOpen(!!detail?.hidden);
    }
    function syncFromBodyClass() {
      setSupportChatOpen(document.body.classList.contains('stooorna-support-chat-open'));
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

  // يُبدأ من الرابط (?openTextPosts=1) أو من / حتى تظهر × فوراً عند فتح التطبيق
  // على صفحة البوستات النصية، قبل ما صفحة add-friend تركّب وترسل الحدث.
  const [textPostsOpen, setTextPostsOpen] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openTextPosts') === '1') return true;
      const path = window.location.pathname;
      // التوجيه من / → openTextPosts=1؛ نفترض مفتوحاً من البداية لتجنّب وميض أيقونة Home
      if (path === '/' || path === '') return true;
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
    window.addEventListener('stooorna:text-posts-state', handle);
    return () => window.removeEventListener('stooorna:text-posts-state', handle);
  }, []);

  const isChat = location.pathname === '/add-friend';
  const isSettings = location.pathname === '/settings';
  // صفحة الشات الفردي (المحادثة المفتوحة)
  const isConversation = location.pathname === '/chat';
  // صفحة اللايف تدير كامل الشاشة بنفسها، فلازم الشريط
  // السفلي يختفي وهي مفتوحة ويرجع تلقائياً عند الخروج منها.
  const isLive = location.pathname === '/live' || location.pathname.startsWith('/live/');
  const previousFriendRequestsRef = useRef(notifCounts.friendReqs);
  useEffect(() => {
    if (notifCounts.friendReqs > previousFriendRequestsRef.current) {
      playNotificationSound('request');
    }
    previousFriendRequestsRef.current = notifCounts.friendReqs;
  }, [notifCounts.friendReqs]);
  const chatBadge = notifCounts.dmUnread + notifCounts.groupUnread;

  const navigateFromBottomBar = (path: string) => {
    navigate(path);
  };

  // عند فتح البوستات النصية يظهر × للخروج؛ وإلا ينتقل للهوم بدون فتح الكاميرا
  const openStoryHome = () => {
    if (textPostsOpen) {
      window.dispatchEvent(new CustomEvent('stooorna:close-text-posts'));
      return;
    }
    navigate('/add-friend?tab=friends');
  };

  const openFriendRequests = () => {
    navigate('/add-friend?tab=requests');
  };

  // إخفاء الشريط تلقائياً داخل أي شات (فردي أو سري أو دعم)، أو عند فتح نافذة كتابة منشور جديد،
  // أو عند فتح شيت "إرسال المنشور إلى الأصدقاء" — وإرجاعه تلقائياً عند الخروج من كل حالة
  // إخفاء الشريط السفلي أيضاً أثناء صفحة البوست النصي (× في هيدر الصفحة نفسها)
  if (isConversation || isLive || secretChatOpen || postComposerOpen || shareSheetOpen || storyCameraOpen || supportChatOpen || textPostsOpen) return null;

  // القسم النشط في الشريط السفلي فقط (قصة / إعدادات)
  const activeNav: 'feed' | 'settings' = isSettings ? 'settings' : 'feed';
  const shadowIndex = activeNav === 'feed' ? 0 : 1;

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
    transition: 'color 0.2s ease',
  });
  return <>
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
      position: 'relative',
    }}>
        {/* ظل متحرك يتبع القسم النشط */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 0,
            width: '50%',
            transform: `translateX(${shadowIndex * 100}%)`,
            transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
            pointerEvents: 'none',
            zIndex: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            width: 44,
            height: 36,
            borderRadius: 14,
            background: 'rgba(0,188,212,0.14)',
            boxShadow: '0 0 16px rgba(0,188,212,0.35), 0 0 4px rgba(0,188,212,0.25), inset 0 0 10px rgba(0,188,212,0.08)',
            border: '1px solid rgba(0,188,212,0.28)',
          }} />
        </div>

        <button type="button" onClick={openStoryHome} style={itemStyle(textPostsOpen || activeNav === 'feed')} aria-label={textPostsOpen ? 'Close text posts' : 'Home'}>
          {textPostsOpen ? (
            <span style={{ fontSize: '1.35rem', fontWeight: 400, lineHeight: 1, color: 'inherit' }}>×</span>
          ) : (
            <Home size={20} strokeWidth={activeNav === 'feed' ? 2 : 1.6} />
          )}
          {chatBadge > 0 && <span style={{
          position: 'absolute',
          top: 4,
          right: '22%',
          background: '#ef4444',
          color: '#fff',
          fontSize: '0.48rem',
          fontWeight: 700,
          borderRadius: 8,
          padding: '1px 4px',
          lineHeight: 1.3,
          minWidth: 12,
          textAlign: 'center'
        }}>
              {chatBadge > 99 ? '99+' : chatBadge}
            </span>}
        </button>


        <button type="button" onClick={() => navigateFromBottomBar('/settings')} style={itemStyle(activeNav === 'settings')} aria-label="Settings">
          <Settings size={20} strokeWidth={activeNav === 'settings' ? 2 : 1.6} />
        </button>
        {notifCounts.friendReqs > 0 && <button type="button" onClick={openFriendRequests} aria-label="Friend requests" style={{ position: 'absolute', right: 12, bottom: 56, minWidth: 24, height: 24, padding: '0 6px', border: '1px solid hsl(var(--primary))', borderRadius: 12, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer' }}>
          {notifCounts.friendReqs > 99 ? '99+' : notifCounts.friendReqs}
        </button>}
      </div>

    </nav>
  </>;
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
  return <Website>
      <Helmet>
        <title>Stooorna — Voice, Whisper &amp; Connect</title>
        <meta name="description" content="Stooorna is a real-time voice app for push-to-talk broadcasts, private whispers, group voice rooms, and instant messaging." />
        <meta property="og:site_name" content="Stooorna" />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
      </Helmet>

      <ScrollRestoration />
      <div style={isFullScreenChat ? {
      height: '100dvh',
      maxHeight: '100dvh',
      overflow: 'hidden',
      boxSizing: 'border-box'
    } : {
      minHeight: '100dvh',
      paddingBottom: 'calc(52px + env(safe-area-inset-bottom))',
      boxSizing: 'border-box'
    }}>
        {children}
      </div>
      <GlobalBottomNavigation />
      <style>{`@keyframes stooornaFeedOrbit { 0% { transform: rotate(0deg) scale(1); } 45% { transform: rotate(180deg) scale(1.14); } 100% { transform: rotate(360deg) scale(1); } } @keyframes stooornaFeedWave { 0%,100% { transform: scaleX(0.55); opacity: 0.45; } 50% { transform: scaleX(1); opacity: 1; } }`}</style>
    </Website>;
}