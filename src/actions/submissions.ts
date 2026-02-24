
'use server';

import { prisma } from '@/lib/prisma';
import { KYCStatus, UserStatus, AuditAction } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';

/**
 * Optimized Submission Fetcher.
 */
export async function getSubmissions(filters?: {
  status?: KYCStatus[];
  branchId?: string;
  createdById?: string;
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
}) {
  try {
    return await prisma.kYC.findMany({
      where: {
        status: filters?.status ? { in: filters.status } : undefined,
        branchId: filters?.branchId,
        createdById: filters?.createdById || filters?.submittedBy,
        isResubmitted: filters?.isResubmitted,
        isExceptional: filters?.isExceptional,
        branch: filters?.branches && filters.branches.length > 0 ? {
          name: { in: filters.branches }
        } : filters?.branch ? { 
          name: filters.branch 
        } : filters?.district ? {
          district: { name: filters.district }
        } : undefined,
        active: true,
        createdAt: (filters?.startDate || filters?.endDate) ? {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate) : undefined,
        } : undefined,
      },
      select: {
        id: true,
        customerName: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        branchName: true,
        entityType: true,
        isExceptional: true,
        isResubmitted: true,
        amendCycles: true,
        createdById: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        branch: {
          select: {
            name: true,
            district: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
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
  const { userId, branchName, branches, isSuperAdmin } = params;

  const branchFilter = isSuperAdmin ? {} : (branches && branches.length > 0 ? {
    branch: { name: { in: branches } }
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
    console.error('[Vault Counts] Failure:', error);
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
  }
}

export async function getSubmissionById(id: string) {
  try {
    const kyc = await prisma.kYC.findUnique({
      where: { id },
      include: {
        createdBy: true,
        assignedTo: true,
        branch: { include: { district: true } },
        memos: {
          orderBy: { createdAt: 'desc' }
        },
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
        url: m.fileUrl
      }))
    };
  } catch (error) {
    return null;
  }
}

export async function updateSubmissionStatus(id: string, status: KYCStatus, reviewerId: string, remarks?: string) {
  const now = new Date();
  
  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  const history = (current.commentHistory as any[]) || [];
  const reviewer = await prisma.user.findUnique({ 
    where: { id: reviewerId },
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
      assignedToId: reviewerId,
      updatedAt: now,
      commentHistory: [...history, newEntry],
      isResubmitted: status === KYCStatus.SUBMITTED && current.status === KYCStatus.ACTION_REQUIRED,
      amendCycles: status === KYCStatus.ACTION_REQUIRED ? { increment: 1 } : undefined
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: reviewerId,
      kycId: id,
      action: AuditAction.STATUS_CHANGE,
      details: `Status changed from ${current.status} to ${status}`,
      metadata: { remarks }
    }
  });

  revalidatePath(`/submissions/${id}`);
  revalidatePath('/submissions');
  revalidatePath('/submissions/queue');
  revalidatePath('/submissions/amendments');
  return kyc;
}

export async function updateSubmissionChecklist(id: string, checklistState: any) {
  try {
    const kyc = await prisma.kYC.update({
      where: { id },
      data: { checklistState }
    });
    // Global revalidation to ensure other users see updated state upon navigation/refresh
    revalidatePath(`/submissions/${id}`);
    revalidatePath('/submissions/queue');
    return { success: true, kyc };
  } catch (error: any) {
    console.error('[Vault checklistState Sync Error]:', error);
    return { success: false, error: error.message };
  }
}

export async function createSubmission(formData: FormData) {
  try {
    const id = formData.get('id') as string;
    const customerName = formData.get('customerName') as string;
    const entityType = formData.get('entityType') as string;
    const branchName = formData.get('branchName') as string;
    const districtName = formData.get('districtName') as string;
    const createdById = formData.get('submittedById') as string;
    const createdByName = formData.get('submittedByName') as string;
    const remarks = formData.get('remarks') as string;
    
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

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
        code: branchName.substring(0, 3).toUpperCase() + Math.floor(10 + Math.random() * 90),
        districtId: district.id
      }
    });

    const nameParts = createdByName.split(' ');
    await prisma.user.upsert({
      where: { id: createdById },
      update: { firstName: nameParts[0] || 'Branch', lastName: nameParts[1] || 'Officer' },
      create: {
        id: createdById,
        firebaseUid: createdById,
        email: `${createdById}@nibbank.com.et`,
        firstName: nameParts[0] || 'Branch',
        lastName: nameParts[1] || 'Officer',
        status: UserStatus.ACTIVE,
        branchId: branch.id
      }
    });

    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const memoData = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i];
      const timestamp = Date.now();
      const storedFileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = path.join(uploadDir, storedFileName);
      
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      memoData.push({
        name: file.name,
        type: type,
        fileUrl: `uploads/${storedFileName}`,
        uploadedById: createdById
      });
    }

    const now = new Date();
    
    const kyc = await prisma.kYC.create({
      data: {
        id,
        customerName,
        customerIdNumber: id,
        branchId: branch.id,
        branchName: branchName,
        createdById,
        status: KYCStatus.SUBMITTED,
        entityType,
        active: true,
        isExceptional: false,
        isResubmitted: false,
        checklistState: {},
        commentHistory: remarks ? [{
          role: 'BRANCH_OFFICER',
          performedBy: createdByName,
          timestamp: now.toISOString(),
          comment: remarks,
          action: 'SUBMIT'
        }] : [],
        memos: {
          create: memoData
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: createdById,
        kycId: kyc.id,
        action: AuditAction.CREATE,
        details: `Initial submission for ${customerName}`
      }
    });

    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/queue');
    return { success: true, kyc };
  } catch (error: any) {
    console.error('[Blueprint Error]:', error);
    return { success: false, error: error.message || 'Institutional storage fault.' };
  }
}

