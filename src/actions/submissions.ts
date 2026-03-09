
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken } from '@/lib/security';
import { getServerSession } from './auth-server';
import { SubmissionSchema } from '@/lib/validation';
import { KYC_STATUS, EXCEPTIONAL_STATUS } from '@/lib/kyc-data';
import fs from 'fs/promises';
import path from 'path';

/**
 * Retrieves submissions with PostgreSQL native JSON support.
 */
export async function getSubmissions(filters?: any) {
  try {
    let dateFilter = undefined;
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : undefined;
      const end = filters.endDate ? new Date(filters.endDate) : undefined;
      if (end) end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    const data = await prisma.kYC.findMany({
      where: {
        status: filters?.status ? { in: filters.status } : undefined,
        branchId: filters?.branchId,
        createdById: filters?.createdById || filters?.submittedBy,
        assignedToId: filters?.assignedToId,
        isResubmitted: filters?.isResubmitted,
        isExceptional: filters?.isExceptional,
        entityType: filters?.entityType,
        branchName: filters?.branches && filters.branches.length > 0 ? { in: filters.branches } : filters?.branch ? { equals: filters.branch } : undefined,
        branch: (!filters?.branch && !filters?.branches && filters?.district) ? { district: { name: filters.district } } : undefined,
        active: true,
        submittedAt: dateFilter,
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

    // In PostgreSQL with Json columns, Prisma returns objects directly
    return data.map(item => ({
      ...item,
      checklistState: item.checklistState || {},
      commentHistory: item.commentHistory || []
    }));
  } catch (error) {
    console.error("[Submissions Action] Fetch Fault:", error);
    return [];
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
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i] || 'OTHER';
      const storedFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(uploadDir, storedFileName), buffer);
      memoData.push({ name: file.name, type: type, fileUrl: `/uploads/${storedFileName}`, uploadedById: session.id });
    }

    const kyc = await prisma.kYC.create({
      data: {
        id: validated.id,
        customerName: validated.customerName,
        branchId: branch.id,
        branchName: validated.branchName,
        createdById: session.id,
        status: KYC_STATUS.SUBMITTED,
        entityType: validated.entityType,
        remarks: validated.remarks,
        checklistState: {}, // Native JSON object for PostgreSQL
        commentHistory: [], // Native JSON object for PostgreSQL
        memos: { create: memoData }
      }
    });

    await prisma.auditLog.create({
      data: { 
        userId: session.id, 
        kycId: kyc.id, 
        action: 'CREATE', 
        details: `Initial submission for ${validated.customerName}.`, 
        userEmail: session.email,
        userName: session.email.split('@')[0]
      }
    });

    revalidatePath('/');
    return { success: true, kyc };
  } catch (error: any) {
    console.error("[Submissions Action] Create Fault:", error);
    return { success: false, error: error.message };
  }
}

export async function updateSubmissionStatus(id: string, status: string, reviewerId: string, remarks?: string) {
  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  const history = (current.commentHistory as any[]) || [];
  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId } });

  const newEntry = {
    role: 'OFFICER',
    performedBy: `${reviewer?.firstName} ${reviewer?.lastName}`,
    timestamp: new Date().toISOString(),
    comment: remarks || `Status updated to ${status}`,
    action: status
  };

  const kyc = await prisma.kYC.update({
    where: { id },
    data: {
      status,
      assignedToId: reviewerId,
      updatedAt: new Date(),
      commentHistory: [...history, newEntry],
      isResubmitted: status === KYC_STATUS.SUBMITTED && current.status === KYC_STATUS.ACTION_REQUIRED,
      amendCycles: status === KYC_STATUS.ACTION_REQUIRED ? { increment: 1 } : undefined
    }
  });

  revalidatePath(`/submissions/${id}`);
  return kyc;
}

export async function getSubmissionById(id: string) {
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
    return {
      ...kyc,
      checklistState: kyc.checklistState || {},
      commentHistory: kyc.commentHistory || [],
      documents: kyc.memos.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        url: `/api/memos/${signDownloadToken(m.id)}`
      }))
    };
  } catch (error) {
    return null;
  }
}

