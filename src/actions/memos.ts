'use server';

import { prisma } from '@/lib/prisma';
import { signDownloadToken, verifyDownloadToken } from '@/lib/security';
import { createAuditLog } from './audit';
import { getServerSession } from './auth-server';

const DIRECT_BRANCH_ROLES = new Set(['BRANCH_MANAGER', 'BRANCH_OFFICER']);
const PORTFOLIO_BRANCH_ROLES = new Set(['KYC_OFFICER', 'KYC_SPECIALIST', 'KYC_SPECIALIST_OFFICER', 'SUPERVISOR']);
const DISTRICT_DIRECTOR_ROLE = 'DISTRICT_DIRECTOR';

function normalizeAssignedBranches(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((branch) => String(branch).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((branch) => branch.trim()).filter(Boolean);
  }

  return [];
}

function hasPermission(user: any, slug: string) {
  return Boolean(
    user?.roles?.some((userRole: any) =>
      userRole?.role?.active !== false &&
      userRole?.role?.permissions?.some((rolePermission: any) => rolePermission?.permission?.slug === slug)
    )
  );
}

async function hasFollowUpCaseAccess(user: any, submissionId: string) {
  const canAccessFollowUpCases = hasPermission(user, 'VIEW_AUDIT_POOL') || hasPermission(user, 'VIEW_AUDIT_LOGS');
  if (!canAccessFollowUpCases) return false;

  const followUpRecord = await prisma.followUpVerification.findFirst({
    where: { submissionId },
    select: { id: true }
  });

  return Boolean(followUpRecord);
}

async function getMemoAccessContext(userId: string, memoId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
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
      }
    }
  });

  const memo = await prisma.memo.findUnique({
    where: { id: memoId },
    select: {
      id: true,
      name: true,
      originalName: true,
      storageKey: true,
      mimeType: true,
      kyc: true
    }
  });

  if (!memo) {
    return { user, memo: null, authorized: false };
  }

  const kyc = memo.kyc;
  const userRole = user?.roles?.[0]?.role?.name?.toUpperCase();
  const userBranchId = user?.branchId;
  const userBranchName = user?.branchName;
  const assignedBranches = normalizeAssignedBranches(user?.assignedBranches);
  const userDistrictName = user?.districtName;

  let authorized = false;

  if (userRole === 'SUPER_ADMIN') {
    authorized = true;
  } else if (DIRECT_BRANCH_ROLES.has(userRole || '')) {
    authorized = Boolean(
      (userBranchId && kyc.branchId === userBranchId) ||
      (userBranchName && kyc.branchName === userBranchName)
    );
  } else if (PORTFOLIO_BRANCH_ROLES.has(userRole || '')) {
    authorized = assignedBranches.length > 0
      ? assignedBranches.includes(kyc.branchName)
      : Boolean(
          (userBranchId && kyc.branchId === userBranchId) ||
          (userBranchName && kyc.branchName === userBranchName)
        );
  } else if (userRole === DISTRICT_DIRECTOR_ROLE) {
    authorized = Boolean(
      userDistrictName &&
      kyc.districtName === userDistrictName
    );
  } else if (
    (userBranchId && kyc.branchId === userBranchId) ||
    (userBranchName && kyc.branchName === userBranchName) ||
    assignedBranches.includes(kyc.branchName)
  ) {
    authorized = true;
  } else if (await hasFollowUpCaseAccess(user, kyc.id)) {
    authorized = true;
  }

  return { user, memo, authorized };
}

export async function getMemoAccessUrl(memoId: string, options?: { download?: boolean }) {
  const session = await getServerSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const { memo, authorized } = await getMemoAccessContext(session.id, memoId);
  if (!memo || !authorized) {
    return { success: false, error: 'Forbidden' };
  }

  const token = signDownloadToken(memoId);
  const suffix = options?.download ? '?download=1' : '';
  return { success: true, url: `/api/memos/${token}${suffix}` };
}

/**
 * Institutional Memo Service (Security Layer).
 * Implements strict scope verification, expiration checking, and IDOR prevention per Banking Protocol.
 */
export async function getSecureMemo(token: string, userId: string) {
  // 1. Time-Limited Token Verification
  const memoId = verifyDownloadToken(token);

  // 2. Require authenticated session and enforce ownership checks (prevent client-supplied userId abuse)
  const session = await getServerSession();
  if (!session) {
    return { error: 'Forbidden', status: 403 };
  }

  // If the client supplied a userId that does not match the authenticated session
  // and the session is not a SUPER_ADMIN, deny request. Always use server session
  // identity for authorization decisions to prevent horizontal privilege escalation.
  if (session.id !== userId && session.role !== 'SUPER_ADMIN') {
    const attemptedUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true } });
    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'SECURITY_ALERT_IDOR',
      details: `Client attempted memo access with mismatched userId param. Supplied: ${userId}`,
      metadata: { suppliedUserId: userId, suppliedUserExists: Boolean(attemptedUser) },
      severity: 'CRITICAL'
    }).catch(() => {});

    return { error: 'Forbidden', status: 403 };
  }

  // Use session.id as authoritative identity for subsequent checks
  const sessionUser = await prisma.user.findUnique({ where: { id: session.id } });

  // 3. Integrity Check (Prevents IDOR / Manipulation / Expiration)
  if (!memoId) {
    if (sessionUser) {
      await createAuditLog({
        userId: sessionUser.id,
        userEmail: sessionUser.email,
        userName: `${sessionUser.firstName} ${sessionUser.lastName}`,
        action: 'SECURITY_ALERT_IDOR',
        details: `Access Denied: Invalid, expired, or tampered download token: ${token}`,
        metadata: { token, userId },
        severity: 'HIGH'
      });
    }
    return { error: 'Forbidden', status: 403 };
  }

  const { user, memo, authorized } = await getMemoAccessContext(session.id, memoId);
  if (!memo) {
    // Rule: Return 403 instead of 404 to prevent resource enumeration
    return { error: 'Forbidden', status: 403 };
  }

  const kyc = memo.kyc;
  const userRole = user?.roles?.[0]?.role?.name?.toUpperCase();

  // 5. Mandatory Audit Log before response
  await createAuditLog({
    userId: user?.id || null,
    userEmail: user?.email || 'unknown',
    userName: user ? `${user.firstName} ${user.lastName}` : 'System',
    action: authorized ? 'MEMO_DOWNLOAD_AUTHORIZED' : 'MEMO_DOWNLOAD_DENIED',
    details: `${authorized ? 'Authorized' : 'UNAUTHORIZED'} extraction of asset ${memo.name} (Memo ID: ${memoId}). Case: ${kyc.id}`,
    metadata: { 
      memoId, 
      kycId: kyc.id, 
      result: authorized ? 'SUCCESS' : 'FORBIDDEN',
      role: userRole,
      branchId: kyc.branchId
    },
    severity: authorized ? 'LOW' : 'HIGH'
  });

  if (!authorized) {
    return { error: 'Forbidden', status: 403 };
  }

  return { success: true, memo };
}
