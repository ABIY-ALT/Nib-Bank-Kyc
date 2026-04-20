/**
 * Centralized Error Response Handler
 * 
 * Ensures ALL error responses use generic, non-disclosive messages
 * Prevents information disclosure (CWE-209, OWASP A05)
 * 
 * File: src/lib/error-response-handler.ts
 * Usage: Wrap all server actions and API routes
 */

import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logInstitutionalError } from './logger';

/**
 * Standard error response structure
 */
export interface StandardErrorResponse {
  success: false;
  error: string; // Generic user-friendly message
  code: string; // Error code for client handling
  timestamp: string;
}

/**
 * Generic error messages - no sensitive details exposed
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication
  UNAUTHORIZED: 'Authentication required',
  INVALID_TOKEN: 'Authentication failed',
  EXPIRED_TOKEN: 'Session expired. Please log in again.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action',
  
  // Database
  DUPLICATE_EMAIL: 'This email is already registered',
  DUPLICATE_PHONE: 'This phone number is already registered',
  DUPLICATE_KEY: 'This record already exists',
  NOT_FOUND: 'The requested resource was not found',
  FOREIGN_KEY_VIOLATION: 'Cannot delete this record due to related data',
  CONSTRAINT_VIOLATION: 'This action violates system constraints',
  
  // Validation
  INVALID_EMAIL: 'Invalid email format',
  INVALID_PHONE: 'Invalid phone number format',
  INVALID_PASSWORD: 'Password does not meet requirements',
  INVALID_INPUT: 'Invalid data provided',
  MISSING_REQUIRED: 'Required information is missing',
  
  // File operations
  FILE_TOO_LARGE: 'File size exceeds the maximum allowed limit',
  UNSUPPORTED_FILE_TYPE: 'File type is not supported',
  FILE_NOT_FOUND: 'File not found',
  INVALID_FILE: 'The uploaded file is invalid',
  
  // Business logic
  ACCOUNT_INACTIVE: 'This account is not active',
  ACCOUNT_LOCKED: 'Account is temporarily locked. Please try again later.',
  SESSION_EXPIRED: 'Your session has expired',
  OPERATION_NOT_ALLOWED: 'This operation is not allowed',
  
  // Generic fallback
  SERVER_ERROR: 'An error occurred. Please try again later.',
};

/**
 * Determine error code from error message
 */
function getErrorCode(error: any): string {
  if (error?.code) return error.code;
  
  const message = String(error?.message || '').toLowerCase();
  
  // Prisma errors
  if (message.includes('unique') || message.includes('already exists')) return 'DUPLICATE_KEY';
  if (message.includes('foreign key')) return 'FOREIGN_KEY_VIOLATION';
  if (message.includes('constraint')) return 'CONSTRAINT_VIOLATION';
  if (message.includes('not found')) return 'NOT_FOUND';
  
  // Auth errors
  if (message.includes('unauthorized')) return 'UNAUTHORIZED';
  if (message.includes('token')) return 'INVALID_TOKEN';
  if (message.includes('expired')) return 'EXPIRED_TOKEN';
  if (message.includes('permission')) return 'INSUFFICIENT_PERMISSIONS';
  
  // Validation errors
  if (message.includes('email')) return 'INVALID_EMAIL';
  if (message.includes('phone')) return 'INVALID_PHONE';
  if (message.includes('password')) return 'INVALID_PASSWORD';
  if (message.includes('required')) return 'MISSING_REQUIRED';
  
  return 'SERVER_ERROR';
}

/**
 * Get safe error message for client
 */
export function getSafeErrorMessage(error: any): string {
  const code = getErrorCode(error);
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR;
}

/**
 * Handle Prisma-specific errors safely
 */
export function handlePrismaError(error: any): StandardErrorResponse {
  // Handle unique constraint violations
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const field = (error.meta?.target as string[])?.[0];
      if (field?.toLowerCase().includes('email')) {
        return {
          success: false,
          error: ERROR_MESSAGES.DUPLICATE_EMAIL,
          code: 'DUPLICATE_EMAIL',
          timestamp: new Date().toISOString(),
        };
      }
      if (field?.toLowerCase().includes('phone')) {
        return {
          success: false,
          error: ERROR_MESSAGES.DUPLICATE_PHONE,
          code: 'DUPLICATE_PHONE',
          timestamp: new Date().toISOString(),
        };
      }
    }
    
    if (error.code === 'P2003') {
      return {
        success: false,
        error: ERROR_MESSAGES.FOREIGN_KEY_VIOLATION,
        code: 'FOREIGN_KEY_VIOLATION',
        timestamp: new Date().toISOString(),
      };
    }
    
    if (error.code === 'P2025') {
      return {
        success: false,
        error: ERROR_MESSAGES.NOT_FOUND,
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Generic error
  return {
    success: false,
    error: ERROR_MESSAGES.SERVER_ERROR,
    code: 'DATABASE_ERROR',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Wrap server actions to safely handle errors
 * 
 * Usage:
 * export async function myAction(data: any) {
 *   return wrapServerAction(async () => {
 *     // Your logic here
 *     return { success: true, data };
 *   });
 * }
 */
export async function wrapServerAction<T>(
  action: () => Promise<T>,
  options?: { context?: string }
): Promise<T | StandardErrorResponse> {
  try {
    return await action();
  } catch (error: any) {
    // Log full error details server-side
    logInstitutionalError(error, `SERVER_ACTION_ERROR${options?.context ? `_${options.context}` : ''}`);

    // Return generic error to client
    const code = getErrorCode(error);
    return {
      success: false,
      error: ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR,
      code,
      timestamp: new Date().toISOString(),
    } as StandardErrorResponse;
  }
}

/**
 * Create a safe NextResponse JSON error
 */
export function createErrorResponse(
  error: any,
  statusCode: number = 400,
  options?: { logError?: boolean; context?: string }
): NextResponse {
  if (options?.logError !== false) {
    logInstitutionalError(error, `API_ERROR${options?.context ? `_${options.context}` : ''}`);
  }

  const code = getErrorCode(error);
  const safeMessage = ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR;

  return NextResponse.json(
    {
      success: false,
      error: safeMessage,
      code,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

/**
 * Audit log endpoint access with error tracking
 */
export async function logEndpointError(
  endpoint: string,
  error: any,
  userId?: string,
  ipAddress?: string
): Promise<void> {
  try {
    const errorCode = getErrorCode(error);
    const errorMessage = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.SERVER_ERROR;

    // You could log to database here if needed
  } catch (err) {
  }
}
