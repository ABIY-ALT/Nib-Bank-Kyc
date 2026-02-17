'use server';

import { prisma } from '@/lib/prisma';
import { SubmissionStatus, ExceptionalStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getSubmissions(filters?: {
  status?: SubmissionStatus[];
  branch?: string;
  submittedBy?: string;
  isExceptional?: boolean;
}) {
  return await prisma.submission.findMany({
    where: {
      status: filters?.status ? { in: filters.status } : undefined,
      branchName: filters?.branch,
      submittedById: filters?.submittedBy,
      isExceptional: filters?.isExceptional
    },
    include: {
      submittedBy: true,
      documents: true
    },
    orderBy: { submittedAt: 'desc' }
  });
}

export async function getSubmissionById(id: string) {
  return await prisma.submission.findUnique({
    where: { id },
    include: {
      submittedBy: true,
      reviewedBy: true,
      documents: true
    }
  });
}

export async function updateSubmissionStatus(id: string, status: SubmissionStatus, reviewerId: string, remarks?: string) {
  const submission = await prisma.submission.update({
    where: { id },
    data: {
      status,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      remarks
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
