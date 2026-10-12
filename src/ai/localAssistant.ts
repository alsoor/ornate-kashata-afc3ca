// LOCAL-ASSISTANT: free assistant with no API key and no AI.
// 1) instant answers for common short questions  2) free Wikipedia lookup for "what is / who is" questions.
// Anything else is left to the existing server chat.

/** true = lookup questions are answered from Wikipedia first; false = only the instant answers are used here */
export const USE_FREE_SEARCH = true;

const norm = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\u0621-\u064Aa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pad = (n: number): string => (n < 10 ? '0' + n : String(n));

const DAYS = ['\u0627\u0644\u0623\u062D\u062F', '\u0627\u0644\u0627\u062B\u0646\u064A\u0646', '\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621', '\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621', '\u0627\u0644\u062E\u0645\u064A\u0633', '\u0627\u0644\u062C\u0645\u0639\u0629', '\u0627\u0644\u0633\u0628\u062A'];

const HELP = '\u0627\u0633\u0623\u0644\u0646\u064A \u0639\u0646 \u0627\u0644\u0648\u0642\u062A \u0623\u0648 \u0627\u0644\u062A\u0627\u0631\u064A\u062E\u060C \u0623\u0648 \u0627\u0633\u0623\u0644 \u0623\u064A \u0633\u0624\u0627\u0644 \u0648\u0623\u0628\u062D\u062B \u0644\u0643 \u0639\u0646\u0647 \u0641\u064A \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A.';

type Intent = { keys: string[]; reply: () => string };

