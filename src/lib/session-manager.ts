/**
 * Secure Session Manager with Refresh Token Rotation
 * 
 * FEATURES:
 * - Generate access + refresh tokens
 * - Rotate refresh tokens on every use (invalidates old)
 * - Detect token reuse attacks (compromised token)
 * - Track sessions per device/user
 * - Manage concurrent sessions
 * - Revoke sessions on demand
 * - Complete audit trail
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTokenPair, verifyRefreshToken } from '@/lib/jwt-secure';
import { safeLog } from '@/lib/logging-redaction';

const prisma = new PrismaClient();
const db = prisma as any;

/**
 * Session Management Configuration
 */
export const SESSION_CONFIG = {
  // Maximum concurrent sessions per user
  MAX_CONCURRENT_SESSIONS: 5,

  // Refresh token expiration (7 days)
  REFRESH_TOKEN_EXPIRES_MS: 7 * 24 * 60 * 60 * 1000,

  // Refresh token hash rounds
  BCRYPT_ROUNDS: 12,

  // Time to retain token rotation history
  ROTATION_HISTORY_RETENTION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Idle timeout (optional: lock session after inactivity)
  IDLE_TIMEOUT_MS: 15 * 60 * 1000, // 15 minutes
};

/**
 * Session Manager Class
 * 
 * Handles complete session lifecycle:
 * 1. Create session on login
 * 2. Rotate token on each refresh
 * 3. Revoke session on logout
 * 4. Detect/prevent token reuse
 */
