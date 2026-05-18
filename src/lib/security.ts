/**
 * Institutional Security Utilities
 * 
 * Centralized helpers for cryptographically secure operations.
 * Enforces use of Node.js `crypto` module for high-entropy randomness.
 */

import crypto from 'crypto';

const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

function decodeStrictBase64UrlSegment(segment: string): Buffer | null {
  if (!segment || segment.includes('=') || !BASE64URL_SEGMENT_PATTERN.test(segment) || segment.length % 4 === 1) {
    return null;
  }
  try {
    const decoded = Buffer.from(segment, 'base64url');
    if (decoded.length === 0) return null;
    if (decoded.toString('base64url') !== segment) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generates a cryptographically secure, URL-safe random token.
 * Default entropy: 256 bits (32 bytes)
 * 
 * @param length Number of random bytes to generate (not final string length)
 * @returns Hexadecimal string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generates a secure random string of a specific length using a provided alphabet.
 * 
 * @param length Total length of the resulting string
 * @param alphabet Characters to use (default is alphanumeric + safe special)
 */
export function generateSecureString(
  length: number, 
  alphabet: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = '';
  const alphabetLength = alphabet.length;
  
  // Use randomBytes to get high-entropy indices
  const randomValues = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    // Mapping random byte to alphabet index via modulo
    // Note: This has a slight bias if alphabetLength isn't a power of 2, 
    // but for most banking use cases it is far superior to Math.random().
    result += alphabet.charAt(randomValues[i] % alphabetLength);
  }
  
  return result;
}

/**
 * Generates a temporary password that satisfies the app's password rules.
 * Ensures at least one uppercase, lowercase, number, and supported special character.
 */
export function generateSecurePassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%^&*';
  const resolvedLength = Math.max(length, 8);

  const requiredCharacters = [
    generateSecureString(1, uppercase),
    generateSecureString(1, lowercase),
    generateSecureString(1, numbers),
    generateSecureString(1, special),
  ];

  const remainingCharacters = generateSecureString(
    resolvedLength - requiredCharacters.length,
    `${uppercase}${lowercase}${numbers}${special}`
  ).split('');

  return secureShuffle([...requiredCharacters, ...remainingCharacters]).join('');
}

/**
 * Generates a cryptographically secure integer in the inclusive range [min, max].
 */
export function generateSecureNumericCode(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error('Invalid numeric code range');
  }

  return crypto.randomInt(min, max + 1);
}

/**
 * Generates a version 4 UUID.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Securely shuffles an array using the Fisher-Yates algorithm
 * with cryptographically secure random indices.
 */
export function secureShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const randomByte = crypto.randomBytes(1)[0];
    const j = randomByte % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/**
 * Generates a signed, time-limited token for file downloads.
 * Prevents IDOR by cryptographically binding the memoId to a signature.
 * 
 * @param memoId The database ID of the memo
 * @param ttlSeconds Token validity period (default 1 hour)
 */
export function signDownloadToken(memoId: string, ttlSeconds: number = 3600): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot sign download tokens.');
  
  const payload = Buffer.from(JSON.stringify({ memoId, exp: expiresAt })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
    
  return `${payload}.${signature}`;
}

/**
 * Verifies a download token and returns the memoId if valid.
 */
export function verifyDownloadToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, signatureB64] = parts;

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot verify download tokens.');
    const payloadBytes = decodeStrictBase64UrlSegment(payloadB64);
    const signatureBytes = decodeStrictBase64UrlSegment(signatureB64);
    if (!payloadBytes || !signatureBytes) return null;

    const expectedSignatureB64 = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');

    const expectedSignatureBytes = decodeStrictBase64UrlSegment(expectedSignatureB64);
    if (!expectedSignatureBytes) return null;
    if (signatureBytes.length !== expectedSignatureBytes.length) return null;
    if (!crypto.timingSafeEqual(signatureBytes, expectedSignatureBytes)) return null;

    const payload = JSON.parse(payloadBytes.toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.memoId !== 'string' || payload.memoId.length === 0) return null;
    if (typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload.memoId;
  } catch {
    return null;
  }
}
