import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';
import { 
  getSafeErrorMessage, 
  sanitizeResponseHeaders, 
  HEADERS_TO_REMOVE,
  sanitizeData 
} from './information-disclosure-prevention';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const SENSITIVE_IP_WHITELIST = process.env.SENSITIVE_OPERATIONS_IP_WHITELIST
  ?.split(',')
  .map(ip => ip.trim())
  .filter(Boolean) || [];

export const ALLOWED_CORS_ORIGINS = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map(o => o.trim())
  .filter(Boolean) || [];

/**
 * Get client IP address from request
 */
export function getClientIp(request: Request): string {
  const headersList = new Headers(request.headers);
  const rawIp = (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    headersList.get('cf-connecting-ip') ||
    '127.0.0.1'
  );
  
  // Normalize IP: Strip port numbers if present (e.g., "127.0.0.1:3000" -> "127.0.0.1")
  // Handles both IPv4 (127.0.0.1:port) and IPv6 ([::1]:port)
  if (rawIp.includes(':')) {
    if (rawIp.includes('[') && rawIp.includes(']')) {
      // IPv6 with port
      return rawIp.split(']')[0].replace('[', '');
    }
    if (rawIp.split(':').length === 2) {
      // IPv4 with port
      return rawIp.split(':')[0];
    }
  }
  
  return rawIp;
}

/**
 * Verify authentication and return authenticated user session
 * Returns null if unauthenticated
 */
export async function verifyAuthentication(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nib-auth-token')?.value;

    if (!token) {
      return null;
    }
    // Auth token verification log hidden

    const secretStr = process.env.JWT_SECRET || '';
    if (secretStr.length < 32) {
      throw new Error('JWT_SECRET not configured securely');
    }

    const secret = new TextEncoder().encode(secretStr);

    try {
      const { payload } = await jwtVerify(token, secret);
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Check absolute lifetime
      if (payload.abs && typeof payload.abs === 'number' && nowSeconds > payload.abs) {
        return null;
      }

      // Verify user is still active
      const user = await prisma.user.findUnique({
        where: { id: payload.id as string },
        select: {
          id: true,
          email: true,
          status: true,
          updatedAt: true,
          sessionId: true,
          roles: { include: { role: { select: { name: true } } } }
        }
      });

      if (!user || user.status !== 'ACTIVE') {
        return null;
      }

      // Single session enforcement
      if (user.sessionId !== payload.sid) {
        return null;
      }

      // POLICY UPDATE: Session versioning via updatedAt is unstable during activity tracking.
      // Reliability is maintained via sessionId and absolute lifetime (abs).

      return payload as any;
    } catch (e) {
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Verify client IP is in whitelist for sensitive operations
 */
export function verifyIpWhitelist(clientIp: string): boolean {
  if (SENSITIVE_IP_WHITELIST.length === 0) {
    // No whitelist configured = all authenticated IPs allowed
    return true;
  }

  // Check if IP is in whitelist (supports exact match and CIDR)
  return SENSITIVE_IP_WHITELIST.some(allowedIp => {
    if (allowedIp === clientIp) return true;
    
    // Basic CIDR support (e.g., "192.168.1.0/24")
    if (allowedIp.includes('/')) {
      const [subnet, maskBits] = allowedIp.split('/');
      const mask = (0xffffffff << (32 - parseInt(maskBits, 10))) >>> 0;
      const subnetNum = ipToNumber(subnet);
      const clientNum = ipToNumber(clientIp);
      return (subnetNum & mask) === (clientNum & mask);
    }

    return false;
  });
}

/**
 * Convert IP string to number (helper for CIDR)
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  return (
    ((parseInt(parts[0], 10) || 0) << 24) +
    ((parseInt(parts[1], 10) || 0) << 16) +
    ((parseInt(parts[2], 10) || 0) << 8) +
    (parseInt(parts[3], 10) || 0)
  );
}

/**
 * Apply security headers to response (no CORS by default)
 * SECURITY: Removes headers that expose server/framework information (A05:2021)
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  // Remove any default CORS headers
  response.headers.delete('Access-Control-Allow-Origin');
  response.headers.delete('Access-Control-Allow-Methods');
  response.headers.delete('Access-Control-Allow-Headers');
  response.headers.delete('Access-Control-Allow-Credentials');

  // SECURITY: Remove server information disclosure headers
  for (const header of HEADERS_TO_REMOVE) {
    response.headers.delete(header);
  }

  // Apply strict security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('Content-Security-Policy', "default-src 'self' blob:; frame-ancestors 'self'");
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Prevent content sniffing
  response.headers.set('Content-Type', 'application/json; charset=utf-8');

  return response;
}

/**
 * Return unauthenticated error response (generic message - no details)
 */
export function unauthorizedResponse(message?: string) {
  // SECURITY: Use generic message to prevent information disclosure
  const safeMessage = message ? getSafeErrorMessage(message) : 'Authentication required';
  const response = NextResponse.json(
    sanitizeData({ error: safeMessage, code: 'UNAUTHORIZED' }),
    { status: 401 }
  );
  return applySecurityHeaders(response);
}

/**
 * Return forbidden error response (generic message - no details)
 */
export function forbiddenResponse(message?: string) {
  // SECURITY: Use generic message to prevent information disclosure
  const safeMessage = message ? getSafeErrorMessage(message) : 'Access denied';
  const response = NextResponse.json(
    sanitizeData({ error: safeMessage, code: 'FORBIDDEN' }),
    { status: 403 }
  );
  return applySecurityHeaders(response);
}

/**
 * Return bad request error response (generic message - no details)
 */
export function badRequestResponse(message?: string) {
  // SECURITY: Use generic message to prevent information disclosure
  const safeMessage = message ? getSafeErrorMessage(message) : 'Invalid request';
  const response = NextResponse.json(
    sanitizeData({ error: safeMessage, code: 'BAD_REQUEST' }),
    { status: 400 }
  );
  return applySecurityHeaders(response);
}

/**
 * Return internal error response (generic message - never expose details)
 */
export function internalErrorResponse(message?: string) {
  // SECURITY: Never expose error details - always use generic message
  const safeMessage = 'An error occurred. Please try again or contact support.';
  const response = NextResponse.json(
    sanitizeData({ error: safeMessage, code: 'INTERNAL_ERROR' }),
    { status: 500 }
  );
  return applySecurityHeaders(response);
}

/**
 * Create success response with security headers applied
 */
export function successResponse(data: any, status = 200) {
  const sanitizedData = sanitizeData(data);
  const response = NextResponse.json(sanitizedData, { status });
  return applySecurityHeaders(response);
}
