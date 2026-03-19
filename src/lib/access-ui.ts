export type AccessGroupId =
  | "DASHBOARD"
  | "WORKFLOWS"
  | "MONITORING"
  | "INFRASTRUCTURE"
  | "REFERENCE"
  | "REPORTING"
  | "SYSTEM";

export const SIDEBAR_LABELS = {
  dashboard: "Dashboard",
  caseArchive: "Case Archive",
  documentVault: "KYC Document Vault",
  reference: "KYC F&Q Reference",
  personnelDirectory: "User Management",
  rolesPermissions: "Roles & Permissions",
  branchMapping: "Officer Branch Mapping",
  districtsBranches: "Districts & Branches",
  systemConfiguration: "System Configuration",
  securityAuditLog: "Security Audit Log",
  opsMonitoring: "Ops Monitoring",
  managementReporting: "Management Reporting",
  systemWideCompliance: "System-wide Compliance",
  followUp: "Follow-up",
  followUpReport: "Follow-up Report",
  masterCaseBundle: "Master Case Bundle",
} as const;

export const SYSTEM_SECTION_COPY = {
  USER_CREATE: {
    label: SIDEBAR_LABELS.personnelDirectory,
    description:
      "Create staff accounts and maintain their role, district, and branch assignments.",
  },
  ROLE_CREATE: {
    label: SIDEBAR_LABELS.rolesPermissions,
    description:
      "Define operational roles and choose the pages and actions they unlock.",
  },
  MAP_USERS_TO_BRANCH: {
    label: SIDEBAR_LABELS.branchMapping,
    description:
      "Map KYC review staff to the branches they are allowed to cover.",
  },
  MANAGE_BRANCHES: {
    label: SIDEBAR_LABELS.districtsBranches,
    description:
      "Create and maintain the district and branch structure used by the system.",
  },
  EDIT_SLA_POLICY: {
    label: SIDEBAR_LABELS.systemConfiguration,
    description:
      "Update workflow rules, classifications, queues, and shared system settings.",
  },
  VIEW_SYSTEM_AUDIT: {
    label: SIDEBAR_LABELS.securityAuditLog,
    description:
      "Review audit trails and sensitive administrative activity across the platform.",
  },
} as const;

export const ACCESS_GROUP_COPY: Record<
  AccessGroupId,
  { label: string; description: string }
> = {
  DASHBOARD: {
    label: SIDEBAR_LABELS.dashboard,
    description: "Landing pages and high-level command views.",
  },
  WORKFLOWS: {
    label: "KYC Operations",
    description: "Submission, review, escalation, and correction queues.",
  },
  MONITORING: {
    label: "Monitoring",
    description: "Operational visibility for branch and district teams.",
  },
  INFRASTRUCTURE: {
    label: "Infrastructure",
    description: "Document storage, archives, and bundle downloads.",
  },
  REFERENCE: {
    label: SIDEBAR_LABELS.reference,
    description: "Shared findings, questions, and reference materials.",
  },
  REPORTING: {
    label: "Audit & Reporting",
    description: "Performance, compliance, follow-up, and reporting tools.",
  },
  SYSTEM: {
    label: "Administration",
    description: "User access, roles, structure, and system controls.",
  },
};

