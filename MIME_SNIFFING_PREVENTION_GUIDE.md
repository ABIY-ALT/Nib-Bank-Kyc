/**
 * MIME-Sniffing Prevention Implementation Guide
 * 
 * This document describes how to apply proper Content-Type and security headers
 * to all API endpoints for MIME-sniffing prevention.
 */

// ============================================================
// PATTERN 1: Using NextResponse.json() with Headers
// ============================================================
// This is the recommended approach for most API routes

import { NextResponse } from "next/server";

export async function GET() {
  try {
    // ... your endpoint logic ...
    
    const response = NextResponse.json({
      success: true,
      data: { /* your data */ }
    });
    
    // Set proper Content-Type and security headers
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    
    return response;
  } catch (error) {
    const response = NextResponse.json(
      { error: 'An error occurred' }, 
      { status: 500 }
    );
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
}

// ============================================================
// PATTERN 2: Using the ApiResponse Utility (NEW)
// ============================================================
// Use this for consistency across multiple routes
// File: src/lib/api-response.ts

import { ApiResponse } from '@/lib/api-response';

export async function GET() {
  try {
    // ... your endpoint logic ...
    
    return ApiResponse.success(
      { /* your data */ }, 
      'Success message',
      200
    );
  } catch (error) {
    return ApiResponse.error('Error message', 500);
  }
}

// ============================================================
// PATTERN 3: For responses with custom Content-Type
// ============================================================
// Use this for XML, CSV, or other content types

import { NextResponse } from "next/server";

export async function GET() {
  const csvData = 'name,email\nJohn,john@example.com';
  
  const response = new NextResponse(csvData);
  response.headers.set('Content-Type', 'text/csv; charset=utf-8');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  return response;
}

// ============================================================
// GLOBAL SECURITY HEADERS (Applied Automatically)
// ============================================================
// The following headers are applied to ALL responses via middleware.ts:

// X-Content-Type-Options: nosniff
//   - Prevents MIME sniffing
//   - Browser will use the declared Content-Type
//   - Prevents content type confusion attacks

// X-Frame-Options: DENY
//   - Prevents clickjacking attacks
//   - Disallows framing this site in iframes

// X-XSS-Protection: 1; mode=block
//   - Legacy XSS protection
//   - Stops page if XSS is detected

// Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
//   - Enforces HTTPS (production only)
//   - Protects against man-in-the-middle attacks

// Content-Security-Policy: [nonce-based]
//   - Prevents injection attacks
//   - Strict script/style/resource controls

// Referrer-Policy: strict-origin-when-cross-origin
//   - Limits referrer information
//   - Protects user privacy

// Permissions-Policy: geolocation=(), microphone=(), camera=()
//   - Disables sensitive browser features
//   - Unless explicitly needed

// ============================================================
// BROWSER COMPLIANCE
// ============================================================
// Modern browsers that respect X-Content-Type-Options: nosniff:
// ✅ Chrome 45+
// ✅ Firefox 50+
// ✅ Safari 11.1+
// ✅ Edge 14+
// ✅ Opera 32+
//
// Older browsers will ignore the header but won't break
// Legacy systems should use proper Content-Type on the server side

// ============================================================
// CHECKLIST FOR API ROUTES
// ============================================================
// When creating new API endpoints:
//
// [ ] Response has proper Content-Type header
//     - application/json; charset=utf-8 for JSON
//     - text/plain; charset=utf-8 for text
//     - application/xml; charset=utf-8 for XML
//     - etc.
//
// [ ] Response includes X-Content-Type-Options: nosniff
//
// [ ] Error responses also include proper headers
//
// [ ] Use NextResponse for setting headers
//     (middleware applies to NextResponse objects)
//
// [ ] For consistency, use ApiResponse utility when possible
//
// [ ] Test with curl/postman to verify headers:
//     curl -i https://your-api/endpoint
//     Look for Content-Type and X-Content-Type-Options headers

// ============================================================
// TESTING
// ============================================================
// To verify MIME-sniffing protection is working:
//
// 1. Check response headers in browser DevTools:
//    Network tab → select request → Headers → Response Headers
//
// 2. Verify with curl:
//    curl -i https://your-api/endpoint
//
// 3. Check for:
//    Content-Type: application/json; charset=utf-8
//    X-Content-Type-Options: nosniff
//
// 4. Test with the ApiResponse utility:
//    Should automatically set both headers
