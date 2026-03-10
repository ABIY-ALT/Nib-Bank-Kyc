
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';

/**
 * Institutional Security Matrix.
 * Strictly enforced at the network edge with IP binding and CSRF Origin validation.
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

  // 1. CSRF VALIDATION (State-changing requests)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const host = req.headers.get('host');

    // Rule: Reject cross-origin mutations unless Origin strictly matches host
    if (origin) {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        console.warn(`[SECURITY_ALERT] CSRF blocked: Origin mismatch. Origin: ${origin}, Host: ${host}`);
        return new NextResponse('CSRF Violation', { status: 403 });
      }
    } else if (referer) {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        console.warn(`[SECURITY_ALERT] CSRF blocked: Referer mismatch. Referer: ${referer}, Host: ${host}`);
        return new NextResponse('CSRF Violation', { status: 403 });
      }
    }
  }

  // 2. Allow Public Assets and Auth APIs
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized'
  ) {
    return NextResponse.next();
  }

  // 3. Redirect Unauthenticated Personnel
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    
    if (pathname !== '/' && pathname !== '/login' && isValidInternalRedirect(pathname)) {
      loginUrl.searchParams.set('callbackUrl', pathname);
    }
    
    return NextResponse.redirect(loginUrl);
  }

  try {
    // 4. Verify JWT Identity and Integrity
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload } = await jwtVerify(token, secret);

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 5. Absolute Lifetime Check (8h)
    if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
      console.warn(`[SECURITY_ALERT] Absolute session lifetime expired for user: ${payload.email}`);
      const response = NextResponse.redirect(new URL('/login', req.url));
      response.cookies.delete('nib-auth-token');
      return response;
    }

    // 6. Contextual Binding Verification (IP)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    if (payload.ip && payload.ip !== clientIp) {
      console.warn(`[SECURITY_ALERT] Session IP breach attempt. Token IP: ${payload.ip}, Request IP: ${clientIp}`);
      const response = NextResponse.redirect(new URL('/login', req.url));
      response.cookies.delete('nib-auth-token');
      return response;
    }

    const userRole = (payload.role as string) || 'VIEWER';
    
    // 7. Handle Authenticated Login Access
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }

    // 8. Enforce Path Authorization Matrix
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
    // 9. Sanitize Failed Sessions
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete('nib-auth-token');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
