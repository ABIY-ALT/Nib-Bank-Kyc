/**
 * File Upload Security Integration — Production-Grade Pipeline
 *
 * Orchestrates the complete upload validation flow:
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Layer 1 — Metadata: extension, MIME, size             │
 *   │ Layer 2 — Magic-byte type detection (ground truth)    │
 *   │ Layer 3 — Threat detection (executable / script scan) │
 *   │ Layer 4 — Image re-encoding via sharp (strip payloads)│
 *   │ Layer 5 — Hash, secure filename, quarantine / audit   │
 *   └────────────────────────────────────────────────────────┘
 *
 * Key design decisions:
 *   • Binary files (JPEG, PNG, PDF) are NEVER regex-scanned
 *   • Images are re-encoded to strip EXIF / embedded scripts
 *   • Threat detection only uses regex on unknown (text) files
 *   • Every file gets a SHA-256 hash for audit trails
 */

import {
  validateFile,
  generateSecureFilename,
  validateFileCount,
  validateTotalUploadSize,
  UPLOADS_DIR_NAME,
} from './file-upload-validation';
import { generateStorageKey } from './secure-file-storage';

import {
  performThreatDetection,
  sanitiseImageBuffer,
  computeFileHash,
  quarantineFile,
  exportThreatDetectionReport,
  type ThreatDetectionResult,
  type DetectedFileType,
} from './file-content-threat-detection';

import crypto from 'crypto';
import logger from './logger';
import sharp from 'sharp';

// Re-export UPLOADS_DIR_NAME for consumers
export { UPLOADS_DIR_NAME };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecureFileValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  fileType?: string;
  category?: string;
  threatLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  threats?: string[];
  recommendations?: string[];
  storageKey?: string; // Random UUID/hash for storage
  fileHash?: string;
  /** The (possibly re-encoded) buffer to persist. Use this instead of the original. */
  sanitisedBuffer?: Buffer;
}

// ---------------------------------------------------------------------------
// Hash helper (kept for backward compat)
// ---------------------------------------------------------------------------

export function calculateFileHash(buffer: Buffer): string {
  return computeFileHash(buffer);
}

// ---------------------------------------------------------------------------
// Main validation pipeline
// ---------------------------------------------------------------------------

/**
 * Performs the complete file validation pipeline.
 *
 * @param filename    Original filename from the client
 * @param mimeType    Client-declared MIME type
 * @param buffer      Raw file bytes
 * @param uploadedBy  User ID for audit / quarantine
 * @returns           Validation result (includes sanitised buffer on success)
 */
export async function performCompleteFileValidation(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  uploadedBy?: string
): Promise<SecureFileValidationResult> {
  const warnings: string[] = [];

  try {
    // ================================================================
    // LAYER 1 — Basic metadata validation (extension, MIME, size,
    //           magic-byte match via validateFile)
    // ================================================================
    const basicValidation = validateFile(filename, mimeType, buffer);
    if (!basicValidation.valid) {
      return {
        valid: false,
        error: basicValidation.error || 'File validation failed',
        threatLevel: 'critical',
      };
    }

    // ================================================================
    // LAYER 2 + 3 — Threat detection (magic-byte routing + scanning)
    // ================================================================
    const threatResult = performThreatDetection(buffer, filename, mimeType);

    // Critical → block + quarantine
    if (threatResult.riskLevel === 'critical') {
      const fileHash = computeFileHash(buffer);
      quarantineFile({
        fileId: fileHash,
        filename,
        uploadedAt: new Date(),
        fileHash,
        threatLevel: 'critical',
        threats: threatResult.threats,
        uploadedBy: uploadedBy || 'unknown',
        reason: threatResult.threats.join('; '),
      });

      logger.warn('CRITICAL_FILE_THREAT', {
        filename,
        uploadedBy,
        threats: threatResult.threats,
      });

      return {
        valid: false,
        error: `Security check failed: ${threatResult.threats[0]}`,
        threats: threatResult.threats,
        recommendations: threatResult.recommendations,
        threatLevel: 'critical',
      };
    }

    // High → block + quarantine
    if (threatResult.riskLevel === 'high') {
      const fileHash = computeFileHash(buffer);
      quarantineFile({
        fileId: fileHash,
        filename,
        uploadedAt: new Date(),
        fileHash,
        threatLevel: 'high',
        threats: threatResult.threats,
        uploadedBy: uploadedBy || 'unknown',
        reason: threatResult.threats.join('; '),
      });

      logger.warn('HIGH_RISK_FILE', {
        filename,
        uploadedBy,
        threats: threatResult.threats,
      });

      return {
        valid: false,
        error: `File poses high security risk: ${threatResult.threats[0]}`,
        threats: threatResult.threats,
        recommendations: threatResult.recommendations,
        threatLevel: 'high',
      };
    }

    // Medium → allow with warnings
    if (threatResult.riskLevel === 'medium') {
      warnings.push(
        `File has potential concerns: ${threatResult.threats.join(', ')}`
      );
    }

    // ================================================================
    // LAYER 4 — Image sanitisation (re-encode to strip payloads)
    // ================================================================
    let finalBuffer = buffer;
    const detectedType = threatResult.detectedType as DetectedFileType;

    if (detectedType === 'jpeg' || detectedType === 'png') {
      const metadata = await sharp(buffer).metadata();
      if ((metadata.width || 0) > 5000 || (metadata.height || 0) > 5000) {
        return {
          valid: false,
          error: 'Image dimensions exceed safety limits (max 5000px)',
          threatLevel: 'high',
        };
      }
      finalBuffer = await sanitiseImageBuffer(buffer, detectedType);
    }

    // ================================================================
    // LAYER 5 — Secure storage key + hash
    // ================================================================
    const storageKey = generateStorageKey();
    const fileHash = computeFileHash(finalBuffer);

    logger.info('FILE_VALIDATION_PASSED', {
      filename,
      storageKey,
      fileHash: fileHash.substring(0, 16) + '…',
      uploadedBy,
      fileType: basicValidation.fileType,
      threatLevel: threatResult.riskLevel,
    });

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      fileType: basicValidation.fileType,
      category: basicValidation.category,
      threatLevel: threatResult.riskLevel,
      threats: threatResult.threats.length > 0 ? threatResult.threats : undefined,
      recommendations: threatResult.recommendations.length > 0 ? threatResult.recommendations : undefined,
      storageKey,
      fileHash,
      sanitisedBuffer: finalBuffer,
    };
  } catch (error) {
    logger.error('FILE_VALIDATION_EXCEPTION', {
      filename,
      uploadedBy,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      valid: false,
      error: 'File validation error — please try again',
      threatLevel: 'critical',
    };
  }
}

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

