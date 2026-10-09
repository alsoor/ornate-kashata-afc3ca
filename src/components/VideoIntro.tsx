import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** The video lives in  /public/intro.mp4 */
export const INTRO_VIDEO_SRC = '/intro.mp4';

/** Once a person logs in or creates an account, this flag is set for good and the intro never shows again on this device. */
const REGISTERED_KEY = 'stooorna_intro_registered';
const TEAL = '#00BCD4';
let skippedThisSession = false; // "Log In" pressed: don't bring it back while the app stays open

// Video is 720x1280. Logo ring in the last frame: centre (50%, 49.7%), ring radius ~11.4% of width.
const VW = 720;
const VH = 1280;
const RING = { cx: 360, cy: 636, r: 82 };
const SHIMMER_FROM = 15.6; // the logo starts to appear here (seconds)

function wasRegistered(): boolean {
  try { return localStorage.getItem(REGISTERED_KEY) === '1'; } catch { return false; }
}
/** Call this after a successful login or sign-up (done automatically when isLoggedIn becomes true). */
export function markIntroRegistered() {
  try { localStorage.setItem(REGISTERED_KEY, '1'); } catch { /* ignore */ }
}

/**
 * Full-screen welcome video for visitors who never registered, on top of every page.
 *   <VideoIntro isLoggedIn={!!user} authLoading={authLoading} onLogin={() => openAuthPage()} />
 * Mount it once at the top of the app and keep it mounted even when the user is logged in.
 * - logged out + never registered -> plays full screen, only a "Log In" button (skips the video, opens sign-in)
 * - the moment the user logs in / creates an account -> it is switched off for good (even after log out)
 */
export default function VideoIntro({ isLoggedIn, authLoading = false, onLogin }: { isLoggedIn: boolean; authLoading?: boolean; onLogin: () => void }) {
  const [dismissed, setDismissed] = useState(() => skippedThisSession);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [ended, setEnded] = useState(false);

  // any login / account creation switches the intro off permanently
  useEffect(() => { if (isLoggedIn) markIntroRegistered(); }, [isLoggedIn]);

  // GuestHomeExtras only exists while logged out: if it goes away after the visitor pressed "Log In",
  // they went on to log in / sign up, so the intro is switched off for good.
  useEffect(() => () => { if (skippedThisSession) markIntroRegistered(); }, []);

  const visible = !authLoading && !isLoggedIn && !dismissed && !wasRegistered();

  // Plays by itself: starts muted (always allowed), then tries to turn the sound on.
  useEffect(() => {
    if (!visible) return;
    const v = videoRef.current;
    if (!v) return;
    v.controls = false;
    v.muted = true;
    const playMuted = () => { v.muted = true; return v.play().catch(() => {}); };
    const trySound = () => {
      v.muted = false;
      window.setTimeout(() => { if (v.paused && !v.ended) void playMuted(); }, 250);
    };
    v.play().then(trySound).catch(() => { void playMuted(); });
    const retry = () => { if (v.paused && !v.ended) void playMuted(); };
    const wake = () => {
      if (v.muted) v.muted = false;
      if (v.paused && !v.ended) v.play().catch(() => {});
    };
    v.addEventListener('canplay', retry);
    window.addEventListener('pointerdown', wake, { once: true });
    return () => { v.removeEventListener('canplay', retry); window.removeEventListener('pointerdown', wake); };
  }, [visible]);

  const onTime = useCallback(() => { const v = videoRef.current; if (v) setT(v.currentTime); }, []);

  const login = useCallback(() => {
    skippedThisSession = true;
    setDismissed(true);
    onLogin();
  }, [onLogin]);

  if (!visible) return null;

  const shimmer = t >= SHIMMER_FROM || ended;
  const circ = 2 * Math.PI * RING.r;

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 2147483000, background: '#000', overflow: 'hidden' }}>
      {/* stage keeps the video's 9:16 ratio and covers the whole screen */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'max(100vw, calc(100dvh * 9 / 16))', height: 'max(100dvh, calc(100vw * 16 / 9))',
        }}
      >
        <video
          ref={videoRef}
          src={INTRO_VIDEO_SRC}
          autoPlay
          muted
          controls={false}
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          onTimeUpdate={onTime}
          onEnded={() => { setEnded(true); setT(999); }}
          onError={() => { console.error('Intro video failed to load - check that', INTRO_VIDEO_SRC, 'exists in /public'); setDismissed(true); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
        />

        {/* flicker / flash on the video */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', animation: 'stIntroFlash 3.4s steps(1, end) infinite', background: 'radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.55), rgba(0,188,212,0.18) 55%, transparent 80%)' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', animation: 'stIntroSweep 5s ease-in-out infinite', background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)' }} />

        {/* light running around the logo ring at the end of the video */}
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: shimmer ? 1 : 0, transition: 'opacity .5s' }}>
          <defs>
            <filter id="stIntroGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g style={{ transformOrigin: `${RING.cx}px ${RING.cy}px`, animation: shimmer ? 'stIntroSpin 2.2s linear infinite' : 'none' }}>
            <circle cx={RING.cx} cy={RING.cy} r={RING.r} fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${circ * 0.1} ${circ * 0.9}`} filter="url(#stIntroGlow)" />
            <circle cx={RING.cx} cy={RING.cy} r={RING.r} fill="none" stroke="#7df3ff" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${circ * 0.22} ${circ * 0.78}`} strokeDashoffset={circ * 0.04} opacity="0.55" filter="url(#stIntroGlow)" />
          </g>
        </svg>
      </div>

      {/* Log In: there from the first second, at the bottom (ends up under STOOORNA) */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 22px max(26px, calc(env(safe-area-inset-bottom) + 16px))', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={login}
          aria-label="Log In"
          style={{
            width: '100%', maxWidth: 360, height: 50, borderRadius: 10, cursor: 'pointer',
            border: `1.5px solid ${TEAL}`, background: 'rgba(0,188,212,0.12)', color: '#fff',
            fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', backdropFilter: 'blur(6px)',
            boxShadow: '0 0 18px rgba(0,188,212,0.35)',
          }}
        >
          Log In
        </button>
      </div>

      <style>{`
        video::-webkit-media-controls, video::-webkit-media-controls-start-playback-button, video::-webkit-media-controls-overlay-play-button, video::-webkit-media-controls-panel { display: none !important; opacity: 0 !important; -webkit-appearance: none; }
        @keyframes stIntroFlash { 0%{opacity:0} 6%{opacity:.55} 8%{opacity:0} 31%{opacity:.3} 33%{opacity:0} 62%{opacity:.6} 64%{opacity:.1} 66%{opacity:0} 88%{opacity:.35} 90%{opacity:0} 100%{opacity:0} }
        @keyframes stIntroSweep { 0%{transform:translateX(-80%)} 60%,100%{transform:translateX(80%)} }
        @keyframes stIntroSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body,
  );
}
