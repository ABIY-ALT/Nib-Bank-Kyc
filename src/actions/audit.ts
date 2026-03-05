'use server';

import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

/**
 * Resolves the client IP address from request headers.
 */
async function getClientIp() {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    return headerList.get('x-real-ip') || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

export async function getGlobalAuditLogs() {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 200 // Increased limit for better oversight
    });
  } catch (error) {
    return [];
  }
}

export async function createAuditLog(data: {
  userId: string | null;
  userEmail: string;
  userName?: string;
  action: string;
  details: string;
  kycId?: string;
  metadata?: any;
}) {
  try {
    const ipAddress = await getClientIp();
    return await prisma.auditLog.create({
      data: {
        ...data,
        ipAddress,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('[Vault Audit] Log Failure:', error);
  }
}
