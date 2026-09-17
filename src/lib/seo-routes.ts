/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * DO NOT add or remove paths by hand. Static paths are mirrored here from
 * src/routes.tsx automatically whenever that file is edited (any manual
 * path edit would be overwritten on the next routes.tsx change). For sync
 * to pick up a route, its `path` must be a literal string starting with "/";
 * template literals and identifier refs are skipped, and dynamic-param routes
 * like "/products/:id" are excluded.
 *
 * The only fields safe to hand-edit are the per-entry metadata below, after a
 * sync:
 * - `priority` (0.0–1.0): Home = 1.0, main sections = 0.8, deep pages = 0.5.
 * - `changefreq` and `lastmod`.
 */

export interface SeoRoute {
  path: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  lastmod?: string;
}

export const seoRoutes: SeoRoute[] = [
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-07-31" },
  { path: "/feed", changefreq: "monthly", priority: 0.8 },
  { path: "/dm", changefreq: "monthly", priority: 0.8 },
  { path: "/whisper", changefreq: "monthly", priority: 0.8, lastmod: "2026-07-31" },
  { path: "/settings", changefreq: "monthly", priority: 0.3 },
  { path: "/add-friend", changefreq: "monthly", priority: 0.3 },
  { path: "/chat", changefreq: "monthly", priority: 0.3 },
  { path: "/room", changefreq: "daily", priority: 0.7, lastmod: "2026-07-31" },
  { path: "/profile", changefreq: "monthly", priority: 0.3 },
  { path: "/privacy", changefreq: "monthly", priority: 0.3 },
  { path: "/share", changefreq: "monthly", priority: 0.8 },
  { path: "/live", changefreq: "monthly", priority: 0.8 },
  { path: "/auth", changefreq: "monthly", priority: 0.8 },
];
