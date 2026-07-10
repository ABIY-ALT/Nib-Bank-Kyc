/**
 * @fileOverview Institutional Performance Metrics Library.
 *
 * Workflow-performance formulas (institutional definition):
 *
 * - KYC Officer Workflow Performance
 *     ((Total Assigned − Unseen Analysis − Running (In Review)) ÷ Total Assigned) × 100
 *   An officer is measured on completion: the share of their assigned caseload
 *   that is no longer sitting unopened or mid-review.
 *
 * - Branch Workflow Performance
 *     ((Total Submitted − Need Amendment − Amendment Cycle) ÷ Total Submitted) × 100
 * - District Workflow Performance
 *     ((Regional Active − Need Amendment − Amendment Cycle) ÷ Regional Active) × 100
 *   Branch and district share the same quality shape — the share of the
 *   (branch-submitted / regionally-active) caseload that never needed
 *   correction — differing only in the population the total counts.
 */

export interface OfficerPerformanceStats {
  total: number;      // Historical total (all cases)
  unseen: number;     // Unseen/Pending Cases (kept for call-site compatibility)
  amended: number;    // Amendment Cases
  authorized: number; // Authorized Cases
  recycles?: number;  // Resubmitted/recycled cases
}

/**
 * KYC Officer Workflow Performance (%) =
 *   ((Total Assigned − Unseen Analysis − Running (In Review)) ÷ Total Assigned) × 100
 *
 * No caseload at all → 100 (nothing pending against the officer).
 */
export function calculateOfficerPerformanceIndex(stats: { total: number; unseen: number; running: number }): number {
  const { total, unseen, running } = stats;
  if (total === 0) return 100;
  return Math.round(Math.min(Math.max(((total - unseen - running) / total) * 100, 0), 100));
}

/**
 * Branch Workflow Performance (%) =
 *   ((Total Submitted − Need Amendment − Amendment Cycle) ÷ Total Submitted) × 100
 * District Workflow Performance (%) =
 *   ((Regional Active − Need Amendment − Amendment Cycle) ÷ Regional Active) × 100
 *
 * Same shape for both levels — pass the branch's submitted total or the
 * district's regional-active total as `total`. `calculatePerformanceIndex`
 * keeps its historical name/signature because every branch- and district-level
 * call site already passes { total, amended, recycles }.
 */
export function calculatePerformanceIndex(stats: OfficerPerformanceStats): number {
  const { total, amended, recycles = 0 } = stats;
  if (total === 0) return 100;
  const clean = total - amended - recycles;
  return Math.round(Math.min(Math.max((clean / total) * 100, 0), 100));
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
