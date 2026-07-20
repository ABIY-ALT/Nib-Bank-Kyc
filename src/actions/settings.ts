
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Institutional standard defaults for seeding.
 */
const INITIAL_ENTITY_TYPES = [
  { id: "individual", label: "Individual" },
  { id: "joint", label: "Joint" },
  { id: "sole_proprietorship", label: "Sole Proprietorship" },
  { id: "corporate", label: "Corporate" },
  { id: "associations_organisations", label: "Associations & Organisations" },
  { id: "institutions", label: "Institutions" },
  { id: "ngos", label: "NGOs" },
  { id: "other", label: "Other" },
];

const INITIAL_DOC_TYPES = [
  { id: "national_id_verified", label: "National ID (Fayda) – Verified" },
  { id: "account_opening_form", label: "Account Opening Form" },
  { id: "joint_account_undertaking", label: "Joint Account Undertaking" },
  { id: "witness_id_copy", label: "Witness ID copy" },
  { id: "court_appointment_letter", label: "Court appointment letter" },
  { id: "business_license_employment_letter", label: "Business license or employment letter showing leadership position" },
  { id: "renewed_business_license", label: "Renewed business license" },
  { id: "valid_student_id_card", label: "Valid student ID card" },
  { id: "tin_certificate", label: "TIN certificate" },
  { id: "business_registration_certificate", label: "Business registration certificate" },
  { id: "memorandum_articles_of_association", label: "Memorandum & Articles of Association (attested or system‑verified)" },
  { id: "application_letter_company_stamp", label: "Application letter with company stamp" },
  { id: "supporting_letter_higher_authority", label: "Supporting letter from higher authority" },
  { id: "employer_letter_confirming_position", label: "Letter from employer confirming position (CEO, GM, DGM, Finance Manager)" },
  { id: "proof_of_foreign_residence", label: "Proof of foreign residence" },
  { id: "valid_foreign_passport", label: "Valid foreign passport" },
  { id: "valid_ethiopian_work_or_resident_permit", label: "Valid Ethiopian work or resident permit" },
  { id: "refuge_id", label: "Refuge ID" },
];

const LEGACY_ENTITY_TYPE_MAP: Record<string, string | null> = {
  individual: 'individual',
  joint: 'joint',
  sole_proprietorship: 'sole_proprietorship',
  corporate: 'corporate',
  association: 'associations_organisations',
  institutions: 'institutions',
  ngo: 'ngos',
  foreign_ngo: 'ngos',
  foreign_employment_agency: null,
  other: 'other',
};

