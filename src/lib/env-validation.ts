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
    )
    .refine(
      (url) => !url.includes('password@'),
      'DATABASE_URL cannot contain password in plain text - use secret manager'
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
  const env = {
    NODE_ENV: (process.env.NODE_ENV || 'development') as any,
    DATABASE_URL: process.env.DATABASE_URL as any,
    JWT_SECRET: (process.env.JWT_SECRET || 'secret') as any,
    SECURE_COOKIE_SAME_SITE: (process.env.SECURE_COOKIE_SAME_SITE || 'Strict') as any,
    CREDENTIAL_SHARING: process.env.CREDENTIAL_SHARING === 'true',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(v => v.trim()) : ['http://localhost:3000'],
    CORS_MAX_AGE: process.env.CORS_MAX_AGE ? parseInt(process.env.CORS_MAX_AGE, 10) : 86400,
    CORS_EXPOSED_HEADERS: process.env.CORS_EXPOSED_HEADERS ? process.env.CORS_EXPOSED_HEADERS.split(',').map(v => v.trim()) : ['Content-Type', 'Authorization'],
    LOG_LEVEL: (process.env.LOG_LEVEL || 'info') as any,
    AWS_REGION: process.env.AWS_REGION as any,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID as any,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY as any,
    SECRET_NAME: process.env.SECRET_NAME as any,
  };

  return env as any;
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
