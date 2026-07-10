
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken, generateSecureString } from '@/lib/security';
import { getServerSession } from './auth-server';
import { normalizePermissionSlug } from '@/lib/access-control';
import { SubmissionSchema } from '@/lib/validation';
import { KYC_STATUS, EXCEPTIONAL_STATUS } from '@/lib/kyc-data';
import { createAuditLog } from './audit';
import { logInstitutionalError } from '@/lib/logger';
import {
  validateFileCount,
  validateTotalUploadSize,
} from '@/lib/file-upload-validation';
import { resolvePreviewMimeType } from '@/lib/documents';
import { performCompleteFileValidation } from '@/lib/file-upload-security-integration';
import { writeSecureUploadedFile } from '@/lib/secure-file-storage';
import { getExceptionalWorkflowStage, getExceptionalWorkflowAction, getActionsForCase } from '@/lib/exceptional-workflow';
import { format, startOfMonth, endOfMonth, subDays, eachMonthOfInterval } from 'date-fns';
import { EXCEPTIONAL_RESTORE_SENTINEL } from '@/lib/kyc-data';

import { 
  normalizeAssignedBranches, 
  normalizeBranchName,
  getResolvedUserBranchName, 
  getResolvedUserDistrictName, 
  getNormalizedRole,
  hasJurisdictionalAccess,
  isSaturdayNow,
  isLateHourNow,
  isLunchBreakNow,
  DISTRICT_DIRECTOR_ROLE,
  GLOBAL_SCOPE_PERMISSIONS,
  PORTFOLIO_SCOPE_PERMISSIONS,
  BRANCH_SCOPE_PERMISSIONS
} from '@/lib/jurisdiction';


// Permission slugs that indicate a user is authorized to perform KYC review/action.
// Used to filter the "running" (IN_REVIEW) count so it only includes cases actively
// being worked on by a permissioned reviewer, not orphaned IN_REVIEW records.
const REVIEW_ACTION_PERMISSIONS = ['KYC_VIEW_QUEUE', 'KYC_OFFICER_PROCESS', 'SUPERVISOR_FORWARD'];

// A case only counts as actively "In Review" when it is assigned to a user who
// holds the "Access Review & Action" permission (KYC_VIEW_QUEUE) — and ONLY that.
// Super Admins are explicitly excluded by role name, because the SUPER_ADMIN role
// carries every permission slug (so a permission-only check would wrongly match
// them). Reuse this everywhere the In Review figure is shown so the dashboard,
// reports and metrics stay consistent.
const REVIEW_AND_ACTION_PERMISSION = 'KYC_VIEW_QUEUE';

const ACTIVE_REVIEW_ASSIGNEE_FILTER: any = {
  assignedToId: { not: null },
  assignedTo: {
    roles: {
      some: {
        role: {
          active: true,
          permissions: { some: { permission: { slug: REVIEW_AND_ACTION_PERMISSION } } },
        },
      },
      none: { role: { name: 'SUPER_ADMIN' } },
    },
  },
};

/**
 * Converts raw file-validation error strings into user-friendly messages.
 * Keeps all technical detail server-side (audit logs); only safe descriptions reach the client.
 */
function toFriendlyUploadError(rawError?: string): string {
  if (!rawError) return 'The file could not be uploaded. Please try again.';
  const e = rawError.toLowerCase();

  if (e.includes('extension not allowed') || e.includes('mime type not allowed') || e.includes('not recognized or not allowed')) {
    return 'This file type is not supported. Please upload a PDF, JPG, PNG, or TIFF file and try again.';
  }
  if (e.includes('double extension')) {
    return 'The filename appears to have multiple extensions. Please rename the file (e.g. "document.pdf") and try again.';
  }
  if (e.includes('size exceeds') || e.includes('too large') || e.includes('too big')) {
    const match = rawError.match(/(\d+(\.\d+)?\s*MB)/i);
    return match
      ? `The file is too large. The maximum allowed size is ${match[1]}.`
      : 'The file is too large. Please reduce its size and try again.';
  }
  if (e.includes('empty')) {
    return 'The file appears to be empty. Please check the file and try again.';
  }
  if (e.includes('dimension') || e.includes('5000px')) {
    return 'This image is too large (maximum 5,000 × 5,000 pixels). Please resize it and try again.';
  }
  if (
    e.includes('security check failed') ||
    e.includes('security risk') ||
    e.includes('threat') ||
    e.includes('executable') ||
    e.includes('script') ||
    e.includes('malicious') ||
    e.includes('quarantine')
  ) {
    return 'This file cannot be uploaded because it failed a security check. Please use a valid document (PDF, JPG, PNG, or TIFF) and try again. If you believe this is a mistake, contact your administrator.';
  }
  if (e.includes('corrupted') || e.includes('not a valid')) {
    return 'This file appears to be corrupted or invalid. Please try a different file.';
  }
  return 'The file could not be uploaded. Please check that it is a valid document and try again.';
}

/**
 * Maps raw thrown error messages from workflow actions into clear, user-friendly
 * text. Keeps technical/internal details out of the client (those stay in audit
 * logs); short, already-friendly validation messages pass through unchanged.
 */
function toFriendlyActionError(rawError?: string): string {
  const raw = String(rawError || '');
  if (/unauthor|permission|access denied|\bdenied\b/i.test(raw)) {
    return 'You are not authorized to perform this action on this case.';
  }
  if (/session|unauthenticated|log ?in/i.test(raw)) {
    return 'Your session has expired. Please sign in again.';
  }
  if (/not found/i.test(raw)) {
    return 'This case could not be found. It may have been moved or removed.';
  }
  if (/memo/i.test(raw)) {
    return 'A valid PDF memo attachment is required for this action.';
  }
  if (/workflow|stage|invalid.*action/i.test(raw)) {
    return "This action isn't available for the case's current stage. Please refresh and try again.";
  }
  // Already-friendly, short validation messages (remarks/officer/etc.) pass through.
  if (raw.length > 0 && raw.length < 160 && !/prisma|database|fault|stack|\bat\b.*\(/i.test(raw)) {
    return raw;
  }
  return "We couldn't complete this action. Please try again.";
}

function hasPermission(user: any, slug: string) {
  const normalized = normalizePermissionSlug(slug);
  return Boolean(
    user?.roles?.some((userRole: any) =>
      userRole?.role?.active !== false &&
      userRole?.role?.permissions?.some((rolePermission: any) => 
        normalizePermissionSlug(rolePermission?.permission?.slug) === normalized
      )
    )
  );
}

async function hasFollowUpCaseAccess(user: any, submissionId: string) {
  const canAccessFollowUpCases = hasPermission(user, 'VIEW_AUDIT_POOL') || hasPermission(user, 'VIEW_AUDIT_LOGS');
  if (!canAccessFollowUpCases) return false;

  const followUpRecord = await prisma.followUpVerification.findFirst({
    where: { submissionId },
    select: { id: true }
  });

  return Boolean(followUpRecord);
}


function formatKYC(kyc: any) {
  const memoList = Array.isArray(kyc.memos) ? kyc.memos : [];
  const archivedDocCount = memoList.filter((m: any) => m.storageTier === 'ARCHIVE').length;
  const deletedDocCount = memoList.filter((m: any) => !!m.archiveDeletedAt).length;
  // A case is "deleted" (soft) when it has documents and ALL of them have had
  // their archive bytes freed — it lives only in the Deleted bin until restored.
  const isDeleted = memoList.length > 0 && deletedDocCount === memoList.length;
  // A case counts as archived only when it has documents and ALL of them are on
  // the archive tier (a cut moves every document of a case together) AND it has
  // not been soft-deleted (deleted cases show only in the Deleted bin).
  const isArchived = memoList.length > 0 && archivedDocCount === memoList.length && !isDeleted;

  return {
    ...kyc,
    isArchived,
    isDeleted,
    archivedDocCount,
    deletedDocCount,
    totalDocCount: memoList.length,
    checklistState: kyc.checklistState || {},
    commentHistory: Array.isArray(kyc.commentHistory) ? kyc.commentHistory : [],
    documents:
      kyc.memos?.map((m: any) => {
        const tokenPath = `/api/memos/${signDownloadToken(m.id)}`;
        return {
          id: m.id,
          name: m.name,
          originalName: m.originalName,
          type: m.type,
          previewUrl: tokenPath,
          downloadUrl: `${tokenPath}?download=1`,
          mimeType: resolvePreviewMimeType(m.mimeType, m.originalName, m.name),
          size: m.size,
        };
      }) || [],
  };
}

/**
 * Reusable helper to build jurisdictional filters for submissions and counts.
 * Centralizes security logic to prevent data leaks between branches/districts.
 */
async function buildJurisdictionalFilter(session: any, requestedDistrict?: string, requestedBranches: string[] = []) {
  if (session.role === 'SUPER_ADMIN') {
    let filter: any = {};
    // Case-insensitive on both branches, matching the non-admin path below —
    // otherwise a dashboard card (case-insensitive count) and the Case Archive
    // it links to (also case-insensitive) could silently disagree with a
    // third caller that happened to pass slightly different casing.
    if (requestedDistrict) filter.districtName = { equals: requestedDistrict, mode: 'insensitive' };
    if (requestedBranches.length > 0) {
      filter.branchName = requestedBranches.length === 1
        ? { equals: normalizeBranchName(requestedBranches[0]), mode: 'insensitive' }
        : { in: requestedBranches.map((branch) => normalizeBranchName(branch)), mode: 'insensitive' };
    }
    return filter;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: { 
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true
                }
              }
            }
          }
        }
      },
      branch: { include: { district: true } } 
    }
  });
  
  if (!user) return null;

  const userPermissions = user.roles.flatMap((ur: any) => 
    ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
  );

  const roleNames = user.roles.map((ur: any) => ur.role?.name).filter(Boolean);
  const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') ||
    userPermissions.includes('DASHBOARD_VIEW_DISTRICT') ||
    roleNames.includes(DISTRICT_DIRECTOR_ROLE);
  const assignedBranches = normalizeAssignedBranches(user.assignedBranches);
  const branchName = getResolvedUserBranchName(user);
  const districtName = getResolvedUserDistrictName(user);
  const userBranchId = user.branchId;

  const isPortfolioStaff = userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p));
  const isBranchScopeStaff = userPermissions.some(p => BRANCH_SCOPE_PERMISSIONS.has(p));
  const normalizedAssigned = assignedBranches.map((branch) => normalizeBranchName(branch)).filter(Boolean);

  // Helper to build explicit request filters for users with global or network-wide access
  const buildExplicitFilters = () => {
    let filter: any = {};
    if (requestedDistrict) filter.districtName = { equals: requestedDistrict, mode: 'insensitive' };
    if (requestedBranches.length > 0) {
      const normalizedRequested = requestedBranches.map((b) => normalizeBranchName(b));
      filter.branchName = normalizedRequested.length === 1
        ? { equals: normalizedRequested[0], mode: 'insensitive' }
        : { in: normalizedRequested, mode: 'insensitive' };
    }
    return filter;
  };

  // Time-based Configuration: this officer sees cases from all branches based on schedule,
  // independent of their normal branch mappings.
  if ((user as any).saturdayAllBranches && isSaturdayNow()) return buildExplicitFilters();
  if ((user as any).lateHourAllBranches && isLateHourNow()) return buildExplicitFilters();
  if ((user as any).lunchBreakAllBranches && isLunchBreakNow()) return buildExplicitFilters();

  const isBranchLevelStaff = branchName && 
    isBranchScopeStaff && 
    !isPortfolioStaff && 
    (normalizedAssigned.length === 0 || normalizedAssigned.length === 1);

  if (!isDistrictAdmin && !isBranchLevelStaff && userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
    return buildExplicitFilters(); // Global executives can view entire network but should still be able to filter
  }

  let filter: any = {};

  if (isDistrictAdmin && districtName) {
    filter.districtName = { equals: districtName, mode: 'insensitive' };
    if (requestedBranches.length > 0) {
      const normalizedRequested = requestedBranches.map((b) => normalizeBranchName(b));
      filter.branchName = normalizedRequested.length === 1
        ? { equals: normalizedRequested[0], mode: 'insensitive' }
        : { in: normalizedRequested, mode: 'insensitive' };
    }
  } else if (normalizedAssigned.length > 0) {
    const normalizedRequested = requestedBranches.map((branch) => normalizeBranchName(branch).toLowerCase());
    const visibleBranches = requestedBranches.length > 0
      ? normalizedAssigned.filter((branch) => normalizedRequested.includes(branch.toLowerCase()))
      : normalizedAssigned;
    
    if (visibleBranches.length === 0) return null;
    
    filter.branchName = visibleBranches.length === 1
      ? { equals: normalizeBranchName(visibleBranches[0]), mode: 'insensitive' }
      : { in: visibleBranches.map(b => normalizeBranchName(b)), mode: 'insensitive' };
  } else if (userBranchId || branchName) {
    if (userBranchId) {
      filter.branchId = userBranchId;
    } else {
      filter.branchName = { equals: normalizeBranchName(branchName!), mode: 'insensitive' };
    }
  } else {
    return null;
  }

  return filter;
}

