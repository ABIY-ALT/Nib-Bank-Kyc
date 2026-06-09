/**
 * @fileOverview Institutional Performance Metrics Library.
 */

export interface OfficerPerformanceStats {
  total: number;      // Historical total (all cases)
  unseen: number;     // Unseen/Pending Cases
  amended: number;    // Amendment Cases
  authorized: number; // Authorized Cases
}

/**
 * Performance Score (%) = ((Authorized + Amendment) / (Authorized + Amendment + Unseen)) × 100
 */
export function calculatePerformanceIndex(stats: OfficerPerformanceStats): number {
  const { unseen, amended, authorized } = stats;
  const denominator = authorized + amended + unseen;
  if (denominator === 0) return 100; // Return 100% if no work is pending or finished
  return Math.round(Math.min(((authorized + amended) / denominator) * 100, 100));
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
