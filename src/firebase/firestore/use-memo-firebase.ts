
'use client';

import { useMemo, DependencyList } from 'react';

/**
 * A custom hook that memoizes a Firebase reference or query.
 * This prevents infinite re-renders when passing references to hooks like useCollection or useDoc.
 * 
 * @param factory A function that returns a Firebase reference or query.
 * @param deps Dependency list for the memoization.
 * @returns The memoized reference or query.
 */
export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}
