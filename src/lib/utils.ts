import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts a local Date to an ISO string representing the start of that local day (00:00:00.000 local time)
 */
export function toLocalStartOfDayISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  // Create a date that is the start of the local day, then convert to ISO
  const localStart = new Date(year, date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return localStart.toISOString();
}

/**
 * Converts a local Date to an ISO string representing the end of that local day (23:59:59.999 local time)
 */
export function toLocalEndOfDayISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  // Create a date that is the end of the local day, then convert to ISO
  const localEnd = new Date(year, date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return localEnd.toISOString();
}

/**
 * Extracts account number from remarks or direct property
 */
export function extractAccountNumber(itemOrRemarks?: any): string | null {
  if (!itemOrRemarks) return null;
  if (typeof itemOrRemarks === 'object') {
    if (itemOrRemarks.accountNumber) return String(itemOrRemarks.accountNumber).trim();
    if (itemOrRemarks.remarks) itemOrRemarks = itemOrRemarks.remarks;
  }
  if (typeof itemOrRemarks === 'string') {
    const match = itemOrRemarks.match(/Account\s*No:\s*([^\s|]+)/i);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

/**
 * Masks an account number (e.g. 100045****89)
 */
export function maskAccountNumber(accNo?: string | null): string | null {
  if (!accNo) return null;
  const clean = accNo.trim();
  if (!clean) return null;
  if (clean.length <= 4) return '****';
  if (clean.length <= 8) return clean.slice(0, 2) + '****' + clean.slice(-2);
  return clean.slice(0, 6) + '****' + clean.slice(-2);
}

