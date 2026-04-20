/**
 * Information Disclosure Prevention Module
 * SECURITY FOCUS: A05:2021 – Security Misconfiguration + A03:2021 – Injection
 * 
 * Prevents exposure of sensitive information through:
 * - Error messages and stack traces
 * - HTTP response headers
 * - API response metadata
 * - Database error details
 * - Framework/library version information
 * 
 * Attack Scenarios Prevented:
 * ✅ Database error reveals table/column names → Attacker learns schema
 * ✅ Stack trace reveals source code paths → Attacker finds vulnerabilities
 * ✅ Server header reveals nginx version → Attacker exploits known CVEs
 * ✅ Error message contains user data → Attacker learns sensitive info
 * ✅ X-Powered-By header exposes framework → Attacker targets framework vulnerabilities
 */

/**
 * Internal error information - stored server-side only, not exposed to clients
 */
export interface InternalErrorDetails {
  originalError: Error | string;
  code: string;
  statusCode: number;
  timestamp: Date;
  requestId?: string;
  userId?: string;
  pathname?: string;
  method?: string;
  userAgent?: string;
  // Stack trace and details for logging only
  stack?: string;
  details?: Record<string, any>;
}

/**
 * Safe error response shown to clients - generic and non-disclosive
 */
export interface SafeErrorResponse {
  success: false;
  error: string; // Generic user-friendly message
  code: string; // Error code for client handling
  // NO stack traces, paths, versions, or sensitive data
}

/**
 * Maps database error codes to generic messages
 * Prevents information disclosure through error patterns
 */
const DATABASE_ERROR_MAPPING: Record<string, string> = {
  // PostgreSQL errors
  'P2000': 'Invalid data provided',
  'P2001': 'Query failed',
  'P2002': 'Unique constraint violation',
  'P2003': 'Invalid relationship',
  'P2004': 'Constraint violation',
  'P2005': 'Invalid data',
  'P2006': 'Invalid data',
  'P2007': 'Data validation failed',
  'P2008': 'Query parsing failed',
  'P2009': 'Query validation failed',
  'P2010': 'Query execution failed',
  'P2011': 'Required field missing',
  'P2012': 'Missing required argument',
  'P2013': 'Missing required argument',
  'P2014': 'Required relation violation',
  'P2015': 'Related record not found',
  'P2016': 'Query interpretation failed',
  'P2017': 'Missing required related records',
  'P2018': 'Required relation record not found',
  'P2019': 'Input error',
  'P2020': 'Value out of range',
  'P2021': 'Table not found',
  'P2022': 'Column not found',
  'P2023': 'Inconsistent column data',
  'P2024': 'Timed out fetching execution plan',
  'P2025': 'An operation failed',
  'P2026': 'Database error',
  'P2027': 'Multiple errors',
  'P2028': 'Transaction API error',
  'P2029': 'Query parameter limit exceeded',
  'P2030': 'Full text search index not found',
  'P2031': 'Mongo db error',
  'P2032': 'Mongo db error',
  'P2033': 'Mongo db error',
};

/**
 * Maps framework/third-party errors to generic messages
 */
const FRAMEWORK_ERROR_MAPPING: Record<string, string> = {
  'ENOENT': 'Resource not found',
  'EACCES': 'Access denied',
  'EISDIR': 'Invalid resource type',
  'EMFILE': 'System error',
  'ENOTDIR': 'Invalid path',
  'EEXIST': 'Duplicate resource',
  'JWT': 'Authentication failed',
  'INVALID_SIGNATURE': 'Authentication failed',
  'EXPIRED': 'Session expired',
  'UNAUTHORIZED': 'Not authorized',
  'FORBIDDEN': 'Access denied',
  'NOT_FOUND': 'Resource not found',
  'TIMEOUT': 'Request timed out',
  'RATE_LIMITED': 'Too many requests',
};

