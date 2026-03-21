import { NextRequest, NextResponse } from 'next/server';

/**
 * @fileOverview Institutional Security Middleware Utilities.
 * - Request size validation (30MB Max)
 * - Content-Type validation
 * - Rate limiting engine (IP-based)
 */

const MAX_REQUEST_SIZE = 30 * 1024 * 1024; // 30MB

/**
 * Appends standard institutional security headers to a response.
 */
export function applySecurityHeaders(res: NextResponse) {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return res;
}

/**
 * Validates request content length against institutional limits.
 */
export async function validateRequestSize(req: NextRequest): Promise<boolean> {
  const contentLength = req.headers.get('content-length');
  if (!contentLength) return true;

  const size = parseInt(contentLength, 10);
  if (size > MAX_REQUEST_SIZE) {
    console.error(
      `[Security Governance] Request exceeds max size: ${(size / 1024 / 1024).toFixed(2)}MB`
    );
    return false;
  }
  return true;
}

/**
 * Validates content-type header for API integrity.
 */
export function validateContentType(
  req: NextRequest,
  allowedTypes: string[] = ['application/json', 'multipart/form-data']
): boolean {
  const contentType = req.headers.get('content-type');
  if (!contentType) return true;

  return allowedTypes.some((type) =>
    contentType.toLowerCase().includes(type)
  );
}

/**
 * Simple IP-based rate limiting engine.
 * Note: Uses in-memory Map. For multi-node production, migrate to Redis.
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
    // Initialize new window
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