export class SessionManager {
  /**
   * Hash refresh token for secure storage
   */
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, SESSION_CONFIG.BCRYPT_ROUNDS);
  }

  /**
   * Compare refresh token with hash
   */
  private async verifyTokenHash(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  /**
   * Create new session on login
   * 
   * Steps:
   * 1. Check concurrent session limit
   * 2. Create session record
   * 3. Generate tokens
   * 4. Store hashed refresh token
   * 5. Create audit log
   */
  async createSession(
    userId: string,
    options: {
      deviceId?: string;
      deviceName?: string;
      userAgent?: string;
      ipAddress?: string;
    } = {}
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    try {
      // 1. Check concurrent session limit
      const activeSessions = await db.session.count({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      if (activeSessions >= SESSION_CONFIG.MAX_CONCURRENT_SESSIONS) {
        // Revoke oldest session
        const oldestSession = await db.session.findFirst({
          where: {
            userId,
            isActive: true,
            expiresAt: { gt: new Date() },
          },
          orderBy: { lastActivityAt: 'asc' },
        });

        if (oldestSession) {
          await this.revokeSession(oldestSession.id, 'exceeded_max_sessions');
          safeLog.info('Oldest session revoked (max sessions reached)', {
            userId: userId.substring(0, 8),
          });
        }
      }

      // 2. Create token pair
      const tokens = await createTokenPair(userId, 'USER');

      // 3. Hash refresh token for storage
      const refreshTokenHash = await this.hashToken(tokens.refreshToken);
      const tokenFamily = uuidv4();

      // 4. Get current session count
      const sessionCount =
        (await db.session.count({
          where: { userId },
        })) + 1;

      // 5. Create session record
      const session = await db.session.create({
        data: {
          userId,
          deviceId: options.deviceId || uuidv4(),
          deviceName: options.deviceName,
          userAgent: options.userAgent,
          ipAddress: options.ipAddress,
          currentRefreshTokenId: tokens.refreshToken.split('.')[2], // JTI (last part)
          refreshTokenHash,
          refreshTokenFamily: tokenFamily,
          expiresAt: new Date(Date.now() + SESSION_CONFIG.REFRESH_TOKEN_EXPIRES_MS),
          sessionNumber: sessionCount,
        },
      });

      // 6. Audit log
      await db.sessionAuditLog.create({
        data: {
          sessionId: session.id,
          event: 'login',
          details: JSON.stringify({
            deviceId: options.deviceId,
            deviceName: options.deviceName,
          }),
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        },
      });

      safeLog.info('Session created', {
        userId: userId.substring(0, 8),
        sessionId: session.id.substring(0, 8),
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: session.id,
      };
    } catch (error) {
      safeLog.error('Failed to create session', {
        error: String(error).substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Refresh tokens with rotation
   * 
   * Critical Security Feature:
   * 1. Verify old refresh token is valid
   * 2. Check not already rotated (replay attack detection)
   * 3. Generate new tokens
   * 4. Revoke old token (mark as rotated)
   * 5. Store new token
   * 6. Return new access token
   */
  async rotateRefreshToken(
    sessionId: string,
    oldRefreshToken: string,
    ipAddress?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // 1. Get session
      const session = await db.session.findUnique({
        where: { id: sessionId },
      });

      if (!session || !session.isActive) {
        throw new Error('Session not found or inactive');
      }

      // 2. Verify session not expired
      if (session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      // 3. Verify old token exists and matches
      if (!session.refreshTokenHash) {
        throw new Error('No refresh token in session');
      }

      const tokenValid = await this.verifyTokenHash(oldRefreshToken, session.refreshTokenHash);
      if (!tokenValid) {
        // Token doesn't match - possible reuse attack
        safeLog.warn('Refresh token mismatch - possible attack', {
          userId: session.userId.substring(0, 8),
          sessionId: sessionId.substring(0, 8),
        });

        throw new Error('Invalid refresh token');
      }

      // 4. Verify old token hasn't been reused (check rotation history)
      const reuseCheck = await db.refreshTokenRotation.findFirst({
        where: {
          sessionId,
          oldTokenId: session.currentRefreshTokenId,
          reuseDetected: true,
        },
      });

      if (reuseCheck) {
        // Old token already reused - attack detected
        // Revoke all sessions for this user
        await this.revokeAllUserSessions(session.userId, 'token_reuse_detected');

        safeLog.error('Token reuse detected - all sessions revoked', {
          userId: session.userId.substring(0, 8),
        });

        throw new Error('Token reuse detected - all sessions revoked');
      }

      // 5. Generate new tokens
      const newTokens = await createTokenPair(session.userId, 'USER');

      // 6. Hash new refresh token
      const newRefreshTokenHash = await this.hashToken(newTokens.refreshToken);

      // 7. Record rotation
      await db.refreshTokenRotation.create({
        data: {
          sessionId,
          oldTokenId: session.currentRefreshTokenId,
          newTokenId: newTokens.refreshToken.split('.')[2],
          tokenFamily: session.refreshTokenFamily,
          ipAddress,
        },
      });

      // 8. Update session with new token
      const expiresAt = new Date(Date.now() + SESSION_CONFIG.REFRESH_TOKEN_EXPIRES_MS);

      await db.session.update({
        where: { id: sessionId },
        data: {
          currentRefreshTokenId: newTokens.refreshToken.split('.')[2],
          refreshTokenHash: newRefreshTokenHash,
          expiresAt,
          lastActivityAt: new Date(),
        },
      });

      // 9. Audit log
      await db.sessionAuditLog.create({
        data: {
          sessionId,
          event: 'refresh',
          ipAddress,
          details: JSON.stringify({ tokenRotated: true }),
        },
      });

      safeLog.info('Refresh token rotated', {
        userId: session.userId.substring(0, 8),
      });

      return {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
      };
    } catch (error) {
      safeLog.error('Token rotation failed', {
        error: String(error).substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Revoke single session
   */
  async revokeSession(sessionId: string, reason: string = 'logout'): Promise<void> {
    try {
      await db.session.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokeReason: reason,
        },
      });

      // Audit log
      await db.sessionAuditLog.create({
        data: {
          sessionId,
          event: 'logout',
          details: JSON.stringify({ reason }),
        },
      });

      safeLog.info('Session revoked', { reason });
    } catch (error) {
      safeLog.error('Failed to revoke session', {
        error: String(error).substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Revoke all sessions for a user
   * 
   * Triggers:
   * - Password change (security)
   * - Suspicious activity
   * - Token reuse detected (attack)
   */
  async revokeAllUserSessions(
    userId: string,
    reason: string = 'security_incident'
  ): Promise<number> {
    try {
      const result = await db.session.updateMany({
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

      // Create audit logs for all revoked sessions
      const sessions = await db.session.findMany({
        where: { userId },
      });

      for (const session of sessions) {
        await db.sessionAuditLog.create({
          data: {
            sessionId: session.id,
            event: 'force_logout',
            details: JSON.stringify({ reason }),
          },
        });
      }

      safeLog.warn('All user sessions revoked', {
        userId: userId.substring(0, 8),
        count: result.count,
        reason,
      });

      return result.count;
    } catch (error) {
      safeLog.error('Failed to revoke all user sessions', {
        error: String(error).substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string) {
    return db.session.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        createdAt: true,
        lastActivityAt: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await db.session.update({
        where: { id: sessionId },
        data: {
          lastActivityAt: new Date(),
        },
      });
    } catch (error) {
      // Silently fail - not critical
      safeLog.debug('Failed to update session activity');
    }
  }

  /**
   * Cleanup expired sessions and rotations
   * 
   * Run periodically (e.g., daily):
   * - Delete expired sessions
   * - Clean old rotation records
   * - Clean expired blacklist entries
   */
  async cleanupExpired(): Promise<{ deleted: number }> {
    try {
      const now = new Date();
      const retentionDate = new Date(now.getTime() - SESSION_CONFIG.ROTATION_HISTORY_RETENTION_MS);

      // Delete expired sessions
      const deletedSessions = await db.session.deleteMany({
        where: {
          expiresAt: { lt: now },
          revokedAt: { lt: retentionDate },
        },
      });

      // Delete old rotation records
      const deletedRotations = await db.refreshTokenRotation.deleteMany({
        where: {
          rotatedAt: { lt: retentionDate },
        },
      });

      // Delete blacklisted tokens
      const deletedBlacklist = await db.tokenBlacklist.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      });

      const totalDeleted = deletedSessions.count + deletedRotations.count + deletedBlacklist.count;

      safeLog.info('Session cleanup completed', {
        sessions: deletedSessions.count,
        rotations: deletedRotations.count,
        blacklist: deletedBlacklist.count,
      });

      return { deleted: totalDeleted };
    } catch (error) {
      safeLog.error('Session cleanup failed', {
        error: String(error).substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Verify session is valid and active
   */
  async verifySessionValid(sessionId: string): Promise<boolean> {
    try {
      const session = await db.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) return false;
      if (!session.isActive) return false;
      if (session.expiresAt < new Date()) return false;

      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Export singleton instance
 */
export const sessionManager = new SessionManager();

/**
 * Setup periodic cleanup task
 * Run on application startup
 */
export function setupSessionCleanup(): void {
  // Run cleanup every 24 hours
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      await sessionManager.cleanupExpired();
    } catch (error) {
      safeLog.error('Scheduled session cleanup failed', {
        error: String(error).substring(0, 100),
      });
    }
  }, CLEANUP_INTERVAL);

  safeLog.info('Session cleanup scheduled (every 24 hours)');
}