export async function performBatchFileValidation(
  files: Array<{ filename: string; mimeType: string; buffer: Buffer }>,
  uploadedBy?: string
): Promise<SecureFileValidationResult[]> {
  // File count check
  const countCheck = validateFileCount(files.length);
  if (!countCheck.valid) {
    return [{ valid: false, error: countCheck.error, threatLevel: 'critical' }];
  }

  // Total size check
  const sizeCheck = validateTotalUploadSize(
    files.map(f => ({ size: f.buffer.length } as File))
  );
  if (!sizeCheck.valid) {
    return [{ valid: false, error: sizeCheck.error, threatLevel: 'critical' }];
  }

  // Validate each file
  const results: SecureFileValidationResult[] = [];
  for (const file of files) {
    const result = await performCompleteFileValidation(
      file.filename,
      file.mimeType,
      file.buffer,
      uploadedBy
    );
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface FileUploadAuditEntry {
  timestamp: Date;
  filename: string;
  secureFilename?: string;
  fileHash: string;
  uploadedBy: string;
  validationResult: 'passed' | 'failed' | 'flagged';
  threatLevel?: string;
  threats?: string[];
  ipAddress?: string;
  userAgent?: string;
}

const MAX_AUDIT_LOG_ENTRIES = 500;
const auditLog: FileUploadAuditEntry[] = [];

export function logFileUploadAudit(entry: FileUploadAuditEntry): void {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    auditLog.shift();
  }
  logger.info('FILE_UPLOAD_AUDIT', {
    filename: entry.filename,
    validationResult: entry.validationResult,
    threatLevel: entry.threatLevel,
    uploadedBy: entry.uploadedBy,
  });
}

export function getFileUploadAuditLog(filters?: {
  uploadedBy?: string;
  validationResult?: 'passed' | 'failed' | 'flagged';
  startDate?: Date;
  endDate?: Date;
}): FileUploadAuditEntry[] {
  let results = auditLog;
  if (filters?.uploadedBy)        results = results.filter(e => e.uploadedBy === filters.uploadedBy);
  if (filters?.validationResult)  results = results.filter(e => e.validationResult === filters.validationResult);
  if (filters?.startDate)         results = results.filter(e => e.timestamp >= filters.startDate!);
  if (filters?.endDate)           results = results.filter(e => e.timestamp <= filters.endDate!);
  return results;
}

// ---------------------------------------------------------------------------
// Compliance report
// ---------------------------------------------------------------------------

export function generateFileUploadSecurityReport(): Record<string, unknown> {
  const totalUploads = auditLog.length;
  const passed  = auditLog.filter(e => e.validationResult === 'passed').length;
  const failed  = auditLog.filter(e => e.validationResult === 'failed').length;
  const flagged = auditLog.filter(e => e.validationResult === 'flagged').length;

  const uniqueThreats = new Set<string>();
  auditLog.forEach(e => e.threats?.forEach(t => uniqueThreats.add(t)));

  const successRate = totalUploads > 0 ? (passed / totalUploads) * 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    statistics: { totalUploads, passed, failed, flagged, successRate: successRate.toFixed(2) + '%' },
    security: {
      uniqueThreatsDetected: Array.from(uniqueThreats),
      threatCount: uniqueThreats.size,
      criticalIncidents: auditLog.filter(e => e.threatLevel === 'critical').length,
      highRiskIncidents:  auditLog.filter(e => e.threatLevel === 'high').length,
    },
    compliance: {
      cweCoverage: 'CWE-434 (Unrestricted Upload)',
      validationLayers: 5,
      defenseMechanisms: [
        'Magic-byte type detection',
        'Executable signature blocking',
        'Image re-encoding via sharp',
        'Extension block list',
        'Secure filename generation',
        'SHA-256 file hashing',
        'Quarantine system',
        'Audit logging',
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export function exportValidationResult(
  result: SecureFileValidationResult
): Record<string, unknown> {
  return {
    valid: result.valid,
    error: result.error,
    warnings: result.warnings,
    fileType: result.fileType,
    category: result.category,
    threatLevel: result.threatLevel,
    threats: result.threats,
    recommendations: result.recommendations,
    storageKey: result.storageKey,
  };
}
