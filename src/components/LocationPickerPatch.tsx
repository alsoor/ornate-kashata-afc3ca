/**
 * LocationPickerPatch.tsx  —  باتش الموقع (نفس نظام تيليجرام)
 * ------------------------------------------------------------------
 * مربوط بالشات العام + شات المحفوظات (Saved Messages).
 *
 *  - LocationPickerSheet  : نافذة اختيار الموقع (خريطة + دبوس ثابت في المنتصف + Send selected location
 *                           + Send My Current Location + Or choose a venue + Places in this area)
 *  - LocationViewSheet    : نافذة عرض موقع مُرسل (نفس الخريطة + فتح في خرائط قوقل / الاتجاهات / نسخ / مشاركة)
 *  - LocationChatCard     : كرت الموقع داخل الشات (Map | Location + الإحداثيات | دبوس أحمر)
 *  - encodeChatLocation / parseChatLocation : ترميز الموقع داخل نص رسالة الشات العام
 *                           (يشتغل مع السيرفر الحالي بدون أي تعديل، والنسخ القديمة تعرضه كنص عادي 📍lat,lng)
 *
 * الخريطة مبنية على بلاطات OpenStreetMap (نفس المصدر المستخدم أصلاً في خريطة اللايف) + أقمار صناعية Esri.
 * لا تحتاج أي مفتاح API.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import UserAvatar from '@/components/UserAvatar';
import {
  Layers, LocateFixed, MapPin, ArrowLeft, CornerUpRight, Search,
  Coffee, ShoppingCart, Utensils, Fuel, Pill, GraduationCap, Landmark, Building2, Store,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
 * 1) ترميز / فك ترميز الموقع داخل نص الرسالة
 * ──────────────────────────────────────────────────────────────────────────── */
export type ChatLocation = { lat: number; lng: number; label: string };

// بادئة غير مرئية (word-joiner + zero-width) — النسخ القديمة تعرض فقط: 📍lat,lng label
const LOC_PREFIX = '📍\u2060\u200B\u2060';
const LOC_SEP = '\u2060';

export function encodeChatLocation(lat: number, lng: number, label?: string | null): string {
  const clean = String(label || '').replace(/[\u2060\u200B\n\r]+/g, ' ').trim().slice(0, 120);
  return `${LOC_PREFIX}${lat.toFixed(6)},${lng.toFixed(6)}${LOC_SEP}${clean}`;
}

export function parseChatLocation(text?: string | null): ChatLocation | null {
  if (!text || typeof text !== 'string' || !text.startsWith(LOC_PREFIX)) return null;
  const rest = text.slice(LOC_PREFIX.length);
  const i = rest.indexOf(LOC_SEP);
  const coords = (i < 0 ? rest : rest.slice(0, i)).split(',');
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: i < 0 ? '' : rest.slice(i + 1).trim() };
}

export const formatCoords = (lat: number, lng: number) => `${lat.toFixed(5)} ,${lng.toFixed(5)}`;

/* ────────────────────────────────────────────────────────────────────────────
 * 2) رياضيات الخريطة (Web Mercator)
 * ──────────────────────────────────────────────────────────────────────────── */
type View = { lat: number; lng: number; z: number };

const TILE = 256;
const MIN_Z = 2;
const MAX_Z = 19;
const DEFAULT_CENTER = { lat: 29.3759, lng: 47.9774 }; // الكويت — يُستبدل بموقعك الفعلي أول ما يتوفر GPS

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function project(lat: number, lng: number, z: number) {
  const sc = TILE * Math.pow(2, z);
  const s = clamp(Math.sin((lat * Math.PI) / 180), -0.9999, 0.9999);
  return { x: ((lng + 180) / 360) * sc, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * sc };
}
function unproject(x: number, y: number, z: number) {
  const sc = TILE * Math.pow(2, z);
  const n = Math.PI - (2 * Math.PI * y) / sc;
  return {
    lat: clamp((180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), -85, 85),
    lng: ((((x / sc) * 360 - 180) + 540) % 360) - 180,
  };
}
function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const TILE_STANDARD = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const TILE_SATELLITE = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

