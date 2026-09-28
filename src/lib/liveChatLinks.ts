/** liveChatLinks.ts — src/lib/liveChatLinks.ts */
export const LIVE_CHAT_LINK_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]]+|[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(?:\/[^\s<>"')\]]*)?)/gi;

export function splitLiveChatLinks(text: string): Array<{ type: 'text' | 'link'; value: string; href: string }> {
  const raw = String(text || '');
  if (!raw) return [];
  const re = new RegExp(LIVE_CHAT_LINK_RE.source, 'gi');
  const out: Array<{ type: 'text' | 'link'; value: string; href: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) out.push({ type: 'text', value: raw.slice(last, m.index), href: '' });
    const value = m[0];
    let href = value;
    if (/^www\./i.test(href)) href = `https://${href}`;
    else if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    out.push({ type: 'link', value, href });
    last = m.index + value.length;
  }
  if (last < raw.length) out.push({ type: 'text', value: raw.slice(last), href: '' });
  return out;
}