export async function getSubmissions(filters?: {
  status?: string[],
  district?: string,
  branch?: string,
  branches?: string[],
  branchId?: string,
  submittedBy?: string,
  createdById?: string,
  assignedToId?: string,
  isResubmitted?: boolean,
  isExceptional?: boolean,
  activeReviewersOnly?: boolean,
  entityType?: string,
  startDate?: string,
  endDate?: string,
  limit?: number,
  offset?: number,
  // Server-side search across the WHOLE dataset (case id, customer, branch,
  // district). With limit/offset pagination a client-side search can only ever
  // match rows on the currently loaded page — a case sitting on the last page
  // would be unfindable.
  search?: string,
  // Server-side ordering: with limit/offset pagination the DB must order the
  // FULL result set before slicing the page — client-side sorting can only ever
  // rearrange the rows of the currently visible page.
  sortField?: 'id' | 'customer' | 'branch' | 'district' | 'status' | 'submittedAt' | 'updatedAt',
  sortOrder?: 'asc' | 'desc'
}) {
  const session = await getServerSession();
  if (!session) return { submissions: [], total: 0 };

  try {
    const requestedDistrict = filters?.district;
    // Accept a single `branch` alongside `branches` (mirrors getCaseMetrics) — several
    // callers only set the singular field, which this function used to silently ignore.
    const requestedBranches = filters?.branches || (filters?.branch ? [filters.branch] : []);
    
    const dateFilter = filters?.startDate || filters?.endDate ? (() => {
        const filter: any = {};
        if (filters.startDate) {
          filter.gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          filter.lte = endDate;
        }
        return filter;
      })() : undefined;

    const jurisdictionalFilter = await buildJurisdictionalFilter(session, requestedDistrict, requestedBranches);
    if (jurisdictionalFilter === null) return { submissions: [], total: 0 };

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { roles: { include: { role: true } } }
    });
    
    const roleNames = user?.roles.map(r => r.role.name) || [];
    const isOfficer = roleNames.some(r => ['KYC_OFFICER', 'KYC_SPECIALIST', 'SUPERVISOR'].includes(r));
    const isManagement = session.role === 'SUPER_ADMIN' || roleNames.includes('DISTRICT_DIRECTOR');

    // When the query is explicitly for AUTHORIZED cases, a date range means
    // "authorized in this window", so it must match the approval timestamp
    // (updatedAt — approval is the case's final state change), not the day the
    // branch first submitted it, which can be weeks earlier.
    const approvedOnly = filters?.status?.length === 1 && filters.status[0] === KYC_STATUS.APPROVED;

    // Base conditions that always apply, regardless of role.
    const baseWhere: any = {
      status: filters?.status ? { in: filters.status } : undefined,
      branchId: filters?.branchId,
      createdById: filters?.submittedBy || filters?.createdById,
      isResubmitted: filters?.isResubmitted,
      isExceptional: filters?.isExceptional ?? false,
      entityType: filters?.entityType,
      submittedAt: approvedOnly ? undefined : dateFilter,
      updatedAt: approvedOnly ? dateFilter : undefined,
      active: true,
    };

    let where: any;
    const hasJurisFilter = Object.keys(jurisdictionalFilter).length > 0;

    // ACTIVE_REVIEW_ASSIGNEE_FILTER equivalent for the Case Archive when strict 'Running' matches are needed
    const ACTIVE_REVIEW_ASSIGNEE_FILTER = {
      assignedToId: { not: null },
      assignedTo: {
        roles: {
          some: {
            role: {
              active: true,
              permissions: { some: { permission: { slug: 'KYC_VIEW_QUEUE' } } },
            },
          },
          none: { role: { name: 'SUPER_ADMIN' } },
        },
      },
    };

    if (filters?.activeReviewersOnly) {
      Object.assign(baseWhere, ACTIVE_REVIEW_ASSIGNEE_FILTER);
    }

    if (isOfficer && !isManagement && !filters?.assignedToId) {
      // Officers must always see cases directly assigned to them, regardless of branch.
      // For all other cases they follow normal portfolio/branch jurisdiction.
      const portfolioConditions: any[] = hasJurisFilter
        ? [
            { ...jurisdictionalFilter, assignedToId: null },
            { ...jurisdictionalFilter, status: KYC_STATUS.SUBMITTED },
          ]
        : [{ assignedToId: null }, { status: KYC_STATUS.SUBMITTED }];

      // For exceptional cases: any officer with portfolio access to the branch can see all
      // exceptional cases from that branch regardless of assignedToId or base KYC status.
      // This ensures the currently mapped KYC Officer can view and process cases waiting in
      // AWAITING_KYC_OFFICER, and that closed (COMPLETED) cases remain visible for reference.
      const exceptionalPortfolio: any[] = filters?.isExceptional && hasJurisFilter
        ? [{ ...jurisdictionalFilter }]
        : [];

      where = {
        ...baseWhere,
        OR: [{ assignedToId: session.id }, ...portfolioConditions, ...exceptionalPortfolio],
      };
    } else {
      // All other roles: spread jurisdictional filter directly.
      where = {
        ...baseWhere,
        assignedToId: filters?.assignedToId,
        ...jurisdictionalFilter,
      };
    }

    // Log for suspicious patterns (non-admin accessing unfiltered submissions)
    if (session.role !== 'SUPER_ADMIN' && !hasJurisFilter) {
      logInstitutionalError(
        new Error(`SECURITY ALERT: Non-admin user accessed submissions without jurisdiction filter`),
        'UNFILTERED_DATA_ACCESS_ATTEMPT'
      );
    }

    // Search lives in AND so it narrows (never replaces) the jurisdiction/officer
    // OR clauses built above.
    const searchTerm = filters?.search?.trim();
    if (searchTerm) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { id: { contains: searchTerm, mode: 'insensitive' } },
            { customerName: { contains: searchTerm, mode: 'insensitive' } },
            { branchName: { contains: searchTerm, mode: 'insensitive' } },
            { districtName: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const sortOrder = filters?.sortOrder === 'desc' ? 'desc' as const : 'asc' as const;
    const sortColumn: Record<string, any> = {
      id: { id: sortOrder },
      customer: { customerName: sortOrder },
      branch: { branchName: sortOrder },
      district: { districtName: sortOrder },
      status: { status: sortOrder },
      updatedAt: { updatedAt: sortOrder },
      submittedAt: { submittedAt: sortOrder },
    };
    // FIFO with urgent priority: URGENT cases are pinned to the top of the
    // list; after them, cases follow the requested order (default oldest /
    // first-submitted first, new arrivals joining at the bottom). `id` breaks
    // ties deterministically so pages never overlap.
    const orderBy: any[] = filters?.sortField
      ? [{ isUrgent: 'desc' }, sortColumn[filters.sortField] || { submittedAt: sortOrder }, { id: 'asc' }]
      : [{ submittedAt: 'desc' }];

    const [data, total] = await Promise.all([
      prisma.kYC.findMany({
        where,
        include: {
          createdBy: true,
          assignedTo: true,
          branch: { include: { district: true } },
          memos: true
        },
        orderBy,
        take: filters?.limit || 5000,
        skip: filters?.offset || 0,
      }),
      prisma.kYC.count({ where })
    ]);

    // Defense-in-depth branch validation (skipped for officers: their OR clause already
    // guarantees they only see assigned cases or portfolio-branch cases).
    if (session.role !== 'SUPER_ADMIN' && !isOfficer && hasJurisFilter) {
      const filtered = data.filter((item: any) => {
        const itemDistrictName = item.districtName ? normalizeBranchName(item.districtName) : null;
        const itemBranchName = item.branchName ? normalizeBranchName(item.branchName) : null;

        if (jurisdictionalFilter.districtName) {
          const filterDistrict = jurisdictionalFilter.districtName?.equals
            ? normalizeBranchName(jurisdictionalFilter.districtName.equals)
            : null;
          if (filterDistrict && (!itemDistrictName || itemDistrictName.toLowerCase() !== filterDistrict.toLowerCase())) return false;
        }

        if (jurisdictionalFilter.branchName) {
          const allowedBranches = jurisdictionalFilter.branchName?.in
            ? jurisdictionalFilter.branchName.in
            : [jurisdictionalFilter.branchName?.equals];
          const normAllowed = allowedBranches.map((b: any) => normalizeBranchName(b).toLowerCase());
          if (!normAllowed.some((b: string) => b === itemBranchName?.toLowerCase())) return false;
        }

        return true;
      });

      return {
        submissions: filtered.map((item: any) => formatKYC(item)),
        total
      };
    }

    return {
      submissions: data.map((item: any) => formatKYC(item)),
      total
    };
  } catch (error) {
    logInstitutionalError(error, 'DB_QUERY_SUBMISSIONS');
    return { submissions: [], total: 0 };
  }
}

