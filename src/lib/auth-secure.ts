/**
 * JWT Authentication with Secure Secret Management
 * 
 * SECURITY:
 * - Never stores JWT secret in memory (always fetches from secure source)
 * - Signs tokens with server-side secret only
 * - Validates token expiration and format
 * - Supports token rotation
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import { getSecret } from './secrets-loader';
import { safeLog } from './logging-redaction';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

/**
 * Sign a new JWT token
 * Token includes standard claims for validation
 */
export async function signToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  options: {
    expiresIn?: SignOptions['expiresIn'];
    issuer?: string;
    audience?: string;
  } = {}
): Promise<string> {
  try {
    const jwtSecret = await getSecret('JWT_SECRET');
    const signOptions: SignOptions = {
      expiresIn: options.expiresIn ?? '24h',
      issuer: options.issuer ?? 'nib-bank-kyc',
      algorithm: 'HS256',
    };

    if (options.audience) {
      signOptions.audience = options.audience;
    }

    const token = jwt.sign(payload, jwtSecret, signOptions);

    return token;
  } catch (error) {
    safeLog.error('Failed to sign JWT token', { error: String(error) });
    throw error;
  }
}

/**
 * Verify a JWT token
 * Returns decoded payload if valid, throws if invalid
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  try {
    const jwtSecret = await getSecret('JWT_SECRET');

    const decoded = jwt.verify(token, jwtSecret, {
      issuer: 'nib-bank-kyc',
      algorithms: ['HS256'],
    });

    return decoded as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      safeLog.warn('Token expired');
      throw new Error('Token has expired');
    }

    if (error instanceof jwt.JsonWebTokenError) {
      safeLog.warn('Invalid JWT token', { error: error.message });
      throw new Error('Invalid token');
    }

    safeLog.error('Token verification error', { error: String(error) });
    throw error;
  }
}

/**
 * Decode token without verification (for debugging only)
 * SECURITY: Only use this when you don't need to verify the token
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload | null;
  } catch (error) {
    safeLog.error('Failed to decode token', { error: String(error) });
    return null;
  }
}

/**
 * Extract JWT token from Authorization header
 */
export function extractTokenFromHeader(
  authHeader?: string
): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware to verify JWT in Express
 * 
 * USAGE:
 * ```typescript
 * app.get('/api/profile', verifyTokenMiddleware, (req, res) => {
 *   // req.user contains decoded token
 * });
 * ```
 */
export async function verifyTokenMiddleware(
  req: any,
  res: any,
  next: any
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    const decoded = await verifyToken(token);
    req.user = decoded;

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Create session tokens (access + refresh)
 */
export async function createSessionTokens(
  payload: Omit<TokenPayload, 'iat' | 'exp'>
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}> {
  const accessToken = await signToken(payload, { expiresIn: '1h' });
  const refreshToken = await signToken(payload, { expiresIn: '7d' });

  return {
    accessToken,
    refreshToken,
    expiresIn: '1h',
  };
}

/**
 * Validate token claims
 */
export function validateTokenClaims(token: TokenPayload): boolean {
  if (!token.userId || !token.email || !token.role) {
    return false;
  }

  // Add custom validation rules
  const validRoles = ['admin', 'user', 'staff'];
  if (!validRoles.includes(token.role)) {
    return false;
  }

  return true;
}
