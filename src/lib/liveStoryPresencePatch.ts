/**
 * liveStoryPresencePatch — بطاقة اللايف في صفحة القصة.
 * لا تختفي إلا إذا صاحب البث أغلق البث على السيرفر. دخول المشاهد وخروجه لا يخفيان البطاقة.
 */
export type StoryLiveRow = { hostId: string; kind: 'voice' | 'camera'; at: number };

const active = new Map<string, StoryLiveRow>();
const ended = new Set<string>();
let fetched = false;
let timer = 0;

function emit() {
  try { window.dispatchEvent(new CustomEvent('stooorna:story-live-presence')); } catch { /* ignore */ }
}

export function storyLiveKnown(): boolean { return fetched; }

export function storyLiveStillOpen(hostId: string): boolean {
  const id = String(hostId || '');
  if (!id || ended.has(id)) return false;
  if (active.has(id)) return true;
  // قبل أول رد من السيرفر لا نُخفي بطاقة كانت ظاهرة
  return !fetched;
}

export async function refreshStoryLives(): Promise<void> {
  try {
    const r = await fetch('/api/live-presence', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json().catch(() => null) as { lives?: StoryLiveRow[]; active?: boolean; hostId?: string; kind?: string } | null;
    const list = Array.isArray(d?.lives) ? d!.lives! : [];
    active.clear();
    for (const row of list) {
      const id = String(row?.hostId || '');
      if (!id) continue;
      active.set(id, { hostId: id, kind: row.kind === 'camera' ? 'camera' : 'voice', at: Number(row.at) || Date.now() });
      ended.delete(id);
    }
    fetched = true;
    emit();
  } catch { /* أبقِ آخر حالة */ }
}

export function noteHostClosed(hostId: string) {
  const id = String(hostId || '');
  if (!id) return;
  active.delete(id);
  ended.add(id);
  emit();
}

export function readStoryLive(hostId: string): StoryLiveRow | null {
  return active.get(String(hostId || '')) || null;
}

export function startStoryLiveWatch() {
  if (typeof window === 'undefined' || timer) return;
  void refreshStoryLives();
  timer = window.setInterval(() => { void refreshStoryLives(); }, 2000);
  window.addEventListener('stooorna:live-active', (e) => {
    const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
    if (d?.hostId && d.active === false) noteHostClosed(String(d.hostId));
  });
  window.addEventListener('stooorna:livecam-active', (e) => {
    const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
    if (d?.hostId && d.active === false) noteHostClosed(String(d.hostId));
  });
}
