import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** The video lives in  /public/intro.mp4 */
export const INTRO_VIDEO_SRC = '/intro.mp4';

/** Once a person logs in or creates an account, this flag is set for good and the intro never shows again on this device. */
const REGISTERED_KEY = 'stooorna_intro_registered';
let skippedThisSession = false; // intro already played / skipped: don't bring it back while the app stays open
let pressedLogin = false;       // the visitor pressed the "Log in" button

// Video is 720x1280. Logo ring in the last frame: centre (50%, 49.7%), ring radius ~11.4% of width.
const VW = 720;
const VH = 1280;
const RING = { cx: 360, cy: 636, r: 82 };
const SHIMMER_FROM = 15.6; // the logo starts to appear here (seconds)
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // 1px transparent poster

function wasRegistered(): boolean {
  try { return localStorage.getItem(REGISTERED_KEY) === '1'; } catch { return false; }
}
/** Call this after a successful login or sign-up (done automatically when isLoggedIn becomes true). */
export function markIntroRegistered() {
  try { localStorage.setItem(REGISTERED_KEY, '1'); } catch { /* ignore */ }
}

type Particle = { x: number; y: number; sx: number; sy: number; vx: number; vy: number; rot: number; vr: number; delay: number; life: number };

/**
 * Full-screen welcome video for visitors who never registered, on top of every page.
 *   <VideoIntro isLoggedIn={!!user} authLoading={authLoading} onLogin={() => openAuthPage()} />
 * - starts with a vortex spin of the picture, then plays by itself (no play button / controls)
 * - red "Log in" banner at the bottom: skips the video
 * - when the video ends (or Log in is pressed) the picture crumbles into pieces that fly away and the sign-in page opens
 * - after a login / account creation it is switched off for good
 */
