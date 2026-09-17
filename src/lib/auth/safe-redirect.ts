/**
 * Post-login redirect-target validation.
 *
 * The `?from=` query param (used to carry the intended destination across the
 * new-tab OAuth hop in AuthPage) is attacker-controllable and flows into
 * `callbackURL: window.location.origin + from`. Because `origin` has no trailing
 * slash, an unvalidated value can escape the origin and become an open redirect:
 *   - `.evil.com`  → `https://app.example.com.evil.com`      (foreign host)
 *   - `@evil.com`  → `https://app.example.com@evil.com`      (host = evil.com, rest is userinfo)
 *   - `//evil.com` / `/\evil.com` → protocol-relative, normalized to a foreign host
 *   - `/\t//evil.com` → the URL parser strips tab/newline/CR mid-parse, back to protocol-relative
 *
 * `toSafeInternalPath` returns the value only when it is unambiguously a same-site
 * absolute path, else `null`. Dependency-free (pure string logic, no DOM) so it is
 * trivially testable and safe to import anywhere. This is defense-in-depth;
 * BetterAuth also validates `callbackURL` against `trustedOrigins` server-side.
 */
export function toSafeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Must be an absolute path. A leading `/` is what stops `.evil.com` / `@evil.com`
  // from concatenating onto the origin's host.
  if (!raw.startsWith('/')) return null;
  // `//` and `/\` are protocol-relative (browsers normalize `\` to `/`), which
  // resolve to a foreign host.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  // Whitespace (tab/newline/CR) is stripped by the URL parser mid-parse and can
  // reconstruct a protocol-relative URL (e.g. `/\t//evil.com`).
  if (/\s/.test(raw)) return null;
  return raw;
}
