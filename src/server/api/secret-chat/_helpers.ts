import { db } from '../../db/client.js';

/**
 * drizzle-orm/mysql2 db.execute() returns [ResultSetHeader|RowDataPacket[], FieldPacket[]]
 * - For SELECT: result[0] is RowDataPacket[] (the actual rows)
 * - For INSERT/UPDATE/DELETE: result[0] is ResultSetHeader (has .insertId, .affectedRows)
 *
 * This helper extracts the rows array from a SELECT result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractRows(result: unknown): Record<string, unknown>[] {
  // result is [RowDataPacket[], FieldPacket[]] for SELECT
  // result[0] is the array of rows
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Record<string, unknown>[];
  }
  // Fallback: if result itself is a flat array of objects (shouldn't happen but safe)
  if (Array.isArray(result) && result.length > 0 && !Array.isArray(result[0])) {
    return result as Record<string, unknown>[];
  }
  return [];
}

/**
 * Execute a SELECT and return rows directly.
 */
export async function queryRows(query: Parameters<typeof db.execute>[0]): Promise<Record<string, unknown>[]> {
  const result = await db.execute(query);
  return extractRows(result);
}
