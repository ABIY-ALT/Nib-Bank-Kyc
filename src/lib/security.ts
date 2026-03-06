import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'institutional_security_hmac_fallback_32_chars';

/**
 * Generates an HMAC-signed token for an ID to prevent IDOR manipulation.
 * Formats: UUID.HMAC_HEX
 */
export function signId(id: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(id).digest('hex');
  return `${id}.${hmac}`;
}

/**
 * Verifies the integrity of a signed token and returns the original ID.
 * Returns null if the signature is invalid or tampered with.
 */
export function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [id, hmac] = parts;
    const expectedHmac = crypto.createHmac('sha256', SECRET).update(id).digest('hex');
    
    const hmacBuffer = Buffer.from(hmac);
    const expectedBuffer = Buffer.from(expectedHmac);

    if (hmacBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(hmacBuffer, expectedBuffer)) {
      return id;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Generates a cryptographically secure random password.
 * Charset: [A-Z a-z 0-9 !@#$%]
 */
export function generateSecurePassword(length = 12): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Generates a cryptographically secure numeric code within a range.
 */
export function generateSecureNumericCode(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const randomBytes = crypto.randomBytes(bytesNeeded);
  let value = 0;
  for (let i = 0; i < bytesNeeded; i++) {
    value = (value << 8) + randomBytes[i];
  }
  return min + (value % range);
}

/**
 * Generates a high-entropy 32-byte security token.
 */
export function generateSecureToken(bytesCount = 32): string {
  return crypto.randomBytes(bytesCount).toString('hex');
}
