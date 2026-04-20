/**
 * Concurrent Session Management
 * 
 * Prevents concurrent session abuse (CWE-384, OWASP A7)
 * Allows multi-device sessions but tracks and invalidates on demand
 * 
 * File: src/lib/concurrent-session-manager.ts
 * Severity: MEDIUM - Unauthorized Access Prevention
 */

import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * Device fingerprint for session tracking
 */
export interface DeviceFingerprint {
  userAgent: string;
  ipAddress: string;
  acceptLanguage?: string;
}

/**
 * Generate device ID from fingerprint
 */
export function generateDeviceId(fingerprint: DeviceFingerprint): string {
  const data = `${fingerprint.userAgent}|${fingerprint.ipAddress}|${fingerprint.acceptLanguage || ''}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create a new session for user (replaces previous session from same device)
 */
export async function createUserSession(
  userId: string,
  fingerprint: DeviceFingerprint,
  refreshTokenHash: string,
  deviceName?: string
): Promise<string> {
  try {
    const deviceId = generateDeviceId(fingerprint);
    const sessionNumber = await getNextSessionNumber(userId);

    // ===== STEP 1: Invalidate previous session from same device =====
    await prisma.session.updateMany({
      where: {
        userId,
        deviceId,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: 'NEW_LOGIN_SAME_DEVICE',
      },
    });

    // ===== STEP 2: Create new session =====
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const session = await prisma.session.create({
      data: {
        userId,
        deviceId,
        deviceName: deviceName || extractDeviceName(fingerprint.userAgent),
        userAgent: fingerprint.userAgent,
        ipAddress: fingerprint.ipAddress,
        currentRefreshTokenId: crypto.randomUUID(),
        refreshTokenHash,
        refreshTokenFamily: crypto.randomUUID(),
        isActive: true,
        expiresAt,
        sessionNumber,
      },
    });

    // ===== STEP 3: Log session creation =====
    await prisma.sessionAuditLog.create({
      data: {
        sessionId: session.id,
        event: 'SESSION_CREATED',
        details: `New session created from ${fingerprint.ipAddress}`,
        ipAddress: fingerprint.ipAddress,
        userAgent: fingerprint.userAgent,
      },
    });

    return session.id;
  } catch (error) {
    throw error;
  }
}

/**
 * Validate and retrieve an active session
 */
export async function validateSession(
  userId: string,
  sessionId: string,
  fingerprint: DeviceFingerprint
): Promise<{ valid: boolean; error?: string }> {
  try {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        isActive: true,
      },
    });

    if (!session) {
      return { valid: false, error: 'Session not found or inactive' };
    }

    // Check expiration
    if (new Date() > session.expiresAt) {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokeReason: 'EXPIRED',
        },
      });
      return { valid: false, error: 'Session expired' };
    }

    // Optionally check device fingerprint (loose check - IP can change for mobile)
    // For now, just validate UA matches to prevent token hijacking
    if (session.userAgent && session.userAgent !== fingerprint.userAgent) {
      await prisma.sessionAuditLog.create({
        data: {
          sessionId,
          event: 'SUSPICIOUS_ACTIVITY',
          details: 'User agent mismatch detected',
          ipAddress: fingerprint.ipAddress,
          userAgent: fingerprint.userAgent,
        },
      });
      // Log but don't block (UA can change slightly)
    }

    // Update last activity
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Session validation failed' };
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
  sessionId: string,
  reason: string = 'USER_LOGOUT'
): Promise<boolean> {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    });

    await prisma.sessionAuditLog.create({
      data: {
        sessionId,
        event: 'SESSION_REVOKED',
        details: `Session revoked. Reason: ${reason}`,
      },
    });

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Revoke all sessions for a user (forced logout)
 */
export async function revokeAllUserSessions(
  userId: string,
  reason: string = 'FORCED_LOGOUT'
): Promise<number> {
  try {
    const result = await prisma.session.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    });

    // Log the mass revocation
    if (result.count > 0) {
      const sessions = await prisma.session.findMany({
        where: { userId, revokeReason: reason },
        select: { id: true },
      });

      for (const session of sessions) {
        await prisma.sessionAuditLog.create({
          data: {
            sessionId: session.id,
            event: 'SESSION_REVOKED',
            details: `All user sessions revoked. Reason: ${reason}`,
          },
        });
      }
    }

    return result.count;
  } catch (error) {
    return 0;
  }
}

/**
 * Get active sessions for a user
 */
export async function getUserActiveSessions(userId: string) {
  try {
    return await prisma.session.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastActivityAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  } catch (error) {
    return [];
  }
}

/**
 * Cleanup expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await prisma.session.updateMany({
      where: {
        AND: [
          { isActive: true },
          { expiresAt: { lte: new Date() } },
        ],
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: 'EXPIRED',
      },
    });

    return result.count;
  } catch (error) {
    return 0;
  }
}

/**
 * Get next session number for user (for tracking)
 */
async function getNextSessionNumber(userId: string): Promise<number> {
  try {
    const lastSession = await prisma.session.findFirst({
      where: { userId },
      orderBy: { sessionNumber: 'desc' },
      select: { sessionNumber: true },
    });

    return (lastSession?.sessionNumber ?? 0) + 1;
  } catch {
    return 1;
  }
}

/**
 * Extract device name from user agent string
 */
function extractDeviceName(userAgent: string): string {
  if (!userAgent) return 'Unknown Device';

  // Common patterns
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Android')) return 'Android Device';
  if (userAgent.includes('Windows')) return 'Windows PC';
  if (userAgent.includes('Macintosh')) return 'Mac';
  if (userAgent.includes('Linux')) return 'Linux';

  return 'Unknown Device';
}