type MapMarker = { lat: number; lng: number; kind: 'me' | 'pin'; acc?: number };

/* ────────────────────────────────────────────────────────────────────────────
 * 3) محرك الخريطة (سحب + قرص بإصبعين + عجلة + ضغطتين)
 * ──────────────────────────────────────────────────────────────────────────── */
function TgMap({
  view, setView, satellite, markers, onMoveStart, onMoveEnd, interactive = true, children,
}: {
  view: View;
  setView: (v: View) => void;
  satellite: boolean;
  markers: MapMarker[];
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
  interactive?: boolean;
  children?: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 360, h: 300 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ v: View; p0: { x: number; y: number }; d0: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 360, h: el.clientHeight || 300 });
    read();
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(read); ro.observe(el); } catch { /* */ }
    return () => { try { ro?.disconnect(); } catch { /* */ } };
  }, []);

  const centroid = () => {
    const pts = [...ptrs.current.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1);
    const y = pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1);
    return { x, y };
  };
  const spread = () => {
    const pts = [...ptrs.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };
  const restart = () => {
    g.current = { v: { ...viewRef.current }, p0: centroid(), d0: spread(), moved: g.current?.moved || false };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.current = null;
    restart();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !ptrs.current.has(e.pointerId) || !g.current) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = g.current;
    const c = centroid();
    const dx = c.x - st.p0.x;
    const dy = c.y - st.p0.y;
    if (!st.moved) {
      if (Math.hypot(dx, dy) < 4 && ptrs.current.size < 2) return;
      st.moved = true;
      onMoveStart?.();
    }
    let z = st.v.z;
    if (ptrs.current.size >= 2 && st.d0 > 10) z = clamp(st.v.z + Math.log2(spread() / st.d0), MIN_Z, MAX_Z);
    const p = project(st.v.lat, st.v.lng, st.v.z);
    const nc = unproject(p.x - dx, p.y - dy, st.v.z);
    setView({ lat: nc.lat, lng: nc.lng, z });
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      const moved = !!g.current?.moved;
      g.current = null;
      if (moved) onMoveEnd?.();
    } else {
      restart();
    }
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const v = viewRef.current;
    setView({ ...v, z: clamp(v.z - e.deltaY * 0.0025, MIN_Z, MAX_Z) });
    onMoveStart?.();
    onMoveEnd?.();
  };
  const onDbl = () => {
    if (!interactive) return;
    const v = viewRef.current;
    setView({ ...v, z: clamp(Math.round(v.z) + 1, MIN_Z, MAX_Z) });
    onMoveStart?.();
    onMoveEnd?.();
  };

  // ── بلاطات ──
  const tiles = useMemo(() => {
    const zi = clamp(Math.floor(view.z + 0.0001), MIN_Z, MAX_Z);
    const s = Math.pow(2, view.z - zi);
    const c = project(view.lat, view.lng, zi);
    const n = Math.pow(2, zi);
    const x0 = Math.floor((c.x - size.w / 2 / s) / TILE);
    const x1 = Math.floor((c.x + size.w / 2 / s) / TILE);
    const y0 = Math.max(0, Math.floor((c.y - size.h / 2 / s) / TILE));
    const y1 = Math.min(n - 1, Math.floor((c.y + size.h / 2 / s) / TILE));
    const out: { key: string; src: string; left: number; top: number; px: number }[] = [];
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const wx = ((tx % n) + n) % n;
        out.push({
          key: `${satellite ? 's' : 'm'}${zi}/${tx}/${ty}`,
          src: satellite ? TILE_SATELLITE(zi, wx, ty) : TILE_STANDARD(zi, wx, ty),
          left: size.w / 2 + (tx * TILE - c.x) * s,
          top: size.h / 2 + (ty * TILE - c.y) * s,
          px: TILE * s,
        });
      }
    }
    return out;
  }, [view.lat, view.lng, view.z, size.w, size.h, satellite]);

  const toScreen = (lat: number, lng: number) => {
    const p = project(lat, lng, view.z);
    const c = project(view.lat, view.lng, view.z);
    return { x: size.w / 2 + (p.x - c.x), y: size.h / 2 + (p.y - c.y) };
  };
  const metersToPx = (m: number, lat: number) => m / ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, view.z));

  return (
    <div
      ref={boxRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
      onDoubleClick={onDbl}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: satellite ? '#0b1a2b' : '#e8e4dc', touchAction: interactive ? 'none' : 'pan-y', pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'grab' : 'default' }}
    >
      {tiles.map(t => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          draggable={false}
          style={{ position: 'absolute', left: t.left, top: t.top, width: t.px + 0.6, height: t.px + 0.6, userSelect: 'none', pointerEvents: 'none', WebkitUserDrag: 'none' } as React.CSSProperties}
        />
      ))}
      {markers.map((m, i) => {
        const p = toScreen(m.lat, m.lng);
        if (m.kind === 'me') {
          const r = m.acc ? clamp(metersToPx(m.acc, m.lat), 0, 160) : 0;
          return (
            <React.Fragment key={`me${i}`}>
              {r > 10 ? <div style={{ position: 'absolute', left: p.x - r, top: p.y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: 'rgba(66,133,244,0.16)', border: '1px solid rgba(66,133,244,0.35)', pointerEvents: 'none' }} /> : null}
              <div style={{ position: 'absolute', left: p.x - 8, top: p.y - 8, width: 16, height: 16, borderRadius: '50%', background: '#4285f4', border: '3px solid #fff', boxShadow: '0 1px 5px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
            </React.Fragment>
          );
        }
        return (
          <div key={`pin${i}`} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -100%)', pointerEvents: 'none' }}>
            <PinSvg />
          </div>
        );
      })}
      {children}
      <div style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 10, fontWeight: 700, color: satellite ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)', pointerEvents: 'none', textShadow: satellite ? '0 0 3px #000' : '0 0 3px #fff' }}>
        {satellite ? '© Esri' : '© OpenStreetMap'}
      </div>
    </div>
  );
}

