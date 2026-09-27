// Drop-in patch for published in-app links
function composerShortCode(raw: string): string | null {
  try {
    const u = new URL(raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`);
    const m = u.pathname.match(/^\/s\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function composerLookupOriginalUrl(maybeShort: string): string {
  const raw = String(maybeShort || '').trim();
  if (!raw) return raw;
  const code = composerShortCode(raw);
  if (!code) return raw;
  try {
    const list = JSON.parse(localStorage.getItem(COMPOSER_SHORT_LINKS_KEY) || '[]') as Array<{ code: string; url: string; shortUrl?: string }>;
    const hit = list.find(e => e.code === code || (e.shortUrl && String(e.shortUrl).includes(`/s/${code}`)));
    if (hit?.url && !composerShortCode(hit.url)) return hit.url;
  } catch { /* */ }
  return raw;
}

async function composerResolveTarget(raw: string): Promise<string> {
  const first = composerLookupOriginalUrl(raw);
  if (first && !composerShortCode(first)) return composerNormalizeUrl(first) || first;
  const code = composerShortCode(raw) || composerShortCode(first);
  if (code) {
    try {
      const r = await fetch(`/api/short-links/${encodeURIComponent(code)}`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { url?: string; original?: string; target?: string };
        const target = d.url || d.original || d.target;
        if (target) {
          const n = composerNormalizeUrl(target) || target;
          if (!composerShortCode(n)) {
            composerSaveShortLink({ code, url: n, shortUrl: `https://stooorna.com/s/${code}`, createdAt: Date.now() });
            return n;
          }
        }
      }
    } catch { /* */ }
  }
  return composerNormalizeUrl(first) || first || raw;
}


/** استخراج معرف التغريدة من رابط x.com / twitter.com */

async function fetchWithTimeout(resource: string, ms = 4500): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(resource, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

async function fetchInAppHtml(pageUrl: string): Promise<string | null> {
  const proxies = [
    `https://r.jina.ai/${pageUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ];
  for (const src of proxies) {
    const r = await fetchWithTimeout(src, 4500);
    if (!r || !r.ok) continue;
    try {
      const text = await r.text();
      if (!text.trim()) continue;
      if (src.includes('r.jina.ai')) {
        const safe = text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
        return `<html><head><meta charset="utf-8"><base href="${pageUrl}"><style>body{font-family:sans-serif;padding:16px;line-height:1.55;color:#111;background:#fff;white-space:pre-wrap;word-break:break-word}</style></head><body>${safe}</body></html>`;
      }
      if (/<html|<body|<div|<p|<img|<article/i.test(text)) return rewriteHtmlForInApp(text, pageUrl);
    } catch { /* next */ }
  }
  return null;
}

function ComposerSiteViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const hrefIn = composerNormalizeUrl(url) || String(url || '').trim();
  const [href, setHref] = useState(hrefIn);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [xMedia, setXMedia] = useState<{ url: string; type: 'image' | 'video' }[] | null>(null);
  const [kind, setKind] = useState<'site' | 'image' | 'video' | 'pdf' | 'x'>('site');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setXMedia(null);
    setSrcDoc(null);
    setFrameSrc(null);
    setLoading(true);
    setKind('site');
    const run = async () => {
      const target = await composerResolveTarget(hrefIn);
      if (cancelled) return;
      setHref(target);
      const mediaKind = classifyMediaUrl(target) || classifyDirectMediaUrl(target);
      if (mediaKind === 'image' || mediaKind === 'video') {
        setKind(mediaKind);
        setLoading(false);
        return;
      }
      if (/\.pdf(\?|$)/i.test(target)) {
        setKind('pdf');
        setFrameSrc(`https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(target)}`);
        setLoading(false);
        return;
      }
      const embed = inAppEmbedSrc(target);
      if (embed) {
        setFrameSrc(embed);
        setLoading(false);
        return;
      }
      if (parseXStatusId(target)) {
        const items = await resolveXStatusMedia(target);
        if (cancelled) return;
        if (items.length) {
          setKind('x');
          setXMedia(items);
          setLoading(false);
          return;
        }
      }
      const html = await fetchInAppHtml(target);
      if (cancelled) return;
      if (html) setSrcDoc(html);
      else {
        const fallbackEmbed = inAppEmbedSrc(target);
        setFrameSrc(fallbackEmbed || `https://r.jina.ai/${target}`);
      }
      setKind('site');
      setLoading(false);
    };
    void run();
    const failSafe = window.setTimeout(() => { if (!cancelled) setLoading(false); }, 8000);
    return () => { cancelled = true; window.clearTimeout(failSafe); };
  }, [hrefIn]);
  if (!href) return null;
  const node = (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 16000, background: '#0b0b0b',
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: 'max(10px, env(safe-area-inset-top)) 12px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#111',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close site"
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={18} strokeWidth={2.4} />
        </button>
        <p style={{ margin: 0, flex: 1, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{composerPublicShortUrl(hrefIn) || composerPublicShortUrl(href)}</p>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: '#fff', position: 'relative' }}>
        {loading ? (
          <p style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading…</p>
        ) : kind === 'image' ? (
          <img src={resolveMediaUrl(href)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : kind === 'video' ? (
          <video src={resolveMediaUrl(href)} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : xMedia && xMedia.length ? (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: '#000' }}>
            {xMedia.map((m, i) => m.type === 'video'
              ? <video key={i} src={m.url} controls autoPlay playsInline style={{ width: '100%', maxHeight: '100%', background: '#000' }} />
              : <img key={i} src={m.url} alt="" style={{ width: '100%', objectFit: 'contain' }} />
            )}
          </div>
        ) : srcDoc ? (
          <iframe
            title="Site preview"
            srcDoc={srcDoc}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        ) : (
          <iframe
            title="Site preview"
            src={frameSrc || href}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        )}
      </div>
    </motion.div>
  );
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

