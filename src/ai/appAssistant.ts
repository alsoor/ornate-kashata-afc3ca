/**
 * Stooorna Ai — App Assistant (v1.0.0)
 * Place at: src/ai/appAssistant.ts
 *
 * Lets Stooorna Ai answer, with REAL data from the app's own server routes:
 *   - who of my friends is online now (full, tidy list)
 *   - how many users I added / my friends list
 *   - how many posts I sent (photos / videos / text, likes, comments, views, latest posts)
 *   - friend requests waiting for me
 *   - my Ai points balance
 *   - a full account summary
 *   - questions about the app itself ("what is Stooorna?")
 *   - "open the general chat"  -> closes the Ai sheet and opens the general chat for you
 *
 * Arabic + English. Nothing here edits any other file: StooornaAiSheet only calls
 * detectAppIntent() / answerAppIntent() (see the 3 small hooks in INTEGRATION).
 *
 * Routes used (all already exist in the app): /api/friends, /api/friends/requests/count,
 * /api/room?id=stooorna-online-<id>, /api/presence, /api/posts, and ./aiCredits.
 */

import { getCredits, AI_POST_COST } from './aiCredits';

export const APP_ASSISTANT_VERSION = '1.0.0';

export interface AssistUser {
  id?: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  image?: string | null;
}

export type AppIntent = 'openChat' | 'online' | 'requests' | 'posts' | 'credits' | 'friends' | 'summary' | 'appInfo';

export interface Person { id: string; name: string; username: string; avatar: string }

export interface PostItemInfo { id: string; text: string; kind: 'photo' | 'video' | 'text'; media: string; likes: number; comments: number; views: number; at: number }

export interface PostStats {
  items: PostItemInfo[];
  total: number;
  photos: number;
  videos: number;
  textOnly: number;
  likes: number;
  comments: number;
  views: number;
  latest: Array<{ text: string; kind: 'photo' | 'video' | 'text'; likes: number; comments: number; at: number }>;
}

export interface DashboardNumbers { friends: number; online: number; posts: number; requests: number }

/* ───────────────────────── helpers ───────────────────────── */

const AR_RE = /[\u0600-\u06FF]/;

