import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Session Verification Endpoint.
 * Enforces IP binding and token versioning (profile change detection).
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();
    const token = cookieStore.get("__Secure-auth-token")?.value;

    if (!token) {
      return NextResponse.json({ message: "No active session." }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "institutional_default_secret_32_chars_min");
    const { payload }: any = await jwtVerify(token, secret);

    // 1. Contextual Binding Verification (IP Check)
    const currentIp = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1';
    if (payload.ip !== currentIp) {
      console.warn(`[SECURITY] Session IP mismatch. Expected: ${payload.ip}, Received: ${currentIp}`);
      return NextResponse.json({ message: "Contextual binding violation." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        branch: { include: { district: true } },
        roles: { 
          include: { 
            role: { 
              include: { 
                permissions: { include: { permission: true } } 
              } 
            } 
          } 
        }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ message: "Account restricted." }, { status: 401 });
    }

    // 2. Token Versioning Verification (Detect Role/Password Changes)
    const currentVersion = user.updatedAt.getTime();
    if (payload.v < currentVersion) {
      // Session is stale due to a profile update (e.g. role change or password reset)
      return NextResponse.json({ message: "Session version expired. Please re-authenticate." }, { status: 401 });
    }

    const serializableRoles = user.roles.map(ur => ({
      role: {
        id: ur.role.id,
        name: ur.role.name,
        permissions: ur.role.permissions.map(p => ({
          permission: { slug: p.permission.slug, name: p.permission.name, group: p.permission.group }
        }))
      }
    }));

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
        roles: serializableRoles,
        needsPasswordChange: user.needsPasswordChange
      }
    });
  } catch (error) {
    return NextResponse.json({ message: "Session verification failed." }, { status: 401 });
  }
}