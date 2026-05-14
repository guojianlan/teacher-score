import 'server-only';
import { cookies, headers } from 'next/headers';

// Per checklist §四.17: RSC / Server Components MUST forward the user cookie to backend
// via the INTERNAL_API_URL. Browser cookies are not visible inside server fetches by
// default — we read them via next/headers and copy the cookie header through.

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

// Headers.set() requires ByteString (each char ≤ 0xFF). Cookies may carry
// non-ASCII characters (e.g. Chinese org names). Percent-encode the offending
// bytes — Better-Auth's own session cookies are already ASCII, so this is a
// no-op for them; it only re-encodes other cookies that happen to carry UTF-8.
function safeCookiePart(value: string): string {
  // Encode bytes > 0x7F; leave =, ;, /, etc. alone so cookie value structure stays intact.
  return value.replace(/[^\x20-\x7E]/g, (ch) => encodeURIComponent(ch));
}

async function buildHeaders(extra?: HeadersInit): Promise<Headers> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${safeCookiePart(c.value)}`)
    .join('; ');

  const headersList = await headers();
  const forwardFor = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? '';

  const out = new Headers(extra);
  if (cookieHeader) out.set('cookie', cookieHeader);
  if (forwardFor) out.set('x-forwarded-for', forwardFor);
  if (!out.has('content-type')) out.set('content-type', 'application/json');
  return out;
}

export async function apiServer<T>(path: string, init?: RequestInit): Promise<T | null> {
  const h = await buildHeaders(init?.headers);
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: h,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}
