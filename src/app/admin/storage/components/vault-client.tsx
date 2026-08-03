'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { 
  getVaultInventory, 
  getAllFilteredFileIds, 
  getVaultFilterOptions, 
  deleteKycCaseAndFiles,
  VaultFilters, 
  VaultPaginatedResult,
  VaultCaseItem,
  VaultFileItem
} from '@/actions/storage-vault';
import { deleteInstitutionalFile } from '@/actions/storage';
import { 
  copyCasesToArchive, 
  cutCasesToArchive, 
  restoreCasesFromArchive, 
  deleteCasesFromArchive 
} from '@/actions/archive-tiering';
import { getDistricts, getBranches } from '@/actions/hierarchy';
import { format } from 'date-fns';
import JSZip from 'jszip';
import { resolveDownloadFileName } from '@/lib/documents';
import { cn, extractAccountNumber, maskAccountNumber } from '@/lib/utils';
import { getGlobalSettings } from '@/actions/settings';
import { DatePickerWithRange, DateRange } from '@/components/ui/date-range-picker';
import { 
  Card, CardContent, CardHeader, CardTitle 
} from '@/components/ui/card';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  HardDrive, Search, Download, Trash2, FileText, Building2, 
  Loader2, ShieldCheck, RotateCcw, ChevronDown, ChevronUp, ChevronRight,
  Map, Archive, FolderOpen, Folder, ArrowRight, User as UserIcon, RefreshCw, Bookmark, SlidersHorizontal, Settings, FileSpreadsheet, Zap, AlertTriangle, Clock
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function VaultClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const canManageVaultStorage = hasPermission('MANAGE_VAULT_STORAGE');
  const canPurgeStorage = hasPermission('PURGE_VAULT_STORAGE');

  // Metadata State
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [filterOptions, setFilterOptions] = useState<{statuses: string[], entityTypes: {id: string, label: string}[], officers: any[]}>({statuses: [], entityTypes: [], officers: []});

  // Filters State
  const [filters, setFilters] = useState<VaultFilters>({
    search: '',
    district: 'all',
    branch: 'all',
    status: 'all',
    category: 'ALL',
    officer: 'all',
    entityType: 'all',
    sortField: 'updatedAt',
    sortDir: 'desc',
    page: 1,
    pageSize: 25,
    onlyRetentionEligible: false,
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [savedFilters, setSavedFilters] = useState<{name: string, filters: VaultFilters}[]>([]);

  // Data State
  const [data, setData] = useState<VaultPaginatedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageQuotaGb, setStorageQuotaGb] = useState(50);
  
  // Selection & UI State
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [downloadedFileIds, setDownloadedFileIds] = useState<Set<string>>(new Set());
  const [downloadedCaseBundles, setDownloadedCaseBundles] = useState<Set<string>>(new Set());
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set());
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    customer: true, branch: true, status: true, type: true, docs: true, size: true, updated: true, days: true, retention: true
  });

  // Action State
  const [isZipping, setIsZipping] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{type: string, ids: string[], kycId?: string, isLastFile?: boolean}|null>(null);
  const [presetSaveOpen, setPresetSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Initialize
  useEffect(() => {
    if (!permissionsLoading && !canManageVaultStorage) {
      router.push('/unauthorized?required=MANAGE_VAULT_STORAGE');
    }
  }, [canManageVaultStorage, permissionsLoading, router]);

  useEffect(() => {
    if (canManageVaultStorage) {
      Promise.all([getDistricts(), getBranches(), getVaultFilterOptions(), getGlobalSettings()]).then(([d, b, opts, settings]) => {
        setDistricts(d || []);
        setBranches(b || []);
        setFilterOptions(opts);
        const nextQuota = Number(settings?.storageQuotaGb ?? 50);
        setStorageQuotaGb(Number.isFinite(nextQuota) && nextQuota > 0 ? nextQuota : 50);
      });
      // Load saved filters
      const saved = localStorage.getItem('kyc_vault_saved_filters');
      if (saved) setSavedFilters(JSON.parse(saved));
    }
  }, [canManageVaultStorage]);

  const loadData = useCallback(async () => {
    if (!canManageVaultStorage) return;
    setLoading(true);
    try {
      const activeFilters = { ...filters };
      if (dateRange?.from) activeFilters.dateFrom = dateRange.from.toISOString();
      if (dateRange?.to) activeFilters.dateTo = dateRange.to.toISOString();
      
      const res = await getVaultInventory(activeFilters);
      setData(res);
      // Clean up selections that are no longer visible on this page (unless we implemented a global selection store)
      // For now, keep it simple: keep selections across pages
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load vault data.' });
    } finally {
      setLoading(false);
    }
  }, [filters, dateRange, canManageVaultStorage, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived
  const availableBranchesForDistrict = useMemo(() => {
    if (filters.district === 'all') return branches;
    return branches.filter(b => b.district?.name === filters.district);
  }, [branches, filters.district]);

  const groupedDistricts = useMemo(() => {
    if (!data?.cases) return [];
    
    const districts: Record<string, {
      districtName: string,
      branches: Record<string, { branchName: string, cases: VaultCaseItem[] }>
    }> = {};

    data.cases.forEach(c => {
      const distName = c.districtName || 'Central';
      if (!districts[distName]) {
        districts[distName] = { districtName: distName, branches: {} };
      }
      
      const brName = c.branchName;
      if (!districts[distName].branches[brName]) {
        districts[distName].branches[brName] = { branchName: brName, cases: [] };
      }
      
      districts[distName].branches[brName].cases.push(c);
    });

    return Object.values(districts).map(d => ({
      districtName: d.districtName,
      branches: Object.values(d.branches).sort((a, b) => a.branchName.localeCompare(b.branchName))
    })).sort((a, b) => a.districtName.localeCompare(b.districtName));
  }, [data]);

  const toggleAllFolders = () => {
    const allDistricts = groupedDistricts.map(d => d.districtName);
    const allBranches = groupedDistricts.flatMap(d => d.branches.map(b => `${d.districtName}-${b.branchName}`));
    
    if (expandedDistricts.size === allDistricts.length && expandedBranches.size === allBranches.length) {
      setExpandedDistricts(new Set());
      setExpandedBranches(new Set());
    } else {
      setExpandedDistricts(new Set(allDistricts));
      setExpandedBranches(new Set(allBranches));
    }
  };

  // Handlers
  const handleFilterChange = (key: keyof VaultFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? value : 1 }));
  };

  const toggleSort = (field: string) => {
    setFilters(prev => ({
      ...prev,
      sortField: field,
      sortDir: prev.sortField === field && prev.sortDir === 'desc' ? 'asc' : 'desc',
      page: 1
    }));
  };

  const handleSelectCase = (id: string) => {
    setSelectedCaseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    if (!data) return;
    const allOnPage = data.cases.map(c => c.id);
    const allSelected = allOnPage.every(id => selectedCaseIds.has(id));
    setSelectedCaseIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allOnPage.forEach(id => next.delete(id));
      } else {
        allOnPage.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleSelectAllFiltered = async () => {
    if (!data) return;
    try {
      setLoading(true);
      const activeFilters = { ...filters };
      if (dateRange?.from) activeFilters.dateFrom = dateRange.from.toISOString();
      if (dateRange?.to) activeFilters.dateTo = dateRange.to.toISOString();
      // Wait, getAllFilteredFileIds returns file IDs, not Case IDs.
      // We need all Case IDs. Let's just adjust the action or use it.
      // Actually, since we only export the currently visible or selected ones, maybe we just clear selection and alert.
      toast({ title: 'Feature pending', description: 'Select all filtered cases is complex, selecting page for now.' });
      handleSelectAllOnPage();
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentFilters = () => {
    setPresetName('');
    setPresetSaveOpen(true);
  };

  const confirmSavePreset = () => {
    if (presetName.trim()) {
      const newSaved = [...savedFilters, { name: presetName.trim(), filters: {...filters} }];
      setSavedFilters(newSaved);
      localStorage.setItem('kyc_vault_saved_filters', JSON.stringify(newSaved));
      toast({ title: 'Saved', description: 'Filter preset saved.' });
      setPresetSaveOpen(false);
    }
  };

  const applySavedFilter = (f: VaultFilters) => {
    setFilters(f);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Bulk Actions
  const handleExportCSV = () => {
    if (!data) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Case ID,Customer Name,Branch,Status,Type,Urgent,Resubmitted,Documents,Total Size,Last Updated\n";
    
    data.cases.forEach(c => {
      const row = [
        c.id,
        `"${c.customerName}"`,
        `"${c.branchName}"`,
        c.status,
        c.entityType || 'N/A',
        c.isUrgent ? 'Yes' : 'No',
        c.isResubmitted ? 'Yes' : 'No',
        c.totalDocuments,
        c.totalSize,
        c.updatedAt
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vault_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBundleDownload = async (casesToDownload: any[]) => {
    if (casesToDownload.length === 0 || isZipping) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const bundleName = `NIB_STORAGE_BUNDLE_${timestamp}`;
      const rootFolder = zip.folder(bundleName);

      toast({
        title: "Starting Bundle Extraction",
        description: `Zipping files for ${casesToDownload.length} cases...`,
      });

      for (const kycCase of casesToDownload) {
        const customerName = kycCase.customerName || 'Unknown_Customer';
        const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
        const caseFolderName = `${kycCase.id}_${safeCustomerName}`;
        const caseFolder = rootFolder?.folder(caseFolderName);
        const docFolder = caseFolder?.folder("Documents");

        for (const file of kycCase.files) {
          try {
            const response = await fetch(file.fileUrl, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Accept': '*/*' }
            });

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength === 0) throw new Error("Empty buffer received");
            
            const safeFileName = resolveDownloadFileName(file.name, file.originalName, file.mimeType);
            docFolder?.file(safeFileName, arrayBuffer, { binary: true });
          } catch (e) {
            console.error(`Storage bundle extraction error for ${file.name}:`, e);
          }
        }
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.body.appendChild(document.createElement('a'));
      link.href = url;
      link.download = `${bundleName}.zip`;
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);

      toast({
        title: "Bundle Extraction Complete",
        description: `Compressed files successfully.`,
      });
      // Mark bundles as downloaded for audit requirement
      setDownloadedCaseBundles(prev => {
        const next = new Set(prev);
        casesToDownload.forEach(c => next.add(c.id));
        return next;
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Bundle Extraction Failed",
        description: "An error occurred while zipping the files.",
      });
    } finally {
      setIsZipping(false);
    }
  };

  const markFileDownloaded = (fileId: string) => {
    setDownloadedFileIds(prev => {
      const next = new Set(prev);
      next.add(fileId);
      return next;
    });
  };

  const canDeleteFiles = (caseId: string, fileIds: string[]) => {
    // A file can be deleted if it was downloaded individually or the case bundle was downloaded
    const caseBundleDownloaded = downloadedCaseBundles.has(caseId);
    const missing = fileIds.filter(fid => !downloadedFileIds.has(fid) && !caseBundleDownloaded);
    return { ok: missing.length === 0, missing };
  };

  const canDeleteCases = (caseIds: string[]) => {
    // Cases can be deleted only if their bundle was downloaded
    const missing = caseIds.filter(id => !downloadedCaseBundles.has(id));
    return { ok: missing.length === 0, missing };
  };

  const handleBulkArchive = async (ids: string[]) => {
    setActionLoading(true);
    try {
      const res = await cutCasesToArchive(ids);
      if (res.success) {
        toast({ title: 'Success', description: `${res.filesProcessed} files moved to archive tier.` });
        loadData();
        setSelectedCaseIds(new Set());
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error || 'Failed to archive' });
      }
    } finally {
      setActionLoading(false);
      setActionConfirm(null);
    }
  };

  const handleBulkRestore = async (ids: string[]) => {
    setActionLoading(true);
    try {
      const res = await restoreCasesFromArchive(ids);
      if (res.success) {
        toast({ title: 'Success', description: `${res.filesProcessed} files restored to primary tier.` });
        loadData();
        setSelectedCaseIds(new Set());
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error || 'Failed to restore' });
      }
    } finally {
      setActionLoading(false);
      setActionConfirm(null);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    setActionLoading(true);
    let successCount = 0;
    try {
      const { ok, missing } = canDeleteCases(ids);
      if (!ok) {
        toast({ variant: 'destructive', title: 'Download required', description: 'For audit and recovery purposes, you must download the selected document(s) before deletion. Please complete the download and try again.' });
        return;
      }
      for (const id of ids) {
        const res = await deleteKycCaseAndFiles(id);
        if (res.success) successCount++;
      }
      toast({ title: 'Purge Complete', description: `${successCount} cases permanently deleted.` });
      loadData();
      setSelectedCaseIds(new Set());
    } finally {
      setActionLoading(false);
      setActionConfirm(null);
    }
  };

  const handleFileDelete = async (memoId: string) => {
    setActionLoading(true);
    try {
      const res = await deleteInstitutionalFile(memoId);
      if (res.success) {
        toast({ title: 'Success', description: res.caseDeleted ? 'Last document deleted and empty case removed.' : 'Document permanently deleted.' });
        loadData();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error || 'Failed to delete document' });
      }
    } finally {
      setActionLoading(false);
      setActionConfirm(null);
    }
  };

  const handleAllFilesDelete = async (kycId: string, fileIds: string[]) => {
    setActionLoading(true);
    let deletedCount = 0;
    try {
      // require that either the case bundle was downloaded or all files were individually downloaded
      const { ok, missing } = canDeleteFiles(kycId, fileIds);
      if (!ok) {
        toast({ variant: 'destructive', title: 'Download required', description: 'For audit and recovery purposes, you must download the selected document(s) before deletion. Please complete the download and try again.' });
        return;
      }
      for (const fileId of fileIds) {
        const res = await deleteInstitutionalFile(fileId);
        if (res.success) deletedCount++;
      }
      toast({ title: 'All Files Purged', description: `${deletedCount} documents permanently deleted. Case has been deactivated.` });
      loadData();
      setSelectedCaseIds(new Set());
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to purge all files.' });
    } finally {
      setActionLoading(false);
      setActionConfirm(null);
    }
  };

  const handleSelectedFilesDelete = async (kycId: string, fileIds: string[]) => {
    setActionLoading(true);
    setIsBulkDeleting(true);
    let deletedCount = 0;
    try {
      const { ok, missing } = canDeleteFiles(kycId, fileIds);
      if (!ok) {
        toast({ variant: 'destructive', title: 'Download required', description: 'For audit and recovery purposes, you must download the selected document(s) before deletion. Please complete the download and try again.' });
        return;
      }
      for (const fileId of fileIds) {
        const res = await deleteInstitutionalFile(fileId);
        if (res.success) deletedCount++;
      }
      toast({ title: 'Files Deleted', description: `${deletedCount} documents permanently deleted.` });
      // remove from selection
      setSelectedFileIds(prev => {
        const next = new Set(prev);
        fileIds.forEach(id => next.delete(id));
        return next;
      });
      loadData();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete selected files.' });
    } finally {
      setActionLoading(false);
      setIsBulkDeleting(false);
      setActionConfirm(null);
    }
  };

  if (permissionsLoading) {
    return <div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
            <HardDrive className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 font-headline">KYC Document Vault</h1>
            <p className="text-muted-foreground font-medium">Enterprise storage management, archives, and bulk actions.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={loadData} variant="outline" className="h-11 rounded-xl">
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Refresh
          </Button>
          <Button onClick={handleExportCSV} variant="outline" className="h-11 rounded-xl">
            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Export List
          </Button>
        </div>
      </div>

      {/* STATS */}
      {data && (() => {
        const STORAGE_LIMIT_BYTES = storageQuotaGb * 1024 * 1024 * 1024;
        const usedBytes = data.totalStorageBytes ?? 0;
        const usedPct = Math.min((usedBytes / STORAGE_LIMIT_BYTES) * 100, 100);
        const barColor = usedPct > 85 ? 'bg-red-500' : usedPct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Storage Usage Card */}
            <Card className="col-span-1 md:col-span-2 rounded-[1.5rem] bg-white shadow-sm border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Storage Used</p>
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-[10px] font-black uppercase tracking-widest text-primary gap-1 px-2"
                    onClick={() => { handleFilterChange('sortField', 'size'); handleFilterChange('sortDir', 'desc'); }}
                  >
                    <Zap className="w-3 h-3" /> Sort Largest First
                  </Button>
                </div>
                <div className="flex items-end gap-2 mb-3">
                  <p className="text-3xl font-black tabular-nums text-slate-900">{formatSize(usedBytes)}</p>
                  <p className="text-sm font-bold text-slate-400 mb-1">/ {formatSize(STORAGE_LIMIT_BYTES)}</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className={`h-2 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${usedPct}%` }} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-1.5">{usedPct.toFixed(1)}% of institutional quota used across {data.totalFiles} documents</p>
              </CardContent>
            </Card>
            {/* Total Assets */}
            <Card className="rounded-[1.5rem] bg-white shadow-sm border-slate-200">
              <CardContent className="p-6">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Documents</p>
                <p className="text-3xl font-black tabular-nums text-slate-900">{data.totalFiles}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">{data.totalCases} cases</p>
              </CardContent>
            </Card>
            {/* Protocol Card */}
            <Card className="rounded-[1.5rem] bg-white shadow-sm border-slate-200">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-amber-50 rounded-xl shrink-0">
                  <ShieldCheck className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Zero-Loss Protocol</p>
                  <p className="text-xs text-slate-500">All deletions are logged. Backup before purge.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ADVANCED FILTER CONSOLE */}
      <Card className="border-slate-200 shadow-xl overflow-hidden bg-white rounded-[2rem]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <SlidersHorizontal className="w-5 h-5" /> Advanced Filters
            </div>
            {savedFilters.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-xs font-bold gap-2 text-primary">
                    <Bookmark className="w-3.5 h-3.5" /> Saved Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  {savedFilters.map((sf, i) => (
                    <DropdownMenuItem key={i} onClick={() => applySavedFilter(sf.filters)} className="font-medium text-xs">
                      {sf.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Quick Retention Filters */}
          {data?.retentionConfig.enabled && (
            <div className="flex items-center gap-2 mb-4">
              <Button 
                variant={filters.onlyRetentionEligible ? "default" : "outline"} 
                size="sm" 
                className="h-9 rounded-lg font-bold text-xs"
                onClick={() => handleFilterChange('onlyRetentionEligible', !filters.onlyRetentionEligible)}
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-2" /> Ready for Cleanup
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 rounded-lg font-bold text-xs"
                onClick={() => {
                  handleFilterChange('sortField', 'daysSinceSubmission');
                  handleFilterChange('sortDir', 'desc');
                }}
              >
                <Clock className="w-3.5 h-3.5 mr-2" /> Oldest First
              </Button>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Case ID, Customer..." 
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-9 h-11 bg-slate-50 border-slate-200 rounded-xl font-medium focus-visible:ring-primary/20"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">District</label>
              <Select value={filters.district} onValueChange={(v) => { handleFilterChange('district', v); handleFilterChange('branch', 'all'); }}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Districts</SelectItem>
                  {districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Branch</label>
              <Select value={filters.branch} onValueChange={(v) => handleFilterChange('branch', v)}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Branches</SelectItem>
                  {availableBranchesForDistrict.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Status</label>
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Statuses</SelectItem>
                  {filterOptions.statuses.filter(s => s !== 'APPROVED').map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">KYC Officer</label>
              <Select value={filters.officer} onValueChange={(v) => handleFilterChange('officer', v)}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Officers</SelectItem>
                  {filterOptions.officers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Case Type</label>
              <Select value={filters.entityType} onValueChange={(v) => handleFilterChange('entityType', v)}>
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Types</SelectItem>
                  {filterOptions.entityTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <DatePickerWithRange 
                date={dateRange} 
                onDateChange={setDateRange} 
                label="Submission Date Range"
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-end">
            <div className="flex gap-2">
              <Button onClick={saveCurrentFilters} variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-slate-500">Save Preset</Button>
              <Button onClick={() => {
                setFilters({
                  search: '', district: 'all', branch: 'all', status: 'all', category: 'ALL', officer: 'all', entityType: 'all',
                  sortField: 'updatedAt', sortDir: 'desc', page: 1, pageSize: 25, onlyRetentionEligible: false
                });
                setDateRange(undefined);
              }} variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-600">
                <RotateCcw className="w-3 h-3 mr-1" /> Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TABLE SECTION */}
      <Card className="border-slate-200 shadow-xl overflow-hidden bg-white rounded-[2rem]">
        {/* Table Toolbar */}
        <div className="p-4 border-b bg-slate-50/50 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button onClick={handleSelectAllOnPage} variant="outline" size="sm" className="h-9 rounded-lg font-bold text-xs bg-white">
              {selectedCaseIds.size > 0 ? `Selected (${selectedCaseIds.size})` : 'Select Page'}
            </Button>
            {selectedFileIds.size > 0 && (
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest px-3 py-1">{selectedFileIds.size} file{selectedFileIds.size === 1 ? '' : 's'} selected</Badge>
            )}
            {selectedCaseIds.size > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <Button variant="secondary" size="sm" className="h-9 rounded-lg font-bold text-xs gap-2" onClick={() => {
                  if (data) {
                    const selectedCases = data.cases.filter(c => selectedCaseIds.has(c.id));
                    handleBundleDownload(selectedCases);
                  }
                }}>
                  <Download className="w-3.5 h-3.5" /> Download Bundle
                </Button>
                {canPurgeStorage && (() => {
                  const ids = Array.from(selectedCaseIds);
                  const toolbarCanDelete = ids.length > 0 && canDeleteCases(ids).ok;
                  return (
                    <Button
                      variant={toolbarCanDelete ? 'destructive' : 'outline'}
                      size="sm"
                      className={cn('h-9 rounded-lg font-bold text-xs gap-2', toolbarCanDelete ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : '')}
                      onClick={() => {
                        if (!toolbarCanDelete) {
                          if (ids.length === 0) return;
                          toast({ variant: 'destructive', title: 'Download required', description: 'For audit and recovery purposes, you must download the selected document(s) before deletion. Please complete the download and try again.' });
                          return;
                        }
                        setActionConfirm({type: 'DELETE', ids});
                      }}
                      disabled={!toolbarCanDelete}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Purge
                    </Button>
                  );
                })()}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-9 rounded-lg text-xs font-bold text-slate-500" onClick={toggleAllFolders}>
              {groupedDistricts.length > 0 && expandedDistricts.size === groupedDistricts.length ? 'Collapse All Folders' : 'Expand All Folders'}
            </Button>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              Show
              <Select value={filters.pageSize?.toString()} onValueChange={(v) => handleFilterChange('pageSize', parseInt(v))}>
                <SelectTrigger className="h-8 w-20 rounded-lg bg-white"><SelectValue/></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-lg bg-white">
                  <Settings className="w-4 h-4 text-slate-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl p-2">
                <div className="px-2 py-1.5 text-xs font-black uppercase text-slate-400 tracking-widest">Visible Columns</div>
                {Object.keys(visibleColumns).map(col => (
                  <DropdownMenuCheckboxItem 
                    key={col} 
                    checked={visibleColumns[col]} 
                    onCheckedChange={(c) => setVisibleColumns(prev => ({...prev, [col]: c}))}
                    className="capitalize font-medium text-xs"
                  >
                    {col}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto min-h-[400px]">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-12 text-center">
                  <Checkbox 
                    checked={!!(data && data.cases.length > 0 && data.cases.every(c => selectedCaseIds.has(c.id)))} 
                    onCheckedChange={handleSelectAllOnPage} 
                  />
                </TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('id')}>
                  <div className="flex items-center font-black text-[10px] uppercase tracking-widest text-slate-500">
                    Case ID {filters.sortField === 'id' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                  </div>
                </TableHead>
                {visibleColumns.customer && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('customerName')}>
                    <div className="flex items-center font-black text-[10px] uppercase tracking-widest text-slate-500">
                      Customer Entity {filters.sortField === 'customerName' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                {visibleColumns.branch && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('branchName')}>
                    <div className="flex items-center font-black text-[10px] uppercase tracking-widest text-slate-500">
                      Jurisdiction {filters.sortField === 'branchName' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                {visibleColumns.status && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('status')}>
                    <div className="flex items-center font-black text-[10px] uppercase tracking-widest text-slate-500">
                      State {filters.sortField === 'status' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                {visibleColumns.retention && (
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">Retention</TableHead>
                )}
                {visibleColumns.days && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSort('daysSinceSubmission')}>
                    <div className="flex items-center justify-end font-black text-[10px] uppercase tracking-widest text-slate-500">
                      Days Old {filters.sortField === 'daysSinceSubmission' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                {visibleColumns.type && (
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500">Type & Tags</TableHead>
                )}
                {visibleColumns.docs && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => toggleSort('docs')}>
                    <div className="flex items-center justify-end font-black text-[10px] uppercase tracking-widest text-slate-500">
                      Assets {filters.sortField === 'docs' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                {visibleColumns.size && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => toggleSort('size')}>
                    <div className="flex items-center justify-end font-black text-[10px] uppercase tracking-widest text-slate-500">
                      Size {filters.sortField === 'size' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                {visibleColumns.updated && (
                  <TableHead className="cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => toggleSort('updatedAt')}>
                    <div className="flex items-center justify-end font-black text-[10px] uppercase tracking-widest text-slate-500">
                      Modified {filters.sortField === 'updatedAt' && (filters.sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1"/> : <ChevronDown className="w-3 h-3 ml-1"/>)}
                    </div>
                  </TableHead>
                )}
                <TableHead className="w-16 sticky right-0 bg-slate-50 z-10 border-l"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({length: 5}).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={12} className="p-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-6 w-6 rounded-md" />
                        <div className="space-y-2 w-full">
                          <Skeleton className="h-4 w-1/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : data?.cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <FolderOpen className="w-12 h-12 mb-4 text-slate-200" />
                      <p className="text-lg font-bold text-slate-900">No matching cases</p>
                      <p className="text-sm">Try adjusting your filters or date range.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                groupedDistricts.map((district) => {
                  const isDistExpanded = expandedDistricts.has(district.districtName);
                  const districtTotalCases = district.branches.reduce((acc, b) => acc + b.cases.length, 0);
                  const districtTotalDocs = district.branches.reduce((acc, b) => acc + b.cases.reduce((sum, c) => sum + c.totalDocuments, 0), 0);
                  const districtTotalSize = district.branches.reduce((acc, b) => acc + b.cases.reduce((sum, c) => sum + c.totalSize, 0), 0);
                  
                  return (
                    <React.Fragment key={district.districtName}>
                      {/* DISTRICT ROW */}
                      <TableRow className={cn("transition-colors border-b", isDistExpanded ? "bg-slate-100 border-slate-300" : "bg-white hover:bg-slate-50 border-slate-200")}>
                        <TableCell colSpan={12} className="p-0">
                           <div 
                             className="flex items-center justify-between w-full cursor-pointer p-3 px-4 group/district"
                             onClick={() => {
                                setExpandedDistricts(prev => {
                                  const n = new Set(prev);
                                  if(n.has(district.districtName)) n.delete(district.districtName); else n.add(district.districtName);
                                  return n;
                                });
                             }}
                           >
                              <div className="flex items-center gap-3">
                                <div className={cn("p-1.5 rounded-lg transition-colors", isDistExpanded ? "bg-primary text-white" : "bg-slate-200 text-slate-600 group-hover/district:bg-slate-300")}>
                                  {isDistExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                                </div>
                                <span className="font-black text-sm text-slate-900 tracking-tight">{district.districtName} District</span>
                                <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{districtTotalCases} Cases</span>
                              </div>
                              <div className="flex items-center gap-6">
                                 <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> {districtTotalDocs} Assets</span>
                                    <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5"/> {formatSize(districtTotalSize)}</span>
                                 </div>
                                 {isDistExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                              </div>
                           </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* BRANCH ROWS */}
                      {isDistExpanded && district.branches.map(branch => {
                        const branchKey = `${district.districtName}-${branch.branchName}`;
                        const isBranchExpanded = expandedBranches.has(branchKey);
                        const branchTotalDocs = branch.cases.reduce((sum, c) => sum + c.totalDocuments, 0);
                        const branchTotalSize = branch.cases.reduce((sum, c) => sum + c.totalSize, 0);
                        
                        return (
                          <React.Fragment key={branchKey}>
                            <TableRow className={cn("transition-colors border-b", isBranchExpanded ? "bg-slate-50/80 border-slate-200" : "bg-slate-50/30 hover:bg-slate-50 border-slate-100")}>
                              <TableCell colSpan={12} className="p-0 pl-8 border-l-4 border-l-primary/20">
                                <div 
                                   className="flex items-center justify-between w-full cursor-pointer p-2.5 px-4 group/branch"
                                   onClick={() => {
                                      setExpandedBranches(prev => {
                                        const n = new Set(prev);
                                        if(n.has(branchKey)) n.delete(branchKey); else n.add(branchKey);
                                        return n;
                                      });
                                   }}
                                >
                                   <div className="flex items-center gap-3">
                                     <div className={cn("p-1.5 rounded-md transition-colors", isBranchExpanded ? "bg-primary/10 text-primary" : "bg-slate-200/50 text-slate-500 group-hover/branch:bg-slate-200")}>
                                       {isBranchExpanded ? <FolderOpen className="w-3.5 h-3.5" /> : <Map className="w-3.5 h-3.5" />}
                                     </div>
                                     <span className="font-bold text-xs text-slate-800 tracking-tight">{branch.branchName} Branch</span>
                                     <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-100 px-1.5 py-0.5 rounded-md shadow-sm">{branch.cases.length} Cases</span>
                                   </div>
                                   <div className="flex items-center gap-6">
                                     <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                                        <span className="flex items-center gap-1.5 text-[10px]"><FileText className="w-3 h-3"/> {branchTotalDocs} Assets</span>
                                        <span className="flex items-center gap-1.5 text-[10px]"><HardDrive className="w-3 h-3"/> {formatSize(branchTotalSize)}</span>
                                     </div>
                                     {isBranchExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                   </div>
                                </div>
                              </TableCell>
                            </TableRow>
                            
                            {/* CASE ROWS */}
                            {isBranchExpanded && branch.cases.map(caseItem => (
                              <React.Fragment key={caseItem.id}>
                                <TableRow className={cn("group transition-colors", expandedCases.has(caseItem.id) ? "bg-primary/5" : "hover:bg-slate-50/50")}>
                                  <TableCell className="text-center pl-16 border-l-4 border-l-slate-200">
                      <Checkbox 
                        checked={selectedCaseIds.has(caseItem.id)} 
                        onCheckedChange={() => handleSelectCase(caseItem.id)} 
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => {
                        setExpandedCases(prev => {
                          const n = new Set(prev);
                          if(n.has(caseItem.id)) n.delete(caseItem.id); else n.add(caseItem.id);
                          return n;
                        });
                      }}>
                        {expandedCases.has(caseItem.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900">{caseItem.id}</span>
                        {caseItem.assignedTo && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 font-bold mt-1">
                            <UserIcon className="w-3 h-3" /> {caseItem.assignedTo.firstName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {visibleColumns.customer && (
                      <TableCell className="font-bold text-sm text-slate-700 max-w-[200px]" title={caseItem.customerName}>
                        <div className="flex flex-col">
                          <span className="truncate">{caseItem.customerName}</span>
                          {extractAccountNumber(caseItem) && (
                            <span className="text-[10px] text-muted-foreground font-mono font-medium leading-tight">
                              Acc: {maskAccountNumber(extractAccountNumber(caseItem))}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.branch && (
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-slate-900">{caseItem.branchName}</span>
                          <span className="text-[10px] font-black uppercase text-slate-400">{caseItem.districtName}</span>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.status && (
                      <TableCell>
                        <Badge variant="outline" className="bg-white border-slate-200 font-black text-[9px] uppercase px-2">
                          {caseItem.status}
                        </Badge>
                      </TableCell>
                    )}
                    {visibleColumns.retention && (
                      <TableCell className="text-center">
                        {caseItem.isRetentionEligible ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                        ) : (
                          <div className="w-5 h-5" />
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.days && (
                      <TableCell className="text-right">
                        <span className="font-bold text-xs text-slate-500">
                          {caseItem.daysSinceSubmission}d
                        </span>
                      </TableCell>
                    )}
                    {visibleColumns.type && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary" className="font-bold text-[9px] px-1.5">{caseItem.entityType || 'General'}</Badge>
                          {caseItem.isUrgent && <Badge className="bg-red-500 font-bold text-[9px] px-1.5">URGENT</Badge>}
                          {caseItem.isExceptional && <Badge className="bg-purple-500 font-bold text-[9px] px-1.5">EXCEPTIONAL</Badge>}
                          {caseItem.isResubmitted && <Badge className="bg-amber-500 font-bold text-[9px] px-1.5">AMEND</Badge>}
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.docs && (
                      <TableCell className="text-right">
                        <span className="font-black text-slate-900">{caseItem.totalDocuments}</span>
                      </TableCell>
                    )}
                    {visibleColumns.size && (
                      <TableCell className="text-right">
                        <span className="font-bold text-xs text-slate-500">{formatSize(caseItem.totalSize)}</span>
                      </TableCell>
                    )}
                    {visibleColumns.updated && (
                      <TableCell className="text-right">
                        <span className="font-bold text-xs text-slate-500">
                          {format(new Date(caseItem.updatedAt), 'MMM dd, yyyy')}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="sticky right-0 bg-white group-hover:bg-slate-50 border-l transition-colors p-2 text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => router.push(`/submissions/${caseItem.id}`)} title="Go to Case">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedCases.has(caseItem.id) && (
                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b">
                      <TableCell colSpan={12} className="p-0 border-b-0">
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-500">
                          <div className="md:col-span-1 space-y-4">
                            <h3 className="text-sm font-black text-slate-900 tracking-tight">Quick Case Details</h3>
                            <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                              <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Created By</p>
                                <p className="text-xs font-bold text-slate-700">{caseItem.assignedTo?.firstName || 'System'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Creation Date</p>
                                <p className="text-xs font-bold text-slate-700">{format(new Date(caseItem.submittedAt), 'PPP p')}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Entity Structure</p>
                                <p className="text-xs font-bold text-slate-700">{caseItem.entityType || 'General Account'}</p>
                              </div>
                            </div>
                            {canPurgeStorage && (() => {
                              const canDeleteThisCase = canDeleteCases([caseItem.id]).ok;
                              return (
                                <div className="space-y-2 mt-4">
                                  <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className={cn('w-full text-xs font-bold h-9 gap-2', !canDeleteThisCase ? 'opacity-50 cursor-not-allowed' : '')}
                                    onClick={() => setActionConfirm({type: 'DELETE', ids: [caseItem.id]})}
                                    disabled={!canDeleteThisCase}
                                  >
                                    <Trash2 className={cn('w-3.5 h-3.5', canDeleteThisCase ? 'text-emerald-600' : '')} /> Delete Case Permanently
                                  </Button>
                                  <Button 
                                    variant="outline"
                                    size="sm" 
                                    className={cn('w-full text-xs font-bold h-9 gap-2 border-red-200 hover:bg-red-50 hover:text-red-700', !canDeleteThisCase ? 'opacity-50 cursor-not-allowed' : '')}
                                    onClick={() => setActionConfirm({ type: 'DELETE_ALL_FILES', ids: [caseItem.id], kycId: caseItem.id })}
                                    disabled={!canDeleteThisCase}
                                  >
                                    <Trash2 className={cn('w-3.5 h-3.5', canDeleteThisCase ? 'text-emerald-600' : '')} /> Purge All Files in Case
                                  </Button>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="md:col-span-2 space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-black text-slate-900 tracking-tight">Document Assets</h3>
                              <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-2" onClick={() => {
                                handleBundleDownload([caseItem]);
                              }}>
                                <Download className="w-3.5 h-3.5" /> Download Bundle
                              </Button>
                            </div>
                            <div className="space-y-4">
                              {(() => {
                                const cycles: { cycleId: number, title: string, files: VaultFileItem[], date: Date, uploader: string, size: number }[] = [];
                                const sortedFiles = [...caseItem.files].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                                let currentCycle: VaultFileItem[] = [];
                                let lastDate = new Date(0);
                                let cycleCount = 0;

                                sortedFiles.forEach(file => {
                                  const fileDate = new Date(file.createdAt);
                                  // 30 min gap = new cycle
                                  if (currentCycle.length === 0 || fileDate.getTime() - lastDate.getTime() > 1000 * 60 * 30) { 
                                    if (currentCycle.length > 0) {
                                      cycles.push({ cycleId: cycleCount++, files: currentCycle, date: lastDate, uploader: currentCycle[0].uploadedBy?.firstName ? currentCycle[0].uploadedBy.firstName + ' ' + currentCycle[0].uploadedBy.lastName : 'System', size: currentCycle.reduce((s, f) => s + f.size, 0), title: '' });
                                    }
                                    currentCycle = [];
                                  }
                                  currentCycle.push(file);
                                  lastDate = fileDate;
                                });
                                if (currentCycle.length > 0) {
                                  cycles.push({ cycleId: cycleCount++, files: currentCycle, date: lastDate, uploader: currentCycle[0].uploadedBy?.firstName ? currentCycle[0].uploadedBy.firstName + ' ' + currentCycle[0].uploadedBy.lastName : 'System', size: currentCycle.reduce((s, f) => s + f.size, 0), title: '' });
                                }

                                cycles.forEach((cycle, idx) => {
                                  if (idx === 0) cycle.title = "Initial Submission";
                                  else cycle.title = `Resubmission #${idx}`;
                                });

                                if (cycles.length === 0) {
                                  return (
                                    <div className="bg-white rounded-xl border border-slate-100 p-8 text-center text-slate-400">
                                      <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                      <p className="text-xs font-bold">No document assets available.</p>
                                    </div>
                                  );
                                }

                                return cycles.map(cycle => (
                                  <details key={cycle.cycleId} className="group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" open>
                                    <summary className="flex items-center justify-between p-3 px-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors list-none">
                                      <div className="flex items-center gap-3">
                                        <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                                        <span className="font-black text-sm text-slate-800">{cycle.title}</span>
                                        <Badge variant="outline" className="bg-white text-[10px] uppercase font-bold text-slate-500 ml-2">{cycle.files.length} Docs</Badge>
                                      </div>
                                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 hidden md:flex">
                                        <div className="flex items-center gap-4 mr-4">
                                          <span>{format(cycle.date, 'MMM dd, yyyy HH:mm')}</span>
                                          <span>&bull;</span>
                                          <span>{cycle.uploader}</span>
                                          <span>&bull;</span>
                                          <span>{formatSize(cycle.size)}</span>
                                        </div>
                                          <div className="flex items-center gap-2">
                                            <Button size="sm" variant="outline" className="h-8 rounded-md text-[11px] font-bold" onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              // select all files in this cycle
                                              setSelectedFileIds(prev => {
                                                const next = new Set(prev);
                                                cycle.files.forEach(f => next.add(f.id));
                                                return next;
                                              });
                                            }}>Select All</Button>
                                            <Button size="sm" variant="ghost" className="h-8 rounded-md text-[11px] font-bold" onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setSelectedFileIds(prev => {
                                                const next = new Set(prev);
                                                cycle.files.forEach(f => next.delete(f.id));
                                                return next;
                                              });
                                            }}>Clear</Button>
                                            {(() => {
                                              const selIds = cycle.files.filter(f => selectedFileIds.has(f.id)).map(f => f.id);
                                              const selCount = selIds.length;
                                              const selCanDelete = selCount > 0 && canDeleteFiles(caseItem.id, selIds).ok;
                                              return (
                                                <Button
                                                  size="sm"
                                                  variant={selCanDelete ? 'destructive' : 'outline'}
                                                  className={cn('h-8 rounded-md text-[11px] font-bold ml-2', selCanDelete ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : '')}
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!selCanDelete) {
                                                      if (selCount === 0) return;
                                                      toast({ variant: 'destructive', title: 'Download required', description: 'For audit and recovery purposes, you must download the selected document(s) before deletion. Please complete the download and try again.' });
                                                      return;
                                                    }
                                                    setActionConfirm({ type: 'DELETE_SELECTED_FILES', ids: selIds, kycId: caseItem.id });
                                                  }}
                                                  disabled={!selCanDelete}
                                                >
                                                  Delete Selected
                                                </Button>
                                              );
                                            })()}
                                          </div>
                                      </div>
                                    </summary>
                                    <div className="border-t border-slate-100">
                                      <Table>
                                        <TableHeader className="bg-white">
                                          <TableRow>
                                            <TableHead className="w-12 text-center"><Checkbox checked={cycle.files.every(f => selectedFileIds.has(f.id))} onCheckedChange={(v) => {
                                              if (v) setSelectedFileIds(prev => { const n = new Set(prev); cycle.files.forEach(f => n.add(f.id)); return n; });
                                              else setSelectedFileIds(prev => { const n = new Set(prev); cycle.files.forEach(f => n.delete(f.id)); return n; });
                                            }} /></TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-slate-400 h-8">Asset Name</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-slate-400 h-8">Category</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-slate-400 h-8">Size</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-slate-400 h-8 text-right">Actions</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {cycle.files.map(file => (
                                            <TableRow key={file.id} className="group/file hover:bg-slate-50/50">
                                              <TableCell className="w-12 text-center">
                                                <Checkbox checked={selectedFileIds.has(file.id)} onCheckedChange={(v) => {
                                                  setSelectedFileIds(prev => {
                                                    const next = new Set(prev);
                                                    if (v) next.add(file.id); else next.delete(file.id);
                                                    return next;
                                                  });
                                                }} onClick={(e) => e.stopPropagation()} />
                                              </TableCell>
                                              <TableCell className="w-full">
                                                <div className="flex items-center gap-3">
                                                  <div className={cn("p-2 rounded-lg", file.category === 'MEMO' ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/5 text-primary')}>
                                                    <FileText className="w-4 h-4" />
                                                  </div>
                                                  <div className="flex flex-col">
                                                    <span className="font-bold text-xs text-slate-700 truncate max-w-[200px]">{file.name}</span>
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase">{format(new Date(file.createdAt), 'MMM dd, yyyy')}</span>
                                                  </div>
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <Badge variant="outline" className="text-[9px] font-black px-1.5 py-0 bg-white border-slate-200 text-slate-500">
                                                  {file.category}
                                                </Badge>
                                              </TableCell>
                                              <TableCell>
                                                <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">{formatSize(file.size)}</span>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-slate-400 hover:text-primary" onClick={() => {
                                                    const a = document.createElement('a');
                                                    a.href = file.fileUrl;
                                                    a.download = file.name;
                                                    a.click();
                                                    // mark as downloaded for audit requirement
                                                    try { markFileDownloaded(file.id); } catch (e) { /* ignore */ }
                                                  }}>
                                                    <Download className="w-3.5 h-3.5" />
                                                  </Button>
                                                  {canPurgeStorage && (() => {
                                                    const fileDeletable = canDeleteFiles(caseItem.id, [file.id]).ok;
                                                    return (
                                                      <Button
                                                        variant={fileDeletable ? 'ghost' : 'ghost'}
                                                        size="icon"
                                                        className={cn("h-7 w-7 rounded-md", fileDeletable ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-300 cursor-not-allowed')}
                                                        disabled={!fileDeletable}
                                                        onClick={() => {
                                                          if (!fileDeletable) return;
                                                          setActionConfirm({
                                                            type: 'DELETE_FILE',
                                                            ids: [file.id],
                                                            kycId: caseItem.id,
                                                            isLastFile: caseItem.files.length === 1
                                                          });
                                                        }}
                                                      >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                      </Button>
                                                    );
                                                  })()}
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </details>
                                ));
                              })()}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                                </React.Fragment>
                              ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="p-4 border-t bg-slate-50 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500">
              Showing {(data.page - 1) * data.pageSize + 1} to {Math.min(data.page * data.pageSize, data.totalCases)} of {data.totalCases} cases
            </p>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleFilterChange('page', data.page - 1)}
                disabled={data.page === 1}
                className="h-8 rounded-lg bg-white"
              >
                Previous
              </Button>
              <div className="flex items-center justify-center w-8 text-xs font-black text-slate-900">
                {data.page}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleFilterChange('page', data.page + 1)}
                disabled={data.page === data.totalPages}
                className="h-8 rounded-lg bg-white"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Confirmation Dialog for Bulk Actions */}
      <AlertDialog open={!!actionConfirm} onOpenChange={() => !actionLoading && setActionConfirm(null)}>
        <AlertDialogContent className="rounded-[2rem] p-0 border-none overflow-hidden max-w-md">
          <div className="p-6 bg-slate-50 border-b">
            <AlertDialogTitle className="text-xl font-black text-slate-900">Confirm Bulk Action</AlertDialogTitle>
          </div>
          <div className="p-6">
            <p className="font-medium text-slate-600 mb-2">
              {actionConfirm?.type === 'DELETE_FILE' 
                ? actionConfirm.isLastFile 
                  ? "This is the last document in this case. Deleting it will also remove the case from the Document Vault. Do you want to continue?"
                  : "Are you sure you want to permanently delete this document?"
                : actionConfirm?.type === 'DELETE_SELECTED_FILES'
                  ? `You are about to permanently delete ${actionConfirm.ids.length} selected document(s). This cannot be undone.`
                  : `You are about to ${actionConfirm?.type} ${actionConfirm?.ids.length} selected cases.`
              }
            </p>
            {(actionConfirm?.type === 'DELETE' || actionConfirm?.type === 'DELETE_FILE' || actionConfirm?.type === 'DELETE_SELECTED_FILES') && (
              <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">Warning: Permanent deletion cannot be undone. Only authorized storage administrators can perform this action.</p>
            )}
          </div>
          <AlertDialogFooter className="p-4 bg-slate-50 border-t flex items-center gap-2">
            <AlertDialogCancel disabled={actionLoading} className="rounded-xl font-bold m-0">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                if (actionConfirm?.type === 'DELETE') handleBulkDelete(actionConfirm.ids);
                else if (actionConfirm?.type === 'DELETE_FILE') handleFileDelete(actionConfirm.ids[0]);
                else if (actionConfirm?.type === 'DELETE_ALL_FILES' && actionConfirm.kycId) {
                  const caseItem = data?.cases.find(c => c.id === actionConfirm.kycId);
                  if (caseItem) handleAllFilesDelete(caseItem.id, caseItem.files.map(f => f.id));
                } else if (actionConfirm?.type === 'DELETE_SELECTED_FILES' && actionConfirm.kycId) {
                  handleSelectedFilesDelete(actionConfirm.kycId, actionConfirm.ids);
                }
              }}
              disabled={actionLoading}
              className={cn("rounded-xl font-black m-0", (actionConfirm?.type === 'DELETE' || actionConfirm?.type === 'DELETE_FILE' || actionConfirm?.type === 'DELETE_SELECTED_FILES') && "bg-red-600 hover:bg-red-700 text-white")}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm {actionConfirm?.type}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={presetSaveOpen} onOpenChange={setPresetSaveOpen}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-extrabold text-2xl">Save Filter Preset</AlertDialogTitle>
            <p className="text-sm text-slate-500 font-medium">Name this filter preset to quickly apply it later.</p>
          </AlertDialogHeader>
          <div className="py-4">
            <Input 
              autoFocus
              placeholder="e.g. Alem Gena Active Cases" 
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="h-11 rounded-xl bg-slate-50 font-bold border-slate-200"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSavePreset();
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                confirmSavePreset();
              }}
              disabled={!presetName.trim()}
              className="h-11 rounded-xl font-bold"
            >
              Save Preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
