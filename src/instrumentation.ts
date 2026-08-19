/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Installs process-level guards (in the Node.js runtime only) that swallow
 * benign "aborted connection" errors so they don't crash the process or
 * pollute the logs, and arms the automatic storage-retention sweep. The
 * Node-specific code lives in separate modules that are dynamically imported
 * here, so their Node APIs are never bundled for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerProcessGuards } = await import('./instrumentation-node');
    registerProcessGuards();

    // Frees disk automatically: deletes the documents of cases that are still
    // not approved N days after their first upload (see lib/auto-retention.ts).
    const { startAutoRetentionScheduler } = await import('./lib/auto-retention-scheduler');
    startAutoRetentionScheduler();
  }
}