/**
 * Authentication-specific error messages (generic by design)
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'INVALID_CREDENTIALS': 'Invalid email or password',
  'USER_NOT_FOUND': 'Invalid email or password',
  'ACCOUNT_DISABLED': 'This account is not active',
  'SESSION_EXPIRED': 'Your session has expired. Please log in again.',
  'INVALID_TOKEN': 'Authentication failed. Please try again.',
  'TOKEN_EXPIRED': 'Your session has expired. Please log in again.',
  'UNAUTHORIZED': 'You do not have permission to perform this action',
  'FORBIDDEN': 'Access denied',
  'INSUFFICIENT_PERMISSIONS': 'You do not have the required permissions',
};

/**
 * Validation error messages (generic but helpful)
 */
const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  'INVALID_FORMAT': 'Invalid data format provided',
  'INVALID_INPUT': 'Invalid input provided',
  'MISSING_REQUIRED': 'Required information is missing',
  'INVALID_EMAIL': 'Invalid email format',
  'INVALID_PHONE': 'Invalid phone number format',
  'PASSWORD_TOO_WEAK': 'Password does not meet security requirements',
  'PASSWORD_MISMATCH': 'Passwords do not match',
  'FILE_TOO_LARGE': 'File size exceeds limit',
  'UNSUPPORTED_FILE_TYPE': 'File type not supported',
  'INVALID_DATE': 'Invalid date provided',
};

/**
 * Database operation error messages (generic)
 */
const DATABASE_ERROR_MESSAGES: Record<string, string> = {
  'DUPLICATE_KEY': 'This record already exists',
  'FOREIGN_KEY_VIOLATION': 'Cannot perform this operation due to related records',
  'CONSTRAINT_VIOLATION': 'This action violates system constraints',
  'TRANSACTION_FAILED': 'Operation could not be completed',
  'DEADLOCK': 'Operation failed. Please try again.',
  'QUERY_FAILED': 'Database operation failed. Please try again.',
  'CONNECTION_FAILED': 'Database connection failed. Please try again.',
};

/**
 * Detects error type from error message or object
 */
function detectErrorType(error: any): string {
  if (!error) return 'UNKNOWN_ERROR';

  const message = error?.message || error?.toString() || '';
  const messageUpper = message.toUpperCase();

  // Check for database errors
  for (const [code, _] of Object.entries(DATABASE_ERROR_MAPPING)) {
    if (messageUpper.includes(code)) return code;
  }

  // Check for framework errors
  for (const [code, _] of Object.entries(FRAMEWORK_ERROR_MAPPING)) {
    if (messageUpper.includes(code)) return code;
  }

  // Check for specific patterns
  if (messageUpper.includes('INVALID') || messageUpper.includes('FORMAT')) return 'INVALID_FORMAT';
  if (messageUpper.includes('REQUIRED') || messageUpper.includes('MISSING')) return 'MISSING_REQUIRED';
  if (messageUpper.includes('DUPLICATE') || messageUpper.includes('ALREADY')) return 'DUPLICATE_KEY';
  if (messageUpper.includes('UNAUTHORIZED') || messageUpper.includes('PERMISSION')) return 'UNAUTHORIZED';
  if (messageUpper.includes('FORBIDDEN') || messageUpper.includes('DENIED')) return 'FORBIDDEN';
  if (messageUpper.includes('NOT_FOUND') || messageUpper.includes('NOTFOUND')) return 'NOT_FOUND';

  return 'OPERATION_FAILED';
}

/**
 * Gets safe error message for client response
 * NEVER exposes stack traces, file paths, database details, or raw error info
 * @param error Error object or string
 * @param errorType Optional error type hint
 * @returns Safe, generic error message suitable for user display
 */
