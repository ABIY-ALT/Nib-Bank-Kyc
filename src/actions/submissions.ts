
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken } from '@/lib/security';
import { getServerSession } from './auth-server';
import { SubmissionSchema } from '@/lib/validation';
import { KYC_STATUS, EXCEPTIONAL_STATUS } from '@/lib/kyc-data';
import { createAuditLog } from './audit';
import { logInstitutionalError } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';

import { 
  DIRECT_BRANCH_ROLES, 
  PORTFOLIO_BRANCH_ROLES, 
  DISTRICT_DIRECTOR_ROLE, 
  normalizeAssignedBranches, 
  getResolvedUserBranchName, 
  getResolvedUserDistrictName, 
  getNormalizedRole, 
  hasJurisdictionalAccess 
} from '@/lib/jurisdiction';


function hasPermission(user: any, slug: string) {
  return Boolean(
    user?.roles?.some((userRole: any) =>
      userRole?.role?.active !== false &&
      userRole?.role?.permissions?.some((rolePermission: any) => rolePermission?.permission?.slug === slug)
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


function buildRestrictedJurisdictionFilter(
  user: any,
  role: string,
  requestedBranches: string[],
  requestedDistrict?: string
) {
  const assignedBranches = normalizeAssignedBranches(user?.assignedBranches);
  const branchName = getResolvedUserBranchName(user);
  const districtName = getResolvedUserDistrictName(user);

  if (DIRECT_BRANCH_ROLES.has(role)) {
    if (!branchName) return { denied: true };
    if (requestedBranches.length > 0 && !requestedBranches.includes(branchName)) return { denied: true };
    if (requestedDistrict && districtName && requestedDistrict !== districtName) return { denied: true };
    return { filter: { branchName } };
  }

  if (PORTFOLIO_BRANCH_ROLES.has(role)) {
    if (assignedBranches.length > 0) {
      const visibleBranches = requestedBranches.length > 0
        ? assignedBranches.filter((branch) => requestedBranches.includes(branch))
        : assignedBranches;

      if (visibleBranches.length === 0) return { denied: true };

      return {
        filter: {
          branchName: visibleBranches.length === 1 ? visibleBranches[0] : { in: visibleBranches }
        }
      };
    }

    if (!branchName) return { denied: true };
    if (requestedBranches.length > 0 && !requestedBranches.includes(branchName)) return { denied: true };
    if (requestedDistrict && districtName && requestedDistrict !== districtName) return { denied: true };
    return { filter: { branchName } };
  }

  if (role === DISTRICT_DIRECTOR_ROLE) {
    if (!districtName) return { denied: true };
    if (requestedDistrict && requestedDistrict !== districtName) return { denied: true };

    const filter: any = { districtName };
    if (requestedBranches.length > 0) {
      filter.branchName = requestedBranches.length === 1 ? requestedBranches[0] : { in: requestedBranches };
    }

    return { filter };
  }

  return null;
}


/**
 * Format helper to ensure JSON fields are valid and safe.
 */
function formatKYC(kyc: any) {
  return {
    ...kyc,
    checklistState: kyc.checklistState || {},
    commentHistory: Array.isArray(kyc.commentHistory) ? kyc.commentHistory : [],
    documents: kyc.memos?.map((m: any) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      url: `/api/memos/${signDownloadToken(m.id)}`
    })) || []
  };
}

/**
 * Retrieves submissions with PostgreSQL native JSON support and strict jurisdictional filtering.
 */
export async function getSubmissions(filters?: any) {
  const session = await getServerSession();
  if (!session) return [];

  try {
    let dateFilter = undefined;
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : undefined;
      const end = filters.endDate ? new Date(filters.endDate) : undefined;
      if (end) end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    const requestedBranches = Array.isArray(filters?.branches)
      ? filters.branches.filter(Boolean)
      : (filters?.branch ? [filters.branch] : []);
    const requestedDistrict = filters?.district;
    const normalizedRole = getNormalizedRole(session.role);
    const isOwnSubmissionRequest = filters?.submittedBy === session.id || filters?.createdById === session.id;
    let jurisdictionalFilter: any = {};
    
    if (session.role !== 'SUPER_ADMIN' && !isOwnSubmissionRequest) {
      const user = await prisma.user.findUnique({
        where: { id: session.id },
        include: { branch: { include: { district: true } } }
      });
      if (!user) return [];

      const restrictedScope = buildRestrictedJurisdictionFilter(user, normalizedRole, requestedBranches, requestedDistrict);
      if (restrictedScope?.denied) {
        return [];
      }

      if (restrictedScope?.filter) {
        jurisdictionalFilter = restrictedScope.filter;
      } else {
        const assignedBranches = normalizeAssignedBranches(user.assignedBranches);
        const branchName = getResolvedUserBranchName(user);
        const districtName = getResolvedUserDistrictName(user);
      
        if (assignedBranches.length > 0) {
          const visibleBranches = requestedBranches.length > 0
            ? assignedBranches.filter(branch => requestedBranches.includes(branch))
            : assignedBranches;

          if (visibleBranches.length === 0) return [];
          jurisdictionalFilter.branchName = visibleBranches.length === 1 ? visibleBranches[0] : { in: visibleBranches };
        } else if (branchName) {
          if (requestedBranches.length > 0 && !requestedBranches.includes(branchName)) {
            return [];
          }

          if (requestedDistrict && districtName && requestedDistrict !== districtName) {
            return [];
          }

          jurisdictionalFilter.branchName = branchName;
        } else if (districtName) {
          if (requestedDistrict && requestedDistrict !== districtName) {
            return [];
          }

          jurisdictionalFilter.districtName = districtName;

          if (requestedBranches.length > 0) {
            jurisdictionalFilter.branchName = requestedBranches.length === 1 ? requestedBranches[0] : { in: requestedBranches };
          }
        } else {
          if (requestedBranches.length > 0) {
            jurisdictionalFilter.branchName = requestedBranches.length === 1 ? requestedBranches[0] : { in: requestedBranches };
          } else if (requestedDistrict) {
            jurisdictionalFilter.districtName = requestedDistrict;
          } else {
            return [];
          }
        }
      }
    } else {
      if (requestedDistrict) {
        jurisdictionalFilter.districtName = requestedDistrict;
      }

      if (requestedBranches.length > 0) {
        jurisdictionalFilter.branchName = requestedBranches.length === 1 ? requestedBranches[0] : { in: requestedBranches };
      }
    }

    const data = await prisma.kYC.findMany({
      where: {
        ...jurisdictionalFilter,
        status: filters?.status ? { in: filters.status } : undefined,
        branchId: filters?.branchId,
        createdById: filters?.submittedBy || filters?.createdById,
        assignedToId: filters?.assignedToId,
        isResubmitted: filters?.isResubmitted,
        isExceptional: filters?.isExceptional,
        entityType: filters?.entityType,
        submittedAt: dateFilter,
        active: true,
      },
      include: {
        createdBy: true,
        assignedTo: true,
        branch: { include: { district: true } },
        memos: true
      },
      orderBy: { submittedAt: 'desc' },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
    });

    return data.map((item: any) => formatKYC(item));
  } catch (error) {
    logInstitutionalError(error, 'DB_QUERY_SUBMISSIONS');
    return [];
  }
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

    if (
      session.role === 'SUPER_ADMIN' ||
      hasJurisdictionalAccess(user, getNormalizedRole(session.role), session.id, kyc) ||
      await hasFollowUpCaseAccess(user, kyc.id)
    ) {
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
        code: `BR-${Math.floor(100 + Math.random() * 900)}`,
        districtId: district.id
      }
    });

    const memoData = [];
    const uploadDir = path.join(process.cwd(), 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      const storedFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(uploadDir, storedFileName), buffer);
      memoData.push({ 
        name: file.name, 
        type: type, 
        fileUrl: `uploads/${storedFileName}`, 
        uploadedById: session.id 
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

    const actor = await prisma.user.findUnique({ where: { id: session.id } });
    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    const memoData = [];
    const uploadDir = path.join(process.cwd(), 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      const storedFileName = `${Date.now()}_resubmit_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(uploadDir, storedFileName), buffer);
      memoData.push({ 
        name: file.name, 
        type: type, 
        fileUrl: `uploads/${storedFileName}`, 
        uploadedById: session.id,
        kycId: id
      });
    }

    const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
    const newHistory = [...history, {
      role: session.role || 'BRANCH_OFFICER',
      performedBy: session.email.split('@')[0],
      timestamp: new Date().toISOString(),
      comment: remarks || "Documents resubmitted for review.",
      action: "RESUBMIT"
    }];

    const operations: any[] = [];

    // Allow comment-only resubmissions (no files attached) without throwing.
    if (memoData.length > 0) {
      operations.push(prisma.memo.createMany({ data: memoData }));
    }

    operations.push(
      prisma.kYC.update({
        where: { id },
        data: {
          status: KYC_STATUS.SUBMITTED,
          isResubmitted: true,
          commentHistory: newHistory,
          updatedAt: new Date()
        }
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
    const { message } = logInstitutionalError(error, 'DB_RESUBMIT_SUBMISSION');
    return { success: false, error: message };
  }
}

export async function updateSubmissionStatus(id: string, status: string, reviewerId: string, remarks?: string) {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthorized");

  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  if (reviewerId !== session.id && session.role !== 'SUPER_ADMIN') {
    throw new Error("Privilege escalation detected.");
  }

  const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
  const reviewer = await prisma.user.findUnique({ where: { id: session.id } });

  if (!reviewer || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(reviewer, getNormalizedRole(session.role), session.id, current))) {
    throw new Error("Unauthorized case access.");
  }

  const newEntry = {
    role: session.role || 'OFFICER',
    performedBy: `${reviewer?.firstName} ${reviewer?.lastName}`,
    timestamp: new Date().toISOString(),
    comment: remarks || `Status updated to ${status}`,
    action: status
  };

  const kyc = await prisma.kYC.update({
    where: { id },
    data: {
      status,
      assignedToId: session.id,
      updatedAt: new Date(),
      commentHistory: [...history, newEntry],
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

export async function updateSubmissionChecklist(id: string, state: any) {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthorized");

  try {
    const [currentKyc, actor] = await Promise.all([
      prisma.kYC.findUnique({ where: { id } }),
      prisma.user.findUnique({ where: { id: session.id } })
    ]);

    if (!currentKyc) {
      throw new Error("KYC record not found");
    }

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, currentKyc))) {
      throw new Error("Unauthorized case access.");
    }

    const updatedKyc = await prisma.kYC.update({
      where: { id },
      data: { checklistState: state }
    });

    revalidatePath(`/submissions/${id}`);
    return updatedKyc;
  } catch (error) {
    logInstitutionalError(error, 'DB_UPDATE_CHECKLIST');
    throw new Error("Institutional database fault.");
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

    const actor = await prisma.user.findUnique({ where: { id: session.id } });
    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    const storedFileName = `${Date.now()}_governance_${memo.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const buffer = Buffer.from(await memo.arrayBuffer());
    await fs.writeFile(path.join(uploadDir, storedFileName), buffer);

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
          name: memo.name,
          type: 'GOVERNANCE_MEMO',
          fileUrl: `uploads/${storedFileName}`,
          uploadedById: session.id,
          kycId: id
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

export async function getWorkflowCounts(params: { userId: string, branchName?: string, branches?: string[], isSuperAdmin: boolean }) {
  const session = await getServerSession();
  if (!session) return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };

  const { isSuperAdmin } = params;
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: { branch: { include: { district: true } } }
    });
    if (!user) {
      return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
    }

    let scopeFilter: any = {};
    let scopeUnavailable = false;
    const normalizedRole = getNormalizedRole(session.role);
    const restrictedScope = buildRestrictedJurisdictionFilter(user, normalizedRole, [], undefined);
    const branchName = getResolvedUserBranchName(user);
    const districtName = getResolvedUserDistrictName(user);

    if (!isSuperAdmin) {
      if (restrictedScope?.denied) {
        scopeUnavailable = true;
      }

      if (!scopeUnavailable && restrictedScope?.filter) {
        scopeFilter = restrictedScope.filter;
      } else if (!scopeUnavailable) {
        const assignedBranches = normalizeAssignedBranches(user.assignedBranches);
        if (assignedBranches.length > 0) {
          scopeFilter = { branchName: { in: assignedBranches } };
        } else if (branchName) {
          scopeFilter = { branchName };
        } else if (normalizedRole === DISTRICT_DIRECTOR_ROLE && districtName) {
          scopeFilter = { districtName };
        } else {
          scopeUnavailable = true;
        }
      }
    }

    const [myCount, actionRequired, queueCounts] = await Promise.all([
      prisma.kYC.count({ where: { createdById: session.id, active: true } }),
      prisma.kYC.count({
        where: {
          ...(isSuperAdmin ? {} : { createdById: session.id }),
          status: KYC_STATUS.ACTION_REQUIRED,
          active: true
        }
      }),
      scopeUnavailable
        ? Promise.resolve([0, 0, 0, 0] as const)
        : Promise.all([
            prisma.kYC.count({ where: { ...scopeFilter, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isExceptional: false, isResubmitted: false, active: true } }),
            prisma.kYC.count({ where: { ...scopeFilter, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isResubmitted: true, active: true } }),
            prisma.kYC.count({ where: { ...scopeFilter, status: KYC_STATUS.ESCALATED, active: true } }),
            prisma.kYC.count({ where: { ...scopeFilter, isExceptional: true, status: { not: KYC_STATUS.APPROVED }, active: true } })
          ])
    ]);
    const [reviewQueue, resubmitted, escalated, exceptional] = queueCounts;

    return { mySubmissions: myCount, actionRequired: actionRequired, reviewQueue, resubmitted, escalated, exceptional, branchNode: 0 };
  } catch (error) {
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
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

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("Case not found");

    const history = Array.isArray(current?.commentHistory) ? (current.commentHistory as any[]) : [];
    const actor = await prisma.user.findUnique({ where: { id: session.id } });

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    const data: any = { 
      exceptionalStatus: nextStatus, 
      updatedAt: new Date(), 
      commentHistory: [...history, { 
        role: session.role || 'GOVERNANCE', 
        performedBy: `${actor?.firstName} ${actor?.lastName}`, 
        timestamp: new Date().toISOString(), 
        comment: remarks || actionLabel, 
        action: actionLabel 
      }]
    };
    
    if (nextStatus === EXCEPTIONAL_STATUS.COMPLETED) data.status = KYC_STATUS.APPROVED;

    const kyc = await prisma.kYC.update({ where: { id }, data });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: `GOVERNANCE_STEP_${nextStatus}`,
      details: `Governance step advanced to ${nextStatus}. Decision: ${actionLabel}`,
      kycId: id
    });

    revalidatePath(`/submissions/${id}`);
    return kyc;
  } catch (error) {
    logInstitutionalError(error, 'DB_PROCESS_EXCEPTIONAL');
    throw new Error("Institutional database fault.");
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

    const actor = await prisma.user.findUnique({ where: { id: session.id } });
    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, current))) {
      throw new Error("Unauthorized case access.");
    }

    const memoData = [];
    const uploadDir = path.join(process.cwd(), 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      const storedFileName = `${Date.now()}_added_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(uploadDir, storedFileName), buffer);
      memoData.push({ 
        name: file.name, 
        type: type, 
        fileUrl: `uploads/${storedFileName}`, 
        uploadedById: session.id,
        kycId: id
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
