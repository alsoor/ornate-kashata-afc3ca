/** أدوات صوت مشتركة للهدايا (Web Audio — بدون ملفات صوت). */
let sharedCtx: AudioContext | null = null;

export function getAudioCtx(): AudioContext | null {
  try {
    const w = window as any;
    const Ctx: typeof AudioContext | undefined = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx) sharedCtx = new Ctx();
    if (sharedCtx.state === 'suspended') void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

export function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
