import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isValidInternalRedirect } from './lib/url-security';

/**
 * Institutional Security Proxy (Edge Optimized).
 * Hardened with Nonce-based CSP, strict origin validation, CORS, and client context binding.
 *
 * CORS Configuration:
 * - ALLOWED_ORIGINS: Comma-separated trusted domains (env var)
 * - No wildcard origins ever allowed
 * - Validates all cross-origin requests
 * - Returns 403 Forbidden for unauthorized origins
 */

// Parse and validate CORS origins from environment
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',')
  .map(o => o.trim())
  .filter((o) => {
    // Reject wildcard explicitly
    if (o === '*') {
      console.warn('[CORS] WARNING: Wildcard origin (*) in ALLOWED_ORIGINS - this is not allowed and will be ignored');
      return false;
    }
    return !!o;
  }) || [];

const IS_PROD = process.env.NODE_ENV === 'production';

const PUBLIC_IMAGE_ASSET = /\.(png|jpg|jpeg|svg|webp|avif|ico)$/i;

/**
 * Validate origin against whitelist
 * Returns validated origin or null if invalid
 */
function validateOrigin(requestOrigin: string | null, allowedOrigins: string[]): string | null {
  if (!requestOrigin) return null;
  
  // Normalize and validate
  const normalized = requestOrigin.toLowerCase();
  const isAllowed = allowedOrigins.some(
    (allowed) => allowed.toLowerCase() === normalized
  );
  
  return isAllowed ? requestOrigin : null;
}

/**
 * Handle CORS preflight requests (OPTIONS method)
 */
function handleCORSPreflight(req: NextRequest, allowedOrigins: string[]): NextResponse {
  const origin = req.headers.get('origin');
  const method = req.headers.get('access-control-request-method');
  const headers = req.headers.get('access-control-request-headers');

  // Validate origin if CORS is configured
  if (allowedOrigins.length > 0 && origin) {
    const validatedOrigin = validateOrigin(origin, allowedOrigins);
    if (!validatedOrigin) {
      return new NextResponse('Forbidden: Invalid origin', { status: 403 });
    }

    // Validate method
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
    if (method && !allowedMethods.includes(method.toUpperCase())) {
      return new NextResponse('Forbidden: Method not allowed', { status: 403 });
    }

    // Validate headers
    const allowedHeaders = ['Content-Type', 'Authorization'];
    if (headers) {
      const requestedHeaders = headers.split(',').map(h => h.trim().toLowerCase());
      const headersValid = requestedHeaders.every(h =>
        allowedHeaders.some(allowed => allowed.toLowerCase() === h)
      );
      if (!headersValid) {
        return new NextResponse('Forbidden: Headers not allowed', { status: 403 });
      }
    }

    // Return successful preflight
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', validatedOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, HEAD, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '7200');
    
    const credentialSharing = process.env.CREDENTIAL_SHARING === 'true';
    if (credentialSharing) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return response;
  }

  // If no CORS configured, still handle preflight
  const response = new NextResponse(null, { status: 204 });
  return response;
}

/**
 * Apply CORS headers to response if origin is validated
 */
function applyCORSHeaders(
  response: NextResponse,
  requestOrigin: string | null,
  allowedOrigins: string[]
): NextResponse {
  // Only add CORS headers if configured and origin is valid
  if (allowedOrigins.length > 0 && requestOrigin) {
    const validatedOrigin = validateOrigin(requestOrigin, allowedOrigins);
    if (validatedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', validatedOrigin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, HEAD, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.headers.set('Access-Control-Max-Age', '7200');
      
      const credentialSharing = process.env.CREDENTIAL_SHARING === 'true';
      if (credentialSharing) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
    }
  }
  
  return response;
}

/**
 * Generates a high-entropy CSP nonce using Web Crypto API.
 */
