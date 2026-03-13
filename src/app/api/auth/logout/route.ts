import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuthentication, successResponse, unauthorizedResponse } from "@/lib/api-security";

/**
 * Institutional Logout Gateway.
 * Implements server-side session revocation via token version rotation.
 * Requires authentication.
 */
export async function POST(request: Request) {
  try {
    const session = await verifyAuthentication(request);
    
    if (session) {
      // Update timestamp to rotate version 'v', orphaning all active tokens
      await prisma.user.update({
        where: { id: session.id },
        data: { updatedAt: new Date() }
      });
    }
  } catch (error) {
    console.error("[Auth Gateway] Logout revocation failure:", error);
  }

  const response = successResponse({ success: true });
  
  // Clear the secure cookie with Strict alignment
  response.cookies.set('nib-auth-token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    expires: new Date(0),
    path: '/',
  });

  return response;
}