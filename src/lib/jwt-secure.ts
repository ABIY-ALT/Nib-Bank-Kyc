
import * as jose from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { getSecret } from './secrets-loader';
import { safeLog } from './logging-redaction';
import {
  AccessTokenPayload,
  JwtRole,
  RefreshTokenPayload,
  TokenPair,
  VerifiedTokenClaims,
  VerifiedRefreshTokenClaims,
  DEFAULT_TOKEN_CONFIG,
} from './jwt-types';

/**
 * Get JWT secret as TextEncoder-compatible buffer for jose
 * CRITICAL: Never expose this secret
 */
async function getJwtSecret(): Promise<Uint8Array> {
  const secret = await getSecret('JWT_SECRET');
  
  if (!secret || secret.length < 64) {
    throw new Error('JWT_SECRET must be at least 64 characters');
  }
  
  // Convert string to Uint8Array for jose
  return new TextEncoder().encode(secret);
}

/**
 * Generate Access Token (short-lived, 15 minutes)
 * 
 * SECURITY:
 * - Minimal payload: only sub (user ID) and role
 * - Includes unique jti for potential revocation
 * - Expires quickly (15 minutes)
 * - Signed with HS256
 * 
 * @param userId - User ID (required)
 * @param userRole - User role (required for authorization)
 * @returns Promise<string> - Signed JWT token
 */
export async function generateAccessToken(
  userId: string,
  userRole: JwtRole
): Promise<string> {
  try {
    if (!userId || !userRole) {
      throw new Error('userId and userRole are required');
    }

    const secret = await getJwtSecret();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = Math.floor(DEFAULT_TOKEN_CONFIG.accessTokenExpiresIn / 1000); // Convert to seconds

    const payload: AccessTokenPayload = {
      sub: userId, // Subject (user ID) - unique identifier
      role: userRole, // Role for authorization gates
    };

    const jwt = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setIssuer(DEFAULT_TOKEN_CONFIG.issuer)
      .setAudience(DEFAULT_TOKEN_CONFIG.audience)
      .setJti(uuidv4()) // Unique token ID for revocation
      .sign(secret);

    return jwt;
  } catch (error) {
    safeLog.error('Failed to generate access token', {
      error: String(error),
      userId: userId.substring(0, 8), // Partial ID only
    });
    throw new Error('Failed to generate access token');
  }
}

/**
 * Generate Refresh Token (long-lived, 7 days)
 * 
 * SECURITY:
 * - Minimal payload: only sub (user ID) and type
 * - Includes unique tokenId for refresh token rotation
 * - Long expiration (7 days)
 * - Must be rotated on every use
 * - Must be stored in HTTP-only cookies only
 * 
 * @param userId - User ID (required)
 * @param refreshTokenId - Unique ID for this refresh token (for rotation tracking)
 * @returns Promise<string> - Signed JWT token
 */
export async function generateRefreshToken(
  userId: string,
  refreshTokenId?: string
): Promise<string> {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    const secret = await getJwtSecret();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = Math.floor(DEFAULT_TOKEN_CONFIG.refreshTokenExpiresIn / 1000); // Convert to seconds

    const payload: RefreshTokenPayload = {
      sub: userId, // Subject (user ID) - unique identifier
      type: 'refresh', // Identifier: this is a refresh token
      tokenId: refreshTokenId || uuidv4(), // Unique ID for this refresh token
    };

    const jwt = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setIssuer(DEFAULT_TOKEN_CONFIG.issuer)
      .setAudience(DEFAULT_TOKEN_CONFIG.audience)
      .setJti(uuidv4()) // JTI for the token itself (for revocation)
      .sign(secret);

    return jwt;
  } catch (error) {
    safeLog.error('Failed to generate refresh token', {
      error: String(error),
      userId: userId.substring(0, 8),
    });
    throw new Error('Failed to generate refresh token');
  }
}

/**
 * Create Token Pair (access + refresh)
 * 
 * Called on:
 * 1. Initial login
 * 2. Successful refresh token exchange
 * 
 * Returns both tokens with metadata for cookie setting
 * 
 * @param userId - User ID
 * @param userRole - User role
 * @param refreshTokenId - Optional refresh token ID for rotation tracking
 * @returns Promise<TokenPair>
 */
export async function createTokenPair(
  userId: string,
  userRole: JwtRole,
  refreshTokenId?: string
): Promise<TokenPair> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken(userId, userRole),
      generateRefreshToken(userId, refreshTokenId),
    ]);

    const expiresIn = Math.floor(DEFAULT_TOKEN_CONFIG.accessTokenExpiresIn / 1000);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  } catch (error) {
    safeLog.error('Failed to create token pair', { error: String(error) });
    throw error;
  }
}

