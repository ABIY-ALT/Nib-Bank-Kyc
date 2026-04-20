import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from '@/actions/auth-server';
import fs from 'fs/promises';
import path from 'path';
import formidable from 'formidable';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/actions/audit';
import { hasJurisdictionalAccess, getNormalizedRole } from '@/lib/jurisdiction';
import { UPLOADS_DIR_NAME } from '@/lib/file-upload-validation';
import { performCompleteFileValidation } from '@/lib/file-upload-security-integration';

export const config = {
  api: {
    bodyParser: false,
  },
};

const allowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']);
const MAX_FILE_SIZE = 30 * 1024 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const session = await getServerSession();
  if (!session || !session.id) return res.status(401).json({ success: false, error: 'Unauthenticated' });

  const form = formidable({ multiples: true, maxFileSize: MAX_FILE_SIZE });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) return res.status(400).json({ success: false, error: err.message });
      const id = String(fields.id || '');
      if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

      const current = await prisma.kYC.findUnique({ where: { id } });
      if (!current) return res.status(404).json({ success: false, error: 'Case not found' });

      const actor = await prisma.user.findUnique({ where: { id: session.id } });
      if (!actor || (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(actor, getNormalizedRole(session.role), session.id, current))) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const uploaded = Array.isArray(files.files) ? files.files : [files.files];
      const uploadDir = path.join(process.cwd(), UPLOADS_DIR_NAME);
      try { await fs.access(uploadDir); } catch { await fs.mkdir(uploadDir, { recursive: true }); }

      const memoData: any[] = [];

      for (const f of uploaded) {
        if (!f || !f.originalFilename) continue;
        const buffer = await fs.readFile(f.filepath);
        const validation = await performCompleteFileValidation(f.originalFilename, f.mimetype || '', buffer, session.id);
        
        if (!validation.valid || !validation.secureFilename) {
          return res.status(400).json({ success: false, error: `Security check failed for ${f.originalFilename}: ${validation.error}` });
        }

        await fs.writeFile(path.join(uploadDir, validation.secureFilename), buffer);

        memoData.push({
          name: f.originalFilename,
          type: (Array.isArray(fields.types) ? fields.types.shift() : fields.types) || 'OTHER',
          fileUrl: `${UPLOADS_DIR_NAME}/${validation.secureFilename}`,
          uploadedById: session.id,
          kycId: id,
          size: f.size
        });
      }

      if (memoData.length === 0) return res.status(400).json({ success: false, error: 'No valid files' });

      const history = Array.isArray(current.commentHistory) ? (current.commentHistory as any[]) : [];
      const newHistory = [...history, {
        role: session.role || 'BRANCH_OFFICER',
        performedBy: (session.email || '').split('@')[0],
        timestamp: new Date().toISOString(),
        comment: `${memoData.length} additional document(s) uploaded.`,
        action: 'ADD_DOCUMENT'
      }];

      await prisma.$transaction([
        prisma.memo.createMany({ data: memoData }),
        prisma.kYC.update({ where: { id }, data: { commentHistory: newHistory } })
      ]);

      await createAuditLog({ userId: session.id, userEmail: session.email, action: 'ADD_DOCUMENT', details: `${memoData.length} documents appended to ${id}`, kycId: id });

      return res.status(200).json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}
