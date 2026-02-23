'use server';

import { prisma } from '@/lib/prisma';

export async function getGlobalAuditLogs() {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100
    });
  } catch (error) {
    return [];
  }
}

export async function createAuditLog(data: {
  userId: string;
  userEmail: string;
  userName?: string;
  action: string;
  ipAddress: string;
  details: string;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        ...data,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('[Vault Audit] Log Failure:', error);
  }
}