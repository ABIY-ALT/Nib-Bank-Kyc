import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/actions/audit";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * Institutional Authentication Gateway.
 * Hardened with Session Concurrency Control (Limit: 1).
 * Issues short-lived access tokens (15m) with absolute lifetime binding (8h).
 */
export async function POST(req: Request) {
  let userEmail = "unknown";
  try {
    const body = await req.json();
    const { email, password } = body;
    const headerList = await headers();
    
    const ipAddress = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1';

    if (!email || !password) {
      return NextResponse.json({ message: "Identity and password required." }, { status: 400 });
    }

    userEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
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
        },
        branch: { include: { district: true } }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      await createAuditLog({
        userId: user?.id || null,
        userEmail,
        action: 'AUTH_FAILURE',
        details: `Failed login attempt: ${!user ? 'Identity not discovered' : 'Account ' + user.status}`,
        severity: 'MEDIUM'
      });
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      await createAuditLog({
        userId: user.id,
        userEmail,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'AUTH_FAILURE_CREDENTIAL',
        details: 'Failed login attempt: Invalid password.',
        severity: 'MEDIUM'
      });
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    // CONCURRENCY CONTROL: Force updatedAt update to invalidate all previous sessions
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    });

    await createAuditLog({
      userId: updatedUser.id,
      userEmail: updatedUser.email,
      userName: `${updatedUser.firstName} ${updatedUser.lastName}`,
      action: 'LOGIN_SUCCESS',
      details: 'Institutional session initialized. Previous sessions revoked via version rotation.',
      severity: 'LOW'
    });

    const secret = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    const roleName = updatedUser.roles?.[0]?.role?.name || 'VIEWER';

    // SESSION LIFETIME PARAMETERS
    const nowSeconds = Math.floor(Date.now() / 1000);
    const absoluteLimit = nowSeconds + (8 * 60 * 60); // 8 Hours Absolute

    // SHORT-LIVED TOKEN: 15 minutes inactivity with explicit absolute version binding
    const token = jwt.sign(
      { 
        id: updatedUser.id, 
        email: updatedUser.email,
        role: roleName,
        ip: ipAddress,
        v: updatedUser.updatedAt.getTime(),
        abs: absoluteLimit, // Absolute Session Lifetime
        needsPasswordChange: updatedUser.needsPasswordChange
      },
      secret,
      { expiresIn: "15m" }
    );

    const serializableRoles = updatedUser.roles.map(ur => ({
      role: {
        id: ur.role.id,
        name: ur.role.name,
        permissions: ur.role.permissions.map(p => ({
          permission: { slug: p.permission.slug, name: p.permission.name, group: p.permission.group }
        }))
      }
    }));

    const response = NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        name: `${updatedUser.firstName} ${updatedUser.lastName}`,
        email: updatedUser.email,
        status: updatedUser.status,
        branchName: updatedUser.branch?.name || null,
        districtName: updatedUser.branch?.district?.name || null,
        assignedBranches: updatedUser.assignedBranches || [],
        roles: serializableRoles,
        needsPasswordChange: updatedUser.needsPasswordChange
      }
    });

    response.cookies.set('__Secure-auth-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 15, // 15 minutes (Refreshed on activity)
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error("[Auth API] Login Error:", error);
    return NextResponse.json({ message: "Internal security service error." }, { status: 500 });
  }
}