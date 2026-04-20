/**
 * CORS Testing Utility
 * ====================
 * Helper functions to test CORS configuration programmatically
 * Usage: Run in development or within tests
 *
 * File location: src/lib/cors-testing.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCORSConfig,
  validateOrigin,
  validateMethod,
  validateRequestHeaders,
  isPreflightRequest,
  handleCORSPreflight,
} from './cors-security';

export interface CORSTestResult {
  passed: boolean;
  testName: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Test 1: Verify no wildcard origins
 */
export function testNoWildcardOrigins(): CORSTestResult {
  const config = getCORSConfig();

  const hasWildcard = config.allowedOrigins.some((origin) => origin === '*');

  return {
    passed: !hasWildcard,
    testName: 'No Wildcard Origins',
    message: hasWildcard
      ? 'FAIL: Wildcard (*) found in ALLOWED_ORIGINS'
      : 'PASS: No wildcard origins',
    details: {
      allowedOrigins: config.allowedOrigins,
      hasWildcard,
    },
  };
}

/**
 * Test 2: Verify trusted domain validation
 */
export function testTrustedDomainValidation(): CORSTestResult {
  const config = getCORSConfig();

  const validOrigins = [
    'https://yourdomain.com',
    'https://app.yourdomain.com',
  ];

  const allValid = validOrigins.every((origin) => {
    return validateOrigin(origin, config.allowedOrigins);
  });

  return {
    passed: allValid || config.allowedOrigins.length === 0,
    testName: 'Trusted Domain Validation',
    message: allValid
      ? 'PASS: All trusted domains validate correctly'
      : config.allowedOrigins.length === 0
      ? 'PASS: No origins configured (uses same-origin policy)'
      : 'FAIL: Some trusted domains failed validation',
    details: {
      configuredOrigins: config.allowedOrigins,
      validationResults: validOrigins.map((origin) => ({
        origin,
        valid: !!validateOrigin(origin, config.allowedOrigins),
      })),
    },
  };
}

/**
 * Test 3: Verify untrusted origins are rejected
 */
export function testUntrustedOriginRejection(): CORSTestResult {
  const config = getCORSConfig();

  const maliciousOrigins = [
    'https://malicious-site.com',
    'https://attacker.com',
    'http://invalid.com',
  ];

  const allRejected = maliciousOrigins.every((origin) => {
    return !validateOrigin(origin, config.allowedOrigins);
  });

  return {
    passed: allRejected,
    testName: 'Untrusted Origin Rejection',
    message: allRejected
      ? 'PASS: All untrusted origins are rejected'
      : 'FAIL: Some untrusted origins were not rejected',
    details: {
      testOrigins: maliciousOrigins,
      rejectionResults: maliciousOrigins.map((origin) => ({
        origin,
        rejected: !validateOrigin(origin, config.allowedOrigins),
      })),
    },
  };
}

/**
 * Test 4: Verify allowed HTTP methods are restricted
 */
export function testMethodRestriction(): CORSTestResult {
  const config = getCORSConfig();

  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const bannedMethods = ['PATCH', 'TRACE', 'CONNECT'];

  const allowedValid = allowedMethods.every((method) =>
    validateMethod(method, config.allowedMethods)
  );

  const bannedRejected = bannedMethods.every(
    (method) => !validateMethod(method, config.allowedMethods)
  );

  return {
    passed: allowedValid && bannedRejected,
    testName: 'HTTP Method Restriction',
    message:
      allowedValid && bannedRejected
        ? 'PASS: Methods are properly restricted'
        : 'FAIL: Method validation failed',
    details: {
      configuredMethods: config.allowedMethods,
      allowedMethodsValid: allowedValid,
      bannedMethodsRejected: bannedRejected,
    },
  };
}

/**
 * Test 5: Verify allowed headers are restricted
 */
