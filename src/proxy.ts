import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';
import crypto from 'crypto';

/**
 * Institutional Security Proxy.
 * Enforces:
 * 1. Nonce-based Content Security Policy (CSP)
 * 2. Absolute session caps (8h)
 * 3. Short idle timeouts (10m)
 * 4. Client Context Binding (IP + UA Hash)
 * 5. CSRF protection with Dynamic Origin Validation
 */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  KYC_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference', '/head-office', '/admin/storage'],
  BRANCH_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference'],
  VIEWER: ['/'],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('nib-auth-token')?.value;

  // 1. GENERATE CRYPTOGRAPHIC NONCE FOR CSP
  const nonce = Buffer.from(crypto.randomBytes(16)).toString('base64');
  
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval';
    style-src 'self' 'nonce-${nonce}' 'unsafe-inline';
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

  // 2. DYNAMIC CSRF VALIDATION (Origin & Referer)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const host = req.headers.get('host');
    const protocol = req.nextUrl.protocol;
    const internalOrigin = `${protocol}//${host}`;

    if (origin) {
      const isTrusted = ALLOWED_ORIGINS.length > 0 
        ? ALLOWED_ORIGINS.includes(origin) 
        : origin === internalOrigin;

      if (!isTrusted) {
        console.error(`[SECURITY_ALERT] CSRF Violation: Untrusted Origin Attempt: ${origin}`);
        return new NextResponse('CSRF Violation: Untrusted Origin', { status: 403 });
      }
    } else if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = refererUrl.origin;
        const isTrustedReferer = ALLOWED_ORIGINS.length > 0
          ? ALLOWED_ORIGINS.includes(refererOrigin)
          : refererOrigin === internalOrigin;

        if (!isTrustedReferer) {
          return new NextResponse('CSRF Violation: Untrusted Referer', { status: 403 });
        }
      } catch {
        return new NextResponse('CSRF Violation: Malformed Referer', { status: 403 });
      }
    }
  }

  // 3. Allow Public Assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized'
  ) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }

  // 4. Redirect Unauthenticated
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
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET environment variable is missing or insecure.");
    }
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 5. ABSOLUTE SESSION LIFETIME ENFORCEMENT
    if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
      const response = NextResponse.redirect(new URL('/login?reason=abs_timeout', req.url));
      response.cookies.delete('nib-auth-token');
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    // 6. CLIENT CONTEXT BINDING (IP + UA Hash)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const currentUaHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    if (payload.ip !== clientIp || payload.ua !== currentUaHash) {
      console.warn(`[SECURITY_ALERT] Session Restricted: Client context changed. IP: ${clientIp}`);
      const response = NextResponse.redirect(new URL('/login?reason=security_context', req.url));
      response.cookies.delete('nib-auth-token');
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

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
      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const isRoot = pathname === '/';
    const isAllowed = isRoot || allowedRoutes.some(route => 
      route !== '/' && pathname.startsWith(route)
    );

    if (!isAllowed) {
      const response = NextResponse.redirect(new URL('/unauthorized', req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      return response;
    }

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
    response.cookies.delete('nib-auth-token');
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  }
}
