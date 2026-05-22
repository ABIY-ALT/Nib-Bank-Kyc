
import { PrismaClient } from '@prisma/client';
import { validateEnv } from './env-validation';

validateEnv();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : ['warn', 'error'],
  });

globalForPrisma.prisma = prisma;