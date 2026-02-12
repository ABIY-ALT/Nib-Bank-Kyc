
export type SubmissionStatus = 
  | 'Pending' 
  | 'In Review' 
  | 'Amended' 
  | 'Approved' 
  | 'Escalated' 
  | 'Rejected';

export type ExceptionalStatus = 
  | 'None'
  | 'Awaiting District'
  | 'Awaiting Director'
  | 'Awaiting Chief'
  | 'Awaiting Division'
  | 'Awaiting Supervisor'
  | 'Completed'
  | 'Rejected'
  | 'Clarification Required';

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

export interface Document {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  status: 'Current' | 'Replaced';
  url: string;
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
  documents: Document[];
  auditLogs: AuditLog[];
  remarks?: string;
  isResubmitted?: boolean;
  resubmittedAt?: string;
  entityType?: string;
  amendmentCycles?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  checklistState?: Record<string, boolean>;
}

export interface KYCFinding {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'Identity' | 'Documentation' | 'Compliance' | 'Account Validation';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  applicableTo: string[];
  createdAt: string;
  active: boolean;
  source: 'manual' | 'auto';
}

export const MOCK_SUBMISSIONS: KYCSubmission[] = [];
