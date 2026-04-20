// @ts-nocheck
/**
 * JWT Encryption with JWE (JSON Web Encryption)
 * 
 * WHEN TO USE JWE:
 * ✅ YES: If you MUST include sensitive claims in token
 * ❌ NO: For minimal payload (preferred approach)
 * 
 * COMPLEXITY vs SECURITY:
 * - Minimal payload (preferred): Simple, fast, secure by design
 * - JWE encryption: More complex, slower, encrypts before signing
 * 
 * THIS FILE: Optional reference implementation
 * PRODUCTION: Use minimal payload instead of JWE
 * 
 * ALGORITHM:
 * - Encryption: A128GCM (AES-128-GCM)
 * - Key Management: dir (direct symmetric key)
 * - Content Type: JWT (JWS inside JWE)
 */

import * as jose from 'jose';
import { getSecret } from './secrets-loader';
import { safeLog } from './logging-redaction';

/**
 * ⚠️ WARNING: This is an ANTI-PATTERN
 * 
 * DO NOT use this unless you have a specific requirement to include
 * sensitive information in tokens.
 * 
 * PREFERRED: Use minimal payload (sub + role) from jwt-secure.ts
 */

/**
 * Example: Create Encrypted JWT with Sensitive Claims
 * 
 * ONLY for demonstration - don't use in production
 * 
 * SCENARIO: If you needed to include email in token (SECURITY RISK)
 * 
 * JWE Flow:
 * 1. Create payload with claims
 * 2. Sign payload (JWS)
 * 3. Encrypt signed token (JWE wraps JWS)
 * 4. Result: Encrypted + Signed token
 * 
 * Verification Flow (REVERSE):
 * 1. Decrypt JWE outer layer
 * 2. Extract inner JWS
 * 3. Verify signature
 * 4. Extract claims
 * 
 * @deprecated Use minimal payload instead
 */
export async function createEncryptedTokenWithSensitiveClaims_DO_NOT_USE(
  userId: string,
  userRole: string,
  userEmail: string // ❌ SENSITIVE - Should never be in token
): Promise<string> {
  try {
    console.warn('⚠️  Creating JWE token with sensitive claims - ANTI-PATTERN');

    const secret = await getSecret('JWT_SECRET');
    const encryptionKey = new TextEncoder().encode(secret.substring(0, 32)); // 256 bits

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 900; // 15 minutes

    // ❌ NEVER include these in production:
    const payload = {
      sub: userId,
      role: userRole,
      email: userEmail, // ❌ SENSITIVE
      iat: now,
      exp: now + expiresIn,
      iss: 'nib-bank-kyc',
      aud: 'api',
    };

    // Step 1: Create JWS (sign)
    const jws = await jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(new TextEncoder().encode(secret));

    // Step 2: Encrypt JWS with JWE
    const jwe = await jose.CompactEncrypt(new TextEncoder().encode(jws))
      .setProtectedHeader({ alg: 'dir', enc: 'A128GCM' })
      .encrypt(encryptionKey);

    return jwe;
  } catch (error) {
    safeLog.error('Failed to create encrypted token', { error: String(error) });
    throw error;
  }
}

/**
 * Verify Encrypted JWT
 * 
 * @deprecated Use verifyAccessToken from jwt-secure.ts instead
 */
export async function verifyEncryptedToken_DO_NOT_USE(token: string): Promise<any> {
  try {
    console.warn('⚠️  Verifying JWE token - ANTI-PATTERN');

    const secret = await getSecret('JWT_SECRET');
    const decryptionKey = new TextEncoder().encode(secret.substring(0, 32));

    // Step 1: Decrypt JWE
    const decrypted = await jose.compactDecrypt(token, decryptionKey);
    const jws = new TextDecoder().decode(decrypted.plaintext);

    // Step 2: Verify JWS
    const verified = await jose.jwtVerify(jws, new TextEncoder().encode(secret), {
      issuer: 'nib-bank-kyc',
      audience: 'api',
    });

    return verified.payload;
  } catch (error) {
    safeLog.error('JWE verification failed', { error: String(error) });
    return null;
  }
}

/**
 * WHY MINIMAL PAYLOAD IS BETTER
 * 
 * ✅ MINIMAL PAYLOAD (RECOMMENDED):
 * {
 *   "sub": "user123",
 *   "role": "ADMIN"
 * }
 * - Fast: No encryption/decryption overhead
 * - Secure: No sensitive data to leak
 * - Simple: Standard JWT validation
 * - Size: Smaller token = faster transmission
 * 
 * vs
 * 
 * ❌ JWE WITH SENSITIVE DATA (NOT RECOMMENDED):
 * JWE{
 *   "sub": "user123",
 *   "role": "ADMIN",
 *   "email": "user@example.com",
 *   "phone": "+1-555-0123",
 *   "ssn": "xxx-xx-1234"
 * }
 * JWE}
 * - Slow: Encryption adds latency
 * - Still risky: If decryption key compromised, all data exposed
 * - Complex: Difficult to debug encrypted tokens
 * - Large: Encrypted tokens are much larger
 * - Overkill: Encrypting doesn't solve XSS or CSRF
 * 
 * REAL SOLUTION:
 * 1. Use minimal payload (sub + role only)
 * 2. Fetch sensitive data from database on demand
 * 3. Cache user data in memory if needed
 * 4. Tokens stay small and secure
 */

/**
 * COMPARISON: Token Size
 * 
 * MINIMAL:
 * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
 * eyJzdWIiOiJ1c2VyMTIzIiwicm9sZSI6IkFETUlOIn0.
 * signature
 * = ~150 bytes
 * 
 * vs
 * 
 * JWE WITH CLAIMS:
 * eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4R0NNIn0.
 * <encrypted-jws>
 * <iv>
 * <ciphertext>
 * = ~500 bytes
 * 
 * NETWORK IMPACT:
 * - Minimal: 150 bytes × 1000 requests = 150 KB
 * - JWE: 500 bytes × 1000 requests = 500 KB
 * - Extra bandwidth: 350 KB per 1000 requests
 */

/**
 * IF you really need sensitive data, use database lookup instead:
 */
export async function getFullUserProfileOnDemand(userId: string): Promise<any> {
  // This is the RIGHT pattern:
  // 1. Token contains: { sub, role }
  // 2. Use sub to fetch full profile from database
  // 3. Cache in memory for 5-10 minutes
  // 4. No sensitive data in token

  // Example:
  // const profile = await db.user.findUnique({ where: { id: userId } });
  // return profile; // Contains email, phone, etc.
}

/**
 * SUMMARY: JWE Decision Tree
 * 
 * Do you need sensitive data in the token?
 *
 * ├─ NO (99% of cases)
 * │  └─ Use minimal payload + database lookup
 * │     - Secure, fast, simple
 * │     - This is what you should do
 * │
 * └─ YES (1% of cases - think twice!)
 *    ├─ Is encryption enabled with HSM?
 *    │  └─ Maybe consider JWE
 *    │
 *    └─ No HSM or unsure?
 *       └─ Reconsider if you really need it
 *          Tokens are public to client anyway
 *          Better to fetch data on-demand
 */
