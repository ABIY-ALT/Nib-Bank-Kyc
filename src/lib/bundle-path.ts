export function sanitizeBundleSegment(value: string | null | undefined, fallback: string) {
  const normalized = (value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\.+$/g, '')
    .slice(0, 80);

  return normalized || fallback;
}

export function getSubmissionDistrictName(submission: any) {
  return submission?.districtName || submission?.branch?.district?.name || 'UNASSIGNED_DISTRICT';
}

export function getSubmissionBranchName(submission: any) {
  return submission?.branch?.name || submission?.branchName || 'UNASSIGNED_BRANCH';
}

export function buildBundleRootName(districtName: string, branchName: string, timestamp: string) {
  const safeDistrict = sanitizeBundleSegment(districtName, 'UNASSIGNED_DISTRICT');
  const safeBranch = sanitizeBundleSegment(branchName, 'UNASSIGNED_BRANCH');

  return `${safeDistrict}-${safeBranch}-${timestamp}`;
}
