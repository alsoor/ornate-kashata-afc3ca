import { useCallback, useEffect, useState } from 'react';
import { Download, X, ShieldCheck } from 'lucide-react';

// شريط "تثبيت / Install" أعلى الشاشة (أندرويد) + طلب الأذونات بعد التثبيت.

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

// true = يظهر على أندرويد فقط. غيّرها إلى false لو تبي تجربه على كمبيوتر.
const ANDROID_ONLY = true;
const PERMS_DONE_KEY = 'stooorna_pwa_perms_done';
const BANNER_HIDDEN_KEY = 'stooorna_pwa_banner_hidden';

let deferredPrompt: BIPEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// يُسجَّل مرة وحدة عند تحميل الملف حتى ما يفوتنا الحدث
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

function isAndroid(): boolean {
  try {
    return /android/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

async function requestAllPermissions(onEnablePush?: () => Promise<void> | void) {
  // 1) الإشعارات
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch { /* */ }
  try { await onEnablePush?.(); } catch { /* */ }
  // 2) المايك
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch { /* */ }
  // 3) الكاميرا
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
  } catch { /* */ }
  // 4) الموقع
  try {
    await new Promise<void>((res) => {
      if (!navigator.geolocation) return res();
      navigator.geolocation.getCurrentPosition(() => res(), () => res(), { timeout: 10000 });
    });
  } catch { /* */ }
  // 5) تخزين دائم (ما ينمسح من المتصفح)
  try { await (navigator as any).storage?.persist?.(); } catch { /* */ }
}

export default function PwaInstallBanner({
  onEnablePush,
}: {
  onEnablePush?: () => Promise<void> | void;
}) {
  const [canInstall, setCanInstall] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ANDROID_ONLY && !isAndroid()) return;
    try { if (sessionStorage.getItem(BANNER_HIDDEN_KEY) === '1') setHidden(true); } catch { /* */ }

    const sync = () => setCanInstall(!!deferredPrompt && !isStandalone());
    listeners.add(sync);
    sync();

    // أول فتح للتطبيق المثبّت: اعرض شاشة الأذونات
    try {
      if (isStandalone() && localStorage.getItem(PERMS_DONE_KEY) !== '1') setShowPerms(true);
    } catch { /* */ }

    const onInstalled = () => {
      try { if (localStorage.getItem(PERMS_DONE_KEY) !== '1') setShowPerms(true); } catch { setShowPerms(true); }
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const p = deferredPrompt;
    if (!p) return;
    try {
      await p.prompt();
      const { outcome } = await p.userChoice;
      deferredPrompt = null;
      notify();
      if (outcome === 'accepted') {
        try { if (localStorage.getItem(PERMS_DONE_KEY) !== '1') setShowPerms(true); } catch { setShowPerms(true); }
      }
    } catch { /* */ }
  }, []);

  const allowAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await requestAllPermissions(onEnablePush);
    try { localStorage.setItem(PERMS_DONE_KEY, '1'); } catch { /* */ }
    setBusy(false);
    setShowPerms(false);
  }, [busy, onEnablePush]);

  const dismissBanner = () => {
    setHidden(true);
    try { sessionStorage.setItem(BANNER_HIDDEN_KEY, '1'); } catch { /* */ }
  };

  const skipPerms = () => {
    setShowPerms(false);
  };

  return (
    <>
      {canInstall && !hidden && !showPerms && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 13100,
            padding: 'max(env(safe-area-inset-top, 0px), 8px) 10px 0',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              pointerEvents: 'auto', maxWidth: 460, margin: '0 auto',
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 16, boxSizing: 'border-box',
              border: '1px solid rgba(0,188,212,0.4)',
              background: 'linear-gradient(180deg, #0c2226 0%, #071416 100%)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.5), 0 0 16px rgba(0,188,212,0.18)',
              animation: 'stooornaLiveBannerIn 0.35s ease-out',
            }}
          >
            <img
              src="/icons/icon-192.png" alt="" width={40} height={40}
              style={{ borderRadius: 10, flexShrink: 0, display: 'block' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>Stooorna</p>
              <p style={{ margin: '2px 0 0', color: 'rgba(180,220,220,0.75)', fontSize: 11.5 }}>
                ثبّت التطبيق على جوالك · Install the app
              </p>
            </div>
            <button
              type="button" onClick={install}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                borderRadius: 12, border: 'none', background: '#00BCD4', color: '#041018',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Download size={15} strokeWidth={2.6} />
              تثبيت · Install
            </button>
            <button
              type="button" onClick={dismissBanner} aria-label="Close"
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent',
                color: 'rgba(200,230,230,0.65)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {showPerms && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 13300, background: 'rgba(3,8,9,0.78)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            dir="rtl"
            style={{
              width: '100%', maxWidth: 480, boxSizing: 'border-box',
              padding: '20px 18px max(20px, env(safe-area-inset-bottom))',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              border: '1px solid rgba(0,188,212,0.3)',
              background: 'linear-gradient(180deg,#0a1f22 0%,#061014 100%)',
              animation: 'stooornaHomeCallSheet 0.34s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <img src="/icons/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 12 }} />
              <div>
                <p style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: 18 }}>Stooorna</p>
                <p style={{ margin: '2px 0 0', color: 'rgba(180,220,220,0.75)', fontSize: 12 }}>
                  فعّل الأذونات عشان التطبيق يشتغل كامل
                </p>
              </div>
            </div>
            <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'الإشعارات — المكالمات والرسائل وطلبات الصداقة',
                'المايكروفون — المكالمات والبث الصوتي',
                'الكاميرا — مكالمات الفيديو والقصص',
                'الموقع — الخريطة والبث المباشر',
                'تخزين دائم — حتى ما تنمسح بياناتك',
              ].map((t) => (
                <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(215,238,238,0.92)', fontSize: 13.5 }}>
                  <ShieldCheck size={16} color="#00BCD4" style={{ flexShrink: 0 }} />
                  {t}
                </li>
              ))}
            </ul>
            <button
              type="button" onClick={allowAll} disabled={busy}
              style={{
                width: '100%', padding: 14, borderRadius: 14, border: 'none',
                background: '#00BCD4', color: '#041018', fontWeight: 900, fontSize: 15,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? '...' : 'السماح بكل الأذونات · Allow all'}
            </button>
            <button
              type="button" onClick={skipPerms}
              style={{
                width: '100%', marginTop: 8, padding: 10, borderRadius: 12, border: 'none',
                background: 'transparent', color: 'rgba(180,220,220,0.6)', fontSize: 13, cursor: 'pointer',
              }}
            >
              لاحقاً
            </button>
          </div>
        </div>
      )}
    </>
  );
}
