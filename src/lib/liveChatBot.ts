/**
 * liveChatBot.ts — drop at src/lib/liveChatBot.ts
 * Auto-removes abusive / sexual text (AR + EN) and obvious NSFW image posts
 * from the public LIVE chat. Posts a notice as: Bot | Stooorna
 */

export const LIVE_CHAT_BOT_NAME = 'Bot | Stooorna';
export const LIVE_CHAT_BOT_ID = 'stooorna-bot';
export const LIVE_CHAT_BOT_COLOR = '#0b3a82';

const EN = [
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy',
  'cock', 'slut', 'whore', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'porn',
  'porno', 'xxx', 'onlyfans', 'nude', 'nudes', 'naked pic', 'sex video', 'blowjob',
  'handjob', 'cumshot', 'anal', 'boobs', 'tits', 'hentai', 'nsfw',
];

const AR = [
  'كس', 'كسمك', 'كس امك', 'كسم', 'شرموط', 'شرموطة', 'قحبة', 'قحبه',
  'عرص', 'منيوك', 'منيوكة', 'زب', 'زبي', 'طيز', 'نيك', 'ينيك', 'انيك',
  'خنيث', 'خول', 'قواد', 'لبوه', 'لبوة', 'مصه', 'امك زانية', 'يا ابن',
  'يلعن', 'لعنة', 'احا', 'كسمك', 'كسمها',
];

function normalize(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function liveChatTextIsBlocked(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  const padded = ` ${n} `;
  for (const w of [...EN, ...AR]) {
    const nw = normalize(w);
    if (!nw) continue;
    if (nw.length <= 3) {
      if (padded.includes(` ${nw} `)) return true;
    } else if (n.includes(nw)) return true;
  }
  return false;
}

export function liveChatImageLooksBlocked(imageUrl?: string | null, text?: string): boolean {
  if (liveChatTextIsBlocked(text || '')) return true;
  const u = String(imageUrl || '').toLowerCase();
  if (!u) return false;
  return /(porn|xxx|nsfw|nude|naked|sex|hentai|onlyfans)/i.test(u);
}

export function makeLiveChatBotNotice(reason: 'text' | 'image' = 'text') {
  return {
    id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: LIVE_CHAT_BOT_ID,
    name: LIVE_CHAT_BOT_NAME,
    username: 'Bot',
    avatarUrl: null as string | null,
    text: reason === 'image'
      ? 'تم حذف صورة غير لائقة'
      : 'تم حذف رسالة غير لائقة',
    imageUrl: null as string | null,
    voiceUrl: null as string | null,
    likes: [] as string[],
    createdAt: Date.now(),
    isBot: true as const,
  };
}
