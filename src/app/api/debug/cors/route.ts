/**
 * CORS Diagnostic Endpoint
 * ========================
 * Development utility to test and debug CORS configuration
 *
 * File location: src/app/api/debug/cors/route.ts
 * 
 * ACCESS:
 * - Development only (returns 403 in production)
 * - No authentication required
 * 
 * USAGE:
 * GET  /api/debug/cors - Full diagnostic report
 * POST /api/debug/cors - Test with custom origin
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCORSConfig,
  validateOrigin,
  validateMethod,
  validateRequestHeaders,
  isPreflightRequest,
} from '@/lib/cors-security';
import { runAllCORSTests } from '@/lib/cors-testing';

/**
 * Block in production
 */
function isProductionEnv(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/**
 * GET: Full CORS diagnostic report
 */
export async function GET(request: NextRequest) {
  // Block in production
  if (isProductionEnv()) {
    return NextResponse.json(
      { error: 'Diagnostic endpoint not available in production' },
      { status: 403 }
    );
  }

  try {
    const config = getCORSConfig();
    const requestOrigin = request.headers.get('origin');
    const userAgent = request.headers.get('user-agent');
    const requestHost = request.headers.get('host');

    // Run all CORS tests
    const testResults = await runAllCORSTests();

    // Check request origin validity
    const originValidation = requestOrigin
      ? {
          origin: requestOrigin,
          isValid: !!validateOrigin(requestOrigin, config.allowedOrigins),
          whitelistIncluded: config.allowedOrigins.includes(requestOrigin),
          normalizedMatch: config.allowedOrigins.some(
            (allowed) =>
              allowed.toLowerCase() === (requestOrigin || '').toLowerCase()
          ),
        }
      : { origin: null, isValid: true, note: 'Same-origin request' };

    const diagnosticReport = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      request: {
        method: request.method,
        url: request.nextUrl.pathname,
        origin: requestOrigin,
        host: requestHost,
        userAgent: userAgent?.substring(0, 100), // Truncate for readability
        headers: {
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
          accessControlRequestMethod: request.headers.get(
            'access-control-request-method'
          ),
          accessControlRequestHeaders: request.headers.get(
            'access-control-request-headers'
          ),
        },
      },
      corsConfiguration: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: config.allowedMethods,
        allowedHeaders: config.allowedHeaders,
        exposedHeaders: config.exposedHeaders,
        maxAge: config.maxAge,
        credentials: config.credentials,
        enableLogging: config.enableLogging,
      },
      originValidation,
      validation: {
        isPreflightRequest: isPreflightRequest(request.method),
        methodAllowed: validateMethod(request.method, config.allowedMethods),
        headersAllowed: validateRequestHeaders(
          request.headers.get('access-control-request-headers'),
          config.allowedHeaders
        ),
      },
      tests: {
        summary: testResults.summary,
        allPassed: testResults.allPassed,
        passedTests: testResults.results
          .filter((r) => r.passed)
          .map((r) => r.testName),
        failedTests: testResults.results
          .filter((r) => !r.passed)
          .map((r) => ({ name: r.testName, message: r.message })),
      },
      issues: analyzeIssues(config, testResults),
      recommendations: getRecommendations(config, testResults),
    };

    return NextResponse.json(diagnosticReport, { status: 200 });
  } catch (error) {
    console.error('[CORS Debug] Error:', error);
    return NextResponse.json(
      { error: 'Diagnostic error', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST: Test with custom origin
 * Body: { origin: 'https://example.com', method: 'POST', headers: 'Content-Type' }
 */
export async function POST(request: NextRequest) {
  if (isProductionEnv()) {
    return NextResponse.json(
      { error: 'Diagnostic endpoint not available in production' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { origin, method = 'POST', headers } = body;

    if (!origin) {
      return NextResponse.json(
        { error: 'Origin parameter required' },
        { status: 400 }
      );
    }

    const config = getCORSConfig();

    const testResult = {
      timestamp: new Date().toISOString(),
      testParameters: { origin, method, headers },
      results: {
        originValid: !!validateOrigin(origin, config.allowedOrigins),
        methodAllowed: validateMethod(method, config.allowedMethods),
        headersAllowed: !headers || validateRequestHeaders(headers, config.allowedHeaders),
        wouldProceed:
          !!validateOrigin(origin, config.allowedOrigins) &&
          validateMethod(method, config.allowedMethods) &&
          (!headers || validateRequestHeaders(headers, config.allowedHeaders)),
      },
      details: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: config.allowedMethods,
        allowedHeaders: config.allowedHeaders,
      },
    };

    return NextResponse.json(testResult, { status: 200 });
  } catch (error) {
    console.error('[CORS Debug] POST error:', error);
    return NextResponse.json(
      { error: 'Test error', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Analyze CORS configuration for issues
 */
function analyzeIssues(
  config: ReturnType<typeof getCORSConfig>,
  testResults: Awaited<ReturnType<typeof runAllCORSTests>>
): string[] {
  const issues: string[] = [];

  // Check for wildcard
  if (config.allowedOrigins.some((o) => o === '*')) {
    issues.push('⚠️ CRITICAL: Wildcard origin (*) is configured');
  }

  // Check for credentials without origins
  if (config.credentials && config.allowedOrigins.length === 0) {
    issues.push('⚠️ WARNING: Credentials enabled without explicit origins');
  }

  // Check for failed tests
  testResults.results
    .filter((r) => !r.passed)
    .forEach((r) => {
      issues.push(`❌ ${r.testName}: ${r.message}`);
    });

  // Check for empty configuration
  if (config.allowedOrigins.length === 0) {
    issues.push(
      'ℹ️ INFO: No CORS origins configured (using same-origin policy)'
    );
  }

  return issues.length > 0
    ? issues
    : ['✅ No issues detected'];
}

/**
 * Get recommendations for CORS configuration
 */
function getRecommendations(
  config: ReturnType<typeof getCORSConfig>,
  testResults: Awaited<ReturnType<typeof runAllCORSTests>>
): string[] {
  const recommendations: string[] = [];

  if (config.allowedOrigins.length === 0) {
    recommendations.push(
      'If cross-origin requests needed, configure ALLOWED_ORIGINS with trusted domains'
    );
  }

  if (!config.credentials && config.allowedOrigins.length > 0) {
    recommendations.push(
      'Credentials disabled by default (secure). Only enable if authentication cookies/tokens needed across origins'
    );
  }

  if (
    config.allowedMethods.includes('PATCH') ||
    config.allowedMethods.includes('TRACE')
  ) {
    recommendations.push(
      'Only necessary HTTP methods should be allowed (GET, POST, PUT, DELETE)'
    );
  }

  if (config.allowedHeaders.length > 2) {
    recommendations.push(
      'Restrict allowed headers to only required ones (Content-Type, Authorization)'
    );
  }

  if (!testResults.allPassed) {
    recommendations.push('Review failed tests and adjust configuration');
  }

  // Recommendation for production
  if (config.enableLogging) {
    recommendations.push(
      'Disable CORS_LOGGING in production (set ENABLE_CORS_LOGGING=false)'
    );
  }

  return recommendations.length > 0
    ? recommendations
    : ['✅ Configuration follows best practices'];
}

/**
 * OPTIONS: Allow preflight from any origin (debug endpoint only)
 */
export async function OPTIONS(request: NextRequest) {
  if (isProductionEnv()) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '3600',
    },
  });
}