export async function resubmitSubmission(formData: FormData) {
  try {
    const id = formData.get('id') as string;
    const userId = formData.get('userId') as string;
    const remarks = formData.get('remarks') as string;
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    const current = await prisma.kYC.findUnique({ 
      where: { id },
      include: { createdBy: true }
    });
    if (!current) throw new Error("KYC record not found");

    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: { roles: { include: { role: true } } }
    });

    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const memoData = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i];
      const timestamp = Date.now();
      const storedFileName = `${timestamp}_resubmit_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = path.join(uploadDir, storedFileName);
      
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      memoData.push({
        name: file.name,
        type: type,
        fileUrl: `uploads/${storedFileName}`,
        uploadedById: userId
      });
    }

    const now = new Date();
    const history = (current.commentHistory as any[]) || [];
    const newEntry = {
      role: user?.roles?.[0]?.role?.name || 'BRANCH_OFFICER',
      performedBy: `${user?.firstName} ${user?.lastName}`,
      timestamp: now.toISOString(),
      comment: remarks || `Case resubmitted with ${files.length} new documents.`,
      action: 'RESUBMIT'
    };

    const kyc = await prisma.kYC.update({
      where: { id },
      data: {
        status: KYCStatus.SUBMITTED,
        isResubmitted: true,
        updatedAt: now,
        commentHistory: [...history, newEntry],
        memos: {
          create: memoData
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId,
        kycId: id,
        action: AuditAction.STATUS_CHANGE,
        details: `Resubmitted with ${files.length} new documents. Remarks: ${remarks}`
      }
    });

    revalidatePath(`/submissions/${id}`);
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/amendments');
    return { success: true };
  } catch (error: any) {
    console.error('[Vault Resubmission] Failure:', error);
    return { success: false, error: error.message || 'Institutional storage fault during resubmission.' };
  }
}

export async function logBundleDownload(data: any) {
  return true;
}

export async function initiateExceptionalWorkflow(kycId: string, data: any) {
  try {
    return await prisma.kYC.update({
      where: { id: kycId },
      data: {
        isExceptional: true,
        updatedAt: new Date()
      }
    });
  } catch (e) {
    throw e;
  }
}
