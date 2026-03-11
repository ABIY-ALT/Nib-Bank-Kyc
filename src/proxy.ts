
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';

/**
 * Institutional Security Proxy (Edge Optimized).
 * Hardened with Nonce-based CSP, strict origin validation, and client context binding.
 */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  KYC_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference', '/head-office', '/admin/storage'],
  BRANCH_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference'],
  VIEWER: ['/'],
};

/**
 * Generates a high-entropy CSP nonce using Web Crypto API.
 * Satisfaction of Edge Runtime constraints.
 */
function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

/**
 * Institutional Hash Generator.
 */
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

  // 1. GENERATE CRYPTOGRAPHIC NONCE
  const nonce = generateNonce();
  
  // 2. CONSTRUCT STRICT CONTENT SECURITY POLICY
  // - No unsafe-inline for scripts (uses nonce)
  // - Allows Google Fonts explicitly
  // - Uses strict-dynamic for framework scripts
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:;
    style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://picsum.photos;
    font-src 'self' https://fonts.gstatic.com;
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

  // 3. DYNAMIC ORIGIN & CSRF VALIDATION
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    const protocol = req.nextUrl.protocol;
    const internalOrigin = `${protocol}//${host}`;

    if (origin) {
      const isTrusted = ALLOWED_ORIGINS.length > 0 
        ? ALLOWED_ORIGINS.includes(origin) 
        : origin === internalOrigin;

      if (!isTrusted) {
        return new NextResponse('CSRF Violation: Untrusted Origin', { status: 403 });
      }
    }
  }

  // 4. ALLOW PUBLIC ASSETS
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    pathname === '/logo.svg'
  ) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }

  // 5. REDIRECT UNAUTHENTICATED
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

    // 6. ABSOLUTE SESSION LIFETIME ENFORCEMENT
    if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
      const response = NextResponse.redirect(new URL('/login?reason=abs_timeout', req.url));
      response.cookies.delete('nib-auth-token');
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    // 7. CLIENT CONTEXT BINDING
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const currentUaHash = await hashString(userAgent);

    if (payload.ip !== clientIp || payload.ua !== currentUaHash) {
      const response = NextResponse.redirect(new URL('/login?reason=security_context', req.url));
      response.cookies.delete('nib-auth-token');
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    // 8. ROLE-BASED ACCESS CONTROL (ROUTING)
    const userRole = (payload.role as string) || 'VIEWER';
    if (pathname === '/login') {
      const response = NextResponse.redirect(new URL('/', req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const allowedRoutes = ROLE_PERMISSIONS[userRole];
    if (!allowedRoutes) {
      const response = NextResponse.redirect(new URL('/unauthorized', req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    if (allowedRoutes.includes('*')) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const isRoot = pathname === '/';
    const isAllowed = isRoot || allowedRoutes.some(route => route !== '/' && pathname.startsWith(route));

    if (!isAllowed) {
      const response = NextResponse.redirect(new URL('/unauthorized', req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
    response.cookies.delete('nib-auth-token');
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }
}
