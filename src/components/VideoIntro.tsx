import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { type StoreLinks, introKind, lastFetchStatus, readStoreLinks, fetchStoreLinks, openAppUrl, openStoreUrl, STORE_LINKS_EVENT } from '@/lib/storeLinks';

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
  const [ready, setReady] = useState(false);   // first picture of the video is loaded -> start the circular opening
  const [opened, setOpened] = useState(false);   // opening finished -> the video starts playing
  const [shown, setShown] = useState(false);     // the video is really playing -> swap the still picture for the video
  const stillRef = useRef<HTMLCanvasElement | null>(null);

  /** paint the first picture of the video on a canvas: the opening animation uses this still, so the (paused) video itself is never visible */
  const grabStill = useCallback(() => {
    const v = videoRef.current, c = stillRef.current;
    if (!v || !c || !v.videoWidth) return;
    try {
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    } catch { /* ignore */ }
    setReady(true);
  }, []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef<HTMLCanvasElement | null>(null);
  const [t, setT] = useState(0);
  const [ended, setEnded] = useState(false);

  // any login / account creation switches the intro off permanently
  useEffect(() => { if (isLoggedIn) markIntroRegistered(); }, [isLoggedIn]);
  // the guest page disappears after "Log in" was pressed -> they went on to log in / sign up
  useEffect(() => () => { if (pressedLogin) markIntroRegistered(); }, []);

  // owner settings (store links, master on/off switch, custom video) -> same endpoint for everybody
  const [storeLinks, setStoreLinks] = useState<StoreLinks>(() => readStoreLinks());
  const [linksLoaded, setLinksLoaded] = useState(false); // wait for the server answer so a hidden intro never flashes
  const visible = !authLoading && !isLoggedIn && !dismissed && !wasRegistered() && linksLoaded && storeLinks.showIntro && !(storeLinks.hideBuiltin && !storeLinks.videoUrl);
  const videoSrc = storeLinks.videoUrl || INTRO_VIDEO_SRC;

  // COVER: a first-time visitor must never see the page behind. While the login state / owner settings are still loading, keep the screen black.
  const [coverGaveUp, setCoverGaveUp] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setCoverGaveUp(true), 6000); return () => window.clearTimeout(id); }, []);
  const covering = !isLoggedIn && !dismissed && !wasRegistered() && (authLoading || !linksLoaded) && !coverGaveUp;
  // the black layer that came inside the HTML is removed as soon as this component takes over (or decides there is no welcome screen)
  useEffect(() => {
    if (!covering) { try { document.getElementById('st-intro-cover')?.remove(); } catch { /* ignore */ } }
  }, [covering]);
  const kind = introKind(videoSrc); // 'video' (default) | 'image' | 'pdf' -> whatever the owner uploaded
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pdfSnapRef = useRef<(ctx: CanvasRenderingContext2D, dpr: number) => void>(() => {}); // the PDF view paints what is on screen into the crumble picture
  // an image / PDF has no first frame to wait for: start the opening as soon as the screen is up
  useEffect(() => { if (visible && kind === 'pdf') setReady(true); }, [visible, kind]);
  // a photo that is already cached never fires onLoad again -> check it by hand; and if the opening animation event never arrives, start anyway
  useEffect(() => {
    if (!visible || kind !== 'image') return;
    const im = imgRef.current;
    if (im && im.complete && im.naturalWidth > 0) setReady(true);
  }, [visible, kind]);
  useEffect(() => {
    if (!visible || kind !== 'image' || !ready || opened) return;
    const id = window.setTimeout(() => { if (!opened) startPlayRef.current(); }, 2300);
    return () => window.clearTimeout(id);
  }, [visible, kind, ready, opened]);

  // SOUND: browsers refuse sound before the first touch, so the video starts muted by itself and the sound is switched on by the first
  // touch / key press anywhere (nothing to tap, no button).
  useEffect(() => {
    if (!visible || kind !== 'video') return;
    const unlock = () => {
      const v = videoRef.current;
      if (!v || v.paused || v.ended) return;
      if (v.muted) { v.muted = false; v.volume = 1; }
      if (v.paused) { v.muted = true; v.play().catch(() => {}); } // never leave the video stopped
    };
    const evs = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'] as const;
    evs.forEach(e => window.addEventListener(e, unlock, true));
    return () => evs.forEach(e => window.removeEventListener(e, unlock, true));
  }, [visible, kind]);

  const [dbg, setDbg] = useState('');
  // AUTOPLAY GUARANTEE: if the opening animation event never arrives, or the browser pauses the video, start / restart it by itself
  useEffect(() => {
    if (!visible || kind !== 'video' || !ready) return;
    const fallback = window.setTimeout(() => { if (!opened) startPlayRef.current(); }, 2300);
    const debug = /[?&]introdebug/.test(location.search);
    let ticks = 0;
    const watch = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !opened || phase !== 'play') return;
      if (v.paused && !v.ended) { v.muted = true; v.play().catch(() => {}); }
      // SOUND PROBE: a silent, side-effect-free test sound. The moment the browser lets a sound start by itself, the video's sound is switched on
      // (no touch needed). While it still refuses, the video just keeps playing muted and nothing is paused.
      if (v.muted && !v.paused && ticks < 120) {
        ticks++;
        try {
          const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=');
          a.volume = 0.01;
          const pr = a.play();
          if (pr && typeof pr.then === 'function') pr.then(() => { a.pause(); if (videoRef.current && videoRef.current.muted) { videoRef.current.muted = false; videoRef.current.volume = 1; } }).catch(() => { /* still blocked */ });
        } catch { /* ignore */ }
      }
      if (debug) {
        const ua: any = (navigator as any).userActivation;
        setDbg(`video muted:${v.muted} paused:${v.paused} vol:${v.volume} | touched:${ua ? ua.hasBeenActive : 'n/a'}`);
      }
    }, 500);
    return () => { window.clearTimeout(fallback); window.clearInterval(watch); };
  }, [visible, kind, ready, opened, phase]);

  useEffect(() => {
    if (isLoggedIn || dismissed || wasRegistered()) return;
    let live = true;
    const hardStop = window.setTimeout(() => { if (live) setLinksLoaded(true); }, 2500); // slow server: use the local copy
    void fetchStoreLinks().then(l => { if (live) { setStoreLinks(l); setLinksLoaded(true); } });
    const onLinks = () => setStoreLinks(readStoreLinks());
    window.addEventListener(STORE_LINKS_EVENT, onLinks);
    return () => { live = false; window.clearTimeout(hardStop); window.removeEventListener(STORE_LINKS_EVENT, onLinks); };
  }, [isLoggedIn, dismissed]);

  // setup: silent, no controls. The video waits (showing its first picture) while the circular opening runs.
  useEffect(() => {
    if (!visible) return;
    const v = videoRef.current;
    if (!v) return;
    v.controls = false;
    v.muted = true;
    if (v.readyState >= 2) grabStill();
    // if the video can never load/start, don't leave a black screen
    const giveUp = window.setTimeout(() => { if (v.paused && v.currentTime === 0) { skippedThisSession = true; setDismissed(true); } }, 9000);
    return () => window.clearTimeout(giveUp);
  }, [visible, grabStill]);

  /** called when the opening finishes: plays by itself (muted = always allowed), then tries to turn the sound on */
  const startPlay = useCallback(() => {
    setOpened(true);
    const v = videoRef.current;
    if (!v) return;
    const playMuted = () => { v.muted = true; return v.play().catch(() => {}); };
    // 1) try WITH sound straight away (works whenever the browser allows autoplay with sound for this visitor / site)
    v.muted = false;
    v.volume = 1;
    v.play().catch(() => {
      // 2) the browser said no: start muted so the video still moves by itself; the first touch anywhere then turns the sound on
      void playMuted();
    });
    v.addEventListener('canplay', () => { if (v.paused && !v.ended) void playMuted(); });
  }, []);
  const startPlayRef = useRef<() => void>(() => {});
  startPlayRef.current = startPlay;

  const onTime = useCallback(() => { const v = videoRef.current; if (v) setT(v.currentTime); }, []);

  /** crumble the current picture into pieces, open the sign-in page underneath */
  const shatter = useCallback((byButton: boolean) => {
    if (phase !== 'play') return;
    skippedThisSession = true;
    if (byButton) pressedLogin = true;
    const v: HTMLVideoElement | HTMLImageElement | null = kind === 'image' ? imgRef.current : videoRef.current;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    try {
      if (!v && kind !== 'pdf') throw new Error('nothing to crumble');
      if (v instanceof HTMLVideoElement) v.pause();
      const snap = document.createElement('canvas');
      snap.width = Math.round(W * dpr); snap.height = Math.round(H * dpr);
      const sctx = snap.getContext('2d')!;
      if (kind === 'pdf' || !v) {
        sctx.fillStyle = PDF_BG; sctx.fillRect(0, 0, snap.width, snap.height);
        pdfSnapRef.current(sctx, dpr);
        snapRef.current = snap;
        setPhase('shatter');
        onLogin();
        return;
      }
      const bw = Math.max(W, H * 9 / 16), bh = Math.max(H, W * 16 / 9); // the 9:16 stage that covers the screen
      const iw = v instanceof HTMLVideoElement ? v.videoWidth : v.naturalWidth, ih = v instanceof HTMLVideoElement ? v.videoHeight : v.naturalHeight;
      const kk = iw && ih ? Math.max(bw / iw, bh / ih) : 1;
      const sw = iw && ih ? iw * kk : bw, sh = iw && ih ? ih * kk : bh;
      sctx.drawImage(v, ((W - sw) / 2) * dpr, ((H - sh) / 2) * dpr, sw * dpr, sh * dpr);
      snapRef.current = snap;
      setPhase('shatter');
    } catch {
      setDismissed(true);
    }
    onLogin();
  }, [phase, onLogin, kind]);

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

  if (!visible) {
    if (covering && typeof document !== 'undefined') {
      return createPortal(
        <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 2147483000, background: '#000' }} />,
        document.body,
      );
    }
    return null;
  }

  const openUrl = openAppUrl(storeLinks);
  const shimmer = kind === 'video' && !storeLinks.videoUrl && (t >= SHIMMER_FROM || ended) && phase === 'play';
  const circ = 2 * Math.PI * RING.r;
  const stW = Math.max(window.innerWidth, window.innerHeight * 9 / 16), stH = Math.max(window.innerHeight, window.innerWidth * 16 / 9);
  const ringD = Math.round(0.14 * Math.hypot(stW, stH) / Math.SQRT2); // = the starting circle (7% radius)

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', zIndex: 2147483000, background: phase === 'play' ? '#000' : 'transparent', overflow: 'hidden' }}>
      {phase === 'shatter' ? (
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      ) : (
        <>
          {/* stage keeps the video's 9:16 ratio and covers the whole screen (video + photo: same circular spinning opening) */}
          <div
            style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              width: kind === 'pdf' ? '100vw' : 'max(100vw, calc(100dvh * 9 / 16))', height: kind === 'pdf' ? '100dvh' : 'max(100dvh, calc(100vw * 16 / 9))',
            }}
          >
            {/* liquid "melting" distortion that settles while the circle opens (removed once the video plays) */}
            {ready && !opened && (
              <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
                <filter id="stIntroMelt" x="-10%" y="-10%" width="120%" height="120%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.008 0.016" numOctaves="2" seed="4" result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="160" xChannelSelector="R" yChannelSelector="G">
                    <animate attributeName="scale" values="160;110;50;0" keyTimes="0;0.35;0.75;1" dur="1.7s" fill="freeze" />
                  </feDisplacementMap>
                </filter>
              </svg>
            )}
            <div
              style={{
                position: 'absolute', inset: 0, opacity: ready ? undefined : 0, overflow: 'hidden',
                animation: ready && !opened ? 'stIntroClip 1.7s cubic-bezier(.22,.75,.2,1) both' : 'none',
              }}
            >
            <div
              onAnimationEnd={e => { if (e.target === e.currentTarget && !opened) startPlay(); }}
              style={{
                position: 'absolute', inset: 0,
                animation: ready && !opened ? 'stIntroTurn 1.7s cubic-bezier(.22,.75,.2,1) both' : 'none',
                filter: ready && !opened ? 'url(#stIntroMelt)' : 'none',
              }}
            >
              {kind === 'image' && (
                <img
                  ref={imgRef}
                  src={videoSrc}
                  alt=""
                  draggable={false}
                  onLoad={() => setReady(true)}
                  onError={() => { skippedThisSession = true; setDismissed(true); }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', background: '#000' }}
                />
              )}
              {kind === 'pdf' && <PdfView src={videoSrc} hasOpen={!!openUrl} snapRef={pdfSnapRef} />}
              {kind === 'video' && (<>
              <video
                ref={videoRef}
                src={videoSrc}
                muted
                controls={false}
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                {...({ controlsList: 'nodownload nofullscreen noremoteplayback' } as Record<string, string>)}
                onLoadedData={grabStill}
                onPlaying={() => setShown(true)}
                onTimeUpdate={onTime}
                onEnded={() => { setEnded(true); setT(999); shatter(false); }}
                onError={() => { console.error('Intro video failed to load - check that', videoSrc, 'exists in /public'); skippedThisSession = true; setDismissed(true); }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', background: '#000', opacity: shown ? 1 : 0 }}
              />
              {/* still of the first picture (shown instead of the paused video, so no grey play icon can ever appear) */}
              <canvas ref={stillRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: shown ? 'none' : 'block', pointerEvents: 'none', background: '#000' }} />
              </>)}

              {/* flicker / flash on the video */}
              {kind !== 'pdf' && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', animation: 'stIntroFlash 3.4s steps(1, end) infinite', background: 'radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.55), rgba(0,188,212,0.18) 55%, transparent 80%)' }} />}
              {kind !== 'pdf' && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', animation: 'stIntroSweep 5s ease-in-out infinite', background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)' }} />}

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
          </div>

          {/* glowing rim that grows with the circle */}
          {ready && !opened && (
            <div aria-hidden="true" style={{
              position: 'absolute', left: '50%', top: '50%', width: ringD, height: ringD, borderRadius: '50%', pointerEvents: 'none',
              border: '3px solid #7df3ff', boxShadow: '0 0 24px 6px rgba(0,188,212,0.7), inset 0 0 24px 4px rgba(0,188,212,0.5)',
              animation: 'stIntroRim 1.7s cubic-bezier(.22,.75,.2,1) both',
            }} />
          )}

          {/* open the site as  stooorna.com/?introdebug=1  to see why the "Open App" banner is not showing */}
          {typeof location !== 'undefined' && /[?&]introdebug/.test(location.search) && (
            <div dir="ltr" style={{ position: 'absolute', top: 'max(8px, env(safe-area-inset-top))', left: 8, right: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.75)', color: '#7df3ff', fontSize: 11, lineHeight: 1.4, zIndex: 5, pointerEvents: 'none', wordBreak: 'break-all' }}>
              server: {lastFetchStatus} | appStore: {storeLinks.appStore ? 'yes' : 'NO'} | googlePlay: {storeLinks.googlePlay ? 'yes' : 'NO'} | showBanner: {String(storeLinks.showBanner)} | banner link: {openUrl || 'NONE'} | {dbg}
            </div>
          )}

          {/* white "Open App" banner: smaller, sits right above the red "Log in" banner; opens the owner's App Store / Google Play link */}
          {openUrl && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(max(26px, env(safe-area-inset-bottom) + 16px) + 54px)', padding: '0 22px', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
              <button
                type="button"
                onClick={() => openStoreUrl(openUrl)}
                aria-label="Open App"
                style={{
                  pointerEvents: 'auto', width: 140, height: 34, borderRadius: 6, cursor: 'pointer', border: 'none',
                  background: '#ffffff', color: '#000000', fontSize: 13, fontWeight: 800, letterSpacing: '0.03em',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                }}
              >
                Open App
              </button>
            </div>
          )}

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
        @keyframes stIntroOpen {
          0%   { clip-path: circle(7% at 50% 50%);  transform: rotate(-720deg) scale(0.9); }
          100% { clip-path: circle(75% at 50% 50%); transform: rotate(0deg) scale(1); }
        }
        @keyframes stIntroClip {
          0%   { clip-path: circle(7% at 50% 50%); }
          100% { clip-path: circle(75% at 50% 50%); }
        }
        @keyframes stIntroTurn {
          0%   { transform: rotate(-720deg) scale(0.9); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes stIntroRim {
          0%   { transform: translate(-50%, -50%) scale(1);     opacity: 1; }
          80%  { opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(10.7);  opacity: 0; }
        }
        @keyframes stIntroFlash { 0%{opacity:0} 6%{opacity:.55} 8%{opacity:0} 31%{opacity:.3} 33%{opacity:0} 62%{opacity:.6} 64%{opacity:.1} 66%{opacity:0} 88%{opacity:.35} 90%{opacity:0} 100%{opacity:0} }
        @keyframes stIntroSweep { 0%{transform:translateX(-80%)} 60%,100%{transform:translateX(80%)} }
        @keyframes stIntroSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body,
  );
}


