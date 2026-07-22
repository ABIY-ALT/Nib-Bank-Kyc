'use server';

import { prisma } from '@/lib/prisma';
import { signDownloadToken } from '@/lib/security';
import { resolveRbacContext, requireRole, requirePermission } from './rbac';
import { createAuditLog } from './audit';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import { GLOBAL_SCOPE_PERMISSIONS } from '@/lib/jurisdiction';
import { getGlobalSettings } from './settings';

export interface VaultFilters {
  search?: string;
  district?: string;
  branch?: string;
  status?: string;
  category?: string; // INITIAL | AMENDMENT | MEMO | ALL
  officer?: string;
  entityType?: string;
  dateFrom?: string; // ISO string
  dateTo?: string;   // ISO string
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  onlyRetentionEligible?: boolean;
}

export interface VaultCaseItem {
  id: string;
  customerName: string;
  branchName: string;
  districtName: string;
  status: string;
  entityType: string | null;
  isUrgent: boolean;
  isExceptional: boolean;
  isResubmitted: boolean;
  submittedAt: string;
  updatedAt: string;
  assignedTo: { firstName: string; lastName: string } | null;
  totalDocuments: number;
  totalSize: number;
  lastDocumentAt: string | null;
  files: VaultFileItem[];
  daysSinceSubmission: number;
  isRetentionEligible: boolean;
}

interface RetentionConfig {
  enabled: boolean;
  days: number;
  statuses: string[];
}

export interface VaultFileItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  type: string;
  storageKey: string;
  createdAt: string;
  fileUrl: string;
  uploadedBy: { firstName: string; lastName: string } | null;
}

export interface VaultPaginatedResult {
  cases: VaultCaseItem[];
  totalCases: number;
  totalFiles: number;
  totalStorageBytes: number;
  page: number;
  pageSize: number;
  totalPages: number;
  retentionConfig: RetentionConfig;
  // For "select all filtered" - IDs of ALL matching files across all pages
  allFilteredFileIds?: string[];
}

/**
 * Retrieves paginated, filtered, sorted storage vault inventory.
 * All access is derived from server-side session — no client privilege params.
 */
