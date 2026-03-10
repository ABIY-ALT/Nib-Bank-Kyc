/**
 * @fileOverview Institutional Status Registry.
 * Centralized string constants to ensure absolute compatibility across 
 * SQL databases and UI layers.
 */

export const KYC_STATUS = {
  SUBMITTED: 'SUBMITTED',
  IN_REVIEW: 'IN_REVIEW',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED'
} as const;

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED'
} as const;

export const EXCEPTIONAL_STATUS = {
  NONE: 'None',
  AWAITING_DISTRICT: 'AWAITING_DISTRICT',
  AWAITING_DIRECTOR: 'AWAITING_DIRECTOR',
  AWAITING_CHIEF: 'AWAITING_CHIEF',
  AWAITING_DIVISION: 'AWAITING_DIVISION',
  AWAITING_SUPERVISOR: 'AWAITING_SUPERVISOR',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CLARIFICATION_REQUIRED: 'CLARIFICATION_REQUIRED'
} as const;

export type SubmissionStatus = keyof typeof KYC_STATUS;
export type ExceptionalStatus = keyof typeof EXCEPTIONAL_STATUS;

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
