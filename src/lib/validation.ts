import { z } from 'zod';

/**
 * @fileOverview Institutional Input Validation Schemas.
 * Hardened with size limits, type checks, and sanitization to prevent XSS and malformed payloads.
 */

// --- Authentication Schemas ---

export const LoginSchema = z.object({
  email: z
    .string()
    .email('Invalid institutional email format')
    .max(255, 'Email exceeds max length')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(256, 'Password exceeds max length'),
});

export const PasswordChangeSchema = z.object({
  userId: z.string().min(5).max(100),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(256, 'Password exceeds max length')
    .regex(
      /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
      'Password must contain uppercase, number, and special character'
    ),
});

// --- User Management Schemas ---

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
  branchId: z.string().nullable().optional(),
  role: z.string().min(1, 'Role assignment required'),
});

// --- KYC/Submission Validation Schemas ---

export const SubmissionSchema = z.object({
  id: z.string().min(5).max(50),
  customerName: z
    .string()
    .min(2, 'Customer name required')
    .max(200, 'Customer name exceeds max length')
    .regex(/^[a-zA-Z\s'-]*$/, 'Customer name contains invalid characters'),
  entityType: z
    .string()
    .min(1, 'Entity type required')
    .max(100, 'Entity type exceeds max length'),
  branchName: z.string().min(1),
  districtName: z.string().min(1),
  remarks: z.string().max(2000).optional(),
});

// --- File Security Schemas ---

export const FileUploadSchema = z.object({
  fileName: z
    .string()
    .max(255, 'File name exceeds max length')
    .regex(/\.[a-z]{2,4}$/i, 'Invalid file extension'),
  fileSize: z
    .number()
    .max(10 * 1024 * 1024, 'File exceeds 10MB limit'),
  mimeType: z
    .string()
    .refine(
      (type) => ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(type),
      'Invalid file type. Only PDF and images allowed.'
    ),
});

/**
 * Sanitizes user input to mitigate XSS risks.
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 2000);
}

/**
 * Validates API request payload size before parsing.
 */
export function validatePayloadSize(data: any): boolean {
  const size = JSON.stringify(data).length;
  const maxSize = 10 * 1024 * 1024; // 10MB
  return size <= maxSize;
}

export type LoginInput = z.infer<typeof LoginSchema>;
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type SubmissionInput = z.infer<typeof SubmissionSchema>;