/** Arabic-friendly normaliser: no diacritics, أإآ→ا, ة→ه, ى→ي, punctuation → space. */
function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[؟?!.,،:;"'()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(url: string, ms = 9000): Promise<any | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? window.setTimeout(() => ctrl.abort(), ms) : 0;
  try {
    const r = await fetch(url, { credentials: 'include', cache: 'no-store', signal: ctrl?.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    if (t) window.clearTimeout(t);
  }
}

const cache = new Map<string, { at: number; p: Promise<any> }>();
function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>;
  const p = fn();
  cache.set(key, { at: Date.now(), p });
  return p;
}
/** Forget cached numbers (call after the user adds / removes something). */
export function clearAssistantCache() { cache.clear(); }

const firstArray = (...c: any[]): any[] => {
  for (const x of c) if (Array.isArray(x)) return x;
  return [];
};

function toPerson(f: any): Person {
  return {
    id: String(f?.friendId ?? f?.userId ?? f?.requesterId ?? f?.id ?? ''),
    name: String(f?.name ?? '').trim(),
    username: String(f?.username ?? '').replace(/^@/, '').trim(),
    avatar: String(f?.avatarUrl ?? f?.avatar ?? f?.image ?? '').trim(),
  };
}

function personLine(p: Person, i: number): string {
  const nm = p.name || p.username || 'User';
  const at = p.username && p.username !== nm ? ` — @${p.username}` : p.username ? ` (@${p.username})` : '';
  return `${i + 1}. ${nm}${p.name ? at : ''}`;
}

/* ───────────────────────── data loaders ───────────────────────── */

interface FriendsData { friends: Person[]; incoming: number; incomingPeople: Person[]; outgoing: number }

function loadFriendsData(uid: string): Promise<FriendsData> {
  return memo(`friends:${uid}`, 15000, async () => {
    const d = await getJson('/api/friends');
    const accepted = firstArray(d?.accepted).map(toPerson).filter(p => p.id);
    const incomingList = firstArray(d?.incoming, d?.requests, d?.pending, d?.received);
    const outgoingList = firstArray(d?.outgoing, d?.sent);
    let incoming = incomingList.length;
    const c = await getJson('/api/friends/requests/count', 6000);
    const n = Number(c?.count ?? c?.total ?? c?.requests);
    if (Number.isFinite(n)) incoming = Math.max(incoming, n);
    const incomingPeople = incomingList.map(toPerson).filter(x => x.id);
    return { friends: accepted, incoming, incomingPeople, outgoing: outgoingList.length };
  });
}

const onlineRoomId = (userId: string) =>
  `stooorna-online-${String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'x'}`;

function localOnline(id: string): boolean {
  try {
    const raw = localStorage.getItem(`stooorna_online_${id}`);
    if (!raw) return false;
    const d = JSON.parse(raw) as { active?: boolean; at?: number };
    return !!d?.active && !!d.at && Date.now() - d.at < 12000;
  } catch { return false; }
}

/** Friends that are online right now (same sources the app's green dots use). */
function loadOnline(uid: string, friends: Person[]): Promise<Person[]> {
  return memo(`online:${uid}:${friends.length}`, 6000, async () => {
    const list = friends.filter(f => f.id && f.id !== uid);
    if (!list.length) return [];
    const on = new Set<string>();
    list.forEach(f => { if (localOnline(f.id)) on.add(f.id); });

    // A) presence route (if it returns a map or an array)
    const presenceJob = (async () => {
      const ids = list.map(f => f.id);
      const pr = await getJson(`/api/presence?ids=${encodeURIComponent(ids.join(','))}`, 6000);
      const map = pr?.presence ?? pr?.users ?? pr;
      if (Array.isArray(map)) {
        for (const e of map) {
          const id = String(e?.userId ?? e?.id ?? '');
          if (e?.online && ids.includes(id)) on.add(id);
        }
      } else if (map && typeof map === 'object') {
        for (const id of ids) if ((map as any)[id]?.online) on.add(id);
      }
    })();

    // B) the lightweight "online room" every signed-in user keeps alive (fast + reliable)
    const roomJob = (async () => {
      const queue = list.filter(f => !on.has(f.id));
      const worker = async () => {
        for (;;) {
          const f = queue.shift();
          if (!f) return;
          const d = await getJson(`/api/room?id=${encodeURIComponent(onlineRoomId(f.id))}`, 6000);
          if (Array.isArray(d?.members) && d.members.length > 0) on.add(f.id);
        }
      };
      await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
    })();

    await Promise.allSettled([presenceJob, roomJob]);
    return list.filter(f => on.has(f.id));
  });
}

function loadMyPosts(uid: string): Promise<PostStats> {
  return memo(`posts:${uid}`, 20000, async () => {
    const urls = ['/api/posts?audience=text', '/api/posts?audience=public', '/api/posts'];
    const lists = await Promise.all(urls.map(u => getJson(u, 12000)));
    const mine = new Map<string, any>();
    for (const d of lists) {
      for (const p of firstArray(d?.posts)) {
        if (String(p?.authorId ?? '') !== uid) continue;
        if (p?.repostedBy) continue; // somebody else's repost entry
        mine.set(String(p?.id ?? p?.repostKey ?? Math.random()), p);
      }
    }
    const st: PostStats = { items: [], total: 0, photos: 0, videos: 0, textOnly: 0, likes: 0, comments: 0, views: 0, latest: [] };
    const rows: PostStats['latest'] = [];
    mine.forEach(p => {
      const types: string[] = firstArray(p?.mediaTypes).length ? p.mediaTypes : p?.mediaType ? [p.mediaType] : [];
      const hasVideo = types.includes('video');
      const hasImage = types.includes('image');
      st.total++;
      if (hasVideo) st.videos++; else if (hasImage) st.photos++; else st.textOnly++;
      st.likes += Number(p?.likesCount) || 0;
      st.comments += Number(p?.commentsCount) || 0;
      st.views += Number(p?.viewsCount ?? p?.views) || 0;
      st.items.push({
        id: String(p?.id ?? p?.repostKey ?? ''),
        text: String(p?.text || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        kind: hasVideo ? 'video' : hasImage ? 'photo' : 'text',
        media: String((firstArray(p?.mediaUrls)[0] ?? p?.mediaUrl) || ''),
        likes: Number(p?.likesCount) || 0,
        comments: Number(p?.commentsCount) || 0,
        views: Number(p?.viewsCount ?? p?.views) || 0,
        at: Date.parse(String(p?.createdAt || '')) || 0,
      });
      rows.push({
        text: String(p?.text || '').replace(/\s+/g, ' ').trim().slice(0, 42),
        kind: hasVideo ? 'video' : hasImage ? 'photo' : 'text',
        likes: Number(p?.likesCount) || 0,
        comments: Number(p?.commentsCount) || 0,
        at: Date.parse(String(p?.createdAt || '')) || 0,
      });
    });
    st.items.sort((a, b) => b.at - a.at);
    st.latest = rows.sort((a, b) => b.at - a.at).slice(0, 3);
    return st;
  });
}

/** The 4 numbers shown on the tiles when the chat is empty. */
export async function loadDashboard(user: AssistUser | null | undefined): Promise<DashboardNumbers | null> {
  const uid = String(user?.id || '');
  if (!uid) return null;
  const fd = await loadFriendsData(uid);
  const [online, posts] = await Promise.all([loadOnline(uid, fd.friends), loadMyPosts(uid)]);
  return { friends: fd.friends.length, online: online.length, posts: posts.total, requests: fd.incoming };
}

/* ───────────────────────── "open the general chat" ───────────────────────── */

/**
 * Opens the GENERAL CHAT (the floating chat button's panel in RootLayout): the Stooorna Ai sheet slides
 * down first, then RootLayout's GlobalPublicChatHost hears "stooorna:open-public-chat", turns the chat ON
 * and slides it up. (Needs the small listener added to RootLayout.tsx — see INTEGRATION.)
 */
export function openGeneralChat(): void {
  try { window.dispatchEvent(new CustomEvent('stooorna:ai-close')); } catch { /* */ }
  window.setTimeout(() => {
    try {
      localStorage.setItem('stooorna_public_chat_on', '1');
      (window as any).__stooornaPublicChatOn = true;
      window.dispatchEvent(new CustomEvent('stooorna:public-chat-switch', { detail: { on: true } }));
      window.dispatchEvent(new CustomEvent('stooorna:open-public-chat'));
    } catch { /* */ }
  }, 380);
}

/* ───────────────────────── intent detection ───────────────────────── */

const OPEN_VERB = /(افتح|افتحلي|افتح لي|ادخل|ادخلني|دخلني|وديني|خذني|روح|اطلع|شغل|\bopen\b|\benter\b|go to|take me)/;

/** Returns what the user is asking about the app, or null when it is a normal question for the AI. */
export function detectAppIntent(text: string): AppIntent | null {
  const t = norm(text);
  if (!t || t.length > 140) return null;

  if (OPEN_VERB.test(t) && /(الشات|الدردشه|chat)/.test(t) && /(العام|العامه|public|general)/.test(t)) return 'openChat';
  if (/(اونلاين|اون لاين|متصل|متواجد|متواجدين|online|active now)/.test(t)) return 'online';
  if (/(طلبات|طلب).*(صداقه|اضافه|friend)|friend requests?|pending requests?/.test(t)) return 'requests';
  if (/((كم|عدد|how many).*(بوست|منشور|نشر|ارسل|post))|(بوستاتي|منشوراتي|my posts)/.test(t)) return 'posts';
  if (/(رصيد|نقاطي|نقاط|balance|my points|credits)/.test(t)) return 'credits';
  if (/((كم|عدد|how many).*(مستخدم|صديق|اصدقاء|مضاف|اضفت|ضايف|friend|user))|(اصدقائي|اصحابي|قائمه الاصدقاء|my friends|friends list)/.test(t)) return 'friends';
  if (/(ملخص|احصائيات|احصايات|احصاءات|بياناتي|لوحه|كل شي عن حسابي|\bstats\b|summary|dashboard)/.test(t)) return 'summary';
  if (/(\bapp\b|stooorna|التطبيق|ستوورنا)/.test(t) && /(وش|ايش|شنو|عن|اشرح|مميزات|ميزات|كيف|what|about|features|explain|tell me)/.test(t)) return 'appInfo';
  return null;
}

/* ───────────────────────── answers ───────────────────────── */

const T = {
  noUser: (ar: boolean) => (ar ? 'سجّل دخولك أول عشان أقدر أجيب بياناتك.' : 'Please sign in first so I can load your data.'),
  disclaimerPosts: (ar: boolean) =>
    ar ? 'ملاحظة: العدد من المنشورات اللي يرجعها السيرفر لحسابك.' : 'Note: counted from the posts the server returns for your account.',
};

async function answerOnline(uid: string, ar: boolean): Promise<string> {
  const fd = await loadFriendsData(uid);
  const online = await loadOnline(uid, fd.friends);
  if (!fd.friends.length) return ar ? 'ما عندك أصدقاء مضافين للحين.' : 'You have no friends added yet.';
  if (!online.length) {
    return ar
      ? `🔘 ما فيه أحد من أصدقائك أونلاين الحين.\n(عدد أصدقائك: ${fd.friends.length})`
      : `🔘 None of your friends is online right now.\n(You have ${fd.friends.length} friends)`;
  }
  const head = ar
    ? `🟢 أصدقاؤك الأونلاين الحين: ${online.length} من ${fd.friends.length}`
    : `🟢 Friends online now: ${online.length} of ${fd.friends.length}`;
  return `${head}\n\n${online.map(personLine).join('\n')}`;
}

async function answerFriends(uid: string, ar: boolean): Promise<string> {
  const fd = await loadFriendsData(uid);
  if (!fd.friends.length) return ar ? 'ما عندك أصدقاء مضافين للحين.' : 'You have no friends added yet.';
  const head = ar ? `👥 عدد المستخدمين اللي ضايفهم: ${fd.friends.length}` : `👥 Users you added: ${fd.friends.length}`;
  const extra = [
    fd.incoming ? (ar ? `📩 طلبات تنتظرك: ${fd.incoming}` : `📩 Requests waiting for you: ${fd.incoming}`) : '',
    fd.outgoing ? (ar ? `⏳ طلبات أرسلتها وما انقبلت: ${fd.outgoing}` : `⏳ Requests you sent (pending): ${fd.outgoing}`) : '',
  ].filter(Boolean).join('\n');
  const list = fd.friends.slice(0, 60).map(personLine).join('\n');
  const more = fd.friends.length > 60 ? `\n… +${fd.friends.length - 60}` : '';
  return `${head}${extra ? '\n' + extra : ''}\n\n${list}${more}`;
}

async function answerRequests(uid: string, ar: boolean): Promise<string> {
  const fd = await loadFriendsData(uid);
  if (!fd.incoming) return ar ? '📭 ما عندك طلبات صداقة جديدة.' : '📭 No new friend requests.';
  return ar
    ? `📩 عندك ${fd.incoming} طلب صداقة ينتظر ردك.`
    : `📩 You have ${fd.incoming} friend request(s) waiting.`;
}

async function answerPosts(uid: string, ar: boolean): Promise<string> {
  const p = await loadMyPosts(uid);
  if (!p.total) return ar ? '🖼 للحين ما أرسلت أي منشور.' : "🖼 You haven't posted anything yet.";
  const kindIcon = (k: string) => (k === 'video' ? '🎬' : k === 'photo' ? '🖼' : '📝');
  const lines = ar
    ? [
        `📊 عدد البوستات اللي أرسلتها: ${p.total}`,
        `🖼 صور: ${p.photos}   🎬 فيديوهات: ${p.videos}   📝 نصوص: ${p.textOnly}`,
        `❤️ إعجابات: ${p.likes}   💬 تعليقات: ${p.comments}   👁 مشاهدات: ${p.views}`,
      ]
    : [
        `📊 Posts you sent: ${p.total}`,
        `🖼 Photos: ${p.photos}   🎬 Videos: ${p.videos}   📝 Text: ${p.textOnly}`,
        `❤️ Likes: ${p.likes}   💬 Comments: ${p.comments}   👁 Views: ${p.views}`,
      ];
  const latest = p.latest.length
    ? `\n\n${ar ? 'آخر منشوراتك:' : 'Your latest posts:'}\n` +
      p.latest.map((x, i) => `${i + 1}. ${kindIcon(x.kind)} ${x.text || (ar ? '(بدون نص)' : '(no text)')} — ❤️ ${x.likes} 💬 ${x.comments}`).join('\n')
    : '';
  return `${lines.join('\n')}${latest}\n\n${T.disclaimerPosts(ar)}`;
}

async function answerCredits(user: AssistUser, ar: boolean): Promise<string> {
  const c = await getCredits(user);
  if (!c) return T.noUser(ar);
  const posts = Math.floor(c.balance / AI_POST_COST);
  return ar
    ? `💰 رصيدك: ${c.balance} P\nيكفيك لنشر ${posts} صورة/فيديو (كل منشور ${AI_POST_COST} P).`
    : `💰 Your balance: ${c.balance} P\nEnough for ${posts} published photos/videos (${AI_POST_COST} P each).`;
}

async function answerSummary(user: AssistUser, uid: string, ar: boolean): Promise<string> {
  const [fd, posts, credits] = await Promise.all([loadFriendsData(uid), loadMyPosts(uid), getCredits(user)]);
  const online = await loadOnline(uid, fd.friends);
  const name = user.name || user.username || '';
  const head = ar ? `📋 ملخص حسابك${name ? ' يا ' + name : ''}` : `📋 Your account summary${name ? ', ' + name : ''}`;
  const rows = ar
    ? [
        `👥 الأصدقاء: ${fd.friends.length}`,
        `🟢 أونلاين الحين: ${online.length}`,
        `📩 طلبات صداقة تنتظرك: ${fd.incoming}`,
        `🖼 المنشورات: ${posts.total} (صور ${posts.photos} · فيديو ${posts.videos} · نص ${posts.textOnly})`,
        `❤️ ${posts.likes}   💬 ${posts.comments}   👁 ${posts.views}`,
        credits ? `💰 الرصيد: ${credits.balance} P` : '',
      ]
    : [
        `👥 Friends: ${fd.friends.length}`,
        `🟢 Online now: ${online.length}`,
        `📩 Requests waiting: ${fd.incoming}`,
        `🖼 Posts: ${posts.total} (photos ${posts.photos} · videos ${posts.videos} · text ${posts.textOnly})`,
        `❤️ ${posts.likes}   💬 ${posts.comments}   👁 ${posts.views}`,
        credits ? `💰 Balance: ${credits.balance} P` : '',
      ];
  const who = online.length
    ? `\n\n${ar ? 'الأونلاين الحين:' : 'Online now:'}\n${online.map(personLine).join('\n')}`
    : '';
  return `${head}\n\n${rows.filter(Boolean).join('\n')}${who}`;
}

function answerAppInfo(ar: boolean): string {
  return ar
    ? [
        '🌍 Stooorna — تطبيق اجتماعي فيه:',
        '',
        '• منشورات صور وفيديو ونصوص، مع إعجاب وتعليق وإعادة نشر ومشاركة',
        '• أصدقاء ومحادثات خاصة وقروبات، وشات عام',
        '• مكالمات صوت وفيديو',
        '• بث LIVE مع هدايا وعملات، وتقسيم الشاشة بين مذيعين',
        '• خريطة GPS حية للأصدقاء',
        '• Templates لنشر وتصفح الصور والفيديوهات',
        '• Stooorna Ai: تعديل الصور والفيديو، إضافة موسيقى، وبحث صور — النشر يكلف 5 P للبوست',
        '',
        'اسألني: «منو أونلاين؟» · «كم بوست أرسلت؟» · «افتح الشات العام»',
      ].join('\n')
    : [
        '🌍 Stooorna — a social app with:',
        '',
        '• Photo, video and text posts with likes, comments, reposts and sharing',
        '• Friends, private chats, groups and a general chat',
        '• Voice and video calls',
        '• LIVE broadcasts with gifts and coins, and split-screen between hosts',
        '• A live GPS map of your friends',
        '• Templates to publish and browse photos and videos',
        `• Stooorna Ai: edit photos and videos, add music, search photos — publishing costs ${AI_POST_COST} P per post`,
        '',
        'Try: "who is online?" · "how many posts did I send?" · "open the general chat"',
      ].join('\n');
}

/** Builds the reply text for a detected intent (performs the action for "openChat"). */
export async function answerAppIntent(intent: AppIntent, text: string, user: AssistUser | null | undefined): Promise<string> {
  const ar = AR_RE.test(text) || (!/[a-z]/i.test(text) && /^ar/i.test(navigator.language || ''));
  if (intent === 'appInfo') return answerAppInfo(ar);
  if (intent === 'openChat') {
    openGeneralChat();
    return ar ? '✅ تمام، فتحت لك الشات العام.' : '✅ Done, opening the general chat for you.';
  }
  const uid = String(user?.id || '');
  if (!uid || !user) return T.noUser(ar);
  switch (intent) {
    case 'online': return answerOnline(uid, ar);
    case 'friends': return answerFriends(uid, ar);
    case 'requests': return answerRequests(uid, ar);
    case 'posts': return answerPosts(uid, ar);
    case 'credits': return answerCredits(user, ar);
    case 'summary': return answerSummary(user, uid, ar);
    default: return '';
  }
}

/* ───────────────────────── data for the white list pages (AiInfoPanel) ───────────────────────── */

export async function getFriendsList(user: AssistUser | null | undefined): Promise<Person[]> {
  const uid = String(user?.id || '');
  return uid ? (await loadFriendsData(uid)).friends : [];
}

export async function getOnlineList(user: AssistUser | null | undefined): Promise<{ online: Person[]; total: number }> {
  const uid = String(user?.id || '');
  if (!uid) return { online: [], total: 0 };
  const fd = await loadFriendsData(uid);
  return { online: await loadOnline(uid, fd.friends), total: fd.friends.length };
}

export async function getRequestsList(user: AssistUser | null | undefined): Promise<{ people: Person[]; count: number }> {
  const uid = String(user?.id || '');
  if (!uid) return { people: [], count: 0 };
  const fd = await loadFriendsData(uid);
  return { people: fd.incomingPeople, count: fd.incoming };
}

export async function getPostsPanel(user: AssistUser | null | undefined): Promise<PostStats | null> {
  const uid = String(user?.id || '');
  return uid ? loadMyPosts(uid) : null;
}

export async function getBalance(user: AssistUser | null | undefined): Promise<number | null> {
  const c = await getCredits(user);
  return c ? c.balance : null;
}

export type PanelKind = 'friends' | 'online' | 'requests' | 'posts' | 'app' | 'summary';

/** Intents that open a white list page instead of writing text in the chat. */
export function intentToPanel(i: AppIntent): PanelKind | null {
  switch (i) {
    case 'friends': return 'friends';
    case 'online': return 'online';
    case 'requests': return 'requests';
    case 'posts': return 'posts';
    case 'summary': return 'summary';
    case 'appInfo': return 'app';
    default: return null;
  }
}
