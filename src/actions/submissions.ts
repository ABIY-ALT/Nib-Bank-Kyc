'use server';

import { prisma } from '@/lib/prisma';
import { SubmissionStatus, ExceptionalStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getSubmissions(filters?: {
  status?: SubmissionStatus[];
  branch?: string;
  district?: string;
  submittedBy?: string;
  isExceptional?: boolean;
  isResubmitted?: boolean;
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
  
  // Get current submission to handle history append
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
      // If it was amended and now moved to pending/review, it's a resubmission cycle
      isResubmitted: status === SubmissionStatus.PENDING && current.status === SubmissionStatus.AMENDED,
      amendmentCycles: status === SubmissionStatus.AMENDED ? { increment: 1 } : undefined
    }
  });

  revalidatePath(`/submissions/${id}`);
  revalidatePath('/submissions');
  return submission;
}

export async function createSubmission(data: any) {
  const { documents, ...rest } = data;
  const submission = await prisma.submission.create({
    data: {
      ...rest,
      documents: {
        create: documents
      }
    }
  });
  revalidatePath('/submissions');
  return submission;
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