function PinSvg({ lifted = false }: { lifted?: boolean }) {
  return (
    <svg width="32" height="44" viewBox="0 0 24 34" style={{ display: 'block', transition: 'transform .15s ease', transform: lifted ? 'translateY(-12px)' : 'none', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))' }}>
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="#ea4335" stroke="#b3261e" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="4.6" fill="#7a1512" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4) جلب العنوان + الأماكن القريبة
 * ──────────────────────────────────────────────────────────────────────────── */
const uiLang = () => ((typeof navigator !== 'undefined' && navigator.language) || 'en').split('-')[0];

async function reverseGeocode(lat: number, lng: number, signal: AbortSignal): Promise<string> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&accept-language=${uiLang()}&lat=${lat}&lon=${lng}`,
    { signal },
  );
  if (!r.ok) throw new Error('geocode');
  const d: any = await r.json();
  const a = d?.address || {};
  const parts: string[] = [];
  for (const v of [a.state || a.governorate, a.city || a.town || a.village || a.suburb || a.county, a.road || a.neighbourhood || a.pedestrian]) {
    if (v && !parts.includes(String(v))) parts.push(String(v));
  }
  return parts.length ? parts.join(', ') : String(d?.display_name || '');
}

type Venue = { id: string; name: string; sub: string; lat: number; lng: number; cat: string; dist: number };

async function searchPlaces(term: string, near: { lat: number; lng: number }, signal: AbortSignal): Promise<Venue[]> {
  const d = 0.3;
  const viewbox = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=12&accept-language=${uiLang()}&viewbox=${viewbox}&q=${encodeURIComponent(term)}`,
    { signal },
  );
  if (!r.ok) throw new Error('search');
  const data: any = await r.json();
  const list: Venue[] = [];
  for (const el of (Array.isArray(data) ? data : [])) {
    const lat = Number(el?.lat);
    const lng = Number(el?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const full = String(el?.display_name || '').split(',').map((x: string) => x.trim()).filter(Boolean);
    const name = String(el?.name || full[0] || '').trim();
    if (!name) continue;
    const sub = full.filter((x: string) => x !== name).slice(0, 3).join(', ');
    const cat = `${el?.category || el?.class || ''} ${el?.type || ''}`.trim();
    list.push({ id: String(el?.place_id ?? `${lat},${lng}`), name, sub, lat, lng, cat, dist: distM(near, { lat, lng }) });
  }
  return list;
}

