import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  verifyAccessTokenJwtOnly,
  assertSubjectMatchesUserId,
  assertSessionClaimsShape,
  isAbsLifetimeExpired,
  clearSessionAuthCookies,
} from './lib/server-session-auth';
import { isValidInternalRedirect } from './lib/url-security';
import { getRouteAccessDecision, type AccessUserLike } from './lib/access-control';
import { prisma } from './lib/prisma';
import { createAuditLog } from './actions/audit';

const PUBLIC_IMAGE_ASSET = /\.(png|jpg|jpeg|svg|webp|avif|ico)$/i;

function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(Array.from(array, (byte) => String.fromCharCode(byte)).join(''));
}

function getHstsHeader(): string {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    return 'max-age=31536000; includeSubDomains; preload';
  }
  return 'max-age=31536000; includeSubDomains';
}

/** Auth APIs where missing/invalid session cookie is expected or handled in-route. */
function isPublicAuthApiPath(pathname: string): boolean {
  const publicPrefixes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/me',
    '/api/auth/logout',
    '/api/auth/request-password-reset',
    '/api/auth/reset-password',
    '/api/auth/complete-password-reset',
    '/api/auth/verify-password',
    '/api/auth/phone/',
  ];
  return publicPrefixes.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Return JSON 401/403 (not HTML redirect) so scanners and fetch() see real HTTP status codes.
 */
function shouldReturnJsonAuthFailure(request: NextRequest, pathname: string): boolean {
  if (isPublicAuthApiPath(pathname)) {
    return false;
  }
  if (request.method === 'POST' && request.headers.has('next-action')) {
    return true;
  }
  if (pathname.startsWith('/api/data/')) {
    return true;
  }
  if (pathname.startsWith('/api/dashboard/')) {
    return true;
  }
  return false;
}

function applyJsonSecurityHeaders(res: NextResponse, cspHeader: string, hstsHeader: string) {
  res.headers.set('Content-Security-Policy', cspHeader);
  res.headers.set('Strict-Transport-Security', hstsHeader);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.delete('X-AspNet-Version');
  res.headers.delete('X-Powered-By');
  res.headers.delete('Server');
}

