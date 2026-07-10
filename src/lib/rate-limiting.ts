/**
 * Rate Limiting Middleware for Auth and File Endpoints
 * 
 * Prevents:
 * - Brute force login attacks
 * - Token refresh abuse
 * - Denial of service (DoS)
 * - Resource exhaustion via file uploads/downloads
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeLog } from '@/lib/logging-redaction';
import { 
  successResponse, 
  badRequestResponse, 
  unauthorizedResponse,
  tooManyRequestsResponse 
} from '@/lib/api-security';

/**
 * Rate Limit Configuration
 */
export const RATE_LIMIT_CONFIG = {
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  REFRESH: {
    maxAttempts: 60,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  LOGOUT: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  MEMO_UPLOAD: {
    maxAttempts: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000);

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
    return { allowed: true, remaining: limit - 1, resetAt: new Date(entry.resetAt) };
  }

  entry.count++;
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed, remaining, resetAt: new Date(entry.resetAt) };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function createLoginRateLimitMiddleware() {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const clientIp = getClientIp(request);
    const key = `login:${clientIp}`;
    const { allowed, remaining, resetAt } = checkRateLimit(key, RATE_LIMIT_CONFIG.LOGIN.maxAttempts, RATE_LIMIT_CONFIG.LOGIN.windowMs);

    if (!allowed) {
      safeLog.warn('Login rate limit exceeded', { ip: clientIp, resetAt: resetAt.toISOString() });
      const response = tooManyRequestsResponse('Too many login attempts.');
      addRateLimitHeaders(response, allowed, remaining, resetAt, RATE_LIMIT_CONFIG.LOGIN.maxAttempts);
      return response;
    }
    return null;
  };
}

export async function checkRefreshRateLimit(userId: string) {
  const key = `refresh:${userId}`;
  const { allowed, remaining, resetAt } = checkRateLimit(key, RATE_LIMIT_CONFIG.REFRESH.maxAttempts, RATE_LIMIT_CONFIG.REFRESH.windowMs);

  if (!allowed) {
    const response = tooManyRequestsResponse('Too many refresh attempts.');
    addRateLimitHeaders(response, allowed, remaining, resetAt, RATE_LIMIT_CONFIG.REFRESH.maxAttempts);
    return response;
  }
  return null;
}

export async function checkUploadRateLimit(userId: string) {
  const key = `upload:${userId}`;
  const { allowed, remaining, resetAt } = checkRateLimit(key, RATE_LIMIT_CONFIG.MEMO_UPLOAD.maxAttempts, RATE_LIMIT_CONFIG.MEMO_UPLOAD.windowMs);

  if (!allowed) {
    const response = tooManyRequestsResponse('Upload limit exceeded. Try again in an hour.');
    addRateLimitHeaders(response, allowed, remaining, resetAt, RATE_LIMIT_CONFIG.MEMO_UPLOAD.maxAttempts);
    return response;
  }
  return null;
}

// NOTE: Document VIEWING is intentionally not rate limited. Access is already
// session-authenticated, token-verified, and jurisdiction-checked per document;
// a per-user cap (formerly MEMO_ACCESS, 600/hr) kept locking out follow-up
// reviewers doing legitimate all-day case reviews.

export function addRateLimitHeaders(
  response: NextResponse,
  allowed: boolean,
  remaining: number,
  resetAt: Date,
  limit: number
): void {
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
  if (!allowed) {
    response.headers.set('Retry-After', String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)));
  }
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
