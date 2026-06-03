
/**
 * Permission-based Scope Definitions
 */
export const GLOBAL_SCOPE_PERMISSIONS = new Set([
  'DASHBOARD_VIEW_SYSTEM',
  'REPORT_VIEW_SYSTEM',
  'VIEW_SPECIALIST_PRODUCTIVITY',
  'MANAGE_VAULT_STORAGE',
  'KYC_DIRECTOR_APPROVAL',
  'CHIEF_RETAIL_REVIEW',
  'VIEW_SYSTEM_AUDIT'
]);

export const PORTFOLIO_SCOPE_PERMISSIONS = new Set([
  'KYC_VIEW_QUEUE',
  'VIEW_AMENDMENT_QUEUE',
  'VIEW_ESCALATED_CASES',
  'SUPERVISOR_FORWARD',
  'KYC_OFFICER_PROCESS',
  'MAP_USERS_TO_BRANCH'
]);

export const BRANCH_SCOPE_PERMISSIONS = new Set([
  'CASE_SUBMIT',
  'CASE_VIEW_OWN',
  'CASE_VIEW_ACTION_REQUIRED'
]);

export const DISTRICT_DIRECTOR_ROLE = 'DISTRICT_DIRECTOR';

export function normalizeBranchName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizeAssignedBranches(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeBranchName).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map(normalizeBranchName).filter(Boolean);
  }

  return [];
}

export function getResolvedUserBranchName(user: any) {
  return normalizeBranchName(user?.branchName || user?.branch?.name || null) || null;
}

export function getResolvedUserDistrictName(user: any) {
  return normalizeBranchName(user?.districtName || user?.branch?.district?.name || null) || null;
}

export function getNormalizedRole(role?: string | null) {
  return role?.toUpperCase() || '';
}

/**
 * Checks if a user has jurisdictional access to a specific KYC case based on their permissions.
 */
export function hasJurisdictionalAccess(user: any, userPermissions: string[], sessionId: string, kyc: any) {
  const assignedBranches = normalizeAssignedBranches(user?.assignedBranches);
  const branchName = getResolvedUserBranchName(user);
  const districtName = getResolvedUserDistrictName(user);

  // 1. Global Oversight Check (Highest Priority)
  if (userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
    return true; 
  }

  // 2. Ownership Check
  if (kyc.createdById === sessionId || kyc.assignedToId === sessionId) {
    return true;
  }

  // 3. District Director Logic (Dynamic based on permission or legacy role)
  const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') || userPermissions.includes('DASHBOARD_VIEW_DISTRICT');
  if (isDistrictAdmin && districtName) {
    if (kyc.districtName === districtName || kyc.branch?.district?.name === districtName) {
      return true;
    }
  }

  // 4. Portfolio / Specialist Logic
  if (userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p))) {
    const normalizedKycBranchName = normalizeBranchName(kyc.branchName).toLowerCase();
    if (assignedBranches.length > 0) {
      return assignedBranches
        .map((branch) => normalizeBranchName(branch).toLowerCase())
        .includes(normalizedKycBranchName);
    }
    // Fallback to primary branch if no portfolio mapped
    if (branchName && normalizeBranchName(branchName).toLowerCase() === normalizedKycBranchName) {
      return true;
    }
  }

  // 5. Direct Branch Logic
  if (userPermissions.some(p => BRANCH_SCOPE_PERMISSIONS.has(p))) {
    return branchName && normalizeBranchName(branchName).toLowerCase() === normalizeBranchName(kyc.branchName).toLowerCase();
  }

  return false;
}
