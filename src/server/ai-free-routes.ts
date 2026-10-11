/**
 * Stooorna Ai — FREE server routes (v1.0.0)
 * Place at: server/ai-free-routes.ts   (next to ai-credits-routes.ts)
 *
 * Gives the existing client (src/ai/aiCapabilities.ts) the endpoints it already calls:
 *   POST /ai/chat            text reply (Arabic / English / any language), context via "history", image understanding
 *   POST /ai/search          web search (answer + sources)
 *   POST /ai/image-generate  image creation  -> { image_base64, image_mime }
 *   POST /ai/image-edit      edit a photo / answer a question about it (multipart: prompt + images)
 *   POST /ai/transcribe      voice -> text (multipart: audio + lang)
 *   POST /ai/file-read       PDF / Word text extraction (multipart "file")
 *   GET  /ai/health          which free providers are active
 *
 * 100% free: every provider below has a free tier / needs no key. Nothing in the existing files is changed.
 *
 * Optional env keys (all free to create). If none is set, the keyless fallback is used:
 *   GEMINI_API_KEY   (aistudio.google.com — free tier: text + image understanding + Google Search grounding)
 *   GROQ_API_KEY     (console.groq.com — free tier, very fast text)
 *   OPENROUTER_API_KEY (openrouter.ai — free ":free" models)
 *   No key at all    -> Pollinations text (text.pollinations.ai) + Pollinations images + Wikipedia search
 */
import type { Express, Request, Response } from "express";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM_AR =
  "أنت Stooorna Ai، مساعد ذكي ودود داخل تطبيق Stooorna. أجب بنفس لغة المستخدم (العربية أو الإنجليزية أو أي لغة أخرى)، " +
  "بوضوح وباختصار مفيد، واكتب الكود داخل كتل Markdown عند البرمجة. إذا وصلتك نتائج بحث أو ملفات داخل الرسالة فاعتمد عليها واذكر المصدر.";
const SYSTEM_EN =
  "You are Stooorna Ai, a friendly assistant inside the Stooorna app. Reply in the user's language, clearly and helpfully. " +
  "Use Markdown code blocks for code. If search results or files are included in the message, rely on them and cite the source link.";

const pick = (o: any, keys: string[]) => { for (const k of keys) if (typeof o?.[k] === "string" && o[k].trim()) return String(o[k]); return ""; };
const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}, ms = 14000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

/* ---------------------------------------------------------------- text providers (free) */