function normalizeEntityTypeId(rawId: string) {
  return rawId
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeStorageQuotaGb(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.floor(parsed);
}

function extractStorageQuotaGb(guidelines: any[] | undefined) {
  const quotaEntry = Array.isArray(guidelines)
    ? guidelines.find((entry: any) => entry?.kind === 'storageQuota' || entry?.id === '__storage_quota__')
    : null;

  if (!quotaEntry) return 50;

  return normalizeStorageQuotaGb(quotaEntry.storageQuotaGb ?? quotaEntry.value);
}

interface DocumentRetentionConfig {
  enabled: boolean;
  days: number;
  statuses: string[];
}

const defaultRetentionConfig: DocumentRetentionConfig = {
  enabled: false,
  days: 30,
  statuses: []
};

function extractRetentionConfig(guidelines: any[] | undefined): DocumentRetentionConfig {
  const retentionEntry = Array.isArray(guidelines)
    ? guidelines.find((entry: any) => entry?.kind === 'documentRetention' || entry?.id === '__document_retention__')
    : null;

  if (!retentionEntry) return defaultRetentionConfig;

  return {
    enabled: !!retentionEntry.enabled,
    days: Number(retentionEntry.days) || 30,
    statuses: Array.isArray(retentionEntry.statuses) ? retentionEntry.statuses : []
  };
}

function buildPersistedGuidelines(guidelines: any[] | undefined, storageQuotaGb: number, retentionConfig: DocumentRetentionConfig) {
  const visibleGuidelines = (Array.isArray(guidelines) ? guidelines : []).filter((entry: any) => {
    return entry?.kind !== 'storageQuota' && entry?.id !== '__storage_quota__' && 
           entry?.kind !== 'documentRetention' && entry?.id !== '__document_retention__';
  });

  return [
    ...visibleGuidelines,
    {
      id: '__storage_quota__',
      kind: 'storageQuota',
      storageQuotaGb,
      title: '',
      description: '',
      type: 'info'
    },
    {
      id: '__document_retention__',
      kind: 'documentRetention',
      ...retentionConfig,
      title: '',
      description: '',
      type: 'info'
    }
  ];
}

function mergeEntityTypes(existing: any[] | undefined) {
  if (!Array.isArray(existing) || existing.length === 0) {
    return INITIAL_ENTITY_TYPES;
  }

  const mappedExisting: Record<string, any> = {};

  for (const item of existing) {
    const normalizedId = normalizeEntityTypeId(item.id || '');
    const targetId = LEGACY_ENTITY_TYPE_MAP[normalizedId];
    if (!targetId) continue;
    mappedExisting[targetId] = { ...INITIAL_ENTITY_TYPES.find((type) => type.id === targetId) };
  }

  return INITIAL_ENTITY_TYPES.map((type) => mappedExisting[type.id] || type);
}

function mergeDocumentTypes(existing: any[] | undefined) {
  if (!Array.isArray(existing) || existing.length === 0) {
    return INITIAL_DOC_TYPES;
  }

  const existingById = new Map(existing.map((item: any) => [item.id, item]));
  const merged: any[] = [];

  for (const defaultType of INITIAL_DOC_TYPES) {
    const existingType = existingById.get(defaultType.id);
    if (existingType) {
      merged.push({ ...defaultType, label: existingType.label || defaultType.label });
      existingById.delete(defaultType.id);
    } else {
      merged.push(defaultType);
    }
  }

  for (const extraType of existing) {
    if (!INITIAL_DOC_TYPES.some((defaultType) => defaultType.id === extraType.id)) {
      merged.push(extraType);
    }
  }

  return merged;
}

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
          guidelines: buildPersistedGuidelines([], 50, defaultRetentionConfig),
          lastUpdated: new Date()
        }
      });
    } else {
      const mergedEntityTypes = mergeEntityTypes(settings.entityTypes as any[]);
      const mergedDocumentTypes = mergeDocumentTypes(settings.documentTypes as any[]);
      if (JSON.stringify(mergedEntityTypes) !== JSON.stringify(settings.entityTypes) || JSON.stringify(mergedDocumentTypes) !== JSON.stringify(settings.documentTypes)) {
        settings = await prisma.globalSetting.update({
          where: { id: 'global' },
          data: {
            entityTypes: mergedEntityTypes,
            documentTypes: mergedDocumentTypes,
            lastUpdated: new Date()
          }
        });
      }
    }

    const storageQuotaGb = extractStorageQuotaGb(settings.guidelines as any[]);
    const retentionConfig = extractRetentionConfig(settings.guidelines as any[]);

    return {
      ...settings,
      guidelines: (Array.isArray(settings.guidelines) ? settings.guidelines : []).filter((entry: any) => entry?.kind !== 'storageQuota' && entry?.id !== '__storage_quota__' && entry?.kind !== 'documentRetention' && entry?.id !== '__document_retention__'),
      storageQuotaGb,
      retentionConfig
    };
  } catch (error) {
    return null;
  }
}

export async function updateGlobalSettings(data: any) {
  try {
    const storageQuotaGb = normalizeStorageQuotaGb(data.storageQuotaGb);
    const retentionConfig: DocumentRetentionConfig = {
      enabled: !!data.retentionConfig?.enabled,
      days: Number(data.retentionConfig?.days) || 30,
      statuses: Array.isArray(data.retentionConfig?.statuses) ? data.retentionConfig.statuses : []
    };
    const settings = await prisma.globalSetting.update({
      where: { id: 'global' },
      data: {
        entityTypes: data.entityTypes,
        documentTypes: data.documentTypes,
        guidelines: buildPersistedGuidelines(data.guidelines, storageQuotaGb, retentionConfig),
        autoEscalation: data.autoEscalation,
        escalationHours: data.escalationHours,
        lastUpdated: new Date()
      }
    });
    
    revalidatePath('/admin/settings');
    revalidatePath('/');
    return {
      ...settings,
      guidelines: (Array.isArray(settings.guidelines) ? settings.guidelines : []).filter((entry: any) => entry?.kind !== 'storageQuota' && entry?.id !== '__storage_quota__' && entry?.kind !== 'documentRetention' && entry?.id !== '__document_retention__'),
      storageQuotaGb,
      retentionConfig
    };
  } catch (error: any) {
    throw new Error('Institutional database fault during configuration commit.');
  }
}
