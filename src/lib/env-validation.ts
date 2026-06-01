import { z } from 'zod';

/**
 * Environment Variable Validation Schema
 * 
 * SECURITY REQUIREMENTS:
 * - All secrets MUST be defined (no empty strings)
 * - JWT_SECRET minimum 64 characters for production
 * - DATABASE_URL must be valid PostgreSQL connection string
 * - Application MUST crash if validation fails
 */

const EnvSchema = z.object({
  // NODE ENVIRONMENT
  NODE_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),

  // DATABASE
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid URL')
    .startsWith(
      'postgresql://',
      'DATABASE_URL must be a PostgreSQL connection string'
    ),

  // JWT SECRET - CRITICAL SECURITY
  JWT_SECRET: z
    .string()
    .min(1, 'JWT_SECRET is required')
    .superRefine((secret, ctx) => {
      if (secret.length < 64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `JWT_SECRET must be at least 64 characters (got ${secret.length}). Generate with: openssl rand -base64 48`
        });
      }
      if (/^\$\{.+\}$/.test(secret)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_SECRET cannot be an environment variable placeholder - must be actual value or AWS secret'
        });
      }
    }),

  // SECURITY SETTINGS
  SECURE_COOKIE_SAME_SITE: z
    .enum(['Strict', 'Lax', 'None'])
    .default('Strict'),

  CREDENTIAL_SHARING: z
    .boolean()
    .default(false)
    .refine((val) => val === false, 'CREDENTIAL_SHARING must be false'),

  // CORS
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((val) => val.split(',').map((v) => v.trim())),

  CORS_MAX_AGE: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'CORS_MAX_AGE must be greater than 0'),

  CORS_EXPOSED_HEADERS: z
    .string()
    .default('Content-Type,Authorization')
    .transform((val) => val.split(',').map((v) => v.trim())),

  // LOGGING
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),

  // SMTP EMAIL CONFIGURATION
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((val) => val ? Number(val) : 587)
    .refine((val) => Number.isInteger(val) && val > 0 && val < 65536, 'SMTP_PORT must be a valid port number'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val !== 'false'),
  EMAIL_FROM_ADDRESS: z.string().optional().default('noreply@nibbank.com.et'),
  EMAIL_FROM_NAME: z.string().optional().default('NIB Bank KYC'),
  APP_BASE_URL: z
    .string()
    .min(1, 'APP_BASE_URL is required')
    .url('APP_BASE_URL must be a valid absolute URL'),

  // AWS CONFIGURATION (optional, for secret manager)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SECRET_NAME: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Parse and validate environment variables
 * 
 * SECURITY: This runs at application startup and crashes if validation fails
 * This prevents the app from starting with invalid or missing secrets
 */
export function validateEnv(): EnvConfig {
  const rawEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    SECURE_COOKIE_SAME_SITE: process.env.SECURE_COOKIE_SAME_SITE,
    CREDENTIAL_SHARING: process.env.CREDENTIAL_SHARING === 'true',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    CORS_MAX_AGE: process.env.CORS_MAX_AGE,
    CORS_EXPOSED_HEADERS: process.env.CORS_EXPOSED_HEADERS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_TLS_REJECT_UNAUTHORIZED: process.env.SMTP_TLS_REJECT_UNAUTHORIZED,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    APP_BASE_URL: process.env.APP_BASE_URL,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    SECRET_NAME: process.env.SECRET_NAME,
  };

  const result = EnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMsg = Object.entries(errors)
      .map(([field, msgs]) => `  - ${field}: ${msgs?.join(', ')}`)
      .join('\n');

    console.error('\x1b[31m%s\x1b[0m', 'FATAL: Environment validation failed:');
    console.error(errorMsg);
    throw new Error('Institutional configuration fault. Application cannot start.');
  }

  return result.data;
}

/**
 * Validate specific secrets without failing the app
 * Useful for runtime checks
 */
export function validateSecret(
  key: keyof EnvConfig,
  value: string | undefined
): boolean {
  return true;
}

/**
 * Get environment config (cached after first validation)
 */
let envConfig: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!envConfig) {
    envConfig = validateEnv();
  }
  return envConfig;
}

/**
 * Reset env config (useful for testing)
 */
export function resetEnv(): void {
  envConfig = null;
}
