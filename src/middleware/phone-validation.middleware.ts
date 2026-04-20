/**
 * Phone Validation Middleware
 * 
 * Express/Next.js middleware that:
 * - Validates phone number in request body
 * - Normalizes to E.164 format
 * - Attaches normalized value to request
 * - Returns clear error messages
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validatePhoneNumber,
  PhoneValidationError,
  logValidationAttempt,
} from '@/lib/phone-validation';
import { safeLog } from '@/lib/logging-redaction';

/**
 * Phone validation middleware options
 */
export interface PhoneValidationOptions {
  // Which field to validate (default: 'phone')
  fieldName?: string;
  
  // Should it be required?
  required?: boolean;
  
  // Custom error message
  customErrorMessage?: string;
  
  // Log attempts?
  logAttempts?: boolean;
  
  // Allow null/undefined if not required
  allowEmpty?: boolean;
}

/**
 * Extend request object with normalized phone
 */
declare global {
  namespace Express {
    interface Request {
      validatedPhone?: {
        value: string;
        countryCode?: string;
        nationalNumber?: string;
      };
    }
  }
}

/**
 * Middleware for Next.js API routes
 * 
 * Usage in route handlers:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   const phoneValidation = phoneValidationMiddleware({
 *     fieldName: 'phone',
 *     required: true,
 *   });
 *   
 *   const { body, error } = await phoneValidation(request);
 *   if (error) return error;
 *   
 *   // body.phone is now normalized
 *   const normalizedPhone = body.phone;
 * }
 * ```
 */
export function phoneValidationMiddleware(options: PhoneValidationOptions = {}) {
  const {
    fieldName = 'phone',
    required = true,
    logAttempts = true,
    allowEmpty = false,
  } = options;

  return async (request: NextRequest) => {
    try {
      const body = await request.json().catch(() => ({}));
      const phoneInput = body[fieldName];

      // Handle missing/empty phone
      if (!phoneInput || phoneInput === '') {
        if (required && !allowEmpty) {
          logAttempts && logValidationAttempt('', false, { context: 'middleware_required' });

          return {
            body: null,
            error: NextResponse.json(
              { error: `${fieldName} is required` },
              { status: 400 }
            ),
          };
        }

        if (!required && allowEmpty) {
          return {
            body: { ...body, [fieldName]: null },
            error: null,
          };
        }
      }

      // Validate phone
      const validation = validatePhoneNumber(phoneInput);

      if (!validation.isValid) {
        logAttempts && logValidationAttempt(String(phoneInput), false, {
          error: validation.error,
          context: 'middleware',
        });

        return {
          body: null,
          error: NextResponse.json(
            { error: validation.errorMessage },
            { status: 400 }
          ),
        };
      }

      logAttempts && logValidationAttempt(String(phoneInput), true, {
        context: 'middleware',
      });

      // Return normalized
      return {
        body: {
          ...body,
          [fieldName]: validation.normalizedNumber,
          [fieldName + '_countryCode']: validation.countryCode,
          [fieldName + '_nationalNumber']: validation.nationalNumber,
        },
        error: null,
      };
    } catch (error) {
      safeLog.error('Phone validation middleware error', {
        error: String(error).substring(0, 100),
      });

      return {
        body: null,
        error: NextResponse.json(
          { error: 'Invalid request format' },
          { status: 400 }
        ),
      };
    }
  };
}

/**
 * Reusable validation function for route handlers
 * 
 * Usage:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   const result = await validatePhoneFromRequest(request, 'phone');
 *   if (!result.isValid) return result.response;
 *   
 *   const normalizedPhone = result.normalizedNumber;
 * }
 * ```
 */
export async function validatePhoneFromRequest(
  request: NextRequest,
  fieldName: string = 'phone'
): Promise<{
  isValid: boolean;
  normalizedNumber?: string;
  countryCode?: string;
  response?: NextResponse;
  error?: string;
}> {
  try {
    const body = await request.json().catch(() => ({}));
    const phoneInput = body[fieldName];

    if (!phoneInput) {
      return {
        isValid: false,
        response: NextResponse.json(
          { error: `${fieldName} is required` },
          { status: 400 }
        ),
      };
    }

    const validation = validatePhoneNumber(phoneInput);

    if (!validation.isValid) {
      return {
        isValid: false,
        response: NextResponse.json(
          { error: validation.errorMessage },
          { status: 400 }
        ),
      };
    }

    return {
      isValid: true,
      normalizedNumber: validation.normalizedNumber,
      countryCode: validation.countryCode,
    };
  } catch (error) {
    return {
      isValid: false,
      error: String(error),
      response: NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Validate multiple phone numbers from request
 */
export async function validateMultiplePhoneNumbers(
  request: NextRequest,
  fieldNames: string[]
): Promise<{
  isValid: boolean;
  normalized: Record<string, string>;
  response?: NextResponse;
}> {
  try {
    const body = await request.json().catch(() => ({}));
    const normalized: Record<string, string> = {};

    for (const fieldName of fieldNames) {
      const phoneInput = body[fieldName];

      if (!phoneInput) {
        return {
          isValid: false,
          normalized,
          response: NextResponse.json(
            { error: `${fieldName} is required` },
            { status: 400 }
          ),
        };
      }

      const validation = validatePhoneNumber(phoneInput);

      if (!validation.isValid) {
        return {
          isValid: false,
          normalized,
          response: NextResponse.json(
            { error: `Invalid ${fieldName}: ${validation.errorMessage}` },
            { status: 400 }
          ),
        };
      }

      if (validation.normalizedNumber) {
        normalized[fieldName] = validation.normalizedNumber;
      }
    }

    return {
      isValid: true,
      normalized,
    };
  } catch (error) {
    return {
      isValid: false,
      normalized: {},
      response: NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Middleware wrapper for Express-style usage
 * 
 * Usage in Express:
 * ```ts
 * app.post('/register', validatePhoneMiddleware(), (req, res) => {
 *   const phone = req.validatedPhone?.value;
 * });
 * ```
 */
export function validatePhoneMiddleware(
  fieldName: string = 'phone',
  required: boolean = true
) {
  return async (req: any, res: any, next: any) => {
    try {
      const phoneInput = req.body?.[fieldName];

      if (!phoneInput && required) {
        return res.status(400).json({
          error: `${fieldName} is required`,
        });
      }

      if (!phoneInput && !required) {
        req.validatedPhone = { value: null };
        return next();
      }

      const validation = validatePhoneNumber(phoneInput);

      if (!validation.isValid) {
        return res.status(400).json({
          error: validation.errorMessage,
        });
      }

      // Attach validated info to request
      req.validatedPhone = {
        value: validation.normalizedNumber,
        countryCode: validation.countryCode,
        nationalNumber: validation.nationalNumber,
      };

      // Update body with normalized value
      req.body[fieldName] = validation.normalizedNumber;

      next();
    } catch (error) {
      res.status(400).json({
        error: 'Invalid request format',
      });
    }
  };
}
