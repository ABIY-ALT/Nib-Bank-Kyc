
export const DIRECT_BRANCH_ROLES = new Set(['BRANCH_MANAGER', 'BRANCH_OFFICER']);
export const PORTFOLIO_BRANCH_ROLES = new Set(['KYC_OFFICER', 'KYC_SPECIALIST', 'KYC_SPECIALIST_OFFICER', 'SUPERVISOR']);
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

export function hasJurisdictionalAccess(user: any, role: string, sessionId: string, kyc: any) {
  const assignedBranches = normalizeAssignedBranches(user?.assignedBranches);
  const branchName = getResolvedUserBranchName(user);
  const districtName = getResolvedUserDistrictName(user);
  
  const matchesBranch = Boolean(
    (user?.branchId && kyc.branchId === user.branchId) ||
    (branchName && kyc.branchName === branchName)
  );
  
  const matchesPortfolio = assignedBranches.includes(kyc.branchName);
  
  const matchesDistrict = role === DISTRICT_DIRECTOR_ROLE
    && !!districtName
    && (kyc.districtName === districtName || kyc.branch?.district?.name === districtName);

  if (DIRECT_BRANCH_ROLES.has(role)) {
    return matchesBranch;
  }

  if (PORTFOLIO_BRANCH_ROLES.has(role)) {
    return assignedBranches.length > 0 ? matchesPortfolio : matchesBranch;
  }

  if (role === DISTRICT_DIRECTOR_ROLE) {
    return matchesDistrict;
  }

  return matchesBranch || matchesPortfolio || matchesDistrict || kyc.createdById === sessionId || kyc.assignedToId === sessionId;
}
