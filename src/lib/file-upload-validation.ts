/**
 * File Upload Validation Module
 * SECURITY FOCUS: A05:2021 – Security Misconfiguration
 * 
 * Implements comprehensive file upload security:
 * - Magic byte verification (prevent file type spoofing)
 * - MIME type validation
 * - File extension allow list
 * - File size limits
 * - Secure filename generation
 * - Prevent directory traversal attacks
 * 
 * Attack Scenarios Prevented:
 * ✅ Executable files disguised as documents (.exe → .pdf)
 * ✅ Script injection via file uploads (.php → .pdf)
 * ✅ Remote code execution via malicious uploads
 * ✅ Directory traversal attacks (../../malicious.php)
 * ✅ Files stored in web-accessible directories
 * ✅ Large file DoS attacks
 */

import crypto from 'crypto';

/**
 * File type definition with magic bytes (hex signatures) and MIME types
 * Magic bytes are the first few bytes of a file that identify its true type
 * Example: PDF files always start with %PDF (25 50 44 46)
 */
export interface FileTypeDefinition {
  extensions: string[];
  mimeTypes: string[];
  magicBytes: {
    offset: number;
    signature: Buffer;
  }[];
  maxSizeBytes: number;
  category: 'document' | 'image' | 'spreadsheet' | 'archive' | 'other';
  description: string;
}

// Default secure uploads directory name. Can be overridden with ENV var `UPLOAD_DIR`.
export const UPLOADS_DIR_NAME = process.env.UPLOAD_DIR || 'secure_uploads';

/**
 * ALLOWED FILE TYPES - Strict whitelist for KYC submissions
 * Only document and image types. Spreadsheets are NOT allowed.
 *
 * SECURITY NOTE: Spreadsheets are blocked due to:
 * - Macro vulnerabilities (VBA code execution)
 * - Formula injection attacks
 * - Embedded objects/scripts
 * - Data exfiltration risks
 *
 * Use PDF or image formats for KYC documentation instead.
 */
export const ALLOWED_FILE_TYPES: Record<string, FileTypeDefinition> = {
  // PDF - Most common document format in banking
  pdf: {
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    magicBytes: [
      {
        offset: 0,
        signature: Buffer.from('%PDF', 'utf8'), // Starts with %PDF
      },
    ],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB (Banking Standard)
    category: 'document',
    description: 'PDF Document',
  },

  // PNG Image
  png: {
    extensions: ['png'],
    mimeTypes: ['image/png'],
    magicBytes: [
      {
        offset: 0,
        signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
      },
    ],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    category: 'image',
    description: 'PNG Image',
  },

  // JPEG Image
  jpg: {
    extensions: ['jpg', 'jpeg'],
    mimeTypes: ['image/jpeg'],
    magicBytes: [
      {
        offset: 0,
        signature: Buffer.from([0xff, 0xd8, 0xff]), // JPEG start marker
      },
    ],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    category: 'image',
    description: 'JPEG Image',
  },

  // TIFF Image
  tiff: {
    extensions: ['tiff', 'tif'],
    mimeTypes: ['image/tiff'],
    magicBytes: [
      {
        offset: 0,
        signature: Buffer.from([0x49, 0x49, 0x2a, 0x00]), // TIFF little-endian
      },
      {
        offset: 0,
        signature: Buffer.from([0x4d, 0x4d, 0x00, 0x2a]), // TIFF big-endian
      },
    ],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    category: 'image',
    description: 'TIFF Image',
  },
};

/**
 * Validation result returned from file validation functions
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileType?: string;
  category?: string;
}

/**
 * Validates file extension against allow list
 * @param filename - Original filename from upload
 * @returns true if extension is in allow list
 */
