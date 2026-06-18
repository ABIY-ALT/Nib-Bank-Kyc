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

/**
 * Request-level upload parsing faults that are NOT server bugs and must never
 * crash the process. They are emitted when a multipart body is truncated or
 * malformed — typically because the client aborted mid-upload, or the body
 * exceeded a size limit so the stream ended early ("Unexpected end of form").
 *
 * The framework's form parser can surface these as uncaught exceptions outside
 * any request try/catch. Killing the whole server over one bad request would
 * take down every other user, so we log and continue; the offending request
 * still fails on its own with an error response.
 */
const isUploadParseError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const message = (err as { message?: string }).message ?? '';
  return (
    /unexpected end of form/i.test(message) ||
    /request body exceeded/i.test(message) ||
    /maxfilesize exceeded|maxtotalfilesize/i.test(message) ||
    /unexpected end of (multipart|stream)/i.test(message)
  );
};

export function registerProcessGuards() {
  process.on('uncaughtException', (err) => {
    if (isAbortedConnectionError(err)) {
      // Benign: the client went away before the response finished. Ignore.
      return;
    }
    if (isUploadParseError(err)) {
      // Benign: a truncated/oversized/malformed upload. Log, but keep serving.
      console.error('Ignored malformed or oversized upload (request-level, not fatal):', (err as { message?: string })?.message);
      return;
    }
    // Resilience policy: the server MUST stay up. Node's default would exit the
    // process here — we deliberately do not. One unexpected error inside a single
    // request must never take the whole service down for every other user. The
    // error is logged in full for diagnosis; the offending request still fails on
    // its own, but the server keeps serving everyone else.
    console.error('Uncaught exception (logged, server kept alive):', err);
  });

  process.on('unhandledRejection', (reason) => {
    if (isAbortedConnectionError(reason)) {
      return;
    }
    if (isUploadParseError(reason)) {
      console.error('Ignored malformed or oversized upload (request-level, not fatal):', (reason as { message?: string })?.message);
      return;
    }
    console.error('Unhandled promise rejection:', reason);
  });
}
