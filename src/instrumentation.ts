/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Installs process-level guards (in the Node.js runtime only) that swallow
 * benign "aborted connection" errors so they don't crash the process or
 * pollute the logs. The Node-specific code lives in a separate module that is
 * dynamically imported here, so its Node APIs are never bundled for the Edge
 * runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerProcessGuards } = await import('./instrumentation-node');
    registerProcessGuards();
  }
}
