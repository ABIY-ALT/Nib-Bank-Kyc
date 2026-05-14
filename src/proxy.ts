import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';
import { getRouteAccessDecision, type AccessUserLike } from './lib/access-control';
import { prisma } from './lib/prisma';
import { createAuditLog } from './actions/audit';

const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_IMAGE_ASSET = /\.(png|jpg|jpeg|svg|webp|avif|ico)$/i;

function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(Array.from(array, (byte) => String.fromCharCode(byte)).join(''));
}

// HSTS header with environment-specific configuration
function getHstsHeader(): string {
  // Production: Full HSTS with preload for maximum security
  // This tells browsers to always use HTTPS and can be added to HSTS preload list
  if (IS_PROD) {
    return 'max-age=31536000; includeSubDomains; preload';
  }
  // Development/Staging: HSTS without preload
  return 'max-age=31536000; includeSubDomains';
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
  // SECURITY: NO WILDCARDS - all directives use explicit domains only
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

  // Security headers for all responses
  // CSP: Prevent XSS and injection attacks
  // HSTS: Enforce HTTPS, prevent MITM and SSL stripping
  const hstsHeader = getHstsHeader();

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
    response.headers.set('Strict-Transport-Security', hstsHeader);

    // SECURITY: SUPPRESS SENSITIVE HEADERS (VULN #6 / CWE-933)
    response.headers.delete('X-AspNet-Version');
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');

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
    response.headers.set('Strict-Transport-Security', hstsHeader);
    return response;
  }

  try {
    const secretStr = process.env.JWT_SECRET;
    if (!secretStr || secretStr.length < 64) {
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET missing or insecure (min 64 chars required).");
    }
    const secret = new TextEncoder().encode(secretStr);
    
    let payload;
    try {
      const verified = await jwtVerify(token, secret);
      payload = verified.payload;
    } catch (err) {
      // SECURITY: Explicit rejection of tampered tokens
      const response = NextResponse.redirect(new URL('/login?reason=session_tampered', req.url));
      response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
      return response;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
      const response = NextResponse.redirect(new URL('/login?reason=abs_timeout', req.url));
      response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    let clientIp = rawIp.trim();

    // Normalize IP: Strip port numbers (VULN #1 - Improved logging)
    if (clientIp.includes(':')) {
      if (clientIp.includes('[') && clientIp.includes(']')) {
        clientIp = clientIp.split(']')[0].replace('[', '');
      } else if (clientIp.split(':').length === 2) {
        clientIp = clientIp.split(':')[0];
      }
    }

    // Proxy request details have been hidden for cleaner console output

    // CRITICAL: Fetch user's full data with roles and permissions for authorization checks
    // This prevents privilege escalation by validating ALL access at middleware level
    const userWithDetails = await prisma.user.findUnique({
      where: { id: payload.id as string },
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
      const response = NextResponse.redirect(new URL('/login?reason=user_not_found', req.url));
      response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
      return response;
    }

    // SINGLE SESSION ENFORCEMENT & CONCURRENT LOGIN CONTROL (VULN #7)
    if (userWithDetails.sessionId !== payload.sid) {
      const response = NextResponse.redirect(new URL('/login?reason=session_conflict', req.url));
      response.cookies.set('nib-auth-token', '', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', expires: new Date(0), path: '/' });
      return response;
    }

    // MANDATORY SECURITY: Force Password Change (VULN #4)
    // POLICY UPDATE: Handled via modal in the DashboardShell to preserve state.
    // The shell will block all interaction until password is changed.

    // BROKEN ACCESS CONTROL PREVENTION: Enforce route-based authorization
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
      }).catch(() => { });

      const redirectUrl = accessDecision.redirectTo || '/unauthorized';
      const response = NextResponse.redirect(new URL(redirectUrl, req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      response.headers.set('Strict-Transport-Security', hstsHeader);
      return response;
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('Strict-Transport-Security', hstsHeader);

    // SECURITY: SUPPRESS SENSITIVE HEADERS (VULN #6 / CWE-933)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.delete('X-AspNet-Version');
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');

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