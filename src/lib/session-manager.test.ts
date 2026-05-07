/**
 * Session Management Test Suite
 * 
 * Tests cover:
 * - Session creation on login
 * - Token rotation with reuse detection
 * - Concurrent session management
 * - Auto-cleanup of expired sessions
 * - Error handling and edge cases
 * 
 * Run: npm test -- session-manager.test.ts
 */

import { SessionManager, SESSION_CONFIG } from '@/lib/session-manager';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

jest.mock('@/lib/jwt-secure');
jest.mock('@/lib/logging-redaction');

const prisma = new PrismaClient();
const sessionManager = new SessionManager();

describe('SessionManager', () => {
  const testUserId = 'test-user-123';
  const testDeviceId = 'device-xyz';
  // SECURITY FIX #3: Moved hardcoded IP '192.168.1.100' to env variable.
  // WHY: Hardcoded IPs expose internal infrastructure in source control.
  const testIpAddress = process.env.TEST_TARGET_IP || '10.0.0.1';

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.sessionAuditLog.deleteMany({});
    await prisma.refreshTokenRotation.deleteMany({});
    await prisma.session.deleteMany({});
  });

  /**
   * Test: Create Session on Login
   */
  describe('createSession', () => {
    it('should create a new session with tokens', async () => {
      const result = await sessionManager.createSession(testUserId, {
        deviceId: testDeviceId,
        deviceName: 'Web Browser',
        userAgent: 'Mozilla/5.0',
        ipAddress: testIpAddress,
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();

      // Verify session in database
      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(session).toBeDefined();
      expect(session?.userId).toBe(testUserId);
      expect(session?.isActive).toBe(true);
      expect(session?.deviceId).toBe(testDeviceId);
      expect(session?.refreshTokenHash).toBeDefined();
    });

    it('should create audit log on session creation', async () => {
      const result = await sessionManager.createSession(testUserId, {
        deviceId: testDeviceId,
      });

      const auditLogs = await prisma.sessionAuditLog.findMany({
        where: { sessionId: result.sessionId },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].event).toBe('login');
    });

    it('should enforce max concurrent sessions', async () => {
      // Create max sessions
      for (let i = 0; i < SESSION_CONFIG.MAX_CONCURRENT_SESSIONS; i++) {
        await sessionManager.createSession(testUserId, {
          deviceId: `device-${i}`,
        });
      }

      // Verify max sessions created
      const sessions = await prisma.session.count({
        where: { userId: testUserId, isActive: true },
      });
      expect(sessions).toBe(SESSION_CONFIG.MAX_CONCURRENT_SESSIONS);

      // Create one more - should revoke oldest
      await sessionManager.createSession(testUserId, {
        deviceId: 'device-max',
      });

      // Still at max
      const sessionsAfter = await prisma.session.count({
        where: { userId: testUserId, isActive: true },
      });
      expect(sessionsAfter).toBe(SESSION_CONFIG.MAX_CONCURRENT_SESSIONS);
    });

    it('should set token family for reuse detection', async () => {
      const result = await sessionManager.createSession(testUserId, {
        deviceId: testDeviceId,
      });

      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(session?.refreshTokenFamily).toBeDefined();
      expect(session?.refreshTokenFamily).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });
  });

  /**
   * Test: Refresh Token Rotation
   */
  describe('rotateRefreshToken', () => {
    let initialSession: any;
    let initialRefreshToken: string;

    beforeEach(async () => {
      // Create initial session
      const result = await sessionManager.createSession(testUserId, {
        deviceId: testDeviceId,
      });
      initialSession = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });
      initialRefreshToken = result.refreshToken;
    });

    it('should rotate refresh token on valid request', async () => {
      const result = await sessionManager.rotateRefreshToken(
        initialSession.id,
        initialRefreshToken,
        testIpAddress
      );

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(initialRefreshToken);

      // Verify session updated
      const updatedSession = await prisma.session.findUnique({
        where: { id: initialSession.id },
      });

      expect(updatedSession?.currentRefreshTokenId).not.toBe(
        initialSession.currentRefreshTokenId
      );
    });

    it('should record token rotation in history', async () => {
      const oldTokenId = initialSession.currentRefreshTokenId;

      await sessionManager.rotateRefreshToken(
        initialSession.id,
        initialRefreshToken
      );

      const rotations = await prisma.refreshTokenRotation.findMany({
        where: { sessionId: initialSession.id },
      });

      expect(rotations.length).toBeGreaterThan(0);
      expect(rotations[0].oldTokenId).toBe(oldTokenId);
      expect(rotations[0].tokenFamily).toBe(initialSession.refreshTokenFamily);
    });

    it('should reject invalid refresh token', async () => {
      const invalidToken = 'invalid.refresh.token';

      await expect(
        sessionManager.rotateRefreshToken(initialSession.id, invalidToken)
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should detect token reuse attack', async () => {
      // First rotation - successful
      const result1 = await sessionManager.rotateRefreshToken(
        initialSession.id,
        initialRefreshToken
      );

      // Mark as reuse detected (simulate)
      await prisma.refreshTokenRotation.updateMany(
        {
          where: { sessionId: initialSession.id },
        },
        { reuseDetected: true }
      );

      // Try to use old token again
      await expect(
        sessionManager.rotateRefreshToken(
          initialSession.id,
          initialRefreshToken
        )
      ).rejects.toThrow('Token reuse detected');

      // Verify all sessions revoked
      const activeSessions = await prisma.session.count({
        where: { userId: testUserId, isActive: true },
      });
      expect(activeSessions).toBe(0);
    });

    it('should invalidate old token after rotation', async () => {
      const oldTokenHash = initialSession.refreshTokenHash;

      await sessionManager.rotateRefreshToken(
        initialSession.id,
        initialRefreshToken
      );

      const updatedSession = await prisma.session.findUnique({
        where: { id: initialSession.id },
      });

      // Token hash should be different
      expect(updatedSession?.refreshTokenHash).not.toBe(oldTokenHash);

      // Trying to use old token should fail
      await expect(
        sessionManager.rotateRefreshToken(
          initialSession.id,
          initialRefreshToken
        )
      ).rejects.toThrow();
    });

    it('should create audit log on rotation', async () => {
      await sessionManager.rotateRefreshToken(
        initialSession.id,
        initialRefreshToken
      );

      const auditLogs = await prisma.sessionAuditLog.findMany({
        where: {
          sessionId: initialSession.id,
          event: 'refresh',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test: Session Revocation
   */
  describe('revokeSession', () => {
    it('should revoke single session', async () => {
      const result = await sessionManager.createSession(testUserId);
      const sessionId = result.sessionId;

      await sessionManager.revokeSession(sessionId, 'test_revoke');

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      expect(session?.isActive).toBe(false);
      expect(session?.revokedAt).toBeDefined();
      expect(session?.revokeReason).toBe('test_revoke');
    });

    it('should revoke all user sessions on security incident', async () => {
      // Create 3 sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const result = await sessionManager.createSession(testUserId, {
          deviceId: `device-${i}`,
        });
        sessions.push(result.sessionId);
      }

      // Revoke all
      const count = await sessionManager.revokeAllUserSessions(
        testUserId,
        'security_incident'
      );

      expect(count).toBe(3);

      // Verify all revoked
      const activeSessions = await prisma.session.count({
        where: { userId: testUserId, isActive: true },
      });
      expect(activeSessions).toBe(0);
    });

    it('should create audit log on revocation', async () => {
      const result = await sessionManager.createSession(testUserId);

      await sessionManager.revokeSession(result.sessionId, 'test_reason');

      const auditLogs = await prisma.sessionAuditLog.findMany({
        where: { sessionId: result.sessionId, event: 'logout' },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test: Session Status Checks
   */
  describe('verifySessionValid', () => {
    it('should verify active session', async () => {
      const result = await sessionManager.createSession(testUserId);

      const valid = await sessionManager.verifySessionValid(result.sessionId);
      expect(valid).toBe(true);
    });

    it('should reject revoked session', async () => {
      const result = await sessionManager.createSession(testUserId);
      await sessionManager.revokeSession(result.sessionId);

      const valid = await sessionManager.verifySessionValid(result.sessionId);
      expect(valid).toBe(false);
    });

    it('should reject expired session', async () => {
      const result = await sessionManager.createSession(testUserId);

      // Manually expire
      await prisma.session.update({
        where: { id: result.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const valid = await sessionManager.verifySessionValid(result.sessionId);
      expect(valid).toBe(false);
    });

    it('should reject nonexistent session', async () => {
      const valid = await sessionManager.verifySessionValid('invalid-session');
      expect(valid).toBe(false);
    });
  });

  /**
   * Test: Get User Sessions
   */
  describe('getUserActiveSessions', () => {
    it('should list all active sessions', async () => {
      // Create 2 sessions
      const result1 = await sessionManager.createSession(testUserId, {
        deviceId: 'device-1',
        deviceName: 'Phone',
      });
      const result2 = await sessionManager.createSession(testUserId, {
        deviceId: 'device-2',
        deviceName: 'Laptop',
      });

      const sessions = await sessionManager.getUserActiveSessions(testUserId);

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toContain(result1.sessionId);
      expect(sessions.map((s) => s.id)).toContain(result2.sessionId);
    });

    it('should exclude revoked sessions', async () => {
      const result1 = await sessionManager.createSession(testUserId);
      const result2 = await sessionManager.createSession(testUserId);

      // Revoke one
      await sessionManager.revokeSession(result1.sessionId);

      const sessions = await sessionManager.getUserActiveSessions(testUserId);

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe(result2.sessionId);
    });

    it('should exclude expired sessions', async () => {
      const result1 = await sessionManager.createSession(testUserId);
      const result2 = await sessionManager.createSession(testUserId);

      // Expire one
      await prisma.session.update({
        where: { id: result1.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const sessions = await sessionManager.getUserActiveSessions(testUserId);

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe(result2.sessionId);
    });
  });

  /**
   * Test: Update Activity
   */
  describe('updateSessionActivity', () => {
    it('should update last activity timestamp', async () => {
      const result = await sessionManager.createSession(testUserId);

      const oldSession = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update activity
      await sessionManager.updateSessionActivity(result.sessionId);

      const newSession = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(newSession?.lastActivityAt?.getTime()).toBeGreaterThan(
        oldSession?.lastActivityAt?.getTime() || 0
      );
    });
  });

  /**
   * Test: Cleanup
   */
  describe('cleanupExpired', () => {
    it('should delete expired sessions', async () => {
      const result = await sessionManager.createSession(testUserId);

      // Expire it
      await prisma.session.update({
        where: { id: result.sessionId },
        data: {
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        },
      });

      const { deleted } = await sessionManager.cleanupExpired();

      expect(deleted).toBeGreaterThan(0);

      // Verify deleted
      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(session).toBeNull();
    });

    it('should delete old rotation records', async () => {
      const result = await sessionManager.createSession(testUserId);

      // Create old rotation
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      await prisma.refreshTokenRotation.create({
        data: {
          sessionId: result.sessionId,
          oldTokenId: 'old-jti',
          newTokenId: 'new-jti',
          tokenFamily: 'family-uuid',
          rotatedAt: oldDate,
        },
      });

      const { deleted } = await sessionManager.cleanupExpired();

      expect(deleted).toBeGreaterThan(0);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
