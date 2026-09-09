'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from "@/lib/auth";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Folders,
  Folder,
  SlidersHorizontal,
  Building2,
  ShieldCheck,
  Loader2,
  FileArchive,
  CheckCircle2,
  Clock,
  Search,
  RotateCcw,
  Copy,
  FolderInput,
  Undo2,
  HardDriveDownload,
  Trash2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  copyCasesToArchive,
  cutCasesToArchive,
  restoreCasesFromArchive,
  deleteCasesFromArchive,
  getArchiveBackupPreview,
  confirmArchiveBackupAndClear,
  getArchiveStorageOverview,
  type ArchiveBackupPreview,
  type ArchiveStorageOverview,
  type TierAction,
  type TierActionResult,
} from "@/actions/archive-tiering";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import JSZip from 'jszip';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, extractAccountNumber, maskAccountNumber } from "@/lib/utils";
import {
  getArchiveBranchSummary,
  getArchiveCaseIds,
  getArchiveCaseList,
  getArchiveCaseTotals,
  getArchiveDistrictSummary,
  getSubmissionById,
  type ArchiveGroupRow,
} from "@/actions/submissions";
import { getBranches, getDistricts } from "@/actions/hierarchy";
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import {
  buildBundleRootName,
  getSubmissionBranchName,
  getSubmissionDistrictName,
  sanitizeBundleSegment,
} from "@/lib/bundle-path";
import { resolveDownloadFileName } from "@/lib/documents";

const STATUS_OPTIONS = [
  { id: KYC_STATUS.APPROVED, label: 'Approved' }
];

/** Batch sizes for taking the oldest cases without selecting the whole bank. */
const OLDEST_BATCHES = [100, 500, 1000];