/**
 * Calculates accurate summary statistics for the dashboard using SQL counts.
 * Ensures counts are consistent across all dashboards and respect jurisdiction.
 */
export interface CaseMetricsFilter {
  district?: string;
  branches?: string[];
  branch?: string;
  branchId?: string;
  submittedBy?: string;
  createdById?: string;
  assignedToId?: string;
  // Matches cases the staff member touched in either capacity (creator OR
  // assignee) — the semantics the Branch Performance staff filter needs.
  staffId?: string;
  status?: string[] | string;
  isResubmitted?: boolean;
  isExceptional?: boolean;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

export interface CaseMetrics {
  total: number;
  authorized: number;
  needAmendment: number;
  unseen: number;
  running: number;
  viewed: number;
  resubmitted: number;
  escalated: number;
  exceptional: number;
  pending: number;
  performanceIndex: number;
}

/**
 * Shared where-clause builder for getCaseMetrics and getDistrictPerformance so
 * both stay identical in how they scope jurisdiction, dates, and status — the
 * district breakdown must sum back to the same totals as the summary cards.
 */
async function buildCaseMetricsWhere(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>, filters?: CaseMetricsFilter) {
  const requestedDistrict = filters?.district;
  const requestedBranches = filters?.branches || (filters?.branch ? [filters.branch] : []);
  const jurisdictionalFilter = await buildJurisdictionalFilter(session, requestedDistrict, requestedBranches);
  if (jurisdictionalFilter === null) return null;

  const dateFilter = filters?.startDate || filters?.endDate ? (() => {
    const filter: any = {};
    if (filters.startDate) {
      filter.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filter.lte = endDate;
    }
    return filter;
  })() : undefined;

  const statusFilter = filters?.status
    ? Array.isArray(filters.status)
      ? { in: filters.status }
      : { equals: filters.status }
    : undefined;

  // SECURITY: Request filters must never clobber jurisdictional filter keys.
  // Spreading raw (possibly undefined) request values over the jurisdiction
  // object previously erased the branch restriction (branchId: undefined wiped
  // a branch user's scope), leaking organization-wide totals on dashboards.
  const where: any = { ...jurisdictionalFilter, active: true };
  const requestedCreatedById = filters?.submittedBy || filters?.createdById;
  if (requestedCreatedById) where.createdById = requestedCreatedById;
  if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters?.isResubmitted !== undefined) where.isResubmitted = filters.isResubmitted;
  if (filters?.isExceptional !== undefined) where.isExceptional = filters.isExceptional;
  if (filters?.entityType) where.entityType = filters.entityType;
  // Queries scoped to AUTHORIZED cases interpret the date range as "authorized
  // in this window" — matched on the approval timestamp (updatedAt, the case's
  // final state change), not the original submission date. Mirrors getSubmissions.
  const approvedOnly = Array.isArray(filters?.status)
    ? filters!.status.length === 1 && filters!.status[0] === KYC_STATUS.APPROVED
    : filters?.status === KYC_STATUS.APPROVED;
  if (dateFilter) {
    if (approvedOnly) where.updatedAt = dateFilter;
    else where.submittedAt = dateFilter;
  }
  if (statusFilter) where.status = statusFilter;
  // Narrowing conditions live in AND so they never replace jurisdiction keys.
  const andConditions: any[] = [];
  if (filters?.branchId) andConditions.push({ branchId: filters.branchId });
  if (filters?.staffId) {
    andConditions.push({ OR: [{ createdById: filters.staffId }, { assignedToId: filters.staffId }] });
  }
  if (andConditions.length > 0) where.AND = andConditions;

  // NEW: Assignment filter for KYC Officers / Specialists to ensure Dashboard matches My Cases
  // Only apply if filters.assignedToId is NOT explicitly provided (to avoid double filtering)
  // and if the user is not a Super Admin or District Admin who should see everything.
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { roles: { include: { role: true } } }
  });

  const roleNames = user?.roles.map(r => r.role.name) || [];
  const isOfficer = roleNames.some(r => ['KYC_OFFICER', 'KYC_SPECIALIST', 'SUPERVISOR'].includes(r));
  const isManagement = session.role === 'SUPER_ADMIN' || roleNames.includes('DISTRICT_DIRECTOR');

  if (isOfficer && !isManagement && !filters?.assignedToId) {
    where.OR = [
      { assignedToId: session.id },
      { assignedToId: null },
      { status: KYC_STATUS.SUBMITTED }
    ];
  }

  return where;
}

export async function getCaseMetrics(filters?: CaseMetricsFilter): Promise<CaseMetrics> {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  const where = await buildCaseMetricsWhere(session, filters);
  if (where === null) {
    return { total: 0, authorized: 0, needAmendment: 0, unseen: 0, running: 0, viewed: 0, resubmitted: 0, escalated: 0, exceptional: 0, pending: 0, performanceIndex: 100 };
  }

  try {
    // "Unseen" is purely status-driven: a case stays SUBMITTED (unseen) until the
    // mapped KYC Officer opens it, which transitions it to IN_REVIEW. This keeps
    // counts identical for every viewer and ensures stats only move when the
    // mapped officer acts on a case.
    // Total must match what getSubmissions() (and the Case Archive it feeds) would
    // return for the same filters — same isExceptional default (false unless the
    // caller explicitly asked for exceptional cases) and no status restriction.
    const totalWhere = filters?.isExceptional !== undefined ? where : { ...where, isExceptional: false };
    const [rawTotal, authorized, needAmendment, running, viewed, resubmitted, escalated, exceptional, pending, unseen] = await Promise.all([
      prisma.kYC.count({ where: totalWhere }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.APPROVED, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.ACTION_REQUIRED, isExceptional: false } }),
      // Resubmitted cases must not inflate "In Review" — a case that was returned
      // for amendment and came back is a distinct workflow from a fresh case being
      // reviewed for the first time.
      prisma.kYC.count({
        where: {
          ...where,
          status: KYC_STATUS.IN_REVIEW,
          isExceptional: false,
          isResubmitted: false,
          ...ACTIVE_REVIEW_ASSIGNEE_FILTER,
        },
      }),
      prisma.kYC.count({ where: { ...where, status: { in: [KYC_STATUS.IN_REVIEW, KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED] }, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, isResubmitted: true, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.ESCALATED, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, isExceptional: true } }),
      prisma.kYC.count({ where: { ...where, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isExceptional: false } }),
      // "Unseen" must only reflect fresh submissions — a resubmitted case re-enters
      // at SUBMITTED but is not a brand-new, never-seen case.
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.SUBMITTED, isExceptional: false, isResubmitted: false } })
    ]);

    // Branch / District Workflow Performance (institutional formula):
    // ((Total Submitted − Cases Requiring Amendment − Amendment Cycle Cases) ÷ Total Submitted) × 100
    // — the share of submissions that never needed correction.
    const total = rawTotal;
    const performanceIndex = total > 0
      ? Math.round(Math.min(Math.max(((total - needAmendment - resubmitted) / total) * 100, 0), 100))
      : 100;

    return { total, authorized, needAmendment, unseen, running, viewed, resubmitted, escalated, exceptional, pending, performanceIndex };
  } catch (error) {
    logInstitutionalError(error, 'DB_CASE_METRICS');
    return { total: 0, authorized: 0, needAmendment: 0, unseen: 0, running: 0, viewed: 0, resubmitted: 0, escalated: 0, exceptional: 0, pending: 0, performanceIndex: 100 };
  }
}

