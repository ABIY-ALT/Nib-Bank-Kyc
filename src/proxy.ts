import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';

const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_IMAGE_ASSET = /\.(png|jpg|jpeg|svg|webp|avif|ico)$/i;

function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(Array.from(array, (byte) => String.fromCharCode(byte)).join(''));
}

async function hashString(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('nib-auth-token')?.value;

  const nonce = generateNonce();

  const isDevelopment = process.env.NODE_ENV === 'development';
  // construction of strict Content Security Policy
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-inline'" : ""};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src * data: blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' blob:;
    frame-ancestors 'none';
    connect-src 'self';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  // 4. Allow public assets
  const isPublicImageAsset = PUBLIC_IMAGE_ASSET.test(pathname);
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    isPublicImageAsset
  ) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }

  // 5. Redirect unauthenticated
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/' && pathname !== '/login' && isValidInternalRedirect(pathname)) {
      loginUrl.searchParams.set('callbackUrl', pathname);
    }
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }

  try {
    const secretStr = process.env.JWT_SECRET || "";
    if (secretStr.length < 32) {
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET missing or insecure.");
    }
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);

    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
      const response = NextResponse.redirect(new URL('/login?reason=abs_timeout', req.url));
      response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    let clientIp = rawIp.trim();
    
    // Normalize IP: Strip port numbers
    if (clientIp.includes(':')) {
      if (clientIp.includes('[') && clientIp.includes(']')) {
        clientIp = clientIp.split(']')[0].replace('[', '');
      } else if (clientIp.split(':').length === 2) {
        clientIp = clientIp.split(':')[0];
      }
    }

    console.log(`[PROXY] Request: ${pathname} | IP: ${clientIp}`);
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const currentUaHash = await hashString(userAgent);

    if (payload.ip !== clientIp || payload.ua !== currentUaHash) {
      const response = NextResponse.redirect(new URL('/login?reason=security_context', req.url));
      response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const userRole = typeof payload.role === 'string' ? payload.role.trim().toUpperCase() : '';
    const hasDefinedRole = Boolean(userRole && userRole !== 'UNASSIGNED' && userRole !== 'VIEWER');

    if (pathname === '/login') {
      const nextUrl = hasDefinedRole ? new URL('/', req.url) : new URL('/unauthorized?reason=ROLE_UNASSIGNED', req.url);
      const response = NextResponse.redirect(nextUrl);
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    if (!hasDefinedRole) {
      const response = NextResponse.redirect(new URL('/unauthorized?reason=ROLE_UNASSIGNED', req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
    response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)$).*)',
  ],
};