const INTENTS: Intent[] = [
  {
    keys: ['\u0634\u0644\u0648\u0646\u0643', '\u0643\u064A\u0641 \u062D\u0627\u0644\u0643', '\u0627\u062E\u0628\u0627\u0631\u0643', 'how are you'],
    reply: () => '\u0627\u0644\u062D\u0645\u062F\u0644\u0644\u0647 \u0628\u062E\u064A\u0631\u060C \u0648\u0627\u0646\u062A \u0634\u0644\u0648\u0646\u0643\u061F',
  },
  {
    keys: ['\u0643\u0645 \u0627\u0644\u0633\u0627\u0639\u0629', '\u0627\u0644\u0633\u0627\u0639\u0629 \u0643\u0645', '\u0627\u0644\u0633\u0627\u0639\u0629 \u0627\u0644\u062D\u064A\u0646', '\u0627\u0644\u0633\u0627\u0639\u0629 \u0627\u0644\u0627\u0646', '\u0643\u0645 \u0627\u0644\u0648\u0642\u062A', '\u0627\u0644\u0648\u0642\u062A \u0627\u0644\u062D\u064A\u0646', 'what time'],
    reply: () => {
      const d = new Date();
      const h = d.getHours();
      return '\u0627\u0644\u0633\u0627\u0639\u0629 \u0627\u0644\u0622\u0646 ' + (h % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' + (h < 12 ? '\u0635' : '\u0645');
    },
  },
  {
    keys: ['\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u064A\u0648\u0645', '\u0643\u0645 \u0627\u0644\u062A\u0627\u0631\u064A\u062E', '\u0634\u0646\u0648 \u0627\u0644\u062A\u0627\u0631\u064A\u062E', '\u0648\u0634 \u0627\u0644\u062A\u0627\u0631\u064A\u062E', '\u0627\u064A\u0634 \u0627\u0644\u062A\u0627\u0631\u064A\u062E', '\u0634\u0646\u0648 \u0627\u0644\u064A\u0648\u0645', '\u0648\u0634 \u0627\u0644\u064A\u0648\u0645', '\u0627\u064A\u0634 \u0627\u0644\u064A\u0648\u0645', 'what day', 'what is the date'],
    reply: () => {
      const d = new Date();
      return DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  {
    keys: ['\u0645\u0646\u0648 \u0627\u0646\u062A', '\u0645\u0646 \u0627\u0646\u062A', '\u0648\u0634 \u0627\u0633\u0645\u0643', '\u0634\u0646\u0648 \u0627\u0633\u0645\u0643', 'who are you'],
    reply: () => '\u0623\u0646\u0627 \u0645\u0633\u0627\u0639\u062F \u0633\u062A\u0648\u0631\u0646\u0627\u060C \u0623\u062C\u0627\u0648\u0628\u0643 \u0639\u0644\u0649 \u0623\u0633\u0626\u0644\u062A\u0643 \u0648\u0623\u0628\u062D\u062B \u0644\u0643 \u0641\u064A \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A.',
  },
  {
    keys: ['\u0634\u0643\u0631\u0627', '\u064A\u0639\u0637\u064A\u0643 \u0627\u0644\u0639\u0627\u0641\u064A\u0647', 'thanks', 'thank you'],
    reply: () => '\u0627\u0644\u0639\u0641\u0648! \u0623\u064A \u0648\u0642\u062A.',
  },
  {
    keys: ['\u0645\u0639 \u0627\u0644\u0633\u0644\u0627\u0645\u0647', '\u0628\u0627\u064A', 'bye'],
    reply: () => '\u0627\u0644\u0644\u0647 \u064A\u062D\u0641\u0638\u0643\u060C \u0645\u0639 \u0627\u0644\u0633\u0644\u0627\u0645\u0629!',
  },
  {
    keys: ['\u0645\u0633\u0627\u0639\u062F\u0647', '\u0633\u0627\u0639\u062F\u0646\u064A', 'help'],
    reply: () => HELP,
  },
  {
    keys: ['\u0645\u0631\u062D\u0628\u0627', '\u0647\u0644\u0627', '\u0627\u0647\u0644\u0627', '\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064A\u0643\u0645', '\u0627\u0644\u0633\u0644\u0627\u0645', 'hi', 'hello'],
    reply: () => '\u0647\u0644\u0627 \u0648\u0627\u0644\u0644\u0647! \u0643\u064A\u0641 \u0623\u0642\u062F\u0631 \u0623\u0633\u0627\u0639\u062F\u0643\u061F',
  },
];

const NO_RESULT_SOURCE_AR = '\u0627\u0644\u0645\u0635\u062F\u0631: \u0648\u064A\u0643\u064A\u0628\u064A\u062F\u064A\u0627';
const NO_RESULT_SOURCE_EN = 'Source: Wikipedia';

/** Instant answer for common SHORT messages (greeting, time, date, thanks...). null = not a quick question. */
export function localQuickAnswer(input: string): string | null {
  const n = norm(input);
  if (!n || n.split(' ').length > 5) return null;
  const text = ' ' + n + ' ';
  for (const it of INTENTS) {
    for (const k of it.keys) {
      if (text.includes(' ' + norm(k) + ' ')) return it.reply();
    }
  }
  return null;
}

const LOOKUP_RE = /(^| )(\u0645\u0646|\u0645\u0627|\u0645\u0627\u0630\u0627|\u0645\u0627\u0647\u0648|\u0645\u0627\u0647\u064A|\u0634\u0646\u0648|\u0645\u0646\u0648|\u0648\u0634|\u0627\u064A\u0634|\u0645\u062A\u064A|\u0648\u064A\u0646|\u0627\u064A\u0646|\u0643\u0645|\u062A\u0639\u0631\u064A\u0641|\u0645\u0639\u0646\u064A|\u0639\u0646|what|who|where|when|define|meaning)( |$)/;

const STOP = ['\u0645\u0646', '\u0645\u0627', '\u0645\u0627\u0630\u0627', '\u0645\u0627\u0647\u0648', '\u0645\u0627\u0647\u064A', '\u0647\u0648', '\u0647\u064A', '\u0634\u0646\u0648', '\u0645\u0646\u0648', '\u0648\u0634', '\u0627\u064A\u0634', '\u062A\u0639\u0631\u064A\u0641', '\u0645\u0639\u0646\u064A', '\u0639\u0646', 'what', 'is', 'who', 'are', 'the', 'define', 'meaning', 'of', 'where', 'when'];

function looksLikeLookup(input: string): boolean {
  if (/[?\u061F]/.test(input)) return true;
  return LOOKUP_RE.test(norm(input));
}

async function wiki(lang: string, q: string, signal?: AbortSignal): Promise<string | null> {
  const url =
    'https://' + lang + '.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=1' +
    '&prop=extracts&exintro=1&explaintext=1&exsentences=3&exlimit=1&format=json&origin=*&gsrsearch=' +
    encodeURIComponent(q);
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener('abort', onAbort);
  }
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const j: any = await r.json();
    const pages = j && j.query && j.query.pages;
    if (!pages) return null;
    const first: any = Object.values(pages)[0];
    const ex = first && first.extract ? String(first.extract).trim() : '';
    return ex ? ex.slice(0, 600) : null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** Free Wikipedia lookup (no key). null = nothing found / offline. */
export async function freeSearch(input: string, signal?: AbortSignal): Promise<string | null> {
  const cleaned = (input || '').replace(/[?\u061F]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w && STOP.indexOf(norm(w)) < 0);
  const q = words.join(' ') || cleaned;
  if (!q) return null;
  const ar = /[\u0621-\u064A]/.test(q);
  try {
    const ex = await wiki(ar ? 'ar' : 'en', q, signal);
    if (!ex) return null;
    return ex + '\n\n' + (ar ? NO_RESULT_SOURCE_AR : NO_RESULT_SOURCE_EN);
  } catch {
    return null;
  }
}

/** Used by the sheet: quick answer first, then (if enabled) Wikipedia for lookup questions, else null -> server chat. */
export async function localAnswer(input: string, signal?: AbortSignal): Promise<string | null> {
  const quick = localQuickAnswer(input);
  if (quick) return quick;
  if (!USE_FREE_SEARCH || !looksLikeLookup(input)) return null;
  return freeSearch(input, signal);
}

// ---------------------------------------------------------------------------
// LINK TO THE CHAT (nothing in StooornaAiSheet.tsx is changed).
// The sheet sends every typed or spoken question to `<api>/chat`. This hook answers that request
// locally when it can (instant answers / Wikipedia). Everything else goes to the normal server untouched.
// Because the sheet speaks the reply when the question was spoken, voice questions are answered by voice.
// ---------------------------------------------------------------------------
const FETCH_MARK = '__stooornaLocalFetch__';
let passing = false;
let reinstalls = 0;

export function installLocalAssistant(): void {
  if (typeof window === 'undefined') return;
  const w: any = window;
  if (typeof w.fetch !== 'function' || w.fetch[FETCH_MARK]) return;
  const orig: (input: any, init?: any) => Promise<Response> = w.fetch.bind(w);

  const wrapped: any = async (input: any, init?: any): Promise<Response> => {
    if (!passing) {
      try {
        const url = typeof input === 'string' ? input : input && input.href ? String(input.href) : '';
        const method = String((init && init.method) || 'GET').toUpperCase();
        if (method === 'POST' && /\/chat(\?|$)/.test(url) && init && typeof init.body === 'string') {
          const body: any = JSON.parse(init.body);
          const msg = body && typeof body.message === 'string' ? body.message.trim() : '';
          if (msg && Array.isArray(body.history) && msg.indexOf('[File:') !== 0) {
            const ans = await localAnswer(msg, init.signal || undefined);
            if (ans) {
              return new Response(JSON.stringify({ reply: ans }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          }
        }
      } catch {
        /* any problem here: just send the normal request */
      }
    }
    passing = true;
    try {
      return orig(input, init);
    } finally {
      passing = false;
    }
  };
  wrapped[FETCH_MARK] = true;
  w.fetch = wrapped;
}

installLocalAssistant();
// If another module wraps fetch after this file loads, put this hook back in front (a few times at most).
if (typeof window !== 'undefined') {
  const t = window.setInterval(() => {
    if ((window as any).fetch && !(window as any).fetch[FETCH_MARK]) {
      installLocalAssistant();
      reinstalls += 1;
    }
    if (reinstalls >= 20) window.clearInterval(t);
  }, 1500);
}
