/**
 * JWT Token Types & Interfaces
 * 
 * SECURITY PRINCIPLES:
 * - Minimal payload: ONLY sub (user ID) and role (if needed for authorization)
 * - No PII: No email, phone, names, or device info
 * - No session metadata: No IP, user agent, or session IDs
 * - Typed validation: TypeScript ensures compliance
 */

/**
 * MINIMAL JWT PAYLOAD - Access Token
 * 
 * Contains ONLY:
 * - sub: User ID (required for identifying user)
 * - role: User role (required for authorization checks)
 * 
 * Standard JWT claims added by jose:
 * - iat: Issued at timestamp
 * - exp: Expiration timestamp (10-15 minutes)
 * - iss: Issuer (nib-bank-kyc)
 * - aud: Audience (api)
 * - jti: Token ID (unique identifier for revocation)
 */
export type JwtRole = 'ADMIN' | 'USER';

export interface AccessTokenPayload {
  sub: string; // User ID only
  role: JwtRole; // Role for authorization decisions
}

/**
 * Refresh Token Payload
 * 
 * Contains:
 * - sub: User ID
 * - type: 'refresh' (to differentiate from access tokens)
 * - tokenId: Unique identifier for this refresh token (for rotation)
 * 
 * Longer expiration: 7-30 days
 * Must be rotated on every use
 * Old ones invalidated immediately
 */
export interface RefreshTokenPayload {
  sub: string; // User ID only
  type: 'refresh'; // Token type identifier
  tokenId: string; // Unique ID for this specific token
}

/**
 * Verified Token Claims (after verification)
 * Includes standard JWT claims
 */
export interface VerifiedTokenClaims extends AccessTokenPayload {
  iat?: number; // Issued at
  exp?: number; // Expiration
  iss?: string; // Issuer
  aud?: string; // Audience
  jti?: string; // JWT ID (for revocation)
}

/**
 * Verified Refresh Token Claims
 */
export interface VerifiedRefreshTokenClaims extends RefreshTokenPayload {
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string;
}

/**
 * Token Pair Response
 * Returned on successful login or refresh
 */
export interface TokenPair {
  accessToken: string; // Short-lived (10-15 min)
  refreshToken: string; // Long-lived (7-30 days)
  expiresIn: number; // Access token expiration in seconds
  tokenType: 'Bearer';
}

/**
 * Cookie Configuration for Secure Token Storage
 * 
 * SECURITY REQUIREMENTS:
 * - HttpOnly: Cannot access from JavaScript (prevents XSS)
 * - Secure: Only sent over HTTPS
 * - SameSite: Strict or Lax (prevents CSRF)
 * - Domain: Restricted to origin domain
 */
export interface SecureTokenCookie {
  httpOnly: true; // Block JavaScript access
  secure: boolean; // HTTPS only in production, HTTP allowed in development
  sameSite: 'strict' | 'lax'; // CSRF protection
  path?: string; // Cookie path
  domain?: string; // Cookie domain
  maxAge?: number; // Cookie expiration (seconds)
}

/**
 * Token Configuration
 * Can be overridden per environment
 */
export interface TokenConfig {
  // Access token expiration (default 15 minutes)
  accessTokenExpiresIn: number; // milliseconds
  
  // Refresh token expiration (default 7 days)
  refreshTokenExpiresIn: number; // milliseconds
  
  // Algorithm for signing (HS256 or RS256)
  algorithm: 'HS256' | 'RS256';
  
  // Issuer claim
  issuer: string;
  
  // Audience claim
  audience: string;
}

/**
 * Token Verification Result
 * Result of verifying an access token
 */
export interface TokenVerificationResult {
  valid: boolean;
  claims?: VerifiedTokenClaims;
  error?: string;
  reason?: 'malformed' | 'expired' | 'invalid_signature' | 'invalid_claims' | 'revoked' | 'unknown';
}

