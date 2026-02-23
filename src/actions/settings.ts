'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getGlobalSettings() {
  let settings = await prisma.globalSetting.findUnique({
    where: { id: 'global' }
  });

  if (!settings) {
    settings = await prisma.globalSetting.create({
      data: { id: 'global' }
    });
  }

  return settings;
}

export async function updateGlobalSettings(data: any) {
  // Destructure to prevent trying to update the 'id' field which causes Prisma validation errors
  const { id, ...updateData } = data;

  const settings = await prisma.globalSetting.update({
    where: { id: 'global' },
    data: {
      ...updateData,
      lastUpdated: new Date()
    }
  });
  revalidatePath('/admin/settings');
  return settings;
}
