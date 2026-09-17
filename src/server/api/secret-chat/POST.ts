// POST /api/secret-chat — create a new secret chat
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import bcrypt from 'bcryptjs';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.user.id;
  const userName = session.user.name ?? session.user.email ?? 'Someone';

  const { name, pin, memberIds } = req.body as { name?: string; pin?: string; memberIds?: string[] };
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (!pin || !/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-8 digits' });

  try {
    const pinHash = await bcrypt.hash(pin, 10);
    const chatName = name.trim();

    // db.execute() with drizzle-orm/mysql2 returns [ResultSetHeader, FieldPacket[]]
    // ResultSetHeader is at index [0] and has .insertId
    const insertResult = await db.execute(sql`
      INSERT INTO secret_chats (name, pin_hash, created_by)
      VALUES (${chatName}, ${pinHash}, ${userId})
    `);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatId = Number((insertResult as any)[0]?.insertId ?? 0);

    if (!chatId) {
      console.error('[secret-chat POST] insertId was 0, result:', JSON.stringify(insertResult));
      return res.status(500).json({ error: 'Failed to create chat — could not retrieve id' });
    }

    // Add creator as member
    await db.execute(sql`
      INSERT IGNORE INTO secret_chat_members (chat_id, user_id)
      VALUES (${chatId}, ${userId})
    `);

    // System message: creator joined
    await db.execute(sql`
      INSERT INTO secret_chat_messages (chat_id, sender_id, body, is_system)
      VALUES (${chatId}, ${userId}, ${`${userName} joined the chat`}, 1)
    `);

    // Add extra members if provided
    if (Array.isArray(memberIds)) {
      for (const mid of memberIds) {
        if (mid !== userId) {
          await db.execute(sql`
            INSERT IGNORE INTO secret_chat_members (chat_id, user_id)
            VALUES (${chatId}, ${mid})
          `);
        }
      }
    }

    return res.status(201).json({ id: chatId, name: chatName });

  } catch (e) {
    console.error('[secret-chat POST]', e);
    res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
