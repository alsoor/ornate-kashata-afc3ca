/**
 * livePhotoPatch — show a PHOTO instead of the live camera (camera-live host / guest only)
 *
 * Standalone patch used by /live-camera. It does not change any existing behaviour:
 *
 *   • Normal tap on the video icon  -> exactly as before (camera on / camera off).
 *   • Long press on the video icon  -> opens the photo library; the chosen photo is published as the
 *     host's video (viewers, the split screen and my own preview all show the photo instead of the camera).
 *   • While a photo is shown, a tap on the icon returns to the live camera (a second tap turns it off as usual).
 *   • Long press again while a photo is shown -> pick another photo.
 *
 * How it works: the photo is drawn on a canvas (photo fitted over a blurred copy of itself), the canvas stream is
 * wrapped in an Agora custom video track and published in place of the camera track. The camera track is unpublished
 * and disabled (camera light off) while the photo is up, and re-enabled / re-published when the photo is closed.
 * The microphone is never touched. If a split screen is running, its second connection is switched too.
 */

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

/* ───────────────────────── photo track ───────────────────────── */

const PHOTO_W = 720;
const PHOTO_H = 1280;
const REDRAW_MS = 100; // keeps frames flowing so viewers never see a frozen / black stream

export type PhotoHandle = { track: any; close: () => void };

async function loadImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => { try { bmp.close?.(); } catch { /* ignore */ } } };
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not read this image'));
    img.src = url;
  });
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

/** Draw the photo "contain" over a blurred "cover" copy of itself (no CSS filter → works on every browser). */
function composeFrame(img: { src: CanvasImageSource; w: number; h: number }): HTMLCanvasElement {
  const base = document.createElement('canvas');
  base.width = PHOTO_W;
  base.height = PHOTO_H;
  const ctx = base.getContext('2d')!;
  ctx.fillStyle = '#060e0e';
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);

  // backdrop: tiny cover render scaled up = soft blur
  const tiny = document.createElement('canvas');
  tiny.width = 18;
  tiny.height = 32;
  const tctx = tiny.getContext('2d')!;
  const cs = Math.max(18 / img.w, 32 / img.h);
  const cw = img.w * cs;
  const ch = img.h * cs;
  tctx.drawImage(img.src, (18 - cw) / 2, (32 - ch) / 2, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tiny, 0, 0, PHOTO_W, PHOTO_H);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);

  // the photo itself, fully visible
  const s = Math.min(PHOTO_W / img.w, PHOTO_H / img.h);
  const dw = img.w * s;
  const dh = img.h * s;
  ctx.drawImage(img.src, (PHOTO_W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh);
  return base;
}

export async function createPhotoTrack(file: File): Promise<PhotoHandle> {
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default as any;
  const img = await loadImage(file);
  let base: HTMLCanvasElement;
  try { base = composeFrame(img); } finally { img.close(); }

  const out = document.createElement('canvas');
  out.width = PHOTO_W;
  out.height = PHOTO_H;
  const octx = out.getContext('2d')!;
  octx.drawImage(base, 0, 0);
  const stream: MediaStream | undefined = (out as any).captureStream?.(10);
  const ms = stream?.getVideoTracks?.()[0];
  if (!ms) throw new Error('Photo mode is not supported on this device');

  const iv = window.setInterval(() => { try { octx.drawImage(base, 0, 0); } catch { /* ignore */ } }, REDRAW_MS);
  const track = AgoraRTC.createCustomVideoTrack({
    mediaStreamTrack: ms,
    optimizationMode: 'detail',
    encoderConfig: { width: PHOTO_W, height: PHOTO_H, frameRate: 10, bitrateMin: 300, bitrateMax: 1200 },
  });
  const close = () => {
    window.clearInterval(iv);
    try { track.stop(); } catch { /* ignore */ }
    try { track.close(); } catch { /* ignore */ }
    try { ms.stop(); } catch { /* ignore */ }
  };
  return { track, close };
}

/* ───────────────────────── hook ───────────────────────── */

export type UseLivePhotoOpts = {
  /** holds the active photo (so playLocalVideo / the split accept can read it) */
  photoRef: React.MutableRefObject<PhotoHandle | null>;
  getCam: () => any;
  getClient: () => any;
  getSplit: () => { replaceCam: (cam: any) => Promise<void> } | null;
  /** the picture on my screen changed -> mark video as on and (re)play it in my pane */
  onVideoShown: () => void;
  onError: (msg: string) => void;
};

