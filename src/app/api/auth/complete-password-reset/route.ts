// POST /api/auth/complete-password-reset
// Validates reset token and updates user password.
// SECURITY REQUIREMENTS:
// - Do not store passwords (temporary or permanent) in client-side storage
// - Use secure, server-side mechanisms for password handling
// - Implement protections against XSS attacks
//
// Enforces strong password policy and bcrypt hashing.
// Invalidates token after successful use (single-use).
// Token received from URL query parameter only; never stored client-side.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAndConsumePasswordResetToken } from '@/lib/password-reset-helper';
import { logInstitutionalError } from '@/lib/logger';
import { createAuditLog } from '@/actions/audit';
import bcrypt from 'bcryptjs';

// Minimum password requirements
const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 12,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL: true,
};

function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < PASSWORD_REQUIREMENTS.MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_REQUIREMENTS.MIN_LENGTH} characters.` };
  }

  if (PASSWORD_REQUIREMENTS.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain uppercase letters.' };
  }

  if (PASSWORD_REQUIREMENTS.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain lowercase letters.' };
  }

  if (PASSWORD_REQUIREMENTS.REQUIRE_NUMBERS && !/\d/.test(password)) {
    return { valid: false, error: 'Password must contain numbers.' };
  }

  if (PASSWORD_REQUIREMENTS.REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, error: 'Password must contain special characters.' };
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing reset token.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing password.' },
        { status: 400 }
      );
    }

    // Validate password requirements
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: passwordValidation.error },
        { status: 400 }
      );
    }

    // Validate and consume token (marks as used, returns userId if valid)
    const userId = await validateAndConsumePasswordResetToken(token);

    if (!userId) {
      // Generic error to prevent token enumeration
      await createAuditLog({
        userId: null,
        userEmail: 'unknown',
        action: 'PASSWORD_RESET_INVALID_TOKEN',
        details: `Invalid or expired password reset token used`,
        metadata: {},
      }).catch(() => {});

      return NextResponse.json(
        { success: false, error: 'The reset link has expired or is invalid.' },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password and clear needsPasswordChange flag
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        needsPasswordChange: false,
        updatedAt: new Date(),
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    // Audit log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'PASSWORD_RESET_COMPLETED',
      details: `Password successfully reset`,
      metadata: { resource: 'USER', resourceId: user.id },
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        message: 'Password updated successfully. You can now log in.',
      },
      { status: 200 }
    );
  } catch (error) {
    logInstitutionalError(error, 'API_PASSWORD_RESET_COMPLETE_ERROR');
    return NextResponse.json(
      { success: false, error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
