import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement } from 'react';
import { useLocation } from 'react-router';

import { buildHomepageSameAsJsonLdDocument } from '@/lib/organization-json-ld';
import { useJsonLdSiteUrl } from '@/lib/json-ld-site-url-context';
import { siteMeta } from '@/lib/site-meta';

/**
 * Injects baseline Organization JSON-LD on the homepage, with sameAs from
 * src/config/same-as.json when profile URLs exist. Synced on social connect
 * and before publish — no per-page wiring.
 */
export default function HomepageSameAsJsonLd(): ReactElement | null {
  const location = useLocation();
  const siteUrl: string = useJsonLdSiteUrl();

  if (location.pathname !== '/' || !siteUrl) {
    return null;
  }

  const jsonLd: Record<string, unknown> = buildHomepageSameAsJsonLdDocument({
    siteUrl,
    organizationName: siteMeta.name.trim() || new globalThis.URL(siteUrl).hostname,
  });

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
    </Helmet>
  );
}
