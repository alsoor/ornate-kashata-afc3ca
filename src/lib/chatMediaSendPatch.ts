export type LocalChatMedia = {
  id: number;
  type: 'image' | 'video';
  body: string;
  senderId: string;
  createdAt: string;
};

export function makeOptimisticMedia(file: File, senderId: string): LocalChatMedia {
  const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
  return {
    id: -Date.now(),
    type,
    body: URL.createObjectURL(file),
    senderId,
    createdAt: new Date().toISOString(),
  };
}

export async function postChatMedia(opts: {
  file: File;
  groupId?: string | null;
  chatId?: string | null;
  peerId?: string | null;
}) {
  const { file, groupId, chatId, peerId } = opts;
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('image', file, file.name);
  const kind = file.type.startsWith('video/') ? 'file' : 'image';
  const urls: string[] = [];
  if (groupId) {
    urls.push(`/api/groups/${groupId}/messages/${kind}`);
    urls.push(`/api/groups/${groupId}/messages/file`);
  }
  if (chatId) {
    urls.push(`/api/secret-chat/${kind}?chatId=${encodeURIComponent(chatId)}`);
    urls.push(`/api/secret-chat/file?chatId=${encodeURIComponent(chatId)}&name=${encodeURIComponent(file.name)}`);
  }
  if (peerId) {
    urls.push(`/api/messages/${kind}?peerId=${encodeURIComponent(peerId)}`);
    urls.push(`/api/chat/${encodeURIComponent(peerId)}/${kind}`);
  }
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
      if (r.ok) return true;
      const r2 = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r2.ok) return true;
    } catch {
      /* next */
    }
  }
  return false;
}
