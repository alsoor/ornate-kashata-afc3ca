/**
 * lib/appMediaPatch.tsx
 * صور وفيديوهات النشر تنزل بصفحة أيقونة التطبيق فقط، وتبقى لين المستخدم يمسحها.
 * الشات العام يظل يتنظف كل 24 ساعة ولا يعرض هالوسائط.
 */
import React, { useEffect, useState } from 'react';

export type AppMedia = {
  id: string;
  url: string;
  type: 'image' | 'video';
  userId: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  createdAt: number;
};

const KEY = 'stooorna_app_media_v1';
const EVT = 'stooorna:app-media';

function read(): AppMedia[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function write(list: AppMedia[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 400))); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* */ }
}

export function syncAppMedia(rows: AppMedia[]) {
  const cur = read();
  const map = new Map(cur.map(x => [x.id, x]));
  for (const row of rows) {
    if (!row?.id || !row.url || /^(blob:|data:)/i.test(row.url)) continue;
    map.set(row.id, { ...map.get(row.id), ...row, createdAt: row.createdAt || Date.now() });
  }
  write([...map.values()].sort((a, b) => b.createdAt - a.createdAt));
}

export function deleteAppMedia(id: string) {
  write(read().filter(x => x.id !== id));
}

export function AppMediaSheet({ open, myId, onClose, onOpenTemplates }: { open: boolean; myId?: string | null; onClose?: () => void; onOpenTemplates?: () => void }) {
  const [items, setItems] = useState<AppMedia[]>(() => read());
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const pull = () => setItems(read());
    window.addEventListener(EVT, pull);
    window.addEventListener('storage', pull);
    return () => { window.removeEventListener(EVT, pull); window.removeEventListener('storage', pull); };
  }, []);
  if (!open) return null;
  const current = items.find(x => x.id === openId) || null;
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, top: 'calc(env(safe-area-inset-top, 0px) + 118px)', bottom: 0, zIndex: 20, background: '#050d0f', overflowY: 'auto', padding: '12px 12px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ margin: 0, flex: 1, color: '#dff6f6', fontWeight: 800 }}>Photos & Videos</p>
        {onClose ? <button type="button" onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 999, padding: '6px 10px', cursor: 'pointer' }}>Close</button> : null}
      </div>
      {items.length === 0 ? <p style={{ color: 'rgba(180,220,220,0.7)', textAlign: 'center', marginTop: 40 }}>لا توجد صور أو فيديوهات بعد</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {items.map(item => (
          <button key={item.id} type="button" onClick={() => setOpenId(item.id)} style={{ padding: 0, border: 'none', borderRadius: 12, overflow: 'hidden', background: '#0c181a', aspectRatio: '1', position: 'relative', cursor: 'pointer' }}>
            {item.type === 'video' ? <video src={item.url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            {myId && item.userId === myId ? <span onClick={e => { e.stopPropagation(); deleteAppMedia(item.id); }} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 8, padding: '2px 6px', fontSize: 11 }}>حذف</span> : null}
          </button>
        ))}
      </div>
      <div style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)', zIndex: 25, display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={onOpenTemplates} style={{ height: 36, padding: '0 16px', borderRadius: 999, border: '1px solid rgba(0,188,212,0.45)', background: 'rgba(7,20,22,0.92)', color: '#7ee8f5', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Templates</button>
      </div>
      {current ? (
        <div onClick={() => setOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {current.type === 'video' ? <video src={current.url} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <img src={current.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
        </div>
      ) : null}
    </div>
  );
}
