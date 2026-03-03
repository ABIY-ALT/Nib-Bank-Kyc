
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Institutional Security Middleware.
 * Enforces JWT verification and Role-Based Access Control (RBAC) at the Edge.
 */

const PROTECTED_ROUTES = {
  ADMIN: ['/admin', '/dashboard', '/submissions', '/reports', '/performance', '/kyc'],
  OFFICER: ['/dashboard', '/submissions', '/kyc'],
  VIEWER: ['/dashboard'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('token')?.value;

  // 1. Allow public assets and Auth API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized'
  ) {
    return NextResponse.next();
  }

  // 2. Redirect unauthenticated users to login
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  try {
    // 3. Verify JWT using jose (required for Edge runtime)
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    const userRole = (payload.role as string) || 'VIEWER';

    // 4. Handle authenticated users visiting login page
    if (pathname === '/login') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // 5. Enforce RBAC Matrix
    // Note: We check if the pathname starts with any of the restricted directories
    const isAccessingAdmin = pathname.startsWith('/admin');
    const isAccessingKyc = pathname.startsWith('/submissions') || pathname.startsWith('/kyc');
    const isAccessingDashboard = pathname === '/' || pathname.startsWith('/dashboard');

    if (userRole === 'SUPER_ADMIN') {
      return NextResponse.next();
    }

    if (userRole === 'KYC_OFFICER' || userRole === 'BRANCH_OFFICER') {
      // Officers cannot access /admin
      if (isAccessingAdmin) {
        const url = req.nextUrl.clone();
        url.pathname = '/unauthorized';
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // Default: VIEWER or others
    if (isAccessingAdmin || isAccessingKyc) {
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch (error) {
    // 6. Handle expired or tampered tokens
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.cookies.delete('token');
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
