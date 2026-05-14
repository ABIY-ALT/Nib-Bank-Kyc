import { NextRequest } from 'next/server';
import { proxy } from './proxy';

/**
 * Next.js Middleware Entry Point.
 * Delegates all security and request filtering to the BFF Proxy layer (@src/proxy.ts).
 */
export async function middleware(req: NextRequest) {
  return await proxy(req);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets (png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)$).*)',
  ],
};