export interface DistrictPerformanceRow {
  name: string;
  authorized: number;
  pending: number;
  returned: number;
  total: number;
  efficiency: number;
}

/**
 * SQL-aggregated per-district breakdown for Management Reporting's district
 * comparison chart. Previously that chart was derived client-side from a
 * submissions list capped at 5000 rows (getSubmissions' default `take`), so on
 * datasets larger than that (this bank has 25k+ authorized cases alone) the
 * chart silently undercounted and drifted from the accurate SQL totals shown
 * on the summary cards above it. Reusing buildCaseMetricsWhere/the same
 * isExceptional-defaulting rule as getCaseMetrics keeps the sum across
 * districts reconciled with those cards.
 */
export async function getDistrictPerformance(filters?: CaseMetricsFilter): Promise<DistrictPerformanceRow[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  const where = await buildCaseMetricsWhere(session, filters);
  if (where === null) return [];

  try {
    const totalWhere = filters?.isExceptional !== undefined ? where : { ...where, isExceptional: false };

    const [totalRows, authorizedRows, returnedRows] = await Promise.all([
      prisma.kYC.groupBy({ by: ['districtName'], where: totalWhere, _count: { _all: true } }),
      prisma.kYC.groupBy({ by: ['districtName'], where: { ...totalWhere, status: KYC_STATUS.APPROVED }, _count: { _all: true } }),
      prisma.kYC.groupBy({ by: ['districtName'], where: { ...totalWhere, status: KYC_STATUS.ACTION_REQUIRED }, _count: { _all: true } }),
    ]);

    const authorizedByDistrict = new Map(authorizedRows.map((r) => [r.districtName, r._count._all]));
    const returnedByDistrict = new Map(returnedRows.map((r) => [r.districtName, r._count._all]));

    return totalRows
      .map((r) => {
        const total = r._count._all;
        const authorized = authorizedByDistrict.get(r.districtName) || 0;
        const returned = returnedByDistrict.get(r.districtName) || 0;
        const pending = total - authorized - returned;
        return {
          name: r.districtName || 'Unknown',
          authorized,
          returned,
          pending,
          total,
          efficiency: total > 0 ? Math.round((authorized / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.efficiency - a.efficiency);
  } catch (error) {
    logInstitutionalError(error, 'DB_DISTRICT_PERFORMANCE');
    return [];
  }
}

export interface BranchPerformanceRow {
  name: string;
  district: string;
  total: number;
  unseen: number;
  authorized: number;
  amended: number;
  resubmitted: number;
}

/**
 * SQL-aggregated per-branch breakdown (same contract as getDistrictPerformance,
 * grouped one level lower). Feeds the Branch Matrix tables on the district and
 * branch performance pages, which previously counted client-side over a fetch
 * capped at 1000 rows and silently undercounted past that.
 */
export async function getBranchPerformance(filters?: CaseMetricsFilter): Promise<BranchPerformanceRow[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  const where = await buildCaseMetricsWhere(session, filters);
  if (where === null) return [];

  try {
    const totalWhere = filters?.isExceptional !== undefined ? where : { ...where, isExceptional: false };

    const [totalRows, unseenRows, authorizedRows, amendedRows, resubmittedRows] = await Promise.all([
      prisma.kYC.groupBy({ by: ['branchName', 'districtName'], where: totalWhere, _count: { _all: true } }),
      prisma.kYC.groupBy({ by: ['branchName'], where: { ...totalWhere, status: KYC_STATUS.SUBMITTED, isResubmitted: false }, _count: { _all: true } }),
      prisma.kYC.groupBy({ by: ['branchName'], where: { ...totalWhere, status: KYC_STATUS.APPROVED }, _count: { _all: true } }),
      prisma.kYC.groupBy({ by: ['branchName'], where: { ...totalWhere, status: KYC_STATUS.ACTION_REQUIRED }, _count: { _all: true } }),
      prisma.kYC.groupBy({ by: ['branchName'], where: { ...totalWhere, isResubmitted: true }, _count: { _all: true } }),
    ]);

    const toMap = (rows: { branchName: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.branchName, r._count._all]));
    const unseenByBranch = toMap(unseenRows as any);
    const authorizedByBranch = toMap(authorizedRows as any);
    const amendedByBranch = toMap(amendedRows as any);
    const resubmittedByBranch = toMap(resubmittedRows as any);

    return totalRows
      .map((r) => ({
        name: r.branchName || 'Unmapped Branch',
        district: r.districtName || 'Unknown',
        total: r._count._all,
        unseen: unseenByBranch.get(r.branchName) || 0,
        authorized: authorizedByBranch.get(r.branchName) || 0,
        amended: amendedByBranch.get(r.branchName) || 0,
        resubmitted: resubmittedByBranch.get(r.branchName) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logInstitutionalError(error, 'DB_BRANCH_PERFORMANCE');
    return [];
  }
}

/**
 * Monthly submission volumes for the trend chart, counted in SQL over the whole
 * jurisdiction-scoped dataset — the client previously derived this from a
 * 5000-row-capped fetch. Month windows are intersected (AND) with any caller
 * date filter rather than replacing it.
 */
export async function getMonthlyTrend(filters?: CaseMetricsFilter): Promise<{ name: string; volume: number }[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  const where = await buildCaseMetricsWhere(session, filters);
  if (where === null) return [];

  try {
    const totalWhere = filters?.isExceptional !== undefined ? where : { ...where, isExceptional: false };
    const end = new Date();
    const start = startOfMonth(subDays(end, 180));
    const months = eachMonthOfInterval({ start, end });

    const counts = await Promise.all(
      months.map((m) =>
        prisma.kYC.count({
          where: { AND: [totalWhere, { submittedAt: { gte: m, lte: endOfMonth(m) } }] },
        })
      )
    );

    // Unambiguous month labels: 'MMM yy' rendered "Jun 26" reads like a future
    // calendar day, so spell the year out.
    return months.map((m, i) => ({ name: format(m, 'MMM yyyy'), volume: counts[i] }));
  } catch (error) {
    logInstitutionalError(error, 'DB_MONTHLY_TREND');
    return [];
  }
}

export async function getDashboardSummaryStats() {
  const { total, authorized, needAmendment, unseen, running, performanceIndex } = await getCaseMetrics();
  return { total, authorized, needAmendment, unseen, running, performanceIndex };
}

/**
 * Retrieves a single submission with strict ownership and jurisdictional validation.
 */
export async function getSubmissionById(id: string) {
  const session = await getServerSession();
  if (!session) return null;

  try {
    const kyc = await prisma.kYC.findUnique({
      where: { id },
      include: {
        createdBy: true,
        assignedTo: true,
        branch: { include: { district: true } },
        memos: true
      }
    });

    if (!kyc) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!user) return null;

    const userPermissions = user.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    );

    if (
      session.role === 'SUPER_ADMIN' ||
      hasJurisdictionalAccess(user, userPermissions, session.id, kyc) ||
      await hasFollowUpCaseAccess(user, kyc.id)
    ) {
      // SECURITY: Log VIEW action for audit and tracking "Unseen" cases
      // Only log for non-creators to track when reviewers actually look at the case
      if (kyc.createdById !== session.id) {
        await createAuditLog({
          userId: session.id,
          userEmail: session.email,
          userName: (session.email || 'unknown').split('@')[0],
          action: 'VIEW',
          details: `Viewed submission details for case ${kyc.id} (${kyc.customerName})`,
          kycId: kyc.id,
          severity: 'LOW'
        }).catch(err => {
          logInstitutionalError(err, 'AUDIT_LOG_VIEW_FAILED');
        });
      }

      return formatKYC(kyc);
    }

    return null;
  } catch (error) {
    logInstitutionalError(error, 'DB_GET_SUBMISSION');
    return null;
  }
}

function generateKycId(branchName: string): string {
  const branchSlug = branchName.replace(/\s+/g, '_').toUpperCase();
  const suffix = generateSecureString(6, '0123456789');
  return `${branchSlug}-KYC-${suffix}`;
}

export async function createSubmission(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false as const, error: "Unauthenticated" };

  try {
    const validated = SubmissionSchema.parse({
      customerName: formData.get('customerName'),
      entityType: formData.get('entityType'),
      branchName: formData.get('branchName'),
      districtName: formData.get('districtName'),
      remarks: formData.get('remarks'),
    });

    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];
    const bypassDuplicateCheck = formData.get('bypassDuplicateCheck') === 'true';

    // Check for duplicate submission with same customer name and account classification
    const existingCase = await prisma.kYC.findFirst({
      where: {
        customerName: validated.customerName,
        entityType: validated.entityType,
        active: true
      }
    });

    if (existingCase && !bypassDuplicateCheck) {
      return {
        success: false as const,
        error: `A KYC case already exists for ${validated.customerName} with the same account classification (Case ID: ${existingCase.id}).`,
        duplicateFound: true,
        existingCaseId: existingCase.id
      };
    }

    // SECURITY: File upload validation (A05:2021 - Security Misconfiguration)
    // 1. Validate file count (require minimum for initial submission)
    const fileCountValidation = validateFileCount(files.length, true);
    if (!fileCountValidation.valid) {
      return { success: false as const, error: fileCountValidation.error };
    }

    // 2. Validate total upload size
    const totalSizeValidation = validateTotalUploadSize(files);
    if (!totalSizeValidation.valid) {
      return { success: false as const, error: totalSizeValidation.error };
    }

    const district = await prisma.district.upsert({
      where: { name: validated.districtName },
      update: {},
      create: { name: validated.districtName }
    });

    const branch = await prisma.branch.upsert({
      where: { name: validated.branchName },
      update: {},
      create: { 
        name: validated.branchName, 
        code: `BR-${generateSecureString(3, '0123456789')}`,
        districtId: district.id
      }
    });

    const memoData: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      
      // CRITICAL SECURITY: 5-Layer Threat Detection (VULN #12/17)
      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = await performCompleteFileValidation(file.name, file.type, buffer, session.id);
      
      if (!validation.valid || !validation.storageKey) {
        await createAuditLog({
          userId: session.id,
          userEmail: session.email || 'unknown@nibbank.com.et',
          userName: (session.email || 'unknown@nibbank.com.et').split('@')[0],
          action: 'FILE_UPLOAD_REJECTED',
          details: `Threat Detected: ${file.name} - ${validation.error}`,
        });
        return { success: false as const, error: toFriendlyUploadError(validation.error) };
      }

      const persistableBuffer = validation.sanitisedBuffer || buffer;
      await writeSecureUploadedFile(validation.storageKey!, persistableBuffer);

      memoData.push({
        name: file.name.split('.').slice(0, -1).join('.'),
        originalName: file.name,
        type: type,
        storageKey: validation.storageKey!,
        fileHash: validation.fileHash,
        uploadedBy: { connect: { id: session.id } },
        mimeType: validation.fileType || file.type,
        size: persistableBuffer.length,
      });
    }

    // Capture initial remarks in the comment history for immediate visibility
    const initialHistory = [{
      role: session.role || 'OFFICER',
      performedBy: session.email.split('@')[0],
      timestamp: new Date().toISOString(),
      comment: validated.remarks || "Initial submission dispatched for analysis.",
      action: "SUBMIT"
    }];

    const MAX_ID_ATTEMPTS = 5;
    let kyc;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      try {
        kyc = await prisma.kYC.create({
          data: {
            id: generateKycId(validated.branchName),
            customerName: validated.customerName,
            branchId: branch.id,
            branchName: validated.branchName,
            districtName: validated.districtName,
            createdById: session.id,
            status: KYC_STATUS.SUBMITTED,
            entityType: validated.entityType,
            remarks: validated.remarks,
            checklistState: {},
            commentHistory: initialHistory,
            memos: { create: memoData }
          }
        });
        break;
      } catch (err: any) {
        // Retry with a freshly generated ID only on a collision against the id field.
        const isIdCollision = err?.code === 'P2002' && err?.meta?.target?.includes?.('id');
        if (!isIdCollision || attempt === MAX_ID_ATTEMPTS - 1) throw err;
      }
    }
    if (!kyc) throw new Error('Failed to create KYC record');
    const createdKyc = kyc;

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      userName: session.email.split('@')[0],
      action: 'CREATE',
      details: `Initial submission for ${validated.customerName}. Remarks persisted in history.`,
      kycId: createdKyc.id
    });

    revalidatePath('/');
    revalidatePath('/submissions/my');
    return { success: true as const, kyc: createdKyc };
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      const msg = error.issues.map((i: any) => i.message).join(', ');
      return { success: false as const, error: msg };
    }
    if (error?.code === 'P2002') {
      logInstitutionalError(error, 'DB_CREATE_SUBMISSION_DUPLICATE');
      return { success: false as const, error: 'A KYC record with this ID already exists. Please try submitting again.' };
    }
    const { message } = logInstitutionalError(error, 'DB_CREATE_SUBMISSION');
    return { success: false as const, error: message };
  }
}

