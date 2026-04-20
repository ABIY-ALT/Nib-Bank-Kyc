import { prisma } from '@/lib/prisma';
import { generateResetToken, hashToken } from '@/lib/token';
import { 
  successResponse, 
  badRequestResponse, 
  internalErrorResponse, 
  unauthorizedResponse,
  forbiddenResponse,
  verifyAuthentication 
} from '@/lib/api-security';

export async function POST(req: Request) {
  try {
    // 1. Verify Authentication
    const session = await verifyAuthentication(req);
    if (!session) {
      return unauthorizedResponse();
    }

    // 2. Verify Authorization (Require ADMIN role)
    // Note: session.roles might be an array of objects like { role: { name: 'ADMIN' } }
    // based on the query in verifyAuthentication. 
    // Let's check roles in payload.
    const userWithRoles = await prisma.user.findUnique({
      where: { id: session.id },
      include: { roles: { include: { role: true } } }
    });

    const isAdmin = userWithRoles?.roles.some(r => r.role.name === 'ADMIN');
    if (!isAdmin) {
      return forbiddenResponse('Admin access required');
    }

    const { userId } = await req.json();

    if (!userId) {
      return badRequestResponse('User ID is required');
    }

    // 3. Verify target user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return badRequestResponse('User not found');
    }

    const rawToken = generateResetToken();
    const tokenHash = hashToken(rawToken);

    // Set expiration to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Store hashed token
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        authorizerId: session.id, // Track who authorized this reset
      },
    });

    return successResponse({
      resetToken: rawToken,
      expiresIn: '15 minutes',
      message: 'Show this token to the user ONCE. Do not store it.',
    });
  } catch (error) {
    console.error('Error creating reset token:', error);
    return internalErrorResponse();
  }
}
