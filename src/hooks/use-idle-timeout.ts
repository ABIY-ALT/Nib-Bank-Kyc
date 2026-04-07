'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for tracking user activity and idle timeout
 * 
 * Features:
 * - Tracks user activity (clicks, scrolls, keyboard, mouse)
 * - Logs out user if idle timeout exceeded
 * - NO automatic/forced token refresh
 * 
 * Usage:
 * useIdleTimeout({
 *   idleTimeoutMinutes: 15,
 *   warningBeforeLogoutSeconds: 60
 * })
 */

interface UseIdleTimeoutOptions {
  idleTimeoutMinutes?: number;
  warningBeforeLogoutSeconds?: number;
  heartbeatMinutes?: number;
}

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
const DEFAULT_WARNING_SECONDS = 60;
const DEFAULT_HEARTBEAT_MINUTES = 5;

export function useIdleTimeout(options: UseIdleTimeoutOptions = {}) {
  const idleTimeoutMinutes = options.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  const warningBeforeLogoutSeconds = options.warningBeforeLogoutSeconds ?? DEFAULT_WARNING_SECONDS;
  const heartbeatMinutes = options.heartbeatMinutes ?? DEFAULT_HEARTBEAT_MINUTES;

  const router = useRouter();
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(0);
  const heartbeatAbortRef = useRef<AbortController | null>(null);

  /**
   * Reset idle timer on user activity
   */
  const sendHeartbeat = useCallback(async () => {
    const now = Date.now();
    const minMs = heartbeatMinutes * 60 * 1000;

    if (now - lastHeartbeatRef.current < minMs) {
      return;
    }

    lastHeartbeatRef.current = now;
    if (heartbeatAbortRef.current) {
      heartbeatAbortRef.current.abort();
    }

    const controller = new AbortController();
    heartbeatAbortRef.current = controller;

    try {
      await fetch('/api/auth/me', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      console.warn('[IdleTimeout] heartbeat failed', error);
    } finally {
      if (heartbeatAbortRef.current === controller) {
        heartbeatAbortRef.current = null;
      }
    }
  }, [heartbeatMinutes]);

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    sendHeartbeat();

    // Clear existing timers
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }

    // Set warning timer if enabled
    if (warningBeforeLogoutSeconds > 0) {
      const warningTimeMs = (idleTimeoutMinutes * 60 * 1000) - (warningBeforeLogoutSeconds * 1000);
      if (warningTimeMs > 0) {
        warningTimerRef.current = setTimeout(() => {
          // idle warning can be added here if needed
        }, warningTimeMs);
      }
    }

    // Set new idle timeout
    const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
    
    idleTimerRef.current = setTimeout(() => {
      // User has been idle - logout
      router.push('/login?reason=idle_timeout');
    }, idleTimeoutMs);
  }, [heartbeatMinutes, idleTimeoutMinutes, warningBeforeLogoutSeconds, router, sendHeartbeat]);

  /**
   * Handle user activity events
   */
  useEffect(() => {
    const handleActivity = () => {
      resetIdleTimer();
    };

    // Track various user activities
    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'input',
      'scroll',
      'touchstart',
      'click',
      'wheel',
      'focus',
      'visibilitychange',
    ];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initialize timer
    resetIdleTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
      if (heartbeatAbortRef.current) {
        heartbeatAbortRef.current.abort();
      }
    };
  }, [resetIdleTimer]);

  return {
    lastActivity: lastActivityRef.current,
  };
}
