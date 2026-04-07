'use client';

import React, { ReactNode } from 'react';
import { useIdleTimeout } from '@/hooks/use-idle-timeout';

/**
 * IdleTimeout Provider Component
 * 
 * Wraps the entire app to enable automatic token refresh and idle timeout tracking.
 * Place this at the top level of your app (after auth context).
 */

interface IdleTimeoutProviderProps {
  children: ReactNode;
  idleTimeoutMinutes?: number;
  warningBeforeLogoutSeconds?: number;
}

export function IdleTimeoutProvider({
  children,
  idleTimeoutMinutes = 15,
  warningBeforeLogoutSeconds = 60,
}: IdleTimeoutProviderProps) {
  // Initialize idle timeout hook
  useIdleTimeout({
    idleTimeoutMinutes,
    warningBeforeLogoutSeconds,
  });

  return <>{children}</>;
}
