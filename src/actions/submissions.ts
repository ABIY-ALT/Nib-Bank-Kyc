'use server';

import { prisma } from '@/lib/prisma';
import { KYCStatus, UserStatus, AuditAction } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';

export async function getSubmissions(filters?: {
  status?: KYCStatus[];
  branchId?: string;
  createdById?: string;
  isResubmitted?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  try {
    return await prisma.kYC.findMany({
      where: {
        status: filters?.status ? { in: filters.status } : undefined,
        branchId: filters?.branchId,
        createdById: filters?.createdById,
        isResubmitted: filters?.isResubmitted,
        createdAt: (filters?.startDate || filters?.endDate) ? {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate) : undefined,
        } : undefined,
      },
      include: {
        createdBy: true,
        branch: true,
        memos: true,
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit
    });
  } catch (error) {
    console.error('[SQL] getSubmissions error:', error);
    return [];
  }
}

export async function getSubmissionById(id: string) {
  try {
    return await prisma.kYC.findUnique({
      where: { id },
      include: {
        createdBy: true,
        assignedTo: true,
        branch: { include: { district: true } },
        memos: true,
        auditLogs: true,
      }
    });
  } catch (error) {
    return null;
  }
}

export async function updateSubmissionStatus(id: string, status: KYCStatus, reviewerId: string, remarks?: string) {
  const now = new Date();
  
  const current = await prisma.kYC.findUnique({ where: { id } });
  if (!current) throw new Error("KYC record not found");

  const history = (current.commentHistory as any[]) || [];
  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId } });

  const newEntry = {
    role: reviewer?.role || 'SYSTEM',
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
  return kyc;
}

export async function createSubmission(formData: FormData) {
  try {
    const id = formData.get('id') as string;
    const customerName = formData.get('customerName') as string;
    const customerIdNumber = formData.get('customerIdNumber') as string;
    const branchId = formData.get('branchId') as string;
    const createdById = formData.get('createdById') as string;
    const createdByName = formData.get('createdByName') as string;
    const remarks = formData.get('remarks') as string;
    
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    // 1. JIT User Provisioning for Schema integrity
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
        role: 'BRANCH_OFFICER',
        status: UserStatus.ACTIVE,
        branchId
      }
    });

    // 2. Local Filesystem Storage
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
    
    // 3. Create KYC Record
    const kyc = await prisma.kYC.create({
      data: {
        id,
        customerName,
        customerIdNumber,
        branchId,
        createdById,
        status: KYCStatus.SUBMITTED,
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

    revalidatePath('/submissions');
    return { success: true, kyc };
  } catch (error: any) {
    console.error('[Blueprint Error]:', error);
    return { success: false, error: error.message || 'Institutional storage fault.' };
  }
}
