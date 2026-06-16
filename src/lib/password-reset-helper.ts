// Password reset token generation, validation, and hashing utilities.
// SECURITY REQUIREMENTS:
// - Do not store passwords (temporary or permanent) in client-side storage
// - Use secure, server-side mechanisms for password handling
// - Implement protections against XSS attacks
//
// All tokens are hashed before storage; plaintext tokens are never persisted.
// Tokens are generated server-side only and sent via secure channels.
// Password validation and hashing occurs server-side using bcrypt.

import { randomBytes, createHash, pbkdf2Sync } from 'crypto';
import { prisma } from './prisma';

// Token configuration
export const PASSWORD_RESET_CONFIG = {
  TOKEN_LENGTH_BYTES: 48, // 384 bits of entropy
  TTL_MINUTES: 15,
  MAX_ATTEMPTS: 3,
  ATTEMPT_WINDOW_MINUTES: 30,
};

/**
 * Generate a cryptographically secure random token.
 * Returns plaintext token (to be sent to user via email).
 * Caller must hash before storage.
 */
export function generatePasswordResetToken(): string {
  return randomBytes(PASSWORD_RESET_CONFIG.TOKEN_LENGTH_BYTES).toString('hex');
}

/**
 * Hash token using SHA-256 for storage in database.
 * Always hash incoming tokens before comparing with stored hashes.
 */
export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new password reset token for a user.
 * Stores hashed token; returns plaintext token for email link.
 */
export async function createPasswordResetToken(
  userId: string,
  authorizerId?: string
): Promise<string> {
  // Generate plaintext token for email
  const token = generatePasswordResetToken();

  // Hash for storage
  const tokenHash = hashPasswordResetToken(token);

  // Calculate expiration (now + TTL)
  const expiresAt = new Date(
    Date.now() + PASSWORD_RESET_CONFIG.TTL_MINUTES * 60 * 1000
  );

  // Store hashed token
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      authorizerId: authorizerId || null,
    },
  });

  // Return plaintext token (only sent via email, never stored)
  return token;
}

/**
 * Validate and consume a password reset token.
 * Returns userId if valid and not expired/used; null otherwise.
 * Does not reveal reason for failure (security).
 */
export async function validateAndConsumePasswordResetToken(
  token: string
): Promise<string | null> {
  try {
    // Hash incoming token
    const tokenHash = hashPasswordResetToken(token);

    // Fetch token record
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true, used: true, expiresAt: true },
    });

    // Token not found
    if (!record) {
      return null;
    }

    // Token already used
    if (record.used) {
      return null;
    }

    // Token expired
    if (record.expiresAt < new Date()) {
      return null;
    }

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { used: true, usedAt: new Date() },
    });

    return record.userId;
  } catch (err) {
    // Swallow errors; return null for invalid/expired tokens
    return null;
  }
}

/**
 * Verify a password reset / setup token WITHOUT consuming it.
 * Returns true only if the token exists, is unused, and is not expired.
 * Used to gate the password-setup page on load so already-used or expired
 * links never render the form. Does not reveal the reason for failure.
 */
export async function verifyPasswordResetToken(token: string): Promise<boolean> {
  try {
    if (!token || typeof token !== 'string') return false;

    const tokenHash = hashPasswordResetToken(token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { used: true, expiresAt: true },
    });

    if (!record) return false;
    if (record.used) return false;
    if (record.expiresAt < new Date()) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Create a long-lived token for new-account password setup (24 hours).
 * Stored in the same PasswordResetToken table; validated by the same
 * validateAndConsumePasswordResetToken() function.
 * Returns the plaintext token for inclusion in the emailed setup link.
 */
export async function createAccountSetupToken(
  userId: string,
  authorizerId?: string
): Promise<string> {
  const token = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      authorizerId: authorizerId || null,
    },
  });

  return token;
}

/**
 * Clean up expired password reset tokens.
 * Run periodically via cron or scheduled task.
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}
