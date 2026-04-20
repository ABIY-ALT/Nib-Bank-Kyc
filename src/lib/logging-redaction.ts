/**
 * Logging Redaction Middleware
 * 
 * SECURITY: Prevents sensitive data from appearing in logs
 * Redacts:
 * - Password fields
 * - JWT tokens
 * - API keys
 * - Database connection strings
 * - Authorization headers
 */

// Patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
  // Database
  /postgresql:\/\/[^/]*/gi,
  /mongodb:\/\/[^/]*/gi,
  /mysql:\/\/[^/]*/gi,

  // Password fields
  /password["\s:=]+["']?([^"'\s]+)/gi,
  /passwd["\s:=]+["']?([^"'\s]+)/gi,
  /pwd["\s:=]+["']?([^"'\s]+)/gi,

  // Tokens & Secrets
  /token["\s:=]+["']?([^"'\s]+)/gi,
  /secret["\s:=]+["']?([^"'\s]+)/gi,
  /api[_-]?key["\s:=]+["']?([^"'\s]+)/gi,
  /jwt["\s:=]+["']?([^"'\s]+)/gi,

  // Authorization headers
  /authorization["\s:=]+bearer\s+([^\s"']+)/gi,
  /x-api-key["\s:=]+["']?([^"'\s]+)/gi,

  // AWS credentials
  /AKIA[0-9A-Z]{16}/g,
  /aws[_-]secret[_-]access[_-]key["\s:=]+["']?([^"'\s]+)/gi,

  // JWT tokens (eyJ... format)
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,

  // Refresh tokens in cookies
  /refreshToken["\s:=]+["']?([^"'\s]+)/gi,
  /accessToken["\s:=]+["']?([^"'\s]+)/gi,
];

/**
 * Redact sensitive data from a string
 */
export function redactSensitiveData(text: string): string {
  if (typeof text !== 'string') {
    return String(text);
  }

  let redacted = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }

  return redacted;
}

/**
 * Redact sensitive fields from an object
 */
export function redactObject(
  obj: any,
  sensitiveKeys: string[] = [
    'password',
    'passwd',
    'pwd',
    'token',
    'jwt',
    'secret',
    'api_key',
    'apiKey',
    'authorization',
    'databaseUrl',
    'database_url',
    'connectionString',
    'connection_string',
  ]
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, sensitiveKeys));
  }

  const redacted: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactObject(value, sensitiveKeys);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Safe logger wrapper
 * 
 * USAGE:
 * ```typescript
 * safeLog.info('User login attempt', { email: 'user@example.com', token: 'secret' });
 * // Output: User login attempt { email: 'user@example.com', token: '[REDACTED]' }
 * ```
 */
export const safeLog = {
  debug: (message: string, data?: any) => {
    console.debug(message, redactObject(data));
  },

  info: (message: string, data?: any) => {
    console.info(message, redactObject(data));
  },

  warn: (message: string, data?: any) => {
    console.warn(message, redactObject(data));
  },

  error: (message: string, data?: any) => {
    console.error(message, redactObject(data));
  },
};

/**
 * Express middleware to redact sensitive headers
 * 
 * USAGE:
 * ```typescript
 * app.use(redactHeadersMiddleware);
 * ```
 */
export function redactHeadersMiddleware(
  req: any,
  res: any,
  next: any
) {
  // Log request without sensitive headers
  const headersToLog = { ...req.headers };
  delete headersToLog.authorization;
  delete headersToLog['x-api-key'];
  delete headersToLog.cookie;

  const logEntry = {
    method: req.method,
    path: req.path,
    headers: headersToLog,
  };

  safeLog.info('Incoming request', logEntry);

  // Redact response headers as well
  const originalSend = res.send;
  res.send = function (data: any) {
    const responseHeaders = { ...res.getHeaders() };
    delete responseHeaders['set-cookie'];

    safeLog.info('Outgoing response', {
      status: res.statusCode,
      headers: responseHeaders,
    });

    originalSend.call(this, data);
  };

  next();
}

/**
 * Never-log utility - ABSOLUTE blocking
 */
export function neverLog(value: any): string {
  return '[BLOCKED - SECRET VALUE]';
}

/**
 * Test if a value appears to be a secret
 */
export function looksLikeSecret(value: any): boolean {
  if (typeof value !== 'string') return false;

  // Check length and entropy
  if (value.length < 20) return false;

  // Check for patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }

  // Check for high entropy (random characters)
  const entropy = new Set(value).size / value.length;
  return entropy > 0.75; // High uniqueness suggests it's a secret
}