export async function resubmitSubmission(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  try {
    const id = formData.get('id') as string;
    const remarks = formData.get('remarks') as string;
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("Case not found");

    const actor = await prisma.user.findUnique({ 
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const userPermissions = actor?.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    ) || [];

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    // SECURITY: File upload validation (A05:2021 - Security Misconfiguration)
    if (files.length > 0) {
      // 1. Validate file count
      const fileCountValidation = validateFileCount(files.length);
      if (!fileCountValidation.valid) {
        return { success: false, error: fileCountValidation.error };
      }

      // 2. Validate total upload size
      const totalSizeValidation = validateTotalUploadSize(files);
      if (!totalSizeValidation.valid) {
        return { success: false, error: totalSizeValidation.error };
      }
    }

    const memoData: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      
      // CRITICAL SECURITY: 5-Layer Threat Detection (VULN #12/17)
      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = await performCompleteFileValidation(file.name, file.type, buffer, session.id);
      
      if (!validation.valid || !validation.storageKey) {
        await createAuditLog({
          userId: session.id,
          userEmail: session.email,
          action: 'FILE_UPLOAD_REJECTED',
          details: `Threat Detected in Resubmission: ${file.name} - ${validation.error}`,
          kycId: id,
        });
        return { success: false, error: toFriendlyUploadError(validation.error) };
      }

      const persistableBuffer = validation.sanitisedBuffer || buffer;
      await writeSecureUploadedFile(validation.storageKey!, persistableBuffer);
      
      memoData.push({ 
        name: file.name.split('.').slice(0, -1).join('.'), 
        originalName: file.name, 
        type: type, 
        storageKey: validation.storageKey!, 
        fileHash: validation.fileHash,
        uploadedById: session.id,
        kycId: id,
        mimeType: validation.fileType || file.type,
        size: persistableBuffer.length,
      });
    }

    const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
    const newHistory = [...history, {
      role: session.role || 'BRANCH_OFFICER',
      performedBy: session.email.split('@')[0],
      userId: session.id,
      timestamp: new Date().toISOString(),
      comment: remarks || "Documents resubmitted for review.",
      action: "RESUBMIT"
    }];

    const operations: any[] = [];

    // Allow comment-only resubmissions (no files attached) without throwing.
    if (memoData.length > 0) {
      operations.push(prisma.memo.createMany({ data: memoData }));
    }

    // Route resubmission to the branch's acting primary officer.
    // BUSINESS RULE: the PERMANENT officer always has first priority; the
    // TEMPORARY officer only receives cases while the permanent primary is
    // absent (account not ACTIVE) or has no active mapping.
    const primaryOfficers = current.branchId
      ? await prisma.branchMappingOfficer.findMany({
          where: { mapping: { branchId: current.branchId, active: true }, isPrimary: true },
          select: { userId: true, user: { select: { status: true } }, mapping: { select: { type: true } } },
        })
      : [];
    const permanentPrimary = primaryOfficers.find((o) => o.mapping.type === 'PERMANENT');
    const temporaryPrimary = primaryOfficers.find((o) => o.mapping.type === 'TEMPORARY');
    const primaryOfficerRecord =
      (permanentPrimary?.user.status === 'ACTIVE' ? permanentPrimary : null) ??
      (temporaryPrimary?.user.status === 'ACTIVE' ? temporaryPrimary : null) ??
      permanentPrimary ?? temporaryPrimary ?? null;

    const isExceptionalAmendment = current.isExceptional && current.exceptionalStatus === EXCEPTIONAL_STATUS.AMENDMENT_REQUESTED;

    operations.push(
      prisma.kYC.update({
        where: { id },
        data: {
          status: isExceptionalAmendment ? KYC_STATUS.ESCALATED : KYC_STATUS.SUBMITTED,
          isResubmitted: true,
          exceptionalStatus: isExceptionalAmendment ? EXCEPTIONAL_STATUS.AWAITING_DIVISION : current.exceptionalStatus,
          assignedToId: isExceptionalAmendment ? null : (primaryOfficerRecord?.userId ?? current.assignedToId),
          commentHistory: newHistory,
          updatedAt: new Date(),
        },
      })
    );

    await prisma.$transaction(operations);

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'RESUBMIT',
      details: `Resubmission of ${files.length} documents for case ${id}.`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    return { success: true };
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      const msg = error.issues.map((i: any) => i.message).join(', ');
      return { success: false, error: msg };
    }
    const { message } = logInstitutionalError(error, 'DB_RESUBMIT_SUBMISSION');
    return { success: false, error: message };
  }
}

