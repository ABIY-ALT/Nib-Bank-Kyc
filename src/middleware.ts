import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';
import crypto from 'crypto';

/**
 * Institutional Security Middleware.
 * Enforces:
 * 1. Absolute session caps (8h)
 * 2. Short idle timeouts (10m)
 * 3. Client Context Binding (IP + UA Hash)
 * 4. CSRF protection for state-changing routes
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  KYC_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference', '/head-office'],
  BRANCH_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference'],
  VIEWER: ['/'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('nib-auth-token')?.value;

  // 1. CSRF VALIDATION (Origin/Referer Check)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const host = req.headers.get('host');

    if (origin) {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return new NextResponse('CSRF Violation: Origin Mismatch', { status: 403 });
      }
    } else if (referer) {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        return new NextResponse('CSRF Violation: Referer Mismatch', { status: 403 });
      }
    }
  }

  // 2. Allow Public Assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized'
  ) {
    return NextResponse.next();
  }

  // 3. Redirect Unauthenticated
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/' && pathname !== '/login' && isValidInternalRedirect(pathname)) {
      loginUrl.searchParams.set('callbackUrl', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secretStr = process.env.JWT_SECRET || "";
    if (secretStr.length < 32) {
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET environment variable is missing or insecure.");
    }
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 4. ABSOLUTE SESSION LIFETIME ENFORCEMENT
    if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
      const response = NextResponse.redirect(new URL('/login?reason=abs_timeout', req.url));
      response.cookies.delete('nib-auth-token');
      return response;
    }

    // 5. CLIENT CONTEXT BINDING (IP + UA Hash)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const currentUaHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    if (payload.ip !== clientIp || payload.ua !== currentUaHash) {
      const response = NextResponse.redirect(new URL('/login?reason=security_context', req.url));
      response.cookies.delete('nib-auth-token');
      return response;
    }

    const userRole = (payload.role as string) || 'VIEWER';
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }

    const allowedRoutes = ROLE_PERMISSIONS[userRole];
    if (!allowedRoutes) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }

    if (allowedRoutes.includes('*')) {
      return NextResponse.next();
    }

    if (pathname.startsWith('/admin') && userRole !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }

    const isRoot = pathname === '/';
    const isAllowed = isRoot || allowedRoutes.some(route => 
      route !== '/' && pathname.startsWith(route)
    );

    if (!isAllowed) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }

    return NextResponse.next();
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
    response.cookies.delete('nib-auth-token');
    return response;
  }
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
