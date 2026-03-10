import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/actions/auth-server";

/**
 * Institutional Logout Gateway.
 * Implements server-side session revocation via token version rotation.
 * Updating 'updatedAt' invalidates all tokens for this user globally.
 */
export async function POST() {
  try {
    const session = await getServerSession();
    
    if (session) {
      // RULE: Update timestamp to rotate version 'v', orphaning all active tokens
      await prisma.user.update({
        where: { id: session.id },
        data: { updatedAt: new Date() }
      });
    }
  } catch (error) {
    console.error("[Auth Gateway] Logout revocation failure:", error);
  }

  const response = NextResponse.json({ success: true });
  
  // Clear the secure cookie with Strict alignment
  response.cookies.set('nib-auth-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', // ALIGNED: Strict policy applied during deletion
    expires: new Date(0),
    path: '/',
  });

  return response;
}