/**
 * Resolves the acting primary KYC officer for a branch.
 * BUSINESS RULE: the PERMANENT officer owns the branch; the TEMPORARY officer
 * only acts while the permanent primary is absent (account not ACTIVE).
 */
async function getActingPrimaryOfficerId(branchId: string | null): Promise<string | null> {
  if (!branchId) return null;

  const mappings = await prisma.branchMapping.findMany({
    where: { branchId, active: true },
    include: { officers: { where: { isPrimary: true }, include: { user: true } } },
  });

  const withOfficers = mappings.filter((m: any) => m.officers.length > 0);
  const permanentMapping = withOfficers.find((m: any) => m.type === 'PERMANENT');
  const temporaryMapping = withOfficers.find((m: any) => m.type === 'TEMPORARY');
  const permanentAvailable = permanentMapping?.officers[0]?.user?.status === 'ACTIVE';
  const mapping = (permanentAvailable ? permanentMapping : temporaryMapping) ?? permanentMapping ?? withOfficers[0];

  return mapping?.officers[0]?.userId ?? null;
}

export async function updateSubmissionStatus(id: string, status: string, reviewerId: string, remarks?: string) {
  const session = await getServerSession();
  if (!session) return { success: false as const, error: "Your session has expired. Please sign in again." };

  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) return { success: false as const, error: "This case could not be found." };

  if (reviewerId !== session.id && session.role !== 'SUPER_ADMIN') {
    return { success: false as const, error: "Access denied." };
  }

  const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
  const reviewer = await prisma.user.findUnique({ 
    where: { id: session.id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true
                }
              }
            }
          }
        }
      }
    }
  });

  const userPermissions = reviewer?.roles.flatMap((ur: any) => 
    ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
  ) || [];

  if (!reviewer || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(reviewer, userPermissions, session.id, current))) {
    return { success: false as const, error: "You do not have permission to access this case." };
  }

  // WORKFLOW INTEGRITY: only the mapped KYC Officer may pull a case out of
  // "Unseen" (SUBMITTED -> IN_REVIEW). Admins, directors, managers or any
  // other viewer opening a case must never alter its workflow state or move
  // the Unseen/Authorized/Amendment statistics. This applies to every role,
  // including SUPER_ADMIN — viewing is never a workflow action.
  let isMappedOfficer = current.assignedToId === session.id;
  if (!isMappedOfficer && !current.assignedToId) {
    isMappedOfficer = (await getActingPrimaryOfficerId(current.branchId)) === session.id;
  }

  if (current.status === KYC_STATUS.SUBMITTED && status === KYC_STATUS.IN_REVIEW && !isMappedOfficer) {
    return { success: false as const, error: "Only the assigned KYC Officer can open this case for review." };
  }

  // REDUCE DUPLICATE ENTRIES: Prevent rapid-fire or redundant status updates
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  const isStatusChanging = current.status !== status;
  
  // Rule 1: Same status and same person without a unique comment is a duplicate
  const isSameStatusAndPerson = lastEntry?.action === status && lastEntry?.performedBy === `${reviewer?.firstName} ${reviewer?.lastName}`;
  const hasNewRemarks = !!remarks && remarks !== lastEntry?.comment;
  
  // Rule 2: Specifically prevent multiple "Open" entries (automatic background transitions)
  const isAutoOpen = remarks === "Case opened for analysis.";
  const wasAlreadyOpened = history.some(h => h.comment === "Case opened for analysis." && h.performedBy === `${reviewer?.firstName} ${reviewer?.lastName}`);
  const isDuplicateOpen = isAutoOpen && wasAlreadyOpened;

  const isDuplicateAction = (isSameStatusAndPerson && !hasNewRemarks) || isDuplicateOpen;

  // Detect if the acting officer is under a TEMPORARY mapping for this branch.
  let isTemporaryOfficer = false;
  if (isMappedOfficer && current.branchId) {
    const tempMapping = await prisma.branchMappingOfficer.findFirst({
      where: { userId: session.id, mapping: { branchId: current.branchId, active: true, type: 'TEMPORARY' } },
      select: { mappingId: true },
    });
    isTemporaryOfficer = !!tempMapping;
  }

  let updatedHistory = history;
  if ((isStatusChanging || hasNewRemarks) && !isDuplicateAction && !isAutoOpen) {
    const newEntry: any = {
      role: session.role || 'OFFICER',
      performedBy: `${reviewer?.firstName} ${reviewer?.lastName}`,
      userId: session.id,
      timestamp: new Date().toISOString(),
      comment: remarks || `Status updated to ${status}`,
      action: status,
    };
    if (isTemporaryOfficer) newEntry.isTemporary = true;
    updatedHistory = [...history, newEntry];
  }

  try {
    await prisma.kYC.update({
      where: { id },
      data: {
        status,
        // Assignment stays with the mapped officer: actions by admins,
        // directors or supervisors must not steal the case or shift
        // per-officer workflow statistics to themselves.
        assignedToId: isMappedOfficer ? session.id : current.assignedToId,
        updatedAt: new Date(),
        commentHistory: updatedHistory,
        // Preserve whatever resubmitSubmission() set — this function used to
        // recompute isResubmitted from the transition being made here, which wiped
        // it back to false the instant a resubmitted case was opened for review
        // (SUBMITTED -> IN_REVIEW), silently losing the distinction downstream.
        isResubmitted: current.isResubmitted,
        amendCycles: status === KYC_STATUS.ACTION_REQUIRED ? { increment: 1 } : undefined
      }
    });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: `STATUS_CHANGE_${status}`,
      details: `Status modified to ${status}. Remarks: ${remarks || 'N/A'}`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    return { success: true as const };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_UPDATE_STATUS');
    return { success: false as const, error: toFriendlyActionError(error?.message) };
  }
}

export async function returnEscalatedCaseToOfficer(id: string, remarks: string) {
  const session = await getServerSession();
  if (!session) return { success: false as const, error: "Your session has expired. Please sign in again." };

  const current = await prisma.kYC.findUnique({
    where: { id },
    include: {
      branch: {
        include: {
          mappings: {
            where: { active: true },
            include: { officers: { where: { isPrimary: true }, include: { user: true } } },
          },
        },
      },
    },
  });

  if (!current) return { success: false as const, error: "This case could not be found." };

  // Find the acting primary officer for the branch.
  // BUSINESS RULE: PERMANENT officer first; the TEMPORARY officer only takes
  // over while the permanent primary is absent (account not ACTIVE).
  const branchMappings = current.branch.mappings.filter((m: any) => m.officers.length > 0);
  const permanentMapping = branchMappings.find((m: any) => m.type === 'PERMANENT');
  const temporaryMapping = branchMappings.find((m: any) => m.type === 'TEMPORARY');
  const permanentAvailable = permanentMapping?.officers[0]?.user?.status === 'ACTIVE';
  const mapping = (permanentAvailable ? permanentMapping : temporaryMapping) ?? permanentMapping ?? branchMappings[0];
  const mappedOfficerId = mapping?.officers[0]?.userId;

  if (!mappedOfficerId) {
    return { success: false as const, error: "No primary officer is currently mapped to this branch." };
  }

  const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
  const reviewer = await prisma.user.findUnique({ where: { id: session.id } });

  const newEntry = {
    role: session.role || 'SUPERVISOR',
    performedBy: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : session.email,
    userId: session.id,
    timestamp: new Date().toISOString(),
    comment: remarks,
    action: 'RETURNED_FROM_ESCALATION'
  };

  try {
    await prisma.kYC.update({
      where: { id },
      data: {
        status: KYC_STATUS.IN_REVIEW, // Normal workflow continues
        assignedToId: mappedOfficerId,
        updatedAt: new Date(),
        commentHistory: [...history, newEntry],
      }
    });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'ESCALATION_RETURN',
      details: `Case ${current.id} returned to mapped officer with remarks.`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    revalidatePath('/submissions');
    return { success: true as const };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_RETURN_ESCALATION');
    return { success: false as const, error: toFriendlyActionError(error?.message) };
  }
}

export async function updateSubmissionChecklist(id: string, state: any) {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  try {
    const [currentKyc, actor] = await Promise.all([
      prisma.kYC.findUnique({ where: { id } }),
      prisma.user.findUnique({ 
        where: { id: session.id },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true
                    }
                  }
                }
              }
            }
          }
        }
      })
    ]);

    if (!currentKyc) {
      throw new Error("The case could not be found.");
    }

    const userPermissions = actor?.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    ) || [];

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, currentKyc))) {
      throw new Error("You do not have permission to access this case.");
    }

    const updatedKyc = await prisma.kYC.update({
      where: { id },
      data: { checklistState: state }
    });

    revalidatePath(`/submissions/${id}`);
    return updatedKyc;
  } catch (error) {
    logInstitutionalError(error, 'DB_UPDATE_CHECKLIST');
    throw new Error("A system error occurred. Please try again later.");
  }
}

