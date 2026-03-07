import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

/**
 * Session Verification & Rotation Endpoint.
 * Enforces IP binding, token versioning, sliding window rotation, and absolute 8h limit.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();
    const token = cookieStore.get("__Secure-auth-token")?.value;

    if (!token) {
      return NextResponse.json({ message: "No active session." }, { status: 401 });
    }

    const secretStr = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    const secret = new TextEncoder().encode(secretStr);
    const { payload }: any = await jwtVerify(token, secret);

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. Absolute Lifetime Verification (8h limit)
    if (payload.abs && nowSeconds > payload.abs) {
      const response = NextResponse.json({ message: "Absolute session lifetime reached." }, { status: 401 });
      response.cookies.delete('__Secure-auth-token');
      return response;
    }

    // 2. Contextual Binding Verification (IP Check)
    const currentIp = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1';
    if (payload.ip !== currentIp) {
      console.warn(`[SECURITY] Contextual binding violation. User: ${payload.email}`);
      const response = NextResponse.json({ message: "Contextual binding violation." }, { status: 401 });
      response.cookies.delete('__Secure-auth-token');
      return response;
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
      const response = NextResponse.json({ message: "Account restricted." }, { status: 401 });
      response.cookies.delete('__Secure-auth-token');
      return response;
    }

    // 3. Token Versioning Verification (Revocation Check)
    const currentVersion = user.updatedAt.getTime();
    if (payload.v !== currentVersion) {
      const response = NextResponse.json({ message: "Session revoked." }, { status: 401 });
      response.cookies.delete('__Secure-auth-token');
      return response;
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

    const response = NextResponse.json({
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

    // 4. Token Rotation (Sliding Window for Inactivity)
    // If the token has been active for more than 5 minutes, issue a fresh one
    // while preserving the absolute expiration (abs)
    const iat = payload.iat || 0;
    const fiveMinutes = 5 * 60;

    if (nowSeconds - iat > fiveMinutes) {
      const newToken = jwt.sign(
        { 
          ...payload,
          iat: nowSeconds // Reset issued at
        },
        secretStr,
        { expiresIn: "15m" }
      );

      response.cookies.set('__Secure-auth-token', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 15,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json({ message: "Session verification failed." }, { status: 401 });
  }
}