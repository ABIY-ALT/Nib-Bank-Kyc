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

/**
 * Retrieves audit logs with server-side pagination and filtering.
 */
export async function getGlobalAuditLogs(params: { 
  page?: number; 
  limit?: number; 
  search?: string 
} = {}) {
  const { page = 1, limit = 10, search = "" } = params;
  const skip = (page - 1) * limit;

  const where = search ? {
    OR: [
      { userEmail: { contains: search, mode: 'insensitive' as const } },
      { action: { contains: search, mode: 'insensitive' as const } },
      { details: { contains: search, mode: 'insensitive' as const } },
      { userName: { contains: search, mode: 'insensitive' as const } },
      { ipAddress: { contains: search, mode: 'insensitive' as const } },
    ]
  } : {};

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: skip,
      }),
      prisma.auditLog.count({ where })
    ]);

    return { logs, total };
  } catch (error) {
    console.error('[Audit Action] Fetch Error:', error);
    return { logs: [], total: 0 };
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
