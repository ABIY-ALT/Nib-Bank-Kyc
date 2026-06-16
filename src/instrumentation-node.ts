/**
 * Node.js-runtime-only process guards. Loaded via dynamic import from
 * {@link ./instrumentation.ts} so these Node APIs are never bundled into the
 * Edge runtime.
 *
 * Swallows "aborted connection" errors (ECONNRESET / "aborted"), which are
 * emitted when a client closes the connection mid-request (navigating away,
 * refreshing, cancelling a fetch, interrupting a file upload/download). These
 * are not application bugs. Every other error keeps Node's fail-fast default.
 */

const isAbortedConnectionError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message ?? '';
  return code === 'ECONNRESET' || message === 'aborted' || code === 'ECONNABORTED';
};

export function registerProcessGuards() {
  process.on('uncaughtException', (err) => {
    if (isAbortedConnectionError(err)) {
      // Benign: the client went away before the response finished. Ignore.
      return;
    }
    // Preserve Node's fail-fast default for real, unexpected errors: log and
    // exit so a process supervisor can restart a known-good instance.
    console.error('Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    if (isAbortedConnectionError(reason)) {
      return;
    }
    console.error('Unhandled promise rejection:', reason);
  });
}