export function getSafeErrorMessage(error: any, errorType?: string): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const detectedType = errorType || detectErrorType(error);
  const message = error?.message || error?.toString() || '';

  // Check authentication errors first (these need specific handling)
  if (message.includes('Unauthorized') || message.includes('authentication')) {
    return AUTH_ERROR_MESSAGES['UNAUTHORIZED'];
  }
  if (message.includes('permission') || message.includes('privilege')) {
    return AUTH_ERROR_MESSAGES['INSUFFICIENT_PERMISSIONS'];
  }
  if (message.includes('Session')) {
    return AUTH_ERROR_MESSAGES['SESSION_EXPIRED'];
  }

  // Check validation errors
  if (detectedType === 'INVALID_FORMAT') {
    return VALIDATION_ERROR_MESSAGES['INVALID_FORMAT'];
  }
  if (detectedType === 'MISSING_REQUIRED') {
    return VALIDATION_ERROR_MESSAGES['MISSING_REQUIRED'];
  }

  // Check database errors
  if (detectedType in DATABASE_ERROR_MESSAGES) {
    return DATABASE_ERROR_MESSAGES[detectedType];
  }

  // Check framework errors
  if (detectedType in FRAMEWORK_ERROR_MAPPING) {
    return FRAMEWORK_ERROR_MAPPING[detectedType];
  }

  // Default safe message
  return 'An error occurred. Please try again or contact support.';
}

/**
 * Creates internal error details for server-side logging
 * Contains full error information that's NEVER sent to client
 */
export function createInternalError(
  error: any,
  code: string,
  statusCode: number = 500,
  context?: Partial<InternalErrorDetails>
): InternalErrorDetails {
  return {
    originalError: error,
    code,
    statusCode,
    timestamp: new Date(),
    stack: error?.stack,
    details: {
      message: error?.message,
      name: error?.name,
      type: error?.constructor?.name,
      ...context?.details,
    },
    ...context,
  };
}

/**
 * Creates safe error response for API/client consumption
 * Contains NO sensitive information
 */
export function createSafeErrorResponse(
  error: any,
  code: string,
  statusCode: number = 500
): SafeErrorResponse {
  return {
    success: false,
    error: getSafeErrorMessage(error),
    code,
  };
}

/**
 * Sanitizes error message for logging (removes sensitive patterns)
 * @param message Error message to sanitize
 * @returns Sanitized message suitable for logs
 */
