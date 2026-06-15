type PermissionRelation = {
  permission?: {
    slug?: string | null;
    name?: string | null;
    group?: string | null;
  } | null;
} | null;

type RoleShape = {
  name?: string | null;
  active?: boolean | null;
  permissions?: PermissionRelation[] | null;
};

type RoleRelation = {
  role?: RoleShape | null;
} | null;

export type AccessUserLike = {
  roles?: RoleRelation[] | null;
} | null | undefined;

type RouteRule = {
  matches: (pathname: string) => boolean;
  requireAnyPermission?: string[];
  requireAnyRole?: string[];
  requiredLabel: string;
};

type RouteAccessDecision = {
  allowed: boolean;
  redirectTo?: string;
};

// Permissions that indicate an officer-level user who should see their own performance page.
// Using permissions instead of role names so any custom role with these permissions works.
const MY_PERFORMANCE_PERMISSIONS = [
  "KYC_VIEW_QUEUE",
  "KYC_OFFICER_PROCESS",
  "SUPERVISOR_FORWARD",
];

const SYSTEM_ACCESS_PERMISSIONS = [
  "USER_CREATE",
  "ROLE_CREATE",
  "MAP_USERS_TO_BRANCH",
  "MANAGE_BRANCHES",
  "EDIT_SLA_POLICY",
  "VIEW_SYSTEM_AUDIT",
  "MANAGE_VAULT_STORAGE",
];

const REPORTING_ACCESS_PERMISSIONS = [
  "VIEW_SPECIALIST_PRODUCTIVITY",
  "REPORT_VIEW_SYSTEM",
  "VIEW_AUDIT_POOL",
  "VIEW_AUDIT_LOGS",
  "DOWNLOAD_MASTER_ARCHIVE",
  "CASE_VIEW_BRANCH",
  "DASHBOARD_VIEW_DISTRICT",
];

const PERFORMANCE_ACCESS_PERMISSIONS = [
  "VIEW_SPECIALIST_PRODUCTIVITY",
  "CASE_VIEW_BRANCH",
  "DASHBOARD_VIEW_DISTRICT",
  "REPORT_VIEW_SYSTEM",
];

