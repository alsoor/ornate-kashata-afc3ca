export function formatVoiceSecs(secs: number) {
  const m = Math.floor(Math.max(0, secs) / 60);
  const s = Math.max(0, secs) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function voiceBarHeight(index: number, secs: number, level: number, paused: boolean) {
  if (paused) return 6;
  return 6 + Math.abs(Math.sin((index + secs) * 0.7)) * 18 * Math.max(0.08, level);
}
