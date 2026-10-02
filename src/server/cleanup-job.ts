/**
 * cleanup-job — ONLY public live-chat retention (24h cycle).
 * Does NOT delete feed posts (photos/videos) or their media files.
 */
const LIVE_CHAT_CLEAR_MS = 24 * 60 * 60 * 1000;
const LIVE_CHAT_CLEAR_OFFSET_MS = 3 * 60 * 60 * 1000; // Kuwait UTC+3 midnight

function liveChatCycleStart(now = Date.now()): number {
  return (
    Math.floor((now + LIVE_CHAT_CLEAR_OFFSET_MS) / LIVE_CHAT_CLEAR_MS) *
      LIVE_CHAT_CLEAR_MS -
    LIVE_CHAT_CLEAR_OFFSET_MS
  );
}

type LiveChatMap = Map<string, Array<{ at: number; payload: any }>>;

function getLiveChatMem(): LiveChatMap | null {
  try {
    const g = globalThis as typeof globalThis & {
      __stooornaLiveChat?: LiveChatMap;
    };
    return g.__stooornaLiveChat || null;
  } catch {
    return null;
  }
}

/** Drop only live-chat messages older than the current 24h cycle. Never touch posts DB/media. */
function purgeLiveChatOlderThanCycle() {
  const mem = getLiveChatMem();
  if (!mem) return;
  const start = liveChatCycleStart();
  for (const [channel, list] of mem.entries()) {
    if (!Array.isArray(list)) continue;
    const next = list.filter((m) => {
      const at = Number(m?.at || m?.payload?.createdAt || 0);
      return at >= start;
    });
    if (next.length !== list.length) mem.set(channel, next);
  }
}

let started = false;

export function startCleanupJob() {
  if (started) return;
  started = true;
  // Run shortly after boot, then every minute — chat only
  const run = () => {
    try {
      purgeLiveChatOlderThanCycle();
    } catch (e) {
      console.error("[cleanup-job] live-chat purge failed", e);
    }
  };
  setTimeout(run, 5000);
  setInterval(run, 60 * 1000);
  console.log(
    "[cleanup-job] started — 24h live-chat only (posts/photos/videos are NOT purged)",
  );
}
