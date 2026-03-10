/**
 * @fileOverview Institutional Centralized Logger.
 * Handles environment-specific error reporting and traceability.
 */

export interface LogResult {
  message: string;
  traceId: string;
}

export function logInstitutionalError(error: any, context: string): LogResult {
  const isProd = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();
  const traceId = `ERR_${Math.random().toString(36).substring(2, 8).toUpperCase()}_${Date.now().toString().slice(-4)}`;

  // SERVER-SIDE LOGGING (Detailed)
  console.error(`[${timestamp}] [${traceId}] [CONTEXT: ${context}]`, error);

  if (!isProd) {
    return {
      message: error instanceof Error ? error.message : String(error),
      traceId
    };
  }

  // PRODUCTION RESPONSE (User-Safe)
  let userMessage = "An internal service exception occurred.";

  if (context.includes('AUTH')) userMessage = "Invalid institutional credentials.";
  if (context.includes('DB')) userMessage = "Institutional database fault.";
  if (context.includes('PERMISSION')) userMessage = "Access restricted: Insufficient clearance.";
  if (context.includes('FILE')) userMessage = "Institutional vault access fault.";

  return {
    message: userMessage,
    traceId
  };
}
