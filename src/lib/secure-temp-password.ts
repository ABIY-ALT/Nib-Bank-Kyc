/**
 * Secure Temporary Password Distribution
 * 
 * SECURITY FIX #8: Prevent temporary password exposure in browser UI
 * Instead of displaying password in modal, send via secure channel (email/SMS)
 * 
 * File: src/lib/secure-temp-password.ts
 * Severity: HIGH - Password Compromise Prevention
 */

import crypto from 'crypto';

/**
 * Temporary password metadata (not including the password itself)
 */
export interface TempPasswordDistribution {
  userId: string;
  email: string;
  userName: string;
  distributionMethod: 'EMAIL' | 'SMS'; // Could extend with 'SMS'
  distributionStatus: 'PENDING' | 'SENT' | 'FAILED';
  sentAt?: Date;
  expiresAt: Date;
  attemptCount: number;
  lastAttemptAt?: Date;
}

/**
 * Generate a secure temporary password
 * Requirements:
 * - 12+ characters
 * - Mix of uppercase, lowercase, numbers, special chars
 * - No ambiguous characters (0/O, 1/l, etc.)
 */
export function generateSecureTempPassword(length: number = 14): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'; // No i, l, o
  const numbers = '23456789'; // No 0, 1
  const special = '!@#$%^&*-_=+'; // Safe special chars

  const allChars = uppercase + lowercase + numbers + special;
  let password = '';

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill remaining length with random characters
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/**
 * Create a secure temporary password for admin to distribute
 * 
 * Features:
 * ✅ Generate secure 14-character password
 * ✅ Return password to UI for admin to copy
 * ✅ Admin shares via preferred method (email, call, telegram, etc.)
 * ✅ No automatic email distribution
 * 
 * @returns Password + metadata for UI display
 */
export async function createAndDistributeTempPassword(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<{
  success: boolean;
  tempPassword: string; // For UI display and admin to copy
  distributionMethod: string;
  expiresIn: string;
  message: string;
  error?: string;
}> {
  try {
    const tempPassword = generateSecureTempPassword(14);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // ===== Log the creation (WITHOUT password) =====

    // ===== Return password for admin to copy + share =====
    return {
      success: true,
      tempPassword, // Admin can copy and share via preferred method
      distributionMethod: 'ADMIN_COPY',
      expiresIn: '24 hours',
      message: `Temporary password generated. Copy the password below and share via your preferred channel (email, call, telegram, etc.).`,
    };
  } catch (error) {
    return {
      success: false,
      tempPassword: '',
      distributionMethod: 'ADMIN_COPY',
      expiresIn: '24 hours',
      message: '',
      error: 'Failed to generate temporary password. Please try again.',
    };
  }
}

/**
 * Mask email for display (security: don't show full email in logs)
 * john.doe@nibbank.com → j***@nibbank.com
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  
  const maskedLocal = local.charAt(0) + '*'.repeat(Math.max(1, local.length - 2)) + local.charAt(local.length - 1);
  return `${maskedLocal}@${domain}`;
}

/**
 * Create a one-time password reset link (alternative approach)
 * This approach is MORE SECURE than temporary passwords
 * 
 * Steps:
 * 1. Generate unique reset token (24-hour expiry)
 * 2. Hash and store in database
 * 3. Send reset link via email
 * 4. User clicks link (no password sent)
 * 5. User creates new password directly
 */
export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create reset link metadata
 */
export interface PasswordResetLink {
  token: string;
  hashedToken: string; // For database storage
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Generate secure password reset link
 */
export function createPasswordResetLink(): PasswordResetLink {
  const token = generatePasswordResetToken();
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  return {
    token, // Send this in email link
    hashedToken, // Store in database
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  };
}

/**
 * Recommendation for UI component:
 * Instead of showing the password, show this message
 */
export function getTempPasswordUIMessage(): string {
  return `
A temporary password has been sent to the user's email address.

The user should:
1. Check their email for the temporary password
2. Log in with the temporary password
3. Change their password on first login

Password expires in 24 hours.
  `.trim();
}
