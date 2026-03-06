'use server';

import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/security';
import { createAuditLog } from './audit';
import { KYCStatus } from '@prisma/client';

/**
 * Institutional Memo Service (Security Layer).
 * Implements strict scope verification and IDOR prevention per Banking Protocol.
 */
export async function getSecureMemo(token: string, userId: string) {
  const memoId = verifyToken(token);
  
  // 1. User Identity Retrieval for Jurisdictional Check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });

  // 2. Token Integrity Check (Prevents IDOR / Manipulation)
  if (!memoId) {
    if (user) {
      await createAuditLog({
        userId: user.id,
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'SECURITY_ALERT_IDOR',
        details: `IDOR Attempt: Invalid or tampered token detected: ${token}`,
        metadata: { token, userId }
      });
    }
    return { error: 'Forbidden', status: 403 };
  }

  // 3. Fetch Memo with KYC Jurisdiction Data
  const memo = await prisma.memo.findUnique({
    where: { id: memoId },
    include: { 
      kyc: true
    }
  });

  if (!memo) {
    // Rule: Return 403 instead of 404 to prevent enumeration
    return { error: 'Forbidden', status: 403 };
  }

  const kyc = memo.kyc;
  const userRole = user?.roles?.[0]?.role?.name;
  const userBranchId = user?.branchId;

  let authorized = false;

  // RULE: Admin - Full access but log every action
  if (userRole === 'SUPER_ADMIN') {
    authorized = true;
  } 
  // RULE: After fetching memo, verify memo.branch_id == user.branch_id
  else if (kyc.branchId === userBranchId) {
    // RULE: KYC Officer - also check assigned_officer_id == user.id
    if (userRole === 'KYC_OFFICER') {
      if (kyc.assignedToId === user?.id) {
        authorized = true;
      }
    } 
    // RULE: Supervisor - only access memos with status == ESCALATED
    else if (userRole === 'SUPERVISOR') {
      if (kyc.status === KYCStatus.ESCALATED) {
        authorized = true;
      }
    } 
    else {
      // Default: Other branch personnel (e.g. Branch Officer) can access their own node's files
      authorized = true;
    }
  }

  // 4. Mandatory Audit Log before response
  await createAuditLog({
    userId: user?.id || null,
    userEmail: user?.email || 'unknown',
    userName: user ? `${user.firstName} ${user.lastName}` : 'System',
    action: authorized ? 'MEMO_DOWNLOAD_AUTHORIZED' : 'MEMO_DOWNLOAD_DENIED',
    details: `${authorized ? 'Authorized' : 'UNAUTHORIZED'} access to memo ${memoId}. KYC Node: ${kyc.id}`,
    metadata: { 
      memoId, 
      kycId: kyc.id, 
      result: authorized ? 'SUCCESS' : 'FORBIDDEN',
      role: userRole,
      branchId: kyc.branchId
    }
  });

  if (!authorized) {
    return { error: 'Forbidden', status: 403 };
  }

  return { success: true, memo };
}