export function testHeaderRestriction(): CORSTestResult {
  const config = getCORSConfig();

  const allowedHeaders = ['Content-Type', 'Authorization'];
  const bannedHeaders = ['X-Custom-Header', 'X-API-Key', 'Cookie'];

  const allowedValid = validateRequestHeaders(
    allowedHeaders.join(', '),
    config.allowedHeaders
  );

  const bannedRejected = !validateRequestHeaders(
    bannedHeaders.join(', '),
    config.allowedHeaders
  );

  return {
    passed: allowedValid && bannedRejected,
    testName: 'Header Restriction',
    message:
      allowedValid && bannedRejected
        ? 'PASS: Headers are properly restricted'
        : 'FAIL: Header validation failed',
    details: {
      configuredHeaders: config.allowedHeaders,
      allowedHeadersValid: allowedValid,
      bannedHeadersRejected: bannedRejected,
    },
  };
}

/**
 * Test 6: Verify credential sharing is secure
 */
export function testCredentialSecurity(): CORSTestResult {
  const config = getCORSConfig();

  // Credentials should only be enabled if origins are explicitly configured
  const credentialsConfigChecks = {
    credentialsEnabled: config.credentials,
    originsConfigured: config.allowedOrigins.length > 0,
    secure:
      !config.credentials || config.allowedOrigins.length > 0,
  };

  return {
    passed: credentialsConfigChecks.secure,
    testName: 'Credential Sharing Security',
    message: credentialsConfigChecks.secure
      ? 'PASS: Credentials properly configured'
      : 'FAIL: Credentials enabled without explicit origins',
    details: credentialsConfigChecks,
  };
}

/**
 * Test 7: Verify preflight handling
 */
export async function testPreflightHandling(): Promise<CORSTestResult> {
  const config = getCORSConfig();

  // Simulate preflight request
  const preflightUrl = new URL('https://yourdomain.com/api/test');
  const preflightRequest = new NextRequest(preflightUrl, {
    method: 'OPTIONS',
    headers: {
      origin: config.allowedOrigins[0] || 'https://yourdomain.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type',
    },
  });

  const isPreFlight = isPreflightRequest(preflightRequest.method);

  return {
    passed: isPreFlight,
    testName: 'Preflight Request Detection',
    message: isPreFlight
      ? 'PASS: Preflight requests are properly detected'
      : 'FAIL: Preflight detection failed',
    details: {
      method: preflightRequest.method,
      isPreflightDetected: isPreFlight,
    },
  };
}

/**
 * Test 8: Verify environment variable configuration
 */
export function testEnvironmentConfiguration(): CORSTestResult {
  const config = getCORSConfig();

  const configValid = {
    originsConfigured: config.allowedOrigins.length > 0,
    methodsConfigured: config.allowedMethods.length > 0,
    headersConfigured: config.allowedHeaders.length > 0,
    maxAgeSet: config.maxAge > 0,
  };

  const allConfigured = Object.values(configValid).every(Boolean);

  return {
    passed: allConfigured,
    testName: 'Environment Configuration',
    message: allConfigured
      ? 'PASS: All required configuration is set'
      : 'FAIL: Some configuration is missing',
    details: configValid,
  };
}

/**
 * Run all CORS tests
 */
export async function runAllCORSTests(): Promise<{
  allPassed: boolean;
  results: CORSTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}> {
  const results: CORSTestResult[] = [
    testNoWildcardOrigins(),
    testTrustedDomainValidation(),
    testUntrustedOriginRejection(),
    testMethodRestriction(),
    testHeaderRestriction(),
    testCredentialSecurity(),
    await testPreflightHandling(),
    testEnvironmentConfiguration(),
  ];

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  results.forEach((result) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    if (result.details) {
    }
  });

  return {
    allPassed: failed === 0,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
    },
  };
}

/**
 * Test CORS configuration and output results to console
 * Usage in API route or command:
 * 
 * import { testCORSConfiguration } from '@/lib/cors-testing';
 * 
 * export async function GET() {
 *   const results = await testCORSConfiguration();
 *   return NextResponse.json(results);
 * }
 */
export async function testCORSConfiguration() {
  return runAllCORSTests();
}