export default function MasterBundleDownloadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([KYC_STATUS.APPROVED]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // Only the visible page is held in memory now; `totalRecords` comes from the
  // database rather than from the length of a fully-loaded array.
  const [pageCases, setPageCases] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentActionLabel, setCurrentActionLabel] = useState("");

  // --- Storage-tiering selection (copy / cut / restore to E:) ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingTierAction, setPendingTierAction] = useState<TierAction | null>(null);
  const [isTiering, setIsTiering] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [tierProgressLabel, setTierProgressLabel] = useState("");
  // Active = cases still on primary storage; Archived = cases moved to E:;
  // Deleted = soft-deleted (bytes freed from E:, record kept, restorable).
  const [viewMode, setViewMode] = useState<'active' | 'archived' | 'deleted'>('active');
  // List search + pagination so the list stays fast/clear with large datasets.
  const [listSearch, setListSearch] = useState("");
  const [filterTotals, setFilterTotals] = useState<{ cases: number; files: number; bytes: number } | null>(null);

  // --- Drill-down: districts -> branches -> cases ---
  const [openDistrict, setOpenDistrict] = useState<string | null>(null);
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  const [districtRows, setDistrictRows] = useState<ArchiveGroupRow[]>([]);
  const [branchRows, setBranchRows] = useState<ArchiveGroupRow[]>([]);
  const drillLevel: 'district' | 'branch' | 'case' =
    openBranch ? 'case' : openDistrict ? 'branch' : 'district';

  const openDistrictFolder = (name: string) => {
    setOpenDistrict(name);
    setOpenBranch(null);
    setCurrentPage(1);
    setFolderPage(1);
  };
  const openBranchFolder = (name: string) => {
    setOpenBranch(name);
    setCurrentPage(1);
  };
  // Going back up lands on the first page of that level, not wherever the last
  // visit left it.
  const goToDistricts = () => { setOpenDistrict(null); setOpenBranch(null); setFolderPage(1); };
  const goToBranches = () => { setOpenBranch(null); setFolderPage(1); };
  const [currentPage, setCurrentPage] = useState(1);
  /** Page within the district/branch folder list, which pages in the browser. */
  const [folderPage, setFolderPage] = useState(1);
  const PAGE_SIZE = 50;
  /**
   * Folder rows are compact, and a district holds roughly forty branches, so a
   * 50-row page would never actually turn — the list would just be long. 25
   * splits a typical district in two and keeps the whole level on one screen.
   */
  const FOLDER_PAGE_SIZE = 25;
  /** Ceiling on one export, so a whole-bank click cannot queue an unbounded ZIP. */
  const EXPORT_CASE_LIMIT = 2000;
  /** Cases per tier-action request, so a large move never rides on one call. */
  const TIER_CHUNK_SIZE = 25;
  /** Ceiling on a "select all matching" click. */
  const BULK_SELECT_LIMIT = 2000;

  // Every filter is applied by the database and only the visible page is
  // fetched. Filtering thousands of cases in the browser meant loading them all
  // first, which is what made this page expensive to open.
  const listFilters = useMemo(() => {
    const filters: any = {
      status: selectedStatuses.length > 0 ? selectedStatuses : [KYC_STATUS.APPROVED],
      view: viewMode,
    };
    // The drill-down is the source of truth for where you are; the dropdowns
    // only pre-position it.
    if (openDistrict) filters.district = openDistrict;
    else if (selectedDistrict !== 'all') filters.district = selectedDistrict;
    if (openBranch) filters.branches = [openBranch];
    else if (selectedBranch !== 'all') filters.branches = [selectedBranch];
    if (debouncedSearch) filters.search = debouncedSearch;
    if (dateRange?.from) {
      filters.startDate = dateRange.from.toISOString();
      if (dateRange.to) filters.endDate = dateRange.to.toISOString();
    }
    return filters;
  }, [selectedStatuses, viewMode, selectedDistrict, selectedBranch, debouncedSearch, dateRange, openDistrict, openBranch]);

  // Totals for the whole filter, not the page — "archive all of this and you
  // free X".
  //
  // Only inside a branch. Summing bytes means joining document rows, and at the
  // region level that would scan every document in the bank to answer a
  // question nobody has asked yet. The folder levels show case counts, which
  // come from indexed columns alone.
  useEffect(() => {
    if (drillLevel !== 'case') {
      setFilterTotals(null);
      return;
    }
    let cancelled = false;
    getArchiveCaseTotals(listFilters)
      .then(t => { if (!cancelled) setFilterTotals(t); })
      .catch(() => { if (!cancelled) setFilterTotals(null); });
    return () => { cancelled = true; };
  }, [drillLevel, listFilters]);

  // Typing must not fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(listSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [listSearch]);

  useEffect(() => {
    void loadReferenceData();
  }, []);

  // The browser drills district -> branch -> case, so each level loads only its
  // own level. Cases are never listed until a branch is open, which is what
  // keeps the page cheap no matter how many documents the bank holds.
  useEffect(() => {
    if (drillLevel !== 'district') return;
    setLoading(true);
    getArchiveDistrictSummary(listFilters)
      .then(setDistrictRows)
      .catch(() => setDistrictRows([]))
      .finally(() => setLoading(false));
  }, [drillLevel, listFilters]);

  useEffect(() => {
    if (drillLevel !== 'branch' || !openDistrict) return;
    setLoading(true);
    getArchiveBranchSummary(openDistrict, listFilters)
      .then(setBranchRows)
      .catch(() => setBranchRows([]))
      .finally(() => setLoading(false));
  }, [drillLevel, openDistrict, listFilters]);

  useEffect(() => {
    if (drillLevel !== 'case') return;
    void loadCases();
  }, [drillLevel, listFilters, currentPage]);

  const loadReferenceData = async () => {
    try {
      const [b, d] = await Promise.all([getBranches(), getDistricts()]);
      setBranches(b);
      setDistricts(d);
    } catch {
      toast({ variant: "destructive", title: "Sync Error", description: "Could not load branches and districts." });
    }
  };

  const loadCases = async () => {
    setLoading(true);
    try {
      // Deliberately NOT getSubmissions: that attaches every document of every
      // case and signs a download token for each, which is thousands of HMACs
      // and several megabytes for a list that only draws case rows. Exports
      // still fetch documents per case, below.
      const result = await getArchiveCaseList({
        ...listFilters,
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      });
      setPageCases(result.cases);
      setTotalRecords(result.total);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Error", description: "Could not retrieve records." });
    } finally {
      setLoading(false);
    }
  };

  /** Reloads the current page — used after any action that changes storage state. */
  const loadInitialData = async () => {
    await loadCases();
  };

  // Filtering, ordering and paging all happen in the database now, so the page
  // renders exactly what the server returned.
  const pagedSubmissions = pageCases;
  const orderedFilteredSubmissions = pageCases;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;

  // Districts and branches arrive as one grouped count — a few hundred rows at
  // most, already in memory — so this pages in the browser. Asking the server
  // for a page of them would cost a query to save nothing.
  const folderRows = drillLevel === 'district' ? districtRows : branchRows;
  const folderTotalPages = Math.max(1, Math.ceil(folderRows.length / FOLDER_PAGE_SIZE));
  const safeFolderPage = Math.min(folderPage, folderTotalPages);
  const pagedFolderRows = folderRows.slice(
    (safeFolderPage - 1) * FOLDER_PAGE_SIZE,
    safeFolderPage * FOLDER_PAGE_SIZE,
  );

  /** More cases match than one download can carry, so the export takes a slice. */
  const exportIsCapped = drillLevel === 'case' && totalRecords > EXPORT_CASE_LIMIT;

  // Reset to page 1 whenever the result set changes — keyed off the same object
  // the query uses, so no filter can be added later and forgotten here.
  useEffect(() => {
    setCurrentPage(1);
    setFolderPage(1);
  }, [listFilters]);

  const handleToggleStatus = (statusId: string) => {
    setSelectedStatuses(prev => 
      prev.includes(statusId) ? prev.filter(s => s !== statusId) : [...prev, statusId]
    );
  };

  /** Fetch a document with up to 3 retries on rate-limit (429) responses. */
  const fetchDocumentWithRetry = async (url: string, retries = 3): Promise<ArrayBuffer | null> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'Accept': '*/*' } });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return buf.byteLength > 0 ? buf : null;
      }
      if (res.status === 429 && attempt < retries - 1) {
        // Back off before retrying: 3 s, 6 s …
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      // Non-retryable error
      return null;
    }
    return null;
  };

  const handleDownloadMasterBundle = async () => {
    if (!user || totalRecords === 0) return;
    setIsProcessing(true);
    setProgress(0);

    const failedDocs: { caseId: string; docName: string; reason: string }[] = [];

    try {
      // The list only holds the visible page, so the export fetches the whole
      // filtered set itself. These rows carry no documents, so even thousands
      // of them are small; each case's documents are fetched individually below.
      const exportSet = await getArchiveCaseList({ ...listFilters, limit: EXPORT_CASE_LIMIT, offset: 0 });
      const filteredSubmissions = exportSet.cases;
      if (filteredSubmissions.length === 0) {
        toast({ variant: "destructive", title: "Nothing to export", description: "No cases match the current filters." });
        return;
      }
      if (exportSet.total > filteredSubmissions.length) {
        const remaining = exportSet.total - filteredSubmissions.length;
        toast({
          title: `Too many cases for one download — taking the oldest ${filteredSubmissions.length.toLocaleString()}`,
          description:
            `${exportSet.total.toLocaleString()} cases match your filters, but one download can hold ` +
            `${EXPORT_CASE_LIMIT.toLocaleString()}. This bundle contains the ${filteredSubmissions.length.toLocaleString()} ` +
            `that have waited longest — nothing is lost, the other ${remaining.toLocaleString()} simply stay here. ` +
            `When this download finishes, run it again to take the next batch, or pick a single branch to work through them one at a time.`,
        });
      }
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');

      const filterTypeLabel = selectedStatuses.length === 0
        ? 'ALL_STATUSES'
        : selectedStatuses.map(s => STATUS_OPTIONS.find(opt => opt.id === s)?.label || s).join('_');

      const dateRangeLabel = dateRange?.from && dateRange?.to
        ? `${format(dateRange.from, 'yyyyMMdd')}_to_${format(dateRange.to, 'yyyyMMdd')}`
        : dateRange?.from
        ? `from_${format(dateRange.from, 'yyyyMMdd')}`
        : 'ALL_DATES';

      const rootFolder = zip.folder('NIB_KYC_MASTER_EXPORT');

      const groupedByDistrict: Record<string, Record<string, any[]>> = {};
      for (const sub of filteredSubmissions) {
        const distName = getSubmissionDistrictName(sub);
        const branchName = getSubmissionBranchName(sub);
        if (!groupedByDistrict[distName]) groupedByDistrict[distName] = {};
        if (!groupedByDistrict[distName][branchName]) groupedByDistrict[distName][branchName] = [];
        groupedByDistrict[distName][branchName].push(sub);
      }

      let manifestBody = "";
      let processedCount = 0;

      for (const [districtName, branches] of Object.entries(groupedByDistrict)) {
        const districtFolder = rootFolder?.folder(sanitizeBundleSegment(districtName, 'DISTRICT'));

        for (const [branchName, submissions] of Object.entries(branches)) {
          const branchFolder = districtFolder?.folder(sanitizeBundleSegment(branchName, 'BRANCH'));
          const filterFolder = branchFolder?.folder(`${sanitizeBundleSegment(filterTypeLabel, 'FILTER')}_${dateRangeLabel}`);

          for (const sub of submissions) {
            const customerFolderName = sanitizeBundleSegment(sub.customerName, 'CUSTOMER');
            const customerFolder = filterFolder?.folder(customerFolderName);

            setCurrentActionLabel(`Packaging: ${sub.id} (${sub.customerName})`);

            const fullSub = await getSubmissionById(sub.id);
            let successfulDocs = 0;

            if (fullSub?.documents?.length) {
              for (const doc of fullSub.documents) {
                const downloadUrl = doc.downloadUrl || (doc.previewUrl ? `${doc.previewUrl}?download=1` : null);
                if (!downloadUrl) {
                  failedDocs.push({ caseId: sub.id, docName: doc.name || 'Unknown', reason: 'No download URL available' });
                  continue;
                }

                try {
                  const buffer = await fetchDocumentWithRetry(downloadUrl);
                  if (!buffer) {
                    failedDocs.push({ caseId: sub.id, docName: doc.name || 'Unknown', reason: 'File could not be retrieved from server' });
                    continue;
                  }
                  const safeFileName = resolveDownloadFileName(doc.name, doc.originalName, doc.mimeType);
                  customerFolder?.file(safeFileName, buffer, { binary: true });
                  successfulDocs++;
                } catch {
                  failedDocs.push({ caseId: sub.id, docName: doc.name || 'Unknown', reason: 'Download error' });
                }
              }
            }

            const caseMetadata = `CASE METADATA
==================================================
Case ID:           ${sub.id}
Customer Name:     ${sub.customerName}
Entity Type:       ${sub.entityType || 'Individual'}
Branch:            ${branchName}
District:          ${districtName}
Status:            ${sub.status}
Submitted Date:    ${sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'N/A'}
Last Updated:      ${sub.updatedAt ? new Date(sub.updatedAt).toLocaleString() : 'N/A'}
Documents Included: ${successfulDocs} of ${fullSub?.documents?.length || 0}
==================================================`;

            customerFolder?.file('CASE_METADATA.txt', caseMetadata);
            manifestBody += `[${sub.status}] ${districtName} > ${branchName} > ${sub.id} (${sub.customerName}) - ${successfulDocs}/${fullSub?.documents?.length || 0} documents\n`;
            processedCount++;
            setProgress(Math.round((processedCount / filteredSubmissions.length) * 100));
          }
        }
      }

      // Failure report appended to manifest when docs were skipped
      let failureReport = '';
      if (failedDocs.length > 0) {
        failureReport = `\n\nFAILED DOCUMENTS (${failedDocs.length} file(s) could not be included)\n==================================================\n`;
        failureReport += failedDocs.map(f => `Case ${f.caseId} | ${f.docName}: ${f.reason}`).join('\n');
        failureReport += '\n';
      }

      const manifestHeader = `NIB BANK MASTER KYC EXPORT
==================================================
EXPORT METADATA
==================================================
Authorizing Official:  ${user.name}
Export Timestamp:      ${now.toLocaleString()}
Total Cases:           ${filteredSubmissions.length}
Documents Requested:   ${filteredSubmissions.reduce((sum, sub) => sum + (sub.totalDocCount || 0), 0)}
Documents Included:    ${filteredSubmissions.reduce((sum, sub) => sum + (sub.totalDocCount || 0), 0) - failedDocs.length}
Documents Failed:      ${failedDocs.length}

FILTER CRITERIA
==================================================
Status Filter:         ${filterTypeLabel}
Date Range:            ${dateRangeLabel}
District Filter:       ${selectedDistrict !== 'all' ? selectedDistrict : 'All Districts'}
Branch Filter:         ${selectedBranch !== 'all' ? selectedBranch : 'All Branches'}

==================================================
Root: NIB_KYC_MASTER_EXPORT
  └─ [District Name]
      └─ [Branch Name]
          └─ [${sanitizeBundleSegment(filterTypeLabel, 'FILTER')}_${dateRangeLabel}]
              └─ [Customer Name]
                  ├─ [Document Files]
                  └─ CASE_METADATA.txt

CASE INVENTORY
==================================================
`;

      rootFolder?.file('EXPORT_MANIFEST.txt', manifestHeader + manifestBody + failureReport);

      const filterSummary = `FILTER SUMMARY
==================================================
Export Date:           ${format(now, 'yyyy-MM-dd h:mm:ss a')}
Status Filters:        ${selectedStatuses.length === 0 ? 'All Statuses' : selectedStatuses.map(s => STATUS_OPTIONS.find(opt => opt.id === s)?.label).join(', ')}
Date Range:            ${dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : 'Start'} to ${dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : 'End'}
District:              ${selectedDistrict !== 'all' ? selectedDistrict : 'All'}
Branch:                ${selectedBranch !== 'all' ? selectedBranch : 'All'}
Total Records:         ${filteredSubmissions.length}
Failed Documents:      ${failedDocs.length}
==================================================`;

      rootFolder?.file('FILTER_SUMMARY.txt', filterSummary);

      setCurrentActionLabel("Compressing Archive...");
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NIB_KYC_EXPORT_${timestamp}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (failedDocs.length > 0) {
        toast({
          variant: "destructive",
          title: "Export completed with warnings",
          description: `${processedCount} cases exported. ${failedDocs.length} document(s) could not be retrieved and were skipped. See EXPORT_MANIFEST.txt inside the ZIP for details.`,
        });
      } else {
        toast({
          title: "Export Successful",
          description: `${processedCount} cases exported successfully, organized by district, branch, and filter criteria.`,
        });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Export Failed", description: "The export could not be completed. Please try again. If the problem persists, try narrowing your filter criteria." });
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setCurrentActionLabel("");
    }
  };

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedDistrict("all");
    setSelectedBranch("all");
    setDateRange(undefined);
    setListSearch("");
  };

  // --- Selection helpers ---
  const visibleIds = useMemo(
    () => orderedFilteredSubmissions.map(s => s.id),
    [orderedFilteredSubmissions]
  );
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter(id => selectedIds.has(id)).length,
    [visibleIds, selectedIds]
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () =>
    setSelectedIds(prev => new Set([...prev, ...visibleIds]));
  const deselectAll = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      // Only clear this page's rows, leaving selections made on other pages.
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      });
    } else {
      selectAllVisible();
    }
  };

  /**
   * Selects every case matching the current filters, not just the visible page.
   *
   * The browser no longer holds the whole result set, so the ids are fetched —
   * the smallest thing that can stand in for a selection — oldest first, which
   * is the order archiving should work through.
   */
  const selectAllMatching = async (max: number = BULK_SELECT_LIMIT) => {
    setSelectingAll(true);
    try {
      const result = await getArchiveCaseIds({ ...listFilters, max });
      setSelectedIds(new Set(result.ids));
      if (result.capped) {
        toast({
          title: max < BULK_SELECT_LIMIT ? "Oldest cases selected" : "Selection limited",
          description: `${result.total.toLocaleString()} cases match — selected the oldest ${result.ids.length.toLocaleString()}. Run the action, then select again for the rest.`,
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Could not select", description: "The matching cases could not be listed." });
    } finally {
      setSelectingAll(false);
    }
  };

  // Changing what is being looked at invalidates a selection made against the
  // previous filters; paging does not, so selections survive page changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [listFilters]);

  const TIER_ACTION_FNS: Record<TierAction, (ids: string[]) => Promise<TierActionResult>> = {
    COPY: copyCasesToArchive,
    CUT: cutCasesToArchive,
    RESTORE: restoreCasesFromArchive,
    DELETE: deleteCasesFromArchive,
  };

  /**
   * Runs a tier action over the selection in batches, merging the per-batch
   * results into one so the caller reports a single outcome. Stops on the first
   * batch that fails outright (an unreachable volume fails every batch, and
   * hammering it would only multiply the error).
   */
  const runTierActionInChunks = async (action: TierAction, ids: string[]): Promise<TierActionResult> => {
    const merged: TierActionResult = {
      success: true, action, processedCases: 0, filesProcessed: 0, filesSkipped: 0,
      filesFailed: 0, filesMissing: 0, filesNotFreed: 0, bytesFreed: 0, failures: [],
    };

    for (let i = 0; i < ids.length; i += TIER_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + TIER_CHUNK_SIZE);
      if (ids.length > TIER_CHUNK_SIZE) {
        setTierProgressLabel(`${Math.min(i + chunk.length, ids.length)} of ${ids.length} case(s)…`);
      }

      const res = await TIER_ACTION_FNS[action](chunk);
      if (!res.success && res.error) return { ...merged, success: false, error: res.error };

      merged.processedCases += res.processedCases;
      merged.filesProcessed += res.filesProcessed;
      merged.filesSkipped += res.filesSkipped;
      merged.filesFailed += res.filesFailed;
      merged.filesMissing += res.filesMissing;
      merged.filesNotFreed += res.filesNotFreed;
      merged.bytesFreed += res.bytesFreed;
      merged.failures.push(...res.failures);
    }

    setTierProgressLabel("");
    return merged;
  };

  const executeTierAction = async (action: TierAction) => {
    const ids = [...selectedIds];
    setPendingTierAction(null);
    if (ids.length === 0) return;

    setIsTiering(true);
    try {
      // Each file is copied, checksummed and deleted one at a time, so a large
      // selection is sent as several short requests rather than one that would
      // outlive its timeout with no way to tell what had been done.
      const res = await runTierActionInChunks(action, ids);
      if (!res.success && res.error) {
        toast({ variant: "destructive", title: "Operation failed", description: res.error });
      } else {
        const freed = res.bytesFreed > 0 ? ` Freed ${(res.bytesFreed / (1024 * 1024)).toFixed(1)} MB from primary storage.` : "";
        const missing = res.filesMissing > 0 ? ` ${res.filesMissing} file(s) not found (skipped safely).` : "";
        const otherFailed = res.filesFailed - res.filesMissing;
        const failed = otherFailed > 0 ? ` ${otherFailed} file(s) failed.` : "";
        const skipped = res.filesSkipped > 0 ? ` ${res.filesSkipped} already in place.` : "";
        // The document moved correctly but its original is still occupying space —
        // say so, otherwise the freed figure quietly overstates what was reclaimed.
        const notFreed = res.filesNotFreed > 0
          ? ` ${res.filesNotFreed} original(s) could not be deleted and still take up space.`
          : "";
        const hasWarning = res.filesFailed > 0 || res.filesNotFreed > 0;
        toast({
          variant: hasWarning ? "destructive" : "default",
          title: hasWarning ? "Completed with warnings" : "Operation successful",
          description: `${TIER_ACTION_LABEL[res.action] ?? res.action} done for ${res.processedCases} case(s): ${res.filesProcessed} file(s) processed.${skipped}${missing}${failed}${notFreed}${freed}`,
        });
        if (action !== "COPY") {
          deselectAll();
          await loadInitialData();
          await loadOverview();
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Operation failed", description: "The storage operation could not be completed." });
    } finally {
      setIsTiering(false);
    }
  };

  // --- Storage overview panel ---
  const [overview, setOverview] = useState<ArchiveStorageOverview | null>(null);

  const loadOverview = async () => {
    try {
      setOverview(await getArchiveStorageOverview());
    } catch {
      // A permission or volume problem must not take the page down — the panel
      // simply stays hidden and the rest of the archive tools keep working.
      setOverview(null);
    }
  };

  useEffect(() => { loadOverview(); }, []);

  /**
   * How long ago the case was approved, on the same clock the archiving policy
   * uses — so a row reading "approved 12 days ago" is unambiguous about whether
   * a 7-day policy would already have taken it.
   */
  const caseAgeLabel = (sub: any) => {
    const raw = sub.statusChangedAt || sub.submittedAt;
    if (!raw) return '';
    const days = Math.floor((Date.now() - new Date(raw).getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 0) return 'approved today';
    if (days < 30) return `approved ${days}d ago`;
    if (days < 365) return `approved ${Math.floor(days / 30)}mo ago`;
    return `approved ${(days / 365).toFixed(1)}y ago`;
  };

  /** Older cases read louder, so the ones worth archiving stand out in a page. */
  const ageTone = (sub: any) => {
    const raw = sub.statusChangedAt || sub.submittedAt;
    if (!raw) return 'text-slate-400';
    const days = Math.floor((Date.now() - new Date(raw).getTime()) / (24 * 60 * 60 * 1000));
    if (days >= 365) return 'text-amber-700';
    if (days >= 90) return 'text-amber-600';
    return 'text-slate-500';
  };

  const fmtBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(1)} ${units[unit]}`;
  };

  /** Green while there is room, amber when it needs attention, red when urgent. */
  const diskTone = (freePercent: number | null) => {
    if (freePercent === null) return { text: "text-slate-400", bar: "bg-slate-300" };
    if (freePercent < 10) return { text: "text-red-600", bar: "bg-red-500" };
    if (freePercent < 25) return { text: "text-amber-600", bar: "bg-amber-500" };
    return { text: "text-emerald-600", bar: "bg-emerald-500" };
  };

  // How long documents have sat on the archive holding only copy — the number
  // that reveals a stalled IT backup before it becomes a problem.
  const waitingDays = overview?.waiting.oldestWaitingDays ?? null;
  const waitingTone =
    waitingDays === null || waitingDays <= 7
      ? { text: "text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50/50" }
      : waitingDays <= 21
      ? { text: "text-amber-700", border: "border-amber-200", bg: "bg-amber-50/50" }
      : { text: "text-red-700", border: "border-red-200", bg: "bg-red-50/50" };

  // --- IT backup confirmation (clearing the archive volume) ---
  // The date is the point IT finished copying. Documents that landed on the
  // volume after it have no backup yet, so they must survive the clear.
  const todayISO = () => format(new Date(), 'yyyy-MM-dd');
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backupCutoff, setBackupCutoff] = useState<string>(todayISO());
  const [backupPreview, setBackupPreview] = useState<ArchiveBackupPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isClearingArchive, setIsClearingArchive] = useState(false);
  const [clearProgressLabel, setClearProgressLabel] = useState("");

  const openBackupDialog = () => {
    setBackupCutoff(todayISO());
    setBackupPreview(null);
    setBackupDialogOpen(true);
  };

  // Refresh the preview whenever the dialog opens or the date changes, so the
  // person confirming always sees the consequence of the date they picked.
  useEffect(() => {
    if (!backupDialogOpen || !backupCutoff) return;
    let cancelled = false;
    setLoadingPreview(true);
    getArchiveBackupPreview(backupCutoff)
      .then(preview => { if (!cancelled) setBackupPreview(preview); })
      .catch(() => { if (!cancelled) setBackupPreview(null); })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });
    return () => { cancelled = true; };
  }, [backupDialogOpen, backupCutoff]);

  const runBackupClear = async () => {
    setBackupDialogOpen(false);
    setIsClearingArchive(true);
    let cleared = 0;
    let failed = 0;
    let bytes = 0;

    try {
      // Runs in server-side batches: keep calling until nothing eligible is
      // left, so a confirmation covering thousands of files never depends on
      // one long request surviving.
      for (let pass = 0; pass < 500; pass++) {
        const res = await confirmArchiveBackupAndClear(backupCutoff);
        if (res.error) {
          toast({ variant: "destructive", title: "Could not clear the archive", description: res.error });
          break;
        }
        cleared += res.filesCleared;
        failed += res.filesFailed;
        bytes += res.bytesFreed;
        setClearProgressLabel(`${cleared} file(s) cleared, ${res.remaining} remaining…`);

        // Nothing left, or nothing could be cleared this pass — stop rather
        // than loop forever on files that keep failing.
        if (res.remaining === 0 || res.filesCleared === 0) break;
      }

      const freed = bytes > 0 ? ` Freed ${(bytes / (1024 * 1024)).toFixed(1)} MB from the archive volume.` : "";
      const failedText = failed > 0 ? ` ${failed} file(s) could not be deleted and are still listed.` : "";
      toast({
        variant: failed > 0 ? "destructive" : "default",
        title: failed > 0 ? "Completed with warnings" : "Archive cleared",
        description: `${cleared} file(s) cleared after backup confirmation.${failedText}${freed} Case records were kept.`,
      });
      deselectAll();
      await loadInitialData();
      await loadOverview();
    } catch {
      toast({ variant: "destructive", title: "Could not clear the archive", description: "The operation could not be completed." });
    } finally {
      setIsClearingArchive(false);
      setClearProgressLabel("");
    }
  };

  /**
   * What to call each action when reporting it back. The internal ids stay CUT
   * and STORAGE_TIER_CUT — renaming those would break continuity with every
   * audit entry already written — but nobody reading a toast should see them.
   */
  const TIER_ACTION_LABEL: Record<TierAction, string> = {
    COPY: "Copy to E:",
    CUT: "Move to E:",
    RESTORE: "Restore",
    DELETE: "Delete from E:",
  };

  const TIER_ACTION_COPY: Record<TierAction, { title: string; body: string; confirm: string }> = {
    COPY: {
      title: "Copy selected cases to archive (E:)?",
      body: "This duplicates the documents of the selected cases onto the archive volume. Originals stay in primary storage — nothing is removed.",
      confirm: "Copy to E:",
    },
    CUT: {
      title: "Move selected cases to archive (E:)?",
      body: "This relocates the documents off primary storage to the archive volume to free space. Files remain viewable (served from E:). This removes the originals from the secure folder.",
      confirm: "Move to E:",
    },
    RESTORE: {
      title: "Restore selected cases to primary storage?",
      body: "This copies archived documents back into the secure folder and removes the archive copy. Use this to bring cases back onto fast storage.",
      confirm: "Restore",
    },
    DELETE: {
      title: "Delete archived files from E: (records kept)?",
      body: "This deletes the selected cases' documents from the archive volume to reclaim space, but KEEPS their records. The cases stay in the Archived list and can be restored later by re-placing the original file in the archive (under its storage key) and running Restore.",
      confirm: "Delete files from E:",
    },
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
            <Folders className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 font-headline">Master Case Bundle</h1>
            <p className="text-muted-foreground font-medium">Bulk institutional export with structured regional folders.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-4 h-11 rounded-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Authorized HQ Access
          </Badge>
        </div>
      </div>

      {overview && (
        <Card className="border-slate-200 shadow-xl overflow-hidden bg-white rounded-[2rem]">
          <CardHeader className="bg-slate-50/50 border-b py-4 px-6">
            <CardTitle className="text-lg flex items-center gap-2 font-bold text-slate-900">
              <HardDriveDownload className="w-5 h-5 text-primary" />
              Storage Overview
              {/* A move runs as a sequence of short requests and these figures
                  are only refetched once it finishes. Without saying so, the
                  panel looks simply wrong for as long as the move takes. */}
              {(isTiering || isClearingArchive) && (
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Files are moving — updated when it finishes
                </span>
              )}
            </CardTitle>
            <CardDescription>Where documents physically are, and how much room is left.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">In secure folder (C:)</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">{overview.primary.files.toLocaleString()}</div>
                <div className="text-xs font-semibold text-slate-500">{fmtBytes(overview.primary.bytes)}</div>
              </div>
              <div className={cn("rounded-2xl border p-5", waitingTone.border, waitingTone.bg)}>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Waiting on archive (E:)</div>
                <div className={cn("mt-1 text-2xl font-extrabold", waitingTone.text)}>{overview.waiting.files.toLocaleString()}</div>
                <div className="text-xs font-semibold text-slate-500">{fmtBytes(overview.waiting.bytes)}</div>
                {/* Between the move and the IT copy this volume holds the only
                    copy, so a growing wait is the signal that matters most. */}
                <div className={cn("mt-1 text-xs font-bold", waitingTone.text)}>
                  {overview.waiting.oldestWaitingDays === null
                    ? "Nothing waiting"
                    : `Oldest waiting ${overview.waiting.oldestWaitingDays} day(s) for IT backup`}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Backed up &amp; cleared</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">{overview.cleared.files.toLocaleString()}</div>
                <div className="text-xs font-semibold text-slate-500">Records kept, restorable</div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {([['Secure folder (C:)', overview.volumes.primary], ['Archive volume (E:)', overview.volumes.archive]] as const).map(
                ([label, vol]) => {
                  const tone = diskTone(vol.freePercent);
                  return (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                        <span className={cn("text-sm font-extrabold", tone.text)}>
                          {vol.available ? `${fmtBytes(vol.freeBytes)} free` : "Not reachable"}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={cn("h-full rounded-full", tone.bar)}
                          style={{ width: `${vol.available && vol.freePercent !== null ? Math.max(2, 100 - vol.freePercent) : 100}%` }}
                        />
                      </div>
                      <div className="mt-1 truncate text-[11px] font-medium text-slate-400" title={vol.root}>
                        {vol.available && vol.freePercent !== null
                          ? `${vol.freePercent.toFixed(0)}% free of ${fmtBytes(vol.totalBytes)} — ${vol.root}`
                          : vol.root}
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            <div className="grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2">
              <div>
                Last move to archive:{" "}
                {overview.lastMoveToArchive
                  ? format(new Date(overview.lastMoveToArchive.at), "dd MMM yyyy, HH:mm")
                  : "never"}
              </div>
              <div>
                Last IT backup confirmed:{" "}
                {overview.lastBackupClear
                  ? format(new Date(overview.lastBackupClear.at), "dd MMM yyyy, HH:mm")
                  : "never"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {/* FILTER CONSOLE — laid out like the Document Vault's. Every control
            still resolves in the database and fetches exactly what it did
            before, so the new look adds no server work. */}
        <Card className="border-slate-200 shadow-xl overflow-hidden bg-white rounded-[2rem]">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <SlidersHorizontal className="w-5 h-5" /> Archive Filters
              </div>
              {filterTotals && (
                <span className="text-[11px] font-bold text-slate-600">
                  {filterTotals.cases.toLocaleString()} case(s) · {filterTotals.files.toLocaleString()} file(s) ·{" "}
                  <span className="font-black text-slate-900">{fmtBytes(filterTotals.bytes)}</span>
                  {viewMode === 'active' ? ' would be freed from C:' : ' on the archive volume'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Case ID, Customer, Branch..."
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className="pl-9 h-11 bg-slate-50 border-slate-200 rounded-xl font-medium focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">District</label>
                <Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("all"); }}>
                  <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                    <SelectValue placeholder="All Districts" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Districts</SelectItem>
                    {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Branch</label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-72">
                    <SelectItem value="all">{selectedDistrict === 'all' ? 'All Branches' : `All Branches in ${selectedDistrict}`}</SelectItem>
                    {branches?.filter(b => selectedDistrict === 'all' || b.district?.name === selectedDistrict).map(b => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status is fixed: only approved cases are ever archived. */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Status</label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                    Approved
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">only</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-3">
              <Button
                onClick={resetFilters}
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-600"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Reset Filters
              </Button>
              <Button
                className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-2 px-5 shadow-lg"
                onClick={handleDownloadMasterBundle}
                disabled={isProcessing || drillLevel !== 'case' || totalRecords === 0}
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {progress}% — {currentActionLabel || 'Working'}</>
                ) : (
                  <>
                    <FileArchive className="w-5 h-5" />
                    {drillLevel !== 'case'
                      ? 'Open a branch to export'
                      : exportIsCapped
                      ? `Export oldest ${EXPORT_CASE_LIMIT.toLocaleString()} of ${totalRecords.toLocaleString()}`
                      : `Export ${totalRecords.toLocaleString()} Cases`}
                  </>
                )}
              </Button>
            </div>

            {/* Said before the click, not after it: a capped export is normal at
                this scale, and the cases left behind are simply the newer ones. */}
            {exportIsCapped && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {totalRecords.toLocaleString()} cases match, and one download holds {EXPORT_CASE_LIMIT.toLocaleString()}.
                  You will get the {EXPORT_CASE_LIMIT.toLocaleString()} that have waited longest; the remaining{" "}
                  {(totalRecords - EXPORT_CASE_LIMIT).toLocaleString()} stay here for the next run.
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* One card: toolbar, then the list — the Document Vault's shape. The
            toolbar sticks to the top of the card while the rows scroll. */}
        <Card className="border-slate-200 shadow-xl overflow-hidden bg-white rounded-[2rem]">
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-slate-50/80 backdrop-blur p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-primary text-white rounded-lg"><FileArchive className="w-4 h-4" /></div>
                <div>
                  <div className="font-black text-sm tracking-tight text-slate-900">
                    {viewMode === 'deleted' ? 'Deleted Bin (recoverable)' : viewMode === 'archived' ? 'Archived Vault (E:)' : 'Export Discovery Queue'}
                  </div>
                  {/* Breadcrumb — where you are, and the way back out. */}
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                    <button
                      type="button"
                      onClick={goToDistricts}
                      className={cn(openDistrict ? "text-primary hover:underline" : "text-slate-400")}
                    >
                      All regions
                    </button>
                    {openDistrict && (
                      <>
                        <ChevronRight className="h-3 w-3 text-slate-300" />
                        <button
                          type="button"
                          onClick={goToBranches}
                          className={cn(openBranch ? "text-primary hover:underline" : "text-slate-400")}
                        >
                          {openDistrict}
                        </button>
                      </>
                    )}
                    {openBranch && (
                      <>
                        <ChevronRight className="h-3 w-3 text-slate-300" />
                        <span className="text-slate-400">{openBranch}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Active vs Archived view toggle */}
                <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('active')}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors",
                      viewMode === 'active' ? "bg-primary text-white" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('archived')}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors",
                      viewMode === 'archived' ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    Archived
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('deleted')}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors",
                      viewMode === 'deleted' ? "bg-red-500 text-white" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    Deleted
                  </button>
                </div>
                <Badge variant="outline" className="bg-white text-[10px] font-black uppercase tracking-widest px-3 py-1">
                  {drillLevel === "district" ? `${districtRows.length} Regions` : drillLevel === "branch" ? `${branchRows.length} Branches` : `${totalRecords.toLocaleString()} Records`}
                </Badge>
              </div>
            </div>

            {/* Result counter — the search box now lives in the filter console. */}
            {!loading && drillLevel === 'case' && (
              <div className="flex items-center justify-end border-b bg-white px-5 py-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {totalRecords > 0
                    ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalRecords)} of ${totalRecords}`
                    : "No matching records"}
                </span>
              </div>
            )}

            {/* Selection toolbar: select-all + tier actions (copy / cut / restore to E:) */}
            {!loading && drillLevel === 'case' && orderedFilteredSubmissions.length > 0 && (
              <div className="flex flex-col gap-3 border-b bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all visible cases"
                  />
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-black uppercase tracking-widest text-slate-600 hover:text-primary"
                  >
                    {allVisibleSelected ? "Deselect page" : "Select page"}
                  </button>
                  {/* The browser holds one page, so selecting everything that
                      matches is a separate, explicit request to the server. */}
                  {totalRecords > visibleIds.length && (
                    <>
                      <button
                        type="button"
                        onClick={() => selectAllMatching()}
                        disabled={selectingAll || isTiering}
                        className="text-xs font-black uppercase tracking-widest text-primary hover:underline disabled:opacity-50"
                      >
                        {selectingAll ? "Selecting…" : `Select all ${totalRecords.toLocaleString()} matching`}
                      </button>
                      {/* Working the backlog down in batches beats one enormous
                          move: each finishes quickly and the result is visible
                          before the next one starts. */}
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">oldest</span>
                      {OLDEST_BATCHES.filter(n => n < totalRecords).map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => selectAllMatching(n)}
                          disabled={selectingAll || isTiering}
                          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50"
                        >
                          {n}
                        </button>
                      ))}
                    </>
                  )}
                  <span className="text-[11px] font-bold text-slate-400">
                    {selectedIds.size} selected
                  </span>
                  {selectedIds.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={deselectAll} className="h-7 px-2 text-[10px] font-bold text-slate-400 hover:text-primary">
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {viewMode === 'active' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("COPY")}
                        className="h-9 rounded-lg text-xs gap-1.5 font-bold border-slate-200"
                        title="Copy selected to archive (E:) — keeps originals"
                      >
                        <Copy className="h-4 w-4" /> Copy to E:
                      </Button>
                      <Button
                        size="sm"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("CUT")}
                        className="h-9 rounded-lg text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        title="Move selected to archive (E:) — frees primary storage"
                      >
                        {isTiering ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />} Move to E:
                      </Button>
                    </>
                  ) : viewMode === 'archived' ? (
                    <>
                      <Button
                        size="sm"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("RESTORE")}
                        className="h-9 rounded-lg text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        title="Restore selected from archive back to primary storage"
                      >
                        {isTiering ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />} Restore to Primary
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("DELETE")}
                        className="h-9 rounded-lg text-xs gap-1.5 font-bold border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete selected files from the archive (E:) to free space — record kept, restorable"
                      >
                        <Trash2 className="h-4 w-4" /> Delete from E:
                      </Button>
                      {/* Works on the whole volume by date, not on the ticked
                          rows — the IT copy covers everything archived up to a
                          point in time, not a hand-picked selection. */}
                      <Button
                        size="sm"
                        disabled={isTiering || isClearingArchive}
                        onClick={openBackupDialog}
                        className="h-9 rounded-lg text-xs gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold"
                        title="IT has copied the archive to the institutional backup — free the volume for the next batch"
                      >
                        {isClearingArchive
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ShieldCheck className="h-4 w-4" />} IT backup confirmed
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={selectedIds.size === 0 || isTiering}
                      onClick={() => setPendingTierAction("RESTORE")}
                      className="h-9 rounded-lg text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      title="Restore selected — re-place the original file on E: first, then restore"
                    >
                      {isTiering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Restore
                    </Button>
                  )}
                </div>
              </div>
            )}
            <CardContent className="p-0 min-h-[400px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-40 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="font-black uppercase tracking-widest text-xs">
                    {drillLevel === 'district' ? 'Loading regions…' : drillLevel === 'branch' ? 'Loading branches…' : 'Loading cases…'}
                  </p>
                </div>
              ) : drillLevel !== 'case' ? (
                /* Folder levels: one row per district or branch, with the number
                   of cases inside. A grouped count over indexed columns, so this
                   costs the same whether the bank holds 5,000 files or 5,000,000. */
                folderRows.length > 0 ? (
                  <>
                  <div className="divide-y divide-slate-100">
                    {pagedFolderRows.map(row => (
                      <button
                        key={row.name}
                        type="button"
                        onClick={() => drillLevel === 'district' ? openDistrictFolder(row.name) : openBranchFolder(row.name)}
                        className="group/folder flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-slate-200 p-1.5 text-slate-600 transition-colors group-hover/folder:bg-primary group-hover/folder:text-white">
                            {drillLevel === 'district' ? <Folder className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                          </div>
                          <span className="font-black text-sm tracking-tight text-slate-900">
                            {drillLevel === 'district' ? `${row.name} District` : row.name}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 shadow-sm">
                            {row.cases.toLocaleString()} Case{row.cases === 1 ? '' : 's'}
                          </span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </button>
                    ))}
                  </div>
                  {/* Same control as the case list below, so moving between a
                      folder level and the cases inside it feels like one list. */}
                  {folderTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 border-t bg-slate-50/50 p-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeFolderPage <= 1}
                        onClick={() => setFolderPage(p => Math.max(1, p - 1))}
                        className="h-9 rounded-lg text-xs gap-1 font-bold border-slate-200"
                      >
                        <ChevronLeft className="h-4 w-4" /> Prev
                      </Button>
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Page {safeFolderPage} of {folderTotalPages}
                        <span className="ml-2 text-slate-400">
                          ({folderRows.length.toLocaleString()} {drillLevel === 'district' ? 'regions' : 'branches'})
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeFolderPage >= folderTotalPages}
                        onClick={() => setFolderPage(p => Math.min(folderTotalPages, p + 1))}
                        className="h-9 rounded-lg text-xs gap-1 font-bold border-slate-200"
                      >
                        Next <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-40">
                    <Folders className="h-10 w-10 text-slate-300" />
                    <p className="font-black uppercase tracking-widest text-xs text-slate-400">
                      Nothing matches the current filters
                    </p>
                  </div>
                )
              ) : orderedFilteredSubmissions.length > 0 ? (
                <>
                <div className="divide-y divide-slate-100">
                  {pagedSubmissions.map(sub => (
                    <div key={sub.id} className={cn("px-4 py-3.5 transition-colors group", selectedIds.has(sub.id) ? "bg-primary/5" : "hover:bg-slate-50")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <Checkbox
                            checked={selectedIds.has(sub.id)}
                            onCheckedChange={() => toggleSelect(sub.id)}
                            aria-label={`Select case ${sub.id}`}
                            className="mt-2"
                          />
                          <div className={cn("p-2 rounded-lg", sub.status === KYC_STATUS.APPROVED ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/5 text-primary')}>
                            {sub.status === KYC_STATUS.APPROVED ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900">{sub.customerName}</span>
                              <Badge variant="outline" className="text-[8px] font-black uppercase px-1.5 h-4">{sub.entityType || 'Individual'}</Badge>
                            </div>
                            {extractAccountNumber(sub) && (
                              <span className="text-[10px] text-muted-foreground font-mono font-medium block">
                                Acc: {maskAccountNumber(extractAccountNumber(sub))}
                              </span>
                            )}
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <span className="text-primary font-black">{sub.id}</span>
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {sub.branchName?.toLowerCase().includes('branch') ? sub.branchName : `${sub.branchName} Branch`}</span>
                            </div>
                          </div>
                        </div>
                        {/* Age and size decide what gets archived, so they sit in
                            their own right-hand column: aligned down the page,
                            they can be compared at a glance instead of being
                            read out of a sentence on each row. */}
                        <div className="flex shrink-0 items-center gap-5">
                          <div className="hidden text-right sm:block">
                            <div className={cn("text-xs font-black tabular-nums", ageTone(sub))}>
                              {caseAgeLabel(sub) || '—'}
                            </div>
                            <div className="text-[11px] font-bold text-slate-400 tabular-nums">
                              {sub.totalDocCount > 0
                                ? `${sub.totalDocCount} doc${sub.totalDocCount === 1 ? '' : 's'} · ${fmtBytes(sub.sizeBytes || 0)}`
                                : 'no documents'}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {sub.isDeleted ? (
                              <Badge className="bg-red-100 text-red-700 border-red-200 font-black text-[9px] uppercase gap-1">
                                <Trash2 className="w-3 h-3" /> Deleted
                              </Badge>
                            ) : sub.isArchived ? (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-black text-[9px] uppercase gap-1">
                                <FileArchive className="w-3 h-3" /> On E:
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-white border font-bold text-[9px] uppercase text-slate-500">
                                On C:
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-4 border-t bg-slate-50/50 p-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="h-9 rounded-lg text-xs gap-1 font-bold border-slate-200"
                    >
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Button>
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                      Page {safePage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="h-9 rounded-lg text-xs gap-1 font-bold border-slate-200"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-48 text-center space-y-6">
                  <div className="p-8 bg-slate-50 rounded-full">
                    <Search className="w-16 h-16 text-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-black text-slate-900 text-xl">
                      {viewMode === 'deleted' ? 'Deleted Bin Empty' : viewMode === 'archived' ? 'No Archived Cases' : 'Archive Discovery Standby'}
                    </p>
                    <p className="text-sm text-slate-400 font-medium">
                      {viewMode === 'deleted'
                        ? 'No soft-deleted cases match these filters. Deleting from the archive (E:) frees space but keeps records here for restore.'
                        : viewMode === 'archived'
                        ? 'No cases matched these filters in the archive vault. Adjust the date, district, or branch filters.'
                        : 'Adjust filters to populate the master export queue.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
      </div>

      <AlertDialog open={pendingTierAction !== null} onOpenChange={(open) => { if (!open) setPendingTierAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTierAction ? TIER_ACTION_COPY[pendingTierAction].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTierAction ? TIER_ACTION_COPY[pendingTierAction].body : ""}
              {pendingTierAction === 'RESTORE' && viewMode === 'deleted' && (
                <span className="mt-2 block font-semibold text-amber-700">
                  This case was deleted from the archive. Put the original file back on the archive volume (E:) under its storage key first — it is verified against its recorded checksum before restoring.
                </span>
              )}
              <span className="mt-2 block font-bold text-slate-700">{selectedIds.size} case(s) selected.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingTierAction && executeTierAction(pendingTierAction)}
              className={cn(
                pendingTierAction === "CUT" && "bg-amber-600 hover:bg-amber-700",
                pendingTierAction === "DELETE" && "bg-red-600 hover:bg-red-700"
              )}
            >
              {pendingTierAction ? TIER_ACTION_COPY[pendingTierAction].confirm : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm the IT backup and clear the archive volume?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Confirm only after the IT team has copied the archive volume into the institutional
                  backup. The files are deleted from the volume; every case record is kept and stays
                  restorable if the backup copy is put back.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="backup-cutoff" className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    IT finished copying on
                  </Label>
                  <Input
                    id="backup-cutoff"
                    type="date"
                    value={backupCutoff}
                    max={todayISO()}
                    onChange={(e) => setBackupCutoff(e.target.value)}
                    className="h-10 font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Only documents archived on or before this date are cleared. Anything that arrived
                    after it has not been backed up yet and is left untouched.
                  </p>
                </div>

                {loadingPreview ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking the archive volume…
                  </div>
                ) : backupPreview ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="font-bold text-slate-800">
                      {backupPreview.files.toLocaleString()} file(s) in {backupPreview.cases.toLocaleString()} case(s)
                      {" "}will be cleared ({(backupPreview.bytes / (1024 * 1024)).toFixed(1)} MB freed).
                    </div>
                    {backupPreview.oldestArchivedAt && (
                      <div className="mt-1 text-xs text-slate-600">
                        Oldest waiting since {format(new Date(backupPreview.oldestArchivedAt), 'dd MMM yyyy')}.
                      </div>
                    )}
                    {backupPreview.filesAfterCutoff > 0 && (
                      <div className="mt-1 text-xs font-semibold text-emerald-700">
                        {backupPreview.filesAfterCutoff.toLocaleString()} newer file(s) stay on the volume — not yet backed up.
                      </div>
                    )}
                    {backupPreview.filesWithoutArchiveDate > 0 && (
                      <div className="mt-1 text-xs font-semibold text-amber-700">
                        {backupPreview.filesWithoutArchiveDate.toLocaleString()} file(s) have no archive date and are never
                        cleared automatically — use Delete from E: for those.
                      </div>
                    )}
                  </div>
                ) : null}

                <p className="font-semibold text-amber-700">
                  After clearing, these documents cannot be opened in the system until IT restores them.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBackupClear}
              disabled={!backupPreview || backupPreview.files === 0}
              className="bg-slate-800 hover:bg-slate-900"
            >
              {backupPreview && backupPreview.files > 0
                ? `Clear ${backupPreview.files.toLocaleString()} file(s)`
                : "Nothing to clear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {((isClearingArchive && clearProgressLabel) || (isTiering && tierProgressLabel)) && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-2xl">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isClearingArchive ? clearProgressLabel : tierProgressLabel}
        </div>
      )}
    </div>
  );
}
