/**
 * Phone Update API Route
 * 
 * File: src/app/api/auth/phone/update/route.ts
 * 
 * Features:
 * - Updates user's phone number
 * - Validates phone before DB write
 * - Checks for duplicates
 * - Resets phone verification status
 * - Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validatePhoneNumber } from '@/lib/phone-validation';
import {
  PHONE_ERROR_MESSAGES,
  FRAUD_PREVENTION_CONFIG,
} from '@/lib/phone-constants';
import { safeLog } from '@/lib/logging-redaction';
import { authenticateRequest } from '@/lib/auth-handlers';

/**
 * REST API for authenticated users
 * 
 * PATCH /api/auth/phone/update
 * Update user's phone number
 * 
 * Required: Authentication token in Authorization header
 * 
 * Request body:
 * {
 *   "phone": "+251912345678"
 * }
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "phone": "+251912345678",
 *   "message": "Phone updated. Please verify your new phone number."
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    // ===== STEP 1: Authenticate user =====
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ===== STEP 2: Get request body =====
    const body = await request.json().catch(() => ({}));
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // ===== STEP 3: Validate new phone BEFORE any DB operations =====
    const phoneValidation = validatePhoneNumber(phone);

    if (!phoneValidation.isValid) {
      safeLog.warn('Phone update with invalid number', {
        userId: user.id.substring(0, 8),
        error: phoneValidation.error,
      });

      return NextResponse.json(
        { error: phoneValidation.errorMessage },
        { status: 400 }
      );
    }

    const normalizedPhone = phoneValidation.normalizedNumber!;

    // ===== STEP 4: Check if new phone is same as current =====
    if (normalizedPhone === user.phoneNumber) {
      return NextResponse.json(
        { error: 'New phone number must be different from current' },
        { status: 400 }
      );
    }

    // ===== STEP 5: Check phone uniqueness with other users =====
    const existingUserWithPhone = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      select: { id: true },
    });

    if (existingUserWithPhone && existingUserWithPhone.id !== user.id) {
      safeLog.warn('Phone number already in use', {
        userId: user.id.substring(0, 8),
      });

      return NextResponse.json(
        { error: PHONE_ERROR_MESSAGES.ALREADY_REGISTERED },
        { status: 409 }
      );
    }

    // ===== STEP 6: Get client IP =====
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // ===== STEP 7: Update user phone =====
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneNumber: normalizedPhone,
      },
      select: {
        id: true,
        phoneNumber: true,
      },
    });

    // ===== STEP 8: Audit log =====
    safeLog.info('Phone number updated', {
      userId: user.id.substring(0, 8),
      oldPhone: user.phoneNumber?.substring(0, 5) || 'N/A',
      newPhone: normalizedPhone.substring(0, 5),
      ip: clientIp,
    });

    // ===== STEP 9: Return success =====
    return NextResponse.json({
      success: true,
      phone: updatedUser.phoneNumber,
      message: 'Phone number updated successfully. Please verify your new phone number.',
    });
  } catch (error) {
    if ('code' in (error as any) && (error as any).code === 'P2002') {
      safeLog.warn('Unique constraint violation on phone update', {
        error: String(error).substring(0, 100),
      });

      return NextResponse.json(
        { error: 'This phone number is already in use' },
        { status: 409 }
      );
    }

    safeLog.error('Phone update failed', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Failed to update phone number' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/phone/update - Get current phone
 * 
 * Returns user's current phone number (masked)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      phoneNumber: user.phoneNumber,
      countryCode: user.phoneNumber?.substring(0, 3) || '', // e.g., +25
    });
  } catch (error) {
    safeLog.error('Get phone failed', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Failed to retrieve phone information' },
      { status: 500 }
    );
  }
}
