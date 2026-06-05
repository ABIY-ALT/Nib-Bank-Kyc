/**
 * @fileOverview Institutional Performance Metrics Library.
 * Provides a balanced, multi-dimensional scoring algorithm for KYC Officers
 * instead of relying on raw counts alone.
 */

import { KYC_STATUS } from "./kyc-data";

export interface OfficerPerformanceStats {
  total: number;      // Submitted Cases (Total assigned/received)
  viewed: number;     // Viewed Cases (Opened and reviewed)
  amended: number;    // Amendment Cases (Sent back for correction)
  authorized: number; // Authorized Cases (Successfully approved)
}

/**
 * Calculates a refined Performance Index (0-100) based on specific workflow rates.
 * 
 * Formula:
 * Performance Index = (Approval Rate × 50) + (Review Rate × 30) − (Amendment Rate × 20)
 * 
 * Where:
 * - Review Rate = Viewed / Submitted
 * - Approval Rate = Authorized / Viewed
 * - Amendment Rate = Amendment / Viewed
 */
export function calculatePerformanceIndex(stats: OfficerPerformanceStats): number {
  const { 
    total,    // Submitted
    viewed,   // Viewed
    amended,  // Amendment
    authorized // Authorized
  } = stats;
  
  if (total === 0) return 0;

  // Step 1: Core Rates
  const reviewRate = viewed / total;
  
  // Prevent division by zero if no cases have been viewed yet
  const approvalRate = viewed > 0 ? authorized / viewed : 0;
  const amendmentRate = viewed > 0 ? amended / viewed : 0;

  // Step 2: Performance Index (0–100%)
  // Calculation is done in decimal (0-1) then multiplied by 100
  const index = (approvalRate * 0.50) + (reviewRate * 0.30) - (amendmentRate * 0.20);

  // Clamp result between 0 and 100
  return Math.round(Math.max(0, Math.min(index * 100, 100)));
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
