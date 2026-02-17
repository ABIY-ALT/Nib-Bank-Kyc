'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { FindingCategory, FindingSeverity } from '@prisma/client';

export async function getFindings() {
  try {
    return await prisma.finding.findMany({
      where: { active: true },
      orderBy: { code: 'asc' }
    });
  } catch (error) {
    console.error('[SQL Findings] Fetch Error:', error);
    return [];
  }
}

export async function upsertFinding(data: any) {
  try {
    const finding = await prisma.finding.upsert({
      where: { id: data.id || 'new-id' },
      update: {
        code: data.code,
        title: data.title,
        description: data.description,
        category: data.category as FindingCategory,
        severity: data.severity as FindingSeverity,
        applicableTo: data.applicableTo,
        active: data.active ?? true,
        source: data.source || 'manual'
      },
      create: {
        id: data.id || undefined,
        code: data.code,
        title: data.title,
        description: data.description,
        category: data.category as FindingCategory,
        severity: data.severity as FindingSeverity,
        applicableTo: data.applicableTo,
        active: data.active ?? true,
        source: data.source || 'manual'
      }
    });
    revalidatePath('/kyc-fq-reference');
    return { success: true, finding };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteFinding(id: string) {
  try {
    await prisma.finding.delete({ where: { id } });
    revalidatePath('/kyc-fq-reference');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function seedFindings(findings: any[]) {
  try {
    for (const f of findings) {
      await prisma.finding.upsert({
        where: { code: f.code },
        update: { ...f, category: f.category.toUpperCase(), severity: f.severity.toUpperCase() },
        create: { ...f, category: f.category.toUpperCase(), severity: f.severity.toUpperCase() }
      });
    }
    revalidatePath('/kyc-fq-reference');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
