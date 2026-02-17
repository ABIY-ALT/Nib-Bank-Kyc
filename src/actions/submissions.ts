'use server';

import { prisma } from '@/lib/prisma';
import { SubmissionStatus, ExceptionalStatus, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';

export async function getSubmissions(filters?: {
  status?: SubmissionStatus[];
  branch?: string;
  district?: string;
  submittedBy?: string;
  isExceptional?: boolean;
  isResubmitted?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  try {
    return await prisma.submission.findMany({
      where: {
        status: filters?.status ? { in: filters.status } : undefined,
        branchName: filters?.branch,
        districtName: filters?.district,
        submittedById: filters?.submittedBy,
        isExceptional: filters?.isExceptional,
        isResubmitted: filters?.isResubmitted,
        submittedAt: (filters?.startDate || filters?.endDate) ? {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate) : undefined,
        } : undefined,
      },
      include: {
        submittedBy: true,
        documents: true,
      },
      orderBy: { submittedAt: 'desc' },
      take: filters?.limit
    });
  } catch (error) {
    console.error('[SQL] getSubmissions error:', error);
    return [];
  }
}

export async function getSubmissionById(id: string) {
  try {
    return await prisma.submission.findUnique({
      where: { id },
      include: {
        submittedBy: true,
        reviewedBy: true,
        documents: true,
        bundleDownloads: true,
      }
    });
  } catch (error) {
    return null;
  }
}

export async function updateSubmissionStatus(id: string, status: SubmissionStatus, reviewerId: string, remarks?: string) {
  const now = new Date();
  
  const current = await prisma.submission.findUnique({ where: { id } });
  if (!current) throw new Error("Submission not found");

  const history = (current.commentHistory as any[]) || [];
  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId } });

  const newEntry = {
    role: reviewer?.role || 'SYSTEM',
    performedBy: reviewer?.name || 'Unknown',
    timestamp: now.toISOString(),
    comment: remarks || `Status updated to ${status}`,
    action: status
  };

  const submission = await prisma.submission.update({
    where: { id },
    data: {
      status,
      reviewedById: reviewerId,
      reviewedAt: now,
      remarks,
      commentHistory: [...history, newEntry],
      isResubmitted: status === SubmissionStatus.PENDING && current.status === SubmissionStatus.AMENDED,
      amendmentCycles: status === SubmissionStatus.AMENDED ? { increment: 1 } : undefined
    }
  });

  revalidatePath(`/submissions/${id}`);
  revalidatePath('/submissions');
  return submission;
}

export async function createSubmission(formData: FormData) {
  try {
    const id = formData.get('id') as string;
    const customerName = formData.get('customerName') as string;
    const entityType = formData.get('entityType') as string;
    const branchName = formData.get('branchName') as string;
    const districtName = formData.get('districtName') as string;
    const submittedById = formData.get('submittedById') as string;
    const submittedByName = formData.get('submittedByName') as string;
    const remarks = formData.get('remarks') as string;
    
    const files = formData.getAll('files') as File[];
    const types = formData.getAll('types') as string[];

    // 1. Ensure the submitting user exists in SQL to satisfy Foreign Key constraints.
    // This is vital for the prototype environment where users might not be pre-created.
    await prisma.user.upsert({
      where: { id: submittedById },
      update: { name: submittedByName, branchName, districtName },
      create: {
        id: submittedById,
        name: submittedByName,
        email: `${submittedById.toLowerCase().replace(/[^a-z0-9]/g, '.')}@nibbank.com.et`,
        role: 'BRANCH_OFFICER',
        status: 'ACTIVE',
        branchName,
        districtName
      }
    });

    // 2. Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const documentsData = [];

    // 3. Process and Save Files to Filesystem
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = types[i];
      
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storedFileName = `${timestamp}_${sanitizedName}`;
      const filePath = path.join(uploadDir, storedFileName);
      
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      documentsData.push({
        name: file.name,
        type: type,
        url: `uploads/${storedFileName}`,
        status: 'Current'
      });
    }

    const now = new Date();
    
    // 4. Atomic Submission Creation
    const submission = await prisma.submission.create({
      data: {
        id,
        customerName,
        entityType,
        branchName,
        districtName,
        submittedById,
        submittedAt: now,
        status: SubmissionStatus.PENDING,
        remarks,
        commentHistory: remarks ? [{
          role: 'BRANCH_OFFICER',
          performedBy: submittedByName,
          timestamp: now.toISOString(),
          comment: remarks,
          action: 'Submission'
        }] : [],
        isResubmitted: false,
        amendmentCycles: 0,
        isExceptional: false,
        checklistState: {},
        documents: {
          create: documentsData
        }
      }
    });

    revalidatePath('/submissions');
    revalidatePath('/submissions/my');
    return { success: true, submission };
  } catch (error: any) {
    console.error('[SQL Storage Error]:', error);
    return { success: false, error: error.message || 'Failed to save files to institutional storage.' };
  }
}

export async function logBundleDownload(data: {
  submissionId: string;
  performedBy: string;
  bundleName: string;
  sourceDistrict: string;
  sourceBranch: string;
}) {
  return await prisma.bundleDownload.create({
    data: {
      ...data,
      timestamp: new Date()
    }
  });
}

export async function initiateExceptionalWorkflow(id: string, data: any) {
  const { reason, justification, remarks, initiatedBy, memoData } = data;
  
  const submission = await prisma.submission.update({
    where: { id },
    data: {
      isExceptional: true,
      exceptionalStatus: ExceptionalStatus.AWAITING_DISTRICT,
      exceptionalData: {
        reason,
        justification,
        memoUrl: "#",
        initiatedBy,
        initiatedAt: new Date().toISOString(),
        approvalHistory: []
      },
      remarks: remarks || "",
      documents: {
        create: {
          name: memoData.name,
          type: 'Exceptional Memo',
          url: "#",
          status: 'Current'
        }
      }
    }
  });

  revalidatePath('/submissions/exceptional');
  revalidatePath(`/submissions/${id}`);
  return submission;
}