const ROUTE_RULES: RouteRule[] = [
  {
    matches: (pathname) => pathname === "/",
    requireAnyPermission: [
      "DASHBOARD_VIEW",
      "DASHBOARD_VIEW_SYSTEM",
      "DASHBOARD_VIEW_BRANCH",
      "DASHBOARD_VIEW_DISTRICT",
    ],
    requiredLabel: "DASHBOARD_VIEW",
  },
  {
    matches: (pathname) => pathname === "/admin/password-reset" || pathname === "/admin/brd" || pathname === "/admin/rbac-blueprint",
    requireAnyRole: ["SUPER_ADMIN"],
    requiredLabel: "SUPER_ADMIN",
  },
  {
    matches: (pathname) => pathname === "/admin/users",
    requireAnyPermission: ["USER_CREATE"],
    requiredLabel: "USER_CREATE",
  },
  {
    matches: (pathname) => pathname === "/admin/roles",
    requireAnyPermission: ["ROLE_CREATE"],
    requiredLabel: "ROLE_CREATE",
  },
  {
    matches: (pathname) => pathname === "/admin/assignments",
    requireAnyPermission: ["MAP_USERS_TO_BRANCH"],
    requiredLabel: "MAP_USERS_TO_BRANCH",
  },
  {
    matches: (pathname) => pathname === "/admin/branches",
    requireAnyPermission: ["MANAGE_BRANCHES"],
    requiredLabel: "MANAGE_BRANCHES",
  },
  {
    matches: (pathname) => pathname === "/admin/settings",
    requireAnyPermission: ["EDIT_SLA_POLICY"],
    requiredLabel: "EDIT_SLA_POLICY",
  },
  {
    matches: (pathname) => pathname === "/admin/audit",
    requireAnyPermission: ["VIEW_SYSTEM_AUDIT"],
    requiredLabel: "VIEW_SYSTEM_AUDIT",
  },
  {
    matches: (pathname) => pathname === "/admin/storage",
    requireAnyPermission: ["MANAGE_VAULT_STORAGE"],
    requiredLabel: "MANAGE_VAULT_STORAGE",
  },
  {
    matches: (pathname) => pathname.startsWith("/admin"),
    requireAnyPermission: SYSTEM_ACCESS_PERMISSIONS,
    requiredLabel: "SYSTEM_ACCESS",
  },
  {
    matches: (pathname) => pathname === "/submissions/new",
    requireAnyPermission: ["CASE_SUBMIT"],
    requiredLabel: "CASE_SUBMIT",
  },
  {
    matches: (pathname) => pathname === "/submissions/my",
    requireAnyPermission: ["CASE_VIEW_OWN"],
    requiredLabel: "CASE_VIEW_OWN",
  },
  {
    matches: (pathname) => pathname === "/submissions/queue",
    requireAnyPermission: ["KYC_VIEW_QUEUE"],
    requiredLabel: "KYC_VIEW_QUEUE",
  },
  {
    matches: (pathname) => pathname === "/submissions/amendments",
    requireAnyPermission: ["VIEW_AMENDMENT_QUEUE"],
    requiredLabel: "VIEW_AMENDMENT_QUEUE",
  },
  {
    matches: (pathname) => pathname === "/submissions/amendment-requests",
    requireAnyPermission: ["CASE_VIEW_ACTION_REQUIRED"],
    requiredLabel: "CASE_VIEW_ACTION_REQUIRED",
  },
  {
    matches: (pathname) => pathname === "/submissions/escalated",
    requireAnyPermission: ["VIEW_ESCALATED_CASES"],
    requiredLabel: "VIEW_ESCALATED_CASES",
  },
  {
    matches: (pathname) => pathname === "/submissions/exceptional",
    requireAnyPermission: ["VIEW_GOVERNANCE_QUEUE"],
    requiredLabel: "VIEW_GOVERNANCE_QUEUE",
  },
  {
    matches: (pathname) => pathname === "/submissions/branch-node",
    requireAnyPermission: ["CASE_VIEW_BRANCH"],
    requiredLabel: "CASE_VIEW_BRANCH",
  },
  {
    matches: (pathname) => pathname === "/submissions/district-node",
    requireAnyPermission: ["DASHBOARD_VIEW_DISTRICT"],
    requiredLabel: "DASHBOARD_VIEW_DISTRICT",
  },
  {
    matches: (pathname) => pathname === "/submissions/master-bundle",
    requireAnyPermission: ["DOWNLOAD_MASTER_ARCHIVE"],
    requiredLabel: "DOWNLOAD_MASTER_ARCHIVE",
  },
  {
    matches: (pathname) => pathname === "/submissions/my-performance",
    requireAnyPermission: MY_PERFORMANCE_PERMISSIONS,
    requiredLabel: "KYC_REVIEW_ROLE",
  },
  {
    matches: (pathname) => pathname === "/submissions",
    requireAnyPermission: ["VIEW_ARCHIVED_CASE"],
    requiredLabel: "VIEW_ARCHIVED_CASE",
  },
  {
    matches: (pathname) => pathname === "/kyc-fq-reference",
    requireAnyPermission: ["VIEW_FQ_LIBRARY"],
    requiredLabel: "VIEW_FQ_LIBRARY",
  },
  {
    matches: (pathname) => pathname === "/performance/officer" || pathname === "/reports/officer",
    requireAnyPermission: ["VIEW_SPECIALIST_PRODUCTIVITY"],
    requiredLabel: "VIEW_SPECIALIST_PRODUCTIVITY",
  },
  {
    matches: (pathname) => pathname === "/performance/branch" || pathname === "/reports/branch",
    requireAnyPermission: ["CASE_VIEW_BRANCH", "DASHBOARD_VIEW_DISTRICT", "REPORT_VIEW_SYSTEM"],
    requiredLabel: "CASE_VIEW_BRANCH",
  },
  {
    matches: (pathname) => pathname === "/performance/district",
    requireAnyPermission: ["DASHBOARD_VIEW_DISTRICT", "REPORT_VIEW_SYSTEM"],
    requiredLabel: "DASHBOARD_VIEW_DISTRICT",
  },
  {
    matches: (pathname) => pathname.startsWith("/performance"),
    requireAnyPermission: PERFORMANCE_ACCESS_PERMISSIONS,
    requiredLabel: "PERFORMANCE_ACCESS",
  },
  {
    matches: (pathname) => pathname === "/reports/management" || pathname === "/reports/system",
    requireAnyPermission: ["REPORT_VIEW_SYSTEM"],
    requiredLabel: "REPORT_VIEW_SYSTEM",
  },
  {
    matches: (pathname) => pathname === "/reports/follow-up",
    requireAnyPermission: ["VIEW_AUDIT_LOGS"],
    requiredLabel: "VIEW_AUDIT_LOGS",
  },
  {
    matches: (pathname) => pathname.startsWith("/head-office/follow-up"),
    requireAnyPermission: ["VIEW_AUDIT_POOL"],
    requiredLabel: "VIEW_AUDIT_POOL",
  },
  {
    matches: (pathname) => pathname.startsWith("/reports") || pathname.startsWith("/performance"),
    requireAnyPermission: [...REPORTING_ACCESS_PERMISSIONS, ...PERFORMANCE_ACCESS_PERMISSIONS],
    requiredLabel: "REPORTING_ACCESS",
  },
  {
    matches: (pathname) => pathname.startsWith("/api/data/users") || 
                         pathname.startsWith("/api/data/roles") ||
                         pathname.startsWith("/api/data/permissions") ||
                         pathname.startsWith("/api/data/branches") ||
                         pathname.startsWith("/api/data/audit_logs") ||
                         pathname.startsWith("/api/data/settings"),
    requireAnyRole: ["SUPER_ADMIN"],
    requiredLabel: "ADMIN_ACCESS",
  },
  {
    matches: (pathname) => pathname.startsWith("/api/data/submissions"),
    requireAnyPermission: ["CASE_VIEW_OWN", "CASE_VIEW_BRANCH", "KYC_VIEW_QUEUE"],
    requiredLabel: "CASE_ACCESS",
  },
];

