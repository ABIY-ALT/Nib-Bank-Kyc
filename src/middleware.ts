import { NextResponse, type NextRequest } from 'next/server';

function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(Array.from(array, (byte) => String.fromCharCode(byte)).join(''));
}

function buildCSP(nonce: string) {
  return [
    "default-src 'self';",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic';`,
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline';",
    "font-src 'self' https://fonts.gstatic.com;",
    "img-src * data: blob:;",
    "object-src 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "frame-src 'self' blob:;",
    "frame-ancestors 'none';",
    "connect-src 'self';",
    'block-all-mixed-content;',
    'upgrade-insecure-requests;',
  ].join(' ');
}

export function middleware(req: NextRequest) {
  const nonce = generateNonce();
  const response = NextResponse.next();

  response.headers.set('Content-Security-Policy', buildCSP(nonce));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('x-nonce', nonce);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
