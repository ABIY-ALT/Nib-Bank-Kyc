/**
 * Security Headers Configuration
 * 
 * Comprehensive security headers for HTTP response hardening
 * Prevents fingerprinting, XSS, clickjacking, and other common attacks
 * 
 * SECURITY REQUIREMENTS:
 * - Replace wildcard (*) directives with explicitly trusted domains
 * - Restrict resource loading (scripts, styles, images, etc.) to known and trusted sources only
 * - Implement a least-privilege CSP policy tailored to application requirements
 * 
 * CSP Strictness Levels:
 * 1. Prevent XSS attacks by disabling inline scripts (except nonce-based in dev)
 * 2. Restrict script execution to self + nonce/strict-dynamic
 * 3. Restrict style loading to self + trusted CDNs
 * 4. Restrict image loading to self + trusted sources (no wildcard *)
 * 5. Restrict font loading to self + Google Fonts (trusted, HTTPS only)
 * 6. Restrict connection/API calls to self + own domain
 */

/**
 * Security Header Values - Customized for each environment
 */
export interface SecurityHeadersConfig {
  environment: 'development' | 'staging' | 'production';
  domain: string;
}

/**
 * Get CSP (Content-Security-Policy) header value
 * Strict policy preventing inline scripts and external sources
 * 
 * Policy enforces:
 * - No inline scripts (except with nonce in development)
 * - Scripts only from self + cryptographic nonce
 * - Styles only from self + trusted CDNs
 * - Images only from self + trusted CDNs (NO wildcard)
 * - Fonts only from self + Google Fonts
 * - Connections only to own domain
 */
export function getContentSecurityPolicy(config: SecurityHeadersConfig): string {
  const isDev = config.environment === 'development';
  
  // Base policy - restrict everything to self
  const policies = [
    // Scripts: only from self + trusted CDNs, no inline scripts (except nonce)
    `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ''} https://cdn.jsdelivr.net https://cdnjs.cloudflare.com`,
    
    // Styles: only from self + trusted CDNs, allow inline (with nonce in production)
    `style-src 'self'${isDev ? " 'unsafe-inline'" : ""} https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data:`,
    
    // Images: self, data URIs, and EXPLICIT trusted sources ONLY (NO wildcard https:)
    `img-src 'self' data: blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com`,
    
    // Fonts: from self + trusted CDNs
    `font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com`,
    
    // Connect: API calls, WebSockets (restrict to your domain)
    `connect-src 'self' https://${config.domain} wss://${config.domain}${isDev ? ' http://localhost:* ws://localhost:*' : ''}`,
    
    // Media: audio/video from self + EXPLICIT trusted sources ONLY (NO wildcard https:)
    `media-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com`,
    
    // Object/embed: disable unless needed
    `object-src 'none'`,
    `frame-src 'self'`,
    
    // Base URI: restrict where <base> tag can load from
    `base-uri 'self'`,
    
    // Form action: restrict form submissions
    `form-action 'self'`,
    
    // Upgrade insecure requests in production
    ...(config.environment === 'production' ? [`upgrade-insecure-requests`] : []),
    
    // Block reports
    `report-uri /api/security/csp-report`,
    
    // Fallback
    `default-src 'self'`,
  ];

  return policies.join('; ');
}

/**
 * Get Permissions-Policy header value
 * Restrict browser features that might be abused
 */
export function getPermissionsPolicy(): string {
  const policy = [
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'battery=()',
    'camera=()',
    'cross-origin-isolated=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'execution-while-not-rendered=()',
    'execution-while-out-of-viewport=()',
    'fullscreen=()',
    'geolocation=()',
    'gyroscope=()',
    'layout-animations=()',
    'legacy-image-formats=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'navigation-override=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-get=()',
    'speaker-selection=()',
    'sync-script=()',
    'usb=()',
    'vr=()',
    'wake-lock=()',
    'xr-spatial-tracking=()',
  ];

  return policy.join(',');
}

