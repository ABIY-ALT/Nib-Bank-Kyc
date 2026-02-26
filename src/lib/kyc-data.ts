export type SubmissionStatus = 
  | 'PENDING' 
  | 'IN_REVIEW' 
  | 'AMENDED' 
  | 'APPROVED' 
  | 'ESCALATED' 
  | 'REJECTED';

export type ExceptionalStatus = 
  | 'NONE'
  | 'AWAITING_DISTRICT'
  | 'AWAITING_DIRECTOR'
  | 'AWAITING_CHIEF'
  | 'AWAITING_DIVISION'
  | 'AWAITING_SUPERVISOR'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CLARIFICATION_REQUIRED';

export interface ExceptionalApproval {
  role: string;
  action: 'Approved' | 'Rejected' | 'Clarification' | 'Forwarded to Chief' | 'Returned to Director';
  performedBy: string;
  timestamp: string;
  remarks: string;
  memoAttached?: boolean;
}

export interface ExceptionalData {
  reason: 'Missing Documents' | 'High Deposit Amount' | 'High-Risk Profile' | 'Case Aging beyond SLA';
  justification: string;
  memoUrl: string;
  initiatedBy: string;
  initiatedAt: string;
  approvalHistory: ExceptionalApproval[];
}

export interface CommentHistoryEntry {
  role: string;
  performedBy: string;
  timestamp: string;
  comment: string;
  action: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  status: 'Current' | 'Replaced';
  url: string;
}

export interface BundleDownloadLog {
  id: string;
  performedBy: string;
  timestamp: string;
  bundleName: string;
  sourceDistrict: string;
  sourceBranch: string;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  performedAt: string;
  details: string;
}

export interface KYCSubmission {
  id: string;
  customerId?: string;
  customerName: string;
  branch: string;
  district: string;
  submittedBy: string;
  submittedAt: string;
  status: SubmissionStatus;
  isExceptional?: boolean;
  exceptionalStatus?: ExceptionalStatus;
  exceptionalData?: ExceptionalData;
  commentHistory?: CommentHistoryEntry[];
  documents?: Document[];
  remarks?: string;
  isResubmitted?: boolean;
  resubmittedAt?: string;
  entityType?: string;
  amendmentCycles?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  checklistState?: Record<string, boolean>;
}

export interface FollowUpVerification {
  id: string;
  submissionId: string;
  customerName: string;
  branch: string;
  officer: string;
  accountType: string;
  verifiedBy?: string;
  verifiedAt?: string;
  result?: 'Correct' | 'Discrepancy';
  remarks?: string;
  status: 'PENDING' | 'COMPLETED';
  assignedTo?: string;
  assignedToName?: string;
}

export interface KYCFinding {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'IDENTITY' | 'DOCUMENTATION' | 'COMPLIANCE' | 'ACCOUNT_VALIDATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  applicableTo: string[];
  createdAt: string;
  active: boolean;
  source: 'manual' | 'auto';
}

export const AMENDMENT_SCENARIOS = [
  "1. Duplicate CID found on NIB search",
  "2. Amend Customer/Mother Name on T24",
  "3. Mother Name not found on opening form",
  "4. ID alteration on Date-Name mismatch",
  "5. Account not found on unauthorized list or account number incorrect",
  "6. Photo not clear / attach recent photo",
  "7. Attach all fully visible files",
  "8. Full information not filled on opening form or T24",
  "9. Use the correct customer name on account or CID",
  "10. Office use section not checked, filled, or signed",
  "11. CID not authorized",
  "12. Approved account file",
  "13. Under age",
  "14. Incorrect national ID number or attach national ID",
  "15. Found on suspicious/delinquent list",
  "16. Mnemonic or mobile phone alteration or not correct on T24",
  "17. Amend CID for authorization (restricted accounts or authorized accounts)",
  "18. MOA, POA, AOA, or National ID not authenticated",
  "19. Other (specify)"
];

/**
 * INSTITUTIONAL DATA POLICY: No mock submissions are permitted in production.
 * Real data is synchronized strictly from the primary Institutional Vault.
 */
export const MOCK_SUBMISSIONS: Partial<KYCSubmission>[] = [];
