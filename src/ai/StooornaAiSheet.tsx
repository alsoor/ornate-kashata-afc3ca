import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Send, Clock, PenLine, Image as ImageIcon, Table, Sparkles, Mic } from 'lucide-react';

interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  previewUrl: string; // blob: or data: for local preview
  kind: 'image' | 'file';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'image' | 'table' | 'file';
  data?: any;
  attachments?: Attachment[];
  timestamp: number;
}

interface StooornaAiSheetProps {
  open: boolean;
  onClose: () => void;
  user?: {
    id?: string;
    name?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    image?: string | null;
  } | null;
}

const DARK_GREEN = '#0a1f1a';
const DARKER_GREEN = '#04120f';
const RED = '#ef4444';
const SILVER = '#c0c0c0';

export default function StooornaAiSheet({ open, onClose, user }: StooornaAiSheetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chats, setChats] = useState<{ id: string; title: string; messages: Message[] }[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const avatar = user?.avatarUrl || user?.image || null;
  const displayName = user?.name || user?.username || 'You';

  useEffect(() => {
    if (open && messages.length === 0) {
      // optional welcome
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!currentChatId || messages.length === 0) return;
    const title = (messages[0]?.content || 'Chat').slice(0, 40);
    setChats(prev => {
      const exists = prev.find(c => c.id === currentChatId);
      if (exists) return prev.map(c => c.id === currentChatId ? { ...c, messages, title } : c);
      return [{ id: currentChatId, title, messages }, ...prev];
    });
  }, [messages, currentChatId]);

  const createNewChat = useCallback(() => {
    if (messages.length > 0 && currentChatId) {
      setChats(prev => {
        const existing = prev.find(c => c.id === currentChatId);
        if (existing) {
          return prev.map(c => c.id === currentChatId ? { ...c, messages, title: messages[0]?.content.slice(0, 40) || 'New Chat' } : c);
        }
        return [{ id: currentChatId, title: messages[0]?.content.slice(0, 40) || 'Chat', messages }, ...prev];
      });
    }
    const newId = `chat-${Date.now()}`;
    setCurrentChatId(newId);
    setMessages([]);
    setShowHistory(false);
  }, [messages, currentChatId]);

  const loadChat = (chat: typeof chats[0]) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages);
    setShowHistory(false);
  };

  const deleteChat = (chatId: string) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      setMessages([]);
      setCurrentChatId(null);
    }
  };

  const clearAllHistory = () => {
    setChats([]);
  };

  const deleteCurrentConversation = () => {
    if (currentChatId) {
      setChats(prev => prev.filter(c => c.id !== currentChatId));
    }
    setMessages([]);
    setCurrentChatId(null);
    setShowHistory(false);
  };

  const localReply = (userText: string, hasFiles: boolean) => {
    const t = userText.toLowerCase().trim();
    const ar = /[\u0600-\u06FF]/.test(userText);

    if (hasFiles) {
      return ar
        ? 'تم استلام المرفق بنجاح. اكتب ماذا تريد أن أفعل به (وصف، تلخيص، أفكار، أو تعديل نص).'
        : 'Attachment received. Tell me what you want: describe, summarize, ideas, or edit text.';
    }

    if (!t) {
      return ar ? 'اكتب سؤالك وسأجيبك مباشرة.' : 'Type your question and I will answer.';
    }

    if (/^(hi|hello|hey|yo)\b/.test(t) || /^(السلام|مرحبا|مرحباً|هلا|اهلا|أهلا|هاي)/.test(t)) {
      return ar
        ? 'مرحباً! أنا Stooorna Ai. اسألني أي شيء: شرح، أفكار، كتابة، جداول، أو أرفق ملف/صورة.'
        : 'Hi! I am Stooorna Ai. Ask me anything — explain, write, brainstorm, tables, or attach a file/photo.';
    }

    if (t.includes('من انت') || t.includes('من أنت') || t.includes('who are you') || t.includes('what are you')) {
      return ar
        ? 'أنا Stooorna Ai، مساعدك داخل تطبيق Stooorna. أرد على أسئلتك وأساعدك في الكتابة والأفكار والملفات.'
        : 'I am Stooorna Ai, your assistant inside Stooorna. I answer questions and help with writing, ideas, and files.';
    }

    if (t.includes('شكرا') || t.includes('شكراً') || t.includes('thank')) {
      return ar ? 'العفو! جاهز لأي طلب ثاني.' : 'You are welcome! Ready for the next request.';
    }

    if (t.includes('جدول') || t.includes('table')) {
      return ar
        ? 'حسناً — إليك جدولاً بسيطاً:\n\n| العنصر | الحالة |\n| --- | --- |\n| البث | نشط |\n| المحادثات | جاهزة |\n| Stooorna Ai | يعمل |\n\n اكتب أعمدة/صفوف أخرى إن رغبت.'
        : 'Here is a simple table:\n\n| Item | Status |\n| --- | --- |\n| Live | Active |\n| Chat | Ready |\n| Stooorna Ai | On |\n\nTell me columns/rows if you want another table.';
    }

    if (t.includes('ملخص') || t.includes('summar')) {
      return ar
        ? `ملخص سريع لطلبك:\n• الموضوع: ${userText.slice(0, 120)}\n• المطلوب: تلخيص\n• الخطوة التالية: أرسل النص الطويل وسأختصره بنقاط واضحة.`
        : `Quick summary of your request:\n• Topic: ${userText.slice(0, 120)}\n• Goal: summarize\n• Next: paste the long text and I will shorten it into clear bullets.`;
    }

    if (t.includes('اكتب') || t.includes('كتابة') || t.includes('write') || t.includes('draft')) {
      return ar
        ? `مسودة أولية:\n\n${userText.replace(/اكتب( لي)?/gi, '').trim() || 'نص جاهز حسب طلبك'}\n\nإذا تبيني أطوّرها (أطول / أقصر / رسمي) قل لي.`
        : `Draft:\n\n${userText.replace(/write( me)?/gi, '').trim() || 'Ready text based on your request'}\n\nSay if you want it longer, shorter, or more formal.`;
    }

    if (t.includes('؟') || t.includes('?') || t.startswith('what') || t.startswith('how') || t.startswith('why') || t.startswith('when') || t.startswith('where') || t.startswith('هل') || t.startswith('كيف') || t.startswith('لماذا') || t.startswith('متى') || t.startswith('وين') || t.startswith('وش')) {
      return ar
        ? `بخصوص سؤالك: «${userText}»\n\nأقدر أساعدك بهذا الشكل:\n1) أوضح الفكرة ببساطة\n2) أعطيك خطوات عملية\n3) أمثلة إن احتجت\n\nاكتب تفاصيل أكثر (الهدف / السياق) لأعطيك جواب أدق.`
        : `About your question: "${userText}"\n\nI can help by:\n1) Explaining simply\n2) Giving practical steps\n3) Examples if needed\n\nAdd more detail (goal / context) for a sharper answer.`;
    }

    // default: always useful structured answer
    return ar
      ? `تم:\n\nفهمت طلبك: «${userText.slice(0, 300)}»\n\nاقتراحي:\n• حدّد الهدف النهائي بجملة واحدة\n• إن كان فيه نص طويل، أرسله وأرتبه\n• إن كان فيه صورة/ملف، أرفقه من زر +\n\nأكتب لي الخطوة التالية التي تريدها وسأكمل مباشرة.`
      : `Done.\n\nI understood: "${userText.slice(0, 300)}"\n\nSuggestion:\n• State the end goal in one line\n• If you have long text, paste it and I will organize it\n• If you have a photo/file, attach it with +\n\nTell me the next step and I will continue.`;
  };

  const revokeAttachmentUrls = (list: Attachment[]) => {
    list.forEach(a => {
      try { if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl); } catch { /* */ }
    });
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const next: Attachment[] = [];
    Array.from(files).forEach(file => {
      if (file.size > 12 * 1024 * 1024) return; // 12MB cap per file
      const isImage = file.type.startsWith('image/');
      next.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        kind: isImage ? 'image' : 'file',
      });
    });
    if (next.length) setAttachments(prev => [...prev, ...next].slice(0, 8));
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const gone = prev.find(a => a.id === id);
      if (gone) revokeAttachmentUrls([gone]);
      return prev.filter(a => a.id !== id);
    });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    const pending = attachments;
    if (!trimmed && pending.length === 0) return;

    const content =
      trimmed ||
      (pending.length
        ? pending.map(a => (a.kind === 'image' ? `[Image: ${a.name}]` : `[File: ${a.name}]`)).join(' ')
        : '');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      type: pending.some(a => a.kind === 'image') ? 'image' : pending.length ? 'file' : 'text',
      attachments: pending.length ? pending : undefined,
      timestamp: Date.now(),
    };
    let chatId = currentChatId;
    if (!chatId) {
      chatId = `chat-${Date.now()}`;
      setCurrentChatId(chatId);
    }
    setMessages(prev => {
      const next = [...prev, userMsg];
      // keep history list in sync
      const title = (next[0]?.content || 'Chat').slice(0, 40);
      setChats(prevChats => {
        const exists = prevChats.find(c => c.id === chatId);
        if (exists) return prevChats.map(c => c.id === chatId ? { ...c, messages: next, title } : c);
        return [{ id: chatId!, title, messages: next }, ...prevChats];
      });
      return next;
    });
    setInput('');
    setAttachments([]);
    setIsTyping(true);

    const lower = content.toLowerCase();
    // Lightweight client-side tools (table / placeholder image) still work offline
    if (lower.includes('table') || lower.includes('جدول')) {
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Here is a summary table:',
        type: 'table',
        data: {
          headers: ['Feature', 'Status', 'Notes'],
          rows: [
            ['Voice Live', 'Active', 'Real-time'],
            ['Camera Live', 'Active', 'HD'],
            ['AI Assistant', 'New', 'Stooorna Ai'],
          ],
        },
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      return;
    }

    // Call independent Stooorna Ai backend (Ai/ folder → FastAPI)
    const apiBase =
      (typeof window !== 'undefined' && (window as any).__STOOORNA_AI_API__) ||
      (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_STOOORNA_AI_URL) ||
      (typeof process !== 'undefined' && (process as any).env?.VITE_STOOORNA_AI_URL) ||
      'http://127.0.0.1:8000/ai';

    // Always answer. Prefer API if available (short timeout), otherwise local engine.
    try {
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? window.setTimeout(() => controller.abort(), 2500) : 0;
      const res = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history,
          use_rag: lower.includes('search') || lower.includes('ابحث') || lower.includes('من المعرفة'),
        }),
        signal: controller?.signal,
      });
      if (timer) window.clearTimeout(timer);
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      const reply = (data.reply || '').trim();
      if (!reply) throw new Error('empty');
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
        type: 'text',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      await new Promise(r => setTimeout(r, 350 + Math.random() * 350));
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: localReply(content, pending.length > 0),
        type: 'text',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 24000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          height: '92dvh',
          background: '#ffffff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.35)',
          animation: 'stooornaAiSheetUp 0.38s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              {avatar ? (
                <img
                  src={avatar}
                  alt={displayName}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: DARK_GREEN, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14,
                  }}
                >
                  {(displayName[0] || 'S').toUpperCase()}
                </div>
              )}
              <span
                style={{
                  position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
                  background: '#22c55e', borderRadius: '50%', border: '2px solid #fff',
                }}
              />
            </div>
          </div>

          {/* Red banner with shimmer */}
          <div
            style={{
              position: 'relative',
              background: '#0a0a0a',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 20,
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            <span style={{ position: 'relative', zIndex: 1, color: '#f5f5f5', textShadow: 'none' }}>
              Stooorna Ai
            </span>
            <span
              style={{
                position: 'absolute',
                top: 0, left: '-100%',
                width: '60%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                animation: 'stooornaAiShimmer 2.2s infinite',
                pointerEvents: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              aria-label="History"
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none',
                background: 'rgba(0,0,0,0.04)', color: '#333', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Clock size={18} />
            </button>
            <button
              type="button"
              onClick={createNewChat}
              aria-label="New chat"
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none',
                background: 'rgba(0,0,0,0.04)', color: '#333', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <PenLine size={18} />
            </button>
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <div
            style={{
              position: 'absolute',
              top: 60, right: 12, zIndex: 10,
              width: 260, maxHeight: 320, overflowY: 'auto',
              background: '#fff', borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              border: '1px solid rgba(0,0,0,0.08)',
              padding: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 4px 8px' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#333' }}>Previous chats</p>
              {chats.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllHistory}
                  style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 6px' }}
                >
                  Delete all
                </button>
              )}
            </div>
            {chats.length === 0 && (
              <p style={{ margin: 8, color: '#888', fontSize: 12 }}>No history yet</p>
            )}
            {chats.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  borderRadius: 8, padding: '2px 2px',
                  background: c.id === currentChatId ? 'rgba(0,0,0,0.04)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => loadChat(c)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '8px 10px',
                    border: 'none', background: 'transparent', borderRadius: 8,
                    cursor: 'pointer', fontSize: 13, color: '#222',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {c.title || 'Chat'}
                </button>
                <button
                  type="button"
                  aria-label="Delete chat"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}
                  style={{
                    width: 28, height: 28, border: 'none', borderRadius: 8,
                    background: 'transparent', color: '#ef4444', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    fontSize: 16, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={deleteCurrentConversation}
                style={{
                  width: '100%', marginTop: 8, padding: '8px 10px',
                  border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)', color: '#ef4444',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Delete current chat
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          style={{
            flex: 1, overflowY: 'auto', padding: '24px 16px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>
                What should we explore?
              </p>
            </div>
          )}

          {messages.map(m => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: 16,
                background: m.role === 'user' ? DARK_GREEN : '#f4f4f5',
                color: m.role === 'user' ? '#fff' : '#1a1a1a',
                fontSize: 15,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {m.attachments.map(a => (
                    a.kind === 'image' ? (
                      <img
                        key={a.id}
                        src={a.previewUrl}
                        alt={a.name}
                        style={{ maxWidth: 180, maxHeight: 160, borderRadius: 10, objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <a
                        key={a.id}
                        href={a.previewUrl}
                        download={a.name}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 10px', borderRadius: 10,
                          background: m.role === 'user' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                          color: 'inherit', fontSize: 13, textDecoration: 'none', maxWidth: 200,
                        }}
                      >
                        📎 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      </a>
                    )
                  ))}
                </div>
              )}
              {m.type === 'image' && m.data?.url && (
                <img
                  src={m.data.url}
                  alt="generated"
                  style={{ width: '100%', borderRadius: 10, marginTop: 8, display: 'block' }}
                />
              )}
              {m.type === 'table' && m.data && (
                <div style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {m.data.headers.map((h: string) => (
                          <th key={h} style={{ border: '1px solid #ddd', padding: 6, background: '#eee', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.data.rows.map((row: string[], i: number) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ border: '1px solid #ddd', padding: 6 }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 16, background: '#f4f4f5' }}>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: 6, height: 6, borderRadius: '50%', background: '#888',
                      animation: 'stooornaAiDot 1.2s infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar — dark green-black */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '10px 12px max(12px, env(safe-area-inset-bottom))',
            background: '#fff',
            borderTop: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.md,.zip"
            style={{ display: 'none' }}
            onChange={e => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {attachments.map(a => (
                <div
                  key={a.id}
                  style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: '#f4f4f5',
                    maxWidth: 120,
                  }}
                >
                  {a.kind === 'image' ? (
                    <img src={a.previewUrl} alt={a.name} style={{ width: 120, height: 80, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#333', maxWidth: 120 }}>
                      📎 {a.name.length > 18 ? a.name.slice(0, 16) + '…' : a.name}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => removeAttachment(a.id)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 22, height: 22, borderRadius: '50%', border: 'none',
                      background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: `linear-gradient(180deg, ${DARK_GREEN} 0%, ${DARKER_GREEN} 100%)`,
              borderRadius: 24,
              padding: '6px 6px 6px 10px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              aria-label="Tools"
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus size={20} strokeWidth={2.2} />
            </button>

            <button
              type="button"
              aria-label="Attach file"
              title="Attach photo or file"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <ImageIcon size={18} strokeWidth={2.2} />
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: 15, padding: '8px 0',
              }}
            />

            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginRight: 4 }}>Fast</span>

            <button
              type="submit"
              disabled={(!input.trim() && attachments.length === 0) || isTyping}
              aria-label="Send"
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: (input.trim() || attachments.length) ? RED : 'rgba(239,68,68,0.4)',
                color: '#fff', cursor: (input.trim() || attachments.length) ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Send size={16} strokeWidth={2.4} />
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes stooornaAiSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes stooornaAiShimmer {
          0% { left: -100%; }
          100% { left: 150%; }
        }
        @keyframes stooornaAiDot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
