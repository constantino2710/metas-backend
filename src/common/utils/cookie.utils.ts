import type { Request } from 'express';

type CookieBag = Record<string, string | undefined>;

const normalize = (key: string) => key.trim().toLowerCase();

const fromParsedCookies = (
  req: Request | undefined,
  candidates: string[],
): string | null => {
  if (!req) return null;
  const parsed = req as unknown as { cookies?: CookieBag } | undefined;
  const jar: CookieBag | undefined = parsed?.cookies;
  if (!jar) return null;

  for (const name of candidates) {
    const direct = jar[name];
    if (typeof direct === 'string' && direct.length > 0) return direct;

    const normalized = normalize(name);
    for (const [cookieName, value] of Object.entries(jar)) {
      if (
        normalize(cookieName) === normalized &&
        typeof value === 'string' &&
        value.length > 0
      ) {
        return value;
      }
    }
  }

  return null;
};

const fromHeader = (
  req: Request | undefined,
  candidates: string[],
): string | null => {
  if (!req) return null;
  const header = req.headers?.cookie;
  if (!header) return null;

  const lookup = candidates.map(normalize);

  for (const raw of header.split(';')) {
    if (!raw) continue;
    const [name, ...rest] = raw.split('=');
    if (!name || rest.length === 0) continue;

    const normalized = normalize(name);
    if (!lookup.includes(normalized)) continue;

    const value = rest.join('=').trim();
    if (!value) continue;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
};

export const extractCookie = (
  req: Request | undefined,
  ...names: string[]
): string | null => {
  if (names.length === 0) return null;

  return fromParsedCookies(req, names) ?? fromHeader(req, names);
};
