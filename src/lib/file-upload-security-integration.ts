/**
 * Comprehensive File Upload Security Integration
 * 
 * Combines multiple layers of file validation:
 * Layer 1: File metadata validation (extension, MIME type, size)
 * Layer 2: Content signature validation (magic bytes)
 * Layer 3: Advanced threat detection (executable, scripts, polyglots)
 * Layer 4: Content-based inspection (code injection, archive bombs)
 * Layer 5: Quarantine system (suspicious files for review)
 * 
 * This creates defense-in-depth protection against:
 * - File type spoofing attacks
 * - Executable uploads disguised as documents
 * - Polyglot files (multiple formats in one)
 * - Script injection attacks
 * - Archive bombs (compression bombs)
 */

import {
  validateFile,
  generateSecureFilename,
  validateFileCount,
  validateTotalUploadSize,
  UPLOADS_DIR_NAME,
} from './file-upload-validation';

import {
  performThreatDetection,
  quarantineFile,
  exportThreatDetectionReport,
  ThreatDetectionResult,
} from './file-content-threat-detection';

import crypto from 'crypto';
import logger from './logger';

/**
 * Complete file upload security validation result
 */
export interface SecureFileValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  fileType?: string;
  category?: string;
  threatLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  threats?: string[];
  recommendations?: string[];
  secureFilename?: string;
  fileHash?: string;
}

/**
 * Calculates SHA-256 hash of file for integrity verification
 * @param buffer - File contents
 * @returns Hex-encoded hash
 */
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Comprehensive file upload validation - All layers
 * 
 * Performs complete security validation:
 * 1. File metadata validation (type, size, count)
 * 2. Magic byte validation
 * 3. Threat detection (executables, scripts, polyglots)
 * 4. Content inspection (injection, archive bombs)
 * 5. Quarantine flagging
 * 
 * @param filename - Original filename
 * @param mimeType - MIME type from upload
 * @param buffer - File contents
 * @param uploadedBy - User ID (for quarantine logging)
 * @returns Complete validation result
 */
export async function performCompleteFileValidation(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  uploadedBy?: string
): Promise<SecureFileValidationResult> {
  const warnings: string[] = [];

  try {
    // ==========================================
    // LAYER 1: Basic metadata validation
    // ==========================================
    const basicValidation = validateFile(filename, mimeType, buffer);
    if (!basicValidation.valid) {
      return {
        valid: false,
        error: basicValidation.error || 'File validation failed',
        threatLevel: 'critical',
      };
    }

    // ==========================================
    // LAYER 2: Advanced threat detection
    // ==========================================
    const threatDetection = performThreatDetection(buffer, filename, mimeType);

    // If critical threats detected, block immediately
    if (threatDetection.riskLevel === 'critical') {
      logger.warn('🚨 CRITICAL FILE UPLOAD THREAT DETECTED', {
        filename,
        uploadedBy,
        threats: threatDetection.threats,
        riskLevel: threatDetection.riskLevel,
      });

      // Quarantine the file
      const fileHash = calculateFileHash(buffer);
      quarantineFile({
        fileId: fileHash,
        filename,
        uploadedAt: new Date(),
        fileHash,
        threatLevel: 'critical',
        threats: threatDetection.threats,
        uploadedBy: uploadedBy || 'unknown',
        reason: threatDetection.threats.join('; '),
      });

      return {
        valid: false,
        error: `File contains critical security threats: ${threatDetection.threats[0]}`,
        threats: threatDetection.threats,
        recommendations: threatDetection.recommendations,
        threatLevel: 'critical',
      };
    }

    // High risk - block but log for review
    if (threatDetection.riskLevel === 'high') {
      logger.warn('⚠️ HIGH-RISK FILE UPLOAD DETECTED', {
        filename,
        uploadedBy,
        threats: threatDetection.threats,
        riskLevel: threatDetection.riskLevel,
      });

      const fileHash = calculateFileHash(buffer);
      quarantineFile({
        fileId: fileHash,
        filename,
        uploadedAt: new Date(),
        fileHash,
        threatLevel: 'high',
        threats: threatDetection.threats,
        uploadedBy: uploadedBy || 'unknown',
        reason: threatDetection.threats.join('; '),
      });

      return {
        valid: false,
        error: `File poses high security risk: ${threatDetection.threats[0]}`,
        threats: threatDetection.threats,
        recommendations: threatDetection.recommendations,
        threatLevel: 'high',
      };
    }

    // Medium risk - allow but warn
    if (threatDetection.riskLevel === 'medium') {
      logger.info('ℹ️ MEDIUM-RISK FILE DETECTED - ALLOWING', {
        filename,
        uploadedBy,
        threats: threatDetection.threats,
      });

      warnings.push(
        `File has potential security concerns: ${threatDetection.threats.join(', ')}`
      );
    }

    // ==========================================
    // All validations passed
    // ==========================================
    const secureFilename = generateSecureFilename(filename);
    const fileHash = calculateFileHash(buffer);

    logger.info('✅ FILE VALIDATION PASSED', {
      filename,
      secureFilename,
      fileHash,
      uploadedBy,
      fileType: basicValidation.fileType,
      threatLevel: threatDetection.riskLevel,
    });

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      fileType: basicValidation.fileType,
      category: basicValidation.category,
      threatLevel: threatDetection.riskLevel,
      threats: threatDetection.threats.length > 0 ? threatDetection.threats : undefined,
      recommendations: threatDetection.recommendations.length > 0 ? threatDetection.recommendations : undefined,
      secureFilename,
      fileHash,
    };
  } catch (error) {
    logger.error('FILE VALIDATION EXCEPTION', {
      filename,
      uploadedBy,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      valid: false,
      error: 'File validation error - please try again',
      threatLevel: 'critical',
    };
  }
}

