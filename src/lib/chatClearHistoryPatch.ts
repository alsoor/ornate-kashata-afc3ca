export async function clearChatHistory(opts: {
  messageIds: Array<string | number>;
  peerId?: string | null;
  groupId?: string | null;
  chatId?: string | null;
}) {
  const { messageIds, peerId, groupId, chatId } = opts;
  const urls: string[] = [];
  if (groupId) urls.push(`/api/groups/${groupId}/messages`);
  if (peerId) {
    urls.push(`/api/messages?peerId=${encodeURIComponent(String(peerId))}`);
    urls.push(`/api/chat/${encodeURIComponent(String(peerId))}/clear`);
  }
  if (chatId) {
    urls.push(`/api/secret-chat/${encodeURIComponent(String(chatId))}/clear`);
    urls.push(`/api/secret-chat/clear?chatId=${encodeURIComponent(String(chatId))}`);
  }
  urls.push('/api/messages/clear');

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId, groupId, chatId, ids: messageIds }),
      });
      if (r.ok || r.status === 204) return true;
      const r2 = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', peerId, groupId, chatId, ids: messageIds }),
      });
      if (r2.ok || r2.status === 204) return true;
    } catch {
      /* next */
    }
  }

  for (const id of messageIds) {
    const list = [
      groupId ? `/api/groups/${groupId}/messages/${id}` : '',
      chatId ? `/api/secret-chat/message/${id}` : '',
      `/api/messages/${id}`,
    ].filter(Boolean);
    for (const url of list) {
      try {
        await fetch(url, { method: 'DELETE', credentials: 'include' });
      } catch {
        /* ignore */
      }
    }
  }
  return true;
}
