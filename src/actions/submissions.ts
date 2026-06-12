
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
import { EXCEPTIONAL_RESTORE_SENTINEL } from '@/lib/kyc-data';

import { 
  normalizeAssignedBranches, 
  normalizeBranchName,
  getResolvedUserBranchName, 
  getResolvedUserDistrictName, 
  getNormalizedRole,
  hasJurisdictionalAccess,
  isSaturdayNow,
  GLOBAL_SCOPE_PERMISSIONS,
  PORTFOLIO_SCOPE_PERMISSIONS,
  BRANCH_SCOPE_PERMISSIONS
} from '@/lib/jurisdiction';


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
  return {
    ...kyc,
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
    if (requestedDistrict) filter.districtName = requestedDistrict;
    if (requestedBranches.length > 0) {
      filter.branchName = requestedBranches.length === 1
        ? normalizeBranchName(requestedBranches[0])
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

  const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') || userPermissions.includes('DASHBOARD_VIEW_DISTRICT');
  const assignedBranches = normalizeAssignedBranches(user.assignedBranches);
  const branchName = getResolvedUserBranchName(user);
  const districtName = getResolvedUserDistrictName(user);
  const userBranchId = user.branchId;

  const isPortfolioStaff = userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p));
  const isBranchScopeStaff = userPermissions.some(p => BRANCH_SCOPE_PERMISSIONS.has(p));
  const normalizedAssigned = assignedBranches.map((branch) => normalizeBranchName(branch)).filter(Boolean);

  // Saturday Configuration: this officer sees cases from all branches on Saturdays,
  // independent of their normal branch mappings.
  if ((user as any).saturdayAllBranches && isSaturdayNow()) {
    return {};
  }

  const isBranchLevelStaff = branchName && 
    isBranchScopeStaff && 
    !isPortfolioStaff && 
    (normalizedAssigned.length === 0 || normalizedAssigned.length === 1);

  if (!isDistrictAdmin && !isBranchLevelStaff && userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
    return {}; // No restriction for global executives
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
  branches?: string[],
  branchId?: string,
  submittedBy?: string,
  createdById?: string,
  assignedToId?: string,
  isResubmitted?: boolean,
  isExceptional?: boolean,
  entityType?: string,
  startDate?: string,
  endDate?: string,
  limit?: number,
  offset?: number
}) {
  const session = await getServerSession();
  if (!session) return [];

  try {
    const requestedDistrict = filters?.district;
    const requestedBranches = filters?.branches || [];
    
    const dateFilter = filters?.startDate ? {
      gte: new Date(filters.startDate),
      lte: filters.endDate ? new Date(filters.endDate) : undefined
    } : undefined;

    const jurisdictionalFilter = await buildJurisdictionalFilter(session, requestedDistrict, requestedBranches);
    if (jurisdictionalFilter === null) return [];

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { roles: { include: { role: true } } }
    });
    
    const roleNames = user?.roles.map(r => r.role.name) || [];
    const isOfficer = roleNames.some(r => ['KYC_OFFICER', 'KYC_SPECIALIST', 'SUPERVISOR'].includes(r));
    const isManagement = session.role === 'SUPER_ADMIN' || roleNames.includes('DISTRICT_DIRECTOR');

    const where: any = {
      status: filters?.status ? { in: filters.status } : undefined,
      branchId: filters?.branchId,
      createdById: filters?.submittedBy || filters?.createdById,
      assignedToId: filters?.assignedToId,
      isResubmitted: filters?.isResubmitted,
      isExceptional: filters?.isExceptional ?? false,
      entityType: filters?.entityType,
      submittedAt: dateFilter,
      active: true,
      ...jurisdictionalFilter,
    };

    if (isOfficer && !isManagement && !filters?.assignedToId) {
      where.OR = [
        { assignedToId: session.id },
        { assignedToId: null },
        { status: KYC_STATUS.SUBMITTED }
      ];
    }

    // Log for suspicious patterns (non-admin accessing unfiltered submissions)
    if (session.role !== 'SUPER_ADMIN' && Object.keys(jurisdictionalFilter).length === 0) {
      logInstitutionalError(
        new Error(`SECURITY ALERT: Non-admin user accessed submissions without jurisdiction filter`),
        'UNFILTERED_DATA_ACCESS_ATTEMPT'
      );
    }

    const data = await prisma.kYC.findMany({
      where,
      include: {
        createdBy: true,
        assignedTo: true,
        branch: { include: { district: true } },
        memos: true
      },
      orderBy: { submittedAt: 'desc' },
      take: filters?.limit || 5000,
      skip: filters?.offset || 0,
    });

    // Defense-in-depth validation
    if (session.role !== 'SUPER_ADMIN' && Object.keys(jurisdictionalFilter).length > 0) {
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
          const allowedBranches = jurisdictionalFilter.branchName?.in ? jurisdictionalFilter.branchName.in : [jurisdictionalFilter.branchName?.equals];
          const normAllowed = allowedBranches.map((b: any) => normalizeBranchName(b).toLowerCase());
          if (!normAllowed.some((b: string) => b === itemBranchName?.toLowerCase())) return false;
        }
        
        return true;
      });
      
      return filtered.map((item: any) => formatKYC(item));
    }

    return data.map((item: any) => formatKYC(item));
  } catch (error) {
    logInstitutionalError(error, 'DB_QUERY_SUBMISSIONS');
    return [];
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

export async function getCaseMetrics(filters?: CaseMetricsFilter): Promise<CaseMetrics> {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  const requestedDistrict = filters?.district;
  const requestedBranches = filters?.branches || (filters?.branch ? [filters.branch] : []);
  const jurisdictionalFilter = await buildJurisdictionalFilter(session, requestedDistrict, requestedBranches);
  if (jurisdictionalFilter === null) {
    return { total: 0, authorized: 0, needAmendment: 0, unseen: 0, running: 0, viewed: 0, resubmitted: 0, escalated: 0, exceptional: 0, pending: 0, performanceIndex: 100 };
  }

  const dateFilter = filters?.startDate ? {
    gte: new Date(filters.startDate),
    lte: filters?.endDate ? new Date(filters.endDate) : undefined
  } : undefined;

  const statusFilter = filters?.status
    ? Array.isArray(filters.status)
      ? { in: filters.status }
      : { equals: filters.status }
    : undefined;

  const where: any = {
    ...jurisdictionalFilter,
    branchId: filters?.branchId,
    createdById: filters?.submittedBy || filters?.createdById,
    assignedToId: filters?.assignedToId,
    isResubmitted: filters?.isResubmitted,
    isExceptional: filters?.isExceptional,
    entityType: filters?.entityType,
    submittedAt: dateFilter,
    status: statusFilter,
    active: true,
  };

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

  try {
    // "Unseen" is purely status-driven: a case stays SUBMITTED (unseen) until the
    // mapped KYC Officer opens it, which transitions it to IN_REVIEW. This keeps
    // counts identical for every viewer and ensures stats only move when the
    // mapped officer acts on a case.
    const [rawTotal, authorized, needAmendment, running, viewed, resubmitted, escalated, exceptional, pending, unseen] = await Promise.all([
      prisma.kYC.count({ where }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.APPROVED, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.ACTION_REQUIRED, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.IN_REVIEW, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: { in: [KYC_STATUS.IN_REVIEW, KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED] }, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, isResubmitted: true, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.ESCALATED, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, isExceptional: true } }),
      prisma.kYC.count({ where: { ...where, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isExceptional: false } }),
      prisma.kYC.count({ where: { ...where, status: KYC_STATUS.SUBMITTED, isExceptional: false } })
    ]);

    // NEW: Refined Performance Calculation Rule
    // Formula: (Authorized + Amendment) / (Authorized + Amendment + Unseen) * 100
    // Total shown also only considers these three.
    
    const unseenTotal = pending - running; // pending includes SUBMITTED and IN_REVIEW
    const denominator = authorized + needAmendment + unseenTotal;
    const numerator = authorized + needAmendment;
    const performanceIndex = denominator > 0 ? Math.round((numerator / denominator) * 100) : 100;
    const total = denominator;

    return { total, authorized, needAmendment, unseen, running, viewed, resubmitted, escalated, exceptional, pending, performanceIndex };
  } catch (error) {
    logInstitutionalError(error, 'DB_CASE_METRICS');
    return { total: 0, authorized: 0, needAmendment: 0, unseen: 0, running: 0, viewed: 0, resubmitted: 0, escalated: 0, exceptional: 0, pending: 0, performanceIndex: 100 };
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

export async function createSubmission(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  try {
    const validated = SubmissionSchema.parse({
      id: formData.get('id'),
      customerName: formData.get('customerName'),
      entityType: formData.get('entityType'),
      branchName: formData.get('branchName'),
      districtName: formData.get('districtName'),
      remarks: formData.get('remarks'),
    });

    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    // SECURITY: File upload validation (A05:2021 - Security Misconfiguration)
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
        return { success: false, error: `Security check failed: ${validation.error}` };
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

    const kyc = await prisma.kYC.create({
      data: {
        id: validated.id,
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

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      userName: session.email.split('@')[0],
      action: 'CREATE',
      details: `Initial submission for ${validated.customerName}. Remarks persisted in history.`,
      kycId: kyc.id
    });

    revalidatePath('/');
    revalidatePath('/submissions/my');
    return { success: true, kyc };
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      const msg = error.issues.map((i: any) => i.message).join(', ');
      return { success: false, error: msg };
    }
    const { message } = logInstitutionalError(error, 'DB_CREATE_SUBMISSION');
    return { success: false, error: message };
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
        return { success: false, error: `Security check failed: ${validation.error}` };
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

export async function updateSubmissionStatus(id: string, status: string, reviewerId: string, remarks?: string) {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("The case could not be found.");

  if (reviewerId !== session.id && session.role !== 'SUPER_ADMIN') {
    throw new Error("Access denied.");
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
    throw new Error("You do not have permission to access this case.");
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

  let updatedHistory = history;
  if ((isStatusChanging || hasNewRemarks) && !isDuplicateAction && !isAutoOpen) {
    const newEntry = {
      role: session.role || 'OFFICER',
      performedBy: `${reviewer?.firstName} ${reviewer?.lastName}`,
      userId: session.id,
      timestamp: new Date().toISOString(),
      comment: remarks || `Status updated to ${status}`,
      action: status
    };
    updatedHistory = [...history, newEntry];
  }

  const kyc = await prisma.kYC.update({
    where: { id },
    data: {
      status,
      assignedToId: session.id,
      updatedAt: new Date(),
      commentHistory: updatedHistory,
      isResubmitted: status === KYC_STATUS.SUBMITTED && current.status === KYC_STATUS.ACTION_REQUIRED,
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
  return kyc;
}

export async function returnEscalatedCaseToOfficer(id: string, remarks: string) {
  const session = await getServerSession();
  if (!session) throw new Error("Please log in to continue.");

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

  if (!current) throw new Error("The case could not be found.");

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
    throw new Error("No primary officer is currently mapped to this branch.");
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

  const kyc = await prisma.kYC.update({
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
  return kyc;
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
      throw new Error(`The file failed security checks: ${validation.error}`);
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

    const [myCount, actionRequired, queueCounts, unseenCases, exceptionalCount, escalatedCount, resubmittedCount] = await Promise.all([
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
        where: { ...jurisdictionalFilter, active: true, isExceptional: false },
        _count: true
      }),
      // Status-driven: a case is "unseen" until the mapped officer opens it
      // (open transitions SUBMITTED -> IN_REVIEW), regardless of who is viewing.
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          status: KYC_STATUS.SUBMITTED,
          active: true,
          isExceptional: false
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
      prisma.kYC.count({
        where: {
          ...jurisdictionalFilter,
          isResubmitted: true,
          isExceptional: false,
          active: true
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
      branchNode: statsMap[KYC_STATUS.IN_REVIEW] || 0
    };
  } catch (error) {
    logInstitutionalError(error, 'DB_WORKFLOW_COUNTS');
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, unseenCases: 0, branchNode: 0 };
  }
}

export async function processExceptionalStep(formData: FormData) {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthorized");

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
        throw new Error(`Memo validation failed: ${memoValidation.error}`);
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
          throw new Error(`File validation failed: ${validation.error}`);
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
    return { success: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_PROCESS_EXCEPTIONAL');
    throw new Error(error.message || "Institutional database fault.");
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
        return { success: false, error: `Security check failed: ${validation.error}` };
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
  if (!session) throw new Error("Unauthorized");

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
      success: true, 
      isUrgent: newUrgentStatus,
      urgentFlaggedBy: newUrgentStatus ? updatedKyc.urgentFlaggedBy : null
    };
  } catch (error: any) {
    const { message } = logInstitutionalError(error, 'TOGGLE_URGENT_FLAG');
    return { success: false, error: message };
  }
}