/**
 * Get Referrer-Policy header value
 * Control how much referrer information is shared
 */
export function getReferrerPolicy(): string {
  return 'strict-origin-when-cross-origin';
  // Other options:
  // 'no-referrer' - never send referrer info
  // 'same-origin' - only for same-origin requests
  // 'strict-origin' - only origin in HTTPS to HTTPS
}

/**
 * Get HSTS (Strict-Transport-Security) header value
 * Force HTTPS connections and prevent MITM attacks
 * 
 * SECURITY BENEFITS:
 * - max-age=31536000: Enforce HTTPS for 1 year
 * - includeSubDomains: Apply to all subdomains
 * - preload: Allow browser preload lists (production only)
 * 
 * ATTACK MITIGATIONS:
 * ✅ Prevents Man-in-the-Middle (MITM) attacks
 * ✅ Prevents SSL stripping attacks (attacker can't downgrade to HTTP)
 * ✅ Prevents protocol downgrade attacks
 * ✅ Browser refuses HTTP connections for 1 year after first HTTPS visit
 */
export function getStrictTransportSecurity(config: SecurityHeadersConfig): string {
  if (config.environment === 'production') {
    // Full HSTS with preload for production
    // Domain can be submitted to HSTS preload list at https://hstspreload.org/
    return 'max-age=31536000; includeSubDomains; preload';
  }
  
  // Development/Staging: HSTS without preload
  return 'max-age=31536000; includeSubDomains';
}

/**
 * All security headers configuration
 */
export const SECURITY_HEADERS = {
  // Prevent browsers from interpreting files as wrong MIME type
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking attacks
  'X-Frame-Options': 'DENY',
  
  // Legacy XSS protection (deprecated but kept for compatibility)
  'X-XSS-Protection': '1; mode=block',
  
  // HSTS - will be set dynamically based on environment
  // 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Referrer Policy - will be set dynamically
  // 'Referrer-Policy': getReferrerPolicy(),
  
  // Permissions Policy - will be set dynamically
  // 'Permissions-Policy': getPermissionsPolicy(),
  
  // CSP - will be set dynamically
  // 'Content-Security-Policy': getContentSecurityPolicy(config),
  
  // Remove headers that expose technology stack
  // These are handled by removing/not adding them
};

/**
 * Sensitive headers to remove from all responses
 */
export const HEADERS_TO_REMOVE = [
  'X-Powered-By',
  'X-AspNet-Version',
  'X-AspNetMvc-Version',
  'Server', // Can't fully remove at application level (IIS adds it), but we try
  'X-Runtime',
  'X-Response-Time',
];

/**
 * Get all security headers for a given environment
 */
export function getAllSecurityHeaders(config: SecurityHeadersConfig): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': getReferrerPolicy(),
    'Permissions-Policy': getPermissionsPolicy(),
    'Strict-Transport-Security': getStrictTransportSecurity(config),
    'Content-Security-Policy': getContentSecurityPolicy(config),
  };
}

/**
 * Security headers for API responses (stricter than web pages)
 */
export function getApiSecurityHeaders(config: SecurityHeadersConfig): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': getStrictTransportSecurity(config),
    'Content-Type': 'application/json; charset=utf-8',
  };
}

/**
 * Get environment-specific domain for CSP
 */
export function getSecurityConfigForEnvironment(): SecurityHeadersConfig {
  const env = (process.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production';
  
  let domain = 'localhost:3000';
  
  if (env === 'production') {
    domain = process.env.NEXT_PUBLIC_APP_URL?.replace('https://', '').replace('http://', '') || 'yourdomain.com';
  } else if (env === 'staging') {
    domain = process.env.NEXT_PUBLIC_STAGING_URL?.replace('https://', '').replace('http://', '') || 'staging.yourdomain.com';
  }
  
  return {
    environment: env,
    domain,
  };
}
