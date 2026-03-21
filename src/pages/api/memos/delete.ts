import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from '@/actions/auth-server';
import { prisma } from '@/lib/prisma';
import { deleteInstitutionalFile } from '@/actions/storage';
import { createAuditLog } from '@/actions/audit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const session = await getServerSession();
    if (!session || !session.id) return res.status(401).json({ success: false, error: 'Unauthenticated' });

    const body = req.body;
    if (!body || !Array.isArray(body.memoIds) || body.memoIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No memoIds provided' });
    }

    const { verifyPermission } = await import('@/actions/auth-server');
    if (!(await verifyPermission('DELETE_MEMO'))) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
    }

    const memoIds: string[] = body.memoIds;
    const results: any[] = [];

    for (const id of memoIds) {
      try {
        const resDel = await deleteInstitutionalFile(id);
        results.push({ id, success: !!resDel.success, error: resDel.error || null });
        
        if (resDel.success) {
          await createAuditLog({ 
            userId: session.id, 
            userEmail: session.email, 
            action: 'DELETE_MEMO', 
            details: `Deleted memo ${id}`, 
            kycId: resDel.kycId ?? undefined 
          });
        }
      } catch (e: any) {
        results.push({ id, success: false, error: e.message });
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message || 'Server error' });
  }
}
