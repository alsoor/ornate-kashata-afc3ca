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
const PERMS_TRIES_KEY = 'stooorna_pwa_perms_tries';

// UI strings for the permission results view (kept as unicode escapes)
const T = {
  notifications: '\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a',
  microphone: '\u0627\u0644\u0645\u0627\u064a\u0643\u0631\u0648\u0641\u0648\u0646',
  camera: '\u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627',
  location: '\u0627\u0644\u0645\u0648\u0642\u0639',
  clipboard: '\u0627\u0644\u062d\u0627\u0641\u0638\u0629',
  clipboardItem: '\u0627\u0644\u062d\u0627\u0641\u0638\u0629 \u2014 \u0644\u0635\u0642 \u0627\u0644\u0631\u0648\u0627\u0628\u0637 \u0648\u0627\u0644\u0646\u0635\u0648\u0635',
  deniedTitle: '\u0628\u0639\u0636 \u0627\u0644\u0623\u0630\u0648\u0646\u0627\u062a \u0645\u0631\u0641\u0648\u0636\u0629',
  deniedHelp: '\u0641\u0639\u0651\u0644\u0647\u0627 \u064a\u062f\u0648\u064a\u0627\u064b: \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u062c\u0648\u0627\u0644 \u2190 \u0627\u0644\u062a\u0637\u0628\u064a\u0642\u0627\u062a \u2190 Stooorna \u2190 \u0627\u0644\u0623\u0630\u0648\u0646\u0627\u062a.',
  done: '\u062a\u0645',
};

type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

async function queryPerm(name: string): Promise<PermState> {
  try {
    const r = await (navigator as any).permissions.query({ name });
    return r.state as PermState;
  } catch {
    return 'unknown';
  }
}

// Reads the current state of every permission the app uses.
// denied  = labels the user refused (cannot be asked again from the page)
// pending = at least one important permission was never answered
async function checkPerms(): Promise<{ denied: string[]; pending: boolean }> {
  const denied: string[] = [];
  let pending = false;
  const note = (state: string, label: string, counts = true) => {
    if (state === 'denied') denied.push(label);
    else if (state === 'prompt' && counts) pending = true;
  };
  try {
    if ('Notification' in window) {
      note(Notification.permission === 'default' ? 'prompt' : Notification.permission, T.notifications);
    }
  } catch { /* */ }
  note(await queryPerm('microphone'), T.microphone);
  note(await queryPerm('camera'), T.camera);
  note(await queryPerm('geolocation'), T.location);
  note(await queryPerm('clipboard-read'), T.clipboard, false);
  return { denied, pending };
}

let deferredPrompt: BIPEvent | null = null;
// لو الحدث انلقط بدري من سكربت في index.html (window.__stooornaBIP) نستخدمه
if (typeof window !== 'undefined' && (window as any).__stooornaBIP) {
  deferredPrompt = (window as any).__stooornaBIP as BIPEvent;
}
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

// أيقونة التطبيق: لو ملف الصورة ما انحمّل تظهر أيقونة بديلة بدل الصورة المكسورة
function AppIcon({ size }: { size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        aria-hidden
        style={{
          width: size, height: size, borderRadius: size * 0.25, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #00BCD4 0%, #006978 100%)',
          color: '#041018', fontWeight: 900, fontSize: size * 0.55, lineHeight: 1,
        }}
      >
        S
      </div>
    );
  }
  return (
    <img
      src="/icons/icon-192.png" alt="" width={size} height={size}
      onError={() => setFailed(true)}
      style={{ borderRadius: size * 0.25, flexShrink: 0, display: 'block' }}
    />
  );
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
    if (/android/i.test(navigator.userAgent)) return true;
    // وضع "موقع سطح المكتب" في كروم يخفي كلمة Android من الـ UA
    const uaPlatform = (navigator as any).userAgentData?.platform;
    if (uaPlatform && /android/i.test(String(uaPlatform))) return true;
    return navigator.maxTouchPoints > 1 && /linux/i.test(navigator.userAgent) && !/cros/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

