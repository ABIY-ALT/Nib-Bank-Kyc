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
 * Triggers session versioning rotation via updatedAt update.
 */
export async function updateInstitutionalPassword(userId: string, newPassword: string) {
  try {
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: 'Unauthenticated session.' };
    }

    if (session.role !== 'SUPER_ADMIN' && session.id !== userId) {
      await createAuditLog({
        userId: session.id,
        userEmail: session.email,
        action: 'SECURITY_ALERT_IDOR',
        details: `Unauthorized credential modification attempt for ID: ${userId}`,
        severity: 'CRITICAL'
      });
      return { success: false, error: 'Authorization violation.' };
    }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Institutional policy: Minimum 8 characters.' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atomic Update: Changing password updates 'updatedAt', which rotates the token version 'v'
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        needsPasswordChange: false,
        updatedAt: new Date()
      }
    });

    // Re-issue token for current user session continuity
    if (session.id === userId) {
      const secret = process.env.JWT_SECRET || "";
      const versionSeconds = Math.floor(updatedUser.updatedAt.getTime() / 1000);
      const { iat, exp, ...sessionData } = session as any;

      const newToken = jwt.sign(
        { 
          ...sessionData,
          v: versionSeconds,
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
    }

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'PASSWORD_CHANGE_SUCCESS',
      details: `Credential reset for ${updatedUser.email}. Sessions rotated.`,
      severity: 'MEDIUM'
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error: any) {
    console.error('[Security Vault] Password Update Failure:', error);
    return { success: false, error: 'Institutional database fault.' };
  }
}
