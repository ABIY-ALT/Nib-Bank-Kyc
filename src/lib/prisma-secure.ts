import { PrismaClient } from '@prisma/client';
import { getSecret } from './secrets-loader';
import { safeLog } from './logging-redaction';

/**
 * Secure Prisma Client Factory
 * 
 * SECURITY:
 * - Database URL loaded from secure source only
 * - No hardcoded connection strings
 * - Proper error handling without exposing credentials
 * - Connection pooling configured
 */

const globalForPrismaSecure = global as unknown as { prismaSecure: PrismaClient };

/**
 * Initialize Prisma with securely loaded connection string
 */
export async function initializePrisma(): Promise<PrismaClient> {
  try {
    if (globalForPrismaSecure.prismaSecure) {
      return globalForPrismaSecure.prismaSecure;
    }

    const databaseUrl = await getSecret('DATABASE_URL');

    const prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      errorFormat: 'pretty',
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });

    // Setup event handlers for queries (redacted logging)
    (prismaClient as any).$on('query', (event: any) => {
      safeLog.debug('Database query', {
        duration: `${event.duration}ms`,
        query: event.query.substring(0, 100) + '...', // Truncate long queries
      });
    });

    (prismaClient as any).$on('error', (event: any) => {
      safeLog.error('Database error', {
        message: event.message,
        // Never log the actual error which might contain credentials
      });
    });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrismaSecure.prismaSecure = prismaClient;
    }

    safeLog.info('✓ Prisma client initialized');
    return prismaClient;
  } catch (error) {
    safeLog.error('Failed to initialize Prisma', {
      error: String(error),
    });
    throw error;
  }
}

/**
 * Get Prisma client (lazy initialize)
 */
export async function getPrisma(): Promise<PrismaClient> {
  if (!globalForPrismaSecure.prismaSecure) {
    return initializePrisma();
  }
  return globalForPrismaSecure.prismaSecure;
}

/**
 * Disconnect Prisma client
 */
export async function disconnectPrisma(): Promise<void> {
  if (globalForPrismaSecure.prismaSecure) {
    await globalForPrismaSecure.prismaSecure.$disconnect();
    if (process.env.NODE_ENV !== 'production') {
      (globalForPrismaSecure as any).prismaSecure = null;
    }
  }
}

/**
 * Export default for backward compatibility
 */
export default getPrisma;
