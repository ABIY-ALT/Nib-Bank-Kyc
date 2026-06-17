import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from '@/actions/auth-server';
import { prisma } from '@/lib/prisma';
import archiver from 'archiver';
import { logBundleDownload } from '@/actions/submissions';
import { hasJurisdictionalAccess, getNormalizedRole } from '@/lib/jurisdiction';
import { format } from 'date-fns';
import { readSecureUploadedFile } from '@/lib/secure-file-storage';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';

export const config = { api: { bodyParser: false } };

const MAX_BATCH_SIZE = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    //  Auth
    const session = await getServerSession();
    if (!session?.id) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }

    // Parse raw body
    const body = await parseJsonBody(req);
    const memoIds: string[] = Array.isArray(body.memoIds) ? body.memoIds : [];

    if (memoIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No memoIds provided' });
    }

    if (memoIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Too many memoIds (max ${MAX_BATCH_SIZE})`,
      });
    }

    //  Fetch actor ONCE
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

    if (!actor) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const userPermissions = actor.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => rp.permission.slug as string) : []
    );

    //  Fetch memos
    const memos = await prisma.memo.findMany({
      where: { id: { in: memoIds } },
      include: {
        kyc: {
          include: {
            branch: {
              include: {
                district: true,
              },
            },
          },
        },
      },
    });

    if (memos.length === 0) {
      return res.status(404).json({ success: false, error: 'No memos found' });
    }

    //  Access validation
    for (const m of memos) {
      if (!m.kyc) {
        return res.status(404).json({
          success: false,
          error: 'One or more requested records could not be found',
        });
      }

      if (
        session.role !== 'SUPER_ADMIN' &&
        !hasJurisdictionalAccess(actor, userPermissions, session.id, m.kyc as any)
      ) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized for one or more memos',
        });
      }
    }

    //  FIXED: Type-safe filtering
    const branchIds = memos
      .map((m: any) => m.kyc?.branch?.id)
      .filter((id: any): id is string => Boolean(id));

    const uniqueBranches = new Set(branchIds);
    const isSingleBranch = uniqueBranches.size === 1;

    //  ZIP setup
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');

    let bundleName = `kyc-bundle-${Date.now()}.zip`;

    if (isSingleBranch && memos[0].kyc?.branch) {
      const b = memos[0].kyc.branch;
      const d = b.district?.name || 'HQ';
      const dateStr = new Date(memos[0].kyc.submittedAt)
        .toISOString()
        .split('T')[0];

      bundleName = `${d}_${b.name}_${dateStr}.zip`.replace(/\s+/g, '_');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${bundleName}"`);

    // If the client cancels the download mid-stream the response socket emits
    // an ECONNRESET/"aborted" error. Without a handler this bubbles up as an
    // uncaught exception. Abort the archive cleanly so no further writes occur.
    let aborted = false;
    const abortArchive = () => {
      if (aborted) return;
      aborted = true;
      try { archive.abort(); } catch { /* no-op */ }
    };
    res.on('close', () => {
      // 'close' before the archive finished => client went away.
      if (!res.writableFinished) abortArchive();
    });
    res.on('error', abortArchive);

    archive.on('error', (error) => {
      abortArchive();
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    archive.pipe(res);

    // File processing
    for (const m of memos) {
      const kyc = m.kyc;
      if (!kyc) continue;

      const districtName = sanitize(kyc.branch?.district?.name || 'HQ');
      const branchName = sanitize(kyc.branch?.name || 'Central');
      const dateLabel = format(new Date(kyc.submittedAt), 'yyyy-MM-dd');
      const timeLabel = format(new Date(kyc.submittedAt), 'HH-mm');
      const customerName = sanitize(kyc.customerName || 'Unknown Customer');

      const folderPath = isSingleBranch
        ? `${districtName} ${branchName} ${dateLabel} ${timeLabel}/${customerName}`
        : `${districtName}/${branchName} ${dateLabel} ${timeLabel}/${customerName}`;

      const safeFileName = sanitize(m.name || 'file');
      // ZIP standards require forward slashes for internal paths
      const nameInZip = folderPath + '/' + safeFileName;

      try {
        const fileBuffer = await readSecureUploadedFile(m.storageKey);
        archive.append(fileBuffer, { name: nameInZip });
      } catch {
        archive.append(`Missing file for memo ${m.id}\n`, {
          name: `${nameInZip}.missing.txt`,
        });
      }
    }

    await archive.finalize();

    // Log download
    logBundleDownload({
      submissionId: memos[0].kycId,
      bundleName,
    }).catch((e) => {
    });

  } catch (error: any) {

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: getSafeErrorMessage(error),
      });
    }
  }
}

/**
 *  Helpers
 */

function parseJsonBody(req: NextApiRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function sanitize(input: string): string {
  return input.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
}