import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'institutional_security_hmac_fallback_32_chars';

/**
 * Generates an HMAC-signed token for an ID to prevent IDOR manipulation.
 */
export function signId(id: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(id).digest('hex');
  return `${id}.${hmac}`;
}

/**
 * Generates a time-limited download token.
 * Expire in 15 minutes.
 */
export function signDownloadToken(id: string): string {
  const expires = Date.now() + (15 * 60 * 1000); // 15 mins
  const payload = `${id}:${expires}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies the integrity and expiration of a signed download token.
 */
export function verifyDownloadToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    
    const [id, expires, hmac] = parts;
    const payload = `${id}:${expires}`;
    const expectedHmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    
    const hmacBuffer = Buffer.from(hmac);
    const expectedBuffer = Buffer.from(expectedHmac);

    if (hmacBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(hmacBuffer, expectedBuffer)) {
      return null;
    }

    if (Date.now() > parseInt(expires)) {
      return null;
    }
    
    return id;
  } catch (e) {
    return null;
  }
}

/**
 * Generates a cryptographically secure random password.
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
 * Generates a high-entropy security token.
 */
export function generateSecureToken(bytesCount = 32): string {
  return crypto.randomBytes(bytesCount).toString('hex');
}
