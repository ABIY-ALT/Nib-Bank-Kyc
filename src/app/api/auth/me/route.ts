import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Session Verification Endpoint.
 * Validates the HTTP-Only cookie and returns the active user profile.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "No active session." }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);

  try {
    const { payload }: any = await jwtVerify(token, secret);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        branch: {
          include: { district: true }
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ message: "Account restricted or inactive." }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        status: user.status,
        branchName: user.branch?.name || null,
        districtName: user.branch?.district?.name || null,
        assignedBranches: user.assignedBranches || [],
        roles: user.roles || [],
        needsPasswordChange: user.needsPasswordChange
      }
    });
  } catch (error) {
    console.error("[Auth ME] Session invalid:", error);
    return NextResponse.json({ message: "Session verification failed." }, { status: 401 });
  }
}
