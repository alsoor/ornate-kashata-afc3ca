import { useCallback, useEffect, useRef, useState } from 'react';
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
  const sub = live ? (lang === 'ar' ? '\u062a\u062d\u0645\u064a\u0644' : 'Download') : (lang === 'ar' ? '\u0642\u0631\u064a\u0628\u0627\u064b' : 'Coming Soon');
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
          aria-label={lang === 'ar' ? '\u0643\u0644 \u0627\u0644\u0625\u0635\u062f\u0627\u0631\u0627\u062a' : 'All versions'}
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

const FEATURE_COUNT = 8;
const FEATURE_IMAGES = Array.from({ length: FEATURE_COUNT }, (_, i) => `/app-features/feature-${i + 1}.jpg`);
const FEATURE_ALTS = ['Home Hub', 'Stories', 'Call friends', 'Go LIVE', 'LIVE Battles', 'Live GPS Map', 'Templates', 'Live Chat and Reactions'];

const ABOUT_TEXT =
  'Stooorna is a social app that brings your friends together in one place. Go LIVE with video or voice, join split-screen LIVE battles, share stories, call your friends, chat in real time and see your friends on a live GPS map. With ready-made templates and animated reactions, every moment with your friends is more fun.';
const SUMMARY_TEXT =
  'Stooorna is a social LIVE app for friends. Broadcast with Video Live, Voice Live or Public LIVE, share full-screen stories, call friends in one tap, chat with animated reactions and follow your friends on a live map. Everything you need to stay connected is on one clean home screen.';
const SUPPORT_EMAIL = 'Stooorna@mail.com';

type SheetTab = 'about' | 'summary' | 'privacy';
const TABS: { key: SheetTab; label: string }[] = [
  { key: 'about', label: 'About' },
  { key: 'summary', label: 'Summary' },
  { key: 'privacy', label: 'Privacy Policy' },
];

/**
 * Logged-out home extras:
 *  - white header on top (About | Summary | Privacy Policy); tap a tab or the handle line → it drops down into a white page
 *    with the app screenshots (scroll up to move through them), the summary text and the Privacy Policy PDF + zoom bar
 *  - Google Play (left) / App Store (right) buttons on the same row as the "Sign in" pill, equal gaps
 *  - circle under Download → every uploaded version, newest first, with day + date
 * Mount once where the "Sign in" pill is rendered, only when the user is logged out.
 */