/**
 * Batch validation for multiple files
 * Validates file count, total size, then each file individually
 * 
 * @param files - Array of file info (filename, mimeType, buffer)
 * @param uploadedBy - User ID
 * @returns Array of validation results
 */
export async function performBatchFileValidation(
  files: Array<{ filename: string; mimeType: string; buffer: Buffer }>,
  uploadedBy?: string
): Promise<SecureFileValidationResult[]> {
  // Check file count
  const countValidation = validateFileCount(files.length);
  if (!countValidation.valid) {
    return [
      {
        valid: false,
        error: countValidation.error,
        threatLevel: 'critical',
      },
    ];
  }

  // Check total size
  const sizeValidation = validateTotalUploadSize(
    files.map(f => ({ size: f.buffer.length } as File))
  );
  if (!sizeValidation.valid) {
    return [
      {
        valid: false,
        error: sizeValidation.error,
        threatLevel: 'critical',
      },
    ];
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

/**
 * Security audit log for file uploads
 */
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

const auditLog: FileUploadAuditEntry[] = [];

/**
 * Log file upload for audit trail
 * @param entry - Audit entry
 */
export function logFileUploadAudit(entry: FileUploadAuditEntry): void {
  auditLog.push(entry);

  // Also log to persistent logger
  logger.info('FILE_UPLOAD_AUDIT', {
    filename: entry.filename,
    validationResult: entry.validationResult,
    threatLevel: entry.threatLevel,
    uploadedBy: entry.uploadedBy,
  });
}

/**
 * Get file upload audit log (admin only)
 * @param filters - Optional filters
 * @returns Filtered audit entries
 */
export function getFileUploadAuditLog(filters?: {
  uploadedBy?: string;
  validationResult?: 'passed' | 'failed' | 'flagged';
  startDate?: Date;
  endDate?: Date;
}): FileUploadAuditEntry[] {
  let results = auditLog;

  if (filters?.uploadedBy) {
    results = results.filter(e => e.uploadedBy === filters.uploadedBy);
  }

  if (filters?.validationResult) {
    results = results.filter(e => e.validationResult === filters.validationResult);
  }

  if (filters?.startDate) {
    results = results.filter(e => e.timestamp >= filters.startDate!);
  }

  if (filters?.endDate) {
    results = results.filter(e => e.timestamp <= filters.endDate!);
  }

  return results;
}

/**
 * Generate security compliance report
 * Shows validation statistics and risk assessment
 */
export function generateFileUploadSecurityReport(): Record<string, unknown> {
  const totalUploads = auditLog.length;
  const passedValidation = auditLog.filter(e => e.validationResult === 'passed').length;
  const failedValidation = auditLog.filter(e => e.validationResult === 'failed').length;
  const flaggedFiles = auditLog.filter(e => e.validationResult === 'flagged').length;

  const uniqueThreats = new Set<string>();
  auditLog.forEach(e => {
    e.threats?.forEach(t => uniqueThreats.add(t));
  });

  const successRate = totalUploads > 0 ? (passedValidation / totalUploads) * 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    statistics: {
      totalUploads,
      passedValidation,
      failedValidation,
      flaggedFiles,
      successRate: successRate.toFixed(2) + '%',
    },
    security: {
      uniqueThreatsDetected: Array.from(uniqueThreats),
      threatCount: uniqueThreats.size,
      criticalIncidents: auditLog.filter(e => e.threatLevel === 'critical').length,
      highRiskIncidents: auditLog.filter(e => e.threatLevel === 'high').length,
    },
    compliance: {
      cweCoverage: 'CWE-434 (Unrestricted Upload)',
      validationLayers: 5,
      defenseMechanisms: [
        'Magic byte validation',
        'Executable signature detection',
        'Script injection detection',
        'Archive bomb detection',
        'Polyglot file detection',
        'Quarantine system',
        'Audit logging',
      ],
    },
  };
}

/**
 * Export validation result for API response
 */
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
    secureFilename: result.secureFilename,
  };
}
