
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Institutional standard defaults.
 * These are provisioned into the database if no configuration exists.
 */
const INITIAL_ENTITY_TYPES = [
  { id: "individual", label: "Individual" },
  { id: "company", label: "Company" },
  { id: "association", label: "Association" },
  { id: "foreign_ngo", label: "Foreign NGO" },
  { id: "foreign_employment_agency", label: "Foreign Employment Agency" },
];

const INITIAL_DOC_TYPES = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "incorporation", label: "Certificate of Incorporation" },
  { id: "tax_cert", label: "Tax Certificate" },
  { id: "other", label: "Other Document" },
];

/**
 * Retrieves the global institutional configuration.
 * Hardened: Provisions defaults into the Vault if the record is missing.
 */
export async function getGlobalSettings() {
  try {
    let settings = await prisma.globalSetting.findUnique({
      where: { id: 'global' }
    });

    if (!settings) {
      settings = await prisma.globalSetting.create({
        data: { 
          id: 'global',
          entityTypes: JSON.stringify(INITIAL_ENTITY_TYPES),
          documentTypes: JSON.stringify(INITIAL_DOC_TYPES),
          guidelines: JSON.stringify([]),
          lastUpdated: new Date()
        }
      });
    }

    // Ensure JSON fields are parsed for the UI
    return {
      ...settings,
      entityTypes: settings.entityTypes ? JSON.parse(settings.entityTypes as string) : [],
      documentTypes: settings.documentTypes ? JSON.parse(settings.documentTypes as string) : [],
      guidelines: settings.guidelines ? JSON.parse(settings.guidelines as string) : []
    };
  } catch (error) {
    console.error('[Vault Settings] Retrieval Error:', error);
    return null;
  }
}

/**
 * Updates the global institutional configuration.
 */
export async function updateGlobalSettings(data: any) {
  const { id, updatedBy, ...updateData } = data;

  try {
    const settings = await prisma.globalSetting.update({
      where: { id: 'global' },
      data: {
        ...updateData,
        // Ensure arrays are stringified for PostgreSQL/Storage
        entityTypes: updateData.entityTypes ? JSON.stringify(updateData.entityTypes) : undefined,
        documentTypes: updateData.documentTypes ? JSON.stringify(updateData.documentTypes) : undefined,
        guidelines: updateData.guidelines ? JSON.stringify(updateData.guidelines) : undefined,
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