function normalizeRoleName(roleName?: string | null) {
  return roleName?.trim().toUpperCase() || "";
}

export function normalizePermissionSlug(slug?: string | null) {
  return slug?.trim().toUpperCase() || "";
}

export function getActiveRoleNames(user: AccessUserLike) {
  return (user?.roles || [])
    .map((relation) => relation?.role)
    .filter((role): role is RoleShape => Boolean(role?.name) && role?.active !== false)
    .map((role) => normalizeRoleName(role.name));
}

export function getPrimaryRoleName(user: AccessUserLike) {
  const activeRoles = getActiveRoleNames(user);
  return activeRoles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : (activeRoles[0] || null);
}

export function getPrimaryRoleDisplayName(user: AccessUserLike) {
  return getPrimaryRoleName(user)?.replace(/_/g, " ") || "UNASSIGNED";
}

export function hasDefinedRole(user: AccessUserLike) {
  return getActiveRoleNames(user).length > 0;
}

export function isSuperAdminUser(user: AccessUserLike) {
  return getActiveRoleNames(user).includes("SUPER_ADMIN");
}

export function getPermissionSlugs(user: AccessUserLike) {
  const slugs = new Set<string>();

  for (const relation of user?.roles || []) {
    const role = relation?.role;
    if (!role?.name || role.active === false) continue;

    for (const permissionRelation of role.permissions || []) {
      const slug = normalizePermissionSlug(permissionRelation?.permission?.slug);
      if (slug) {
        slugs.add(slug);
      }
    }
  }

  return slugs;
}

export function hasPermission(user: AccessUserLike, permission: string) {
  if (isSuperAdminUser(user)) return true;
  const slugs = getPermissionSlugs(user);
  return slugs.has(normalizePermissionSlug(permission));
}

function buildUnauthorizedPath(params: { required?: string; reason?: string }) {
  const query = new URLSearchParams();

  if (params.required) {
    query.set("required", params.required);
  }

  if (params.reason) {
    query.set("reason", params.reason);
  }

  const suffix = query.toString();
  return suffix ? `/unauthorized?${suffix}` : "/unauthorized";
}

export function getRouteAccessDecision(user: AccessUserLike, pathname: string): RouteAccessDecision {
  if (!user) {
    return { allowed: false, redirectTo: "/login" };
  }

  if (!hasDefinedRole(user)) {
    return {
      allowed: false,
      redirectTo: buildUnauthorizedPath({ reason: "ROLE_UNASSIGNED" }),
    };
  }

  if (isSuperAdminUser(user)) {
    return { allowed: true };
  }

  const rule = ROUTE_RULES.find((candidate) => candidate.matches(pathname));
  if (!rule) {
    return { allowed: true };
  }

  const activeRoles = new Set(getActiveRoleNames(user));
  if (rule.requireAnyRole?.some((role) => activeRoles.has(role))) {
    return { allowed: true };
  }

  const permissionSlugs = getPermissionSlugs(user);
  if (rule.requireAnyPermission?.some((permission) => permissionSlugs.has(permission))) {
    return { allowed: true };
  }

  return {
    allowed: false,
    redirectTo: buildUnauthorizedPath({ required: rule.requiredLabel }),
  };
}
