import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import { UPLOADS_DIR_NAME } from '@/lib/file-upload-validation';

/**
 * Serves uploaded files from the uploads directory.
 * Supports PDFs, images, and other file types with proper MIME type headers.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path: filePath } = req.query;

    // Ensure path is provided and is an array
    if (!filePath || !Array.isArray(filePath)) {
      console.error('[Files API] Invalid file path:', filePath);
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Reconstruct the file path from the array
    const requestedPath = filePath.join('/');
    console.log('[Files API] Requested path:', requestedPath);

    // Security: Prevent directory traversal attacks
    if (requestedPath.includes('..') || requestedPath.startsWith('/')) {
      console.error('[Files API] Security violation - path traversal attempt:', requestedPath);
      return res.status(403).json({ error: 'Access denied' });
    }

    // Handle both secure_uploads filename and plain filename formats
    const uploadsDirName = UPLOADS_DIR_NAME;
    let finalPath = requestedPath;
    if (!requestedPath.startsWith(`${uploadsDirName}/`)) {
      finalPath = `${uploadsDirName}/${requestedPath}`;
    }

    // Construct the full file path (stored outside web root)
    const fullPath = path.join(process.cwd(), finalPath);
    console.log('[Files API] Full path:', fullPath);
    console.log('[Files API] CWD:', process.cwd());

    // Verify the resolved path is still within the uploads directory
    const uploadsDir = path.join(process.cwd(), uploadsDirName);
    const resolvedPath = path.resolve(fullPath);
    const resolvedUploadsDir = path.resolve(uploadsDir);

    console.log('[Files API] Resolved path:', resolvedPath);
    console.log('[Files API] Resolved uploads dir:', resolvedUploadsDir);

    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      console.error('[Files API] Path outside uploads directory');
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    let fileExists = false;
    try {
      await fs.access(fullPath);
      fileExists = true;
      console.log('[Files API] File found:', fullPath);
    } catch (err) {
      console.error('[Files API] File not found:', fullPath, err);
      
      // Try to list files in uploads directory for debugging
      try {
        const uploadsPath = path.join(process.cwd(), 'uploads');
        const files = await fs.readdir(uploadsPath);
        console.log('[Files API] Files in uploads directory:', files);
      } catch (listErr) {
        console.error('[Files API] Could not list uploads directory:', listErr);
      }
      
      return res.status(404).json({ error: 'File not found', path: finalPath });
    }

    if (!fileExists) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file stats
    const stats = await fs.stat(fullPath);

    if (!stats.isFile()) {
      console.error('[Files API] Path is not a file:', fullPath);
      return res.status(400).json({ error: 'Not a file' });
    }

    // Determine MIME type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    let mimeType = 'application/octet-stream';

    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    if (mimeTypes[ext]) {
      mimeType = mimeTypes[ext];
    }

    console.log('[Files API] Serving file:', fullPath, 'MIME:', mimeType, 'Size:', stats.size);

    // Set response headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);

    // Stream the file
    const fileStream = await fs.readFile(fullPath);
    res.status(200).send(fileStream);
  } catch (error) {
    console.error('[Files API] Unexpected error:', error);
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    const safeMessage = getSafeErrorMessage(error);
    res.status(500).json({ error: 'Internal server error', details: safeMessage });
  }
}