export function sanitizeErrorForLogging(message: string): string {
  if (!message) return '';

  let sanitized = message;

  // Remove common sensitive patterns
  const sensitivePatterns = [
    /password\s*[:=]\s*['"][^'"]+['"]/gi, // password = "xxx"
    /token\s*[:=]\s*['"][^'"]+['"]/gi, // token = "xxx"
    /secret\s*[:=]\s*['"][^'"]+['"]/gi, // secret = "xxx"
    /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, // api_key = "xxx"
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // email addresses
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN-like patterns
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
  ];

  for (const pattern of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

/**
 * Strips sensitive information from error for inclusion in responses
 * @param error Error object
 * @returns Sanitized error with minimal information
 */
export function stripSensitiveData(error: any): Record<string, any> {
  if (!error) return {};

  return {
    code: error.code,
    statusCode: error.statusCode,
    timestamp: error.timestamp?.toISOString?.(),
    requestId: error.requestId,
    // NO: stack, details, original error, paths, etc.
  };
}

/**
 * Identifies sensitive error information that should NOT be logged in production
 * @param error Error object
 * @returns Array of sensitive fields present in error
 */
export function findSensitiveDataInError(error: any): string[] {
  const sensitive: string[] = [];

  if (!error) return sensitive;

  // Check for database connection strings
  if (error.message?.includes('postgresql://') || error.message?.includes('mysql://')) {
    sensitive.push('DATABASE_URL');
  }

  // Check for API keys
  if (error.message?.includes('api_key') || error.message?.includes('API_KEY')) {
    sensitive.push('API_KEY');
  }

  // Check for JWT tokens
  if (error.message?.includes('eyJ') || error.message?.includes('JWT')) {
    sensitive.push('JWT_TOKEN');
  }

  // Check for file paths (potential source disclosure)
  if (error.stack?.includes('/usr/') || error.stack?.includes('C:\\')) {
    sensitive.push('FILE_PATHS');
  }

  // Check for email addresses
  if (error.message?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
    sensitive.push('EMAIL_ADDRESSES');
  }

  return sensitive;
}

/**
 * Determines if error should be logged at all (in production)
 * Some errors are expected and shouldn't be logged
 * @param error Error object
 * @returns true if error should be logged
 */
export function shouldLogError(error: any): boolean {
  if (!error) return false;

  const message = error?.message || '';
  const messageUpper = message.toUpperCase();

  // Don't log expected/benign errors
  const ignorePatterns = [
    'NOT_FOUND',
    'NOT FOUND',
    'NOTFOUND',
    'CANCEL',
    'CLOSED',
    'ENOTDIR',
    'ENOENT',
    'SESSION_EXPIRED',
    'INVALID_CREDENTIALS',
    'USER_NOT_FOUND',
  ];

  for (const pattern of ignorePatterns) {
    if (messageUpper.includes(pattern)) return false;
  }

  return true;
}

/**
 * Determines appropriate HTTP status code for error
 * @param error Error object or code string
 * @returns HTTP status code
 */
export function getStatusCodeForError(error: any): number {
  const code = typeof error === 'string' ? error : error?.code || error?.message || '';
  const codeUpper = code.toUpperCase();

  if (codeUpper.includes('UNAUTHORIZED') || codeUpper.includes('INVALID_CREDENTIALS')) return 401;
  if (codeUpper.includes('FORBIDDEN') || codeUpper.includes('UNAUTHORIZED')) return 403;
  if (codeUpper.includes('NOT_FOUND') || codeUpper.includes('NOTFOUND')) return 404;
  if (codeUpper.includes('INVALID_INPUT') || codeUpper.includes('VALIDATION')) return 400;
  if (codeUpper.includes('RATE_LIMITED') || codeUpper.includes('RATELIMIT')) return 429;
  if (codeUpper.includes('CONFLICT') || codeUpper.includes('DUPLICATE')) return 409;

  return 500;
}

/**
 * Creates standardized error response for server actions
 * @param error Error to handle
 * @param context Additional context (userId, action, etc.)
 * @returns Safe response object
 */
export function handleServerActionError(
  error: any,
  context?: { userId?: string; action?: string; resource?: string }
) {
  const errorType = detectErrorType(error);
  const statusCode = getStatusCodeForError(errorType);

  return {
    success: false,
    error: getSafeErrorMessage(error, errorType),
    code: errorType,
    // Internal: this would be logged server-side
    _internal: {
      statusCode,
      shouldLog: shouldLogError(error),
      sensitiveData: findSensitiveDataInError(error),
      context,
    },
  };
}

/**
 * Removes potentially sensitive headers from HTTP responses
 * @param headers Response headers object
 * @returns Sanitized headers
 */
export function sanitizeResponseHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };

  // Remove headers that expose server/framework information
  delete sanitized['Server'];
  delete sanitized['X-Powered-By'];
  delete sanitized['X-AspNet-Version'];
  delete sanitized['X-Runtime-Version'];
  delete sanitized['X-Served-By'];
  delete sanitized['X-Cache'];
  delete sanitized['X-Cache-Hits'];
  delete sanitized['X-Backend'];
  delete sanitized['Via'];
  delete sanitized['X-Nginx-Version'];
  delete sanitized['X-Generator'];
  delete sanitized['Set-Cookie']; // Handled separately for security

  return sanitized;
}

/**
 * List of headers to ALWAYS remove for security
 */
export const HEADERS_TO_REMOVE = [
  'Server',
  'X-Powered-By',
  'X-AspNet-Version',
  'X-Runtime-Version',
  'X-Served-By',
  'X-Cache',
  'X-Backend',
  'Via',
  'X-Nginx-Version',
  'X-Generator',
];

/**
 * Validates that error is not exposing sensitive information
 * (For testing/development)
 * @param error Error object
 * @returns true if error is safe (doesn't contain sensitive data)
 */
export function isErrorSafe(error: any): boolean {
  const sensitiveData = findSensitiveDataInError(error);
  return sensitiveData.length === 0;
}