function toOpenAiMessages(system: string, history: Msg[], user: string, image?: { data: string; mime: string }): any[] {
  const msgs: any[] = [{ role: "system", content: system }];
  for (const h of history) msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
  if (image) {
    msgs.push({ role: "user", content: [
      { type: "text", text: user || "Describe this image." },
      { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}` } },
    ] });
  } else msgs.push({ role: "user", content: user });
  return msgs;
}

async function geminiChat(system: string, history: Msg[], user: string, image?: { data: string; mime: string }, grounded = false): Promise<{ text: string; sources: Array<{ title: string; url: string }> } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const contents: any[] = history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] }));
  const parts: any[] = [{ text: user || "Describe this image." }];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  contents.push({ role: "user", parts });
  const body: any = { systemInstruction: { parts: [{ text: system }] }, contents };
  if (grounded) body.tools = [{ google_search: {} }];
  const d = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, body);
  const cand = d?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  if (!text) return null;
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c: any) => ({ title: c?.web?.title || "", url: c?.web?.uri || "" })).filter((s: any) => s.url).slice(0, 5);
  return { text, sources };
}

async function openAiStyle(url: string, key: string, model: string, msgs: any[], extra: Record<string, string> = {}): Promise<string> {
  const d = await postJson(url, { model, messages: msgs, temperature: 0.7, max_tokens: 1800 }, { Authorization: `Bearer ${key}`, ...extra });
  return String(d?.choices?.[0]?.message?.content || "").trim();
}

async function freeChat(system: string, history: Msg[], user: string, image?: { data: string; mime: string }): Promise<string> {
  // 1) Gemini (free tier, supports images)
  const g = await geminiChat(system, history, user, image);
  if (g?.text) return g.text;
  const msgs = toOpenAiMessages(system, history, user, image);
  // 2) Groq (free tier) — text only, or its free vision model when an image is attached
  if (process.env.GROQ_API_KEY) {
    const model = image ? (process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct") : (process.env.GROQ_MODEL || "llama-3.3-70b-versatile");
    const t = await openAiStyle("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, model, msgs);
    if (t) return t;
  }
  // 3) OpenRouter free models
  if (process.env.OPENROUTER_API_KEY) {
    const t = await openAiStyle("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", msgs);
    if (t) return t;
  }
  // 4) Keyless fallback: Pollinations (free, no account)
  for (const model of ["openai"]) {
    const d = await postJson("https://text.pollinations.ai/openai", { model, messages: msgs, private: true }, {}, 14000);
    const t = String(d?.choices?.[0]?.message?.content || "").trim();
    if (t) return t;
  }
  return "";
}

/* ---------------------------------------------------------------- search + image + file */

async function wikiSearch(q: string, lang: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
  try {
    const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`);
    const d: any = await r.json();
    return (d?.query?.search || []).map((h: any) => ({
      title: h.title,
      snippet: String(h.snippet || "").replace(/<[^>]*>/g, ""),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(h.title).replace(/ /g, "_"))}`,
    }));
  } catch { return []; }
}

async function generateImageFree(prompt: string): Promise<{ data: string; mime: string } | null> {
  const seed = Math.floor(Math.random() * 1e9);
  // Pollinations: free, no key. (Arabic prompts are translated by the text model first for better results.)
  let p = prompt;
  if (isArabic(prompt)) {
    const t = await freeChat("Translate the user's image request into a short, vivid English image prompt. Output ONLY the prompt.", [], prompt);
    if (t) p = t.slice(0, 500);
  }
  try {
    const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true&seed=${seed}`);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    if (buf.length < 2000 || !/^image\//.test(mime)) return null;
    return { data: buf.toString("base64"), mime };
  } catch { return null; }
}

// names kept in variables so Vite/Rollup does not try to resolve them at build time
const OPTIONAL_PDF = "pdf-parse";
const OPTIONAL_DOCX = "mammoth";

async function extractFileText(name: string, buf: Buffer): Promise<string> {
  if (/\.pdf$/i.test(name)) {
    try {
      const mod: any = await import(/* @vite-ignore */ OPTIONAL_PDF); // npm i pdf-parse  (optional, loaded at runtime only)
      const fn = mod.default || mod;
      const d = await fn(buf);
      return String(d?.text || "");
    } catch { return ""; }
  }
  if (/\.docx$/i.test(name)) {
    try {
      const mammoth: any = await import(/* @vite-ignore */ OPTIONAL_DOCX); // npm i mammoth  (optional, loaded at runtime only)
      const d = await (mammoth.default || mammoth).extractRawText({ buffer: buf });
      return String(d?.value || "");
    } catch { return ""; }
  }
  return "";
}


/* ---------------------------------------------------------------- multipart (no extra libs) */

type Part = { name: string; filename?: string; mime?: string; data: Buffer };

async function readMultipart(req: Request, maxBytes = 25 * 1024 * 1024): Promise<Part[] | null> {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(req.headers["content-type"] || ""));
  if (!m) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as any) { size += c.length; if (size > maxBytes) return null; chunks.push(c as Buffer); }
  const raw = Buffer.concat(chunks);
  const delim = Buffer.from(`--${m[1] || m[2]}`);
  const parts: Part[] = [];
  let pos = raw.indexOf(delim);
  while (pos >= 0) {
    pos += delim.length;
    if (raw.slice(pos, pos + 2).toString() === "--") break;
    if (raw.slice(pos, pos + 2).toString() === "\r\n") pos += 2;
    const headEnd = raw.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (headEnd < 0) break;
    const head = raw.slice(pos, headEnd).toString("utf8");
    const next = raw.indexOf(delim, headEnd + 4);
    if (next < 0) break;
    parts.push({
      name: /name="([^"]*)"/i.exec(head)?.[1] || "",
      filename: /filename="([^"]*)"/i.exec(head)?.[1],
      mime: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim(),
      data: raw.slice(headEnd + 4, next - 2),
    });
    pos = next;
  }
  return parts;
}

