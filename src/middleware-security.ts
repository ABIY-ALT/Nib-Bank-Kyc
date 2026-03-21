import { NextRequest, NextResponse } from 'next/server';

/**
 * Security Middleware for All Requests
 * - Request size validation
 * - Content-Type validation
 * - Rate limiting headers
 */

const MAX_REQUEST_SIZE = 30 * 1024 * 1024; // 30MB

export function securityHeaders(req: NextRequest, res: NextResponse) {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.headers.set('Content-Security-Policy', "default-src 'self'");
  return res;
}

/**
 * Validates request content length
 */
export async function validateRequestSize(req: NextRequest): Promise<boolean> {
  const contentLength = req.headers.get('content-length');
  if (!contentLength) return true;

  const size = parseInt(contentLength, 10);
  if (size > MAX_REQUEST_SIZE) {
    console.error(
      `[Security Middleware] Request exceeds max size: ${(size / 1024 / 1024).toFixed(2)}MB`
    );
    return false;
  }
  return true;
}

/**
 * Validates content-type header
 */
export function validateContentType(
  req: NextRequest,
  allowedTypes: string[] = ['application/json']
): boolean {
  const contentType = req.headers.get('content-type');
  if (!contentType) return true;

  return allowedTypes.some((type) =>
    contentType.toLowerCase().includes(type)
  );
}

/**
 * Rate limit check based on IP
 * Simple in-memory implementation (use Redis for production)
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 500;

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    // New window
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
  }

  record.count++;
  const allowed = record.count <= MAX_REQUESTS_PER_WINDOW;

  return {
    allowed,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - record.count),
    resetTime: record.resetTime,
  };
}