export default function GuestHomeExtras({
  storesTop = 69,
  storeGap = 16,
  signInHalf = 46,
  headerHeight = 36,
  lang: langProp,
}: {
  hamburgerTop?: number; // legacy, no longer used
  storesTop?: number; storeGap?: number; signInHalf?: number; headerHeight?: number; lang?: 'ar' | 'en';
}) {
  const [langAuto, setLang] = useState<'ar' | 'en'>(readLang);
  const lang = langProp ?? langAuto;
  const [list, setList] = useState<AppRelease[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>('about');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [versions, setVersions] = useState<ReleasePlatform | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => { if (!sheetOpen) setZoom(1); }, [sheetOpen]);
  const zoomBy = (d: number) => setZoom(z => Math.min(3, Math.max(1, Math.round((z + d) * 100) / 100)));

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
    ? { privacy: '\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629', open: '\u0641\u062a\u062d PDF', versions: '\u0627\u0644\u0625\u0635\u062f\u0627\u0631\u0627\u062a', latest: '\u0627\u0644\u0623\u062d\u062f\u062b', close: '\u0625\u063a\u0644\u0627\u0642' }
    : { privacy: 'Privacy Policy', open: 'Open PDF', versions: 'Versions', latest: 'Latest', close: 'Close' };

  const vList = versions === 'android' ? android : versions === 'ios' ? ios : [];

  return (
    <>
      {createPortal(
        <>
      {/* store buttons: left = Google Play, right = App Store */}
      {vis.android && (
        <div style={{ position: 'fixed', top: `calc(env(safe-area-inset-top, 0px) + ${storesTop}px)`, left: `calc(50% - ${signInHalf + storeGap + 84}px)`, zIndex: 10090 }}>
          <StoreButton platform="android" release={android[0]} count={android.length} lang={lang} onOpenVersions={() => setVersions('android')} />
        </div>
      )}
      {vis.ios && (
        <div style={{ position: 'fixed', top: `calc(env(safe-area-inset-top, 0px) + ${storesTop}px)`, right: `calc(50% - ${signInHalf + storeGap + 84}px)`, zIndex: 10090 }}>
          <StoreButton platform="ios" release={ios[0]} count={ios.length} lang={lang} onOpenVersions={() => setVersions('ios')} />
        </div>
      )}

        </>,
        document.body,
      )}

      {createPortal(
        <div
          dir="ltr"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: sheetOpen ? 300000 : 10095,
            height: sheetOpen ? '100dvh' : `calc(env(safe-area-inset-top, 0px) + ${headerHeight}px)`,
            background: '#fff', color: '#0a0a0a', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            transition: 'height .38s cubic-bezier(.22,1,.36,1)', boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          }}
        >
          {/* three sections */}
          <div style={{ display: 'flex', flexShrink: 0, paddingTop: 'env(safe-area-inset-top, 0px)', height: 22, boxSizing: 'content-box', borderBottom: sheetOpen ? '1px solid #e5e7eb' : 'none' }}>
            {TABS.map(x => {
              const on = sheetOpen && tab === x.key;
              return (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => { setTab(x.key); setSheetOpen(true); }}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 800,
                    color: on ? '#0891b2' : '#374151', borderBottom: on ? '2px solid #0891b2' : '2px solid transparent',
                  }}
                >
                  {x.label}
                </button>
              );
            })}
          </div>

          {/* page content */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', opacity: sheetOpen ? 1 : 0, pointerEvents: sheetOpen ? 'auto' : 'none', transition: 'opacity .25s' }}>
            {tab === 'about' && (
              <div key="about" ref={scrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '18px 16px 12px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>About</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: '#1f2937' }}>{ABOUT_TEXT}</p>
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                  {sheetOpen && FEATURE_IMAGES.map((src, i) => (
                    <motion.img
                      key={src}
                      src={src}
                      alt={FEATURE_ALTS[i]}
                      draggable={false}
                      loading="lazy"
                      initial={{ opacity: 0, y: 60 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, root: scrollRef, amount: 0.12 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ width: 'min(100%, 340px)', height: 'auto', borderRadius: 22, display: 'block', boxShadow: '0 8px 24px rgba(0,0,0,0.22)' }}
                    />
                  ))}
                </div>
                <div style={{ marginTop: 22, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  Support: <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#0891b2', fontWeight: 700, textDecoration: 'none' }}>{SUPPORT_EMAIL}</a>
                </div>
              </div>
            )}
            {tab === 'summary' && (
              <div key="summary" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '18px 16px 12px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Summary</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: '#1f2937' }}>{SUMMARY_TEXT}</p>
              </div>
            )}
            {tab === 'privacy' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', flexShrink: 0 }}>
                  <strong style={{ fontSize: 15 }}>Privacy Policy</strong>
                  <a href={PRIVACY_PDF} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: '#0891b2', textDecoration: 'none' }}>{T.open}</a>
                </div>
                <div style={{ flex: 1, overflow: 'auto', background: '#fff', WebkitOverflowScrolling: 'touch' }}>
                  <iframe title={T.privacy} src={PRIVACY_PDF} style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, border: 'none', background: '#fff', display: 'block' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                  <button type="button" onClick={() => zoomBy(-0.25)} disabled={zoom <= 1} aria-label="Zoom out"
                    style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f3f4f6', fontSize: 22, fontWeight: 800, cursor: 'pointer', opacity: zoom <= 1 ? 0.4 : 1 }}>−</button>
                  <span style={{ minWidth: 52, textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#0891b2' }}>{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => zoomBy(0.25)} disabled={zoom >= 3} aria-label="Zoom in"
                    style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f3f4f6', fontSize: 22, fontWeight: 800, cursor: 'pointer', opacity: zoom >= 3 ? 0.4 : 1 }}>+</button>
                </div>
              </>
            )}
          </div>

          {/* the sheet line: tap to drop the page down / pull it back up */}
          <button
            type="button"
            onClick={() => setSheetOpen(o => !o)}
            aria-label={sheetOpen ? T.close : 'Open'}
            style={{
              flexShrink: 0, width: '100%', height: sheetOpen ? 'calc(34px + env(safe-area-inset-bottom, 0px))' : 14,
              paddingBottom: sheetOpen ? 'env(safe-area-inset-bottom, 0px)' : 0, boxSizing: 'border-box',
              background: '#fff', border: 'none', borderTop: sheetOpen ? '1px solid #e5e7eb' : 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}
          >
            {sheetOpen && (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6,15 12,9 18,15" /></svg>
            )}
            <span style={{ width: 40, height: 4, borderRadius: 2, background: '#cbd5e1' }} />
          </button>
        </div>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
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
