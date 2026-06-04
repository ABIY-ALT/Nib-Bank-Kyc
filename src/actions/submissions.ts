
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

import { 
  normalizeAssignedBranches, 
  normalizeBranchName,
  getResolvedUserBranchName, 
  getResolvedUserDistrictName, 
  getNormalizedRole, 
  hasJurisdictionalAccess,
  GLOBAL_SCOPE_PERMISSIONS,
  PORTFOLIO_SCOPE_PERMISSIONS,
  BRANCH_SCOPE_PERMISSIONS
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
      ? normalizeAssignedBranches(filters.branches)
      : (filters?.branch ? normalizeAssignedBranches([filters.branch]) : []);
    const requestedDistrict = normalizeBranchName(filters?.district);
    const normalizedRole = getNormalizedRole(session.role);
    const isOwnSubmissionRequest = filters?.submittedBy === session.id || filters?.createdById === session.id;
    let jurisdictionalFilter: any = {};
    
    // ===== CRITICAL SECURITY FIX =====
    // Branch filtering MUST be applied to ALL non-admin users, regardless of whether they're requesting their own submissions
    // This prevents KYC Officers from bypassing branch restrictions by querying "their own" submissions
    
    if (session.role === 'SUPER_ADMIN') {
      // Only SUPER_ADMIN gets unrestricted global view
      if (requestedDistrict) {
        jurisdictionalFilter.districtName = requestedDistrict;
      }
      if (requestedBranches.length > 0) {
        jurisdictionalFilter.branchName = requestedBranches.length === 1
          ? normalizeBranchName(requestedBranches[0])
          : { in: requestedBranches.map((branch) => normalizeBranchName(branch)), mode: 'insensitive' };
      }
    } else {
      // ALL non-admin users (KYC Officers, Branch Managers, etc.) MUST have branch filtering applied
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
      if (!user) return [];

      const userPermissions = user.roles.flatMap((ur: any) => 
        ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
      );

      // CRITICAL: Check for ROLE FIRST before permissions to ensure proper scope
      // District Directors must be limited to their district REGARDLESS of other permissions
      const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') || userPermissions.includes('DASHBOARD_VIEW_DISTRICT');
      
      const assignedBranches = normalizeAssignedBranches(user.assignedBranches);
      const branchName = getResolvedUserBranchName(user);
      const districtName = getResolvedUserDistrictName(user);
      const userBranchId = user.branchId;

      const isPortfolioStaff = userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p));
      const isBranchScopeStaff = userPermissions.some(p => BRANCH_SCOPE_PERMISSIONS.has(p));
      const normalizedAssigned = assignedBranches.map((branch) => normalizeBranchName(branch)).filter(Boolean);

      // ===== CRITICAL: Enforce strict branch filtering for branch-level staff =====
      // Branch-level staff (Branch Officers, Branch Managers) MUST be strictly limited to their branch
      const isBranchLevelStaff = branchName && 
        isBranchScopeStaff && 
        !isPortfolioStaff && 
        (normalizedAssigned.length === 0 || normalizedAssigned.length === 1);

      // Check for global oversight ONLY if NOT a district admin AND NOT a branch-level staff
      if (!isDistrictAdmin && !isBranchLevelStaff && userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
        jurisdictionalFilter = {}; // No restriction - only for true global executives
      } else {
        // Standard branch-level access control
        
        // ===== DEBUG LOGGING =====
        logInstitutionalError(
          new Error(`[DEBUG] getSubmissions for user ${session.id}: isDistrictAdmin=${isDistrictAdmin}, isBranchLevelStaff=${isBranchLevelStaff}, districtName=${districtName}, branchName=${branchName}, userBranchId=${userBranchId}`),
          'DEBUG_JURISDICTIONAL_FILTER'
        );

        // ===== SECURITY: DISTRICT DIRECTORS MUST HAVE A DISTRICT ASSIGNED =====
        if (isDistrictAdmin && !districtName) {
          logInstitutionalError(
            new Error(`SECURITY ALERT: District Director ${session.id} has no district assigned. Access denied.`),
            'DISTRICT_ADMIN_NO_DISTRICT_ERROR'
          );
          return [];
        }

        if (isDistrictAdmin && districtName) {
          // District Directors see all cases in their district ONLY
          jurisdictionalFilter.districtName = { equals: districtName, mode: 'insensitive' };
          
          if (requestedBranches.length > 0) {
            const normalizedRequested = requestedBranches.map((b) => normalizeBranchName(b));
            jurisdictionalFilter.branchName = normalizedRequested.length === 1
              ? { equals: normalizedRequested[0], mode: 'insensitive' }
              : { in: normalizedRequested, mode: 'insensitive' };
          }
        } else if (normalizedAssigned.length > 0) {
          // Portfolio staff (KYC Officers with multiple assigned branches)
          const normalizedRequested = requestedBranches.map((branch) => normalizeBranchName(branch).toLowerCase());
          const visibleBranches = requestedBranches.length > 0
            ? normalizedAssigned.filter((branch) => normalizedRequested.includes(branch.toLowerCase()))
            : normalizedAssigned;
          if (visibleBranches.length === 0) return [];
          jurisdictionalFilter.branchName = visibleBranches.length === 1
            ? { equals: normalizeBranchName(visibleBranches[0]), mode: 'insensitive' }
            : { in: visibleBranches.map(b => normalizeBranchName(b)), mode: 'insensitive' };
        } else if (userBranchId || branchName) {
          // Fallback: Branch level staff or single-branch KYC officers
          if (userBranchId) {
            jurisdictionalFilter.branchId = userBranchId;
          } else {
            jurisdictionalFilter.branchName = { equals: normalizeBranchName(branchName!), mode: 'insensitive' };
          }
        } else {
          return []; // No access if no jurisdiction can be determined
        }
      }
    }

    // ===== SECURITY AUDIT: Log data access scope =====
    // This helps detect if non-admin users are accessing data outside their jurisdiction
    const accessScope = {
      userId: session.id,
      role: session.role,
      filter: JSON.stringify(jurisdictionalFilter),
      requestedStatus: filters?.status,
      timestamp: new Date().toISOString()
    };

    // Log for suspicious patterns (non-admin accessing unfiltered submissions)
    if (session.role !== 'SUPER_ADMIN' && Object.keys(jurisdictionalFilter).length === 0) {
      logInstitutionalError(
        new Error(`SECURITY ALERT: Non-admin user accessed submissions without jurisdiction filter`),
        'UNFILTERED_DATA_ACCESS_ATTEMPT'
      );
    }

    const data = await prisma.kYC.findMany({
      where: {
        status: filters?.status ? { in: filters.status } : undefined,
        branchId: filters?.branchId,
        createdById: filters?.submittedBy || filters?.createdById,
        assignedToId: filters?.assignedToId,
        isResubmitted: filters?.isResubmitted,
        isExceptional: filters?.isExceptional,
        entityType: filters?.entityType,
        submittedAt: dateFilter,
        active: true,
        ...jurisdictionalFilter, // CRITICAL: Spread LAST to ensure filters cannot override security constraints
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

    // ===== DEFENSE-IN-DEPTH: Post-query validation for non-admin users =====
    // Ensures no out-of-scope submissions slip through due to database inconsistencies
    if (session.role !== 'SUPER_ADMIN' && Object.keys(jurisdictionalFilter).length > 0) {
      const filtered = data.filter((item: any) => {
        const itemDistrictName = item.districtName ? normalizeBranchName(item.districtName) : null;
        const itemBranchName = item.branchName ? normalizeBranchName(item.branchName) : null;
        
        // Check district filter
        if (jurisdictionalFilter.districtName) {
          const filterDistrict = jurisdictionalFilter.districtName?.equals 
            ? normalizeBranchName(jurisdictionalFilter.districtName.equals)
            : null;
          if (filterDistrict && (!itemDistrictName || itemDistrictName.toLowerCase() !== filterDistrict.toLowerCase())) {
            logInstitutionalError(
              new Error(`SECURITY: Non-admin submission ${item.id} has mismatched district ${item.districtName}, expected ${filterDistrict}`),
              'SUBMISSION_DISTRICT_MISMATCH'
            );
            return false;
          }
        }
        
        // Check branch filter
        if (jurisdictionalFilter.branchName) {
          const allowedBranches = jurisdictionalFilter.branchName?.in ? jurisdictionalFilter.branchName.in : [jurisdictionalFilter.branchName?.equals];
          const normAllowed = allowedBranches.map((b: any) => normalizeBranchName(b).toLowerCase());
          if (!normAllowed.some((b: string) => b === itemBranchName?.toLowerCase())) {
            logInstitutionalError(
              new Error(`SECURITY: Non-admin submission ${item.id} has unauthorized branch ${item.branchName}`),
              'SUBMISSION_BRANCH_MISMATCH'
            );
            return false;
          }
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
  if (!session) throw new Error("Unauthorized");

  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  if (reviewerId !== session.id && session.role !== 'SUPER_ADMIN') {
    throw new Error("Privilege escalation detected.");
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
      throw new Error("KYC record not found");
    }

    const userPermissions = actor?.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    ) || [];

    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, userPermissions, session.id, currentKyc))) {
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
      throw new Error("Unauthorized case access.");
    }

    // Dynamic Permission Check
    if (session.role !== 'SUPER_ADMIN' && !hasPermission(actor, 'BRANCH_CASE_CREATE')) {
      throw new Error("Insufficient permissions. Required: BRANCH_CASE_CREATE");
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
      throw new Error(`Security check failed: ${validation.error}`);
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
    throw new Error("Authentication required");
  }

  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  
  try {
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
    if (!user) {
      return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
    }

    const userPermissions = user.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
    );

    let scopeFilter: any = {};
    let scopeUnavailable = false;

    if (!isSuperAdmin) {
      // Check for global oversight first
      if (userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
        scopeFilter = {}; // No restriction
      } else {
        const assignedBranches = normalizeAssignedBranches(user.assignedBranches);
        const branchName = getResolvedUserBranchName(user);
        const districtName = getResolvedUserDistrictName(user);

        const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') || userPermissions.includes('DASHBOARD_VIEW_DISTRICT');
        const isPortfolioStaff = userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p));

        if (isDistrictAdmin && districtName) {
          scopeFilter = { districtName };
        } else if (isPortfolioStaff) {
          if (assignedBranches.length > 0) {
            scopeFilter = { branchName: { in: assignedBranches } };
          } else if (branchName) {
            scopeFilter = { branchName };
          } else {
            scopeUnavailable = true;
          }
        } else {
          // Direct Branch Staff
          if (!branchName) {
            scopeUnavailable = true;
          } else {
            scopeFilter = { branchName };
          }
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
    const memo = formData.get('memo') as File | null;

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

    const data: any = { 
      exceptionalStatus: nextStatus, 
      updatedAt: new Date(), 
      commentHistory: [...history, { 
        role: session.role || 'GOVERNANCE', 
        performedBy: `${actor?.firstName} ${actor?.lastName}`, 
        timestamp: new Date().toISOString(), 
        comment: remarks || actionLabel, 
        action: actionLabel,
        actionType: action.actionType
      }]
    };
    
    if (nextStatus === EXCEPTIONAL_STATUS.COMPLETED) {
      data.status = KYC_STATUS.APPROVED;
    }

    // Use transaction if memo is uploaded
    if (storedMemoKey && memo) {
      await prisma.$transaction([
        prisma.memo.create({
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
        }),
        prisma.kYC.update({ where: { id }, data })
      ]);
    } else {
      await prisma.kYC.update({ where: { id }, data });
    }

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: `GOVERNANCE_STEP_${nextStatus}`,
      details: `Governance step advanced from ${current.exceptionalStatus} to ${nextStatus}. Action: ${actionLabel}. Permission used: ${stage.permission}`,
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
