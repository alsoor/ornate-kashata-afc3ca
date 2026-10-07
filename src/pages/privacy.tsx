import { privacy } from 'virtual:content';
/**
 * /privacy — Privacy settings: last seen, who can contact/call, block list
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Eye, EyeOff, Phone, MessageSquare, ShieldOff, Trash2, LockKeyhole, Unlock, AlertTriangle } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth/auth-client';
import { useHeartbeat } from '@/hooks/usePresence';
import UserAvatar from '@/components/UserAvatar';
const T = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.35)',
  primaryBorder: 'rgba(0,188,212,0.2)',
  primaryFaint: 'rgba(0,188,212,0.08)',
  text: 'rgba(200,230,230,0.9)',
  textDim: 'rgba(150,200,200,0.5)',
  surface: 'rgba(0,188,212,0.05)',
  surfaceBorder: 'rgba(0,188,212,0.12)',
  navBorder: 'rgba(0,188,212,0.1)',
  red: '#ef4444',
  redFaint: 'rgba(239,68,68,0.08)',
  redBorder: 'rgba(239,68,68,0.25)'
};
type Visibility = 'everyone' | 'friends' | 'nobody';
interface Privacy {
  showLastSeen: boolean;
  whoCanContact: Visibility;
  whoCanCall: Visibility;
  // When true: friend requests must be accepted before the relationship is
  // formed, and this account's profile videos/photos are hidden from
  // everyone except accepted friends. When false: adding this account as a
  // friend happens instantly (no acceptance needed) and the full profile
  // (videos/photos) is visible to everyone.
  isPrivate: boolean;
}
interface BlockedUser {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}
function VisibilityPicker({
  value,
  onChange
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return <div style={{
    display: 'flex',
    gap: 6
  }}>
      {privacy.VISIBILITY_OPTIONS.map(opt => <motion.button key={opt.value} whileTap={{
      scale: 0.93
    }} onClick={() => onChange(opt.value as Visibility)} style={{
      flex: 1,
      padding: '7px 4px',
      borderRadius: 8,
      background: value === opt.value ? T.primaryFaint : 'transparent',
      border: `1px solid ${value === opt.value ? T.primaryBorder : T.surfaceBorder}`,
      color: value === opt.value ? T.primary : T.textDim,
      fontSize: '0.68rem',
      fontWeight: value === opt.value ? 600 : 400,
      cursor: 'pointer',
      transition: 'all 0.15s'
    }}>
          {opt.label}
        </motion.button>)}
    </div>;
}
export default function PrivacyPage() {
  const navigate = useNavigate();
  const {
    user,
    isPending
  } = useSession();
  useHeartbeat(!!user);
  const [settings, setSettings] = useState<Privacy>({
    showLastSeen: true,
    whoCanContact: 'everyone',
    whoCanCall: 'everyone',
    isPrivate: false
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  /** إلغاء الحساب بشكل نهائي — تأكيد + حالة الحذف */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // نتتبّع أنه تم التحميل مرة واحدة لكل مستخدم — useSession() قد يرجّع كائن user
  // بمرجع جديد مع كل إعادة رسم، فلو اعتمدنا على "user" نفسه كتبعية، كان هذا
  // الـ effect يعيد التنفيذ بعد كل toggle (لأن toggle يستدعي setSettings ويعيد
  // الرسم)، فيجلب من جديد القيمة القديمة من السيرفر ويطفئ المفتاح فورًا بعد
  // تشغيله — وهذا بالضبط سبب مشكلة "يطلع ويرجع يتسكر".
  const loadedForUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || loadedForUserIdRef.current === user.id) return;
    loadedForUserIdRef.current = user.id;
    fetch('/api/users/me/privacy', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setSettings(d);
    });
    fetch('/api/users/blocks').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBlocked(d);
    });
  }, [user?.id]);

  // إخفاء شريط الأقسام السفلي أثناء صفحة Privacy — وإعادته عند الخروج
  useEffect(() => {
    try {
      document.body.classList.add('stooorna-privacy-open');
      window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden: true } }));
    } catch { /* ignore */ }
    return () => {
      try {
        document.body.classList.remove('stooorna-privacy-open');
        window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden: false } }));
      } catch { /* ignore */ }
    };
  }, []);

  async function savePrivacy(updated: Privacy) {
    const previous = settings;
    setSettings(updated);
    setSaving(true);
    try {
      const r = await fetch('/api/users/me/privacy', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updated)
      });
      if (!r.ok) throw new Error('Failed to save privacy settings');
      const saved = await r.json() as Privacy;
      setSettings(saved);
      setSavedMsg('Saved');
      setTimeout(() => setSavedMsg(''), 1500);
    } catch {
      // الحفظ فشل فعليًا — نرجّع القيمة القديمة بدل ما نسيبه معلّق على قيمة
      // ما انحفظت، عشان المفتاح ما يوهم إنه تفعّل وهو ما تفعّل فعليًا.
      setSettings(previous);
    } finally {
      setSaving(false);
    }
  }
  async function unblock(targetId: string) {
    setUnblocking(targetId);
    try {
      await fetch('/api/users/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetId,
          action: 'unblock'
        })
      });
      setBlocked(prev => prev.filter(u => u.id !== targetId));
    } catch {/* silent */} finally {
      setUnblocking(null);
    }
  }

  /**
   * إلغاء الحساب بشكل نهائي — يمسح المستخدم وكل بياناته من السيرفر.
   * يجرّب مسارات شائعة؛ عند النجاح يسجّل الخروج ويوجّه لصفحة الدخول.
   */
  async function permanentlyDeleteAccount() {
    if (deletingAccount) return;
    const normalized = deleteConfirmText.trim().toLowerCase();
    if (normalized !== 'حذف' && normalized !== 'delete') {
      setDeleteError('اكتب «حذف» أو «delete» للتأكيد');
      return;
    }
    setDeletingAccount(true);
    setDeleteError('');
    try {
      const confirmBody = {
        confirm: true,
        confirmed: true,
        permanent: true,
        deleteAccount: true,
        text: deleteConfirmText.trim(),
      };
      const endpoints: Array<{ url: string; method: string; body?: object }> = [
        { url: '/api/users/me', method: 'DELETE', body: confirmBody },
        { url: '/api/users/me/delete', method: 'POST', body: confirmBody },
        { url: '/api/users/me/delete', method: 'DELETE', body: confirmBody },
        { url: '/api/account/delete', method: 'POST', body: confirmBody },
        { url: '/api/account', method: 'DELETE', body: confirmBody },
        { url: '/api/users/delete-account', method: 'POST', body: confirmBody },
        { url: '/api/auth/delete-user', method: 'POST', body: confirmBody },
        { url: '/api/auth/delete-account', method: 'POST', body: confirmBody },
      ];
      let ok = false;
      let lastStatus = 0;
      let lastBody = '';
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep.url, {
            method: ep.method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(ep.body || confirmBody),
          });
          lastStatus = r.status;
          try { lastBody = await r.text(); } catch { lastBody = ''; }
          if (r.ok || r.status === 204 || r.status === 200 || r.status === 201) {
            ok = true;
            break;
          }
          if (r.status === 401 && /deleted|removed|حذف/i.test(lastBody)) {
            ok = true;
            break;
          }
        } catch {
          /* try next */
        }
      }
      if (!ok) {
        setDeleteError(
          lastStatus === 404
            ? 'مسار حذف الحساب غير متوفر على السيرفر حالياً — تواصل مع الدعم'
            : 'تعذر حذف الحساب. حاول مرة أخرى أو تواصل مع الدعم.',
        );
        setDeletingAccount(false);
        return;
      }

      try {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (
            k.startsWith('stooorna_') ||
            k.startsWith('better-auth') ||
            k.includes('session') ||
            k.includes('auth')
          ) {
            try { localStorage.removeItem(k); } catch { /* */ }
          }
        }
        try { sessionStorage.clear(); } catch { /* */ }
      } catch { /* */ }

      try {
        await signOut();
      } catch {
        /* ignore */
      }
      setDeleteConfirmOpen(false);
      try {
        window.location.replace('/settings');
      } catch {
        try { window.location.href = '/settings'; } catch { /* */ }
        navigate('/settings', { replace: true });
      }
    } catch {
      setDeleteError('حدث خطأ أثناء الحذف. حاول مرة أخرى.');
      setDeletingAccount(false);
    }
  }

  if (isPending) return null;
  if (!user) {
    return <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <button onClick={() => navigate('/settings')} style={{
        color: T.primary,
        background: 'none',
        border: 'none',
        cursor: 'pointer'
      }}>Sign in first</button>
      </div>;
  }
  return <>
      <Helmet>
        <title>Privacy Settings | Stooorna</title>
        <meta name="description" content="Control your Stooorna privacy — manage last seen, who can message you, who can call, and blocked users." />
        <link rel="canonical" href="https://stooorna.com/privacy" />
        <meta property="og:title" content="Privacy Settings | Stooorna" />
        <meta property="og:description" content="Control your Stooorna privacy — last seen, messaging, calls, and blocked users." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/privacy" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">Privacy Settings</h1>

      <div style={{
      height: '100dvh',
      maxHeight: '100dvh',
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>

        {/* Header */}
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '40px 20px 14px',
        background: 'rgba(6,14,14,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${T.navBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
          <motion.button whileTap={{
          scale: 0.85
        }} onClick={() => navigate(-1)} style={{
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4
        }}>
            <ArrowLeft size={22} strokeWidth={2} />
          </motion.button>
          <p style={{
          color: T.text,
          fontSize: '0.9rem',
          fontWeight: 600,
          flex: 1
        }}>Privacy</p>
          <AnimatePresence>
            {(saving || savedMsg) && <motion.p initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} style={{
            color: savedMsg ? '#22c55e' : T.textDim,
            fontSize: '0.72rem'
          }}>
                {savedMsg || 'Saving…'}
              </motion.p>}
          </AnimatePresence>
        </div>

        {/* Content — minHeight:0 ضروري حتى يعمل السكرول داخل flex ويصل لزر حذف الحساب */}
        <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        padding: '20px 16px',
        paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 420,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}>

          {/* Private Account */}
          <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4
          }}>
              <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
                {settings.isPrivate ? <LockKeyhole size={16} strokeWidth={1.8} color={T.primary} /> : <Unlock size={16} strokeWidth={1.8} color={T.textDim} />}
                <p style={{
                color: T.text,
                fontSize: '0.85rem',
                fontWeight: 600
              }}>Private Account</p>
              </div>
              {/* Toggle */}
              <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => savePrivacy({
              ...settings,
              isPrivate: !settings.isPrivate
            })} role="switch" aria-checked={settings.isPrivate} aria-label="Toggle private account" style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: settings.isPrivate ? T.primary : 'rgba(100,100,100,0.2)',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s'
            }}>
                <motion.div animate={{
                x: settings.isPrivate ? 22 : 2
              }} transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25
              }} style={{
                position: 'absolute',
                top: 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
              }} />
              </motion.button>
            </div>
            <p style={{
            color: T.textDim,
            fontSize: '0.72rem',
            marginLeft: 24
          }}>
              {settings.isPrivate
                ? 'New friends must be accepted by you, and your profile videos/photos are hidden from everyone except accepted friends'
                : 'Anyone can add you as a friend instantly, and your profile videos/photos are visible to everyone'}
            </p>
          </div>

          {/* Last seen */}
          <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4
          }}>
              <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
                {settings.showLastSeen ? <Eye size={16} strokeWidth={1.8} color={T.primary} /> : <EyeOff size={16} strokeWidth={1.8} color={T.textDim} />}
                <p style={{
                color: T.text,
                fontSize: '0.85rem',
                fontWeight: 600
              }}>Last Seen</p>
              </div>
              {/* Toggle */}
              <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => savePrivacy({
              ...settings,
              showLastSeen: !settings.showLastSeen
            })} style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: settings.showLastSeen ? T.primary : 'rgba(100,100,100,0.2)',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s'
            }}>
                <motion.div animate={{
                x: settings.showLastSeen ? 22 : 2
              }} transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25
              }} style={{
                position: 'absolute',
                top: 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
              }} />
              </motion.button>
            </div>
            <p style={{
            color: T.textDim,
            fontSize: '0.72rem',
            marginLeft: 24
          }}>
              {settings.showLastSeen ? 'Others can see when you were last active' : 'Your last seen is hidden from everyone'}
            </p>
          </div>

          {/* Who can contact */}
          <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12
          }}>
              <MessageSquare size={16} strokeWidth={1.8} color={T.primary} />
              <p style={{
              color: T.text,
              fontSize: '0.85rem',
              fontWeight: 600
            }}>Who can message me</p>
            </div>
            <VisibilityPicker value={settings.whoCanContact} onChange={v => savePrivacy({
            ...settings,
            whoCanContact: v
          })} />
          </div>

          {/* Who can call */}
          <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12
          }}>
              <Phone size={16} strokeWidth={1.8} color={T.primary} />
              <p style={{
              color: T.text,
              fontSize: '0.85rem',
              fontWeight: 600
            }}>Who can call me</p>
            </div>
            <VisibilityPicker value={settings.whoCanCall} onChange={v => savePrivacy({
            ...settings,
            whoCanCall: v
          })} />
          </div>

          {/* Blocked users */}
          <div style={{
          background: T.surface,
          border: `1px solid ${T.surfaceBorder}`,
          borderRadius: 14,
          padding: '16px 18px'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14
          }}>
              <ShieldOff size={16} strokeWidth={1.8} color={T.red} />
              <p style={{
              color: T.text,
              fontSize: '0.85rem',
              fontWeight: 600
            }}>Blocked Users</p>
              {blocked.length > 0 && <span style={{
              marginLeft: 'auto',
              background: T.redFaint,
              border: `1px solid ${T.redBorder}`,
              borderRadius: 10,
              padding: '2px 8px',
              color: T.red,
              fontSize: '0.65rem',
              fontWeight: 700
            }}>
                  {blocked.length}
                </span>}
            </div>

            {blocked.length === 0 ? <p style={{
            color: T.textDim,
            fontSize: '0.78rem',
            fontStyle: 'italic'
          }}>No blocked users</p> : <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
                {blocked.map(u => <div key={u.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
                    <UserAvatar name={u.name ?? u.username ?? 'User'} avatarUrl={u.avatarUrl} size={36} />
                    <div style={{
                flex: 1
              }}>
                      <p style={{
                  color: T.text,
                  fontSize: '0.82rem',
                  fontWeight: 500
                }}>{u.name ?? u.username ?? 'User'}</p>
                      {u.username && <p style={{
                  color: T.textDim,
                  fontSize: '0.68rem'
                }}>@{u.username}</p>}
                    </div>
                    <motion.button whileTap={{
                scale: 0.9
              }} onClick={() => unblock(u.id)} disabled={unblocking === u.id} style={{
                padding: '6px 10px',
                background: T.redFaint,
                border: `1px solid ${T.redBorder}`,
                borderRadius: 8,
                color: T.red,
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                      <Trash2 size={12} strokeWidth={2} />
                      {unblocking === u.id ? '…' : 'Unblock'}
                    </motion.button>
                  </div>)}
              </div>}
          </div>

          {/* ── إلغاء الحساب بشكل نهائي (للمستخدمين والشركات) ── */}
          <div style={{
            background: T.redFaint,
            border: `1px solid ${T.redBorder}`,
            borderRadius: 14,
            padding: '16px 18px',
            marginTop: 8,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}>
              <AlertTriangle size={16} strokeWidth={1.8} color={T.red} />
              <p style={{
                color: T.red,
                fontSize: '0.85rem',
                fontWeight: 700,
                margin: 0,
              }}>إلغاء الحساب بشكل نهائي</p>
            </div>
            <p style={{
              color: T.textDim,
              fontSize: '0.72rem',
              lineHeight: 1.5,
              margin: '0 0 14px',
            }}>
              سيتم مسح حسابك وكل بياناتك من السيرفر بشكل نهائي ولا يمكن التراجع عن هذا الإجراء. يشمل ذلك المنشورات، الرسائل، الأصدقاء، والملفات المرتبطة بالحساب.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => {
                setDeleteConfirmText('');
                setDeleteError('');
                setDeleteConfirmOpen(true);
              }}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 10,
                border: `1px solid ${T.redBorder}`,
                background: 'rgba(239,68,68,0.18)',
                color: T.red,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Trash2 size={15} strokeWidth={2} />
              إلغاء الحساب بشكل نهائي
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── مربع تأكيد إلغاء الحساب ── */}
      <AnimatePresence>
        {deleteConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!deletingAccount) setDeleteConfirmOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10050,
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 340,
                background: 'linear-gradient(160deg, #1a1212 0%, #0e0a0a 100%)',
                border: `1px solid ${T.redBorder}`,
                borderRadius: 16,
                padding: '22px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(239,68,68,0.15)',
                  border: `1px solid ${T.redBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <AlertTriangle size={22} color={T.red} strokeWidth={2} />
                </div>
                <p style={{ color: T.text, fontSize: '0.92rem', fontWeight: 800, margin: 0, textAlign: 'center' }}>
                  تأكيد إلغاء الحساب
                </p>
              </div>
              <p style={{
                color: T.textDim,
                fontSize: '0.78rem',
                lineHeight: 1.55,
                textAlign: 'center',
                margin: 0,
              }}>
                سيتم حذف حسابك وكل بياناتك من السيرفر نهائياً. لا يمكن استعادة الحساب بعد الحذف.
              </p>
              <p style={{
                color: T.textDim,
                fontSize: '0.72rem',
                textAlign: 'center',
                margin: 0,
              }}>
                اكتب <span style={{ color: T.red, fontWeight: 700 }}>حذف</span> أو <span style={{ color: T.red, fontWeight: 700 }}>delete</span> للتأكيد
              </p>
              <input
                value={deleteConfirmText}
                onChange={e => {
                  setDeleteConfirmText(e.target.value);
                  setDeleteError('');
                }}
                disabled={deletingAccount}
                placeholder="حذف"
                autoFocus
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: `1px solid ${T.redBorder}`,
                  background: 'rgba(0,0,0,0.35)',
                  color: T.text,
                  fontSize: '0.88rem',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              {deleteError ? (
                <p style={{ color: T.red, fontSize: '0.72rem', margin: 0, textAlign: 'center' }}>
                  {deleteError}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  disabled={deletingAccount}
                  onClick={() => setDeleteConfirmOpen(false)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: 10,
                    border: `1px solid ${T.surfaceBorder}`,
                    background: T.primaryFaint,
                    color: T.text,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  إلغاء
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  disabled={deletingAccount}
                  onClick={() => void permanentlyDeleteAccount()}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: 10,
                    border: `1px solid ${T.redBorder}`,
                    background: 'rgba(239,68,68,0.22)',
                    color: T.red,
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: deletingAccount ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: deletingAccount ? 0.7 : 1,
                  }}
                >
                  {deletingAccount ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: '2px solid rgba(239,68,68,0.3)',
                        borderTopColor: T.red,
                      }}
                    />
                  ) : (
                    <>
                      <Trash2 size={14} strokeWidth={2} />
                      حذف نهائي
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>;
}