export type AddState = 'none' | 'friends' | 'pending' | 'requested';

async function readJson(url: string) {
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function isAccountPrivate(userId: string): Promise<boolean> {
  const urls = [
    `/api/users/${encodeURIComponent(userId)}`,
    `/api/users/${encodeURIComponent(userId)}/privacy`,
    `/api/users/by-username/${encodeURIComponent(userId)}`,
  ];
  for (const url of urls) {
    const d = await readJson(url);
    if (d && (d.isPrivate === true || d.privacy?.isPrivate === true || d.user?.isPrivate === true)) return true;
    if (d && (d.isPrivate === false || d.privacy?.isPrivate === false)) return false;
  }
  return false;
}

export async function getFriendState(myId: string, targetId: string): Promise<AddState> {
  const d = await readJson(`/api/users/${encodeURIComponent(targetId)}/follow-status`);
  if (d) {
    if (d.friends || d.isFriend || d.status === 'friends' || d.accepted) return 'friends';
    if (d.pending || d.status === 'pending' || d.requested) return 'pending';
  }
  try {
    const raw = localStorage.getItem('stooorna_friend_state') || '{}';
    const map = JSON.parse(raw) as Record<string, AddState>;
    return map[`${myId}:${targetId}`] || 'none';
  } catch {
    return 'none';
  }
}

function saveState(myId: string, targetId: string, state: AddState) {
  try {
    const raw = localStorage.getItem('stooorna_friend_state') || '{}';
    const map = JSON.parse(raw) as Record<string, AddState>;
    map[`${myId}:${targetId}`] = state;
    localStorage.setItem('stooorna_friend_state', JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function addOrRequestFriend(myId: string, targetId: string): Promise<AddState> {
  const current = await getFriendState(myId, targetId);
  if (current === 'friends' || current === 'pending') return current;
  const priv = await isAccountPrivate(targetId);
  const body = JSON.stringify({ targetId, userId: targetId, action: priv ? 'request' : 'add' });
  const urls: Array<{ url: string; method: string }> = [
    { url: `/api/users/${encodeURIComponent(targetId)}/follow`, method: 'POST' },
    { url: '/api/friends/request', method: 'POST' },
    { url: '/api/friends', method: 'POST' },
  ];
  for (const ep of urls) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (r.ok || r.status === 204) break;
    } catch {
      /* next */
    }
  }
  const next: AddState = priv ? 'pending' : 'friends';
  saveState(myId, targetId, next);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:friend-state', { detail: { targetId, state: next } }));
  } catch {
    /* ignore */
  }
  return next;
}
