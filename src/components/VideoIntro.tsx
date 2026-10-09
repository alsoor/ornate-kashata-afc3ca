import { useCallback, useEffect, useRef, useState } from 'react';

/** Put the video at /public/intro.mp4 */
export const INTRO_VIDEO_SRC = '/intro.mp4';
const SEEN_KEY = 'stooorna_intro_seen';
const TEAL = '#00BCD4';

// Video is 720x1280. Logo ring in the last frame: centre (50%, 49.7%), ring radius ~11.4% of width.
const VW = 720;
const VH = 1280;
const RING = { cx: 360, cy: 636, r: 82 };
const SHIMMER_FROM = 15.6; // the logo starts to appear here (seconds)

/** true only for a guest who never saw the intro. Call with the auth state. */
export function shouldShowVideoIntro(isLoggedIn: boolean): boolean {
  if (isLoggedIn) return false;
  try { return localStorage.getItem(SEEN_KEY) !== '1'; } catch { return true; }
}
export function markVideoIntroSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

/** The real app screenshots, put them in /public/intro/shot1..8.jpg */
export const INTRO_SHOTS = Array.from({ length: 8 }, (_, i) => `/intro/shot${i + 1}.jpg`);

/** Faint, moving "app page" ghosts blended into the video, like a hidden animated background. */
function GhostPages() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', mixBlendMode: 'screen' }}>
      {INTRO_SHOTS.map((src, i) => {
        const lane = i % 3;                         // 3 lanes across the screen
        const left = 2 + lane * 33 + (i % 2) * 2;
        const dur = 16 + (i % 4) * 3;               // different speeds
        return (
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            style={{
              position: 'absolute', left: `${left}%`, top: '100%', width: '29%', height: 'auto',
              borderRadius: 16, filter: 'blur(1.2px) saturate(0.85)',
              border: '1px solid rgba(0,188,212,0.28)',
              animation: `stIntroFloat${i % 2} ${dur}s linear ${-(i * 2.3)}s infinite`,
              opacity: 0.18,
            }}
          />
        );
      })}
    </div>
  );
}

export default function VideoIntro({ onLogin, onDone }: { onLogin: () => void; onDone?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [ended, setEnded] = useState(false);

  // Plays by itself, no play button, no controls. Starts muted (always allowed, so the native play icon never shows),
  // then tries to turn the sound on; if the browser pauses because of that, it goes back to muted and keeps playing.
  useEffect(() => {
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
  }, []);

  const onTime = useCallback(() => { const v = videoRef.current; if (v) setT(v.currentTime); }, []);

  const finish = useCallback(() => {
    markVideoIntroSeen();
    onDone?.();
  }, [onDone]);
  const login = useCallback(() => { finish(); onLogin(); }, [finish, onLogin]);

  const shimmer = t >= SHIMMER_FROM || ended;
  const showButton = true; // Log In is there from the first second, so anyone can skip the video
  const circ = 2 * Math.PI * RING.r;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220000, background: '#000', overflow: 'hidden' }}>
      {/* stage keeps the video's 9:16 ratio and covers the screen, so overlays stay glued to the video */}
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
          disablePictureInPicture
          disableRemotePlayback
          x-webkit-airplay="deny"
          playsInline
          preload="auto"
          onError={() => { setEnded(true); setT(999); }}
          onTimeUpdate={onTime}
          onEnded={() => { setEnded(true); setT(999); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
        />

        <GhostPages />

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

      {/* Log In: visible from the start, at the bottom (ends up under STOOORNA) */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 22px max(26px, calc(env(safe-area-inset-bottom) + 16px))', display: 'flex', justifyContent: 'center', pointerEvents: showButton ? 'auto' : 'none' }}>
        <button
          type="button"
          onClick={login}
          aria-label="Log In"
          style={{
            width: '100%', maxWidth: 360, height: 50, borderRadius: 10, cursor: 'pointer',
            border: `1.5px solid ${TEAL}`, background: 'rgba(0,188,212,0.12)', color: '#fff',
            fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', backdropFilter: 'blur(6px)',
            opacity: showButton ? 1 : 0, transform: showButton ? 'translateY(0)' : 'translateY(14px)',
            transition: 'opacity .6s ease, transform .6s ease', boxShadow: '0 0 18px rgba(0,188,212,0.35)',
          }}
        >
          Log In
        </button>
      </div>

      <style>{`
        @keyframes stIntroFloat0 { from { transform: translateY(0) rotate(-3deg); } to { transform: translateY(-190%) rotate(2deg); } }
        @keyframes stIntroFloat1 { from { transform: translateY(0) rotate(3deg); } to { transform: translateY(-190%) rotate(-2deg); } }
        @keyframes stIntroFlash { 0%{opacity:0} 6%{opacity:.55} 8%{opacity:0} 31%{opacity:.3} 33%{opacity:0} 62%{opacity:.6} 64%{opacity:.1} 66%{opacity:0} 88%{opacity:.35} 90%{opacity:0} 100%{opacity:0} }
        @keyframes stIntroSweep { 0%{transform:translateX(-80%)} 60%,100%{transform:translateX(80%)} }
        video::-webkit-media-controls, video::-webkit-media-controls-start-playback-button, video::-webkit-media-controls-overlay-play-button, video::-webkit-media-controls-panel { display: none !important; opacity: 0 !important; -webkit-appearance: none; }
        @keyframes stIntroSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
