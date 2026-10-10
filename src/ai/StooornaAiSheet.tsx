import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Send, Clock, PenLine, Image as ImageIcon } from 'lucide-react';

interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  previewUrl: string;
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

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
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
const CHATS_KEY = 'stooorna_ai_chats_v1';

function loadChats(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveChats(chats: ChatSession[]) {
  try {
    const slim = chats.slice(0, 50).map(c => ({
      ...c,
      messages: (c.messages || []).map(m => ({
        ...m,
        attachments: m.attachments?.map(a => ({
          ...a,
          previewUrl: a.kind === 'image' ? '' : a.previewUrl,
        })),
      })),
    }));
    localStorage.setItem(CHATS_KEY, JSON.stringify(slim));
  } catch { /* */ }
}


/**
 * Where the Ai backend lives.
 * Priority: window.__STOOORNA_AI_API__  >  VITE_AI_API_URL  >  localhost (dev)  >  same-origin /ai (production)
 */
function getAiApiBase(): string {
  try {
    const w: any = typeof window !== 'undefined' ? window : {};
    if (w.__STOOORNA_AI_API__) return String(w.__STOOORNA_AI_API__).replace(/\/+$/, '');
    const envUrl = (import.meta as any)?.env?.VITE_AI_API_URL;
    if (envUrl) return String(envUrl).replace(/\/+$/, '');
    const host = w.location?.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8000/ai';
  } catch { /* */ }
  return '/ai';
}

function pickReply(data: any): string {
  if (!data) return '';
  const v = data.reply ?? data.response ?? data.answer ?? data.message ?? data.text ?? data.content ?? '';
  return (typeof v === 'string' ? v : JSON.stringify(v)).trim();
}

export function buildLocalReply(userText: string, hasFiles: boolean): string {
  const t = userText.toLowerCase().trim();
  const ar = /[\u0600-\u06FF]/.test(userText);

  if (hasFiles) {
    return ar
      ? 'تم استلام المرفق. اكتب ماذا تريد: وصف، تلخيص، أو أفكار.'
      : 'Attachment received. Tell me what you need: describe, summarize, or ideas.';
  }
  if (!t) {
    return ar ? 'اكتب سؤالك وسأجيبك.' : 'Type your question and I will answer.';
  }
  if (/^(hi|hello|hey)\b/.test(t) || /^(السلام|مرحبا|مرحباً|هلا|اهلا|أهلا|هاي)/.test(t)) {
    return ar
      ? 'مرحباً! أنا Stooorna Ai. اسألني أي شيء أو أرفق صورة/ملف.'
      : 'Hi! I am Stooorna Ai. Ask me anything or attach a photo/file.';
  }
  if (t.includes('من انت') || t.includes('من أنت') || t.includes('who are you')) {
    return ar
      ? 'أنا Stooorna Ai، مساعدك داخل Stooorna.'
      : 'I am Stooorna Ai, your assistant inside Stooorna.';
  }
  if (t.includes('شكرا') || t.includes('thank')) {
    return ar ? 'العفو! جاهز لأي طلب.' : 'You are welcome!';
  }
  if (t.includes('جدول') || t.includes('table')) {
    return ar
      ? 'جدول سريع:\n\n| العنصر | الحالة |\n| --- | --- |\n| البث | نشط |\n| Ai | يعمل |'
      : 'Quick table:\n\n| Item | Status |\n| --- | --- |\n| Live | Active |\n| Ai | On |';
  }
  if (t.includes('؟') || t.includes('?') || /^(how|what|why|when|where|هل|كيف|لماذا|متى|وين|وش)/.test(t)) {
    return ar
      ? `بخصوص: «${userText.slice(0, 200)}»\n\nأقدر أساعدك بشرح مبسط وخطوات عملية. أضف تفاصيل أكثر للجواب الأدق.`
      : `About: "${userText.slice(0, 200)}"\n\nI can explain simply and give practical steps. Add more detail for a sharper answer.`;
  }
  return ar
    ? `فهمت: «${userText.slice(0, 280)}»\n\nتم تسجيل طلبك. أكمل التفاصيل أو اطلب الخطوة التالية وسأكمل.`
    : `Got it: "${userText.slice(0, 280)}"\n\nRequest noted. Add detail or the next step and I will continue.`;
}

export default function StooornaAiSheet({ open, onClose, user }: StooornaAiSheetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>(() => loadChats());
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatar = user?.avatarUrl || user?.image || null;
  const displayName = user?.name || user?.username || 'You';

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
    if (!open) setShowHistory(false);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const syncChat = useCallback((chatId: string, msgs: Message[]) => {
    const title = (msgs[0]?.content || 'Chat').slice(0, 40);
    setChats(prev => {
      const exists = prev.find(c => c.id === chatId);
      if (exists) return prev.map(c => (c.id === chatId ? { ...c, messages: msgs, title } : c));
      return [{ id: chatId, title, messages: msgs }, ...prev];
    });
  }, []);

  const createNewChat = () => {
    if (messages.length > 0 && currentChatId) {
      syncChat(currentChatId, messages);
    }
    setCurrentChatId(`chat-${Date.now()}`);
    setMessages([]);
    setShowHistory(false);
    setAttachments([]);
  };

  const loadChat = (chat: ChatSession) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
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
    try { localStorage.removeItem(CHATS_KEY); } catch { /* */ }
  };

  const deleteCurrentConversation = () => {
    if (currentChatId) deleteChat(currentChatId);
    else setMessages([]);
    setShowHistory(false);
  };

  const closePopups = () => {
    setShowHistory(false);
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const next: Attachment[] = [];
    Array.from(files).forEach(file => {
      if (file.size > 12 * 1024 * 1024) return;
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
      if (gone?.previewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(gone.previewUrl); } catch { /* */ }
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const sendMessage = (text: string) => {
    const trimmed = (text || '').trim();
    const pending = attachments;
    if (!trimmed && pending.length === 0) return;
    if (isTyping) return;

    closePopups();

    const content =
      trimmed ||
      pending.map(a => (a.kind === 'image' ? `[Image: ${a.name}]` : `[File: ${a.name}]`)).join(' ');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      type: pending.some(a => a.kind === 'image') ? 'image' : pending.length ? 'file' : 'text',
      attachments: pending.length ? [...pending] : undefined,
      timestamp: Date.now(),
    };

    const chatId = currentChatId || `chat-${Date.now()}`;
    if (!currentChatId) setCurrentChatId(chatId);

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    syncChat(chatId, nextMessages);
    setInput('');
    setAttachments([]);
    setIsTyping(true);

    // Real answer from the Stooorna Ai backend (no fake canned replies)
    const apiBase = getAiApiBase();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), 90000) : 0;
    const ar = /[\u0600-\u06FF]/.test(content);

    const pushAi = (text: string) => {
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: text,
        type: 'text',
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const withAi = [...prev, aiMsg];
        syncChat(chatId, withAi);
        return withAi;
      });
    };

    fetch(`${apiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        history: nextMessages.slice(-12, -1).map(m => ({ role: m.role, content: m.content })),
      }),
      signal: controller?.signal,
    })
      .then(async r => {
        if (!r.ok) {
          let detail = '';
          try { detail = (await r.text()).slice(0, 200); } catch { /* */ }
          throw new Error(`HTTP ${r.status} ${detail}`);
        }
        return r.json();
      })
      .then(data => {
        const reply = pickReply(data);
        if (!reply) throw new Error('empty reply');
        pushAi(reply);
      })
      .catch(err => {
        console.error('[Stooorna Ai] backend error:', err);
        pushAi(
          ar
            ? '⚠️ تعذر الاتصال بخادم Stooorna Ai حالياً. حاول مرة ثانية بعد شوي.'
            : '⚠️ Could not reach the Stooorna Ai server right now. Please try again shortly.'
        );
      })
      .finally(() => {
        if (timer) window.clearTimeout(timer);
        setIsTyping(false);
      });
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
          position: 'relative',
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
            position: 'relative',
            zIndex: 5,
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
            <span style={{ position: 'relative', zIndex: 1, color: '#f5f5f5' }}>Stooorna Ai</span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              aria-label="History"
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none',
                background: showHistory ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)',
                color: '#333', cursor: 'pointer',
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

        {/* Full-sheet dim layer: tap anywhere closes history */}
        {showHistory && (
          <div
            role="presentation"
            onClick={closePopups}
            onTouchEnd={e => { e.preventDefault(); closePopups(); }}
            style={{
              position: 'absolute',
              left: 0, right: 0, top: 0, bottom: 0,
              zIndex: 20,
              background: 'rgba(0,0,0,0.25)',
            }}
          />
        )}

        {/* History panel */}
        {showHistory && (
          <div
            style={{
              position: 'absolute',
              top: 58, right: 10, zIndex: 30,
              width: 280, maxHeight: '55%', overflowY: 'auto',
              background: '#fff', borderRadius: 14,
              boxShadow: '0 10px 28px rgba(0,0,0,0.2)',
              border: '1px solid rgba(0,0,0,0.08)',
              padding: 10,
            }}
            onClick={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#222' }}>Previous chats</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {chats.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllHistory}
                    style={{
                      border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 8,
                    }}
                  >
                    Delete all
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closePopups}
                  style={{
                    width: 28, height: 28, border: 'none', borderRadius: 8,
                    background: 'rgba(0,0,0,0.06)', color: '#333', cursor: 'pointer',
                    fontSize: 16, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {chats.length === 0 && (
              <p style={{ margin: '10px 4px', color: '#888', fontSize: 13 }}>No history yet</p>
            )}

            {chats.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  borderRadius: 10, padding: 2,
                  background: c.id === currentChatId ? 'rgba(0,0,0,0.05)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => loadChat(c)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '10px 10px',
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
                  onClick={() => deleteChat(c.id)}
                  style={{
                    width: 32, height: 32, border: 'none', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer',
                    fontSize: 18, lineHeight: 1, flexShrink: 0,
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
                  width: '100%', marginTop: 10, padding: '10px',
                  border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', color: '#ef4444',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer',
                }}
              >
                Delete current chat
              </button>
            )}
          </div>
        )}

        {/* Messages — tap also closes history */}
        <div
          onClick={closePopups}
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
                  {m.attachments.map(a =>
                    a.kind === 'image' && a.previewUrl ? (
                      <img
                        key={a.id}
                        src={a.previewUrl}
                        alt={a.name}
                        style={{ maxWidth: 180, maxHeight: 160, borderRadius: 10, objectFit: 'cover' }}
                      />
                    ) : (
                      <span
                        key={a.id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 10px', borderRadius: 10,
                          background: m.role === 'user' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                          fontSize: 13,
                        }}
                      >
                        📎 {a.name}
                      </span>
                    )
                  )}
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

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '10px 12px max(12px, env(safe-area-inset-bottom))',
            background: '#fff',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            position: 'relative',
            zIndex: 5,
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
                    position: 'relative', borderRadius: 12, overflow: 'hidden',
                    border: '1px solid rgba(0,0,0,0.08)', background: '#f4f4f5', maxWidth: 120,
                  }}
                >
                  {a.kind === 'image' ? (
                    <img src={a.previewUrl} alt={a.name} style={{ width: 120, height: 80, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#333' }}>
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
                      background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', fontSize: 12,
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
              display: 'flex', alignItems: 'center', gap: 8,
              background: `linear-gradient(180deg, ${DARK_GREEN} 0%, ${DARKER_GREEN} 100%)`,
              borderRadius: 24, padding: '6px 6px 6px 10px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              aria-label="Attach"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Plus size={20} strokeWidth={2.2} />
            </button>

            <button
              type="button"
              aria-label="Attach photo"
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
              type="button"
              disabled={(!input.trim() && attachments.length === 0) || isTyping}
              aria-label="Send"
              onClick={() => sendMessage(input)}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: (input.trim() || attachments.length) && !isTyping ? RED : 'rgba(239,68,68,0.4)',
                color: '#fff',
                cursor: (input.trim() || attachments.length) && !isTyping ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
        @keyframes stooornaAiDot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
