/**
 * NotificationBell
 * - Bell icon with unread badge
 * - Dropdown rendered via React Portal on document.body
 *   → bypasses any backdrop-filter / stacking-context on parent elements
 * - Polls every 30s; mark-read + delete (single / all)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, MessageCircle, Phone, Radio, Users, X, Check, Trash2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNavigate } from "react-router";
interface InAppNotif {
  id: number;
  type: string;
  title: string;
  body: string;
  icon?: string | null;
  url?: string | null;
  isRead: boolean;
  createdAt: string;
}
const TYPE_ICON: Record<string, React.ReactNode> = {
  dm: <MessageCircle size={15} />,
  group: <Users size={15} />,
  call: <Phone size={15} />,
  live: <Radio size={15} />
};
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'الآن';
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  return `${Math.floor(h / 24)}ي`;
}
export default function NotificationBell({
  userId
}: {
  userId?: string;
}) {
  const navigate = useNavigate();
  const {
    permission,
    subscribe
  } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<InAppNotif[]>([]);
  const [loading, setLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const unread = notifs.filter(n => !n.isRead).length;

  // ── Position panel under bell button ───────────────────────────────────────
  const updatePos = useCallback(() => {
    if (!bellRef.current) return;
    const r = bellRef.current.getBoundingClientRect();
    setPanelPos({
      top: r.bottom + 8,
      right: window.innerWidth - r.right
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  // ── Data ────────────────────────────────────────────────────────────────────
  const loadNotifs = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch('/api/notifications');
      if (r.ok) setNotifs((await r.json()) as InAppNotif[]);
    } catch {}
  }, [userId]);
  useEffect(() => {
    void loadNotifs();
    const t = setInterval(loadNotifs, 3_000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!bellRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      setNotifs(p => p.map(n => ({
        ...n,
        isRead: true
      })));
    } catch {}
  };
  const deleteOne = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id
        })
      });
      setNotifs(p => p.filter(n => n.id !== id));
    } catch {}
  };
  const deleteAll = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      setNotifs([]);
    } catch {}
  };
  const handleNotifClick = async (n: InAppNotif) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: n.id
        })
      });
      setNotifs(p => p.map(x => x.id === n.id ? {
        ...x,
        isRead: true
      } : x));
    } catch {}
    setOpen(false);
    if (n.url) navigate(n.url);
  };
  const handleSubscribe = async () => {
    setLoading(true);
    await subscribe();
    setLoading(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return <>
      {/* Bell anchor */}
      <div ref={bellRef} style={{
      position: 'relative',
      display: 'inline-flex'
    }}>
        <motion.button whileTap={{
        scale: 0.88
      }} onClick={() => setOpen(p => !p)} style={{
        position: 'relative',
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: open ? 'hsl(var(--accent))' : 'transparent',
        border: 'none',
        color: 'hsl(var(--foreground))',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
          <Bell size={20} />
          {unread > 0 && <motion.span initial={{
          scale: 0
        }} animate={{
          scale: 1
        }} style={{
          position: 'absolute',
          top: 4,
          right: 4,
          background: 'hsl(var(--destructive))',
          color: 'hsl(var(--destructive-foreground))',
          fontSize: '0.55rem',
          fontWeight: 800,
          borderRadius: '50%',
          minWidth: 16,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 3px'
        }}>
              {unread > 9 ? '9+' : unread}
            </motion.span>}
        </motion.button>
      </div>

      {/* Portal — renders on document.body, above all backdrop-filters */}
      {createPortal(<AnimatePresence>
          {open && panelPos && <motion.div ref={panelRef} key="notif-panel" initial={{
        opacity: 0,
        y: -10,
        scale: 0.96
      }} animate={{
        opacity: 1,
        y: 0,
        scale: 1
      }} exit={{
        opacity: 0,
        y: -10,
        scale: 0.96
      }} transition={{
        duration: 0.15
      }} style={{
        position: 'fixed',
        top: panelPos.top,
        right: panelPos.right,
        width: 320,
        zIndex: 2147483647,
        /* Solid opaque background — no blur, no transparency */
        background: 'hsl(var(--card))',
        border: '1.5px solid hsl(var(--primary) / 0.35)',
        borderRadius: 16,
        boxShadow: '0 16px 56px hsl(var(--background)), 0 0 0 1px hsl(var(--primary) / 0.12)',
        overflow: 'hidden',
        isolation: 'isolate'
      }}>
              {/* Header */}
              <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 14px',
          borderBottom: '1.5px solid hsl(var(--primary) / 0.20)',
          background: 'hsl(var(--primary) / 0.10)'
        }}>
                <span style={{
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'hsl(var(--foreground))'
          }}>
                  الإشعارات
                </span>
                <div style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center'
          }}>
                  {unread > 0 && <button onClick={markAllRead} title="تحديد الكل كمقروء" style={{
              background: 'none',
              border: 'none',
              color: 'hsl(var(--primary))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.75rem'
            }}>
                      <Check size={13} /> الكل
                    </button>}
                  {notifs.length > 0 && <button onClick={deleteAll} title="مسح كل الإشعارات" style={{
              background: 'none',
              border: 'none',
              color: 'hsl(var(--destructive))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.75rem'
            }}>
                      <Trash2 size={13} /> مسح الكل
                    </button>}
                  <button onClick={() => setOpen(false)} style={{
              background: 'none',
              border: 'none',
              color: 'hsl(var(--muted-foreground))',
              cursor: 'pointer'
            }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Push subscribe banner */}
              {permission !== 'granted' && permission !== 'unsupported' && permission !== 'denied' && <div style={{
          padding: '10px 14px',
          background: 'hsl(var(--primary) / 0.08)',
          borderBottom: '1px solid hsl(var(--border))',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
                  <Bell size={16} style={{
            color: 'hsl(var(--primary))',
            flexShrink: 0
          }} />
                  <span style={{
            flex: 1,
            fontSize: '0.78rem',
            color: 'hsl(var(--foreground))'
          }}>فعّل الإشعارات لتصلك حتى خارج التطبيق</span>
                  <button onClick={handleSubscribe} disabled={loading} style={{
            padding: '5px 12px',
            borderRadius: 10,
            background: 'hsl(var(--primary))',
            border: 'none',
            color: 'hsl(var(--primary-foreground))',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0
          }}>
                    {loading ? '...' : 'تفعيل'}
                  </button>
                </div>}
              {permission === 'denied' && <div style={{
          padding: '10px 14px',
          background: 'hsl(var(--destructive) / 0.08)',
          borderBottom: '1px solid hsl(var(--border))',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
                  <BellOff size={15} style={{
            color: 'hsl(var(--destructive))',
            flexShrink: 0
          }} />
                  <span style={{
            fontSize: '0.75rem',
            color: 'hsl(var(--muted-foreground))'
          }}>الإشعارات محظورة — افتح إعدادات المتصفح لتفعيلها</span>
                </div>}

              {/* Notifications list */}
              <div style={{
          maxHeight: 360,
          overflowY: 'auto'
        }}>
                {notifs.length === 0 ? <div style={{
            padding: '32px 20px',
            textAlign: 'center',
            color: 'hsl(var(--muted-foreground))'
          }}>
                    <Bell size={28} style={{
              margin: '0 auto 8px',
              opacity: 0.3
            }} />
                    <p style={{
              fontSize: '0.85rem'
            }}>لا توجد إشعارات</p>
                  </div> : notifs.map(n => <motion.div key={n.id} whileHover={{
            background: 'hsl(var(--accent) / 0.15)'
          }} onClick={() => void handleNotifClick(n)} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 14px',
            cursor: 'pointer',
            borderBottom: '1px solid hsl(var(--border) / 0.5)',
            background: n.isRead ? 'transparent' : 'hsl(var(--primary) / 0.06)',
            position: 'relative'
          }}>
                      <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'hsl(var(--muted))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'hsl(var(--primary))'
            }}>
                        {TYPE_ICON[n.type] ?? <Bell size={15} />}
                      </div>
                      <div style={{
              flex: 1,
              minWidth: 0
            }}>
                        <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6
              }}>
                          <span style={{
                  fontWeight: n.isRead ? 500 : 700,
                  fontSize: '0.82rem',
                  color: 'hsl(var(--foreground))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                            {n.title}
                          </span>
                          <span style={{
                  fontSize: '0.68rem',
                  color: 'hsl(var(--muted-foreground))',
                  flexShrink: 0
                }}>
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p style={{
                margin: 0,
                fontSize: '0.75rem',
                color: 'hsl(var(--muted-foreground))',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                          {n.body}
                        </p>
                      </div>
                      {!n.isRead && <div style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'hsl(var(--primary))',
              flexShrink: 0,
              marginTop: 6
            }} />}
                      <motion.button whileTap={{
              scale: 0.85
            }} onClick={e => void deleteOne(e, n.id)} title="حذف الإشعار" style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'hsl(var(--muted-foreground))',
              padding: '2px 4px',
              borderRadius: 6,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              opacity: 0.5
            }} onMouseEnter={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.color = 'hsl(var(--destructive))';
            }} onMouseLeave={e => {
              e.currentTarget.style.opacity = '0.5';
              e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
            }}>
                        <X size={13} />
                      </motion.button>
                    </motion.div>)}
              </div>
            </motion.div>}
        </AnimatePresence>, document.body)}
    </>;
}