export function useLivePhoto(opts: UseLivePhotoOpts) {
  const [photoOn, setPhotoOn] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const busyRef = React.useRef(false);
  const o = React.useRef(opts);
  o.current = opts;

  const openPicker = React.useCallback(() => {
    try { inputRef.current?.click(); } catch { /* ignore */ }
  }, []);

  /** Back to the live camera (re-enable + re-publish the camera track). */
  const stopPhoto = React.useCallback(async () => {
    const cur = o.current.photoRef.current;
    if (!cur || busyRef.current) return;
    busyRef.current = true;
    try {
      const client = o.current.getClient();
      o.current.photoRef.current = null;
      setPhotoOn(false);
      try { await client?.unpublish?.([cur.track]); } catch { /* ignore */ }
      cur.close();
      const cam = o.current.getCam();
      if (cam) {
        try { await cam.setEnabled(true); } catch { /* ignore */ }
        try { await client?.publish?.([cam]); } catch { /* already published */ }
        try { await o.current.getSplit()?.replaceCam(cam); } catch { /* ignore */ }
      }
      o.current.onVideoShown();
    } finally {
      busyRef.current = false;
    }
  }, []);

  /** Show this photo instead of the camera (also used to swap one photo for another). */
  const startPhoto = React.useCallback(async (file: File) => {
    if (busyRef.current) return;
    if (!file.type.startsWith('image/')) { o.current.onError('Please choose an image'); return; }
    busyRef.current = true;
    let made: PhotoHandle | null = null;
    try {
      const client = o.current.getClient();
      if (!client) throw new Error('Not connected');
      made = await createPhotoTrack(file);
      const prev = o.current.photoRef.current;
      const cam = o.current.getCam();
      if (prev) {
        try { await client.unpublish([prev.track]); } catch { /* ignore */ }
        prev.close();
      } else if (cam) {
        try { await client.unpublish([cam]); } catch { /* ignore */ }
        try { cam.stop(); } catch { /* ignore */ }
        try { await cam.setEnabled(false); } catch { /* ignore */ }
      }
      await client.publish([made.track]);
      o.current.photoRef.current = made;
      setPhotoOn(true);
      try { await o.current.getSplit()?.replaceCam(made.track); } catch { /* ignore */ }
      o.current.onVideoShown();
      o.current.onError('');
    } catch (err: any) {
      try { made?.close(); } catch { /* ignore */ }
      // make sure the camera comes back if the photo could not be published
      const cam = o.current.getCam();
      if (cam && !o.current.photoRef.current) {
        try { await cam.setEnabled(true); } catch { /* ignore */ }
        try { await o.current.getClient()?.publish?.([cam]); } catch { /* ignore */ }
        o.current.onVideoShown();
      }
      o.current.onError(String(err?.message ?? err));
    } finally {
      busyRef.current = false;
    }
  }, []);

  /** For leaving the room: free the photo track (the room is closing, nothing is re-published). */
  const closePhoto = React.useCallback(() => {
    const cur = o.current.photoRef.current;
    o.current.photoRef.current = null;
    try { cur?.close(); } catch { /* ignore */ }
    setPhotoOn(false);
  }, []);

  const onFile = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    try { e.target.value = ''; } catch { /* ignore */ }
    if (f) void startPhoto(f);
  }, [startPhoto]);

  return { photoOn, inputRef, openPicker, onFile, startPhoto, stopPhoto, closePhoto };
}

/* ───────────────────────── press gesture (tap vs long press) ───────────────────────── */

export const LONG_PRESS_MS = 550;

/**
 * Spread the returned props on the button: a short press calls onTap, a press held for LONG_PRESS_MS calls onLong
 * (fired when the finger is lifted, so the browser allows the file picker to open).
 */
export function usePressGesture(onTap: () => void, onLong: () => void, ms = LONG_PRESS_MS) {
  const timer = React.useRef<number | null>(null);
  const down = React.useRef(false);
  const fired = React.useRef(false);
  const cb = React.useRef({ onTap, onLong });
  cb.current = { onTap, onLong };

  const clear = () => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
  };
  const cancel = () => { clear(); down.current = false; fired.current = false; };

  return {
    'data-cam-gesture': '1',
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down.current = true;
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        try { navigator.vibrate?.(15); } catch { /* ignore */ }
      }, ms);
    },
    onPointerUp: () => {
      if (!down.current) return;
      const long = fired.current;
      cancel();
      if (long) cb.current.onLong(); else cb.current.onTap();
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb.current.onTap(); }
    },
  };
}

/* ───────────────────────── UI ───────────────────────── */

/** Hidden photo input + the CSS that stops the long-press menu on the video button. Render it once. */
export function PhotoPickInput({
  inputRef, onChange,
}: { inputRef: React.MutableRefObject<HTMLInputElement | null>; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onChange}
        style={{ display: 'none' }}
        aria-hidden
        tabIndex={-1}
      />
      <style>{`[data-cam-gesture]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;}`}</style>
    </>
  );
}

/** Icon shown on the video button while a photo is up. */
export function PhotoModeIcon({ size = 18 }: { size?: number }) {
  return <ImageIcon size={size} strokeWidth={2.2} />;
}
