/**
 * @deprecated USE useIdleTimeout INSTEAD
 * 
 * This hook was causing excessive token refresh attempts (every 30 seconds),
 * leading to UI freezing and performance issues.
 * 
 * The useIdleTimeout hook provides a better implementation:
 * - Schedules refresh ~14 minutes before token expiry (not every 30 seconds)
 * - Properly handles idle timeout detection
 * - No aggressive polling
 * 
 * Remove this hook from your components and use IdleTimeoutProvider instead.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

export function useActivityTracker() {
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Add event listeners for user activity
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, updateActivity);
    });

    // Initialize activity
    updateActivity();

    return () => {
      // Cleanup event listeners
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [updateActivity]);
}
