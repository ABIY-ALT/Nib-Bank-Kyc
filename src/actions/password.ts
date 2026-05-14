'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getServerSession } from './auth-server';
import { createAuditLog } from './audit';
import { isBreachedPassword } from '@/lib/breached-password';
import { sessionAuthCookieDefaults } from '@/lib/server-session-auth';

/**
 * Institutional Security: Resets user password.
 * REQUIRES current password verification for security.
 * Triggers session versioning rotation via updatedAt update.
 */
export async function updateInstitutionalPassword(userId: string, newPassword: string, currentPassword: string) {
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

    // For non-admin users, verify current password
    if (session.role !== 'SUPER_ADMIN') {
      if (!currentPassword) {
        return { success: false, error: 'Current password is required.' };
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true }
      });

      if (!user) {
        return { success: false, error: 'User not found.' };
      }

      const passwordValid = await bcrypt.compare(currentPassword, user.password);
      if (!passwordValid) {
        await createAuditLog({
          userId: session.id,
          userEmail: session.email,
          action: 'SECURITY_ALERT_INVALID_PASSWORD',
          details: `Invalid current password provided during change attempt`,
          severity: 'HIGH'
        });
        return { success: false, error: 'Current password is incorrect.' };
      }
    }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Institutional policy: Minimum 8 characters.' };
    }

    // FINAL SECURITY GATE: Breached Password Check
    const breached = await isBreachedPassword(newPassword);
    if (breached) {
      return { success: false, error: 'SECURITY ALERT: This password was found in a public data breach. Please choose a unique credential.' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        needsPasswordChange: false,
        updatedAt: new Date()
      }
    });

    if (session.id === userId) {
      const secret = process.env.JWT_SECRET || "";
      const versionSeconds = Math.floor(updatedUser.updatedAt.getTime() / 1000);
      const sid = (session as { sid?: string }).sid;
      const abs = (session as { abs?: number }).abs;

      const newToken = jwt.sign(
        {
          id: session.id,
          sub: session.id,
          sid,
          abs,
          v: versionSeconds,
          needsPasswordChange: false,
        },
        secret,
        { algorithm: 'HS512', expiresIn: "10m" }
      );

      const cookieStore = await cookies();
      cookieStore.set('nib-auth-token', newToken, {
        ...sessionAuthCookieDefaults(),
        maxAge: 60 * 10,
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
    return { success: false, error: 'Institutional database fault.' };
  }
}