const VENUE_COLORS = ['#ef5350', '#f4b942', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
function venueIcon(cat: string) {
  const p = { size: 18, color: '#fff', strokeWidth: 2.2 } as const;
  if (/cafe|coffee|ice_cream|bakery/.test(cat)) return <Coffee {...p} />;
  if (/restaurant|fast_food|food_court|bar|pub/.test(cat)) return <Utensils {...p} />;
  if (/supermarket|mall|department|convenience|clothes|shop|marketplace/.test(cat)) return <ShoppingCart {...p} />;
  if (/fuel/.test(cat)) return <Fuel {...p} />;
  if (/pharmacy|clinic|hospital|doctors|dentist/.test(cat)) return <Pill {...p} />;
  if (/school|kindergarten|college|university|library/.test(cat)) return <GraduationCap {...p} />;
  if (/place_of_worship|mosque|museum|attraction|townhall|courthouse/.test(cat)) return <Landmark {...p} />;
  if (/hotel|hostel|guest_house|apartment/.test(cat)) return <Building2 {...p} />;
  return <Store {...p} />;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5) عناصر واجهة مشتركة
 * ──────────────────────────────────────────────────────────────────────────── */
const BLUE = '#2f8fe6';
const SHEET_BG = '#eceff3';

function Circle({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <div style={{ width: 42, height: 42, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{children}</div>;
}

function MapRoundBtn({ label, onClick, children, style }: { label: string; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#fff', color: '#5f6368', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.3)', cursor: 'pointer', ...style }}
    >
      {children}
    </button>
  );
}

function SheetShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const dragY = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onPointerDown={stop}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
      onMouseDown={stop}
      style={{ position: 'fixed', inset: 0, zIndex: 140000, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', direction: 'ltr' }}
    >
      <div
        style={{ width: '100%', maxWidth: 560, height: 'min(94dvh, 94vh)', background: SHEET_BG, borderRadius: '18px 18px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 30px rgba(0,0,0,0.3)', position: 'relative' }}
      >
        <div
          onPointerDown={e => { dragY.current = e.clientY; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ } }}
          onPointerUp={e => { if (dragY.current != null && e.clientY - dragY.current > 50) onClose(); dragY.current = null; }}
          onClick={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 22, zIndex: 6, display: 'flex', justifyContent: 'center', paddingTop: 7, touchAction: 'none', cursor: 'pointer' }}
        >
          <div style={{ width: 38, height: 4, borderRadius: 4, background: 'rgba(0,0,0,0.28)' }} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const rowCard: React.CSSProperties = { background: '#fff', borderRadius: 14, overflow: 'hidden' };
const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', width: '100%', border: 'none', background: '#fff', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: '#111' };

/* ────────────────────────────────────────────────────────────────────────────
 * 6) نافذة اختيار الموقع (الإرسال)
 * ──────────────────────────────────────────────────────────────────────────── */
export function LocationPickerSheet({
  onClose, onSend, initial,
}: {
  onClose: () => void;
  /** label فاضي = موقع عادي، أو اسم المكان لو اخترت venue */
  onSend: (lat: number, lng: number, label: string) => void;
  initial?: { lat: number; lng: number } | null;
}) {
  const [view, setView] = useState<View>({ lat: initial?.lat ?? DEFAULT_CENTER.lat, lng: initial?.lng ?? DEFAULT_CENTER.lng, z: initial ? 17 : 15 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoState, setGeoState] = useState<'wait' | 'ok' | 'denied'>('wait');
  const [satellite, setSatellite] = useState(false);
  const [moving, setMoving] = useState(false);
  const [address, setAddress] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const userMoved = useRef(false);
  const firstFix = useRef(true);

  // GPS — أول قراءة تنقل الخريطة لموقعك، والباقي يحدّث الدقة فقط
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoState('denied'); return; }
    const id = navigator.geolocation.watchPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || 0 };
        setMe(p);
        setGeoState('ok');
        if (firstFix.current && !userMoved.current && !initial) {
          firstFix.current = false;
          setView({ lat: p.lat, lng: p.lng, z: 17 });
        }
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
    return () => { try { navigator.geolocation.clearWatch(id); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const term = placeQuery.trim();
    searchAbort.current?.abort();
    if (term.length < 2) { setVenues([]); setVenuesLoading(false); return; }
    const ac = new AbortController();
    searchAbort.current = ac;
    setVenuesLoading(true);
    const t = window.setTimeout(() => {
      searchPlaces(term, { lat: viewRef.current.lat, lng: viewRef.current.lng }, ac.signal)
        .then(list => { if (!ac.signal.aborted) { setVenues(list); setVenuesLoading(false); } })
        .catch(() => { if (!ac.signal.aborted) { setVenues([]); setVenuesLoading(false); } });
    }, 600);
    return () => { window.clearTimeout(t); ac.abort(); };
  }, [placeQuery]);

  // العنوان للنقطة المختارة (بعد ما تهدأ الحركة)
  useEffect(() => {
    if (moving) return;
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      reverseGeocode(view.lat, view.lng, ac.signal).then(a => { if (!ac.signal.aborted) setAddress(a); }).catch(() => { /* */ });
    }, 450);
    return () => { window.clearTimeout(t); ac.abort(); };
  }, [view.lat, view.lng, moving]);

  const atMe = !!me && distM({ lat: view.lat, lng: view.lng }, me) < 15;

  const goMe = () => {
    if (!me) return;
    userMoved.current = true;
    setView({ lat: me.lat, lng: me.lng, z: Math.max(viewRef.current.z, 17) });
  };

  const sendSelected = () => onSend(view.lat, view.lng, '');

  return (
    <SheetShell onClose={onClose}>
      <div style={{ position: 'relative', height: '44%', minHeight: 230, flexShrink: 0 }}>
        <TgMap
          view={view}
          setView={setView}
          satellite={satellite}
          markers={me ? [{ lat: me.lat, lng: me.lng, kind: 'me', acc: me.acc }] : []}
          onMoveStart={() => { userMoved.current = true; setMoving(true); }}
          onMoveEnd={() => { setMoving(false); }}
        >
          {/* الدبوس الثابت في منتصف الخريطة */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 3 }}>
            <PinSvg lifted={moving} />
          </div>
          {moving ? <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 4, marginLeft: -4, marginTop: -2, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }} /> : null}
        </TgMap>

        <MapRoundBtn label="Map type" onClick={() => setSatellite(s => !s)} style={{ top: 14, right: 12, zIndex: 5 }}>
          <Layers size={20} strokeWidth={2} />
        </MapRoundBtn>
        <MapRoundBtn label="My location" onClick={goMe} style={{ bottom: 14, right: 12, zIndex: 5, color: atMe ? BLUE : '#5f6368', opacity: me ? 1 : 0.6 }}>
          <LocateFixed size={20} strokeWidth={2.2} />
        </MapRoundBtn>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 10px calc(14px + env(safe-area-inset-bottom, 0px))', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        <div style={rowCard}>
          <button type="button" style={rowBtn} onClick={sendSelected}>
            <Circle bg={BLUE}><MapPin size={20} color="#fff" strokeWidth={2.3} /></Circle>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: BLUE, fontWeight: 700, fontSize: '0.95rem' }}>{atMe ? 'Send My Current Location' : 'Send selected location'}</div>
              <div style={{ color: '#7d8590', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {atMe
                  ? `Accurate to ${Math.max(1, Math.round(me!.acc))} meters`
                  : (address || formatCoords(view.lat, view.lng))}
              </div>
            </div>
          </button>
        </div>

        <div style={{ ...rowCard, marginTop: 10 }}>
          <div style={{ padding: '12px 16px 6px', color: BLUE, fontWeight: 700, fontSize: '0.84rem' }}>Or search for a place</div>
          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f2f5', borderRadius: 12, padding: '0 12px' }}>
              <Search size={18} color="#7d8590" strokeWidth={2.2} />
              <input
                type="text"
                dir="auto"
                value={placeQuery}
                onChange={e => setPlaceQuery(e.target.value)}
                placeholder="Search places"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '11px 0', font: 'inherit', fontSize: '16px', color: '#111' }}
              />
            </div>
          </div>
          {venues.map((v, i) => (
            <button
              key={v.id}
              type="button"
              style={{ ...rowBtn, padding: '9px 16px', borderTop: i ? '1px solid #f0f1f3' : 'none' }}
              onClick={() => onSend(v.lat, v.lng, v.name)}
            >
              <Circle bg={VENUE_COLORS[i % VENUE_COLORS.length]}>{venueIcon(v.cat)}</Circle>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</div>
                <div style={{ color: '#7d8590', fontSize: '0.78rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.sub}</div>
              </div>
            </button>
          ))}
          {placeQuery.trim().length >= 2 && !venues.length ? (
            <div style={{ padding: '6px 16px 14px', color: '#7d8590', fontSize: '0.84rem', fontWeight: 600 }}>
              {venuesLoading ? 'Searching…' : 'No places found'}
            </div>
          ) : null}
          <div style={{ padding: '8px 16px 12px', textAlign: 'center', color: '#9aa1ab', fontSize: '0.72rem', fontWeight: 700 }}>
            {geoState === 'denied' ? 'Location permission is off — drag the map to pick a spot · ' : ''}Powered by OpenStreetMap
          </div>
        </div>
      </div>
    </SheetShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7) صفحة عرض الموقع داخل التطبيق (مثل تيليجرام: Location + Open in Maps + Directions)
 *    الضغط على Open in Maps أو Directions يطلعك على Google Maps خارج التطبيق.
 * ──────────────────────────────────────────────────────────────────────────── */
const fmtDist = (m: number) => (m < 1000 ? `${Math.max(1, Math.round(m))} m away` : `${(m / 1000).toFixed(1)} km away`);
const openExternal = (u: string) => {
  try {
    const w = window.open(u, '_blank', 'noopener,noreferrer');
    if (!w) window.location.href = u;
  } catch { try { window.location.href = u; } catch { /* */ } }
};

export function LocationViewSheet({
  lat, lng, label, senderName, senderAvatar, onClose,
}: {
  lat: number; lng: number; label?: string;
  senderName?: string | null; senderAvatar?: string | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>({ lat, lng, z: 17 });
  const [satellite, setSatellite] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [shown, setShown] = useState(false);
  const pinPt = { lat, lng };

  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || 0 }),
      () => { /* */ },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 },
    );
    return () => { try { navigator.geolocation.clearWatch(id); } catch { /* */ } };
  }, []);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const name = senderName || 'Location';
  const sub = me ? fmtDist(distM(me, pinPt)) : (label || formatCoords(lat, lng));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={stop} onPointerDown={stop} onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop} onMouseDown={stop}
      style={{
        position: 'fixed', inset: 0, zIndex: 140000, background: '#fff', direction: 'ltr',
        display: 'flex', flexDirection: 'column',
        transform: shown ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .26s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      {/* شريط العنوان */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px', background: '#fff', flexShrink: 0 }}>
        <button type="button" aria-label="Back" onClick={onClose} style={{ border: 'none', background: 'none', padding: 6, cursor: 'pointer', color: '#111', display: 'flex' }}>
          <ArrowLeft size={24} strokeWidth={2.2} />
        </button>
        <div style={{ fontWeight: 600, fontSize: '1.08rem', color: '#111' }}>Location</div>
      </div>

      {/* الخريطة */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <TgMap
          view={view}
          setView={setView}
          satellite={satellite}
          markers={[...(me ? [{ lat: me.lat, lng: me.lng, kind: 'me' as const, acc: me.acc }] : []), { lat, lng, kind: 'pin' as const }]}
        />
        <button
          type="button"
          onPointerDown={stop}
          onClick={e => { e.stopPropagation(); openExternal(mapsUrl); }}
          style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 5, padding: '9px 22px', borderRadius: 999, border: 'none', background: '#fff', color: BLUE, fontWeight: 700, fontSize: '0.88rem', boxShadow: '0 1px 8px rgba(0,0,0,0.28)', cursor: 'pointer' }}
        >
          Open in Maps
        </button>
        <MapRoundBtn label="Map type" onClick={() => setSatellite(v => !v)} style={{ top: 14, right: 12, zIndex: 5 }}>
          <Layers size={20} strokeWidth={2} />
        </MapRoundBtn>
        <MapRoundBtn
          label="My location"
          onClick={() => {
            if (me) setView(v => ({ lat: me.lat, lng: me.lng, z: Math.max(v.z, 16) }));
            else setView(v => ({ lat, lng, z: Math.max(v.z, 16) }));
          }}
          style={{ bottom: 14, right: 12, zIndex: 5, color: BLUE }}
        >
          <LocateFixed size={20} strokeWidth={2.2} />
        </MapRoundBtn>
      </div>

      {/* اللوحة السفلية: المُرسل + المسافة + Directions */}
      <div style={{ background: '#fff', flexShrink: 0, padding: '14px 14px calc(14px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <UserAvatar name={name} avatarUrl={senderAvatar || null} size={44} style={{ flexShrink: 0, border: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontStyle: 'italic', fontSize: '1rem', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ color: '#7d8590', fontSize: '0.84rem', fontWeight: 600 }}>{sub}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openExternal(dirUrl)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 0', borderRadius: 14, border: 'none', background: '#1e9bf0', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
        >
          <CornerUpRight size={20} strokeWidth={2.4} />
          Directions
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8) كرت الموقع داخل الشات: مربع يعرض جزء من الخريطة + دبوس + الوقت
 *    (بدون stopPropagation على اللمس → الضغط المطوّل يوصل لطبقة الحذف في المحفوظات)
 * ──────────────────────────────────────────────────────────────────────────── */
export function LocationChatCard({
  lat, lng, onOpen, time, size = 230,
}: { lat: number; lng: number; label?: string; onOpen: () => void; time?: string; size?: number }) {
  const [view, setView] = useState<View>({ lat, lng, z: 16 });
  useEffect(() => { setView({ lat, lng, z: 16 }); }, [lat, lng]);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => { e.stopPropagation(); onOpen(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{
        position: 'relative', marginTop: 6, width: `min(100%, ${size}px)`, aspectRatio: '1 / 1',
        borderRadius: 18, overflow: 'hidden', cursor: 'pointer', direction: 'ltr',
        background: '#e8e4dc', boxShadow: '0 2px 10px rgba(20,30,50,0.16)',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'pan-y',
      } as React.CSSProperties}
    >
      <TgMap view={view} setView={setView} satellite={false} markers={[{ lat, lng, kind: 'pin' }]} interactive={false} />
      {time ? (
        <div style={{ position: 'absolute', right: 8, bottom: 8, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.42)', color: '#fff', fontSize: '0.68rem', fontWeight: 700, pointerEvents: 'none' }}>
          {time}
        </div>
      ) : null}
    </div>
  );
}
