/** @ mentions shared by public chat, public voice, and account voice/video lives. */

export type MentionPerson = { id: string; username?: string | null; name?: string | null };

export function extractMentions(text: string): string[] {
  const out: string[] = [];
  const re = /(^|\s)@([a-zA-Z0-9_\u0600-\u06FF.]{1,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || '')))) {
    const u = m[2].replace(/^@/, '');
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/** Active @ query at the caret, or null if the user is not mentioning. */
export function mentionQuery(text: string, caret = text.length): string | null {
  const upto = String(text || '').slice(0, caret);
  const m = upto.match(/(^|\s)@([a-zA-Z0-9_\u0600-\u06FF.]{0,32})$/);
  return m ? m[2] : null;
}

export function filterMentionPeople(people: MentionPerson[], query: string): MentionPerson[] {
  const q = query.trim().toLowerCase();
  return people.filter(p => {
    const u = String(p.username || '').replace(/^@/, '').toLowerCase();
    const n = String(p.name || '').toLowerCase();
    if (!u && !n) return false;
    if (!q) return true;
    return u.startsWith(q) || n.startsWith(q) || u.includes(q) || n.includes(q);
  }).slice(0, 8);
}

export function applyMention(text: string, username: string, caret = text.length): { text: string; caret: number } {
  const upto = text.slice(0, caret);
  const rest = text.slice(caret);
  const next = upto.replace(/(^|\s)@([a-zA-Z0-9_\u0600-\u06FF.]{0,32})$/, (_a, sp) => `${sp}@${String(username).replace(/^@/, '')} `);
  return { text: next + rest, caret: next.length };
}

export async function postMentionNotifications(opts: {
  text: string;
  fromUserId?: string | null;
  fromName?: string | null;
  room: string;
  messageId: string;
  kind?: 'chat' | 'live' | 'public-voice';
}) {
  const names = extractMentions(opts.text);
  if (!names.length) return;
  await fetch('/api/notifications', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'mention',
      usernames: names,
      fromUserId: opts.fromUserId || '',
      fromName: opts.fromName || '',
      room: opts.room,
      messageId: opts.messageId,
      kind: opts.kind || 'chat',
      title: `@${names[0]}`,
      body: opts.text.slice(0, 140),
      href: `/?chat=1&msg=${encodeURIComponent(opts.messageId)}`,
    }),
  }).catch(() => {});
}
