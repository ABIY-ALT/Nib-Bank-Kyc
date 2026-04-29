const MAX_BUNDLE_SEGMENT_INPUT_LENGTH = 512;
const MAX_BUNDLE_SEGMENT_LENGTH = 80;

function trimTrailingDots(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 46) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function sanitizeBundleSegment(value: string | null | undefined, fallback: string) {
  const normalized = (value || '')
    .slice(0, MAX_BUNDLE_SEGMENT_INPUT_LENGTH)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
  const trimmedDots = trimTrailingDots(normalized).slice(0, MAX_BUNDLE_SEGMENT_LENGTH);

  return trimmedDots || fallback;
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