async function requestAllPermissions(onEnablePush?: () => Promise<void> | void) {
  // 0) Clipboard (first, while the tap is still a fresh user gesture)
  try { await navigator.clipboard?.readText?.(); } catch { /* */ }
  // 1) الإشعارات
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch { /* */ }
  try { await onEnablePush?.(); } catch { /* */ }
  // 2+3) Microphone and camera in a single prompt; fall back only if a device is missing
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    s.getTracks().forEach((tr) => tr.stop());
  } catch (e: any) {
    const name = String(e?.name || '');
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((tr) => tr.stop());
      } catch { /* */ }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((tr) => tr.stop());
      } catch { /* */ }
    }
  }
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
  const [nativeReady, setNativeReady] = useState(false); // true لما كروم يعطينا نافذة التثبيت الأصلية
  const [showHelp, setShowHelp] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deniedLabels, setDeniedLabels] = useState<string[]>([]);

  useEffect(() => {
    if (ANDROID_ONLY && !isAndroid()) return;
    try { if (sessionStorage.getItem(BANNER_HIDDEN_KEY) === '1') setHidden(true); } catch { /* */ }

    // الشريط يظهر دايماً على أندرويد (خارج التطبيق المثبّت)، حتى لو كروم ما أطلق beforeinstallprompt بعد.
    // لو النافذة الأصلية جاهزة → تثبيت بضغطة، وإلا نعرض خطوات التثبيت اليدوي.
    const sync = () => {
      setCanInstall(!isStandalone());
      setNativeReady(!!deferredPrompt);
    };
    listeners.add(sync);
    sync();

    // أول فتح للتطبيق المثبّت: اعرض شاشة الأذونات
    try {
      if (isStandalone() && localStorage.getItem(PERMS_DONE_KEY) !== '1') setShowPerms(true);
    } catch { /* */ }

    const onInstalled = () => {
      setInstalled(true);
      try { if (localStorage.getItem(PERMS_DONE_KEY) !== '1') setShowPerms(true); } catch { setShowPerms(true); }
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    // ضغطة وحدة = تثبيت مباشر (نافذة تثبيت المتصفح الأصلية)
    const p = deferredPrompt;
    if (!p) { setShowHelp((v) => !v); return; } // ما في نافذة أصلية → اعرض خطوات التثبيت اليدوي
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
    const { denied, pending } = await checkPerms();
    let tries = 1;
    try { tries = (Number(localStorage.getItem(PERMS_TRIES_KEY)) || 0) + 1; localStorage.setItem(PERMS_TRIES_KEY, String(tries)); } catch { /* */ }
    // Done when nothing is left unanswered (or after 3 attempts, e.g. device without a camera)
    if (!pending || tries >= 3) {
      try { localStorage.setItem(PERMS_DONE_KEY, '1'); } catch { /* */ }
    }
    setBusy(false);
    if (denied.length > 0) {
      setDeniedLabels(denied); // keep the sheet open and explain how to enable them manually
    } else {
      setShowPerms(false);
    }
  }, [busy, onEnablePush]);

  const closeDenied = () => {
    try { localStorage.setItem(PERMS_DONE_KEY, '1'); } catch { /* */ }
    setDeniedLabels([]);
    setShowPerms(false);
  };

  const dismissBanner = () => {
    setHidden(true);
    try { sessionStorage.setItem(BANNER_HIDDEN_KEY, '1'); } catch { /* */ }
  };

  const skipPerms = () => {
    setShowPerms(false);
  };

  return (
    <>
      {canInstall && !installed && !hidden && !showPerms && (
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
            <AppIcon size={40} />
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
          {showHelp && !nativeReady && (
            <div
              dir="rtl"
              style={{
                pointerEvents: 'auto', maxWidth: 460, margin: '8px auto 0', padding: '10px 12px',
                borderRadius: 14, boxSizing: 'border-box', border: '1px solid rgba(0,188,212,0.3)',
                background: '#071416', color: 'rgba(215,238,238,0.92)', fontSize: 12.5, lineHeight: 1.7,
              }}
            >
              افتح قائمة المتصفح ⋮ ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
              <br />
              لو فاتح الموقع من داخل تطبيق (تلجرام / انستقرام / سناب) افتحه من Chrome أولاً.
            </div>
          )}
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
              <AppIcon size={48} />
              <div>
                <p style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: 18 }}>Stooorna</p>
                <p style={{ margin: '2px 0 0', color: 'rgba(180,220,220,0.75)', fontSize: 12 }}>
                  فعّل الأذونات عشان التطبيق يشتغل كامل
                </p>
              </div>
            </div>
            {deniedLabels.length > 0 ? (
              <>
                <p style={{ margin: '0 0 8px', color: '#fff', fontWeight: 800, fontSize: 15 }}>{T.deniedTitle}</p>
                <p style={{ margin: '0 0 6px', color: '#ffb4a8', fontSize: 13.5, lineHeight: 1.7 }}>{deniedLabels.join(' · ')}</p>
                <p style={{ margin: '0 0 14px', color: 'rgba(215,238,238,0.85)', fontSize: 12.5, lineHeight: 1.7 }}>{T.deniedHelp}</p>
                <button
                  type="button" onClick={closeDenied}
                  style={{
                    width: '100%', padding: 14, borderRadius: 14, border: 'none',
                    background: '#00BCD4', color: '#041018', fontWeight: 900, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  {T.done}
                </button>
              </>
            ) : (
              <>
            <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'الإشعارات — المكالمات والرسائل وطلبات الصداقة',
                'المايكروفون — المكالمات والبث الصوتي',
                'الكاميرا — مكالمات الفيديو والقصص',
                'الموقع — الخريطة والبث المباشر',
                'تخزين دائم — حتى ما تنمسح بياناتك',
                T.clipboardItem,
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
