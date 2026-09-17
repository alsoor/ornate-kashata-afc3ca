/**
 * notificationSound — plays a short in-app chime using Web Audio API.
 * No external files needed — all tones are synthesised on the fly.
 *
 * Sound types:
 *   'message'  — soft two-note ping (DM / group message)
 *   'request'  — single warm bell (friend request)
 *   'call'     — rising three-note alert (incoming call)
 *   'whisper'  — gentle low-high whisper tone
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return _ctx;
  } catch { return null; }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  // Attack → sustain → release envelope
  env.gain.setValueAtTime(0, startAt);
  env.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  env.gain.setValueAtTime(gain, startAt + duration * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.01);
}

export type SoundType = 'message' | 'request' | 'call' | 'whisper' | 'join' | 'voice-join';

export function playNotificationSound(type: SoundType = 'message') {
  const ctx = getCtx();
  if (!ctx) return;

  // Resume if suspended (browser autoplay policy)
  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    const now = ctx.currentTime;

    switch (type) {
      case 'message': {
        // Soft two-note ping: C6 → E6
        playTone(ctx, 1046.5, now,        0.18, 0.22);
        playTone(ctx, 1318.5, now + 0.12, 0.22, 0.18);
        break;
      }
      case 'request': {
        // Single warm bell: G5
        playTone(ctx, 784, now, 0.35, 0.28);
        break;
      }
      case 'call': {
        // Rising three-note alert: C5 → E5 → G5
        playTone(ctx, 523.25, now,        0.15, 0.3);
        playTone(ctx, 659.25, now + 0.13, 0.15, 0.3);
        playTone(ctx, 783.99, now + 0.26, 0.22, 0.3);
        break;
      }
      case 'whisper': {
        // Gentle low-high: E5 → B5
        playTone(ctx, 659.25, now,        0.14, 0.15);
        playTone(ctx, 987.77, now + 0.10, 0.20, 0.12);
        break;
      }
      case 'join': {
        // Warm welcome chime: G5 → C6 — soft ascending two-note (2s total feel)
        playTone(ctx, 783.99, now,        0.35, 0.22, 'sine');
        playTone(ctx, 1046.5, now + 0.28, 0.50, 0.18, 'sine');
        playTone(ctx, 1318.5, now + 0.70, 0.80, 0.12, 'sine');
        break;
      }
      case 'voice-join': {
        // Mic-on chime: rising arpeggio C5 → E5 → G5 → C6 — bright and clear
        playTone(ctx, 523.25, now,        0.18, 0.28, 'sine');
        playTone(ctx, 659.25, now + 0.15, 0.18, 0.25, 'sine');
        playTone(ctx, 783.99, now + 0.30, 0.18, 0.22, 'sine');
        playTone(ctx, 1046.5, now + 0.48, 0.60, 0.20, 'sine');
        break;
      }
    }
  }).catch(() => {});
}
