/**
 * Small in-process guards for expensive read queries. Each Node process keeps its
 * own state, so running several processes only multiplies the limits below.
 */

const MAX_CACHE_ENTRIES = 1000;

const cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

/**
 * Shares one result between identical calls for a few seconds, including calls
 * that arrive while the first is still running, so many users loading the same
 * totals cost one query rather than one each.
 *
 * SECURITY: the key must contain everything that scopes the result, such as the
 * full where-clause with its jurisdiction filter, or one user could be served
 * another user's figures. Failures are never cached.
 */
export function cachedForSeconds<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.value as Promise<T>;

  if (cache.size >= MAX_CACHE_ENTRIES) {
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    }
    // Everything is still fresh: drop the oldest entry to stay within the limit.
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  }

  const value = load();
  cache.set(key, { expiresAt: now + seconds * 1000, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** How many very large list fetches may run at once in this process. */
const MAX_LARGE_QUERIES = 2;

let largeQueriesRunning = 0;
const largeQueryQueue: (() => void)[] = [];

/**
 * Queues very large fetches, such as full exports, so several at once cannot use
 * up the connection pool and Node's memory while everyone else waits.
 */
export async function runLargeQuery<T>(query: () => Promise<T>): Promise<T> {
  if (largeQueriesRunning >= MAX_LARGE_QUERIES) {
    // The finishing query hands its slot straight to the next one in the queue.
    await new Promise<void>((resolve) => largeQueryQueue.push(resolve));
  } else {
    largeQueriesRunning++;
  }

  try {
    return await query();
  } finally {
    const next = largeQueryQueue.shift();
    if (next) next();
    else largeQueriesRunning--;
  }
}
