import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Legacy endpoint intentionally disabled.
 * Files must be served via signed access route: /api/memos/[token]
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(410).json({
    error: 'This endpoint is no longer available.',
  });
}
