export type CountryInfo = {
  code: string;
  name: string;
};

const KEY = 'stooorna_profile_country';

function cacheKey(userId?: string | null) {
  return userId ? `${KEY}_${userId}` : KEY;
}

export function readSavedCountry(userId?: string | null): CountryInfo | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId)) || localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.name) return null;
    return { code: String(o.code || ''), name: String(o.name) };
  } catch {
    return null;
  }
}

export function saveCountry(info: CountryInfo, userId?: string | null) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(info));
    if (userId) localStorage.setItem(KEY, JSON.stringify(info));
    window.dispatchEvent(new CustomEvent('stooorna:profile-country', { detail: { ...info, userId } }));
  } catch {
    /* ignore */
  }
}

export async function detectCountryFromIp(): Promise<CountryInfo | null> {
  const urls = ['https://ipwho.is/', 'https://ipapi.co/json/'];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const d = await r.json();
      const name = String(d.country || d.country_name || '').trim();
      const code = String(d.country_code || d.countryCode || '').trim().toUpperCase();
      if (!name) continue;
      return { code, name };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function ensureMyCountry(userId?: string | null): Promise<CountryInfo | null> {
  const saved = readSavedCountry(userId);
  if (saved) return saved;
  const fresh = await detectCountryFromIp();
  if (fresh) saveCountry(fresh, userId);
  return fresh;
}