export const ACCESS_CAPABILITY_CATALOG = [
  {
    slug: "DASHBOARD_VIEW",
    label: "Dashboard Overview",
    description: "Open the main dashboard landing page.",
    group: "DASHBOARD",
  },
  {
    slug: "DASHBOARD_VIEW_SYSTEM",
    label: "System Command Dashboard",
    description: "View institution-wide dashboard metrics and command insights.",
    group: "DASHBOARD",
  },
  {
    slug: "CASE_SUBMIT",
    label: "Create Submission",
    description: "Start and submit a new KYC case.",
    group: "WORKFLOWS",
  },
  {
    slug: "CASE_VIEW_OWN",
    label: "My Submissions",
    description: "Review cases created by the signed-in staff member.",
    group: "WORKFLOWS",
  },
  {
    slug: "KYC_VIEW_QUEUE",
    label: "Review & Action",
    description: "Open the specialist review queue and process pending cases.",
    group: "WORKFLOWS",
  },
  {
    slug: "VIEW_AMENDMENT_QUEUE",
    label: "Amendment Review",
    description: "Review amendment submissions returned for another pass.",
    group: "WORKFLOWS",
  },
  {
    slug: "CASE_VIEW_ACTION_REQUIRED",
    label: "Returned Cases",
    description: "See cases sent back for correction or resubmission.",
    group: "WORKFLOWS",
  },
  {
    slug: "VIEW_ESCALATED_CASES",
    label: "Escalated Cases",
    description: "Access cases escalated for urgent or higher-level review.",
    group: "WORKFLOWS",
  },
  {
    slug: "VIEW_GOVERNANCE_QUEUE",
    label: "Exceptional Cases",
    description: "View the exceptional or governance review queue.",
    group: "WORKFLOWS",
  },
  {
    slug: "TRIGGER_GOVERNANCE_FLOW",
    label: "Route to Exceptional Cases",
    description: "Send a case into the exceptional or governance flow.",
    group: "WORKFLOWS",
  },
  {
    slug: "CASE_VIEW_BRANCH",
    label: "Branch Monitoring",
    description: "Monitor case activity for a branch.",
    group: "MONITORING",
  },
  {
    slug: "DASHBOARD_VIEW_DISTRICT",
    label: "District Monitoring",
    description: "Monitor operational activity across a district.",
    group: "MONITORING",
  },
  {
    slug: "MANAGE_VAULT_STORAGE",
    label: SIDEBAR_LABELS.documentVault,
    description: "Manage files and storage inside the KYC document vault.",
    group: "INFRASTRUCTURE",
  },
  {
    slug: "VIEW_ARCHIVED_CASE",
    label: SIDEBAR_LABELS.caseArchive,
    description: "Open the archived case list and search historical cases.",
    group: "INFRASTRUCTURE",
  },
  {
    slug: "EXPORT_CASE_ZIP",
    label: "Case Bundle Downloads",
    description: "Download the full document bundle for a case.",
    group: "INFRASTRUCTURE",
  },
  {
    slug: "VIEW_FQ_LIBRARY",
    label: SIDEBAR_LABELS.reference,
    description: "Open the shared findings and questions reference library.",
    group: "REFERENCE",
  },
  {
    slug: "CREATE_FQ_ENTRY",
    label: "Manage F&Q Entries",
    description: "Create or update items in the F&Q reference library.",
    group: "REFERENCE",
  },
  {
    slug: "VIEW_SPECIALIST_PRODUCTIVITY",
    label: SIDEBAR_LABELS.opsMonitoring,
    description: "View specialist and operations performance monitoring.",
    group: "REPORTING",
  },
  {
    slug: "REPORT_VIEW_SYSTEM",
    label: "Management & Compliance Reports",
    description: "Access management reporting and system-wide compliance views.",
    group: "REPORTING",
  },
  {
    slug: "VIEW_AUDIT_POOL",
    label: SIDEBAR_LABELS.followUp,
    description: "Open the follow-up work pool and assign sampled cases.",
    group: "REPORTING",
  },
  {
    slug: "VIEW_AUDIT_LOGS",
    label: SIDEBAR_LABELS.followUpReport,
    description: "Review follow-up reporting and review outcomes.",
    group: "REPORTING",
  },
  {
    slug: "DOWNLOAD_MASTER_ARCHIVE",
    label: SIDEBAR_LABELS.masterCaseBundle,
    description: "Download the institution-wide case bundle archive.",
    group: "REPORTING",
  },
  {
    slug: "USER_CREATE",
    label: SYSTEM_SECTION_COPY.USER_CREATE.label,
    description: SYSTEM_SECTION_COPY.USER_CREATE.description,
    group: "SYSTEM",
  },
  {
    slug: "ROLE_CREATE",
    label: SYSTEM_SECTION_COPY.ROLE_CREATE.label,
    description: SYSTEM_SECTION_COPY.ROLE_CREATE.description,
    group: "SYSTEM",
  },
  {
    slug: "MAP_USERS_TO_BRANCH",
    label: SYSTEM_SECTION_COPY.MAP_USERS_TO_BRANCH.label,
    description: SYSTEM_SECTION_COPY.MAP_USERS_TO_BRANCH.description,
    group: "SYSTEM",
  },
  {
    slug: "MANAGE_BRANCHES",
    label: SYSTEM_SECTION_COPY.MANAGE_BRANCHES.label,
    description: SYSTEM_SECTION_COPY.MANAGE_BRANCHES.description,
    group: "SYSTEM",
  },
  {
    slug: "EDIT_SLA_POLICY",
    label: SYSTEM_SECTION_COPY.EDIT_SLA_POLICY.label,
    description: SYSTEM_SECTION_COPY.EDIT_SLA_POLICY.description,
    group: "SYSTEM",
  },
  {
    slug: "VIEW_SYSTEM_AUDIT",
    label: SYSTEM_SECTION_COPY.VIEW_SYSTEM_AUDIT.label,
    description: SYSTEM_SECTION_COPY.VIEW_SYSTEM_AUDIT.description,
    group: "SYSTEM",
  },
] as const;

export const ACCESS_CAPABILITY_COPY = Object.fromEntries(
  ACCESS_CAPABILITY_CATALOG.map((capability) => [capability.slug, capability])
) as Record<
  string,
  {
    slug: string;
    label: string;
    description: string;
    group: AccessGroupId;
  }
>;
