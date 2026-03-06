import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { headers } from "next/headers";
import { createAuditLog } from "@/actions/audit";

/**
 * Institutional Authentication Gateway.
 * Authenticates @nibbank.com.et credentials and issues a secure HTTP-Only cookie.
 * Logs all successful and failed attempts for security monitoring.
 */
export async function POST(req: Request) {
  let userEmail = "unknown";
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ message: "Identity and password required." }, { status: 400 });
    }

    userEmail = email.toLowerCase().trim();
    const cleanPassword = password.trim();

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
        branch: {
          include: { district: true }
        }
      }
    });

    if (!user) {
      await createAuditLog({
        userId: null,
        userEmail,
        action: 'AUTH_FAILURE_IDENTITY',
        details: 'Failed login attempt: Identity not discovered in vault.',
        severity: 'MEDIUM'
      });
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    if (user.status !== 'ACTIVE') {
      await createAuditLog({
        userId: user.id,
        userEmail,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'AUTH_FAILURE_RESTRICTED',
        details: `Access attempt on ${user.status} account.`,
        severity: 'HIGH'
      });
      return NextResponse.json({ message: `Access restricted: Account is ${user.status}.` }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(cleanPassword, user.password);

    if (!isMatch) {
      await createAuditLog({
        userId: user.id,
        userEmail,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'AUTH_FAILURE_CREDENTIAL',
        details: 'Failed login attempt: Invalid password provided.',
        severity: 'MEDIUM'
      });
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    // Capture Successful Auth
    await createAuditLog({
      userId: user.id,
      userEmail,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'LOGIN_SUCCESS',
      details: 'Institutional session initialized via Secure Gateway.',
      severity: 'LOW'
    });

    const secret = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    
    const serializableRoles = user.roles.map(ur => ({
      role: {
        id: ur.role.id,
        name: ur.role.name,
        permissions: ur.role.permissions.map(p => ({
          permission: {
            slug: p.permission.slug,
            name: p.permission.name,
            group: p.permission.group
          }
        }))
      }
    }));

    const roleName = user.roles?.[0]?.role?.name || 'VIEWER';

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: roleName,
        needsPasswordChange: user.needsPasswordChange
      },
      secret,
      { expiresIn: "8h" }
    );

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

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
