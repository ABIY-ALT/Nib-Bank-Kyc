import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { 
  verifyAuthentication, 
  applySecurityHeaders, 
  unauthorizedResponse,
  badRequestResponse,
  successResponse,
  getClientIp,
  verifyIpWhitelist,
  forbiddenResponse
} from "@/lib/api-security";

/**
 * Verify Current Password Endpoint.
 * Security validation for password change operations.
 * Requires: Authentication + IP whitelist check for sensitive operations
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const session = await verifyAuthentication(request);
    if (!session) {
      return unauthorizedResponse('Authentication required');
    }

    // Check IP whitelist for sensitive operations
    const clientIp = getClientIp(request);
    if (!verifyIpWhitelist(clientIp)) {
      return forbiddenResponse('IP address not authorized for sensitive operations');
    }

    const { currentPassword } = await request.json();

    if (!currentPassword) {
      return badRequestResponse('Current password is required');
    }

    // Get user password for verification
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, password: true, email: true }
    });

    if (!user) {
      return unauthorizedResponse('User not found');
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);

    if (!passwordMatch) {
      return unauthorizedResponse('Current password is incorrect');
    }

    // Password verified successfully
    return successResponse({ success: true, message: "Password verified" });
  } catch (error) {
    console.error("[Password Verification] Error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