const EDIT_RE = /(عدل|عدّل|غير|غيّر|احذف|ازل|أزل|امسح|اضف|أضف|حول|حوّل|اجعل|لون|خلفي[هة]|ارسم|فلتر|كرتون|أنمي|انمي|edit|remove|erase|add|change|make|turn|replace|background|cartoon|filter|enhance|restore|colorize)/i;

async function geminiImageEdit(prompt: string, images: Array<{ data: string; mime: string }>): Promise<{ data: string; mime: string; text: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const parts: any[] = [{ text: prompt }, ...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } }))];
  const d = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }, {}, 40000);
  const ps: any[] = d?.candidates?.[0]?.content?.parts || [];
  const img = ps.find(x => (x.inlineData || x.inline_data)?.data);
  if (!img) return null;
  const idata = img.inlineData || img.inline_data;
  return { data: idata.data, mime: idata.mimeType || idata.mime_type || "image/png", text: ps.map(x => x.text || "").join("").trim() };
}

async function transcribeAudio(buf: Buffer, mime: string, lang: string): Promise<string> {
  if (process.env.GROQ_API_KEY) { // Whisper on Groq free tier (accepts webm/ogg/mp3/wav/m4a)
    try {
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: mime || "audio/webm" }), "voice.webm");
      fd.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo");
      if (lang) fd.append("language", lang);
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: fd });
      if (r.ok) { const d: any = await r.json(); const t = String(d?.text || "").trim(); if (t) return t; }
    } catch { /* next */ }
  }
  if (process.env.GEMINI_API_KEY) { // Gemini audio understanding (works best with ogg/mp3/wav)
    const d = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      { contents: [{ role: "user", parts: [{ text: "Transcribe this audio exactly as spoken. Output ONLY the transcription." }, { inline_data: { mime_type: mime || "audio/webm", data: buf.toString("base64") } }] }] }, {}, 30000);
    const t = String(d?.candidates?.[0]?.content?.parts?.map((x: any) => x.text || "").join("") || "").trim();
    if (t) return t;
  }
  return "";
}

/* ---------------------------------------------------------------- routes */

