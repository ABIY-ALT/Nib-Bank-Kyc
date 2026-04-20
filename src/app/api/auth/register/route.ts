/**
 * Registration API Route with Phone Validation
 * 
 * File: src/app/api/auth/register/route.ts
 * 
 * Features:
 * - Validates phone number before any DB write
 * - Normalizes to E.164 format
 * - Checks for duplicates
 * - Creates user with validated phone
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { validatePhoneFromRequest } from '@/middleware/phone-validation.middleware';
import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phone-validation';
import {
  PHONE_ERROR_MESSAGES,
} from '@/lib/phone-constants';
import { safeLog } from '@/lib/logging-redaction';

const prisma = new PrismaClient();

/**
 * GET /api/auth/register - Check availability
 * 
 * Optional endpoint to check if phone is available before registration
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number required' },
        { status: 400 }
      );
    }

    // Validate format
    const validation = validatePhoneNumber(phone);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.errorMessage, available: false },
        { status: 400 }
      );
    }

    // Check if already registered
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: validation.normalizedNumber },
      select: { id: true },
    });

    return NextResponse.json({
      available: !existingUser,
      phoneNumber: validation.normalizedNumber,
    });
  } catch (error) {
    safeLog.error('Phone availability check failed', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/register - Register new user
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "securePassword123",
 *   "phone": "+251912345678",
 *   "name": "John Doe"
 * }
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "userId": "user_id",
 *   "email": "user@example.com",
 *   "phone": "+251912345678"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get request body
    const body = await request.json().catch(() => ({}));
    const { email, password, phone, name } = body;

    // ===== STEP 1: Validate inputs =====
    if (!email || !password || !phone || !name) {
      return NextResponse.json(
        { error: 'Email, password, phone, and name are required' },
        { status: 400 }
      );
    }

    // ===== STEP 2: Validate phone BEFORE any DB operations =====
    const phoneValidation = validatePhoneNumber(phone);

    if (!phoneValidation.isValid) {
      safeLog.warn('Registration attempt with invalid phone', {
        error: phoneValidation.error,
      });

      return NextResponse.json(
        { error: phoneValidation.errorMessage },
        { status: 400 }
      );
    }

    const normalizedPhone = phoneValidation.normalizedNumber!;

    // ===== STEP 3: Check phone uniqueness =====
    const existingUserWithPhone = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      select: { id: true },
    });

    if (existingUserWithPhone) {
      safeLog.warn('Phone already registered', {
        phone: normalizedPhone.substring(0, 5),
      });

      return NextResponse.json(
        { error: PHONE_ERROR_MESSAGES.ALREADY_REGISTERED },
        { status: 409 }
      );
    }

    // ===== STEP 4: Validate email =====
    const existingUserWithEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    if (existingUserWithEmail) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // ===== STEP 5: Hash password =====
    const hashedPassword = await bcrypt.hash(password, 12);

    // ===== STEP 6: Create user with validated phone =====
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: email.toLowerCase(),
        password: hashedPassword,
        phoneNumber: normalizedPhone, // ✅ Already normalized and validated
        firstName: name.split(' ')[0],
        lastName: name.split(' ').slice(1).join(' ') || '',
      },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    // ===== STEP 7: Audit log =====
    safeLog.info('User registered successfully', {
      userId: user.id.substring(0, 8),
      phone: normalizedPhone.substring(0, 5),
    });

    // ===== STEP 8: Return success =====
    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        name: `${user.firstName} ${user.lastName}`.trim(),
        message: 'Registration successful. Please verify your phone number.',
      },
      { status: 201 }
    );
  } catch (error) {
    // Database error or unexpected error
    if ('code' in (error as any) && (error as any).code === 'P2002') {
      // Unique constraint violation (shouldn't happen due to our checks, but just in case)
      safeLog.warn('Unique constraint violation on registration', {
        error: String(error).substring(0, 100),
      });

      return NextResponse.json(
        { error: 'This phone number is already registered' },
        { status: 409 }
      );
    }

    safeLog.error('Registration failed', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}
