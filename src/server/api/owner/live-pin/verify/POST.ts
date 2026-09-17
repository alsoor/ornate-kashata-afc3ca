import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { pin } = req.body as { pin: string };
    if (!pin) return res.json({ valid: false });

    // Drizzle execute returns [rows, fields] for mysql2
    const result = await db.execute(sql`SELECT pin_value FROM owner_live_pin WHERE id = 1 LIMIT 1`) as any;
    // result may be [rows] or [[rows], fields] depending on Drizzle version
    let stored: string | null = null;
    if (Array.isArray(result)) {
      const rows = Array.isArray(result[0]) ? result[0] : result;
      if (rows.length > 0 && rows[0]) {
        stored = (rows[0] as any).pin_value ?? null;
      }
    }

    if (!stored) {
      // No PIN set in DB — reject (don't fall back to hardcoded on server side)
      return res.json({ valid: false });
    }

    res.json({ valid: pin === stored });
  } catch (e) {
    console.error('[live-pin verify]', e);
    res.json({ valid: false });
  }
}
