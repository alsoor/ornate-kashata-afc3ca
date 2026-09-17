import sameAsConfig from '../config/same-as.json';

export function getSameAsUrls(): string[] {
  const urls: unknown[] = Array.isArray(sameAsConfig.urls) ? (sameAsConfig.urls as unknown[]) : [];
  return urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export function buildOrganizationNode(params: {
  siteUrl: string;
  name: string;
  logo?: string;
  businessType?: string;
}): Record<string, unknown> {
  const businessType = params.businessType ?? 'Organization';
  const node: Record<string, unknown> = {
    '@type': businessType,
    '@id': `${params.siteUrl}/#organization`,
    name: params.name,
    url: `${params.siteUrl}/`,
  };

  if (params.logo) {
    node.logo = params.logo;
  }

  const sameAs = getSameAsUrls();
  if (sameAs.length > 0) {
    node.sameAs = sameAs;
  }

  return node;
}

export function buildHomepageSameAsJsonLdDocument(params: {
  siteUrl: string;
  organizationName: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    ...buildOrganizationNode({
      siteUrl: params.siteUrl,
      name: params.organizationName,
    }),
  };
}

export function buildHomepageJsonLd(params: {
  siteUrl: string;
  organizationName: string;
  logo?: string;
  businessType?: string;
  datePublished: string;
  dateModified: string;
}): Record<string, unknown> {
  const websiteId = `${params.siteUrl}/#website`;
  const webpageId = `${params.siteUrl}/#webpage`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: params.organizationName,
        url: `${params.siteUrl}/`,
      },
      buildOrganizationNode({
        siteUrl: params.siteUrl,
        name: params.organizationName,
        logo: params.logo,
        businessType: params.businessType,
      }),
      {
        '@type': 'WebPage',
        '@id': webpageId,
        url: `${params.siteUrl}/`,
        isPartOf: { '@id': websiteId },
        about: { '@id': `${params.siteUrl}/#organization` },
        datePublished: params.datePublished,
        dateModified: params.dateModified,
      },
    ],
  };
}
