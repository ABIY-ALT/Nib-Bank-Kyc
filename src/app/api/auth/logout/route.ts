import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuthentication, successResponse, unauthorizedResponse } from "@/lib/api-security";
import { revokeAllUserSessions } from "@/lib/concurrent-session-manager";

const IS_PROD = process.env.NODE_ENV === 'production';

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
      }).catch(err => console.error('Audit log error:', err));
    }
  } catch (error) {
    console.error("[Auth Gateway] Logout revocation failure:", error);
  }

  const response = successResponse({ success: true });
  
  // Clear the secure cookie with Strict alignment
  response.cookies.set('nib-auth-token', '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    expires: new Date(0),
    path: '/',
  });

  return response;
}
