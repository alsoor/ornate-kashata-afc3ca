/**
 * GET /api/friends
 * Returns accepted friends + pending incoming requests (requires auth)
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { friends, user, userBio } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, or, aliasedTable } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;

    // Alias tables so we can join both requester and addressee
    const requester = aliasedTable(user, 'requester');
    const addressee = aliasedTable(user, 'addressee');
    const requesterBio = aliasedTable(userBio, 'requester_bio');
    const addresseeBio = aliasedTable(userBio, 'addressee_bio');

    const rows = await db
      .select({
        id: friends.id,
        status: friends.status,
        requesterId: friends.requesterId,
        addresseeId: friends.addresseeId,
        createdAt: friends.createdAt,
        requesterName: requester.name,
        requesterUsername: requester.username,
        requesterEmail: requester.email,
        requesterAvatarUrl: requester.avatarUrl,
        requesterImage: requester.image,
        requesterBio: requesterBio.bio,
        addresseeName: addressee.name,
        addresseeUsername: addressee.username,
        addresseeEmail: addressee.email,
        addresseeAvatarUrl: addressee.avatarUrl,
        addresseeImage: addressee.image,
        addresseeBio: addresseeBio.bio,
      })
      .from(friends)
      .leftJoin(requester, eq(requester.id, friends.requesterId))
      .leftJoin(addressee, eq(addressee.id, friends.addresseeId))
      .leftJoin(requesterBio, eq(requesterBio.userId, requester.id))
      .leftJoin(addresseeBio, eq(addresseeBio.userId, addressee.id))
      .where(
        or(eq(friends.requesterId, meId), eq(friends.addresseeId, meId)),
      );

    // Accepted friends — show the OTHER person's info
    const accepted = rows
      .filter((r) => r.status === 'accepted')
      .map((r) => {
        const isRequester = r.requesterId === meId;
        return {
          id: r.id,
          friendId: isRequester ? r.addresseeId : r.requesterId,
          name: isRequester ? r.addresseeName : r.requesterName,
          username: isRequester ? r.addresseeUsername : r.requesterUsername,
          email: isRequester ? r.addresseeEmail : r.requesterEmail,
          avatarUrl: isRequester
            ? (r.addresseeAvatarUrl ?? r.addresseeImage ?? null)
            : (r.requesterAvatarUrl ?? r.requesterImage ?? null),
          bio: isRequester ? (r.addresseeBio ?? null) : (r.requesterBio ?? null),
          since: r.createdAt,
        };
      });

    // Pending incoming requests (they requested me)
    const incoming = rows
      .filter((r) => r.status === 'pending' && r.addresseeId === meId)
      .map((r) => ({
        id: r.id,
        requesterId: r.requesterId,
        name: r.requesterName,
        username: r.requesterUsername,
        email: r.requesterEmail,
        avatarUrl: r.requesterAvatarUrl ?? r.requesterImage ?? null,
        since: r.createdAt,
      }));

    // Pending outgoing requests (I requested them) so the UI can preserve
    // the waiting state after closing and reopening a profile.
    const outgoing = rows
      .filter((r) => r.status === 'pending' && r.requesterId === meId)
      .map((r) => ({
        id: r.id,
        addresseeId: r.addresseeId,
        name: r.addresseeName,
        username: r.addresseeUsername,
        avatarUrl: r.addresseeAvatarUrl ?? r.addresseeImage ?? null,
        since: r.createdAt,
      }));

    res.json({ accepted, incoming, outgoing });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch friends', message: String(error) });
  }
}
