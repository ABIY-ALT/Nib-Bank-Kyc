/**
 * Phone Number Validation Utility
 * 
 * Production-grade phone number validation using libphonenumber-js
 * Features:
 * - E.164 format normalization
 * - Valid + possible number checking
 * - Country code validation
 * - Length validation
 * - Consistent error messages
 */

import { parsePhoneNumber, isValidPhoneNumber, getCountryCallingCode } from 'libphonenumber-js';
import { safeLog } from '@/lib/logging-redaction';

/**
 * Phone validation error types
 */
export enum PhoneValidationError {
  MISSING_COUNTRY_CODE = 'MISSING_COUNTRY_CODE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_COUNTRY_CODE = 'INVALID_COUNTRY_CODE',
  TOO_SHORT = 'TOO_SHORT',
  TOO_LONG = 'TOO_LONG',
  INVALID_CHARACTERS = 'INVALID_CHARACTERS',
  NOT_POSSIBLE = 'NOT_POSSIBLE',
  INVALID_TYPE = 'INVALID_TYPE',
}

/**
 * Phone validation result
 */
export interface PhoneValidationResult {
  isValid: boolean;
  normalizedNumber?: string;
  countryCode?: string;
  nationalNumber?: string;
  error?: PhoneValidationError;
  errorMessage: string;
}

/**
 * Configuration constants
 */
export const PHONE_CONFIG = {
  // Minimum length (including + and country code)
  MIN_LENGTH: 7,
  
  // Maximum length (E.164 standard)
  MAX_LENGTH: 15,
  
  // Supported countries (empty = all countries)
  SUPPORTED_COUNTRIES: [] as string[], // Empty = all countries allowed
  
  // Countries allowed (whitelist)
  ALLOWED_COUNTRY_CODES: [
    'US', // +1
    'GB', // +44
    'IN', // +91
    'KE', // +254
    'ET', // +251 Ethiopia
    'NG', // +234 Nigeria
    'ZA', // +27 South Africa
    // Add more as needed
  ] as string[],
  
  // Allow all countries or enforce whitelist
  ENFORCE_COUNTRY_WHITELIST: false,
};

/**
 * User-friendly error messages
 */
const ERROR_MESSAGES: Record<PhoneValidationError, string> = {
  [PhoneValidationError.MISSING_COUNTRY_CODE]: 'Invalid phone number format. Use international format (e.g., +251912345678).',
  [PhoneValidationError.INVALID_FORMAT]: 'Invalid phone number format. Ensure it includes country code.',
  [PhoneValidationError.INVALID_COUNTRY_CODE]: 'Invalid country code. Please check and try again.',
  [PhoneValidationError.TOO_SHORT]: 'Phone number is too short.',
  [PhoneValidationError.TOO_LONG]: 'Phone number is too long.',
  [PhoneValidationError.INVALID_CHARACTERS]: 'Phone number contains invalid characters. Use only digits and symbols (+, -, space).',
  [PhoneValidationError.NOT_POSSIBLE]: 'This does not appear to be a valid phone number for the specified country.',
  [PhoneValidationError.INVALID_TYPE]: 'Phone number must be a string.',
};

/**
 * Detect if input starts with + or country code
 */
function hasCountryCode(input: string): boolean {
  return input.trim().startsWith('+') || /^\d{1,3}/.test(input);
}

/**
 * Try to deduce country code from input
 */
function tryDeduceCountryCode(input: string): string | null {
  // If starts with +, it has explicit country code
  if (input.startsWith('+')) {
    return null; // Let libphonenumber handle it
  }

  // Remove leading 0 if present (common in many countries)
  let normalized = input;
  if (input.startsWith('0') && input.length > 1) {
    // Check if it looks like local format without country code
    // Common pattern: 0XXXXXXXXX (Ethiopia, Kenya, etc.)
    return null; // User should add country code
  }

  return null;
}

/**
 * Main validation function
 * 
 * Validates phone number against strict criteria:
 * - Must have country code (+ prefix)
 * - Must be possible number (valid format for country)
 * - Must be valid number (real number that could exist)
 * - Must meet length requirements
 */
