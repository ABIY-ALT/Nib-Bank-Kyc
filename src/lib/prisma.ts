
import { PrismaClient } from '@prisma/client';
import { validateEnv } from './env-validation';

// SECURITY: Mandatory environment validation at startup
// This ensures that JWT_SECRET and other critical secrets are properly configured
validateEnv();

const isProduction = process.env.NODE_ENV === 'production';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: isProduction
      ? ['error']                    // In production: only log errors
      : ['info', 'warn', 'error'],   // In development: log info, warnings, errors
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