function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(Array.from(array, (byte) => String.fromCharCode(byte)).join(''));
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

  // 0. HANDLE CORS PREFLIGHT IMMEDIATELY
  if (req.method === 'OPTIONS') {
    return handleCORSPreflight(req, ALLOWED_ORIGINS);
  }

  // 1. GENERATE CRYPTOGRAPHIC NONCE
  const nonce = generateNonce();
  
  // 2. CONSTRUCT STRICT CONTENT SECURITY POLICY
  // Aligned with Next.js 15 strict requirements:
  // - script-src uses 'strict-dynamic' with nonce
  // - style-src allows Google Fonts and nonced blocks
  // - In development, allow 'unsafe-inline' for HMR and build tools
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-inline'" : ""};
    style-src 'self' https://fonts.googleapis.com${isDevelopment ? " 'unsafe-inline'" : ""};
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

  // 3. CORS VALIDATION & CSRF PROTECTION FOR STATE-CHANGING REQUESTS
  const origin = req.headers.get('origin');
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const host = req.headers.get('host');
    const protocol = req.nextUrl.protocol;
    const internalOrigin = `${protocol}//${host}`;

    if (origin) {
      // If CORS is configured, validate against whitelist
      if (ALLOWED_ORIGINS.length > 0) {
        const validatedOrigin = validateOrigin(origin, ALLOWED_ORIGINS);
        if (!validatedOrigin) {
          return new NextResponse('Forbidden: Invalid origin (CORS policy)', { status: 403 });
        }
      } else {
        // If CORS not configured, allow same-origin only
        if (origin !== internalOrigin) {
          return new NextResponse('Forbidden: Cross-origin requests not allowed', { status: 403 });
        }
      }
    }
  }

  // 4. ALLOW PUBLIC ASSETS
  const isPublicImageAsset = PUBLIC_IMAGE_ASSET.test(pathname);
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    isPublicImageAsset
  ) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('Content-Security-Policy', cspHeader);
    return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
  }

  // 5. REDIRECT UNAUTHENTICATED
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/' && pathname !== '/login' && isValidInternalRedirect(pathname)) {
      loginUrl.searchParams.set('callbackUrl', pathname);
    }
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Content-Security-Policy', cspHeader);
    return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
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
      response.cookies.set('nib-auth-token', '', {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'strict',
        expires: new Date(0),
        path: '/',
      });
      response.headers.set('Content-Security-Policy', cspHeader);
      return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
    }

    // 7. CLIENT CONTEXT BINDING
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const currentUaHash = await hashString(userAgent);

    if (payload.ip !== clientIp || payload.ua !== currentUaHash) {
      const response = NextResponse.redirect(new URL('/login?reason=security_context', req.url));
      response.cookies.set('nib-auth-token', '', {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'strict',
        expires: new Date(0),
        path: '/',
      });
      response.headers.set('Content-Security-Policy', cspHeader);
      return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
    }

    // 8. ROLE VALIDATION
    const userRole = typeof payload.role === 'string' ? payload.role.trim().toUpperCase() : '';
    const hasDefinedRole = Boolean(userRole && userRole !== 'UNASSIGNED' && userRole !== 'VIEWER');

    if (pathname === '/login') {
      const nextUrl = hasDefinedRole
        ? new URL('/', req.url)
        : new URL('/unauthorized?reason=ROLE_UNASSIGNED', req.url);
      const response = NextResponse.redirect(nextUrl);
      response.headers.set('Content-Security-Policy', cspHeader);
      return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
    }

    if (!hasDefinedRole) {
      const response = NextResponse.redirect(new URL('/unauthorized?reason=ROLE_UNASSIGNED', req.url));
      response.headers.set('Content-Security-Policy', cspHeader);
      return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login?reason=session_invalid', req.url));
    response.cookies.set('nib-auth-token', '', {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      expires: new Date(0),
      path: '/',
    });
    response.headers.set('Content-Security-Policy', cspHeader);
    return applyCORSHeaders(response, origin, ALLOWED_ORIGINS);
  }
}

// Keep security controls on app and API routes, but bypass immutable/static assets.
// Running the proxy on Next.js chunk requests adds avoidable work and can interfere
// with static asset delivery and caching.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)$).*)',
  ],
};
