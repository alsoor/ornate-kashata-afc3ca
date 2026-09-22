export type AiBeautyMode = 'off' | 'beauty' | 'makeup' | 'product';

type FaceBox = { x: number; y: number; w: number; h: number };

const WORK_W = 240;
const WORK_H = 426;

let workCanvas: HTMLCanvasElement | null = null;
let workCtx: CanvasRenderingContext2D | null = null;
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;
let lastFace: FaceBox | null = null;
let faceMisses = 0;
let inited = false;
let landmarker: { detectForVideo: (video: HTMLVideoElement, ts: number) => { faceLandmarks?: { x: number; y: number }[][] } } | null = null;
let lastDetectAt = 0;

function ensureBuffers() {
  if (!workCanvas) {
    workCanvas = document.createElement('canvas');
    workCanvas.width = WORK_W;
    workCanvas.height = WORK_H;
    workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!blurCanvas) {
    blurCanvas = document.createElement('canvas');
    blurCanvas.width = WORK_W;
    blurCanvas.height = WORK_H;
    blurCtx = blurCanvas.getContext('2d');
  }
}

function isSkin(r: number, g: number, b: number) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 60 && y < 240 && cb > 77 && cb < 135 && cr > 133 && cr < 180;
}

function estimateFaceFromSkin(data: Uint8ClampedArray, w: number, h: number): FaceBox | null {
  let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (!isSkin(data[i], data[i + 1], data[i + 2])) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < (w * h) / 80) return null;
  const padX = (maxX - minX) * 0.12;
  const padY = (maxY - minY) * 0.16;
  return {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    w: Math.min(w, maxX + padX) - Math.max(0, minX - padX),
    h: Math.min(h, maxY + padY) - Math.max(0, minY - padY),
  };
}

async function loadLandmarker() {
  if (inited) return;
  inited = true;
  try {
    const wasm = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
    const model = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    const mod: any = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset = await mod.FilesetResolver.forVisionTasks(wasm);
    landmarker = await mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  } catch {
    landmarker = null;
  }
}

export function initAiBeauty() {
  void loadLandmarker();
}

function landmarksToBox(points: { x: number; y: number }[], canvasW: number, canvasH: number): FaceBox {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const x = Math.max(0, minX * canvasW);
  const y = Math.max(0, minY * canvasH);
  return {
    x,
    y,
    w: Math.min(canvasW, maxX * canvasW) - x,
    h: Math.min(canvasH, maxY * canvasH) - y,
  };
}

function applyPixelBeauty(data: Uint8ClampedArray, mode: AiBeautyMode, faceRatio: number) {
  const strength = mode === 'makeup' ? 1 : mode === 'beauty' ? 0.85 : 0.55;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const skin = isSkin(r, g, b);
    if (mode === 'product' && faceRatio < 0.04) {
      r = Math.min(255, r * 1.06 + 4);
      g = Math.min(255, g * 1.04 + 2);
      b = Math.min(255, b * 1.02);
      const contrast = 1.08;
      r = Math.max(0, Math.min(255, (r - 128) * contrast + 128));
      g = Math.max(0, Math.min(255, (g - 128) * contrast + 128));
      b = Math.max(0, Math.min(255, (b - 128) * contrast + 128));
    } else if (skin) {
      const softR = r * 0.72 + g * 0.18 + 28 * strength;
      const softG = g * 0.74 + r * 0.14 + 18 * strength;
      const softB = b * 0.78 + 12 * strength;
      r = r * (1 - 0.42 * strength) + softR * (0.42 * strength);
      g = g * (1 - 0.42 * strength) + softG * (0.42 * strength);
      b = b * (1 - 0.42 * strength) + softB * (0.42 * strength);
      if (mode === 'makeup') {
        r = Math.min(255, r * 1.06 + 8);
        g = Math.min(255, g * 1.01 + 2);
        b = Math.min(255, b * 0.98);
      }
    } else {
      r = Math.min(255, r * 1.03);
      g = Math.min(255, g * 1.02);
      b = Math.min(255, b * 1.01);
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

export function applyAiBeautyFrame(
  sourceCanvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  mode: AiBeautyMode,
) {
  if (mode === 'off') return;
  ensureBuffers();
  if (!workCtx || !workCanvas || !blurCtx || !blurCanvas) return;

  const now = performance.now();
  if (landmarker && video && now - lastDetectAt > 120) {
    lastDetectAt = now;
    try {
      const res = landmarker.detectForVideo(video, now);
      const pts = res.faceLandmarks?.[0];
      if (pts && pts.length) {
        lastFace = landmarksToBox(pts, sourceCanvas.width, sourceCanvas.height);
        faceMisses = 0;
      } else {
        faceMisses += 1;
        if (faceMisses > 8) lastFace = null;
      }
    } catch {
      /* keep last face */
    }
  }

  workCtx.drawImage(sourceCanvas, 0, 0, WORK_W, WORK_H);
  const img = workCtx.getImageData(0, 0, WORK_W, WORK_H);
  const skinBox = lastFace
    ? {
        x: (lastFace.x / sourceCanvas.width) * WORK_W,
        y: (lastFace.y / sourceCanvas.height) * WORK_H,
        w: (lastFace.w / sourceCanvas.width) * WORK_W,
        h: (lastFace.h / sourceCanvas.height) * WORK_H,
      }
    : estimateFaceFromSkin(img.data, WORK_W, WORK_H);
  if (skinBox) lastFace = lastFace || {
    x: (skinBox.x / WORK_W) * sourceCanvas.width,
    y: (skinBox.y / WORK_H) * sourceCanvas.height,
    w: (skinBox.w / WORK_W) * sourceCanvas.width,
    h: (skinBox.h / WORK_H) * sourceCanvas.height,
  };
  const faceRatio = skinBox ? (skinBox.w * skinBox.h) / (WORK_W * WORK_H) : 0;
  applyPixelBeauty(img.data, mode, faceRatio);
  workCtx.putImageData(img, 0, 0);

  blurCtx.clearRect(0, 0, WORK_W, WORK_H);
  blurCtx.filter = mode === 'product' ? 'blur(0.6px) contrast(1.06) saturate(1.08)' : 'blur(1.35px) brightness(1.05) saturate(1.06)';
  blurCtx.drawImage(workCanvas, 0, 0);
  blurCtx.filter = 'none';

  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = mode === 'makeup' ? 0.62 : 0.52;
  ctx.drawImage(blurCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);
  ctx.restore();
}

export function filterIdToAiMode(id: string): AiBeautyMode {
  if (id === 'ai' || id === 'beauty') return 'beauty';
  if (id === 'makeup') return 'makeup';
  if (id === 'product' || id === 'ai-product') return 'product';
  return 'off';
}
