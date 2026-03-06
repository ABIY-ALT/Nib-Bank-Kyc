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
