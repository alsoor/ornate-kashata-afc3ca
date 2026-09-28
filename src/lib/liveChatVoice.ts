/**
 * liveChatVoice.ts — put at src/lib/liveChatVoice.ts
 * Uploads a LIVE chat voice note and returns a playable URL for every user.
 */
export async function uploadLiveChatVoice(id: string, dataUrl: string, duration: number): Promise<string | null> {
  const payload = { id, audio: dataUrl, duration, room: 'stooorna-live-chat' };
  const urls = ['/api/live-chat/voice', '/api/live-chat'];
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u.endsWith('/voice') ? payload : { ...payload, action: 'voice', voiceUrl: dataUrl, text: '🎤' }),
      });
      if (!r.ok) continue;
      const d = await r.json().catch(() => ({} as any));
      const url = d.url || d.voiceUrl || d.audioUrl;
      if (typeof url === 'string' && url) return url;
      if (u.endsWith('/voice')) return `/api/live-chat/voice?id=${encodeURIComponent(id)}`;
    } catch { /* next */ }
  }
  return dataUrl.startsWith('data:') ? dataUrl : null;
}
