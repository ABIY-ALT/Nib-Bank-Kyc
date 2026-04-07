'use client';

import { ReactNode } from 'react';
import { useActivityTracker } from '@/hooks/use-activity-tracker';

function ActivityTrackerContent({ children }: { children: ReactNode }) {
  useActivityTracker();
  return <>{children}</>;
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  return <ActivityTrackerContent>{children}</ActivityTrackerContent>;
}