export async function updateSubmissionChecklist(id: string, checklistState: any) {
  try {
    return await prisma.kYC.update({ 
      where: { id }, 
      data: { checklistState } 
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getWorkflowCounts(params: { userId: string, branchName?: string, branches?: string[], isSuperAdmin: boolean }) {
  const { branchName, branches, isSuperAdmin } = params;
  
  const branchFilter = isSuperAdmin ? {} : (branches && branches.length > 0 ? { branchName: { in: branches } } : { branchName: branchName || "NONE" });

  try {
    const [myCount, actionRequired, reviewQueue, resubmitted, escalated, exceptional] = await Promise.all([
      prisma.kYC.count({ where: { createdById: params.userId, active: true } }),
      prisma.kYC.count({ where: { createdById: params.userId, status: KYC_STATUS.ACTION_REQUIRED, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isExceptional: false, isResubmitted: false, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: { in: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW] }, isResubmitted: true, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, status: KYC_STATUS.ESCALATED, active: true } }),
      prisma.kYC.count({ where: { ...branchFilter, isExceptional: true, status: { not: KYC_STATUS.APPROVED }, active: true } })
    ]);

    return { mySubmissions: myCount, actionRequired, reviewQueue, resubmitted, escalated, exceptional, branchNode: 0 };
  } catch (error) {
    return { mySubmissions: 0, actionRequired: 0, reviewQueue: 0, resubmitted: 0, escalated: 0, exceptional: 0, branchNode: 0 };
  }
}

export async function processExceptionalStep(formData: FormData) {
  const id = formData.get('id') as string;
  const nextStatus = formData.get('nextStatus') as string;
  const remarks = formData.get('remarks') as string;
  const actionLabel = formData.get('actionLabel') as string;

  const current = await prisma.kYC.findUnique({ where: { id } });
  const history = (current?.commentHistory as any[]) || [];

  const data: any = { 
    exceptionalStatus: nextStatus, 
    updatedAt: new Date(), 
    commentHistory: [...history, { role: 'GOVERNANCE', performedBy: 'System', timestamp: new Date().toISOString(), comment: remarks || actionLabel, action: actionLabel }]
  };
  
  if (nextStatus === EXCEPTIONAL_STATUS.COMPLETED) data.status = KYC_STATUS.APPROVED;

  const kyc = await prisma.kYC.update({ where: { id }, data });
  revalidatePath(`/submissions/${id}`);
  return kyc;
}

export async function resubmitSubmission(formData: FormData) {
  const id = formData.get('id') as string;
  const remarks = formData.get('remarks') as string;
  const files = formData.getAll('files') as File[];
  const types = formData.getAll('types') as string[];

  const current = await prisma.kYC.findUnique({ where: { id } });
  const history = (current?.commentHistory as any[]) || [];
  
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const memoData = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const storedFileName = `resubmit_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    await fs.writeFile(path.join(uploadDir, storedFileName), Buffer.from(await file.arrayBuffer()));
    memoData.push({ name: file.name, type: types[i] || 'OTHER', fileUrl: `/uploads/${storedFileName}`, uploadedById: 'system' });
  }

  const updated = await prisma.kYC.update({
    where: { id },
    data: {
      status: KYC_STATUS.SUBMITTED,
      isResubmitted: true,
      updatedAt: new Date(),
      commentHistory: [...history, { role: 'BRANCH_OFFICER', performedBy: 'Staff', timestamp: new Date().toISOString(), comment: remarks, action: 'RESUBMIT' }],
      memos: { create: memoData }
    }
  });

  revalidatePath(`/submissions/${id}`);
  return { success: true, kyc: updated };
}

export async function initiateExceptionalWorkflow(formData: FormData) {
  const kycId = formData.get('id') as string;
  const reason = formData.get('reason') as string;
  const justification = formData.get('justification') as string;
  const memoFile = formData.get('memo') as File;

  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const storedFileName = `init_gov_${Date.now()}_${memoFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  await fs.writeFile(path.join(uploadDir, storedFileName), Buffer.from(await memoFile.arrayBuffer()));

  const current = await prisma.kYC.findUnique({ where: { id: kycId } });
  const history = (current?.commentHistory as any[]) || [];
  
  const kyc = await prisma.kYC.update({
    where: { id: kycId },
    data: {
      isExceptional: true,
      exceptionalStatus: EXCEPTIONAL_STATUS.AWAITING_DISTRICT,
      updatedAt: new Date(),
      commentHistory: [...history, { role: 'MANAGER', performedBy: 'Manager', timestamp: new Date().toISOString(), comment: `Exception Initiated: ${reason}`, action: 'INITIATE_EXCEPTION' }],
      memos: { create: { name: memoFile.name, type: 'GOVERNANCE_MEMO', fileUrl: `/uploads/${storedFileName}`, uploadedById: 'system' } }
    }
  });

  revalidatePath(`/submissions/${kycId}`);
  return { success: true, kyc };
}

export async function logBundleDownload(data: any) {
  try {
    await prisma.auditLog.create({
      data: { kycId: data.submissionId, action: 'BUNDLE_DOWNLOAD', details: `Bundle exported: ${data.bundleName}`, userEmail: data.performedBy }
    });
    return true;
  } catch {
    return false;
  }
}
