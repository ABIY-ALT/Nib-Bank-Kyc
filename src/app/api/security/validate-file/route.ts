/**
 * File Upload Security Verification API
 * 
 * Provides endpoints for:
 * - Pre-upload file validation
 * - Security scanning
 * - Quarantine review
 * - Audit log access
 * - Security reporting
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  performCompleteFileValidation,
  performBatchFileValidation,
  calculateFileHash,
  logFileUploadAudit,
  getFileUploadAuditLog,
  generateFileUploadSecurityReport,
  exportValidationResult,
} from '@/lib/file-upload-security-integration';

import { getQuarantineLog, clearQuarantineLog } from '@/lib/file-content-threat-detection';
import { getServerSession } from '@/actions/auth-server';
import logger from '@/lib/logger';

/**
 * POST /api/security/validate-file
 * 
 * Validates a single file for upload
 * 
 * Request body (multipart/form-data):
 * - file: File to validate
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Perform validation
    const validation = await performCompleteFileValidation(
      file.name,
      file.type,
      buffer,
      session.id
    );

    // Log audit entry
    logFileUploadAudit({
      timestamp: new Date(),
      filename: file.name,
      secureFilename: validation.storageKey,
      fileHash: validation.fileHash || calculateFileHash(buffer),
      uploadedBy: session.id,
      validationResult: validation.valid ? (validation.threats && validation.threats.length > 0 ? 'flagged' : 'passed') : 'failed',
      threatLevel: validation.threatLevel,
      threats: validation.threats,
    });

    return NextResponse.json(exportValidationResult(validation), {
      status: validation.valid ? 200 : 400,
    });
  } catch (error) {
    logger.error('File validation error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/security/validate-file
 * 
 * Query parameters:
 * - action: 'quarantine-log' | 'audit-log' | 'report'
 * - uploadedBy: Filter by uploader (admin only)
 * - validationResult: Filter by result
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    // Admin-only checks
    const isAdmin = session.role === 'SUPER_ADMIN';

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    switch (action) {
      case 'quarantine-log': {
        if (!isAdmin) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          );
        }

        const log = getQuarantineLog();
        return NextResponse.json({
          quarantineLog: log,
          count: log.length,
          timestamp: new Date().toISOString(),
        });
      }

      case 'audit-log': {
        if (!isAdmin) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          );
        }

        const uploadedBy = searchParams.get('uploadedBy');
        const validationResult = searchParams.get('validationResult') as any;

        const log = getFileUploadAuditLog({
          uploadedBy: uploadedBy || undefined,
          validationResult: validationResult || undefined,
        });

        return NextResponse.json({
          auditLog: log,
          count: log.length,
          timestamp: new Date().toISOString(),
        });
      }

      case 'report': {
        if (!isAdmin) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          );
        }

        const report = generateFileUploadSecurityReport();
        return NextResponse.json(report);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('File security endpoint error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/security/validate-file
 * 
 * Admin only: Clear quarantine and audit logs
 * 
 * Query parameters:
 * - type: 'quarantine' | 'audit' | 'all'
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    if (type === 'quarantine' || type === 'all') {
      clearQuarantineLog();
      logger.warn('SECURITY_AUDIT: Quarantine log cleared by admin', {
        admin: session.id,
      });
    }

    return NextResponse.json({
      message: 'Logs cleared successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Log deletion error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
