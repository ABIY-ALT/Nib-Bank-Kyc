/**
 * Middleware with Proxy Support
 * 
 * File: src/middleware-proxy-safe.ts
 * 
 * Proxy-aware middleware configuration
 * Detects proxy and adjusts headers accordingly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllSecurityHeaders,
  HEADERS_TO_REMOVE,
  getSecurityConfigForEnvironment,
} from '@/lib/security-headers';

/**
 * Detect if request came through a proxy
 */
function detectProxyHeaders(request: NextRequest) {
  return {
    isProxy: !!(
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') // Cloudflare
    ),
    forwardedFor: request.headers.get('x-forwarded-for'),
    realIp: request.headers.get('x-real-ip'),
    proto: request.headers.get('x-forwarded-proto'),
    host: request.headers.get('x-forwarded-host'),
    isCloudflare: !!request.headers.get('cf-connecting-ip'),
    isAWS: !!request.headers.get('x-amzn-trace-id'),
  };
}

/**
 * Middleware with proxy awareness
 * Safely handles headers whether behind proxy or direct
 */
export function middleware(request: NextRequest) {
  try {
    // Detect proxy
    const proxyInfo = detectProxyHeaders(request);

    // Create response
    let response = NextResponse.next();

    // Get environment configuration
    const securityConfig = getSecurityConfigForEnvironment();

    // Get security headers
    const securityHeaders = getAllSecurityHeaders(securityConfig);

    // Strategy:
    // 1. If behind proxy: Add headers (proxy will pass them through)
    // 2. If direct: Add headers (will go straight to user)
    // In both cases, middleware adds headers - proxy just passes them through

    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Remove sensitive headers
    HEADERS_TO_REMOVE.forEach((header) => {
      response.headers.delete(header);
    });

    // Remove other X-* headers that might leak info
    const headersToDelete: string[] = [];
    response.headers.forEach((value, key) => {
      if (
        key.toLowerCase().startsWith('x-') &&
        !['x-content-type-options', 'x-frame-options', 'x-xss-protection'].includes(
          key.toLowerCase()
        )
      ) {
        // Keep X-Forwarded-* headers if behind proxy
        if (proxyInfo.isProxy && key.toLowerCase().startsWith('x-forwarded-')) {
          return; // Keep it
        }
        headersToDelete.push(key);
      }
    });
    headersToDelete.forEach((header) => {
      response.headers.delete(header);
    });

    // Log proxy detection (for debugging)
    if (proxyInfo.isProxy) {
    }

    return response;
  } catch (error) {
    // Fallback response
    const fallbackResponse = NextResponse.next();
    fallbackResponse.headers.set('X-Content-Type-Options', 'nosniff');
    fallbackResponse.headers.set('X-Frame-Options', 'DENY');
    return fallbackResponse;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