export async function initiateExceptionalWorkflow(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  try {
    const id = formData.get('id') as string;
    const reason = formData.get('reason') as string;
    const justification = formData.get('justification') as string;
    const remarks = formData.get('remarks') as string;
    const memo = formData.get('memo') as File;

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("Case not found");

    const actor = await prisma.user.findUnique({ 
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const userPermissions = actor?.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => rp.permission.slug as string) : []
    ) || [];

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, current))) {
      throw new Error("You do not have permission to access this case.");
    }

    // Dynamic Permission Check
    if (session.role !== 'SUPER_ADMIN' && !hasPermission(actor, 'TRIGGER_GOVERNANCE_FLOW')) {
      throw new Error("You do not have permission to trigger governance cases.");
    }

    const buffer = Buffer.from(await memo.arrayBuffer());
    const validation = await performCompleteFileValidation(memo.name, memo.type, buffer, session.id);
    
    if (!validation.valid || !validation.storageKey) {
      await createAuditLog({ 
        userId: session.id, 
        userEmail: session.email, 
        action: 'FILE_UPLOAD_REJECTED', 
        details: `Exceptional memo rejected: ${memo.name} - ${validation.error}`, 
        kycId: id 
      }).catch(() => {});
      throw new Error(toFriendlyUploadError(validation.error));
    }

    const storedKey = validation.storageKey!;
    const persistableBuffer = validation.sanitisedBuffer || buffer;
    await writeSecureUploadedFile(storedKey, persistableBuffer);

    const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
    const newEntry = {
      role: session.role || 'SUPERVISOR',
      performedBy: session.email.split('@')[0],
      timestamp: new Date().toISOString(),
      comment: `EXCEPTIONAL FLOW TRIGGERED: ${reason}. ${remarks}`,
      action: "INITIATE_GOVERNANCE"
    };

    await prisma.$transaction([
      prisma.memo.create({
        data: {
          name: memo.name.split('.').slice(0, -1).join('.'),
          originalName: memo.name,
          type: 'GOVERNANCE_MEMO',
          storageKey: storedKey,
          fileHash: validation.fileHash,
          uploadedById: session.id,
          kycId: id,
          mimeType: validation.fileType || memo.type,
          size: persistableBuffer.length
        }
      }),
      prisma.kYC.update({
        where: { id },
        data: {
          isExceptional: true,
          exceptionalStatus: EXCEPTIONAL_STATUS.AWAITING_DISTRICT,
          commentHistory: [...history, newEntry],
          updatedAt: new Date()
        }
      })
    ]);

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'GOVERNANCE_START',
      details: `Exceptional workflow initiated. Reason: ${reason}`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    return { success: true };
  } catch (e: any) {
    const { message } = logInstitutionalError(e, 'DB_INITIATE_EXCEPTIONAL');
    return { success: false, error: message };
  }
}

export async function getWorkflowCounts() {
  // SECURITY: No parameters accepted — all identity/jurisdiction derived from server session.
  const session = await getServerSession();
  if (!session) {
    throw new Error("Please log in to continue.");
  }

  try {
    const jurisdictionalFilter = await buildJurisdictionalFilter(session);
    if (jurisdictionalFilter === null) {
      return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, unseenCases: 0, branchNode: 0 };
    }

    const [myCount, actionRequired, queueCounts, unseenCases, exceptionalCount, escalatedCount, resubmittedCount, activeInReview] = await Promise.all([
      prisma.kYC.count({ where: { createdById: session.id, active: true, isExceptional: false } }),
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          status: KYC_STATUS.ACTION_REQUIRED,
          isExceptional: false,
          active: true
        }
      }),
      prisma.kYC.groupBy({
        by: ['status'],
        // Excludes resubmitted cases so the SUBMITTED bucket (consumed below as
        // `reviewQueue`) only reflects fresh, never-seen submissions.
        where: { ...jurisdictionalFilter, active: true, isExceptional: false, isResubmitted: false },
        _count: true
      }),
      // Status-driven: a case is "unseen" until the mapped officer opens it
      // (open transitions SUBMITTED -> IN_REVIEW), regardless of who is viewing.
      // Resubmitted cases re-enter at SUBMITTED but are not fresh/never-seen.
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          status: KYC_STATUS.SUBMITTED,
          active: true,
          isExceptional: false,
          isResubmitted: false
        }
      }),
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          isExceptional: true,
          active: true,
          NOT: {
            status: { in: [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED] }
          }
        }
      }),
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          status: KYC_STATUS.ESCALATED,
          isExceptional: false,
          active: true
        }
      }),
      // Amendment Review badge: only resubmitted cases still awaiting a verdict.
      // `isResubmitted` is permanent, so without the status scope the badge (and
      // the queue it points to) kept every historical resubmission forever.
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          isResubmitted: true,
          isExceptional: false,
          active: true,
          status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW, KYC_STATUS.ESCALATED] }
        }
      }),
      // In Review count restricted to cases actively assigned to a front-line
      // reviewer (KYC Officer / Review & Action permission) — excludes Super Admin
      // and other viewers, and drops to 0 once the case is actioned (status leaves
      // IN_REVIEW on amendment / authorize / escalate). Also excludes resubmitted
      // cases, which are a distinct workflow from a fresh case under first review.
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          status: KYC_STATUS.IN_REVIEW,
          isExceptional: false,
          isResubmitted: false,
          active: true,
          ...ACTIVE_REVIEW_ASSIGNEE_FILTER,
        }
      })
    ]);

    const statsMap: Record<string, number> = {};
    queueCounts.forEach(item => {
      statsMap[item.status] = item._count;
    });

    return {
      mySubmissions: myCount,
      actionRequired: actionRequired,
      reviewQueue: statsMap[KYC_STATUS.SUBMITTED] || 0,
      resubmitted: resubmittedCount,
      escalated: escalatedCount,
      exceptional: exceptionalCount,
      unseenCases: unseenCases,
      branchNode: activeInReview
    };
  } catch (error) {
    logInstitutionalError(error, 'DB_WORKFLOW_COUNTS');
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, unseenCases: 0, branchNode: 0 };
  }
}