/* ───────────────────────── PDF as a full-screen welcome (same opening / crumble as photo + video) ─────────────────────────
 * no install needed: pdf.js is loaded from cdnjs only when a PDF is the welcome file
 * - opens full screen with the same circular spin as the photo / video, no file name, no "Open" button, no second page
 * - the red Log in banner crumbles it away like the photo / video
 * - zoom bar at the bottom: 100% / 150% / 200% / 300% / 400%
 */
const PDF_ZOOMS = [1, 1.5, 2, 3, 4];
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfJsPromise: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (!pdfJsPromise) {
    pdfJsPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = PDFJS_BASE + 'pdf.min.js';
      sc.onload = () => {
        if (!w.pdfjsLib) { reject(new Error('pdfjs missing')); return; }
        w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
        resolve(w.pdfjsLib);
      };
      sc.onerror = () => { pdfJsPromise = null; reject(new Error('pdfjs load failed')); };
      document.head.appendChild(sc);
    });
  }
  return pdfJsPromise;
}

const PDF_BG = '#1b1b1b';

function PdfView({ src, hasOpen, snapRef }: { src: string; hasOpen: boolean; snapRef: { current: (ctx: CanvasRenderingContext2D, dpr: number) => void } }) {
  const [zi, setZi] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [docReady, setDocReady] = useState(false);
  const [baseW, setBaseW] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<any>(null);
  const firstRender = useRef(true);

  const bottomBase = 'max(26px, env(safe-area-inset-bottom) + 16px)'; // same as the Log in banner
  const bannersH = hasOpen ? 88 : 44;                                   // Log in (+ Open App) banners stay on top of the sheet

  // what is on screen right now -> painted into the picture that crumbles
  snapRef.current = (ctx, dpr) => {
    const host = hostRef.current;
    if (!host) return;
    const H = window.innerHeight;
    Array.from(host.children).forEach(el => {
      const c = el as HTMLCanvasElement;
      if (!c.width || c.width < 4) return;
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H) return;
      try { ctx.drawImage(c, r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr); } catch { /* ignore */ }
    });
  };

  // page width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBaseW(w => { const n = Math.max(0, el.clientWidth - 16); return Math.abs(n - w) > 2 ? n : w; });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // load the document
  useEffect(() => {
    let dead = false; let task: any = null;
    (async () => {
      try {
        const lib: any = await loadPdfJs();
        task = lib.getDocument({ url: src });
        const d = await task.promise;
        if (dead) { try { d.destroy(); } catch { /* ignore */ } return; }
        docRef.current = d;
        setDocReady(true);
      } catch (e) {
        console.error('PDF failed to load', e);
        if (!dead) setStatus('error');
      }
    })();
    return () => { dead = true; try { task && task.destroy(); } catch { /* ignore */ } docRef.current = null; };
  }, [src]);

  // draw the pages (lazy: only the pages near the screen are painted, so a long PDF does not eat the memory)
  useEffect(() => {
    const doc = docRef.current, host = hostRef.current, scroller = scrollRef.current;
    if (!docReady || !doc || !host || !scroller || baseW < 50) return;
    let dead = false;
    const tasks = new Set<any>();
    const cssW = baseW * PDF_ZOOMS[zi];
    const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1)); // sharp text, also when zoomed
    const keep = !firstRender.current; // keep the same spot of the page when the zoom changes
    const cx = scroller.scrollWidth ? (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth : 0.5;
    const cy = scroller.scrollHeight ? (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight : 0;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const c = e.target as any;
        if (e.isIntersecting) c.__draw && c.__draw(); else c.__free && c.__free();
      }
    }, { root: scroller, rootMargin: '120% 0px 120% 0px' });
    (async () => {
      const pages: any[] = [];
      for (let i = 1; i <= doc.numPages; i++) { if (dead) return; pages.push(await doc.getPage(i)); }
      if (dead) return;
      host.replaceChildren();
      host.style.width = cssW + 'px';
      for (const page of pages) {
        const v1 = page.getViewport({ scale: 1 });
        const cssH = cssW * v1.height / v1.width;
        const canvas: any = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        canvas.style.cssText = `display:block;width:${cssW}px;height:${cssH}px;background:#fff;margin:0 0 10px;box-shadow:0 2px 10px rgba(0,0,0,.5)`;
        let rendering = false, drawn = false; let rt: any = null;
        canvas.__draw = () => {
          if (rendering || drawn || dead) return;
          let k = dpr; const maxPx = 16e6; // stays under the phone canvas limit
          if (cssW * k * cssH * k > maxPx) k = Math.sqrt(maxPx / (cssW * cssH));
          const vp = page.getViewport({ scale: (cssW / v1.width) * k });
          canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          rendering = true;
          rt = page.render({ canvasContext: ctx, viewport: vp, intent: 'display' });
          tasks.add(rt);
          const mine = rt;
          mine.promise.then(() => { drawn = true; }).catch(() => { /* cancelled */ }).finally(() => { rendering = false; tasks.delete(mine); });
        };
        canvas.__free = () => {
          if (rendering && rt) { try { rt.cancel(); } catch { /* ignore */ } }
          drawn = false; canvas.width = 1; canvas.height = 1;
        };
        host.appendChild(canvas);
        io.observe(canvas);
      }
      if (keep) {
        scroller.scrollLeft = Math.max(0, cx * scroller.scrollWidth - scroller.clientWidth / 2);
        scroller.scrollTop = Math.max(0, cy * scroller.scrollHeight - scroller.clientHeight / 2);
      }
      firstRender.current = false;
      setStatus('ready');
    })().catch(e => { console.error('PDF render failed', e); if (!dead) setStatus('error'); });
    return () => { dead = true; io.disconnect(); tasks.forEach(t => { try { t.cancel(); } catch { /* ignore */ } }); };
  }, [docReady, baseW, zi]);

  const zbtn: CSSProperties = { width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: '40px', padding: 0 };

  return (
    <div style={{ position: 'absolute', inset: 0, background: PDF_BG, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: `max(8px, env(safe-area-inset-top)) 8px calc(${bottomBase} + ${bannersH + 70}px)` }}
      >
        <div ref={hostRef} style={{ margin: '0 auto' }} />
        {status === 'loading' && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: '45%', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'stIntroSpin 0.9s linear infinite' }} />
          </div>
        )}
        {status === 'error' && (
          <p style={{ color: '#fff', textAlign: 'center', marginTop: 80, fontSize: 14 }}>تعذر عرض الملف</p>
        )}
      </div>
      {status === 'ready' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${bottomBase} + ${bannersH + 10}px)`, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div dir="ltr" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 30, background: 'rgba(0,0,0,0.72)', boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>
            <button type="button" aria-label="Zoom out" disabled={zi === 0} onClick={() => setZi(z => Math.max(0, z - 1))} style={{ ...zbtn, opacity: zi === 0 ? 0.35 : 1 }}>−</button>
            <span style={{ minWidth: 52, textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 800 }}>{Math.round(PDF_ZOOMS[zi] * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zi === PDF_ZOOMS.length - 1} onClick={() => setZi(z => Math.min(PDF_ZOOMS.length - 1, z + 1))} style={{ ...zbtn, opacity: zi === PDF_ZOOMS.length - 1 ? 0.35 : 1 }}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}
