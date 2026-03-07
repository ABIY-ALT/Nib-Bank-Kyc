'use server';

import { prisma } from '@/lib/prisma';
import { verifyDownloadToken } from '@/lib/security';
import { createAuditLog } from './audit';
import { KYCStatus } from '@prisma/client';

/**
 * Institutional Memo Service (Security Layer).
 * Implements strict scope verification, expiration checking, and IDOR prevention per Banking Protocol.
 */
export async function getSecureMemo(token: string, userId: string) {
  // 1. Time-Limited Token Verification
  const memoId = verifyDownloadToken(token);
  
  // 2. User Identity Retrieval for Jurisdictional Check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });

  // 3. Integrity Check (Prevents IDOR / Manipulation / Expiration)
  if (!memoId) {
    if (user) {
      await createAuditLog({
        userId: user.id,
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'SECURITY_ALERT_IDOR',
        details: `Access Denied: Invalid, expired, or tampered download token: ${token}`,
        metadata: { token, userId },
        severity: 'HIGH'
      });
    }
    return { error: 'Forbidden', status: 403 };
  }

  // 4. Fetch Memo with KYC Jurisdiction Data
  const memo = await prisma.memo.findUnique({
    where: { id: memoId },
    include: { 
      kyc: true
    }
  });

  if (!memo) {
    // Rule: Return 403 instead of 404 to prevent resource enumeration
    return { error: 'Forbidden', status: 403 };
  }

  const kyc = memo.kyc;
  const userRole = user?.roles?.[0]?.role?.name;
  const userBranchId = user?.branchId;

  let authorized = false;

  // RULE: Super Admin - Full audit access
  if (userRole === 'SUPER_ADMIN') {
    authorized = true;
  } 
  // RULE: Jurisdictional Verification (Branch Isolation)
  else if (kyc.branchId === userBranchId) {
    // Rule: Branch Officers can only view their own node's files
    authorized = true;
  }
  // RULE: Specialist Portfolio Access
  else if (user?.assignedBranches?.includes(kyc.branchName)) {
    authorized = true;
  }

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