export default function VideoIntro({ isLoggedIn, authLoading = false, onLogin }: { isLoggedIn: boolean; authLoading?: boolean; onLogin: () => void }) {
  const [dismissed, setDismissed] = useState(() => skippedThisSession);
  const [phase, setPhase] = useState<'play' | 'shatter'>('play');
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef<HTMLCanvasElement | null>(null);
  const [t, setT] = useState(0);
  const [ended, setEnded] = useState(false);

  // any login / account creation switches the intro off permanently
  useEffect(() => { if (isLoggedIn) markIntroRegistered(); }, [isLoggedIn]);
  // the guest page disappears after "Log in" was pressed -> they went on to log in / sign up
  useEffect(() => () => { if (pressedLogin) markIntroRegistered(); }, []);

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
    const retry = () => { if (v.paused && !v.ended && phase === 'play') void playMuted(); };
    const wake = () => {
      if (v.muted) v.muted = false;
      if (v.paused && !v.ended && phase === 'play') v.play().catch(() => {});
    };
    v.addEventListener('canplay', retry);
    window.addEventListener('pointerdown', wake, { once: true });
    // if the video can never start, don't leave a black screen
    const giveUp = window.setTimeout(() => { if (v.paused && v.currentTime === 0) { skippedThisSession = true; setDismissed(true); } }, 5000);
    return () => { window.clearTimeout(giveUp); v.removeEventListener('canplay', retry); window.removeEventListener('pointerdown', wake); };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTime = useCallback(() => { const v = videoRef.current; if (v) setT(v.currentTime); }, []);

  /** crumble the current picture into pieces, open the sign-in page underneath */
  const shatter = useCallback((byButton: boolean) => {
    if (phase !== 'play') return;
    skippedThisSession = true;
    if (byButton) pressedLogin = true;
    const v = videoRef.current;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    try {
      if (!v) throw new Error('no video');
      v.pause();
      const snap = document.createElement('canvas');
      snap.width = Math.round(W * dpr); snap.height = Math.round(H * dpr);
      const sctx = snap.getContext('2d')!;
      const sw = Math.max(W, H * 9 / 16), sh = Math.max(H, W * 16 / 9);
      sctx.drawImage(v, ((W - sw) / 2) * dpr, ((H - sh) / 2) * dpr, sw * dpr, sh * dpr);
      snapRef.current = snap;
      setPhase('shatter');
    } catch {
      setDismissed(true);
    }
    onLogin();
  }, [phase, onLogin]);

  // the crumble animation
  useEffect(() => {
    if (phase !== 'shatter') return;
    const cv = canvasRef.current, snap = snapRef.current;
    if (!cv || !snap) { setDismissed(true); return; }
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = snap.width / W;
    cv.width = snap.width; cv.height = snap.height;
    const ctx = cv.getContext('2d')!;
    const T = 16; // piece size (css px)
    const cx = W / 2, cy = H * 0.5;
    const maxD = Math.hypot(W, H) / 2;
    const parts: Particle[] = [];
    for (let y = 0; y < H; y += T) {
      for (let x = 0; x < W; x += T) {
        const px = x + T / 2, py = y + T / 2;
        const d = Math.hypot(px - cx, py - cy);
        const ang = Math.atan2(py - cy, px - cx) + (Math.random() - 0.5) * 0.9;
        const sp = 90 + Math.random() * 380;
        parts.push({
          x: px, y: py, sx: x, sy: y,
          vx: Math.cos(ang) * sp + 60, vy: Math.sin(ang) * sp - 140 - Math.random() * 160,
          rot: 0, vr: (Math.random() - 0.5) * 12,
          delay: (d / maxD) * 0.35 + Math.random() * 0.25, life: 0.9 + Math.random() * 0.7,
        });
      }
    }
    let raf = 0; const t0 = performance.now(); let done = false;
    const frame = (now: number) => {
      const el = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        const k = el - p.delay;
        if (k < 0) {
          ctx.drawImage(snap, p.sx * dpr, p.sy * dpr, T * dpr, T * dpr, p.sx, p.sy, T, T); // not moving yet: seamless picture
          alive++; continue;
        }
        if (k > p.life) continue;
        alive++;
        const f = k / p.life;
        ctx.save();
        ctx.globalAlpha = 1 - f * f;
        ctx.translate(p.x + p.vx * k, p.y + p.vy * k + 260 * k * k);
        ctx.rotate(p.vr * k);
        const s = 1 - 0.55 * f;
        ctx.drawImage(snap, p.sx * dpr, p.sy * dpr, T * dpr, T * dpr, (-T / 2) * s, (-T / 2) * s, T * s, T * s);
        ctx.restore();
      }
      if (alive > 0 && !done) raf = requestAnimationFrame(frame);
      else { done = true; setDismissed(true); }
    };
    raf = requestAnimationFrame(frame);
    return () => { done = true; cancelAnimationFrame(raf); };
  }, [phase]);

  if (!visible) return null;

  const shimmer = (t >= SHIMMER_FROM || ended) && phase === 'play';
  const circ = 2 * Math.PI * RING.r;

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 2147483000, background: phase === 'play' ? '#000' : 'transparent', overflow: 'hidden' }}>
      {phase === 'shatter' ? (
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      ) : (
        <>
          {/* stage keeps the video's 9:16 ratio and covers the whole screen */}
          <div
            style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              width: 'max(100vw, calc(100dvh * 9 / 16))', height: 'max(100dvh, calc(100vw * 16 / 9))',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, opacity: playing ? undefined : 0, animation: playing ? 'stIntroVortex 1.5s cubic-bezier(.16,.8,.3,1) both' : 'none' }}>
              <video
                ref={videoRef}
                src={INTRO_VIDEO_SRC}
                poster={BLANK}
                autoPlay
                muted
                controls={false}
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                {...({ controlsList: 'nodownload nofullscreen noremoteplayback' } as Record<string, string>)}
                onPlaying={() => setPlaying(true)}
                onTimeUpdate={onTime}
                onEnded={() => { setEnded(true); setT(999); shatter(false); }}
                onError={() => { console.error('Intro video failed to load - check that', INTRO_VIDEO_SRC, 'exists in /public'); skippedThisSession = true; setDismissed(true); }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', background: '#000' }}
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
          </div>

          {/* red "Log in" banner: there from the start, at the bottom (ends up under STOOORNA) */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 22px max(26px, calc(env(safe-area-inset-bottom) + 16px))', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => shatter(true)}
              aria-label="Log in"
              style={{
                width: 210, height: 44, borderRadius: 6, cursor: 'pointer', border: 'none',
                background: '#ef4444', color: '#ffffff', fontSize: 15, fontWeight: 800, letterSpacing: '0.03em',
                boxShadow: '0 4px 14px rgba(239,68,68,0.45)',
              }}
            >
              Log in
            </button>
          </div>
        </>
      )}

      <style>{`
        video::-webkit-media-controls, video::-webkit-media-controls-start-playback-button, video::-webkit-media-controls-overlay-play-button, video::-webkit-media-controls-panel { display: none !important; opacity: 0 !important; -webkit-appearance: none; }
        @keyframes stIntroVortex { 0% { transform: rotate(-900deg) scale(0.04); filter: blur(14px) brightness(2); opacity: 0; } 55% { opacity: 1; } 100% { transform: rotate(0deg) scale(1); filter: blur(0) brightness(1); opacity: 1; } }
        @keyframes stIntroFlash { 0%{opacity:0} 6%{opacity:.55} 8%{opacity:0} 31%{opacity:.3} 33%{opacity:0} 62%{opacity:.6} 64%{opacity:.1} 66%{opacity:0} 88%{opacity:.35} 90%{opacity:0} 100%{opacity:0} }
        @keyframes stIntroSweep { 0%{transform:translateX(-80%)} 60%,100%{transform:translateX(80%)} }
        @keyframes stIntroSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body,
  );
}
