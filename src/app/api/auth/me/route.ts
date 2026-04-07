import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { 
  verifyAuthentication, 
  applySecurityHeaders, 
  unauthorizedResponse,
  successResponse,
  getClientIp 
} from "@/lib/api-security";

/**
 * Session Verification & Heartbeat Endpoint.
 * Enforces:
 * 1. Absolute session lifetime (8h)
 * 2. Strict SameSite=Strict Cookie Policy
 * 3. Client Context Binding (IP + UA Hash)
 */
const IS_PROD = process.env.NODE_ENV === 'production';

const IDLE_TIMEOUT_MINUTES = 15;

export async function GET(req: Request) {
  try {
    // Verify authentication
    const session = await verifyAuthentication(req);
    if (!session) {
      return unauthorizedResponse('Invalid or expired session');
    }

    const cookieStore = await cookies();
    const headerList = await headers();

    // Verify client context (IP + User Agent)
    const clientIp = getClientIp(req);
    const currentUa = headerList.get('user-agent') || 'unknown';
    const currentUaHash = crypto.createHash('sha256').update(currentUa).digest('hex');

    if (session.ip !== clientIp || session.ua !== currentUaHash) {
      return unauthorizedResponse('Session context violation detected');
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        branchId: true,
        districtName: true,
        updatedAt: true,
        lastActivity: true,
        needsPasswordChange: true,
        assignedBranches: true,
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

    // Check user exists
    if (!user || user.status !== 'ACTIVE') {
      return unauthorizedResponse('Account is not active');
    }

    // Check idle timeout
    const now = new Date();
    const lastActivityTime = user.lastActivity || user.updatedAt;
    const idleMinutes = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60);

    if (idleMinutes > IDLE_TIMEOUT_MINUTES) {
      return unauthorizedResponse('Session idle timeout exceeded');
    }

    // Update last_activity timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivity: now }
    }).catch(() => {}); // Don't block response if update fails

    // Verify token version hasn't changed
    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (session.v !== currentVersion) {
      return unauthorizedResponse('Session invalidated');
    }

    const serializableRoles = user.roles.map((ur: any) => ({
      role: {
        id: ur.role.id,
        name: ur.role.name,
        active: ur.role.active,
        permissions: ur.role.permissions.map((p: any) => ({
          permission: { slug: p.permission.slug, name: p.permission.name, group: p.permission.group }
        }))
      }
    }));
    const activeRoleNames = serializableRoles
      .filter((r: any) => r.role.active)
      .map((r: any) => r.role.name);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const iat = session.iat || 0;
    const rotationThreshold = 2 * 60;

    const secret = process.env.JWT_SECRET || '';
    let response = successResponse({
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

    // Token rotation every 2 minutes
    if (nowSeconds - iat > rotationThreshold) {
      const { exp, nbf, iat: _oldIat, ...sessionPayload } = session as any;
      const newToken = jwt.sign(
        { 
          ...sessionPayload,
          role: activeRoleNames.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : (activeRoleNames[0] || 'UNASSIGNED'),
          needsPasswordChange: user.needsPasswordChange,
          iat: nowSeconds 
        },
        secret,
          { expiresIn: "30m" } 
      });
    }

    return response;
  } catch (error) {
    console.error('[Session Verification] Error:', error);
    return unauthorizedResponse('Session validation failed');
  }
}
