
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
  | 'Awaiting Supervisor'
  | 'Completed'
  | 'Rejected'
  | 'Clarification Required';

export interface ExceptionalApproval {
  role: string;
  action: 'Approved' | 'Rejected' | 'Clarification';
  performedBy: string;
  timestamp: string;
  remarks: string;
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
}

export const MOCK_SUBMISSIONS: KYCSubmission[] = [];
