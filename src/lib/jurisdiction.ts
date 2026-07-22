
/**
 * Permission-based Scope Definitions
 */
export const GLOBAL_SCOPE_PERMISSIONS = new Set([
  'DASHBOARD_VIEW_SYSTEM',
  'REPORT_VIEW_SYSTEM',
  'MANAGE_VAULT_STORAGE',
  'PURGE_VAULT_STORAGE',
  'KYC_DIRECTOR_APPROVAL',
  'CHIEF_RETAIL_REVIEW',
  'VIEW_SYSTEM_AUDIT',
  'VIEW_SPECIALIST_PRODUCTIVITY'
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
  'CASE_VIEW_ACTION_REQUIRED',
  'CASE_VIEW_BRANCH',
  'DASHBOARD_VIEW_BRANCH'
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
 * Whether "now" is Saturday in the bank's local timezone (Africa/Addis_Ababa).
 * Used by the per-officer Saturday all-branch visibility configuration.
 */
export function isSaturdayNow(date: Date = new Date()): boolean {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Africa/Addis_Ababa',
    }).format(date);
    return weekday === 'Sat';
  } catch {
    return date.getDay() === 6;
  }
}

/**
 * Whether "now" is during late hours (e.g., after 5 PM or before 8 AM)
 * Used by the per-officer Late Hour all-branch visibility configuration.
 */
export function isLateHourNow(date: Date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Addis_Ababa',
    }).formatToParts(date);
    const hourStr = parts.find(p => p.type === 'hour')?.value;
    if (!hourStr) return false;
    const hour = parseInt(hourStr, 10);
    // Late hours: before 8:00 AM or 5:00 PM (17:00) and after
    return hour < 8 || hour >= 17;
  } catch {
    const hour = date.getHours();
    return hour < 8 || hour >= 17;
  }
}

/**
 * Whether "now" is during lunch break (e.g., 12 PM - 2 PM)
 * Used by the per-officer Lunch Break all-branch visibility configuration.
 */
export function isLunchBreakNow(date: Date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Addis_Ababa',
    }).formatToParts(date);
    const hourStr = parts.find(p => p.type === 'hour')?.value;
    if (!hourStr) return false;
    const hour = parseInt(hourStr, 10);
    // Lunch break: 12:00 PM to 2:00 PM (12:00 - 13:59)
    return hour === 12 || hour === 13;
  } catch {
    const hour = date.getHours();
    return hour === 12 || hour === 13;
  }
}

/**
 * Checks if a user has jurisdictional access to a specific KYC case based on their permissions.
 */
export async function hasJurisdictionalAccess(user: any, userPermissions: string[], sessionId: string, kyc: any, prisma: any) {
  const assignedBranches = normalizeAssignedBranches(user?.assignedBranches);
  const branchName = getResolvedUserBranchName(user);
  const districtName = getResolvedUserDistrictName(user);
  const userBranchId = user?.branchId;

  // 1. Ownership Check (Always allowed)
  if (kyc.createdById === sessionId || kyc.assignedToId === sessionId) {
    return true;
  }

  // 1b. Time-based Configuration: officer can see every branch based on schedule.
  if (user?.saturdayAllBranches && isSaturdayNow()) return true;
  if (user?.lateHourAllBranches && isLateHourNow()) return true;
  if (user?.lunchBreakAllBranches && isLunchBreakNow()) return true;

  // 2. Resolve Role Scopes
  const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') || userPermissions.includes('DASHBOARD_VIEW_DISTRICT');
  const isPortfolioStaff = userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p));
  const isBranchScopeStaff = userPermissions.some(p => BRANCH_SCOPE_PERMISSIONS.has(p));
  
  const isBranchLevelStaff = branchName && 
    isBranchScopeStaff && 
    !isPortfolioStaff && 
    (assignedBranches.length === 0 || assignedBranches.length === 1);

  // 3. Global Oversight Check
  // Only allowed if NOT a branch-level staff or district admin who should be restricted to their scope
  if (!isBranchLevelStaff && !isDistrictAdmin && userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
    return true; 
  }

  // 4. District Director Logic
  if (isDistrictAdmin && districtName) {
    if (kyc.districtName === districtName || kyc.branch?.district?.name === districtName) {
      return true;
    }
  }

  // 5. Portfolio / Specialist Logic
  if (isPortfolioStaff) {
    const normalizedKycBranchName = normalizeBranchName(kyc.branchName).toLowerCase();
    if (assignedBranches.length > 0) {
      return assignedBranches
        .map((branch) => normalizeBranchName(branch).toLowerCase())
        .includes(normalizedKycBranchName);
    }
    // Fallback to primary branch if no portfolio mapped
    if (userBranchId && kyc.branchId === userBranchId) return true;
    if (branchName && normalizeBranchName(branchName).toLowerCase() === normalizedKycBranchName) {
      return true;
    }
  }

  // 6. Direct Branch Logic (Branch Level Staff fallback)
  if (isBranchScopeStaff) {
    if (userBranchId && kyc.branchId === userBranchId) return true;
    if (branchName && normalizeBranchName(branchName).toLowerCase() === normalizeBranchName(kyc.branchName).toLowerCase()) {
      return true;
    }
  }

  // 7. History Check: user has worked on this case before (read-only access)
  // Only queried as a fallback if explicit static scope checks didn't match.
  if (prisma) {
    const hasHistory = await prisma.auditLog.count({
      where: {
        userId: sessionId,
        kycId: kyc.id
      }
    });
    if (hasHistory > 0) return true;
  }

  return false;
}
