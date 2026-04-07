'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for tracking user activity and managing token refresh with idle timeout
 * 
 * Features:
 * - Tracks user activity (clicks, scrolls, keyboard, mouse)
 * - Automatically refreshes token before expiry
 * - Logs out user if idle timeout exceeded
 * - Stores refresh token in localStorage for API requests
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
const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
const REFRESH_BUFFER_SECONDS = 60; // Refresh 1 minute before expiry

export function useIdleTimeout(options: UseIdleTimeoutOptions = {}) {
  const idleTimeoutMinutes = options.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  const warningBeforeLogoutSeconds = options.warningBeforeLogoutSeconds ?? DEFAULT_WARNING_SECONDS;

  const router = useRouter();
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isRefreshingRef = useRef<boolean>(false);

  /**
   * Call refresh endpoint to get new access token and rotate refresh token
   */
  const refreshToken = useCallback(async () => {
    if (isRefreshingRef.current) {
      return; // Prevent concurrent refresh calls
    }

    try {
      isRefreshingRef.current = true;
      const refreshTokenStored = localStorage.getItem('nib-refresh-token');

      if (!refreshTokenStored) {
        // No refresh token available, redirect to login
        localStorage.removeItem('nib-refresh-token');
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: refreshTokenStored,
        }),
        credentials: 'include', // Include cookies
      });

      if (response.ok) {
        const data = await response.json();
        
        // Store new refresh token
        if (data.refreshToken) {
          localStorage.setItem('nib-refresh-token', data.refreshToken);
        }

        // Access token is set in httpOnly cookie automatically
        console.debug('[IdleTimeout] Token refreshed successfully');
        lastActivityRef.current = Date.now();
        
        // Schedule next refresh
        scheduleNextRefresh();
      } else if (response.status === 401 || response.status === 403) {
        // Unauthorized - user needs to login
        localStorage.removeItem('nib-refresh-token');
        router.push('/login?reason=session_expired');
      } else {
        console.error('[IdleTimeout] Refresh failed:', response.status);
        localStorage.removeItem('nib-refresh-token');
        router.push('/login');
      }
    } catch (error) {
      console.error('[IdleTimeout] Refresh error:', error);
      localStorage.removeItem('nib-refresh-token');
      router.push('/login');
    } finally {
      isRefreshingRef.current = false;
    }
  }, [router]);

  /**
   * Schedule the next token refresh
   */
  const scheduleNextRefresh = useCallback(() => {
    // Clear existing refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Schedule refresh to occur before access token expires
    // Access token expires in 15 minutes, so refresh after ~14 minutes
    const refreshDelayMs = (ACCESS_TOKEN_EXPIRY_MINUTES * 60 - REFRESH_BUFFER_SECONDS) * 1000;
    
    refreshTimerRef.current = setTimeout(() => {
      refreshToken();
    }, refreshDelayMs);
  }, [refreshToken]);

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

    // Initialize timers
    resetIdleTimer();
    scheduleNextRefresh();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [resetIdleTimer, scheduleNextRefresh]);

  return {
    refreshToken,
    lastActivity: lastActivityRef.current,
    isRefreshing: isRefreshingRef.current,
  };
}
