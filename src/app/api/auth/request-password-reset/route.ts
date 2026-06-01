// POST /api/auth/request-password-reset
// Initiates a password reset by creating a secure reset token.
// SECURITY REQUIREMENTS:
// - Do not store passwords (temporary or permanent) in client-side storage
// - Use secure, server-side mechanisms for password handling
// - Implement protections against XSS attacks
//
// Returns generic success message to avoid user enumeration.
// Email delivery is handled externally; this endpoint only generates token.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPasswordResetToken } from '@/lib/password-reset-helper';
import { logInstitutionalError } from '@/lib/logger';
import { createAuditLog } from '@/actions/audit';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid input.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always return generic success to prevent user enumeration
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (user) {
      try {
        const token = await createPasswordResetToken(user.id);
        const appBaseUrl = process.env.APP_BASE_URL?.trim();
        if (!appBaseUrl) {
          throw new Error('APP_BASE_URL is required in environment configuration.');
        }

        const resetLink = `${appBaseUrl}/auth/complete-password-reset?token=${encodeURIComponent(token)}`;
        void sendPasswordResetEmail(user.email, resetLink, `${user.firstName} ${user.lastName}`);

        await createAuditLog({
          userId: null,
          userEmail: normalizedEmail,
          action: 'PASSWORD_RESET_REQUESTED',
          details: `Password reset requested`,
          metadata: { resource: 'USER', resourceId: user.id },
        }).catch(() => {});
      } catch (err) {
        logInstitutionalError(err, 'PASSWORD_RESET_TOKEN_CREATION_FAILED');
      }
    } else {
      // Log invalid reset attempt
      await createAuditLog({
        userId: null,
        userEmail: normalizedEmail,
        action: 'PASSWORD_RESET_REQUESTED_INVALID_USER',
        details: `Password reset requested for non-existent account`,
        metadata: {},
      }).catch(() => {});
    }

    // Always return generic success
    return NextResponse.json(
      {
        success: true,
        message: 'If an account exists, a reset link has been sent to the email address.',
      },
      { status: 200 }
    );
  } catch (error) {
    logInstitutionalError(error, 'API_PASSWORD_RESET_REQUEST_ERROR');
    return NextResponse.json(
      { success: false, error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
