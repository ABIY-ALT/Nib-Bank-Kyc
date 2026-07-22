/**
 * Prisma-Based Data Hooks
 * Data access layer for PostgreSQL via Prisma ORM
 * 
 * Usage:
 * const { data, loading, error } = useQuery('submission', { userId });
 */

'use client';

import { useState, useEffect } from 'react';

export interface UseQueryOptions {
  [key: string]: any;
}

/**
 * Hook to fetch data from Prisma via API
 * Fetches multiple records from database
 */
export function useQuery<T = any>(
  resource: string,
  filter?: UseQueryOptions,
  options?: { refetchInterval?: number }
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const filterStr = filter ? JSON.stringify(filter) : '';
  const refetchInterval = options?.refetchInterval;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();

        if (filterStr) {
          params.append('filter', filterStr);
        }

        const response = await fetch(`/api/data/${resource}?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch ${resource}`);
        }

        const result = await response.json();
        setData(result.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Optional refetch interval
    if (refetchInterval) {
      const interval = setInterval(fetchData, refetchInterval);
      return () => clearInterval(interval);
    }
  }, [resource, filterStr, refetchInterval]);

  return { data, loading, error };
}

/**
 * Hook to fetch single record from Prisma
 * Fetches one record from database by ID
 */
export function useDocument<T = any>(
  resource: string,
  id: string | null,
  options?: { refetchInterval?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/data/${resource}/${id}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch ${resource}/${id}`);
        }

        const result = await response.json();
        setData(result.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Optional refetch interval
    if (options?.refetchInterval) {
      const interval = setInterval(fetchData, options.refetchInterval);
      return () => clearInterval(interval);
    }
  }, [resource, id, options?.refetchInterval]);

  return { data, loading, error };
}

/**
 * Hook for mutations (create, update, delete)
 */
export function useMutation<T = any>(resource: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = async (data: Partial<T>): Promise<T> => {
    try {
      setLoading(true);
      const response = await fetch(`/api/data/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Failed to create ${resource}`);
      }

      const result = await response.json();
      setError(null);
      return result.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const update = async (id: string, data: Partial<T>): Promise<T> => {
    try {
      setLoading(true);
      const response = await fetch(`/api/data/${resource}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Failed to update ${resource}/${id}`);
      }

      const result = await response.json();
      setError(null);
      return result.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    try {
      setLoading(true);
      const response = await fetch(`/api/data/${resource}/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete ${resource}/${id}`);
      }

      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { create, update, remove, loading, error };
}
