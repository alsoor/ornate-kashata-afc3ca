/** GET /api/room?id=ch1 — get room snapshot (members, floor holder)
 *
 *  تعديل الزائر (قبل تسجيل الدخول):
 *   - المسجّلون: السلوك كما هو تماماً.
 *   - الزائر يقدر يقرأ فقط قنوات البث العامة (stooorna-live-* و stooorna-livecam-*)،
 *     وبدون أي بيانات أعضاء: نرجع عدد المستمعين فقط. باقي الغرف (سرّية/مكالمات) تبقى 401.
 *   - GET /api/room?live=1 : قائمة البثوث الشغّالة الآن {hosts:[{id,kind,count,name,username,avatarUrl}]}
 *     للزائر وللمسجّل. هذي اللي يعتمد عليها GuestLive.tsx لاكتشاف البثوث.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { roomSnapshot } from '../../lib/voiceRoom.js';
import * as voiceRoomModule from '../../lib/voiceRoom.js';

const VOICE_PREFIX = 'stooorna-live-';
const CAM_PREFIX = 'stooorna-livecam-';

const isPublicLiveChannel = (id: string) =>
  id.length <= 100 && (id.startsWith(VOICE_PREFIX) || id.startsWith(CAM_PREFIX));

const slugOf = (id: string) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);

function membersOf(roomId: string): any[] {
  try {
    const snap: any = roomSnapshot(roomId);
    return Array.isArray(snap?.members) ? snap.members : [];
  } catch {
    return [];
  }
}

/** يحاول إيجاد قائمة الغرف من voiceRoom.js بدون معرفة أسماء التصديرات بالضبط. */
function listRoomIds(): { ids: string[]; supported: boolean } {
  const m: any = voiceRoomModule;
  const toIds = (r: any): string[] => {
    if (!r) return [];
    if (r instanceof Map) return Array.from(r.keys()).map(String);
    if (r instanceof Set) return Array.from(r).map(String);
    if (Array.isArray(r)) return r.map((x: any) => (typeof x === 'string' ? x : String(x?.id ?? x?.roomId ?? ''))).filter(Boolean);
    if (typeof r === 'object') return Object.keys(r);
    return [];
  };
  for (const k of ['listRoomIds', 'getRoomIds', 'allRoomIds', 'getAllRoomIds', 'listRooms', 'getRooms', 'allRooms', 'getAllRooms']) {
    if (typeof m[k] === 'function') {
      try { return { ids: toIds(m[k]()), supported: true }; } catch { /* next */ }
    }
  }
  for (const k of ['rooms', 'roomMap', 'roomsById', 'ROOMS', 'roomStore']) {
    if (m[k] && typeof m[k] === 'object') return { ids: toIds(m[k]), supported: true };
  }
  return { ids: [], supported: false };
}

function liveHostsList() {
  const { ids, supported } = listRoomIds();
  const byHost = new Map<string, { id: string; kind: 'voice' | 'camera'; count: number; name: string | null; username: string | null; avatarUrl: string | null }>();
  for (const roomId of ids) {
    const isCam = roomId.startsWith(CAM_PREFIX);
    const isVoice = !isCam && roomId.startsWith(VOICE_PREFIX);
    if (!isCam && !isVoice) continue;
    const members = membersOf(roomId);
    if (members.length === 0) continue;
    const slug = roomId.slice((isCam ? CAM_PREFIX : VOICE_PREFIX).length);
    const host = members.find(mb => slugOf(String(mb?.userId ?? mb?.id ?? '')) === slug);
    const hostId = host ? String(host.userId ?? host.id) : slug;
    const prev = byHost.get(hostId);
    if (prev && prev.kind === 'camera' && !isCam) continue; // البث المرئي يغلب الصوتي
    byHost.set(hostId, {
      id: hostId,
      kind: isCam ? 'camera' : 'voice',
      count: members.length,
      name: host?.name ?? null,
      username: host?.username ?? null,
      avatarUrl: host?.avatarUrl ?? host?.image ?? null,
    });
  }
  return { hosts: Array.from(byHost.values()), supported };
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    const roomId = (req.query.id as string) || 'ch1';

    if (req.query.live === '1') return res.json(liveHostsList());

    if (!session?.user) {
      // زائر: قنوات البث العامة فقط، وعدد المستمعين بدون أي هوية
      if (isPublicLiveChannel(roomId)) {
        const members = membersOf(roomId);
        return res.json({ guest: true, members: members.map(() => ({})) });
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.json(roomSnapshot(roomId));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
