import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/actions/audit";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserStatus } from "@prisma/client";

/**
 * Institutional Authentication Gateway.
 * Hardened with:
 * 1. Generic Error Responses (Anti-Enumeration)
 * 2. Adaptive Throttling (Lockout via Audit Logs)
 * 3. Session Concurrency Control (Limit: 1)
 * 4. Absolute Lifetime Binding (8h)
 * 5. Emergency Auto-Provisioning for Admin
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

export async function POST(req: Request) {
  let userEmail = "unknown";
  try {
    const body = await req.json();
    const { email, password } = body;
    const headerList = await headers();
    
    const ipAddress = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1';

    // INSTITUTIONAL POLICY: Use generic responses for all failure modes to prevent enumeration.
    const genericErrorMessage = "Invalid institutional credentials.";

    if (!email || !password) {
      return NextResponse.json({ message: genericErrorMessage }, { status: 400 });
    }

    userEmail = email.toLowerCase().trim();

    // 1. ADAPTIVE THROTTLING: Check for recent failed attempts in the Audit Vault.
    const recentFailures = await prisma.auditLog.count({
      where: {
        userEmail,
        action: { in: ['AUTH_FAILURE', 'AUTH_FAILURE_CREDENTIAL', 'AUTH_LOCKOUT'] },
        timestamp: {
          gte: new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000)
        }
      }
    });

    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      await createAuditLog({
        userId: null,
        userEmail,
        action: 'AUTH_LOCKOUT',
        details: `Brute-force protection: Account throttled after ${recentFailures} attempts. Origin: ${ipAddress}`,
        severity: 'HIGH'
      });
      
      return NextResponse.json({ 
        message: "Maximum login attempts reached. For security preservation, access is temporarily throttled. Please try again in 15 minutes or contact the Security Officer." 
      }, { status: 429 });
    }

    let user = await prisma.user.findUnique({
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

    // 2. EMERGENCY AUTO-PROVISIONING (Unblocks the user if seed didn't run)
    if (!user && userEmail === 'admin.user@nibbank.com.et') {
      console.log("🚀 [GATEWAY] Auto-provisioning Master Admin...");
      const hashedPassword = await bcrypt.hash('ChangeMe123!', 10);
      
      // Create Role if missing
      const adminRole = await prisma.role.upsert({
        where: { name: 'SUPER_ADMIN' },
        update: {},
        create: { name: 'SUPER_ADMIN', description: 'Master Control' }
      });

      user = await prisma.user.create({
        data: {
          email: userEmail,
          password: hashedPassword,
          firstName: 'System',
          lastName: 'Administrator',
          status: UserStatus.ACTIVE,
          needsPasswordChange: true,
          roles: {
            create: { roleId: adminRole.id }
          }
        },
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
    }

    // 3. IDENTITY VERIFICATION (With Generic Failure Response)
    if (!user || user.status !== 'ACTIVE') {
      await createAuditLog({
        userId: user?.id || null,
        userEmail,
        action: 'AUTH_FAILURE',
        details: `Failed login attempt: ${!user ? 'Identity not discovered' : 'Account status: ' + user.status}`,
        severity: 'MEDIUM'
      });
      return NextResponse.json({ message: genericErrorMessage }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      await createAuditLog({
        userId: user.id,
        userEmail,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'AUTH_FAILURE_CREDENTIAL',
        details: 'Failed login attempt: Invalid password hash match.',
        severity: 'MEDIUM'
      });
      return NextResponse.json({ message: genericErrorMessage }, { status: 401 });
    }

    // 4. CONCURRENCY CONTROL: Force updatedAt update to invalidate all previous sessions
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    });

    await createAuditLog({
      userId: updatedUser.id,
      userEmail: updatedUser.email,
      userName: `${updatedUser.firstName} ${updatedUser.lastName}`,
      action: 'LOGIN_SUCCESS',
      details: 'Institutional session initialized. Previous sessions rotated.',
      severity: 'LOW'
    });

    const secret = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    const roleName = updatedUser.roles?.[0]?.role?.name || 'VIEWER';

    // 5. SESSION LIFETIME PARAMETERS
    const nowSeconds = Math.floor(Date.now() / 1000);
    const absoluteLimit = nowSeconds + (8 * 60 * 60); // 8 Hours Absolute

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

    response.cookies.set('nib-auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 15, // 15 minutes
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error("[Auth API] Gateway Error:", error);
    return NextResponse.json({ message: "Internal security service error." }, { status: 500 });
  }
}
