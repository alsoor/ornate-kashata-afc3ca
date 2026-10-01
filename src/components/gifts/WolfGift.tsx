/**
 * Wolf gift - 1,500 Coins  (real wolf video)
 *
 * - Preview  : a small looping clip of the real wolf howling, inside the gift square (before tapping).
 * - Animation: the real wolf video plays on top of the live room, with its real howl sound,
 *              fades in smoothly, and fades out at the end so the live room comes back.
 *
 * Standalone file: put it in src/components/gifts/ next to HeartGift.tsx and WitchGift.tsx.
 * The 3 media files go in the PUBLIC folder of the project (not in src):
 *     public/gifts/wolf/wolf.mp4          (the gift video, with sound)
 *     public/gifts/wolf/wolf-preview.mp4  (small silent loop for the gift square)
 *     public/gifts/wolf/wolf-poster.jpg   (still image shown until the preview loads)
 * Tune the numbers below (price / fade / paths).
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GiftDefinition } from '../../lib/types';

// ── Gift settings ────────────────────────────────────────────────────────
const PRICE = 1500;
const TOTAL_MS = 11800;        // a little longer than the video (11.75s); the video ending also closes the gift
const FADE_IN_S = 0.6;         // fade in at the start
const FADE_OUT_S = 1.0;        // fade out before the end
const BACKDROP = 0.55;         // darkness behind the video on wide screens (0..1)
const VIDEO_URL = '/gifts/wolf/wolf.mp4';
const PREVIEW_URL = '/gifts/wolf/wolf-preview.mp4';
const POSTER_URL = '/gifts/wolf/wolf-poster.jpg';
const VIDEO_ASPECT = 480 / 848;  // width / height of the video
const VOLUME = 1;              // 0..1

const CYAN = '#22d3ee';

// ── Preview inside the gift square: the real wolf howling, looping ──────────
function WolfPreview({ size = 72 }: { size?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const s = Math.round(size * 1.2);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    void v.play().catch(() => { /* the poster stays visible */ });
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', width: s, height: s, borderRadius: 16, overflow: 'hidden',
        boxShadow: `0 0 0 1.5px ${CYAN}, 0 0 12px rgba(34,211,238,0.55)`,
        background: '#0b1418',
      }}
    >
      <video
        ref={ref}
        src={PREVIEW_URL}
        poster={POSTER_URL}
        muted loop autoPlay playsInline preload="auto"
        disablePictureInPicture
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ── Full-screen animation: the real video on top of the live room ──────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function WolfAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const wrapRef = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);

  // phone-like screens: the video fills the whole screen. Wide screens: centered, soft edges.
  const [geo] = useState(() => {
    const W = typeof window !== 'undefined' ? window.innerWidth : 360;
    const H = typeof window !== 'undefined' ? window.innerHeight : 640;
    const wide = W / H > VIDEO_ASPECT * 1.18;
    return { W, H, wide, boxW: Math.round(Math.min(W, H * VIDEO_ASPECT)) };
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const v = vidRef.current;
    if (!wrap || !v) return;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      doneRef.current();
    };

    v.volume = VOLUME;
    v.muted = false;
    v.currentTime = 0;
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      // browsers can block sound without a recent tap: play it silent instead of failing
      p.catch(() => {
        v.muted = true;
        void v.play().catch(() => finish());
      });
    }

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const wall = (now - t0) / 1000;
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : TOTAL_MS / 1000;
      const cur = v.currentTime > 0 ? v.currentTime : wall;
      const a = clamp01(cur / FADE_IN_S) * clamp01((dur - cur) / FADE_OUT_S);
      wrap.style.opacity = String(a);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    v.addEventListener('ended', finish);
    v.addEventListener('error', finish);
    const tDone = window.setTimeout(finish, TOTAL_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      v.removeEventListener('ended', finish);
      v.removeEventListener('error', finish);
      try { v.pause(); } catch { /* ignore */ }
    };
  }, []);

  const feather = '8%';
  const mask = geo.wide
    ? `linear-gradient(to right, transparent, #000 ${feather}, #000 calc(100% - ${feather}), transparent), linear-gradient(to bottom, transparent, #000 5%, #000 95%, transparent)`
    : undefined;

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      ref={wrapRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden', opacity: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: geo.wide ? `rgba(1,6,10,${BACKDROP})` : 'transparent',
      }}
    >
      <video
        ref={vidRef}
        src={VIDEO_URL}
        playsInline preload="auto"
        disablePictureInPicture
        style={{
          width: geo.wide ? geo.boxW : '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskComposite: 'source-in',
          maskComposite: 'intersect',
        }}
      />
    </div>
  );
}

export const WolfGift: GiftDefinition = {
  id: 'wolf',
  name: 'Wolf',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: WolfPreview,
  Animation: WolfAnimation,
};

export default WolfGift;
