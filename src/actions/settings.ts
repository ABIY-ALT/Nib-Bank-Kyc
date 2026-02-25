
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Retrieves the global institutional configuration.
 */
export async function getGlobalSettings() {
  try {
    let settings = await prisma.globalSetting.findUnique({
      where: { id: 'global' }
    });

    if (!settings) {
      settings = await prisma.globalSetting.create({
        data: { id: 'global' }
      });
    }

    return settings;
  } catch (error) {
    console.error('[Vault Settings] Retrieval Error:', error);
    return null;
  }
}

/**
 * Updates the global institutional configuration.
 * Strips non-schema fields to prevent Prisma validation errors.
 */
export async function updateGlobalSettings(data: any) {
  // Destructure to remove 'id' and 'updatedBy' which may not exist in the DB model
  const { id, updatedBy, ...updateData } = data;

  try {
    const settings = await prisma.globalSetting.update({
      where: { id: 'global' },
      data: {
        ...updateData,
        lastUpdated: new Date()
      }
    });
    
    revalidatePath('/admin/settings');
    revalidatePath('/');
    return settings;
  } catch (error: any) {
    console.error('[Vault Settings] Update Failure:', error);
    throw new Error('Institutional database fault during configuration commit.');
  }
}
