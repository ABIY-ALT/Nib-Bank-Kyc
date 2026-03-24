import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { LoginSchema } from "@/lib/validation";
import { logInstitutionalError } from "@/lib/logger";
import crypto from "crypto";
import { normalizeInstitutionalLogin } from "@/lib/login-identifier";
import { 
  applySecurityHeaders, 
  badRequestResponse,
  successResponse,
  getClientIp,
  unauthorizedResponse,
  internalErrorResponse
} from "@/lib/api-security";

/**
 * Institutional Authentication Gateway.
 * Hardened with:
 * 1. Short Session Lifetime (10m)
 * 2. Strict SameSite=Strict Cookie
 * 3. Client Context Binding (IP + UA Hash)
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: Request) {
  const headerList = await headers();
  const ipAddress = getClientIp(req);
  const userAgent = headerList.get('user-agent') || 'unknown';
  
  const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');
  const genericErrorMessage = "Invalid username or password.";

  try {
    const text = await req.text();
    if (!text) return badRequestResponse(genericErrorMessage);

    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return badRequestResponse("Invalid request format");
    }

    const validation = LoginSchema.safeParse(body);
    if (!validation.success) {
      return badRequestResponse(genericErrorMessage);
    }

    const { email, password } = validation.data;
    const userEmail = normalizeInstitutionalLogin(email);

    if (!userEmail) {
      return badRequestResponse(genericErrorMessage);
    }

    const recentFailures = await prisma.auditLog.count({
      where: {
        userEmail,
        action: { in: ['AUTH_FAILURE', 'AUTH_LOCKOUT'] },
        timestamp: {
          gte: new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000)
        }
      }
    });

    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      await prisma.auditLog.create({
        data: {
          userEmail,
          action: 'AUTH_LOCKOUT',
          ipAddress,
          details: `Account temporarily locked due to ${recentFailures} failed attempts.`
        }
      });
      const response = NextResponse.json({ 
        error: "Maximum login attempts reached. Access is temporarily throttled for security." 
      }, { status: 429 });
      return applySecurityHeaders(response);
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        password: true,
        updatedAt: true,
        needsPasswordChange: true,
        assignedBranches: true,
        branchId: true,
        districtName: true,
        roles: { 
          include: { 
            role: { 
              include: { 
                permissions: { 
                  include: { 
                    permission: true 
                  } 
                } 
              } 
            } 
          } 
        },
        branch: { include: { district: true } }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      await logFailure(userEmail, ipAddress, "Identity mismatch or account inactive");
      return unauthorizedResponse(genericErrorMessage);
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      await logFailure(userEmail, ipAddress, "Credential mismatch");
      return unauthorizedResponse(genericErrorMessage);
    }

    const secret = process.env.JWT_SECRET;
    
    if (!secret || secret.length < 32) {
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET environment variable is missing or insecure.");
    }

    const serializableRoles = (user.roles ?? []).map((ur: any) => ({
      role: {
        id: ur.role?.id ?? 'unknown',
        name: ur.role?.name ?? 'UNKNOWN',
        active: ur.role?.active ?? false,
        permissions: (ur.role?.permissions ?? []).map((p: any) => ({
          permission: { 
            slug: p.permission?.slug ?? '', 
            name: p.permission?.name ?? '', 
            group: p.permission?.group ?? '' 
          }
        }))
      }
    }));

    const activeRoleNames = serializableRoles
      .filter((r: any) => r.role.active)
      .map((r: any) => r.role.name);

    const roleName = activeRoleNames.includes('SUPER_ADMIN') 
      ? 'SUPER_ADMIN' 
      : (activeRoleNames[0] || 'UNASSIGNED');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const absoluteLimit = nowSeconds + (8 * 60 * 60);

    // Generate unique session identifier for single-session enforcement
    const sessionId = crypto.randomUUID();

    // Store sessionId in database to invalidate previous sessions
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { sessionId },
      select: { updatedAt: true }
    });

    const versionSeconds = Math.floor(updatedUser.updatedAt.getTime() / 1000);

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: roleName,
        sid: sessionId, // Include session ID in token
        ip: ipAddress,
        ua: uaHash,
        v: versionSeconds,
        abs: absoluteLimit,
        needsPasswordChange: user.needsPasswordChange
      },
      secret,
      { expiresIn: "10m" }
    );

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'LOGIN_SUCCESS',
        ipAddress,
        details: `Successful institutional authentication from ${ipAddress}`
      }
    });

    const response = successResponse({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        status: user.status,
        branchName: user.branch?.name || null,
        districtName: user.districtName || user.branch?.district?.name || null,
        assignedBranches: user.assignedBranches ? user.assignedBranches.split(',').filter(Boolean) : [],
        roles: serializableRoles,
        needsPasswordChange: user.needsPasswordChange
      }
    });

    response.cookies.set('nib-auth-token', token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: 60 * 10,
      path: '/',
    });

    return response;
  } catch (error: any) {
    const { message } = logInstitutionalError(error, 'AUTH_GATEWAY');
    return internalErrorResponse(message);
  }
}

async function logFailure(email: string, ip: string, reason: string) {
  try {
    await prisma.auditLog.create({
      data: {
        userEmail: email,
        action: 'AUTH_FAILURE',
        ipAddress: ip,
        details: `Failed authentication attempt. Reason: ${reason}`
      }
    });
  } catch (e) {}
}
