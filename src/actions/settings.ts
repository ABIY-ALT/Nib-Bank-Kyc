
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Institutional standard defaults for seeding.
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

export async function getGlobalSettings() {
  try {
    let settings = await prisma.globalSetting.findUnique({
      where: { id: 'global' }
    });

    if (!settings) {
      settings = await prisma.globalSetting.create({
        data: { 
          id: 'global',
          entityTypes: INITIAL_ENTITY_TYPES,
          documentTypes: INITIAL_DOC_TYPES,
          guidelines: [],
          lastUpdated: new Date()
        }
      });
    }

    return settings;
  } catch (error) {
    console.error("[Settings Action] Fetch Fault:", error);
    return null;
  }
}

export async function updateGlobalSettings(data: any) {
  try {
    const settings = await prisma.globalSetting.update({
      where: { id: 'global' },
      data: {
        entityTypes: data.entityTypes,
        documentTypes: data.documentTypes,
        guidelines: data.guidelines,
        autoEscalation: data.autoEscalation,
        escalationHours: data.escalationHours,
        lastUpdated: new Date()
      }
    });
    
    revalidatePath('/admin/settings');
    revalidatePath('/');
    return settings;
  } catch (error: any) {
    console.error("[Settings Action] Update Fault:", error);
    throw new Error('Institutional database fault during configuration commit.');
  }
}
