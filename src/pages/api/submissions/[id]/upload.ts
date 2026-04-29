import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import formidable, { type Fields, type Files, type File as FormidableFile } from 'formidable';
import { getServerSession } from '@/actions/auth-server';
import { createAuditLog } from '@/actions/audit';
import { hasJurisdictionalAccess, getNormalizedRole } from '@/lib/jurisdiction';
import { prisma } from '@/lib/prisma';
import { checkUploadRateLimit } from '@/lib/rate-limiting';
import {
  validateFileCount,
  validateTotalUploadSize,
} from '@/lib/file-upload-validation';
import { performCompleteFileValidation } from '@/lib/file-upload-security-integration';
import {
  deleteSecureUploadedFile,
  ensureSecureUploadRoot,
  getQuarantineRoot,
  resolveSecureUploadPath,
  writeSecureUploadedFile,
} from '@/lib/secure-file-storage';

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 20 * MAX_FILE_SIZE;

function parseMultipartForm(
  req: NextApiRequest,
  uploadDir: string
): Promise<{ fields: Fields; files: Files }> {
  const form = formidable({
    multiples: true,
    maxFileSize: MAX_FILE_SIZE,
    maxTotalFileSize: MAX_TOTAL_FILE_SIZE,
    uploadDir,
    keepExtensions: false,
    filter: ({ mimetype, originalFilename }) => Boolean(mimetype && originalFilename),
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getFirstFieldValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getFieldValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function normalizeUploadedFiles(files: Files): FormidableFile[] {
  const uploaded = files.files;
  if (!uploaded) return [];
  return Array.isArray(uploaded) ? uploaded.filter(Boolean) : [uploaded];
}

async function auditUploadEvent(
  session: Awaited<ReturnType<typeof getServerSession>>,
  action: string,
  details: string,
  kycId?: string
) {
  await createAuditLog({
    userId: session?.id || 'unknown',
    userEmail: session?.email || 'unknown@nibbank.com.et',
    action,
    details,
    kycId,
  }).catch(() => {});
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await getServerSession();
  if (!session?.id) {
    return res.status(401).json({ success: false, error: 'Unauthenticated' });
  }

  const rateLimitResponse = await checkUploadRateLimit(session.id);
  if (rateLimitResponse) {
    await auditUploadEvent(
      session,
      'UPLOAD_RATE_LIMIT_EXCEEDED',
      'User exceeded upload rate limit.'
    );
    return res.status(429).json({
      success: false,
      error: 'Too many uploads. Please try again later.',
    });
  }

  try {
    await ensureSecureUploadRoot();

    const { fields, files } = await parseMultipartForm(req, getQuarantineRoot());
    const submissionId = getFirstFieldValue(fields.id);

    if (!submissionId) {
      return res.status(400).json({ success: false, error: 'Missing id' });
    }

    const current = await prisma.kYC.findUnique({ where: { id: submissionId } });
    if (!current) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const actor = await prisma.user.findUnique({ where: { id: session.id } });
    if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, current))) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const uploadedFiles = normalizeUploadedFiles(files).filter((file) => Boolean(file.originalFilename));
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const fileCountValidation = validateFileCount(uploadedFiles.length);
    if (!fileCountValidation.valid) {
      await auditUploadEvent(
        session,
        'UPLOAD_REJECTED',
        `Upload rejected for ${submissionId}: ${fileCountValidation.error}`,
        submissionId
      );
      return res.status(400).json({
        success: false,
        error: 'Upload rejected by security policy.',
      });
    }

    const totalSizeValidation = validateTotalUploadSize(
      uploadedFiles.map((file) => ({ size: file.size } as File))
    );
    if (!totalSizeValidation.valid) {
      await auditUploadEvent(
        session,
        'UPLOAD_REJECTED',
        `Upload rejected for ${submissionId}: ${totalSizeValidation.error}`,
        submissionId
      );
      return res.status(400).json({
        success: false,
        error: 'Upload rejected by security policy.',
      });
    }

    const requestedTypes = getFieldValues(fields.types);
    const memoData: any[] = [];

    for (let index = 0; index < uploadedFiles.length; index++) {
      const file = uploadedFiles[index];
      const quarantineKey = file.newFilename;

      try {
        const quarantinePath = resolveSecureUploadPath(quarantineKey, true);
        const buffer = await fs.readFile(quarantinePath);
        const validation = await performCompleteFileValidation(
          file.originalFilename || 'upload',
          file.mimetype || '',
          buffer,
          session.id
        );

        if (!validation.valid || !validation.storageKey) {
          await auditUploadEvent(
            session,
            'UPLOAD_REJECTED',
            `Validation failed for ${file.originalFilename}: ${validation.error || 'Unknown security policy violation'}`,
            submissionId
          );
          return res.status(400).json({
            success: false,
            error: 'Upload rejected by security policy.',
          });
        }

        const persistedBuffer = validation.sanitisedBuffer || buffer;
        await writeSecureUploadedFile(validation.storageKey, persistedBuffer);

        memoData.push({
          name: (file.originalFilename || 'file').split('.').slice(0, -1).join('.') || 'file',
          originalName: file.originalFilename || 'file',
          type: requestedTypes[index] || 'OTHER',
          storageKey: validation.storageKey,
          fileHash: validation.fileHash,
          mimeType: validation.fileType || file.mimetype || 'application/octet-stream',
          uploadedById: session.id,
          kycId: submissionId,
          size: persistedBuffer.length,
        });
      } finally {
        await deleteSecureUploadedFile(quarantineKey, true).catch(() => {});
      }
    }

    const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
    const newHistory = [
      ...history,
      {
        role: session.role || 'BRANCH_OFFICER',
        performedBy: (session.email || '').split('@')[0],
        timestamp: new Date().toISOString(),
        comment: `${memoData.length} additional secure document(s) uploaded.`,
        action: 'ADD_DOCUMENT',
      },
    ];

    await prisma.$transaction([
      prisma.memo.createMany({ data: memoData }),
      prisma.kYC.update({
        where: { id: submissionId },
        data: { commentHistory: newHistory },
      }),
    ]);

    await auditUploadEvent(
      session,
      'ADD_DOCUMENT',
      `${memoData.length} validated document(s) appended to ${submissionId}.`,
      submissionId
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    await auditUploadEvent(
      session,
      'UPLOAD_FAILURE',
      error instanceof Error ? `Upload handler error: ${error.message}` : 'Upload handler error'
    );

    return res.status(500).json({
      success: false,
      error: 'Unable to process upload.',
    });
  }
}
