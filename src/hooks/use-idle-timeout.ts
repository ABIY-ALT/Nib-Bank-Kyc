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
}

const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
const DEFAULT_WARNING_SECONDS = 60;

export function useIdleTimeout(options: UseIdleTimeoutOptions = {}) {
  const idleTimeoutMinutes = options.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  const warningBeforeLogoutSeconds = options.warningBeforeLogoutSeconds ?? DEFAULT_WARNING_SECONDS;

  const router = useRouter();
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  /**
   * Reset idle timer on user activity
   */
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    // Clear existing idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // Set new idle timeout
    const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
    
    idleTimerRef.current = setTimeout(() => {
      // User has been idle - logout
      console.warn(`[IdleTimeout] User idle for ${idleTimeoutMinutes} minutes, logging out`);
      localStorage.removeItem('nib-refresh-token');
      router.push('/login?reason=idle_timeout');
    }, idleTimeoutMs);
  }, [idleTimeoutMinutes, router]);

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
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'wheel',
    ];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, {
        passive: true,
        capture: false,
      });
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
    };
  }, [resetIdleTimer]);

  return {
    lastActivity: lastActivityRef.current,
  };
}
