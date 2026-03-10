import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Session Verification & Rotation Endpoint.
 * Reduced rotation window (2m) and shorter session validity (10m).
 * Enforces Client Context Binding (IP + UserAgent).
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();
    const token = cookieStore.get("nib-auth-token")?.value;

    if (!token) {
      return NextResponse.json({ message: "No active session." }, { status: 401 });
    }

    const secretStr = process.env.JWT_SECRET || "";
    if (!secretStr || secretStr.length < 32) {
      return NextResponse.json({ message: "System configuration fault." }, { status: 500 });
    }

    const secret = new TextEncoder().encode(secretStr);
    const { payload }: any = await jwtVerify(token, secret);

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. Absolute Lifetime Verification (8h limit)
    if (payload.abs && nowSeconds > payload.abs) {
      const response = NextResponse.json({ message: "Absolute session lifetime reached." }, { status: 401 });
      response.cookies.delete('nib-auth-token');
      return response;
    }

    // 2. Contextual Binding Verification (IP + UA Check)
    const currentIp = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1';
    const currentUa = headerList.get('user-agent') || 'unknown';
    const currentUaHash = crypto.createHash('sha256').update(currentUa).digest('hex');

    if (payload.ip !== currentIp || payload.ua !== currentUaHash) {
      const response = NextResponse.json({ message: "Session restricted due to client context change." }, { status: 401 });
      response.cookies.delete('nib-auth-token');
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
      response.cookies.delete('nib-auth-token');
      return response;
    }

    // 3. Token Versioning Verification (Revocation on Privilege Change)
    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (payload.v !== currentVersion) {
      const response = NextResponse.json({ message: "Session revoked due to security update." }, { status: 401 });
      response.cookies.delete('nib-auth-token');
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
        assignedBranches: user.assignedBranches ? user.assignedBranches.split(',').filter(Boolean) : [],
        roles: serializableRoles,
        needsPasswordChange: user.needsPasswordChange
      }
    });

    // 4. Frequent Token Rotation (Sliding window: 2m)
    // Atomic replacement invalidates the old token after use in the client session.
    const iat = payload.iat || 0;
    const rotationThreshold = 2 * 60; 

    if (nowSeconds - iat > rotationThreshold) {
      const newToken = jwt.sign(
        { 
          ...payload,
          iat: nowSeconds
        },
        secretStr,
        { expiresIn: "10m" }
      );

      response.cookies.set('nib-auth-token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json({ message: "Invalid session." }, { status: 401 });
  }
}
