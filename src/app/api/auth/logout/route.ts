import { prisma } from "@/lib/prisma";
import { verifyAuthentication, successResponse, unauthorizedResponse } from "@/lib/api-security";
import { sessionAuthCookieDefaults } from "@/lib/server-session-auth";
import { revokeAllUserSessions } from "@/lib/concurrent-session-manager";

/**
 * Institutional Logout Gateway.
 * Implements server-side session revocation via token version rotation.
 * Requires authentication.
 * 
 * SECURITY FIX #7: Proper concurrent session termination
 */
export async function POST(request: Request) {
  try {
    const session = await verifyAuthentication(request);
    
    if (session) {
      // ===== SECURITY: Revoke all sessions for user =====
      await revokeAllUserSessions(session.id, 'USER_LOGOUT');

      // Clear session data and invalidate all tokens
      await prisma.user.update({
        where: { id: session.id },
        data: {
          sessionId: null,
          refreshToken: null,
          refreshTokenExpiry: null,
          updatedAt: new Date() // Rotate version 'v', orphaning all active tokens
        }
      });

      // Log logout event
      await prisma.auditLog.create({
        data: {
          userId: session.id,
          userEmail: session.email || '',
          action: 'LOGOUT',
          ipAddress: (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0],
          details: 'User logged out successfully'
        }
      }).catch(() => {});
    }
  } catch (error) {
  }

  const response = successResponse({ success: true });
  
  // Clear the secure cookies with Strict alignment
  const cleared = { ...sessionAuthCookieDefaults(), expires: new Date(0), maxAge: 0 };
  response.cookies.set('nib-auth-token', '', cleared);
  response.cookies.set('nib-refresh-token', '', cleared);

  return response;
}
