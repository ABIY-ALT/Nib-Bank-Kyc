import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createAuditLog } from "@/actions/audit";
import { headers } from "next/headers";

/**
 * Institutional Authentication Gateway.
 * Authenticates @nibbank.com.et credentials and issues a __Secure- HTTP-Only cookie.
 * Binds session to IP address and implements versioning via updatedAt timestamp.
 */
export async function POST(req: Request) {
  let userEmail = "unknown";
  try {
    const body = await req.json();
    const { email, password } = body;
    const headerList = await headers();
    
    // Resolve Client IP for Contextual Binding
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

    await createAuditLog({
      userId: user.id,
      userEmail,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'LOGIN_SUCCESS',
      details: 'Institutional session initialized with IP binding and versioning.',
      severity: 'LOW'
    });

    const secret = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    const roleName = user.roles?.[0]?.role?.name || 'VIEWER';

    // Token Payload with Contextual Binding (IP) and Versioning (updatedAt)
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: roleName,
        ip: ipAddress,
        v: user.updatedAt.getTime(), // Versioning based on last profile modification
        needsPasswordChange: user.needsPasswordChange
      },
      secret,
      { expiresIn: "8h" }
    );

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
      success: true,
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

    // Enforce __Secure- prefix and strict scoping
    response.cookies.set('__Secure-auth-token', token, {
      httpOnly: true,
      secure: true, // Required for __Secure- prefix
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error("[Auth API] Login Error:", error);
    return NextResponse.json({ message: "Internal security service error." }, { status: 500 });
  }
}