export function isExtensionAllowed(filename: string): boolean {
  if (!filename) return false;

  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return false;

  // Check if extension exists in any allowed file type
  for (const fileType of Object.values(ALLOWED_FILE_TYPES)) {
    if (fileType.extensions.includes(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates MIME type against allow list
 * @param mimeType - MIME type from file upload
 * @returns true if MIME type is in allow list
 */
export function isMimeTypeAllowed(mimeType: string): boolean {
  if (!mimeType) return false;

  // Normalize MIME type
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();

  for (const fileType of Object.values(ALLOWED_FILE_TYPES)) {
    if (fileType.mimeTypes.includes(normalizedMime)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates file magic bytes (actual file signature)
 * This is the CRITICAL validation - prevents file type spoofing
 * 
 * Attack Scenario Prevented:
 * Attacker uploads malicious.exe renamed to document.pdf
 *   → Extension validation passes (PDF in allow list)
 *   → MIME type validation passes (application/pdf header)
 *   → Magic byte validation FAILS (file doesn't start with %PDF)
 *   → Upload rejected ✅
 * 
 * @param buffer - File contents as Buffer
 * @returns FileValidationResult with type information if valid
 */
export function validateFileMagicBytes(buffer: Buffer): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check each allowed file type
  for (const [typeName, fileType] of Object.entries(ALLOWED_FILE_TYPES)) {
    // Check if any magic byte signature matches
    for (const magicByte of fileType.magicBytes) {
      // Verify buffer has enough bytes for comparison
      if (buffer.length < magicByte.offset + magicByte.signature.length) {
        continue;
      }

      // Compare buffer content at offset with signature
      const fileSignature = buffer.subarray(magicByte.offset, magicByte.offset + magicByte.signature.length);

      if (Buffer.compare(fileSignature, magicByte.signature) === 0) {
        return {
          valid: true,
          fileType: typeName,
          category: fileType.category,
        };
      }
    }
  }

  return { valid: false, error: 'File type not recognized or not allowed' };
}

/**
 * Comprehensive file validation
 * Validates: extension, MIME type, magic bytes, file size
 * 
 * @param filename - Original filename
 * @param mimeType - MIME type from file
 * @param buffer - File contents
 * @returns Validation result with details
 */
export function validateFile(
  filename: string,
  mimeType: string,
  buffer: Buffer
): FileValidationResult {
  // 1. Validate extension and check for double extensions
  if (!isExtensionAllowed(filename)) {
    return {
      valid: false,
      error: `File type not allowed. Only PDF, JPG, PNG, and TIFF files are accepted.`,
    };
  }

  // Prevent double extensions (e.g. file.pdf.exe)
  const parts = filename.split('.');
  if (parts.length > 2) {
    return {
      valid: false,
      error: 'Double extensions are not allowed. Please rename the file (e.g. "document.pdf") and try again.',
    };
  }

  // 2. Validate MIME type
  if (!isMimeTypeAllowed(mimeType)) {
    return {
      valid: false,
      error: `File type not allowed. Only PDF, JPG, PNG, and TIFF files are accepted.`,
    };
  }

  // 3. File size validation is now handled at the submission level (total combined size).
  // Individual file size limits are no longer enforced.

  // 4. CRITICAL: Validate magic bytes (actual file content signature)
  const magicByteResult = validateFileMagicBytes(buffer);
  if (!magicByteResult.valid) {
    return {
      valid: false,
      error: magicByteResult.error,
    };
  }

  return {
    valid: true,
    fileType: magicByteResult.fileType,
    category: magicByteResult.category,
  };
}

/**
 * Generates a secure, non-predictable filename
 * Prevents directory traversal and filename enumeration attacks
 * 
 * @param originalFilename - Original filename from upload (used only for extension)
 * @returns Secure filename with random UUID-like prefix
 * 
 * Format: {random_16_bytes_hex}_{timestamp_ms}_{original_extension}
 * Example: a3f7e8c2b1d4f6a9_1713350400000_document.pdf
 * 
 * Why this format:
 * - Random hex: Prevents filename enumeration/guessing
 * - Timestamp: Helps identify upload time for forensics
 * - Extension: Preserved for content type detection
 */
export function generateSecureFilename(originalFilename: string): string {
  // Extract extension from original filename
  const ext = originalFilename.split('.').pop()?.toLowerCase() || '';

  // Generate 16 random bytes as hex (128-bit entropy)
  const randomBytes = crypto.randomBytes(16).toString('hex');

  // Combine: random + timestamp + extension
  const timestamp = Date.now();

  return `${randomBytes}_${timestamp}.${ext}`;
}

/**
 * Sanitizes filename to prevent directory traversal attacks
 * Removes path separators and special characters
 * 
 * @param filename - Filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'file';

  // Remove path separators (prevent directory traversal)
  let sanitized = filename.replace(/[\/\\]/g, '_');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Keep only alphanumeric, dots, dashes, underscores
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Remove multiple consecutive underscores/dots
  sanitized = sanitized.replace(/[._]{2,}/g, '_');

  // Remove leading/trailing dots and dashes
  // SECURITY FIX: Split alternation regex to prevent ReDoS (super-linear backtracking).
  // WHY: /^[\._-]+|[\._-]+$/g uses alternation with quantifiers that can cause
  // catastrophic backtracking on crafted input, leading to denial of service.
  sanitized = sanitized.replace(/^[\._-]+/, '');
  sanitized = sanitized.replace(/[\._-]+$/, '');

  return sanitized || 'file';
}

/**
 * Gets list of all allowed file extensions
 * @returns Comma-separated list of extensions
 */
export function getAllowedExtensions(): string[] {
  const extensions: Set<string> = new Set();

  for (const fileType of Object.values(ALLOWED_FILE_TYPES)) {
    fileType.extensions.forEach(ext => extensions.add(ext));
  }

  return Array.from(extensions).sort();
}

/**
 * Gets maximum total upload size
 * Prevents DoS attacks via large file uploads
 * @returns Maximum size in bytes
 */
export function getMaxTotalUploadSize(): number {
  // Total maximum: 20 MB per submission.
  //
  // Must not exceed the transport limit (next.config.ts proxyClientMaxBodySize
  // and serverActions.bodySizeLimit, both 20mb). A larger value here would
  // never be reached: the request would be cut off in transport first, and the
  // officer would see a connection failure instead of "your upload is too big".
  return 20 * 1024 * 1024;
}

/**
 * Validates total upload size doesn't exceed limits
 * @param files - Array of files
 * @returns Validation result
 */
export function validateTotalUploadSize(files: File[]): FileValidationResult {
  let totalSize = 0;

  for (const file of files) {
    totalSize += file.size;
  }

  const maxSize = getMaxTotalUploadSize();
  if (totalSize > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
    const currentSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Total upload size (${currentSizeMB} MB) exceeds maximum of ${maxSizeMB} MB`,
    };
  }

  return { valid: true };
}

/**
 * Validates maximum number of files per submission
 * @param fileCount - Number of files
 * @param isFirstSubmission - True if this is the initial submission
 * @returns Validation result
 */
export function validateFileCount(fileCount: number, isFirstSubmission: boolean = false): FileValidationResult {
  const MAX_FILES = 20;
  const MIN_FILES = 3;

  if (isFirstSubmission && fileCount < MIN_FILES) {
    return {
      valid: false,
      error: `Too few files. A minimum of ${MIN_FILES} files is required for the initial submission.`,
    };
  }

  if (fileCount > MAX_FILES) {
    return {
      valid: false,
      error: `Too many files. Maximum ${MAX_FILES} files allowed`,
    };
  }

  return { valid: true };
}

/**
 * Gets MIME type for secure file serving
 * Ensures proper Content-Type header to prevent XSS
 * 
 * @param filename - Filename with extension
 * @returns Appropriate MIME type for Content-Type header
 */
export function getSecureMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  for (const fileType of Object.values(ALLOWED_FILE_TYPES)) {
    if (fileType.extensions.includes(ext || '')) {
      // Always use the most specific MIME type
      return fileType.mimeTypes[0];
    }
  }

  // Default to most restrictive MIME type
  return 'application/octet-stream';
}

/**
 * Validates filename doesn't contain path traversal attempts
 * Prevents: ../../etc/passwd, ..\windows\system32, etc.
 * 
 * @param filename - Filename to validate
 * @returns true if filename is safe
 */
export function isFilenameSafe(filename: string): boolean {
  if (!filename) return false;

  // Check for path traversal patterns
  const unsafePatterns = [
    /\.\./, // Relative path navigation
    /[\/\\]/, // Path separators
    /\0/, // Null bytes
    /^[./\\]/, // Starts with path separator
  ];

  for (const pattern of unsafePatterns) {
    if (pattern.test(filename)) {
      return false;
    }
  }

  return true;
}