export function registerAiFreeRoutes(app: Express, opts: { json?: any } = {}) {
  const cors = (req: Request, res: Response, next: () => void) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; } // preflight (works on Express 4 and 5)
    next();
  };
  app.use("/ai", cors);

  app.get("/ai/health", (_req, res) => {
    res.json({
      ok: true,
      providers: {
        gemini: !!process.env.GEMINI_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
        keyless_fallback: true,
      },
    });
  });

  // ---- chat
  app.post("/ai/chat", async (req: Request, res: Response) => {
    try {
      const b: any = req.body || {};
      let user = pick(b, ["message", "prompt", "text", "query", "input"]);
      if (!user && Array.isArray(b.messages)) {
        for (let i = b.messages.length - 1; i >= 0; i--) if (b.messages[i]?.role === "user" && typeof b.messages[i].content === "string") { user = b.messages[i].content; break; }
      }
      if (!user.trim()) return res.status(400).json({ reply: "", error: "empty message" });
      user = user.slice(0, 32000);

      const ar = (b.lang ? /^ar/i.test(String(b.lang)) : isArabic(user));
      const history: Msg[] = (Array.isArray(b.history) ? b.history : [])
        .filter((h: any) => h && typeof h.content === "string" && h.content.trim())
        .slice(-12).map((h: any) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content).slice(0, 1500) }));

      // image understanding (field names vary between sheet versions)
      let image: { data: string; mime: string } | undefined;
      const rawImg: string = pick(b, ["image_base64", "image", "imageBase64"]) || (Array.isArray(b.images) && typeof b.images[0] === "string" ? b.images[0] : "");
      if (rawImg) {
        const m = /^data:([^;]+);base64,/.exec(rawImg);
        image = { data: rawImg.replace(/^data:[^,]*,/, ""), mime: m?.[1] || pick(b, ["image_mime", "mime"]) || "image/jpeg" };
      }

      const reply = await freeChat(ar ? SYSTEM_AR : SYSTEM_EN, history, user, image);
      if (!reply) return res.status(502).json({ reply: ar ? "تعذر الرد الحين، جرب بعد لحظات." : "Could not answer right now, please try again." });
      res.json({ reply });
    } catch (e) {
      console.error("[ai/chat]", e);
      res.status(500).json({ reply: "", error: "server error" });
    }
  });

  // ---- web search
  app.post("/ai/search", async (req: Request, res: Response) => {
    try {
      const q = pick(req.body, ["query", "q", "text"]).slice(0, 200);
      if (!q) return res.json({ results: [] });
      const lang = /^ar/i.test(String(req.body?.lang || "")) || isArabic(q) ? "ar" : "en";
      const g = await geminiChat(lang === "ar" ? SYSTEM_AR : SYSTEM_EN, [], q, undefined, true); // Google-grounded answer
      if (g?.text) return res.json({ answer: g.text, results: g.sources });
      res.json({ results: (await wikiSearch(q, lang)).map(r => ({ title: r.title, snippet: r.snippet, url: r.url })) });
    } catch { res.json({ results: [] }); }
  });

  // ---- image creation
  app.post("/ai/image-generate", async (req: Request, res: Response) => {
    try {
      const prompt = pick(req.body, ["prompt", "text", "query"]).slice(0, 600);
      if (!prompt) return res.status(400).json({ error: "empty prompt" });
      const img = await generateImageFree(prompt);
      if (!img) return res.status(502).json({ error: "image service busy" });
      res.json({ image_base64: img.data, image_mime: img.mime });
    } catch { res.status(500).json({ error: "server error" }); }
  });

  // ---- file reading (PDF / DOCX): multipart field "file"
  app.post("/ai/file-read", async (req: Request, res: Response) => {
    try {
      const parts = await readMultipart(req, 15 * 1024 * 1024);
      const f = parts?.find(x => x.name === "file" || x.filename);
      if (!f) return res.json({ text: "" });
      const text = (await extractFileText(f.filename || "file", f.data)).replace(/\s+\n/g, "\n").trim().slice(0, 40000);
      res.json({ text });
    } catch { res.json({ text: "" }); }
  });

  // ---- image edit / image question (the sheet sends multipart: prompt + images)
  app.post("/ai/image-edit", async (req: Request, res: Response) => {
    try {
      const parts = await readMultipart(req);
      if (!parts) return res.status(400).json({ reply: "" });
      const prompt = (parts.find(x => x.name === "prompt")?.data.toString("utf8") || "").trim().slice(0, 2000);
      const images = parts.filter(x => x.name === "images" || /^image\//.test(x.mime || "")).slice(0, 3)
        .map(x => ({ data: x.data.toString("base64"), mime: /^image\//.test(x.mime || "") ? String(x.mime) : "image/jpeg" }));
      if (!images.length) return res.status(400).json({ reply: "" });
      const ar = isArabic(prompt);

      if (prompt && EDIT_RE.test(prompt)) { // real edit -> Gemini image model (needs GEMINI_API_KEY)
        const out = await geminiImageEdit(prompt, images);
        if (out) return res.json({ reply: out.text || (ar ? "تفضل، هذي الصورة بعد التعديل 🎨" : "Here is the edited image 🎨"), image_base64: out.data, image_mime: out.mime });
      }
      // question about the photo (or edit not available) -> vision answer
      const reply = await freeChat(ar ? SYSTEM_AR : SYSTEM_EN, [], prompt || (ar ? "وش في هذي الصورة؟" : "Describe this image."), images[0]);
      if (!reply) return res.status(502).json({ reply: "" });
      res.json({ reply });
    } catch (e) { console.error("[ai/image-edit]", e); res.status(500).json({ reply: "" }); }
  });

  // ---- voice -> text (multipart: audio + lang)
  app.post("/ai/transcribe", async (req: Request, res: Response) => {
    try {
      const parts = await readMultipart(req);
      const a = parts?.find(x => x.name === "audio" || x.filename);
      if (!a || a.data.length < 200) return res.json({ text: "" });
      const lang = (parts?.find(x => x.name === "lang")?.data.toString("utf8") || "").trim().slice(0, 5);
      res.json({ text: await transcribeAudio(a.data, a.mime || "audio/webm", lang) });
    } catch { res.json({ text: "" }); }
  });

  console.log("[ai-free] routes ready: /ai/chat /ai/search /ai/image-generate /ai/image-edit /ai/transcribe /ai/file-read");
}