/**
 * Verify Access Token
 * 
 * VALIDATION STEPS:
 * 1. Check signature (HS256)
 * 2. Check expiration (exp claim)
 * 3. Check issuer (iss claim)
 * 4. Check audience (aud claim)
 * 5. Check required claims (sub, role)
 * 
 * @param token - JWT token string
 * @returns Promise<VerifiedTokenClaims | null>
 */
export async function verifyAccessToken(
  token: string
): Promise<VerifiedTokenClaims | null> {
  try {
    if (!token || typeof token !== 'string') {
      safeLog.warn('Invalid token format');
      return null;
    }

    const secret = await getJwtSecret();

    const verified = await jose.jwtVerify(token, secret, {
      issuer: DEFAULT_TOKEN_CONFIG.issuer,
      audience: DEFAULT_TOKEN_CONFIG.audience,
    });

    const claims = verified.payload as unknown as VerifiedTokenClaims;

    // Validate required claims
    if (!claims.sub || !claims.role) {
      safeLog.warn('Missing required claims in token');
      return null;
    }

    return claims;
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    
    // Log classification but don't expose token details
    if (errorMessage.includes('expired')) {
      safeLog.debug('Token verification failed: expired');
    } else if (errorMessage.includes('signature')) {
      safeLog.warn('Token verification failed: invalid signature');
    } else {
      safeLog.warn('Token verification failed', { reason: errorMessage.substring(0, 50) });
    }
    
    return null;
  }
}

/**
 * Verify Refresh Token
 * 
 * VALIDATION STEPS:
 * 1. Check signature (HS256)
 * 2. Check expiration (exp claim)
 * 3. Check issuer (iss claim)
 * 4. Check audience (aud claim)
 * 5. Check type claim === 'refresh'
 * 6. Check required claims (sub, type, tokenId)
 * 
 * @param token - Refresh JWT token string
 * @returns Promise<VerifiedRefreshTokenClaims | null>
 */
export async function verifyRefreshToken(
  token: string
): Promise<VerifiedRefreshTokenClaims | null> {
  try {
    if (!token || typeof token !== 'string') {
      safeLog.warn('Invalid refresh token format');
      return null;
    }

    const secret = await getJwtSecret();

    const verified = await jose.jwtVerify(token, secret, {
      issuer: DEFAULT_TOKEN_CONFIG.issuer,
      audience: DEFAULT_TOKEN_CONFIG.audience,
    });

    const claims = verified.payload as unknown as VerifiedRefreshTokenClaims;

    // Validate required claims
    if (!claims.sub || claims.type !== 'refresh' || !claims.tokenId) {
      safeLog.warn('Invalid refresh token: missing or wrong claims');
      return null;
    }

    return claims;
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    
    if (errorMessage.includes('expired')) {
      safeLog.debug('Refresh token expired');
    } else if (errorMessage.includes('signature')) {
      safeLog.warn('Refresh token signature invalid');
    } else {
      safeLog.warn('Refresh token verification failed', { reason: errorMessage.substring(0, 50) });
    }
    
    return null;
  }
}

/**
 * Decode Token (without verification)
 * 
 * ⚠️ USE ONLY FOR DEBUGGING/LOGGING
 * Never trust claims from unverified tokens
 * 
 * @param token - JWT token string
 * @returns Token payload (unverified)
 */
export function decodeTokenNonVerified(token: string): any {
  try {
    const decoded = jose.decodeProtectedHeader(token);
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Extract Bearer Token from Authorization Header
 * 
 * Expected format: "Bearer <token>"
 * 
 * @param authHeader - Authorization header value
 * @returns Token without "Bearer " prefix, or null
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Extract Token from Request
 * 
 * Priority:
 * 1. Cookie (accessToken)
 * 2. Authorization header (Bearer token)
 * 
 * @param request - NextJS Request object
 * @returns Token string or null
 */
export function extractTokenFromRequest(request: Request): string | null {
  // Try Authorization header first
  const authHeader = request.headers?.get('authorization');
  const fromHeader = extractBearerToken(authHeader);
  if (fromHeader) return fromHeader;

  // Try cookie
  const cookieHeader = request.headers?.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie) => {
    const [name, value] = cookie.trim().split('=');
    acc[name] = decodeURIComponent(value);
    return acc;
  }, {});

  return cookies.accessToken || null;
}
