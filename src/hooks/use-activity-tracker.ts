import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

export function useActivityTracker() {
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const checkIdleTimeout = useCallback(async () => {
    const timeSinceLastActivity = Date.now() - lastActivityRef.current;

    if (timeSinceLastActivity > IDLE_TIMEOUT) {
      // User is idle, logout
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error('Logout failed:', error);
      }
      router.push('/login?reason=idle_timeout');
      return;
    }

    // User is active, try to refresh token
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // Refresh failed, redirect to login
        router.push('/login?reason=session_expired');
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  }, [router]);

  useEffect(() => {
    // Add event listeners for user activity
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, updateActivity);
    });

    // Start checking idle timeout
    checkIntervalRef.current = setInterval(checkIdleTimeout, CHECK_INTERVAL);

    // Initialize activity
    updateActivity();

    return () => {
      // Cleanup event listeners
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });

      // Clear interval
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [updateActivity, checkIdleTimeout]);
}
