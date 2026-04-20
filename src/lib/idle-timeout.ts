/**
 * Idle Timeout Implementation
 * 
 * PURPOSE:
 * - Automatically log out users after inactivity
 * - Reduce session hijacking risk
 * - Comply with security policies
 * 
 * MECHANISM:
 * 1. Track last activity timestamp
 * 2. Detect idle periods (no requests for N minutes)
 * 3. Revoke session after timeout
 * 4. Redirect user to login
 * 
 * FEATURES:
 * - Configurable timeout (default: 30 minutes)
 * - User warning before logout (optional)
 * - Activity reset on any request/user interaction
 * - Separate timeouts for different environments
 */

import { PrismaClient } from '@prisma/client';
import { sessionManager } from '@/lib/session-manager';
import { safeLog } from '@/lib/logging-redaction';

const prisma = new PrismaClient();
const db = prisma as any;

/**
 * Idle Timeout Configuration
 */
export const IDLE_TIMEOUT_CONFIG = {
  // Production: 30 minutes
  PRODUCTION: {
    timeoutMs: 30 * 60 * 1000,
    warningMs: 5 * 60 * 1000, // Warn 5 minutes before
  },

  // Development: 2 hours
  DEVELOPMENT: {
    timeoutMs: 2 * 60 * 60 * 1000,
    warningMs: 30 * 60 * 1000,
  },

  // Sensitive operations: 5 minutes
  SENSITIVE: {
    timeoutMs: 5 * 60 * 1000,
    warningMs: 1 * 60 * 1000,
  },
};

/**
 * Get idle timeout config based on environment
 */
function getIdleTimeoutConfig(): { timeoutMs: number; warningMs: number } {
  const env = process.env.NODE_ENV;

  if (env === 'production') {
    return IDLE_TIMEOUT_CONFIG.PRODUCTION;
  } else if (env === 'development') {
    return IDLE_TIMEOUT_CONFIG.DEVELOPMENT;
  } else {
    return IDLE_TIMEOUT_CONFIG.PRODUCTION; // Default to prod
  }
}

/**
 * Session Idle Monitor
 * 
 * Tracks and manages idle sessions
 */
export class IdleTimeoutManager {
  private timeoutMs: number;
  private warningMs: number;

  constructor(timeoutMs?: number, warningMs?: number) {
    const config = getIdleTimeoutConfig();
    this.timeoutMs = timeoutMs || config.timeoutMs;
    this.warningMs = warningMs || config.warningMs;
  }

  /**
   * Check if session is idle and should be revoked
   */
  async checkSessionIdle(sessionId: string): Promise<{
    isIdle: boolean;
    isWarning: boolean;
    minutesRemaining: number;
  }> {
    try {
      const session = await db.session.findUnique({
        where: { id: sessionId },
      });

      if (!session || !session.isActive) {
        return {
          isIdle: true,
          isWarning: false,
          minutesRemaining: 0,
        };
      }

      const now = Date.now();
      const lastActivity = session.lastActivityAt?.getTime() || session.createdAt.getTime();
      const idleMs = now - lastActivity;

      return {
        isIdle: idleMs > this.timeoutMs,
        isWarning: idleMs > (this.timeoutMs - this.warningMs),
        minutesRemaining: Math.ceil((this.timeoutMs - idleMs) / 1000 / 60),
      };
    } catch (error) {
      safeLog.error('Error checking session idle', {
        error: String(error).substring(0, 100),
      });
      // Assume idle on error
      return { isIdle: true, isWarning: false, minutesRemaining: 0 };
    }
  }

  /**
   * Revoke idle session
   */
  async revokeIdleSession(sessionId: string): Promise<void> {
    try {
      await sessionManager.revokeSession(sessionId, 'idle_timeout');
      safeLog.info('Session revoked due to inactivity', {
        sessionId: sessionId.substring(0, 8),
      });
    } catch (error) {
      safeLog.error('Error revoking idle session', {
        error: String(error).substring(0, 100),
      });
    }
  }

  /**
   * Cleanup idle sessions (runs periodically)
   */
  async cleanupIdleSessions(): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - this.timeoutMs);

      const result = await db.session.updateMany({
        where: {
          isActive: true,
          lastActivityAt: { lt: cutoffTime },
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokeReason: 'idle_timeout',
        },
      });

      if (result.count > 0) {
        safeLog.info('Idle sessions cleaned up', { count: result.count });
      }

      return result.count;
    } catch (error) {
      safeLog.error('Error cleaning idle sessions', {
        error: String(error).substring(0, 100),
      });
      return 0;
    }
  }
}