export function validatePhoneNumber(input: unknown): PhoneValidationResult {
  // Type check
  if (typeof input !== 'string') {
    return {
      isValid: false,
      error: PhoneValidationError.INVALID_TYPE,
      errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_TYPE],
    };
  }

  const phone = input.trim();

  // Empty check
  if (!phone) {
    return {
      isValid: false,
      error: PhoneValidationError.INVALID_FORMAT,
      errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_FORMAT],
    };
  }

  // Check for invalid characters
  const validPhonePattern = /^[+\d\s\-()]+$/;
  if (!validPhonePattern.test(phone)) {
    return {
      isValid: false,
      error: PhoneValidationError.INVALID_CHARACTERS,
      errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_CHARACTERS],
    };
  }

  // Check for country code prefix
  if (!hasCountryCode(phone)) {
    return {
      isValid: false,
      error: PhoneValidationError.MISSING_COUNTRY_CODE,
      errorMessage: ERROR_MESSAGES[PhoneValidationError.MISSING_COUNTRY_CODE],
    };
  }

  // Parse phone number
  try {
    const parsed = parsePhoneNumber(phone);

    if (!parsed) {
      return {
        isValid: false,
        error: PhoneValidationError.INVALID_FORMAT,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_FORMAT],
      };
    }

    // Check country code validity
    const countryCode = parsed.country;
    if (!countryCode) {
      return {
        isValid: false,
        error: PhoneValidationError.INVALID_COUNTRY_CODE,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_COUNTRY_CODE],
      };
    }

    // Check if country is in whitelist (if enforced)
    if (PHONE_CONFIG.ENFORCE_COUNTRY_WHITELIST && 
        !PHONE_CONFIG.ALLOWED_COUNTRY_CODES.includes(countryCode)) {
      return {
        isValid: false,
        error: PhoneValidationError.INVALID_COUNTRY_CODE,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_COUNTRY_CODE],
      };
    }

    // Check if number is possible
    if (!parsed.isPossible()) {
      return {
        isValid: false,
        error: PhoneValidationError.NOT_POSSIBLE,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.NOT_POSSIBLE],
      };
    }

    // Check if number is valid
    if (!parsed.isValid()) {
      return {
        isValid: false,
        error: PhoneValidationError.NOT_POSSIBLE,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.NOT_POSSIBLE],
      };
    }

    // Get E.164 format
    const e164 = parsed.format('E.164');
    
    // Validate length
    if (e164.length < PHONE_CONFIG.MIN_LENGTH) {
      return {
        isValid: false,
        error: PhoneValidationError.TOO_SHORT,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.TOO_SHORT],
      };
    }

    if (e164.length > PHONE_CONFIG.MAX_LENGTH) {
      return {
        isValid: false,
        error: PhoneValidationError.TOO_LONG,
        errorMessage: ERROR_MESSAGES[PhoneValidationError.TOO_LONG],
      };
    }

    // All checks passed
    return {
      isValid: true,
      normalizedNumber: e164,
      countryCode,
      nationalNumber: parsed.nationalNumber?.toString(),
      errorMessage: '',
    };
  } catch (error) {
    safeLog.error('Phone validation error', {
      error: String(error).substring(0, 100),
      input: phone.substring(0, 20),
    });

    return {
      isValid: false,
      error: PhoneValidationError.INVALID_FORMAT,
      errorMessage: ERROR_MESSAGES[PhoneValidationError.INVALID_FORMAT],
    };
  }
}

/**
 * Quick validation check (returns boolean)
 */
export function isValidPhone(phone: unknown): boolean {
  const result = validatePhoneNumber(phone);
  return result.isValid;
}

/**
 * Normalize phone number to E.164 format
 * 
 * Returns normalized number or throws error
 */
export function normalizePhoneNumber(input: unknown): string {
  const result = validatePhoneNumber(input);
  
  if (!result.isValid || !result.normalizedNumber) {
    throw new Error(result.errorMessage);
  }
  
  return result.normalizedNumber;
}

/**
 * Extract country code from phone number
 */
export function getPhoneCountryCode(phone: string): string | null {
  try {
    const parsed = parsePhoneNumber(phone);
    return parsed?.country || null;
  } catch (error) {
    return null;
  }
}

/**
 * Format phone number for display (optional)
 */
export function formatPhoneForDisplay(phone: string): string {
  try {
    const parsed = parsePhoneNumber(phone);
    if (!parsed) return phone;
    
    // Format as: +251 (91) 234-5678
    return parsed.format('INTERNATIONAL');
  } catch (error) {
    return phone;
  }
}

/**
 * Batch validate multiple phone numbers
 */
export function validatePhoneNumbers(phones: unknown[]): PhoneValidationResult[] {
  return phones.map((phone) => validatePhoneNumber(phone));
}

/**
 * Check if two phone numbers are the same (after normalization)
 */
export function arePhoneNumbersEqual(phone1: unknown, phone2: unknown): boolean {
  try {
    const normalized1 = normalizePhoneNumber(phone1);
    const normalized2 = normalizePhoneNumber(phone2);
    return normalized1 === normalized2;
  } catch (error) {
    return false;
  }
}

/**
 * Safe phone number comparison (doesn't throw)
 */
export function comparePhoneNumbers(
  phone1: unknown,
  phone2: unknown
): { equal: boolean; error?: string } {
  try {
    return {
      equal: arePhoneNumbersEqual(phone1, phone2),
    };
  } catch (error) {
    return {
      equal: false,
      error: String(error),
    };
  }
}

/**
 * Validate and get phone info in one call
 */
export interface PhoneInfo {
  e164: string;
  countryCode: string;
  nationalNumber: string;
  valid: boolean;
}

export function getPhoneInfo(phone: unknown): PhoneInfo | null {
  const result = validatePhoneNumber(phone);
  
  if (!result.isValid || !result.normalizedNumber) {
    return null;
  }

  return {
    e164: result.normalizedNumber,
    countryCode: result.countryCode || '',
    nationalNumber: result.nationalNumber || '',
    valid: true,
  };
}

/**
 * Log validation attempts (for security/debugging)
 */
export function logValidationAttempt(
  phone: string,
  isValid: boolean,
  context?: Record<string, unknown>
): void {
  safeLog.info('Phone validation attempt', {
    success: isValid,
    phonePreview: phone.substring(0, 5) + '***',
    ...context,
  });
}
