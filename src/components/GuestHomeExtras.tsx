import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchAppDownloads, releasesOf, latestDownloadUrl, releaseDownloadUrl, formatReleaseDate, RELEASES_EVENT,
  type AppRelease, type ReleasePlatform, type StoreVisibility,
} from '@/lib/appReleases';

const PRIVACY_PDF = '/privacy-policy.pdf';
const TEAL = '#00BCD4';

function readLang(): 'ar' | 'en' {
  try { return localStorage.getItem('stooorna_auth_lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor">
    <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9zM14.2 5.7c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.8-1.3z" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <polygon points="4,2.5 14,12 4,21.5" fill="#00BCD4" />
    <polygon points="4,2.5 14,12 17,9 6,2.8" fill="#4ADE80" />
    <polygon points="4,21.5 14,12 17,15 6,21.2" fill="#EF4444" />
    <polygon points="17,9 14,12 17,15 21,12.6 21,11.4" fill="#FACC15" />
  </svg>
);

function StoreButton({
  platform, release, count, lang, onOpenVersions,
}: {
  platform: ReleasePlatform; release?: AppRelease; count: number; lang: 'ar' | 'en'; onOpenVersions: () => void;
}) {
  const live = !!release;
  const title = platform === 'android' ? 'Google Play' : 'App Store';
  const sub = live ? (lang === 'ar' ? 'تحميل' : 'Download') : (lang === 'ar' ? 'قريباً' : 'Coming Soon');
  const body = (
    <>
      <span style={{ color: live ? '#fff' : 'rgba(255,255,255,0.55)', display: 'flex' }}>
        {platform === 'android' ? <PlayIcon /> : <AppleIcon />}
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', marginTop: 2 }}>{title}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: live ? TEAL : 'rgba(210,230,230,0.6)' }}>{sub}</span>
    </>
  );
  const boxStyle: React.CSSProperties = {
    width: 84, padding: '8px 4px', borderRadius: 14, boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none',
    background: 'rgba(8,24,26,0.85)', border: `1px solid ${live ? 'rgba(0,188,212,0.5)' : 'rgba(150,190,190,0.25)'}`,
    opacity: live ? 1 : 0.8,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {live ? (
        <a href={latestDownloadUrl(platform)} download style={boxStyle} aria-label={`${title} download`}>{body}</a>
      ) : (
        <div style={boxStyle} aria-disabled="true">{body}</div>
      )}
      {live && (
        <button
          type="button"
          onClick={onOpenVersions}
          aria-label={lang === 'ar' ? 'كل الإصدارات' : 'All versions'}
          style={{
            width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', padding: 0,
            border: `1px solid ${TEAL}`, background: 'rgba(0,188,212,0.12)', color: TEAL,
            fontSize: 10, fontWeight: 900, lineHeight: '26px',
          }}
        >
          {count > 99 ? '99+' : count}
        </button>
      )}
    </div>
  );
}

/**
 * Logged-out home extras:
 *  - three-lines button (top-right) → white page slides up with the Privacy Policy PDF
 *  - Google Play (left) / App Store (right) buttons under the header
 *  - circle under Download → every uploaded version, newest first, with day + date
 * Mount once where the "Sign in" pill is rendered, only when the user is logged out.
 */
export default function GuestHomeExtras({
  hamburgerTop = 82,
  storesTop = 118,
  lang: langProp,
}: { hamburgerTop?: number; storesTop?: number; lang?: 'ar' | 'en' }) {
  const [langAuto, setLang] = useState<'ar' | 'en'>(readLang);
  const lang = langProp ?? langAuto;
  const [list, setList] = useState<AppRelease[]>([]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [versions, setVersions] = useState<ReleasePlatform | null>(null);

  const [vis, setVis] = useState<StoreVisibility>({ android: true, ios: true });
  const reload = useCallback(async () => {
    const d = await fetchAppDownloads();
    setList(d.releases);
    setVis(d.visibility);
  }, []);
  useEffect(() => {
    void reload();
    window.addEventListener(RELEASES_EVENT, reload);
    const poll = langProp ? 0 : window.setInterval(() => setLang(readLang()), 600); // follows the Ar | En switch
    return () => { window.removeEventListener(RELEASES_EVENT, reload); if (poll) window.clearInterval(poll); };
  }, [reload, langProp]);

  const android = releasesOf(list, 'android');
  const ios = releasesOf(list, 'ios');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const T = lang === 'ar'
    ? { privacy: 'سياسة الخصوصية', open: 'فتح PDF', versions: 'الإصدارات', latest: 'الأحدث', close: 'إغلاق' }
    : { privacy: 'Privacy Policy', open: 'Open PDF', versions: 'Versions', latest: 'Latest', close: 'Close' };

  const vList = versions === 'android' ? android : versions === 'ios' ? ios : [];

  return (
    <>
      {createPortal(
        <>
      {/* three-lines button */}
      <button
        type="button"
        onClick={() => setPrivacyOpen(true)}
        aria-label="Menu"
        style={{
          position: 'fixed', top: `calc(env(safe-area-inset-top, 0px) + ${hamburgerTop}px)`, right: 16, zIndex: 10090,
          width: 34, height: 34, borderRadius: 10, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer',
          background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.4)',
        }}
      >
        {[0, 1, 2].map(i => <span key={i} style={{ width: 16, height: 2, borderRadius: 2, background: TEAL }} />)}
      </button>

      {/* store buttons: left = Google Play, right = App Store */}
      {vis.android && (
        <div style={{ position: 'fixed', top: `calc(env(safe-area-inset-top, 0px) + ${storesTop}px)`, left: 14, zIndex: 10090 }}>
          <StoreButton platform="android" release={android[0]} count={android.length} lang={lang} onOpenVersions={() => setVersions('android')} />
        </div>
      )}
      {vis.ios && (
        <div style={{ position: 'fixed', top: `calc(env(safe-area-inset-top, 0px) + ${storesTop}px)`, right: 14, zIndex: 10090 }}>
          <StoreButton platform="ios" release={ios[0]} count={ios.length} lang={lang} onOpenVersions={() => setVersions('ios')} />
        </div>
      )}

        </>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {privacyOpen && (
            <motion.div
              key="privacy"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 36 }}
              style={{ position: 'fixed', inset: 0, zIndex: 300000, background: '#fff', color: '#0a0a0a', display: 'flex', flexDirection: 'column' }}
              dir={dir}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 'max(14px, env(safe-area-inset-top)) 16px 12px', borderBottom: '1px solid #e5e7eb' }}>
                <strong style={{ fontSize: 16 }}>{T.privacy}</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={PRIVACY_PDF} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: '#0891b2', textDecoration: 'none', alignSelf: 'center' }}>{T.open}</a>
                  <button type="button" onClick={() => setPrivacyOpen(false)} aria-label={T.close}
                    style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #e5e7eb', background: '#f3f4f6', fontSize: 18, cursor: 'pointer' }}>×</button>
                </div>
              </div>
              <iframe title={T.privacy} src={PRIVACY_PDF} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
            </motion.div>
          )}
          {versions && (
            <motion.div
              key="versions"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setVersions(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 300001, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}
            >
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                onClick={e => e.stopPropagation()}
                dir={dir}
                style={{ width: '100%', maxHeight: '70vh', overflowY: 'auto', background: '#fff', color: '#0a0a0a', borderRadius: '20px 20px 0 0', padding: '16px 16px max(16px, env(safe-area-inset-bottom))' }}
              >
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
                  {T.versions} · {versions === 'android' ? 'Google Play' : 'App Store'}
                </div>
                {vList.map((r, i) => (
                  <a key={r.id} href={releaseDownloadUrl(r.id)} download
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: '1px solid #e5e7eb', textDecoration: 'none', color: 'inherit' }}>
                    <span>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>v{r.version}</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#6b7280' }}>{formatReleaseDate(r.createdAt, lang)}</span>
                    </span>
                    {i === 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#0891b2' }}>{T.latest}</span>}
                  </a>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
