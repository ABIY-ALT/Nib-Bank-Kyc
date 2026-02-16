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
  documents?: Document[]; // Optional as they are in subcollection
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
  verifiedAt: string;
  result?: 'Correct' | 'Discrepancy';
  remarks?: string;
  status: 'Pending' | 'Completed';
  assignedTo?: string;
  assignedToName?: string;
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

const subDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result.toISOString();
};

export const MOCK_SUBMISSIONS: Partial<KYCSubmission>[] = [
  { id: "DT-KYC-1001", customerName: "Abinet Tadesse", branch: "Downtown", district: "Central", submittedBy: "John Doe", submittedAt: subDays(new Date(), 2), status: "Approved", entityType: "individual" },
  { id: "DT-KYC-1002", customerName: "Selamawit Bekele", branch: "Downtown", district: "Central", submittedBy: "John Doe", submittedAt: subDays(new Date(), 1), status: "Pending", entityType: "individual" },
  { id: "UT-KYC-2001", customerName: "Global Trade PLC", branch: "Uptown", district: "Central", submittedBy: "Sarah Jenkins", submittedAt: subDays(new Date(), 5), status: "Approved", entityType: "company" },
  { id: "UT-KYC-2002", customerName: "Yared Solomon", branch: "Uptown", district: "Central", submittedBy: "Sarah Jenkins", submittedAt: subDays(new Date(), 3), status: "Amended", entityType: "individual", amendmentCycles: 1 },
  { id: "ES-KYC-3001", customerName: "East Logistics", branch: "East Side", district: "Central", submittedBy: "Robert Brown", submittedAt: subDays(new Date(), 7), status: "Approved", entityType: "company" },
  { id: "NB-KYC-4001", customerName: "Mekelle Textile", branch: "Northern Branch", district: "Northern", submittedBy: "Abeba Haile", submittedAt: subDays(new Date(), 10), status: "Approved", entityType: "company" },
  { id: "NB-KYC-4002", customerName: "Tewodros Kassahun", branch: "Northern Branch", district: "Northern", submittedBy: "Abeba Haile", submittedAt: subDays(new Date(), 4), status: "Escalated", entityType: "individual" },
  { id: "SH-KYC-5001", customerName: "Hawassa Agro", branch: "Southern Hub", district: "Southern", submittedBy: "Samuel Desta", submittedAt: subDays(new Date(), 12), status: "Approved", entityType: "association" },
  { id: "SH-KYC-5002", customerName: "Genet Maru", branch: "Southern Hub", district: "Southern", submittedBy: "Samuel Desta", submittedAt: subDays(new Date(), 8), status: "Rejected", entityType: "individual" },
  { id: "DT-KYC-1003", customerName: "Bereket Zewdie", branch: "Downtown", district: "Central", submittedBy: "John Doe", submittedAt: subDays(new Date(), 15), status: "Approved", entityType: "individual" },
  { id: "UT-KYC-2003", customerName: "Vision NGO", branch: "Uptown", district: "Central", submittedBy: "Sarah Jenkins", submittedAt: subDays(new Date(), 20), status: "Approved", entityType: "foreign_ngo", isExceptional: true, exceptionalStatus: "Completed" },
  { id: "ES-KYC-3002", customerName: "Zemedkun Ayalew", branch: "East Side", district: "Central", submittedBy: "Robert Brown", submittedAt: subDays(new Date(), 25), status: "Approved", entityType: "individual" },
  { id: "NB-KYC-4003", customerName: "Northern Stars Assoc.", branch: "Northern Branch", district: "Northern", submittedBy: "Abeba Haile", submittedAt: subDays(new Date(), 18), status: "Pending", entityType: "association" },
  { id: "SH-KYC-5003", customerName: "Lake Side Resort", branch: "Southern Hub", district: "Southern", submittedBy: "Samuel Desta", submittedAt: subDays(new Date(), 22), status: "Approved", entityType: "company" },
  { id: "DT-KYC-1004", customerName: "Tech Hub Ethiopia", branch: "Downtown", district: "Central", submittedBy: "John Doe", submittedAt: subDays(new Date(), 2), status: "Amended", entityType: "company", amendmentCycles: 2 },
  { id: "UT-KYC-2004", customerName: "Martha Giday", branch: "Uptown", district: "Central", submittedBy: "Sarah Jenkins", submittedAt: subDays(new Date(), 1), status: "Pending", entityType: "individual" },
  { id: "ES-KYC-3003", customerName: "Express Delivery", branch: "East Side", district: "Central", submittedBy: "Robert Brown", submittedAt: subDays(new Date(), 6), status: "Approved", entityType: "company" },
  { id: "NB-KYC-4004", customerName: "Gonder Heritage", branch: "Northern Branch", district: "Northern", submittedBy: "Abeba Haile", submittedAt: subDays(new Date(), 9), status: "Approved", entityType: "association" },
  { id: "SH-KYC-5004", customerName: "Southern Seeds", branch: "Southern Hub", district: "Southern", submittedBy: "Samuel Desta", submittedAt: subDays(new Date(), 11), status: "Amended", entityType: "company" },
  { id: "DT-KYC-1005", customerName: "Soliana Abera", branch: "Downtown", district: "Central", submittedBy: "John Doe", submittedAt: subDays(new Date(), 4), status: "Pending", entityType: "individual" }
];
