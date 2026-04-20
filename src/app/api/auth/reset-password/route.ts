import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/token';
import { 
  successResponse, 
  badRequestResponse, 
  internalErrorResponse 
} from '@/lib/api-security';
import bcrypt from 'bcrypt';

// Password validation criteria (matching existing policy in the codebase)
const MIN_PASSWORD_LENGTH = 12;

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return badRequestResponse('Token and new password are required');
    }

    // Basic password strength check
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return badRequestResponse(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const tokenHash = hashToken(token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      return badRequestResponse('Invalid or expired token');
    }

    if (record.expiresAt < new Date()) {
      return badRequestResponse('Token has expired');
    }

    // Hash with 12 rounds as requested
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password and clear any reset requirement flags
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { 
          password: hashedPassword,
          needsPasswordChange: false,
          updatedAt: new Date()
        },
      }),
      // Delete the token so it's one-time use
      prisma.passwordResetToken.delete({
        where: { tokenHash },
      }),
    ]);

    return successResponse({ 
      success: true, 
      message: 'Password has been reset successfully. You can now log in.' 
    });
  } catch (error) {
    return internalErrorResponse();
  }
}
