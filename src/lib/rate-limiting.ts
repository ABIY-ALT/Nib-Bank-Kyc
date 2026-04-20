/**
 * Rate Limiting Middleware for Auth Endpoints
 * 
 * Prevents:
 * - Brute force login attacks
 * - Token refresh abuse
 * - Denial of service (DoS)
 * 
 * Strategy: Token bucket algorithm
 * - IP-based rate limits for login (5 attempts per 15 minutes)
 * - Per-user rate limits for refresh (60 requests per hour)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { safeLog } from '@/lib/logging-redaction';

const prisma = new PrismaClient();

/**
 * Rate Limit Configuration
 */
export const RATE_LIMIT_CONFIG = {
  // Login: 5 attempts per 15 minutes per IP
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },

  // Token Refresh: 60 requests per hour per user
  REFRESH: {
    maxAttempts: 60,
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  // Logout: 10 requests per hour per user
  LOGOUT: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

/**
 * In-memory rate limit store
 *
 * This store is process-local, which matches the current deployment model.
 * Format: { "key:timestamp": count }
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Cleanup old entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Every minute

/**
 * Check rate limit for a given key
 */
function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(key, entry);

    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(entry.resetAt),
    };
  }

  // Increment count
  entry.count++;

  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);

  return {
    allowed,
    remaining,
    resetAt: new Date(entry.resetAt),
  };
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Rate Limit Middleware for Login
 * 
 * Strategy: IP-based rate limiting
 * Limit: 5 attempts per 15 minutes
 */
export function createLoginRateLimitMiddleware() {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const clientIp = getClientIp(request);
    const key = `login:${clientIp}`;

    const { allowed, remaining, resetAt } = checkRateLimit(
      key,
      RATE_LIMIT_CONFIG.LOGIN.maxAttempts,
      RATE_LIMIT_CONFIG.LOGIN.windowMs
    );

    if (!allowed) {
      safeLog.warn('Login rate limit exceeded', {
        ip: clientIp,
        resetAt: resetAt.toISOString(),
      });

      const response = NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );

      // Set rate limit headers
      response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_CONFIG.LOGIN.maxAttempts));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
      response.headers.set('Retry-After', String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)));

      return response;
    }

    // Request allowed - add headers for client
    return null; // Continue to next middleware
  };
}

/**
 * Rate Limit Middleware for Refresh
 * 
 * Strategy: Per-user rate limiting
 * Limit: 60 requests per hour
 * 
 * Note: Used AFTER token verification (have userId available)
 */
export async function createRefreshRateLimitMiddleware(userId: string) {
  const key = `refresh:${userId}`;

  const { allowed, remaining, resetAt } = checkRateLimit(
    key,
    RATE_LIMIT_CONFIG.REFRESH.maxAttempts,
    RATE_LIMIT_CONFIG.REFRESH.windowMs
  );

  if (!allowed) {
    safeLog.warn('Refresh rate limit exceeded', {
      userId: userId.substring(0, 8),
      resetAt: resetAt.toISOString(),
    });

    const response = NextResponse.json(
      { error: 'Too many refresh attempts. Please try again later.' },
      { status: 429 }
    );

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_CONFIG.REFRESH.maxAttempts));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
    response.headers.set('Retry-After', String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)));

    return response;
  }

  return null; // Allowed
}

/**
 * Middleware: Add rate limit headers to response
 */
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

/**
 * Utility: Reset rate limit for a specific key (admin)
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
  safeLog.info('Rate limit reset', { key });
}

/**
 * Utility: Reset all rate limits for an IP (admin)
 */
export function resetIPRateLimits(ip: string): void {
  const keysToDelete = [];

  for (const key of rateLimitStore.keys()) {
    if (key.includes(ip)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => rateLimitStore.delete(key));

  safeLog.info('Rate limits reset for IP', {
    ip,
    count: keysToDelete.length,
  });
}

/**
 * Production-Ready Usage Example:
 * 
 * // In src/app/api/auth/route.ts
 * 
 * export async function POST(request: NextRequest) {
 *   const route = getRoute(request.nextUrl.pathname);
 *   
 *   if (route === 'login') {
 *     // Check IP-based rate limit
 *     const rateLimitResponse = await createLoginRateLimitMiddleware()(request);
 *     if (rateLimitResponse) return rateLimitResponse;
 *     
 *     // Proceed with login
 *     return postLogin(request);
 *   }
 *   
 *   if (route === 'refresh') {
 *     // Extract user from token
 *     const userId = await getUserIdFromToken(request);
 *     if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *     
 *     // Check user-based rate limit
 *     const rateLimitResponse = await createRefreshRateLimitMiddleware(userId);
 *     if (rateLimitResponse) return rateLimitResponse;
 *     
 *     // Proceed with refresh
 *     return postRefresh(request);
 *   }
 *   
 *   return postLogout(request);
 * }
 */
