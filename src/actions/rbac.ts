'use server';

import { getServerSession } from './auth-server';
import { createAuditLog } from './audit';
import { prisma } from '@/lib/prisma';

/**
 * Centralized RBAC Utility — Institutional Security Layer
 *
 * DESIGN PRINCIPLES:
 * 1. Zero-Trust: All roles/permissions are derived exclusively from
 *    the authenticated server-side session + live database query.
 * 2. No client parameter is trusted for privilege decisions.
 * 3. Every violation is logged with CRITICAL severity for audit review.
 * 4. All admin-access events are logged for monitoring.
 */

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────

export type ServerRole =
  | 'SUPER_ADMIN'
  | 'BRANCH_MANAGER'
  | 'DISTRICT_DIRECTOR'
  | 'BRANCH_OFFICER'
  | 'KYC_OFFICER'
  | 'KYC_SPECIALIST'
  | 'KYC_SPECIALIST_OFFICER'
  | 'SUPERVISOR'
  | 'UNASSIGNED';

export interface RbacContext {
  userId: string;
  email: string;
  role: ServerRole;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  permissions: string[];
}

// ─────────────────────────────────────────────
//  CORE RBAC CONTEXT RESOLVER
//  Always fetches roles from DB — never from params
// ─────────────────────────────────────────────

/**
 * Resolves the RBAC context for the current authenticated session.
 * Roles and permissions are fetched exclusively from the database.
 * NEVER call this with client-supplied values.
 */
export async function resolveRbacContext(): Promise<RbacContext | null> {
  const session = await getServerSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      status: true,
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

  if (!user || user.status !== 'ACTIVE') return null;

  const activeRoles = user.roles
    .filter((ur: any) => ur.role.active)
    .map((ur: any) => ur.role.name as ServerRole);

  const role: ServerRole = activeRoles.includes('SUPER_ADMIN')
    ? 'SUPER_ADMIN'
    : (activeRoles[0] || 'UNASSIGNED');

  const permissions: string[] = user.roles.flatMap((ur: any) =>
    ur.role.active
      ? ur.role.permissions.map((rp: any) => rp.permission.slug as string)
      : []
  );

  return {
    userId: user.id,
    email: user.email,
    role,
    isSuperAdmin: role === 'SUPER_ADMIN',
    isAdmin: role === 'SUPER_ADMIN' || role === 'BRANCH_MANAGER' || role === 'DISTRICT_DIRECTOR' || role === 'SUPERVISOR',
    permissions,
  };
}

// ─────────────────────────────────────────────
//  GUARDS
// ─────────────────────────────────────────────

/**
 * Require a specific role. Returns the RBAC context or throws 403.
 * Logs all admin access and all violations.
 */
export async function requireRole(
  requiredRole: ServerRole,
  action?: string
): Promise<RbacContext> {
  const ctx = await resolveRbacContext();

  if (!ctx) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const allowed = ctx.role === 'SUPER_ADMIN' || ctx.role === requiredRole;

  // Log admin-access events
  if (requiredRole === 'SUPER_ADMIN' && ctx.isSuperAdmin && action) {
    await createAuditLog({
      userId: ctx.userId,
      userEmail: ctx.email,
      action: `ADMIN_ACCESS_${action}`,
      details: `Super Admin accessed privileged endpoint: ${action}`,
      severity: 'HIGH',
    }).catch(() => {});
  }

  if (!allowed) {
    await createAuditLog({
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'PRIVILEGE_ESCALATION_ATTEMPT',
      details: `User with role '${ctx.role}' attempted to access endpoint requiring '${requiredRole}'. Action: ${action || 'unknown'}`,
      severity: 'CRITICAL',
    }).catch(() => {});
    throw Object.assign(
      new Error(`Forbidden: requires role '${requiredRole}'`),
      { status: 403 }
    );
  }

  return ctx;
}

/**
 * Require a specific permission slug. Returns the RBAC context or throws 403.
 * Logs all violations with CRITICAL severity.
 */
export async function requirePermission(
  slug: string,
  action?: string
): Promise<RbacContext> {
  const ctx = await resolveRbacContext();

  if (!ctx) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  // Super Admin bypasses all permission checks
  if (ctx.isSuperAdmin) {
    if (action) {
      await createAuditLog({
        userId: ctx.userId,
        userEmail: ctx.email,
        action: `ADMIN_ACCESS_${action}`,
        details: `Super Admin accessed: ${action}`,
        severity: 'HIGH',
      }).catch(() => {});
    }
    return ctx;
  }

  if (!ctx.permissions.includes(slug)) {
    await createAuditLog({
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'UNAUTHORIZED_PERMISSION_ACCESS',
      details: `User missing permission '${slug}' attempted to access: ${action || 'unknown'}`,
      severity: 'CRITICAL',
    }).catch(() => {});
    throw Object.assign(
      new Error(`Forbidden: requires permission '${slug}'`),
      { status: 403 }
    );
  }

  return ctx;
}

/**
 * Detect and reject client-supplied privilege parameters.
 * Call this at the top of every API route handler.
 * Returns 403 and logs a CRITICAL audit event if tampering is detected.
 */
export async function assertNoPrivilegeParams(
  body: Record<string, unknown>,
  session: { id: string; email: string; role: string } | null,
  context: string
): Promise<{ tampered: boolean; blockedKey?: string }> {
  const BLOCKED_KEYS = new Set([
    'isSuperAdmin', 'isAdmin', 'role', 'roles',
    'permissions', 'isManager', 'isDirector', 'admin'
  ]);

  for (const key of Object.keys(body)) {
    if (BLOCKED_KEYS.has(key)) {
      if (session) {
        await createAuditLog({
          userId: session.id,
          userEmail: session.email,
          action: 'PARAMETER_TAMPERING_DETECTED',
          details: `Client supplied blocked privilege key '${key}' in request body. Context: ${context}`,
          severity: 'CRITICAL',
        }).catch(() => {});
      }
      return { tampered: true, blockedKey: key };
    }
  }

  return { tampered: false };
}

/**
 * Log a privilege change event (role assignment, permission grant, status change).
 * Call this whenever a user's role or permissions are modified.
 */
export async function logPrivilegeChange(params: {
  actorId: string;
  actorEmail: string;
  targetUserId: string;
  targetUserEmail: string;
  changeType: 'ROLE_ASSIGNED' | 'ROLE_REVOKED' | 'PERMISSION_GRANTED' | 'PERMISSION_REVOKED' | 'STATUS_CHANGED' | 'SUPER_ADMIN_GRANTED';
  details: string;
}): Promise<void> {
  await createAuditLog({
    userId: params.actorId,
    userEmail: params.actorEmail,
    action: `PRIVILEGE_CHANGE_${params.changeType}`,
    details: `[TARGET: ${params.targetUserEmail}] ${params.details}`,
    severity: params.changeType === 'SUPER_ADMIN_GRANTED' ? 'CRITICAL' : 'HIGH',
  }).catch(() => {});
}
