/**
 * @fileOverview Institutional Performance Metrics Library.
 */

export interface OfficerPerformanceStats {
  total: number;      // Total Cases assigned/received
  viewed: number;     // Viewed Cases (opened and reviewed)
  amended: number;    // Amendment Cases (sent back for correction)
  authorized: number; // Authorized Cases (successfully approved)
}

/**
 * Performance Score (%) = ((Authorized Cases + Amendment Cases) / Total Cases) × 100
 */
export function calculatePerformanceIndex(stats: OfficerPerformanceStats): number {
  const { total, amended, authorized } = stats;
  if (total === 0) return 0;
  return Math.round(Math.min(((authorized + amended) / total) * 100, 100));
}

/**
 * Normalizes accuracy labels based on the performance index.
 */
export function getPerformanceLabel(index: number): { label: string; color: string } {
  if (index >= 90) return { label: 'Exceptional', color: 'text-emerald-600' };
  if (index >= 75) return { label: 'Optimal', color: 'text-blue-600' };
  if (index >= 50) return { label: 'Standard', color: 'text-slate-600' };
  if (index >= 25) return { label: 'Sub-Optimal', color: 'text-orange-600' };
  return { label: 'Critical', color: 'text-red-600' };
}
