'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getServerSession } from './auth-server';
import { createAuditLog } from './audit';

/**
 * Institutional Security: Resets user password.
 * Strictly gated by session identity and version rotation.
 */
export async function updateInstitutionalPassword(userId: string, newPassword: string) {
  try {
    // 1. Mandatory Session Verification
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: 'Unauthenticated session. Access denied.' };
    }

    // 2. Identity Binding (Anti-IDOR)
    if (session.id !== userId) {
      await createAuditLog({
        userId: session.id,
        userEmail: session.email,
        action: 'SECURITY_ALERT_IDOR',
        details: `Unauthorized attempt to modify credentials for User ID: ${userId}`,
        severity: 'CRITICAL'
      });
      return { success: false, error: 'Jurisdictional violation: identity mismatch.' };
    }

    // 3. Complexity Validation (Server-Side)
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Institutional policy requires a minimum of 8 characters.' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Atomic Update with Version Rotation
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        needsPasswordChange: false,
        updatedAt: new Date() // Force rotation of token version (v)
      }
    });

    // 5. SESSION CONTINUITY: Re-issue token so current user isn't logged out
    const secret = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    const newToken = jwt.sign(
      { 
        ...session,
        v: updatedUser.updatedAt.getTime(),
        needsPasswordChange: false
      },
      secret,
      { expiresIn: "15m" }
    );

    const cookieStore = await cookies();
    cookieStore.set('nib-auth-token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 15,
      path: '/',
    });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'PASSWORD_CHANGE_SUCCESS',
      details: 'Personnel credential established. Active sessions rotated.',
      severity: 'MEDIUM'
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('[Security Vault] Password Update Failure:', error);
    return { success: false, error: 'Database fault during credential reset.' };
  }
}