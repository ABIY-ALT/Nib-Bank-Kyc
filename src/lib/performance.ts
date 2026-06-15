/**
 * @fileOverview Institutional Performance Metrics Library.
 */

export interface OfficerPerformanceStats {
  total: number;      // Historical total (all cases)
  unseen: number;     // Unseen/Pending Cases — rewards officer's active workload
  amended: number;    // Amendment Cases — penalises quality issues
  authorized: number; // Authorized Cases — primary positive signal
  recycles?: number;  // Resubmitted/recycled cases — additional quality penalty
}

/**
 * Efficiency Score (%) = (Authorized + Unseen) / (Authorized + Unseen + Amendments + Recycles) × 100
 *
 * Rewards:  Higher Authorized → score up. Higher Unseen (active workload) → score up.
 * Penalises: Higher Amendments or Recycles → score down.
 * No work at all → 100 (nothing done wrong yet).
 */
export function calculatePerformanceIndex(stats: OfficerPerformanceStats): number {
  const { unseen, amended, authorized, recycles = 0 } = stats;
  const numerator = authorized + unseen;
  const denominator = authorized + unseen + amended + recycles;
  if (denominator === 0) return 100;
  return Math.round(Math.min((numerator / denominator) * 100, 100));
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
