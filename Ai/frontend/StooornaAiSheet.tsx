import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Send, Clock, PenLine, Image as ImageIcon, Table, Sparkles, Mic } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'image' | 'table';
  data?: any;
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

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const lower = text.toLowerCase();
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

    try {
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history,
          use_rag: lower.includes('search') || lower.includes('ابحث') || lower.includes('من المعرفة'),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || '(empty reply)',
        type: 'text',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content:
          `تعذر الاتصال بخادم Stooorna Ai.\n\n` +
          `تأكد أن الخدمة تعمل:\n` +
          `  cd Ai/backend && bash scripts/dev.sh\n` +
          `أو: docker compose -f Ai/docker/docker-compose.yml up\n\n` +
          `التفاصيل: ${err?.message || err}`,
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
              background: RED,
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 20,
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
            }}
          >
            <span style={{ position: 'relative', zIndex: 1, color: SILVER, textShadow: '0 0 8px rgba(255,255,255,0.6)' }}>
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
            <p style={{ margin: '4px 8px 8px', fontWeight: 700, fontSize: 13, color: '#333' }}>Previous chats</p>
            {chats.length === 0 && (
              <p style={{ margin: 8, color: '#888', fontSize: 12 }}>No history yet</p>
            )}
            {chats.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => loadChat(c)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px',
                  border: 'none', background: 'transparent', borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, color: '#222',
                }}
              >
                {c.title}
              </button>
            ))}
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: `linear-gradient(180deg, ${DARK_GREEN} 0%, ${DARKER_GREEN} 100%)`,
              borderRadius: 24,
              padding: '6px 6px 6px 14px',
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
              onClick={() => setToolsOpen(v => !v)}
            >
              <Plus size={20} strokeWidth={2.2} />
              {toolsOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 48, left: 0,
                    background: '#0a1f1a', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12, padding: 6, minWidth: 180,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 5,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {[
                    { label: 'Generate Image', cmd: 'generate image of ' },
                    { label: 'Create Table', cmd: 'create table ' },
                    { label: 'Merge Images', cmd: 'merge images ' },
                    { label: 'Ask anything', cmd: '' },
                  ].map(t => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => {
                        setInput(t.cmd);
                        setToolsOpen(false);
                        inputRef.current?.focus();
                      }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 10px',
                        background: 'transparent', border: 'none', color: '#fff',
                        fontSize: 13, cursor: 'pointer', borderRadius: 8,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
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
              disabled={!input.trim() || isTyping}
              aria-label="Send"
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: input.trim() ? RED : 'rgba(239,68,68,0.4)',
                color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
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
