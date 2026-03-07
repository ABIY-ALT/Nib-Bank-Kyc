'use server';

import { prisma } from '@/lib/prisma';
import { KYCStatus, AuditAction } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import fs from 'fs/promises';
import path from 'path';
import { signId, generateSecureNumericCode } from '@/lib/security';
import { getServerSession, verifyPermission } from './auth-server';

/**
 * Resolves the client IP address from request headers.
 */
async function getClientIp() {
  try {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

/**
 * Optimized Submission Fetcher.
 */
export async function getSubmissions(filters?: {
  status?: KYCStatus[];
  branchId?: string;
  createdById?: string;
  assignedToId?: string;
  isResubmitted?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  branch?: string;
  branches?: string[];
  district?: string;
  isExceptional?: boolean;
  submittedBy?: string;
  entityType?: string;
}) {
  try {
    let dateFilter = undefined;
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : undefined;
      const end = filters.endDate ? new Date(filters.endDate) : undefined;
      if (end) end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    return await prisma.kYC.findMany({
      where: {
        status: filters?.status ? { in: filters.status } : undefined,
        branchId: filters?.branchId,
        createdById: filters?.createdById || filters?.submittedBy,
        assignedToId: filters?.assignedToId,
        isResubmitted: filters?.isResubmitted,
        isExceptional: filters?.isExceptional,
        entityType: filters?.entityType,
        branchName: filters?.branches && filters.branches.length > 0 ? {
          in: filters.branches
        } : filters?.branch ? { 
          equals: filters.branch,
          mode: 'insensitive'
        } : undefined,
        branch: (!filters?.branch && !filters?.branches && filters?.district) ? {
          district: { name: filters.district }
        } : undefined,
        active: true,
        createdAt: dateFilter,
      },
      select: {
        id: true,
        customerName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        branchName: true,
        entityType: true,
        isExceptional: true,
        exceptionalStatus: true,
        isResubmitted: true,
        amendCycles: true,
        createdById: true,
        checklistState: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        assignedToId: true,
        branch: {
          select: {
            name: true,
            district: {
              select: { name: true }
            }
          }
        },
        memos: {
          select: {
            id: true,
            name: true,
            type: true,
            fileUrl: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
    });
  } catch (error) {
    console.error('[Vault] getSubmissions error:', error);
    return [];
  }
}

export async function getWorkflowCounts(params: { 
  userId: string, 
  branchName?: string, 
  branches?: string[],
  isSuperAdmin: boolean 
}) {
  const { branchName, branches, isSuperAdmin } = params;
  const session = await getServerSession();
  if (!session) return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };

  const userId = session.id;
  const branchFilter = isSuperAdmin ? {} : (branches && branches.length > 0 ? {
    branchName: { in: branches }
  } : {
    branchName: branchName || "NONE"
  });

  try {
    const [myCount, actionRequired, reviewQueue, resubmitted, escalated, exceptional, branchNodeCount] = await Promise.all([
      prisma.kYC.count({ where: { createdById: userId, active: true } }),
      prisma.kYC.count({ where: { createdById: userId, status: KYCStatus.ACTION_REQUIRED, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: { in: [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW] }, isExceptional: false, isResubmitted: false, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: { in: [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW] }, isResubmitted: true, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: KYCStatus.ESCALATED, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, isExceptional: true, status: { not: KYCStatus.APPROVED }, active: true } }),
      prisma.kYC.count({ where: { branchName: branchName || "NONE", active: true } })
    ]);

    return {
      mySubmissions: myCount,
      actionRequired,
      reviewQueue,
      resubmitted,
      escalated,
      exceptional,
      branchNode: branchNodeCount
    };
  } catch (error) {
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
  }
}

export async function getSubmissionById(id: string) {
  try {
    const kyc = await prisma.kYC.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        branch: { include: { district: true } },
        memos: { orderBy: { createdAt: 'desc' } },
        auditLogs: { orderBy: { timestamp: 'desc' } },
      }
    });
    if (!kyc) return null;
    return {
      ...kyc,
      branchName: kyc.branch.name,
      districtName: kyc.branch.district.name,
      documents: kyc.memos.map(m => ({
        id: m.id,
        name: m.name || 'Document',
        type: m.type || 'Other',
        url: `/api/memos/${signId(m.id)}`
      }))
    };
  } catch (error) {
    return null;
  }
}

export async function updateSubmissionStatus(id: string, status: KYCStatus, reviewerId: string, remarks?: string) {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthenticated");

  const now = new Date();
  const ipAddress = await getClientIp();
  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  const history = (current.commentHistory as any[]) || [];
  const reviewer = await prisma.user.findUnique({ 
    where: { id: session.id },
    include: { roles: { include: { role: true } } }
  });

  const newEntry = {
    role: reviewer?.roles?.[0]?.role?.name || 'SYSTEM',
    performedBy: `${reviewer?.firstName} ${reviewer?.lastName}`,
    timestamp: now.toISOString(),
    comment: remarks || `Status updated to ${status}`,
    action: status
  };

  const kyc = await prisma.kYC.update({
    where: { id },
    data: {
      status,
      assignedToId: session.id,
      updatedAt: now,
      commentHistory: [...history, newEntry],
      isResubmitted: status === KYCStatus.SUBMITTED && current.status === KYCStatus.ACTION_REQUIRED,
      amendCycles: status === KYCStatus.ACTION_REQUIRED ? { increment: 1 } : undefined
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      kycId: id,
      action: AuditAction.STATUS_CHANGE,
      ipAddress,
      details: `Status changed from ${current.status} to ${status}`,
      metadata: { remarks }
    }
  });

  revalidatePath(`/submissions/${id}`);
  revalidatePath('/submissions');
  return kyc;
}

export async function processExceptionalStep(formData: FormData) {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthenticated");

  const id = formData.get('id') as string;
  const nextStatus = formData.get('nextStatus') as string;
  const remarks = formData.get('remarks') as string;
  const actionLabel = formData.get('actionLabel') as string;
  const memoFile = formData.get('memo') as File | null;

  const now = new Date();
  const ipAddress = await getClientIp();
  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  const history = (current.commentHistory as any[]) || [];
  const reviewer = await prisma.user.findUnique({ 
    where: { id: session.id },
    include: { roles: { include: { role: true } } }
  });

  // Handle Memo Upload if present
  let memoData = undefined;
  if (memoFile) {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }
    
    const timestamp = Date.now();
    const storedFileName = `gov_${timestamp}_${memoFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const filePath = path.join(uploadDir, storedFileName);
    const buffer = Buffer.from(await memoFile.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    
    memoData = {
      name: memoFile.name,
      type: 'GOVERNANCE_MEMO',
      fileUrl: `/uploads/${storedFileName}`,
      uploadedById: session.id
    };
  }

  const newEntry = {
    role: reviewer?.roles?.[0]?.role?.name || 'GOVERNANCE',
    performedBy: `${reviewer?.firstName} ${reviewer?.lastName}`,
    timestamp: now.toISOString(),
    comment: remarks || actionLabel,
    action: actionLabel,
    memoAttached: !!memoFile
  };

  const data: any = {
    exceptionalStatus: nextStatus,
    updatedAt: now,
    commentHistory: [...history, newEntry],
    memos: memoData ? { create: memoData } : undefined
  };

  if (nextStatus === 'COMPLETED') {
    data.status = KYCStatus.APPROVED;
  }

  const kyc = await prisma.kYC.update({
    where: { id },
    data
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      kycId: id,
      action: AuditAction.STATUS_CHANGE,
      ipAddress,
      details: `Exceptional flow transition: ${actionLabel}${memoFile ? ' (Memo Attached)' : ''}`,
      metadata: { nextStatus, remarks, hasMemo: !!memoFile }
    }
  });

  revalidatePath(`/submissions/${id}`);
  return kyc;
}

export async function updateSubmissionChecklist(id: string, checklistState: any) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  try {
    const kyc = await prisma.kYC.update({
      where: { id },
      data: { checklistState }
    });
    revalidatePath(`/submissions/${id}`);
    return { success: true, kyc };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createSubmission(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  const isAuthorized = await verifyPermission('CASE_SUBMIT');
  if (!isAuthorized) return { success: false, error: "Unauthorized: Missing submission capability." };

  try {
    const id = formData.get('id') as string;
    const customerName = formData.get('customerName') as string;
    const entityType = formData.get('entityType') as string;
    const branchName = formData.get('branchName') as string;
    const districtName = formData.get('districtName') as string;
    const remarks = formData.get('remarks') as string;
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    const ipAddress = await getClientIp();

    const district = await prisma.district.upsert({
      where: { name: districtName },
      update: {},
      create: { name: districtName }
    });

    const branch = await prisma.branch.upsert({
      where: { name: branchName },
      update: {},
      create: { 
        name: branchName, 
        code: branchName.substring(0, 3).toUpperCase() + generateSecureNumericCode(10, 99),
        districtId: district.id
      }
    });

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }

    const memoData = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i];
      const timestamp = Date.now();
      const storedFileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = path.join(uploadDir, storedFileName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      memoData.push({ name: file.name, type: type, fileUrl: `/uploads/${storedFileName}`, uploadedById: session.id });
    }

    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    
    const kyc = await prisma.kYC.create({
      data: {
        id,
        customerName,
        branchId: branch.id,
        branchName: branchName,
        createdById: session.id,
        status: KYCStatus.SUBMITTED,
        entityType,
        active: true,
        checklistState: {},
        exceptionalStatus: 'None',
        commentHistory: remarks ? [{
          role: 'BRANCH_OFFICER',
          performedBy: `${user?.firstName} ${user?.lastName}`,
          timestamp: now.toISOString(),
          comment: remarks,
          action: 'SUBMIT'
        }] : [],
        memos: { create: memoData }
      }
    });

    await prisma.auditLog.create({
      data: { 
        userId: session.id, 
        kycId: kyc.id, 
        action: AuditAction.CREATE, 
        ipAddress,
        details: `Initial submission for ${customerName} with ${files.length} assets.` 
      }
    });

    revalidatePath('/');
    return { success: true, kyc };
  } catch (error: any) {
    return { success: false, error: error.message || 'Institutional storage fault.' };
  }
}

export async function logBundleDownload(data: {
  submissionId: string;
  performedBy: string;
  bundleName: string;
  sourceDistrict: string;
  sourceBranch: string;
}) {
  const session = await getServerSession();
  if (!session) return false;

  try {
    const ipAddress = await getClientIp();
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        kycId: data.submissionId,
        action: 'BUNDLE_DOWNLOAD',
        ipAddress,
        details: `Case bundle exported by ${data.performedBy}. Source Node: ${data.sourceDistrict} / ${data.sourceBranch}. Bundle: ${data.bundleName}`,
        metadata: {
          bundleName: data.bundleName,
          district: data.sourceDistrict,
          branch: data.sourceBranch,
          official: data.performedBy
        }
      }
    });
    return true;
  } catch (error) {
    console.error('[Archiving Audit] Log Failure:', error);
    return false;
  }
}

export async function initiateExceptionalWorkflow(formData: FormData) {
  const session = await getServerSession();
  if (!session) return { success: false, error: "Unauthenticated" };

  const isAuthorized = await verifyPermission('TRIGGER_GOVERNANCE_FLOW');
  if (!isAuthorized) return { success: false, error: "Unauthorized: Missing governance trigger capability." };

  try {
    const kycId = formData.get('id') as string;
    const reason = formData.get('reason') as string;
    const justification = formData.get('justification') as string;
    const remarks = formData.get('remarks') as string;
    const initiatedBy = formData.get('initiatedBy') as string;
    const memoFile = formData.get('memo') as File;

    const ipAddress = await getClientIp();

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }
    
    const timestamp = Date.now();
    const storedFileName = `init_gov_${timestamp}_${memoFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const filePath = path.join(uploadDir, storedFileName);
    const buffer = Buffer.from(await memoFile.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const now = new Date();
    const current = await prisma.kYC.findUnique({ where: { id: kycId } });
    if (!current) throw new Error("Case not found");

    const history = (current.commentHistory as any[]) || [];

    const kyc = await prisma.kYC.update({
      where: { id: kycId },
      data: {
        isExceptional: true,
        exceptionalStatus: 'AWAITING_DISTRICT',
        updatedAt: now,
        commentHistory: [...history, {
          role: 'BRANCH_MANAGER',
          performedBy: initiatedBy,
          timestamp: now.toISOString(),
          comment: `Exception Initiated: ${reason}. Justification: ${justification}. ${remarks}`,
          action: 'INITIATE_EXCEPTION',
          memoAttached: true
        }],
        memos: {
          create: {
            name: memoFile.name,
            type: 'GOVERNANCE_MEMO',
            fileUrl: `/uploads/${storedFileName}`,
            uploadedById: session.id
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.id,
        kycId,
        action: 'INITIATE_EXCEPTION',
        ipAddress,
        details: `Governance exception initiated for ${kyc.customerName} with memo: ${memoFile.name}.`,
        timestamp: new Date()
      }
    });

    revalidatePath('/submissions/exceptional');
    revalidatePath(`/submissions/${kycId}`);
    return { success: true, kyc };
  } catch (error: any) {
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

    const ipAddress = await getClientIp();

    const current = await prisma.kYC.findUnique({ where: { id } });
    if (!current) throw new Error("Case not found");

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const memoData = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i];
      const timestamp = Date.now();
      const storedFileName = `resubmit_${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = path.join(uploadDir, storedFileName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      memoData.push({ name: file.name, type: type, fileUrl: `/uploads/${storedFileName}`, uploadedById: session.id });
    }

    const now = new Date();
    const history = (current.commentHistory as any[]) || [];
    const user = await prisma.user.findUnique({ where: { id: session.id } });

    const updated = await prisma.kYC.update({
      where: { id },
      data: {
        status: KYCStatus.SUBMITTED,
        isResubmitted: true,
        updatedAt: now,
        commentHistory: [...history, {
          role: 'BRANCH_OFFICER',
          performedBy: `${user?.firstName} ${user?.lastName}`,
          timestamp: now.toISOString(),
          comment: remarks,
          action: 'RESUBMIT'
        }],
        memos: { create: memoData }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.id,
        kycId: id,
        action: 'RESUBMIT',
        ipAddress,
        details: `Case resubmitted with ${files.length} new/corrected assets.`,
        timestamp: new Date()
      }
    });

    revalidatePath(`/submissions/${id}`);
    return { success: true, kyc: updated };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
