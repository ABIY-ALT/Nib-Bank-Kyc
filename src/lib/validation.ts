import { z } from 'zod';
import { isValidInstitutionalLoginInput } from './login-identifier';

/**
 * @fileOverview Institutional Input Validation Schemas.
 * Hardened with size limits, type checks, and sanitization to prevent XSS and malformed payloads.
 */

// --- Authentication Schemas ---

export const LoginSchema = z.object({
  email: z
    .string()
    .min(3, 'Invalid institutional username')
    .max(255, 'Email exceeds max length')
    .toLowerCase()
    .trim()
    .refine(
      (value) => isValidInstitutionalLoginInput(value),
      'Use firstname.surname'
    ),
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
    .max(255, 'Email exceeds max length')
    .toLowerCase()
    .trim()
    .refine(
      (value) => !value || isValidInstitutionalLoginInput(value),
      'Use firstname.surname for the username'
    )
    .optional(),
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
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(256, 'Password exceeds max length')
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .min(1, 'Phone number required')
    .refine((val) => {
      try {
        const { parsePhoneNumber } = require('libphonenumber-js');
        const phoneNumber = parsePhoneNumber(val, 'ET');
        return phoneNumber.isValid();
      } catch (e) {
        return false;
      }
    }, 'Institutional policy: Provide a valid phone number (e.g. +251...)'),
  branchId: z.string().nullable().optional(),
  districtName: z.string().nullable().optional(),
  role: z.string().min(1, 'Role assignment required'),
}).superRefine((data, ctx) => {
  if (data.role === 'DISTRICT_DIRECTOR' && !data.districtName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['districtName'],
      message: 'District assignment required for District Director.',
    });
  }

  if (['BRANCH_MANAGER', 'BRANCH_OFFICER'].includes(data.role?.toUpperCase()) && !data.branchId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branchId'],
      message: 'Branch assignment required for branch roles.',
    });
  }
});

// --- KYC/Submission Validation Schemas ---

export const SubmissionSchema = z.object({
  customerName: z
    .string()
    .min(2, 'Customer name required')
    .max(200, 'Customer name exceeds max length')
    .regex(/^[a-zA-Z\s'-]*$/, 'Customer name contains invalid characters')
    .toUpperCase()
    .refine((val) => {
      const words = val.trim().split(/\s+/);
      return words.length >= 3;
    }, 'First name, father name, and grandfather name are mandatory'),
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
    .max(20 * 1024 * 1024, 'File exceeds 20MB limit'),
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
  const maxSize = 20 * 1024 * 1024; // 20MB
  return size <= maxSize;
}

export type LoginInput = z.infer<typeof LoginSchema>;
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type SubmissionInput = z.infer<typeof SubmissionSchema>;
