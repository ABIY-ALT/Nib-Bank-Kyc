export type SubmissionStatus = 
  | 'Pending' 
  | 'In Review' 
  | 'Amended' 
  | 'Approved' 
  | 'Escalated' 
  | 'Rejected';

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
  customerId: string;
  customerName: string;
  branch: string;
  submittedBy: string;
  submittedAt: string;
  status: SubmissionStatus;
  documents: Document[];
  auditLogs: AuditLog[];
  remarks?: string;
}

export const MOCK_SUBMISSIONS: KYCSubmission[] = [
  {
    id: 'KYC-1001',
    customerId: 'CUST-8822',
    customerName: 'Acme Corp',
    branch: 'Downtown',
    submittedBy: 'John Doe',
    submittedAt: '2024-03-20T10:00:00Z',
    status: 'Pending',
    documents: [
      { id: 'd1', name: 'Certificate of Incorporation', type: 'PDF', uploadedAt: '2024-03-20T10:00:00Z', status: 'Current', url: '#' },
      { id: 'd2', name: 'Tax IDs', type: 'JPG', uploadedAt: '2024-03-20T10:00:00Z', status: 'Current', url: '#' }
    ],
    auditLogs: [
      { id: 'a1', action: 'Created Submission', performedBy: 'John Doe', performedAt: '2024-03-20T10:00:00Z', details: 'Initial KYC submission created.' }
    ]
  },
  {
    id: 'KYC-1002',
    customerId: 'CUST-5511',
    customerName: 'Globex Inc',
    branch: 'Uptown',
    submittedBy: 'Sarah Connor',
    submittedAt: '2024-03-19T14:30:00Z',
    status: 'Amended',
    documents: [
      { id: 'd3', name: 'Utility Bill', type: 'PDF', uploadedAt: '2024-03-19T14:30:00Z', status: 'Current', url: '#' }
    ],
    auditLogs: [
      { id: 'a2', action: 'Requested Amendment', performedBy: 'Jane Smith', performedAt: '2024-03-19T16:00:00Z', details: 'Utility bill is older than 3 months.' }
    ],
    remarks: 'Utility bill needs updating.'
  },
  {
    id: 'KYC-1003',
    customerId: 'CUST-1199',
    customerName: 'Wayne Enterprises',
    branch: 'Downtown',
    submittedBy: 'John Doe',
    submittedAt: '2024-03-18T09:15:00Z',
    status: 'Approved',
    documents: [
      { id: 'd4', name: 'Board Resolution', type: 'PDF', uploadedAt: '2024-03-18T09:15:00Z', status: 'Current', url: '#' }
    ],
    auditLogs: [
      { id: 'a3', action: 'Approved', performedBy: 'Robert Brown', performedAt: '2024-03-18T11:45:00Z', details: 'KYC verified successfully.' }
    ]
  }
];