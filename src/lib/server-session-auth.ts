/**
 * Server-side session auth: JWT verification order, claim binding, and cookie policy.
 * Cryptographic verification runs before any database access.
 */

import { errors, type JWTPayload } from 'jose';
import type { NextResponse } from 'next/server';
import { jwtVerifyStrict, StrictJwtFormatError } from './strict-jwt';

export const MIN_JWT_SECRET_LENGTH = 64;

/** Production or explicit COOKIE_SECURE=true (HTTPS dev / staging). */
export function isSessionCookieSecure(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true'
  );
}

/** HttpOnly + SameSite=Strict; Secure when deployed over HTTPS (or COOKIE_SECURE). */
export function sessionAuthCookieDefaults(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
} {
  return {
    httpOnly: true,
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
    path: '/',
  };
}

export type AccessTokenJwtPhase =
  | { ok: true; payload: JWTPayload }
  | {
      ok: false;
      code: 'WEAK_SECRET' | 'BAD_SIGNATURE' | 'EXPIRED' | 'INVALID_JWT';
    };

/**
 * Verify access-token JWS only (no DB). Tampered signature → BAD_SIGNATURE immediately.
 */
export async function verifyAccessTokenJwtOnly(
  token: string
): Promise<AccessTokenJwtPhase> {
  const secretStr = process.env.JWT_SECRET;
  if (!secretStr || secretStr.length < MIN_JWT_SECRET_LENGTH) {
    return { ok: false, code: 'WEAK_SECRET' };
  }
  const secret = new TextEncoder().encode(secretStr);
  try {
    const { payload } = await jwtVerifyStrict(token, secret, {
      algorithms: ['HS512'],
    });
    return { ok: true, payload };
  } catch (e) {
    if (e instanceof StrictJwtFormatError) {
      return { ok: false, code: 'INVALID_JWT' };
    }
    if (e instanceof errors.JWSSignatureVerificationFailed) {
      return { ok: false, code: 'BAD_SIGNATURE' };
    }
    if (e instanceof errors.JWTExpired) {
      return { ok: false, code: 'EXPIRED' };
    }
    return { ok: false, code: 'INVALID_JWT' };
  }
}

/** Reject `sub` ≠ `id` when `sub` is present (prevents mixed-claim confusion). */
export function assertSubjectMatchesUserId(payload: JWTPayload): boolean {
  const id = payload.id;
  if (typeof id !== 'string' || id.length === 0) {
    return false;
  }
  if (payload.sub != null && String(payload.sub) !== id) {
    return false;
  }
  return true;
}

export function assertSessionClaimsShape(
  payload: JWTPayload
): payload is JWTPayload & { id: string; sid: string } {
  return (
    typeof payload.id === 'string' &&
    payload.id.length > 0 &&
    typeof payload.sid === 'string' &&
    payload.sid.length > 0
  );
}

export function isAbsLifetimeExpired(payload: JWTPayload): boolean {
  const abs = payload.abs;
  if (abs == null || typeof abs !== 'number') {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds > abs;
}

const CLEARED = new Date(0);

/** Clear institutional auth cookies with the same flags used when setting them. */
export function clearSessionAuthCookies(response: NextResponse): void {
  const base = sessionAuthCookieDefaults();
  response.cookies.set('nib-auth-token', '', {
    ...base,
    expires: CLEARED,
    maxAge: 0,
  });
  response.cookies.set('nib-refresh-token', '', {
    ...base,
    expires: CLEARED,
    maxAge: 0,
  });
}
