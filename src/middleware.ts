import { proxy } from './proxy';
import type { NextRequest } from 'next/server';

/**
 * Institutional Middleware Entry.
 * Wraps the localized proxy handler to satisfy Next.js conventions
 * while maintaining the requested proxy structure.
 */
export async function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
