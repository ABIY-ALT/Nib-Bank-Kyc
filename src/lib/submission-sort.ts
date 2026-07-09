export function getSubmissionSortTime(submission: any) {
  const rawDate = submission?.submittedAt ?? submission?.createdAt ?? submission?.updatedAt;
  if (!rawDate) return 0;

  const timestamp = typeof rawDate === 'number'
    ? rawDate
    : Date.parse(String(rawDate));

  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortSubmissionsNewestFirst<T extends { id?: string }>(submissions: T[]) {
  return [...submissions].sort((a: any, b: any) => {
    // Prioritize urgent cases first
    if (a?.isUrgent && !b?.isUrgent) return -1;
    if (!a?.isUrgent && b?.isUrgent) return 1;

    const dateDifference = getSubmissionSortTime(b) - getSubmissionSortTime(a);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

export function sortSubmissionsOldestFirst<T extends { id?: string }>(submissions: T[]) {
  return [...submissions].sort((a: any, b: any) => {
    // Prioritize urgent cases first
    if (a?.isUrgent && !b?.isUrgent) return -1;
    if (!a?.isUrgent && b?.isUrgent) return 1;

    const dateDifference = getSubmissionSortTime(a) - getSubmissionSortTime(b);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}
