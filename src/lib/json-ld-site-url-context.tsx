import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

const JsonLdSiteUrlContext = createContext<string | undefined>(undefined);

interface JsonLdSiteUrlProviderProps {
  siteUrl: string;
  children: ReactNode;
}

export function JsonLdSiteUrlProvider({ siteUrl, children }: JsonLdSiteUrlProviderProps): ReactElement {
  return (
    <JsonLdSiteUrlContext.Provider value={siteUrl.replace(/\/$/, '')}>
      {children}
    </JsonLdSiteUrlContext.Provider>
  );
}

export function useJsonLdSiteUrl(): string {
  const fromContext: string | undefined = useContext(JsonLdSiteUrlContext);
  if (fromContext) {
    return fromContext;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  const fromEnv: string = import.meta.env.VITE_PUBLIC_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  return '';
}
