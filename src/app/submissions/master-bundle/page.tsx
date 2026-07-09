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
  Filter,
  Building2,
  ShieldCheck,
  Loader2,
  FileArchive,
  CheckCircle2,
  Clock,
  Search,
  RotateCcw,
  Copy,
  Scissors,
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
import { cn } from "@/lib/utils";
import { getSubmissions, getSubmissionById } from "@/actions/submissions";
import { getBranches, getDistricts } from "@/actions/hierarchy";
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import { sortSubmissionsOldestFirst } from "@/lib/submission-sort";
import {
  buildBundleRootName,
  getSubmissionBranchName,
  getSubmissionDistrictName,
  sanitizeBundleSegment,
} from "@/lib/bundle-path";
import { resolveDownloadFileName } from "@/lib/documents";

const STATUS_OPTIONS = [
  { id: KYC_STATUS.APPROVED, label: 'Approved' },
  { id: KYC_STATUS.SUBMITTED, label: 'Submitted / In Review' },
  { id: KYC_STATUS.ACTION_REQUIRED, label: 'Need Amendment' },
  { id: KYC_STATUS.REJECTED, label: 'Rejected' },
  { id: KYC_STATUS.ESCALATED, label: 'Escalated' }
];

export default function MasterBundleDownloadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
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
  // Active = cases still on primary storage; Archived = cases moved to E:;
  // Deleted = soft-deleted (bytes freed from E:, record kept, restorable).
  const [viewMode, setViewMode] = useState<'active' | 'archived' | 'deleted'>('active');
  // List search + pagination so the list stays fast/clear with large datasets.
  const [listSearch, setListSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    loadInitialData();
  }, [dateRange]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      let filters: any = { limit: 5000 };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }

      const [subs, b, d] = await Promise.all([
        getSubmissions(filters),
        getBranches(),
        getDistricts()
      ]);
      setAllSubmissions(subs.submissions);
      setBranches(b);
      setDistricts(d);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Error", description: "Could not retrieve records." });
    } finally {
      setLoading(false);
    }
  };

  const filteredSubmissions = useMemo(() => {
    if (!allSubmissions) return [];
    
    // Normalize for resilient name matching — district/branch names are
    // denormalized onto cases and can drift in casing/whitespace from the
    // dropdown values, so compare trimmed + lower-cased rather than exact.
    const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase();

    return allSubmissions.filter(sub => {
      const matchesStatus = selectedStatuses.length === 0 ||
                           (selectedStatuses.includes(KYC_STATUS.SUBMITTED) ? [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(sub.status) : selectedStatuses.includes(sub.status));
      const matchesDistrict = selectedDistrict === 'all' || norm(getSubmissionDistrictName(sub)) === norm(selectedDistrict);
      const matchesBranch = selectedBranch === 'all' || norm(getSubmissionBranchName(sub)) === norm(selectedBranch);
      // Active view hides archived/deleted cases; Archived shows only archived
      // (and not deleted); Deleted shows only soft-deleted cases.
      const matchesView =
        viewMode === 'deleted'
          ? !!sub.isDeleted
          : viewMode === 'archived'
          ? !!sub.isArchived
          : (!sub.isArchived && !sub.isDeleted);
      const q = listSearch.trim().toLowerCase();
      const matchesSearch = !q ||
        (sub.customerName || "").toLowerCase().includes(q) ||
        (sub.id || "").toLowerCase().includes(q) ||
        norm(getSubmissionBranchName(sub)).includes(q) ||
        norm(getSubmissionDistrictName(sub)).includes(q);

      return matchesStatus && matchesDistrict && matchesBranch && matchesView && matchesSearch;
    });
  }, [allSubmissions, selectedStatuses, selectedDistrict, selectedBranch, viewMode, listSearch]);

  const orderedFilteredSubmissions = useMemo(() => {
    return sortSubmissionsOldestFirst(filteredSubmissions || []);
  }, [filteredSubmissions]);

  // Pagination: only render the current page so the DOM stays light with thousands of records.
  const totalRecords = orderedFilteredSubmissions.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedSubmissions = useMemo(
    () => orderedFilteredSubmissions.slice(pageStart, pageStart + PAGE_SIZE),
    [orderedFilteredSubmissions, pageStart]
  );

  // Reset to page 1 whenever the result set changes (filters, search, view).
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatuses, selectedDistrict, selectedBranch, viewMode, listSearch, dateRange]);

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
    if (!user || filteredSubmissions.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    const failedDocs: { caseId: string; docName: string; reason: string }[] = [];

    try {
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
Documents Requested:   ${filteredSubmissions.reduce((sum, sub) => sum + (sub.documents?.length || 0), 0)}
Documents Included:    ${filteredSubmissions.reduce((sum, sub) => sum + (sub.documents?.length || 0), 0) - failedDocs.length}
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
Export Date:           ${format(now, 'yyyy-MM-dd HH:mm:ss')}
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

  const selectAllVisible = () => setSelectedIds(new Set(visibleIds));
  const deselectAll = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    if (allVisibleSelected) deselectAll(); else selectAllVisible();
  };

  // Drop selections that are no longer in the filtered view.
  useEffect(() => {
    setSelectedIds(prev => {
      const visible = new Set(visibleIds);
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const TIER_ACTION_FNS: Record<TierAction, (ids: string[]) => Promise<TierActionResult>> = {
    COPY: copyCasesToArchive,
    CUT: cutCasesToArchive,
    RESTORE: restoreCasesFromArchive,
    DELETE: deleteCasesFromArchive,
  };

  const executeTierAction = async (action: TierAction) => {
    const ids = [...selectedIds];
    setPendingTierAction(null);
    if (ids.length === 0) return;

    setIsTiering(true);
    try {
      const res = await TIER_ACTION_FNS[action](ids);
      if (!res.success && res.error) {
        toast({ variant: "destructive", title: "Operation failed", description: res.error });
      } else {
        const freed = res.bytesFreed > 0 ? ` Freed ${(res.bytesFreed / (1024 * 1024)).toFixed(1)} MB from primary storage.` : "";
        const missing = res.filesMissing > 0 ? ` ${res.filesMissing} file(s) not found (skipped safely).` : "";
        const otherFailed = res.filesFailed - res.filesMissing;
        const failed = otherFailed > 0 ? ` ${otherFailed} file(s) failed.` : "";
        const skipped = res.filesSkipped > 0 ? ` ${res.filesSkipped} already in place.` : "";
        toast({
          variant: res.filesFailed > 0 ? "destructive" : "default",
          title: res.filesFailed > 0 ? "Completed with warnings" : "Operation successful",
          description: `${res.action} done for ${res.processedCases} case(s): ${res.filesProcessed} file(s) processed.${skipped}${missing}${failed}${freed}`,
        });
        if (action !== "COPY") {
          deselectAll();
          await loadInitialData();
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Operation failed", description: "The storage operation could not be completed." });
    } finally {
      setIsTiering(false);
    }
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
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-lg">
              <Folders className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Master Case Bundle</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Bulk institutional export with structured regional folders.</p>
        </div>
        <div className="flex items-center gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-4 py-1.5 font-bold h-10 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Authorized HQ Access
          </Badge>
        </div>
      </div>

      <div className="space-y-6">
        {/* Fixed filter region: Export Control AND the Discovery Queue header both
            stay pinned at the top of the scroll area while the list scrolls. The
            page scrolls inside <main> (dashboard-shell), so top-0 pins them right
            under the global nav. */}
        <div className="sticky top-0 z-30 space-y-4 bg-[#FCFAF7] pt-2">
        {/* Export Control: full-width horizontal bar. */}
        <Card className="shadow-xl border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b py-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Export Control
            </CardTitle>
            <CardDescription>Organize bulk archiving by region or status.</CardDescription>
          </CardHeader>
          <CardContent className="py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              {/* Status queues as toggle chips */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Queues</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(status => {
                    const active = selectedStatuses.includes(status.id);
                    return (
                      <button
                        key={status.id}
                        type="button"
                        onClick={() => handleToggleStatus(status.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                          active
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {status.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Region, branch and actions */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[180px]">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Regional District</Label>
                  <Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("all"); }}>
                    <SelectTrigger className="h-10 bg-white">
                      <SelectValue placeholder="All Regions" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-2xl border-none">
                      <SelectItem value="all">Overall (All Regions)</SelectItem>
                      {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 min-w-[180px]">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Branch Office</Label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger className="h-10 bg-white">
                      <SelectValue placeholder="All Branches" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-2xl border-none max-h-72">
                      <SelectItem value="all">{selectedDistrict === 'all' ? 'All Branches' : `All Branches in ${selectedDistrict}`}</SelectItem>
                      {branches?.filter(b => selectedDistrict === 'all' || b.district?.name === selectedDistrict).map(b => (
                        <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="ghost" onClick={resetFilters} className="h-10 gap-2 font-bold text-slate-400 hover:text-primary">
                  <RotateCcw className="w-4 h-4" /> Reset
                </Button>

                <Button
                  className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-2 px-5 shadow-lg"
                  onClick={handleDownloadMasterBundle}
                  disabled={isProcessing || orderedFilteredSubmissions.length === 0}
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {progress}% — {currentActionLabel || 'Working'}</>
                  ) : (
                    <><FileArchive className="w-5 h-5" /> Export {orderedFilteredSubmissions.length} Cases</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Discovery Queue header strip (header, view toggle, search, bulk actions)
            — sits in the fixed region, above the scrolling list. */}
        <Card className="shadow-2xl border-slate-200 overflow-hidden bg-white">
            <CardHeader className="bg-slate-900 text-white border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white/10 rounded-lg"><FileArchive className="w-5 h-5 text-emerald-400" /></div>
                <div><CardTitle className="text-xl">{viewMode === 'deleted' ? 'Deleted Bin (recoverable)' : viewMode === 'archived' ? 'Archived Vault (E:)' : 'Export Discovery Queue'}</CardTitle></div>
              </div>
              <div className="flex items-center gap-3">
                {/* Active vs Archived view toggle */}
                <div className="flex rounded-lg bg-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('active')}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors",
                      viewMode === 'active' ? "bg-white text-slate-900" : "text-white/70 hover:text-white"
                    )}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('archived')}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors",
                      viewMode === 'archived' ? "bg-emerald-500 text-white" : "text-white/70 hover:text-white"
                    )}
                  >
                    Archived
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('deleted')}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors",
                      viewMode === 'deleted' ? "bg-red-500 text-white" : "text-white/70 hover:text-white"
                    )}
                  >
                    Deleted
                  </button>
                </div>
                <Badge className="bg-emerald-600 text-white font-black px-4 py-1">{orderedFilteredSubmissions.length} Records</Badge>
              </div>
            </CardHeader>
            {/* Search + result counter for large datasets */}
            {!loading && (
              <div className="flex flex-col gap-3 border-b bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search case ID, customer, branch…"
                    className="pl-9 h-9 border-slate-200 font-bold"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                  />
                </div>
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  {totalRecords > 0
                    ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalRecords)} of ${totalRecords}`
                    : "No matching records"}
                </span>
              </div>
            )}

            {/* Selection toolbar: select-all + tier actions (copy / cut / restore to E:) */}
            {!loading && orderedFilteredSubmissions.length > 0 && (
              <div className="flex flex-col gap-3 border-b bg-slate-50/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                    {allVisibleSelected ? "Deselect all" : `Select all ${totalRecords}`}
                  </button>
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
                        className="h-9 gap-1.5 font-bold border-slate-200"
                        title="Copy selected to archive (E:) — keeps originals"
                      >
                        <Copy className="h-4 w-4" /> Copy to E:
                      </Button>
                      <Button
                        size="sm"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("CUT")}
                        className="h-9 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        title="Move selected to archive (E:) — frees primary storage"
                      >
                        {isTiering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Cut to E:
                      </Button>
                    </>
                  ) : viewMode === 'archived' ? (
                    <>
                      <Button
                        size="sm"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("RESTORE")}
                        className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        title="Restore selected from archive back to primary storage"
                      >
                        {isTiering ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />} Restore to Primary
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedIds.size === 0 || isTiering}
                        onClick={() => setPendingTierAction("DELETE")}
                        className="h-9 gap-1.5 font-bold border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete selected files from the archive (E:) to free space — record kept, restorable"
                      >
                        <Trash2 className="h-4 w-4" /> Delete from E:
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={selectedIds.size === 0 || isTiering}
                      onClick={() => setPendingTierAction("RESTORE")}
                      className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      title="Restore selected — re-place the original file on E: first, then restore"
                    >
                      {isTiering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Restore
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Scrolling list (separate card, below the fixed region) */}
        <Card className="shadow-2xl border-slate-200 overflow-hidden min-h-[500px] bg-white">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-40 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="font-black uppercase tracking-widest text-xs">Synchronizing Archive Registry...</p>
                </div>
              ) : orderedFilteredSubmissions.length > 0 ? (
                <>
                <div className="divide-y divide-slate-100">
                  {pagedSubmissions.map(sub => (
                    <div key={sub.id} className={cn("p-5 transition-colors group", selectedIds.has(sub.id) ? "bg-primary/5" : "hover:bg-slate-50")}>
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
                            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <span className="text-primary font-black">{sub.id}</span>
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {sub.branchName?.toLowerCase().includes('branch') ? sub.branchName : `${sub.branchName} Branch`}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {sub.isDeleted ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200 font-black text-[9px] uppercase gap-1">
                              <Trash2 className="w-3 h-3" /> Deleted
                            </Badge>
                          ) : sub.isArchived && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-black text-[9px] uppercase gap-1">
                              <FileArchive className="w-3 h-3" /> Archived
                            </Badge>
                          )}
                          <Badge variant="secondary" className="bg-white border font-bold text-[10px] uppercase text-slate-500">{sub.status}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-4 border-t bg-slate-50/80 px-5 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="h-9 gap-1 font-bold border-slate-200"
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
                      className="h-9 gap-1 font-bold border-slate-200"
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
    </div>
  );
}