export async function processExceptionalStep(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false as const, error: "Your session has expired. Please sign in again." };

  try {
    const id = formData.get('id') as string;
    const nextStatus = formData.get('nextStatus') as string;
    const remarks = formData.get('remarks') as string;
    const actionLabel = formData.get('actionLabel') as string;
    const memo = formData.get('memo') as File | null;
    const resubmitFiles = formData.getAll('files') as File[];
    const resubmitTypes = formData.getAll('types') as string[];

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("Case not found");

    const actor = await prisma.user.findUnique({ 
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const userPermissions = actor?.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    ) || [];

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    const stage = getExceptionalWorkflowStage(current.exceptionalStatus);
    if (!stage) throw new Error("Invalid workflow stage.");

    // Dynamic Permission Check
    if (session.role !== 'SUPER_ADMIN' && !hasPermission(actor, stage.permission)) {
      throw new Error(`Insufficient permissions. Required: ${stage.permission}`);
    }

    const history = Array.isArray(current?.commentHistory) ? (current.commentHistory as any[]) : [];
    const availableActions = getActionsForCase(current.exceptionalStatus, history);
    const action = availableActions.find(a => a.nextStatus === nextStatus);

    if (!action) throw new Error("Invalid workflow action.");

    // Validate mandatory requirements
    if (action.requiresRemarks && !remarks) {
      throw new Error("Remarks are mandatory for this action.");
    }

    // Resolve AMENDMENT_REQUESTED resubmit sentinel → the stage that requested the amendment.
    let resolvedNextStatus = nextStatus;
    if (nextStatus === EXCEPTIONAL_RESTORE_SENTINEL) {
      const lastAmendmentEntry = [...history].reverse().find((h: any) => h.actionType === 'AMENDMENT_REQUEST');
      resolvedNextStatus = lastAmendmentEntry?.returnToStatus || EXCEPTIONAL_STATUS.AWAITING_KYC_OFFICER;
    }

    let storedMemoKey: string | null = null;
    let memoValidation: any = null;

    if (action.requiresMemo || (action.allowOptionalMemo && memo && memo.size > 0)) {
      if (action.requiresMemo && (!memo || memo.size === 0)) {
        throw new Error("A PDF memo attachment is mandatory for this action.");
      }

      const buffer = Buffer.from(await memo!.arrayBuffer());
      memoValidation = await performCompleteFileValidation(memo!.name, memo!.type, buffer, session.id);

      if (!memoValidation.valid || !memoValidation.storageKey) {
        throw new Error(toFriendlyUploadError(memoValidation.error));
      }

      storedMemoKey = memoValidation.storageKey as string;
      const persistableBuffer = memoValidation.sanitisedBuffer || buffer;
      await writeSecureUploadedFile(storedMemoKey, persistableBuffer);
    }

    const historyEntry: any = {
      role: session.role || 'GOVERNANCE',
      performedBy: `${actor?.firstName} ${actor?.lastName}`,
      userId: session.id,
      timestamp: new Date().toISOString(),
      comment: remarks || actionLabel,
      action: actionLabel,
      actionType: action.actionType,
    };

    // Record current stage so the sentinel can resolve on resubmission.
    if (action.actionType === 'AMENDMENT_REQUEST') {
      historyEntry.returnToStatus = current.exceptionalStatus;
    }

    const data: any = {
      exceptionalStatus: resolvedNextStatus,
      updatedAt: new Date(),
      commentHistory: [...history, historyEntry],
    };

    if (resolvedNextStatus === EXCEPTIONAL_STATUS.COMPLETED) {
      data.status = KYC_STATUS.APPROVED;
    }

    if (action.actionType === 'AMENDMENT_REQUEST') {
      data.status = KYC_STATUS.ACTION_REQUIRED;
      data.amendCycles = { increment: 1 };
    }

    if (action.actionType === 'RESUBMIT') {
      data.status = KYC_STATUS.ESCALATED;
      data.isResubmitted = true;
    }

    // Validate and store resubmit attachments (RESUBMIT action type only)
    const resubmitMemoData: any[] = [];
    if (action.actionType === 'RESUBMIT' && resubmitFiles.length > 0) {
      const countValidation = validateFileCount(resubmitFiles.length);
      if (!countValidation.valid) throw new Error(countValidation.error);
      const sizeValidation = validateTotalUploadSize(resubmitFiles);
      if (!sizeValidation.valid) throw new Error(sizeValidation.error);

      for (let i = 0; i < resubmitFiles.length; i++) {
        const file = resubmitFiles[i];
        const type = resubmitTypes[i] || 'OTHER';
        const buffer = Buffer.from(await file.arrayBuffer());
        const validation = await performCompleteFileValidation(file.name, file.type, buffer, session.id);
        if (!validation.valid || !validation.storageKey) {
          throw new Error(toFriendlyUploadError(validation.error));
        }
        const persistableBuffer = validation.sanitisedBuffer || buffer;
        await writeSecureUploadedFile(validation.storageKey!, persistableBuffer);
        resubmitMemoData.push({
          name: file.name.split('.').slice(0, -1).join('.'),
          originalName: file.name,
          type,
          storageKey: validation.storageKey!,
          fileHash: validation.fileHash,
          uploadedById: session.id,
          kycId: id,
          mimeType: validation.fileType || file.type,
          size: persistableBuffer.length,
        });
      }
    }

    // Use transaction if memo or resubmit files are uploaded
    const txOps: any[] = [prisma.kYC.update({ where: { id }, data })];
    if (storedMemoKey && memo) {
      txOps.push(prisma.memo.create({
        data: {
          name: memo.name.split('.').slice(0, -1).join('.'),
          originalName: memo.name,
          type: 'GOVERNANCE_MEMO',
          storageKey: storedMemoKey,
          fileHash: memoValidation.fileHash,
          uploadedById: session.id,
          kycId: id,
          mimeType: memoValidation.fileType || memo.type,
          size: memo.size
        }
      }));
    }
    if (resubmitMemoData.length > 0) {
      txOps.push(prisma.memo.createMany({ data: resubmitMemoData }));
    }
    if (txOps.length > 1) {
      await prisma.$transaction(txOps);
    } else {
      await prisma.kYC.update({ where: { id }, data });
    }

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: `GOVERNANCE_STEP_${resolvedNextStatus}`,
      details: `Governance step advanced from ${current.exceptionalStatus} to ${resolvedNextStatus}. Action: ${actionLabel}. Permission used: ${stage.permission}`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    return { success: true as const };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_PROCESS_EXCEPTIONAL');
    // Map internal errors to clear, user-friendly messages without leaking internals.
    const raw = String(error?.message || '');
    let friendly = "We couldn't complete this action. Please try again.";
    if (/unauthor|permission|access/i.test(raw)) {
      friendly = "You are not authorized to perform this step on this case.";
    } else if (/memo/i.test(raw)) {
      friendly = "A valid PDF memo attachment is required for this action.";
    } else if (/remarks/i.test(raw)) {
      friendly = "Please provide remarks before submitting this action.";
    } else if (/not found/i.test(raw)) {
      friendly = "This case could not be found. It may have been moved or removed.";
    } else if (/workflow|stage|invalid.*action/i.test(raw)) {
      friendly = "This action isn't available for the case's current stage. Please refresh and try again.";
    } else if (raw && raw.length > 0 && raw.length < 120 && !/prisma|database|fault/i.test(raw)) {
      // Already-friendly validation messages (e.g. file upload errors) pass through.
      friendly = raw;
    }
    return { success: false as const, error: friendly };
  }
}
export async function logBundleDownload(data: any) {
  const session = await getServerSession();
  if (!session) return false;

  try {
    await createAuditLog({
      kycId: data.submissionId,
      userId: session.id,
      userEmail: session.email,
      userName: session.email.split('@')[0],
      action: 'BUNDLE_DOWNLOAD',
      details: `Bundle exported: ${data.bundleName}`
    });
    return true;
  } catch {
    return false;
  }
}

export async function uploadAdditionalDocuments(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  try {
    const id = formData.get('id') as string;
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("Case not found");

    const actor = await prisma.user.findUnique({ 
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const userPermissions = actor?.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    ) || [];

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    const memoData: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      const buffer = Buffer.from(await file.arrayBuffer());

      const validation = await performCompleteFileValidation(file.name, file.type, buffer, session.id);
      
      if (!validation.valid || !validation.storageKey) {
        await createAuditLog({ 
          userId: session.id, 
          userEmail: session.email || 'unknown@nibbank.com.et', 
          action: 'FILE_UPLOAD_REJECTED', 
          details: `Additional document rejected: ${file.name} - ${validation.error}`, 
          kycId: id 
        }).catch(() => {});
        return { success: false, error: toFriendlyUploadError(validation.error) };
      }

      const storedKey = validation.storageKey!;
      const persistableBuffer = validation.sanitisedBuffer || buffer;
      await writeSecureUploadedFile(storedKey, persistableBuffer);
      
      memoData.push({ 
        name: file.name.split('.').slice(0, -1).join('.'),
        originalName: file.name,
        type: type, 
        storageKey: storedKey,
        uploadedById: session.id,
        kycId: id,
        mimeType: validation.fileType || file.type,
        size: persistableBuffer.length,
      });
    }

    if (memoData.length > 0) {
      const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
      const newHistory = [...history, {
        role: session.role || 'BRANCH_OFFICER',
        performedBy: session.email.split('@')[0],
        timestamp: new Date().toISOString(),
        comment: `${files.length} additional document(s) uploaded.`,
        action: "ADD_DOCUMENT"
      }];

      await prisma.$transaction([
        prisma.memo.createMany({ data: memoData }),
        prisma.kYC.update({
          where: { id },
          data: { commentHistory: newHistory }
        })
      ]);

      await createAuditLog({
        userId: session.id,
        userEmail: session.email,
        action: 'ADD_DOCUMENT',
        details: `${files.length} documents appended to case ${id}.`,
        kycId: id
      });
    }

    revalidatePath(`/submissions/${id}`);
    return { success: true };
  } catch (error: any) {
    const { message } = logInstitutionalError(error, 'DB_ADD_DOCUMENTS');
    return { success: false, error: message };
  }
}

export async function toggleSubmissionUrgentFlag(id: string, urgentRemark?: string) {
  const session = await getServerSession();
  if (!session) return { success: false as const, error: "Your session has expired. Please sign in again." };

  try {
    const remark = urgentRemark?.trim();
    if (!remark) {
      throw new Error("Urgent remark is required.");
    }
    if (remark.length > 600) {
      throw new Error("Urgent remark must be 600 characters or less.");
    }

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("KYC record not found");

    const actor = await prisma.user.findUnique({ 
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!actor) throw new Error("User not found");

    // Check permission
    const hasUrgentPermission = hasPermission(actor, 'CASE_FLAG_URGENT');
    if (!hasUrgentPermission && session.role !== 'SUPER_ADMIN') {
      throw new Error("You do not have permission to flag cases as urgent.");
    }

    // Jurisdictional access check
    const userPermissions = actor.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    ) || [];

    if (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, current)) {
      throw new Error("Unauthorized case access.");
    }

    // Toggle urgent flag
    const newUrgentStatus = !current.isUrgent;
    const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
    const urgentHistoryEntry = {
      role: session.role || 'OFFICER',
      performedBy: `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || session.email.split('@')[0],
      timestamp: new Date().toISOString(),
      comment: `${newUrgentStatus ? 'Urgent flag added' : 'Urgent flag removed'}: ${remark}`,
      action: `URGENT_FLAG_${newUrgentStatus ? 'SET' : 'CLEARED'}`
    };

    const updatedKyc = await prisma.kYC.update({
      where: { id },
      data: {
        isUrgent: newUrgentStatus,
        urgentFlaggedById: newUrgentStatus ? session.id : null,
        commentHistory: [...history, urgentHistoryEntry],
        updatedAt: new Date(),
      },
      include: {
        urgentFlaggedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: `URGENT_FLAG_${newUrgentStatus ? 'SET' : 'CLEARED'}`,
      details: `Case ${newUrgentStatus ? 'flagged as' : 'unmarked as'} urgent by ${actor.firstName} ${actor.lastName}. Remark: ${remark}`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    return {
      success: true as const,
      isUrgent: newUrgentStatus,
      urgentFlaggedBy: newUrgentStatus ? updatedKyc.urgentFlaggedBy : null
    };
  } catch (error: any) {
    logInstitutionalError(error, 'TOGGLE_URGENT_FLAG');
    return { success: false as const, error: toFriendlyActionError(error?.message) };
  }
}
