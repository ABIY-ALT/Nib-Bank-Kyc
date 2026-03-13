import { z } from 'zod';

/**
 * Institutional Input Validation Schemas
 * Hardened with size limits, type checks, and sanitization
 */

// Authentication
export const LoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email exceeds max length')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(256, 'Password exceeds max length'),
});

export const PasswordChangeSchema = z.object({
  userId: z
    .string()
    .uuid('Invalid user ID format')
    .max(36, 'User ID exceeds max length'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(256, 'Password exceeds max length')
    .regex(
      /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
      'Password must contain uppercase, number, and special character'
    ),
});

// User Management
export const CreateUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email exceeds max length')
    .toLowerCase()
    .trim(),
  firstName: z
    .string()
    .min(1, 'First name required')
    .max(100, 'First name exceeds max length')
    .regex(/^[a-zA-Z\s-']*$/, 'First name contains invalid characters'),
  lastName: z
    .string()
    .min(1, 'Last name required')
    .max(100, 'Last name exceeds max length')
    .regex(/^[a-zA-Z\s-']*$/, 'Last name contains invalid characters'),
  phoneNumber: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\+?[0-9]{7,15}$/.test(val),
      'Invalid phone number format'
    ),
  branchId: z.string().uuid('Invalid branch ID').optional(),
  roleIds: z
    .array(z.string().uuid('Invalid role ID'))
    .min(1, 'At least one role required')
    .max(10, 'Too many roles assigned'),
});

// KYC/Submission Validation
export const SubmissionSchema = z.object({
  customerName: z
    .string()
    .min(2, 'Customer name required')
    .max(200, 'Customer name exceeds max length')
    .regex(/^[a-zA-Z\s'-]*$/, 'Customer name contains invalid characters'),
  entityType: z
    .string()
    .max(100, 'Entity type exceeds max length')
    .optional(),
  status: z
    .enum(['SUBMITTED', 'IN_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED', 'ESCALATED'])
    .optional(),
  branchId: z
    .string()
    .uuid('Invalid branch ID'),
  createdById: z
    .string()
    .uuid('Invalid creator ID'),
});

// File Upload Validation
export const FileUploadSchema = z.object({
  fileName: z
    .string()
    .max(255, 'File name exceeds max length')
    .regex(/\.[a-z]{2,4}$/i, 'Invalid file extension'),
  fileSize: z
    .number()
    .max(10 * 1024 * 1024, 'File exceeds 10MB limit'),
  mimeType: z
    .enum([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
    ])
    .refine(
      (type) => type,
      'Invalid file type. Only PDF and images allowed.'
    ),
});

// API Request Body Validation
export const ApiRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  endpoint: z
    .string()
    .max(500, 'Endpoint URL exceeds max length')
    .regex(/^\/[a-zA-Z0-9\/_-]*$/, 'Invalid endpoint format'),
  payload: z.object({}).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Validation Utilities
 */

/**
 * Sanitizes user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 1000); // Max 1000 chars
}

/**
 * Validates email format and length
 */
export function validateEmail(email: string): boolean {
  try {
    LoginSchema.pick({ email: true }).parse({ email });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (password.length > 256) {
    errors.push('Password exceeds maximum length');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates API request payload size
 */
export function validateRequestSize(data: any): { valid: boolean; size: number } {
  const size = JSON.stringify(data).length;
  const maxSize = 10 * 1024 * 1024; // 10MB
  return {
    valid: size <= maxSize,
    size,
  };
}

/**
 * Type exports for use in components/actions
 */
export type LoginInput = z.infer<typeof LoginSchema>;
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type SubmissionInput = z.infer<typeof SubmissionSchema>;
export type FileUploadInput = z.infer<typeof FileUploadSchema>;