/**
 * Export singleton instance
 */
export const idleTimeoutManager = new IdleTimeoutManager();

/**
 * Setup periodic idle session cleanup
 * Runs every 5 minutes
 */
export function setupIdleTimeoutCleanup(): void {
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    try {
      await idleTimeoutManager.cleanupIdleSessions();
    } catch (error) {
      safeLog.error('Scheduled idle cleanup failed', {
        error: String(error).substring(0, 100),
      });
    }
  }, CLEANUP_INTERVAL);

  safeLog.info('Idle timeout cleanup scheduled (every 5 minutes)');
}

// ============================================================================
// CLIENT-SIDE IDLE DETECTION (React Hook)
// ============================================================================

/**
 * React Hook: useIdleTimeout
 * 
 * Usage:
 * ```tsx
 * import { useIdleTimeout } from '@/hooks/use-idle-timeout';
 * 
 * export function AppLayout() {
 *   const { isWarning, minutesRemaining, logout } = useIdleTimeout();
 *   
 *   return (
 *     {isWarning && (
 *       <div className=\"alert\">
 *         You will be logged out in {minutesRemaining} minutes due to inactivity.
 *         <button onClick={() => resetActivity()}>Continue Session</button>
 *       </div>
 *     )}
 *   );
 * }
 * ```
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/axios-interceptor';

interface UseIdleTimeoutReturn {
  isWarning: boolean;
  minutesRemaining: number;
  resetActivity: () => void;
  logout: () => void;
}

export function useIdleTimeout(timeoutMs: number = 30 * 60 * 1000): UseIdleTimeoutReturn {
  const router = useRouter();
  const [isWarning, setIsWarning] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const warningDuration = 5 * 60 * 1000; // 5 minutes before timeout

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      // Continue logout even if request fails
    }

    clearTokens();
    router.push('/login');
  }, [router]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsWarning(false);
    setMinutesRemaining(0);

    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Set warning timeout (timeoutMs - warningDuration before timeout)
    warningRef.current = setTimeout(
      () => {
        setIsWarning(true);
        setMinutesRemaining(5);

        // Update countdown every minute
        const countdownInterval = setInterval(() => {
          setMinutesRemaining((prev) => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              return 0;
            }
            return prev - 1;
          });
        }, 60 * 1000);
      },
      timeoutMs - warningDuration
    );

    // Set logout timeout
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, timeoutMs);
  }, [timeoutMs, handleLogout]);

  useEffect(() => {
    resetActivity();

    // Track user activity events
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      // Only reset if warning is not showing
      // (user acknowledged warning, let timeout happen)
      if (!isWarning) {
        resetActivity();
      }
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      // Cleanup
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [isWarning, resetActivity]);

  return {
    isWarning,
    minutesRemaining,
    resetActivity,
    logout: handleLogout,
  };
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/**
 * Example: Idle Timeout Warning Component
 * 
 * ```tsx
 * 'use client';
 * 
 * import { useIdleTimeout } from '@/hooks/use-idle-timeout';
 * 
 * export function IdleTimeoutWarning() {
 *   const { isWarning, minutesRemaining, logout, resetActivity } = useIdleTimeout();
 * 
 *   if (!isWarning) return null;
 * 
 *   return (
 *     <div className=\"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center\">
 *       <div className=\"bg-white rounded-lg p-6 shadow-lg\">
 *         <h2 className=\"text-xl font-bold mb-4\">Inactivity Warning</h2>
 *         <p className=\"mb-4\">
 *           You will be logged out in {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''} due to inactivity.
 *         </p>
 *         <div className=\"flex gap-4\">
 *           <button
 *             onClick={resetActivity}
 *             className=\"flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700\"
 *           >\n *             Continue Session\n *           </button>\n *           <button\n *             onClick={logout}\n *             className=\"flex-1 bg-gray-600 text-white py-2 rounded-md hover:bg-gray-700\"\n *           >\n *             Logout\n *           </button>\n *         </div>\n *       </div>\n *     </div>\n *   );\n * }\n * ```\n */