/**
 * Refresh Token Verification Result
 */
export interface RefreshTokenVerificationResult {
  valid: boolean;
  claims?: VerifiedRefreshTokenClaims;
  error?: string;
  reason?: 'malformed' | 'expired' | 'invalid_signature' | 'invalid_claims' | 'revoked' | 'unknown';
}

/**
 * Token Revocation Entry (stored server-side)
 * Used to blacklist tokens that have been revoked
 */
export interface RevokedToken {
  jti: string; // JWT ID
  userId: string; // User ID
  type: 'access' | 'refresh'; // Token type
  revokedAt: number; // Timestamp when revoked
  reason: 'logout' | 'password_change' | 'role_change' | 'security_incident' | 'manual';
  expiresAt: number; // When entry can be cleaned up (token exp time)
}

/**
 * BEFORE vs AFTER Payload Comparison
 * 
 * ❌ BEFORE (INSECURE - DO NOT USE)
 * {
 *   "sub": "user123",
 *   "email": "user@example.com",              // ❌ PII
 *   "role": "SUPER_ADMIN",
 *   "sid": "session-abc123",                 // ❌ Session metadata
 *   "ip": "192.168.1.1",                     // ❌ Device-specific
 *   "user_agent": "Mozilla/5.0...",          // ❌ Device fingerprint
 *   "firstName": "John",                     // ❌ PII
 *   "lastName": "Doe",                       // ❌ PII
 *   "branchId": "branch-456"                 // ❌ Sensitive metadata
 * }
 * 
 * ✅ AFTER (SECURE - MINIMAL PAYLOAD)
 * {
 *   "sub": "user123",                        // ✅ User ID only
 *   "role": "ADMIN",                         // ✅ Required for authz only
 *   "iat": 1713288000,                       // ✅ Standard claim
 *   "exp": 1713288900,                       // ✅ Expires in 15 minutes
 *   "iss": "nib-bank-kyc",                   // ✅ Standard claim
 *   "aud": "api",                            // ✅ Standard claim
 *   "jti": "token-id-uuid"                   // ✅ For revocation
 * }
 * 
 * KEY IMPROVEMENTS:
 * - No email or personal info
 * - No IP or user agent (cannot fingerprint)
 * - No session IDs (cannot be used to guess sessions)
 * - No branch or department info (cannot infer organization structure)
 * - Token is opaque from client perspective
 * - Can be safely logged (no PII exposure)
 */

/**
 * Token Validation Rules
 * 
 * When verifying a token:
 * 1. ✅ Check signature (ensures token wasn't tampered)
 * 2. ✅ Check expiration (exp claim)
 * 3. ✅ Check issuer (iss must match issuance issuer)
 * 4. ✅ Check audience (aud must match expected audience)
 * 5. ✅ Check not before (nbf if included)
 * 6. ✅ Check revocation list (jti must not be blacklisted)
 * 7. ✅ Check claims (sub must be non-empty string)
 */

export const DEFAULT_TOKEN_CONFIG: TokenConfig = {
  accessTokenExpiresIn: 15 * 60 * 1000, // 15 minutes
  refreshTokenExpiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
  algorithm: 'HS256',
  issuer: 'nib-bank-kyc',
  audience: 'api',
};

/**
 * Secure Cookie Configuration for Production
 */
export const SECURE_COOKIE_CONFIG: SecureTokenCookie = {
  httpOnly: true, // Block JavaScript access (prevents XSS theft)
  secure: true, // HTTPS only
  sameSite: 'strict', // Prevents CSRF attacks
  path: '/',
};

/**
 * Development Cookie Configuration (HTTP allowed)
 * Only for localhost/development - NEVER use in production
 */
export const DEV_COOKIE_CONFIG: SecureTokenCookie = {
  httpOnly: true,
  secure: false, // Allow HTTP in development only
  sameSite: 'lax',
  path: '/',
};
