
'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

/**
 * Institutional Security: Resets user password and clears the force-change flag.
 */
export async function updateInstitutionalPassword(userId: string, newPassword: string) {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        needsPasswordChange: false
      }
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('[Security Vault] Password Update Failure:', error);
    return { success: false, error: 'Database fault during credential reset.' };
  }
}
