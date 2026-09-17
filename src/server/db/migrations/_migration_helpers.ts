/**
 * Shared helpers for DB migration files.
 *
 * Drizzle wraps MySQL errors in DrizzleQueryError, so the MySQL errno lives on
 * e.cause, not on e itself.  All helpers here check both levels.
 */

/** MySQL error numbers that mean "already done — safe to ignore" */
const ALREADY_DONE_ERRNOS = new Set([
  1060, // ER_DUP_FIELDNAME  — duplicate column name
  1061, // ER_DUP_KEYNAME    — duplicate key name
  1062, // ER_DUP_ENTRY      — duplicate entry (unique constraint)
]);

/**
 * Returns true when the error is a MySQL "already exists / already done" error
 * that should be silently ignored during idempotent migrations.
 */
export function isAlreadyDoneError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as Record<string, unknown>;

  // Direct errno (raw mysql2 error or DrizzleQueryError on older versions)
  if (typeof err['errno'] === 'number' && ALREADY_DONE_ERRNOS.has(err['errno'])) return true;

  // Drizzle wraps the original error in .cause
  const cause = err['cause'];
  if (typeof cause === 'object' && cause !== null) {
    const causeErr = cause as Record<string, unknown>;
    if (typeof causeErr['errno'] === 'number' && ALREADY_DONE_ERRNOS.has(causeErr['errno'])) return true;
  }

  // Fallback: check the stringified message for known duplicate phrases
  const msg = String(e);
  if (
    msg.includes('Duplicate column') ||
    msg.includes('Duplicate key') ||
    msg.includes('Duplicate entry') ||
    msg.includes('ER_DUP_FIELDNAME') ||
    msg.includes('ER_DUP_KEYNAME') ||
    msg.includes('ER_DUP_ENTRY')
  ) return true;

  return false;
}
