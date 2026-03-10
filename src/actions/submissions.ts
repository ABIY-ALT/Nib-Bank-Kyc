
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken } from '@/lib/security';
import { getServerSession } from './auth-server';
import { SubmissionSchema } from '@/lib/validation';
import { KYC_STATUS, EXCEPTIONAL_STATUS } from '@/lib/kyc-data';
import { createAuditLog } from './audit';
import fs from 'fs/promises';
import path from 'path';

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

    let jurisdictionalFilter: any = {};
    
    if (session.role !== 'SUPER_ADMIN') {
      const user = await prisma.user.findUnique({ where: { id: session.id } });
      if (!user) return [];

      const assignedBranches = user.assignedBranches ? user.assignedBranches.split(',').filter(Boolean) : [];
      
      if (assignedBranches.length > 0) {
        jurisdictionalFilter.branchName = { in: assignedBranches };
      } else if (user.branchName) {
        jurisdictionalFilter.branchName = user.branchName;
      } else if (filters?.submittedBy && filters.submittedBy === session.id) {
        jurisdictionalFilter.createdById = session.id;
      } else {
        return [];
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

    return data.map(item => formatKYC(item));
  } catch (error) {
    console.error("[Submissions Action] Fetch Fault:", error);
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

    if (session.role === 'SUPER_ADMIN') {
      return formatKYC(kyc);
    }

    if (kyc.createdById === session.id || kyc.assignedToId === session.id) {
      return formatKYC(kyc);
    }

    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user) return null;

    const assignedBranches = user.assignedBranches ? user.assignedBranches.split(',').filter(Boolean) : [];
    const isAtBranch = kyc.branchId === user.branchId;
    const isInPortfolio = assignedBranches.includes(kyc.branchName);

    if (isAtBranch || isInPortfolio) {
      return formatKYC(kyc);
    }

    return null;
  } catch (error) {
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
        commentHistory: [],
        memos: { create: memoData }
      }
    });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      userName: session.email.split('@')[0],
      action: 'CREATE',
      details: `Initial submission for ${validated.customerName}.`,
      kycId: kyc.id
    });

    revalidatePath('/');
    return { success: true, kyc };
  } catch (error: any) {
    console.error("[Submissions Action] Create Fault:", error);
    return { success: false, error: error.message };
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

    const history = Array.isArray(current.commentHistory) ? current.commentHistory : [];
    const newHistory = [...history, {
      role: 'BRANCH_OFFICER',
      performedBy: session.email.split('@')[0],
      timestamp: new Date().toISOString(),
      comment: remarks || "Documents resubmitted for review.",
      action: "RESUBMIT"
    }];

    await prisma.$transaction([
      prisma.memo.createMany({ data: memoData }),
      prisma.kYC.update({
        where: { id },
        data: {
          status: KYC_STATUS.SUBMITTED,
          isResubmitted: true,
          commentHistory: newHistory,
          updatedAt: new Date()
        }
      })
    ]);

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
    return { success: false, error: error.message };
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

  const history = Array.isArray(current.commentHistory) ? current.commentHistory : [];
  const reviewer = await prisma.user.findUnique({ where: { id: session.id } });

  const newEntry = {
    role: reviewer?.roles?.[0]?.role?.name || 'OFFICER',
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

  const kyc = await prisma.kYC.update({
    where: { id },
    data: { checklistState: state }
  });

  revalidatePath(`/submissions/${id}`);
  return kyc;
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

    const uploadDir = path.join(process.cwd(), 'uploads');
    const storedFileName = `${Date.now()}_governance_${memo.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const buffer = Buffer.from(await memo.arrayBuffer());
    await fs.writeFile(path.join(uploadDir, storedFileName), buffer);

    const history = Array.isArray(current.commentHistory) ? current.commentHistory : [];
    const newEntry = {
      role: 'SUPERVISOR',
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
    return { success: false, error: e.message };
  }
}

export async function getWorkflowCounts(params: { userId: string, branchName?: string, branches?: string[], isSuperAdmin: boolean }) {
  const session = await getServerSession();
  if (!session) return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };

  const { branchName, branches, isSuperAdmin } = params;
  
  const branchFilter = isSuperAdmin ? {} : (branches && branches.length > 0 ? { branchName: { in: branches } } : { branchName: branchName || "NONE" });

  try {
    const [myCount, actionRequired, reviewQueue, resubmitted, escalated, exceptional] = await Promise.all([
      prisma.kYC.count({ where: { createdById: session.id, active: true } }),
      prisma.kYC.count({ where: { createdById: session.id, status: KYC_STATUS.ACTION_REQUIRED, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isExceptional: false, isResubmitted: false, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isResubmitted: true, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: KYC_STATUS.ESCALATED, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, isExceptional: true, status: { not: KYC_STATUS.APPROVED }, active: true } })
    ]);

    return { mySubmissions: myCount, actionRequired: 0, reviewQueue, resubmitted, escalated, exceptional, branchNode: 0 };
  } catch (error) {
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
  }
}

export async function processExceptionalStep(formData: FormData) {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthorized");

  const id = formData.get('id') as string;
  const nextStatus = formData.get('nextStatus') as string;
  const remarks = formData.get('remarks') as string;
  const actionLabel = formData.get('actionLabel') as string;

  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("Case not found");

  const history = Array.isArray(current?.commentHistory) ? current.commentHistory : [];
  const actor = await prisma.user.findUnique({ where: { id: session.id } });

  const data: any = { 
    exceptionalStatus: nextStatus, 
    updatedAt: new Date(), 
    commentHistory: [...history, { 
      role: actor?.roles?.[0]?.role?.name || 'GOVERNANCE', 
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
