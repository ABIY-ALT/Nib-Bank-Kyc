'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from './use-toast';

interface UseCopyPasswordReturn {
  isCopying: boolean;
  copySucceeded: boolean;
  copyPassword: (password: string) => Promise<void>;
}

/**
 * Custom hook for securely copying passwords to clipboard with proper async handling
 * and lifecycle-safe state management.
 *
 * LIFECYCLE SAFETY:
 * - Tracks component mount state to prevent setState on unmounted components
 * - Cancels pending timeouts on unmount
 * - Only updates state if component is still mounted
 * - Safe for components that might unmount during copy operation
 *
 * Features:
 * - Modern Clipboard API usage
 * - Proper loading state management
 * - Automatic state cleanup with timeouts
 * - Error handling with user feedback
 * - Prevention of concurrent copy operations
 * - Unmount-safe state updates
 */
export function useCopyPassword(): UseCopyPasswordReturn {
  const [isCopying, setIsCopying] = useState(false);
  const [copySucceeded, setCopySucceeded] = useState(false);
  const isMountedRef = useRef(true);
  const copySuccessTimeoutRef = useRef<number | null>(null);
  const copyAbortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Cleanup on unmount: prevent setState on unmounted component
  useEffect(() => {
    return () => {
      console.log('[useCopyPassword] Component unmounting, marking as not mounted');
      isMountedRef.current = false;
      
      // Abort any in-flight copy operations
      if (copyAbortRef.current) {
        copyAbortRef.current.abort();
        copyAbortRef.current = null;
      }
      
      // Clear any pending timeouts
      if (copySuccessTimeoutRef.current) {
        window.clearTimeout(copySuccessTimeoutRef.current);
        copySuccessTimeoutRef.current = null;
      }
    };
  }, []);

  const copyPassword = useCallback(async (password: string) => {
    console.log('[useCopyPassword] Copy operation started');

    if (!isMountedRef.current) {
      console.warn('[useCopyPassword] Copy requested but component is not mounted');
      return;
    }

    if (isCopying) {
      console.log('[useCopyPassword] Copy already in progress, ignoring request');
      return;
    }

    if (!password) {
      console.log('[useCopyPassword] No password provided');
      if (isMountedRef.current) {
        toast({
          title: 'Copy failed',
          description: 'No password available to copy.',
          variant: 'destructive',
        });
      }
      return;
    }

    // Create abort controller for this copy operation
    copyAbortRef.current = new AbortController();
    const signal = copyAbortRef.current.signal;

    try {
      if (!isMountedRef.current) {
        console.log('[useCopyPassword] Component unmounted before copy started');
        return;
      }

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setIsCopying(true);
        setCopySucceeded(false);
        console.log('[useCopyPassword] Loading state set to true');
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API not available in this browser');
      }

      console.log('[useCopyPassword] Writing to clipboard...');
      await navigator.clipboard.writeText(password);
      console.log('[useCopyPassword] Successfully copied to clipboard');

      // Check if component is still mounted AND operation wasn't aborted
      if (!isMountedRef.current || signal.aborted) {
        console.log('[useCopyPassword] Component unmounted or operation aborted, skipping state updates');
        return;
      }

      setCopySucceeded(true);
      if (isMountedRef.current) {
        toast({ title: 'Copied to clipboard' });
      }

      // Clear any existing timeout
      if (copySuccessTimeoutRef.current) {
        window.clearTimeout(copySuccessTimeoutRef.current);
      }

      // Reset success state after 2 seconds (only if component is still mounted)
      copySuccessTimeoutRef.current = window.setTimeout(() => {
        if (isMountedRef.current && !signal.aborted) {
          setCopySucceeded(false);
          console.log('[useCopyPassword] Copy success state reset');
        }
        copySuccessTimeoutRef.current = null;
      }, 2000);

    } catch (error) {
      console.error('[useCopyPassword] Copy failed:', error);
      if (isMountedRef.current && !signal.aborted) {
        toast({
          title: 'Copy failed',
          description: error instanceof Error ? error.message : 'Unable to copy password.',
          variant: 'destructive',
        });
      }
    } finally {
      // Only reset loading state if component is still mounted
      if (isMountedRef.current && !signal.aborted) {
        setIsCopying(false);
        console.log('[useCopyPassword] Loading state reset, operation complete');
      }
      copyAbortRef.current = null;
    }
  }, [isCopying, toast]);

  return {
    isCopying,
    copySucceeded,
    copyPassword,
  };
}
