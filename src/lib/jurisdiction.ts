
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

export function normalizeAssignedBranches(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((branch) => String(branch).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((branch) => branch.trim()).filter(Boolean);
  }

  return [];
}

export function getResolvedUserBranchName(user: any) {
  return user?.branchName || user?.branch?.name || null;
}

export function getResolvedUserDistrictName(user: any) {
  return user?.districtName || user?.branch?.district?.name || null;
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
    if (assignedBranches.length > 0) {
      return assignedBranches.includes(kyc.branchName);
    }
    // Fallback to primary branch if no portfolio mapped
    if (branchName && kyc.branchName === branchName) {
      return true;
    }
  }

  // 5. Direct Branch Logic
  if (userPermissions.some(p => BRANCH_SCOPE_PERMISSIONS.has(p))) {
    return branchName && kyc.branchName === branchName;
  }

  return false;
}