/**
 * Institutional BFF Proxy.
 * Acts as the centralized security gateway for the web-based KYC system.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('nib-auth-token')?.value;

  const nonce = generateNonce();

  const isDevelopment = process.env.NODE_ENV === 'development';
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-inline' 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
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

  const hstsHeader = getHstsHeader();

  const isPublicAuth = isPublicAuthApiPath(pathname);
  const isPublicImageAsset = PUBLIC_IMAGE_ASSET.test(pathname);

  if (
    pathname.startsWith('/_next') ||
    (isPublicAuth && (pathname === '/api/auth/login' || pathname === '/api/auth/register' || pathname.startsWith('/api/auth/reset-password') || pathname.startsWith('/api/auth/complete-password-reset') || pathname === '/api/auth/request-password-reset')) ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    isPublicImageAsset
  ) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('Strict-Transport-Security', hstsHeader);
    response.headers.delete('X-AspNet-Version');
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');
    return response;
  }

  const wantJson = shouldReturnJsonAuthFailure(req, pathname);

  if (!token) {
    if (wantJson) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'NO_SESSION' },
        { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/' && pathname !== '/login' && isValidInternalRedirect(pathname)) {
      loginUrl.searchParams.set('callbackUrl', pathname);
    }
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('Strict-Transport-Security', hstsHeader);
    return response;
  }

  try {
    const phase = await verifyAccessTokenJwtOnly(token);
    if (!phase.ok) {
      if (phase.code === 'WEAK_SECRET') {
        if (wantJson) {
          const res = NextResponse.json(
            { error: 'Service unavailable', code: 'AUTH_MISCONFIGURED' },
            { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
          );
          applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
          return res;
        }
        throw new Error('SECURE_AUTH_FAULT: JWT_SECRET missing or insecure (min 64 chars required).');
      }

      if (wantJson) {
        const res = NextResponse.json(
          { error: 'Unauthorized', code: 'INVALID_SESSION', reason: phase.code },
          { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
        clearSessionAuthCookies(res);
        applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
        return res;
      }

      const reason =
        phase.code === 'BAD_SIGNATURE'
          ? 'session_tampered'
          : phase.code === 'EXPIRED'
            ? 'session_expired'
            : 'session_invalid';
      const response = NextResponse.redirect(new URL(`/login?reason=${reason}`, req.url));
      clearSessionAuthCookies(response);
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    const { payload } = phase;

    if (!assertSubjectMatchesUserId(payload) || !assertSessionClaimsShape(payload)) {
      if (wantJson) {
        const res = NextResponse.json(
          { error: 'Unauthorized', code: 'INVALID_CLAIMS' },
          { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
        clearSessionAuthCookies(res);
        applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
        return res;
      }
      const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
      clearSessionAuthCookies(response);
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    if (isAbsLifetimeExpired(payload)) {
      if (wantJson) {
        const res = NextResponse.json(
          { error: 'Unauthorized', code: 'SESSION_EXPIRED', reason: 'abs_timeout' },
          { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
        clearSessionAuthCookies(res);
        applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
        return res;
      }
      const response = NextResponse.redirect(new URL('/login?reason=abs_timeout', req.url));
      clearSessionAuthCookies(response);
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    const userWithDetails = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        sessionId: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: {
                      select: {
                        slug: true,
                        name: true,
                        group: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userWithDetails || userWithDetails.status !== 'ACTIVE') {
      if (wantJson) {
        const res = NextResponse.json(
          { error: 'Unauthorized', code: 'USER_INACTIVE' },
          { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
        clearSessionAuthCookies(res);
        applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
        return res;
      }
      const response = NextResponse.redirect(new URL('/login?reason=user_not_found', req.url));
      clearSessionAuthCookies(response);
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    if (userWithDetails.sessionId !== payload.sid || userWithDetails.id !== payload.id) {
      if (wantJson) {
        const res = NextResponse.json(
          { error: 'Unauthorized', code: 'SESSION_CONFLICT' },
          { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
        clearSessionAuthCookies(res);
        applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
        return res;
      }
      const response = NextResponse.redirect(new URL('/login?reason=session_conflict', req.url));
      clearSessionAuthCookies(response);
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    const accessDecision = getRouteAccessDecision(userWithDetails as AccessUserLike, pathname);

    if (!accessDecision.allowed) {
      await createAuditLog({
        userId: userWithDetails.id,
        userEmail: userWithDetails.email,
        action: 'UNAUTHORIZED_PAGE_ACCESS_ATTEMPT',
        details: `Unauthorized access attempt to ${pathname}`,
        metadata: {
          pathname,
          resource: 'PAGE_ACCESS',
          reason: accessDecision.redirectTo?.includes('required=')
            ? 'INSUFFICIENT_PERMISSIONS'
            : 'ACCESS_DENIED',
        },
      }).catch(() => {});

      if (wantJson) {
        const res = NextResponse.json(
          { error: 'Forbidden', code: 'INSUFFICIENT_PERMISSIONS' },
          { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
        applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
        return res;
      }

      const redirectUrl = accessDecision.redirectTo || '/unauthorized';
      const response = NextResponse.redirect(new URL(redirectUrl, req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('Strict-Transport-Security', hstsHeader);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.delete('X-AspNet-Version');
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');

    return response;
  } catch (error) {
    if (wantJson) {
      const res = NextResponse.json(
        { error: 'Unauthorized', code: 'SESSION_INVALID' },
        { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
      clearSessionAuthCookies(res);
      applyJsonSecurityHeaders(res, cspHeader, hstsHeader);
      return res;
    }
    const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
    clearSessionAuthCookies(response);
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('Strict-Transport-Security', hstsHeader);
    return response;
  }
}