export async function getVaultInventory(filters: VaultFilters = {}): Promise<VaultPaginatedResult> {
  try {
  const ctx = await resolveRbacContext();
  if (!ctx) throw new Error('Authentication required');

  const {
    search = '',
    district = 'all',
    branch = 'all',
    status = 'all',
    category = 'ALL',
    officer = 'all',
    entityType = 'all',
    dateFrom,
    dateTo,
    sortField = 'id',
    sortDir = 'desc',
    page = 1,
    pageSize = 25,
    onlyRetentionEligible = false,
  } = filters;

  // Get retention config
  const settings = await getGlobalSettings();
  const retentionConfig: RetentionConfig = settings?.retentionConfig || { enabled: false, days: 30, statuses: [] };
  const now = new Date();

  // Resolve jurisdiction
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      assignedBranches: true,
      branch: { select: { name: true } },
    },
  });
  if (!user) return emptyResult(page, pageSize);

  const hasGlobalScope =
    ctx.isSuperAdmin || ctx.permissions.some((p) => GLOBAL_SCOPE_PERMISSIONS.has(p));

  // Build memo where clause for jurisdiction
  let jurisdictionClause: any = {};
  if (!hasGlobalScope) {
    const dbAssignedBranches = user.assignedBranches
      ? user.assignedBranches.split(',').map((b: string) => b.trim()).filter(Boolean)
      : [];
    const dbBranchName = user.branch?.name;
    if (dbAssignedBranches.length > 0) {
      jurisdictionClause = { kyc: { branchName: { in: dbAssignedBranches } } };
    } else if (dbBranchName) {
      jurisdictionClause = { kyc: { branchName: dbBranchName } };
    } else {
      return emptyResult(page, pageSize);
    }
  }

  // Build additional KYC-level filters
  const kycFilters: any = {};
  if (district !== 'all') kycFilters.districtName = district;
  if (branch !== 'all') kycFilters.branchName = branch;
  if (status !== 'all') {
    if (status === 'EXCEPTIONAL') {
      kycFilters.isExceptional = true;
    } else {
      kycFilters.status = status;
    }
  }
  if (officer !== 'all') kycFilters.assignedToId = officer;
  if (entityType !== 'all') kycFilters.entityType = entityType;
  if (search) {
    kycFilters.OR = [
      { customerName: { contains: search, mode: 'insensitive' } },
      { id: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (dateFrom || dateTo) {
    kycFilters.submittedAt = {};
    if (dateFrom) kycFilters.submittedAt.gte = new Date(dateFrom);
    if (dateTo) kycFilters.submittedAt.lte = new Date(dateTo);
  }

  // Merge jurisdiction KYC constraint with filters.
  // NOTE: The Vault is a storage management tool — unlike the workflow dashboard,
  // it must surface ALL authorized cases with documents, including:
  //   • Exceptional/governance cases (isExceptional: true)
  //   • Cases approved via the exceptional workflow (status: APPROVED, isExceptional: true)
  //   • Soft-deactivated cases (active: false) that still have memo records
  // Do NOT apply active: true or isExceptional: false here.
  const mergedKycFilter = {
    ...jurisdictionClause?.kyc,
    ...kycFilters,
  };

  const kycListSelect = {
    id: true,
    customerName: true,
    branchName: true,
    status: true,
    districtName: true,
    submittedAt: true,
    updatedAt: true,
    entityType: true,
    isUrgent: true,
    isExceptional: true,
    isResubmitted: true,
    assignedToId: true,
  } as const;

  const needsInMemorySort =
    onlyRetentionEligible ||
    category !== 'ALL' ||
    ['docs', 'size'].includes(sortField);

  let totalCases = 0;
  let totalFilesResult = 0;
  let totalStorageBytes = 0;
  let paginatedIds: string[] = [];

  if (!needsInMemorySort) {
    const isReverseField = sortField === 'daysSinceSubmission';
    const effectiveDir = isReverseField ? (sortDir === 'asc' ? 'desc' : 'asc') : sortDir;
    const dbSortMap: Record<string, string> = {
      id: 'id',
      customer: 'customerName',
      branch: 'branchName',
      district: 'districtName',
      status: 'status',
      submittedAt: 'submittedAt',
      daysSinceSubmission: 'submittedAt',
      updatedAt: 'updatedAt',
    };
    const dbSortKey = dbSortMap[sortField] || 'updatedAt';

    const [totalCasesCount, memoTotals] = await Promise.all([
      prisma.kYC.count({ where: mergedKycFilter }),
      prisma.memo.aggregate({
        where: { kyc: mergedKycFilter },
        _count: { _all: true },
        _sum: { size: true },
      }),
    ]);

    totalCases = totalCasesCount;
    totalFilesResult = memoTotals._count._all;
    totalStorageBytes = memoTotals._sum.size ?? 0;

    const totalPagesForFetch = Math.max(1, Math.ceil(totalCases / pageSize));
    const safePageForFetch = Math.min(Math.max(1, page), totalPagesForFetch);

    const paginatedKycs = await prisma.kYC.findMany({
      where: mergedKycFilter,
      select: kycListSelect,
      orderBy: { [dbSortKey]: effectiveDir },
      skip: (safePageForFetch - 1) * pageSize,
      take: pageSize,
    });

    paginatedIds = paginatedKycs.map((k) => k.id);
  } else {
    const matchingKycs = await prisma.kYC.findMany({
      where: mergedKycFilter,
      select: kycListSelect,
      take: 2000,
    });

    const uniqueKycIds = matchingKycs.map(k => k.id);

    let kycAggregates: Record<string, { count: number, size: number }> = {};
    if (uniqueKycIds.length > 0) {
      const memoAggregates = await prisma.memo.groupBy({
        by: ['kycId'],
        where: { kycId: { in: uniqueKycIds } },
        _count: { _all: true },
        _sum: { size: true },
      });

      kycAggregates = Object.fromEntries(
        memoAggregates.map((row) => [row.kycId, { count: row._count._all, size: row._sum.size ?? 0 }])
      );
    }

    let sortableArray = matchingKycs.map(k => {
      const diffTime = Math.abs(now.getTime() - k.submittedAt.getTime());
      const daysSinceSubmission = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      let isRetentionEligible = false;
      if (retentionConfig.enabled) {
        const statusMatch = retentionConfig.statuses.length === 0 || retentionConfig.statuses.includes(k.status);
        const daysMatch = daysSinceSubmission >= retentionConfig.days;
        isRetentionEligible = statusMatch && daysMatch;
      }
      return {
        ...k,
        totalDocuments: kycAggregates[k.id]?.count || 0,
        totalSize: kycAggregates[k.id]?.size || 0,
        daysSinceSubmission,
        isRetentionEligible,
      };
    });

    if (onlyRetentionEligible) {
      sortableArray = sortableArray.filter(k => k.isRetentionEligible);
    }

    sortableArray.sort((a, b) => {
      let valA = a[sortField as keyof typeof a];
      let valB = b[sortField as keyof typeof b];

      if (sortField === 'docs') { valA = a.totalDocuments; valB = b.totalDocuments; }
      if (sortField === 'size') { valA = a.totalSize; valB = b.totalSize; }
      if (sortField === 'customer') { valA = a.customerName; valB = b.customerName; }
      if (sortField === 'branch') { valA = a.branchName; valB = b.branchName; }
      if (sortField === 'district') { valA = a.districtName; valB = b.districtName; }
      if (sortField === 'daysSinceSubmission') { valA = a.daysSinceSubmission; valB = b.daysSinceSubmission; }

      if (valA === valB) return 0;
      if (valA == null) return sortDir === 'asc' ? -1 : 1;
      if (valB == null) return sortDir === 'asc' ? 1 : -1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      return sortDir === 'asc' ? 1 : -1;
    });

    totalCases = sortableArray.length;
    totalFilesResult = uniqueKycIds.length > 0
      ? Object.values(kycAggregates).reduce((sum, item) => sum + item.count, 0)
      : 0;
    totalStorageBytes = uniqueKycIds.length > 0
      ? Object.values(kycAggregates).reduce((sum, item) => sum + item.size, 0)
      : 0;

    const totalPages = Math.max(1, Math.ceil(totalCases / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    paginatedIds = sortableArray.slice((safePage - 1) * pageSize, safePage * pageSize).map(s => s.id);
  }

  const totalPages = Math.max(1, Math.ceil(totalCases / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Fetch full data for paginated cases
  let cases = await prisma.kYC.findMany({
    where: { id: { in: paginatedIds } },
    include: {
      branch: { include: { district: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      memos: {
        include: {
          uploadedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // Re-order the fetched cases to match the sorted paginatedIds
  const casesMap = new Map(cases.map(c => [c.id, c]));
  cases = paginatedIds.map(id => casesMap.get(id)!).filter(Boolean);

  // Transform to response format
  const transformedCases: VaultCaseItem[] = cases.map((kyc) => {
    // Sort to find the baseline "Initial" timestamp
    const sortedMemos = [...kyc.memos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstUploadTime = sortedMemos.length > 0 ? sortedMemos[0].createdAt.getTime() : 0;

    const files: VaultFileItem[] = kyc.memos.map((m) => {
      const isMemo = m.type === 'GOVERNANCE_MEMO';
      // Any non-memo uploaded more than 30 minutes after the first file is an Amendment
      const isAmendment = !isMemo && (m.createdAt.getTime() - firstUploadTime > 1000 * 60 * 30);
      let cat = 'INITIAL';
      if (isMemo) cat = 'MEMO';
      else if (isAmendment) cat = 'AMENDMENT';

      return {
        id: m.id,
        name: m.name,
        originalName: m.originalName,
        mimeType: m.mimeType,
        size: m.size,
        category: cat,
        type: m.type,
        storageKey: m.storageKey,
        createdAt: m.createdAt.toISOString(),
        fileUrl: `/api/memos/${signDownloadToken(m.id)}`,
        uploadedBy: m.uploadedBy,
      };
    });

    // Apply category filter at file level
    const filteredFiles =
      category === 'ALL' ? files : files.filter((f) => f.category === category);

    const totalSize = filteredFiles.reduce((s, f) => s + (f.size || 0), 0);
    const lastDoc = filteredFiles.length > 0 ? filteredFiles[0].createdAt : null;

    // Calculate days since submission and retention eligibility
    const submissionDate = new Date(kyc.submittedAt);
    const diffTime = Math.abs(now.getTime() - submissionDate.getTime());
    const daysSinceSubmission = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let isRetentionEligible = false;
    if (retentionConfig.enabled) {
      const statusMatch = retentionConfig.statuses.length === 0 || retentionConfig.statuses.includes(kyc.status);
      const daysMatch = daysSinceSubmission >= retentionConfig.days;
      isRetentionEligible = statusMatch && daysMatch;
    }

    return {
      id: kyc.id,
      customerName: kyc.customerName,
      branchName: kyc.branchName,
      districtName: kyc.branch?.district?.name || kyc.districtName || 'Central',
      status: kyc.status,
      entityType: kyc.entityType,
      isUrgent: kyc.isUrgent,
      isExceptional: kyc.isExceptional,
      isResubmitted: kyc.isResubmitted,
      submittedAt: kyc.submittedAt.toISOString(),
      updatedAt: kyc.updatedAt.toISOString(),
      assignedTo: kyc.assignedTo,
      totalDocuments: filteredFiles.length,
      totalSize,
      lastDocumentAt: lastDoc,
      files: filteredFiles,
      daysSinceSubmission,
      isRetentionEligible,
    };
  });

  // Filter out cases with no files after category filter
  const finalCases =
    category === 'ALL' ? transformedCases : transformedCases.filter((c) => c.files.length > 0);

  return {
    cases: finalCases,
    totalCases,
    totalFiles: totalFilesResult,
    totalStorageBytes,
    page: safePage,
    pageSize,
    totalPages,
    retentionConfig,
  };
  } catch (error: any) {
    // Surface a safe empty result instead of propagating an uncaught exception
    // that would trigger "Failed to load vault data" on the client.
    console.error('[VaultInventory] Unexpected error:', error?.message || error);
    return emptyResult(filters.page ?? 1, filters.pageSize ?? 25);
  }
}

/**
 * Returns all file IDs matching the current filters (for "select all filtered").
 */
export async function getAllFilteredFileIds(filters: VaultFilters = {}): Promise<string[]> {
  const ctx = await resolveRbacContext();
  if (!ctx) throw new Error('Authentication required');

  const { search = '', district = 'all', branch = 'all', status = 'all', officer = 'all', entityType = 'all', dateFrom, dateTo } = filters;

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { assignedBranches: true, branch: { select: { name: true } } },
  });
  if (!user) return [];

  const hasGlobalScope =
    ctx.isSuperAdmin || ctx.permissions.some((p) => GLOBAL_SCOPE_PERMISSIONS.has(p));

  let jurisdictionClause: any = {};
  if (!hasGlobalScope) {
    const dbAssignedBranches = user.assignedBranches
      ? user.assignedBranches.split(',').map((b: string) => b.trim()).filter(Boolean)
      : [];
    const dbBranchName = user.branch?.name;
    if (dbAssignedBranches.length > 0) {
      jurisdictionClause = { kyc: { branchName: { in: dbAssignedBranches } } };
    } else if (dbBranchName) {
      jurisdictionClause = { kyc: { branchName: dbBranchName } };
    } else {
      return [];
    }
  }

  const kycFilters: any = {};
  if (district !== 'all') kycFilters.districtName = district;
  if (branch !== 'all') kycFilters.branchName = branch;
  if (status !== 'all') kycFilters.status = status;
  if (officer !== 'all') kycFilters.assignedToId = officer;
  if (entityType !== 'all') kycFilters.entityType = entityType;
  if (search) {
    kycFilters.OR = [
      { customerName: { contains: search, mode: 'insensitive' } },
      { id: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (dateFrom || dateTo) {
    kycFilters.submittedAt = {};
    if (dateFrom) kycFilters.submittedAt.gte = new Date(dateFrom);
    if (dateTo) kycFilters.submittedAt.lte = new Date(dateTo);
  }

  const memos = await prisma.memo.findMany({
    where: {
      ...jurisdictionClause,
      kyc: { ...jurisdictionClause?.kyc, ...kycFilters },
    },
    select: { id: true },
    take: 10000,
  });

  return memos.map((m) => m.id);
}

/**
 * Returns unique status values from KYC table for filter dropdowns.
 */
export async function getVaultFilterOptions() {
  const ctx = await resolveRbacContext();
  if (!ctx) throw new Error('Authentication required');

  const [statuses, settings, officers] = await Promise.all([
    prisma.kYC.findMany({
      select: { status: true },
      distinct: ['status'],
      orderBy: { status: 'asc' },
    }),
    prisma.globalSetting.findUnique({
      where: { id: 'global' },
      select: { entityTypes: true },
    }),
    prisma.user.findMany({
      where: {
        assignedCases: { some: {} } // Users who have assigned cases
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    })
  ]);

  let entityTypesList: { id: string, label: string }[] = [];
  if (settings?.entityTypes && Array.isArray(settings.entityTypes)) {
    entityTypesList = settings.entityTypes as { id: string, label: string }[];
  }

  const parsedStatuses = statuses.map((s) => s.status).filter(Boolean);
  if (!parsedStatuses.includes('EXCEPTIONAL')) {
    parsedStatuses.push('EXCEPTIONAL');
  }

  return {
    statuses: parsedStatuses,
    entityTypes: entityTypesList,
    officers: officers.map(o => ({ id: o.id, name: `${o.firstName} ${o.lastName}` })),
  };
}

function emptyResult(page: number, pageSize: number): VaultPaginatedResult {
  return { 
    cases: [], 
    totalCases: 0, 
    totalFiles: 0, 
    totalStorageBytes: 0, 
    retentionConfig: { enabled: false, days: 30, statuses: [] }, 
    page, 
    pageSize, 
    totalPages: 0 
  };
}

/**
 * Permanently deletes a KYC case and all its files from physical storage and DB.
 */
export async function deleteKycCaseAndFiles(kycId: string) {
  const ctx = await requirePermission('PURGE_VAULT_STORAGE', 'DELETE_KYC_CASE');

  try {
    const kyc = await prisma.kYC.findUnique({
      where: { id: kycId },
      include: { memos: true },
    });

    if (!kyc) throw new Error('Case not found');

    // Delete files from physical storage
    const { deleteSecureUploadedFile } = await import('@/lib/secure-file-storage');
    for (const memo of kyc.memos) {
      try {
        const tier = memo.storageTier === 'ARCHIVE' ? 'ARCHIVE' : 'PRIMARY';
        await deleteSecureUploadedFile(memo.storageKey, false, tier);
      } catch (e) {
        // Continue even if file is missing physically
      }
    }

    // DB deletion in transaction to ensure integrity
    await prisma.$transaction(async (tx) => {
      await tx.memo.deleteMany({ where: { kycId } });
      await tx.kYC.delete({ where: { id: kycId } });
    });

    await createAuditLog({
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'DELETE_KYC_CASE',
      details: `Super Admin permanently deleted case: ${kycId} with ${kyc.memos.length} assets.`,
      severity: 'CRITICAL',
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: getSafeErrorMessage(error) };
  }
}
