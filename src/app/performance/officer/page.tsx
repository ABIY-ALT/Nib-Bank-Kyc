
"use client"

import React, { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
} from "@/components/ui/card"
import { 
  Users, 
  FileDown, 
  TrendingUp,
  Loader2,
  ShieldCheck,
  Search,
  Zap,
  Inbox,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Building2,
  ShieldAlert,
  Download,
  Eye,
  Monitor,
  Map,
  Check,
  ChevronsUpDown,
  Info,
  EyeOff,
  ArrowUp,
  ArrowDown
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { format, differenceInMinutes } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSubmissions, updateSubmissionStatus, logBundleDownload, getSubmissionById } from "@/actions/submissions";
import { getAllUsers } from "@/actions/users";
import { getDistricts, getBranches } from "@/actions/hierarchy";
import { getGlobalSettings } from "@/actions/settings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KYC_STATUS } from "@/lib/kyc-data";
import { calculatePerformanceIndex, getPerformanceLabel } from "@/lib/performance";
import Link from "next/link";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import JSZip from 'jszip';
import {
  buildBundleRootName,
  getSubmissionBranchName,
  getSubmissionDistrictName,
  sanitizeBundleSegment,
} from "@/lib/bundle-path";
import { resolveDownloadFileName } from "@/lib/documents";
import { normalizeBranchName } from "@/lib/jurisdiction";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ViewMode = 'officers' | 'branches' | 'cases';

const MINUTES_IN_DAY = 1440;
const MINUTES_IN_HOUR = 60;

const formatResolutionDuration = (totalMinutes?: number) => {
  const safeMinutes = Math.max(0, Math.round(totalMinutes ?? 0));
  const days = Math.floor(safeMinutes / MINUTES_IN_DAY);
  const hours = Math.floor((safeMinutes % MINUTES_IN_DAY) / MINUTES_IN_HOUR);
  const minutes = safeMinutes % MINUTES_IN_HOUR;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes || parts.length === 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
};

export default function KYCOperationsMonitoringPage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const hasGlobalOversight = hasPermission('VIEW_SPECIALIST_PRODUCTIVITY');
  
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('officers');
  const [selectedOfficer, setSelectedOfficer] = useState<any | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  
  // Searchable Filter States
  const [districtSearch, setDistrictDistrict] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [officerSearch, setOfficerSearch] = useState("");
  
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("all");
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState<string>("all");
  
  const [sortField, setSortField] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>("asc");

  const [branchSortField, setBranchSortField] = useState<string>("branch");
  const [branchSortOrder, setBranchSortOrder] = useState<'asc' | 'desc'>("asc");

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  const [isEscalating, setIsEscalating] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState<any | null>(null);

  // Popover States
  const [distOpen, setDistOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [officerOpen, setOfficerOpen] = useState(false);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleBranchSort = (field: string) => {
    if (branchSortField === field) {
      setBranchSortOrder(branchSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setBranchSortField(field);
      setBranchSortOrder('asc');
    }
  };

  const SortIndicator = ({ field, currentField, currentOrder }: { field: string, currentField?: string, currentOrder?: 'asc' | 'desc' }) => {
    const activeField = currentField || sortField;
    const activeOrder = currentOrder || sortOrder;
    
    if (activeField !== field) return (
      <div className="ml-2 p-1 rounded-md bg-slate-100 group-hover:bg-slate-200 transition-colors">
        <ChevronsUpDown className="w-3 h-3 text-slate-400 opacity-50" />
      </div>
    );
    
    return (
      <div className="ml-2 p-1 rounded-md bg-primary/10 text-primary shadow-sm animate-in zoom-in-75 duration-300">
        {activeOrder === 'asc' ? (
          <ArrowUp className="w-3.5 h-3.5" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5" />
        )}
      </div>
    );
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [dateRange]);

  const loadBaseData = async () => {
    try {
      const [u, d, b, s] = await Promise.all([
        getAllUsers(),
        getDistricts(),
        getBranches(),
        getGlobalSettings()
      ]);
      
      // Filter personnel based on roles
      let kycPersonnel = u.filter((usr: any) => 
        usr.roles?.some((r: any) => 
          ['KYC_OFFICER', 'SUPERVISOR', 'KYC_SPECIALIST', 'KYC_SPECIALIST_OFFICER', 'CHECKER', 'MAKER', 'GOVERNANCE'].includes(r.role.name)
        )
      );

      // JURISDICTIONAL FILTER: Supervisors only see personnel in their assigned branches
      // POLICY: If user has global monitoring permission (VIEW_SPECIALIST_PRODUCTIVITY), bypass branch filter
      if (!isSuperAdmin && user && !hasGlobalOversight) {
        const myBranches = (user.assignedBranches?.length > 0 
          ? user.assignedBranches 
          : (user.branchName ? [user.branchName] : [])).map((b: string) => b.toLowerCase());
        
        if (myBranches.length > 0) {
          kycPersonnel = kycPersonnel.filter((p: any) => {
            const pBranches = (p.assignedBranches?.length > 0 ? p.assignedBranches : (p.branchName ? [p.branchName] : [])).map((b: string) => b.toLowerCase());
            return pBranches.some((pb: string) => myBranches.includes(pb));
          });
        }
      }

      setOfficers(kycPersonnel);
      setDistricts(d);
      setBranches(b);
      setSettings(s);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    }
  };

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      // SECURITY: Server-side getSubmissions now handles jurisdictional filtering automatically
      let filters: any = { limit: 5000 };
      
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const data = await getSubmissions(filters);
      setSubmissions(data || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Archive Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleManualEscalation = async (caseId: string) => {
    if (!user) return;
    setIsEscalating(caseId);
    try {
      await updateSubmissionStatus(caseId, KYC_STATUS.ESCALATED, user.id, "Strategic escalation triggered by Supervisor via Institutional Oversight.");
      toast({ title: "Escalation Successful" });
      await loadSubmissions();
    } catch (e) {
      toast({ variant: "destructive", title: "Escalation Failed" });
    } finally {
      setIsEscalating(null);
    }
  };

  const handleDownloadBundle = async (sub: any) => {
    if (!user) return;
    setIsDownloading(sub.id);
    try {
      const zip = new JSZip();
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const districtName = getSubmissionDistrictName(sub);
      const branchName = getSubmissionBranchName(sub);
      const bundleName = buildBundleRootName(districtName, branchName, timestamp);
      const rootFolder = zip.folder(bundleName);
      const caseFolderName = `${sanitizeBundleSegment(sub.id, 'CASE')}_${sanitizeBundleSegment(sub.customerName, 'CUSTOMER')}`;
      const fullSub = await getSubmissionById(sub.id);
      if (fullSub && fullSub.documents?.length > 0) {
        const folder = rootFolder?.folder(`${caseFolderName}/Documents`);
        for (const doc of fullSub.documents) {
          try {
            // FIX: Use downloadUrl or formatted previewUrl for secure extraction
            const downloadUrl = doc.downloadUrl || (doc.previewUrl ? `${doc.previewUrl}?download=1` : doc.url);
            
            const res = await fetch(downloadUrl, { 
              method: 'GET',
              credentials: 'include',
              headers: { 'Accept': '*/*' }
            });

            if (!res.ok) throw new Error(`Fetch status: ${res.status}`);
            
            const buffer = await res.arrayBuffer();
            if (buffer.byteLength === 0) throw new Error("Empty buffer received");
            
            const safeFileName = resolveDownloadFileName(doc.name, doc.originalName, doc.mimeType);
            folder?.file(safeFileName, buffer, { binary: true });
          } catch (err) {
            console.error(`Performance ZIP extraction failed for ${doc.name}:`, err);
          }
        }

        // Add CASE_METADATA.txt for performance export
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
Document Count:    ${fullSub?.documents?.length || 0}
==================================================`;
        rootFolder?.folder(caseFolderName)?.file('CASE_METADATA.txt', caseMetadata);

        rootFolder?.file(
          "nib_institutional_manifest.txt",
          `NIB BANK INSTITUTIONAL ARCHIVE\n` +
          `==================================================\n` +
          `CASE IDENTIFIER: ${sub.id}\n` +
          `CUSTOMER ENTITY: ${sub.customerName}\n` +
          `REGIONAL DIST:   ${districtName}\n` +
          `DISPATCH BRANCH: ${branchName}\n` +
          `EXPORTED BY:     ${user.name}\n` +
          `TIMESTAMP:       ${new Date().toLocaleString()}\n` +
          `ARCHIVE ROOT:    ${bundleName}\n` +
          `==================================================\n`
        );
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${bundleName}.zip`;
        link.click();
        await logBundleDownload({
          submissionId: sub.id,
          performedBy: user.name,
          bundleName,
          sourceDistrict: districtName,
          sourceBranch: branchName
        });
        toast({ title: "Download Successful" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Download Failed" });
    } finally {
      setIsDownloading(null);
    }
  };

  const processedOfficers = useMemo(() => {
    const data = officers.map(off => {
      const offBranchNames = (off.assignedBranches?.length > 0
        ? off.assignedBranches
        : (off.branchName ? [off.branchName] : [])).map((b: string) => normalizeBranchName(b).toLowerCase());
      
      // Helper: did this officer perform a specific action on this case?
      // Prefers userId in commentHistory (new records); falls back to assignedToId+status for old records.
      const officerActed = (s: any, action: string) =>
        s.commentHistory?.some((h: any) => h.userId === off.id && h.action === action) ||
        (s.assignedToId === off.id && s.status === action &&
          !s.commentHistory?.some((h: any) => h.userId && h.action === action));

      const offSubs = submissions.filter(s => {
        if (s.assignedToId === off.id) return true;
        const sBranchNorm = normalizeBranchName(s.branchName || "").toLowerCase();
        if (s.assignedToId === null && offBranchNames.includes(sBranchNorm)) return true;
        // Historical: officer performed a review action on a case that may now be reassigned
        return s.commentHistory?.some((h: any) =>
          h.userId === off.id &&
          [KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED, KYC_STATUS.IN_REVIEW].includes(h.action)
        );
      });

      const authorized = offSubs.filter(s => officerActed(s, KYC_STATUS.APPROVED)).length;
      const viewed = offSubs.filter(s => [KYC_STATUS.IN_REVIEW, KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED].includes(s.status as any)).length;
      const amended = offSubs.filter(s => officerActed(s, KYC_STATUS.ACTION_REQUIRED)).length;
      const escalated = offSubs.filter(s => s.status === KYC_STATUS.ESCALATED).length;
      const unseen = offSubs.filter(s => s.status === KYC_STATUS.SUBMITTED).length;
      const running = offSubs.filter(s => s.status === KYC_STATUS.IN_REVIEW).length;
      const branchesMapped = off.assignedBranches?.length || (off.branchName ? 1 : 0);

      // Calculate Average Resolution Time for Approved Cases
      let avgResolutionMinutes = 0;
      const approvedCases = offSubs.filter(s => s.status === KYC_STATUS.APPROVED);
      if (approvedCases.length > 0) {
        const totalMinutes = approvedCases.reduce((acc, sub) => {
          const approvalEntry = sub.commentHistory?.find((h: any) => h.action === KYC_STATUS.APPROVED);
          const submissionTime = new Date(sub.submittedAt);
          const resolutionEnd = approvalEntry ? new Date(approvalEntry.timestamp) : new Date(sub.updatedAt);
          const diff = differenceInMinutes(resolutionEnd, submissionTime);
          return acc + (isNaN(diff) ? 0 : Math.max(0, diff));
        }, 0);
        avgResolutionMinutes = Math.round(totalMinutes / approvedCases.length);
      }

      const performanceIndex = calculatePerformanceIndex({
        total: offSubs.length,
        unseen,
        amended,
        authorized
      });

      return {
        ...off,
        stats: {
          total: offSubs.length,
          authorized,
          viewed,
          amended,
          escalated,
          unseen,
          running,
          avgResolutionMinutes,
          branchesMapped,
          performanceIndex
        }
      };
    }).filter(off => {
      const matchesSelection = selectedOfficerFilter === 'all' || off.id === selectedOfficerFilter;
      const matchesDistrict = selectedDistrict === 'all' || off.branch?.district?.name === selectedDistrict;
      const matchesBranch = selectedBranchFilter === 'all' || off.branchName === selectedBranchFilter;
      return matchesSelection && matchesDistrict && matchesBranch;
    });

    // Apply Sorting
    return [...data].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        case 'branchesMapped':
          comparison = a.stats.branchesMapped - b.stats.branchesMapped;
          break;
        case 'total':
          comparison = a.stats.total - b.stats.total;
          break;
        case 'authorized':
          comparison = a.stats.authorized - b.stats.authorized;
          break;
        case 'unseen':
          comparison = a.stats.unseen - b.stats.unseen;
          break;
        case 'avgResolutionMinutes':
          comparison = a.stats.avgResolutionMinutes - b.stats.avgResolutionMinutes;
          break;
        case 'amended':
          comparison = a.stats.amended - b.stats.amended;
          break;
        case 'performanceIndex':
          comparison = a.stats.performanceIndex - b.stats.performanceIndex;
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [officers, submissions, selectedOfficerFilter, selectedDistrict, selectedBranchFilter, sortField, sortOrder]);

  const currentBranches = useMemo(() => {
    if (!selectedOfficer) return [];
    const bNames = selectedOfficer.assignedBranches?.length > 0
      ? selectedOfficer.assignedBranches
      : (selectedOfficer.branchName ? [selectedOfficer.branchName] : []);

    const data = bNames.map((name: string) => {
      const branchSubs = submissions.filter(s => 
        s.branchName === name && 
        (s.assignedToId === selectedOfficer.id || s.assignedToId === null)
      );
      const approved = branchSubs.filter(s => s.status === KYC_STATUS.APPROVED);
      
      let avgResolutionMinutes = 0;
      if (approved.length > 0) {
        const totalMinutes = approved.reduce((acc, sub) => {
          const approvalEntry = sub.commentHistory?.find((h: any) => h.action === KYC_STATUS.APPROVED);
          const submissionTime = new Date(sub.submittedAt);
          if (approvalEntry) {
            return acc + differenceInMinutes(new Date(approvalEntry.timestamp), submissionTime);
          }
          return acc + differenceInMinutes(new Date(sub.updatedAt), submissionTime);
        }, 0);
        avgResolutionMinutes = Math.round(totalMinutes / approved.length);
      }

      const pending = branchSubs.filter(s => ![KYC_STATUS.APPROVED, KYC_STATUS.REJECTED, KYC_STATUS.ESCALATED].includes(s.status as any)).length;
      return {
        name,
        totalFiles: branchSubs.reduce((acc, s) => acc + (s.documents?.length || 0), 0),
        total: branchSubs.length,
        approved: approved.length,
        unseen: branchSubs.filter(s => s.status === KYC_STATUS.SUBMITTED).length,
        running: branchSubs.filter(s => s.status === KYC_STATUS.IN_REVIEW).length,
        amended: branchSubs.reduce((acc, s) => acc + (s.amendCycles || 0), 0),
        avgResolutionMinutes,
        pending
      };
    });

    // Apply Sorting
    return [...data].sort((a, b) => {
      let comparison = 0;
      switch (branchSortField) {
        case 'branch':
          comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          break;
        case 'approved':
          comparison = a.approved - b.approved;
          break;
        case 'totalFiles':
          comparison = a.totalFiles - b.totalFiles;
          break;
        case 'unseen':
          comparison = a.unseen - b.unseen;
          break;
        case 'avgResolutionMinutes':
          comparison = a.avgResolutionMinutes - b.avgResolutionMinutes;
          break;
        case 'amended':
          comparison = a.amended - b.amended;
          break;
        case 'pending':
          comparison = a.pending - b.pending;
          break;
        default:
          comparison = 0;
      }
      return branchSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [selectedOfficer, submissions, branchSortField, branchSortOrder]);

  const currentCases = useMemo(() => {
    if (!selectedBranch || !selectedOfficer) return [];
    return submissions.filter(s => 
      s.branchName === selectedBranch && 
      (s.assignedToId === selectedOfficer.id || s.assignedToId === null)
    );
  }, [selectedBranch, selectedOfficer, submissions]);

  const handleExportCSV = () => {
    const headers = ['KYC Officer', 'Mapped Branches', 'Case Volume', 'Authorized', 'Unseen', 'Avg. Resolution', 'Amendment Cycles', 'Performance Index'];
    const rows = processedOfficers.map(o => [
      `${o.firstName} ${o.lastName}`,
      o.stats.branchesMapped,
      o.stats.total,
      o.stats.authorized,
      o.stats.unseen,
      formatResolutionDuration(o.stats.avgResolutionMinutes),
      o.stats.amended,
      `${o.stats.performanceIndex}%`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KYC_PERFORMANCE_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  const filteredDistricts = districts.filter(d => d.name.toLowerCase().includes(districtSearch.toLowerCase()));
  const filteredBranchesList = branches.filter(b => (selectedDistrict === 'all' || b.district?.name === selectedDistrict) && b.name.toLowerCase().includes(branchSearch.toLowerCase()));
  const filteredOfficersList = officers.filter(o => {
    const name = `${o.firstName} ${o.lastName}`.toLowerCase();
    return name.includes(officerSearch.toLowerCase());
  });

  if (loading || permissionsLoading) return <div className="py-48 text-center flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;

  if (!hasGlobalOversight) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <p className="mt-6 text-3xl font-black text-slate-900">Unauthorized</p>
        <p className="mt-3 max-w-2xl text-slate-500">You do not have permission to access the Ops Monitoring page. If you believe this is incorrect, contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-primary text-white rounded-[2rem] shadow-2xl">
            <Monitor className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 font-headline tracking-tight">Ops Monitoring</h1>
            <p className="text-muted-foreground text-lg font-medium">Institutional Performance Intelligence Terminal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Button onClick={handleExportCSV} className="h-12 px-8 gap-2 bg-slate-900 text-white font-black rounded-xl shadow-xl hover:bg-black transition-all">
            <FileDown className="w-5 h-5" /> KYC Performance CSV
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden rounded-[2rem]">
        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* DISTRICT SEARCHABLE */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Jurisdiction District</Label>
            <Popover open={distOpen} onOpenChange={setDistOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between h-12 rounded-xl border-slate-200 bg-slate-50/50 font-bold">
                  {selectedDistrict === 'all' ? "Overall Network" : selectedDistrict}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input placeholder="Search district..." className="pl-9 h-10 rounded-lg text-sm border-slate-200" value={districtSearch} onChange={(e) => setDistrictDistrict(e.target.value)} />
                  </div>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold", selectedDistrict === 'all' ? "bg-primary/10 text-primary" : "hover:bg-slate-50")}
                      onClick={() => { setSelectedDistrict('all'); setSelectedBranchFilter('all'); setDistOpen(false); }}
                    >
                      <div className="flex items-center gap-2"><Map className="w-4 h-4" /> Overall Network</div>
                      {selectedDistrict === 'all' && <Check className="w-4 h-4" />}
                    </div>
                    {filteredDistricts.map(d => (
                      <div
                        key={d.id}
                        className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold", selectedDistrict === d.name ? "bg-primary/10 text-primary" : "hover:bg-slate-50")}
                        onClick={() => { setSelectedDistrict(d.name); setSelectedBranchFilter('all'); setDistOpen(false); }}
                      >
                        {d.name}
                        {selectedDistrict === d.name && <Check className="w-4 h-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          {/* BRANCH SEARCHABLE */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Branch</Label>
            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between h-12 rounded-xl border-slate-200 bg-slate-50/50 font-bold">
                  {selectedBranchFilter === 'all' ? "All Branches" : selectedBranchFilter}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input placeholder="Search branch..." className="pl-9 h-10 rounded-lg text-sm border-slate-200" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} />
                  </div>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold", selectedBranchFilter === 'all' ? "bg-primary/10 text-primary" : "hover:bg-slate-50")}
                      onClick={() => { setSelectedBranchFilter('all'); setBranchOpen(false); }}
                    >
                      <div className="flex items-center gap-2"><Building2 className="w-4 h-4" /> All Branches</div>
                      {selectedBranchFilter === 'all' && <Check className="w-4 h-4" />}
                    </div>
                    {filteredBranchesList.map(b => (
                      <div
                        key={b.id}
                        className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold", selectedBranchFilter === b.name ? "bg-primary/10 text-primary" : "hover:bg-slate-50")}
                        onClick={() => { setSelectedBranchFilter(b.name); setBranchOpen(false); }}
                      >
                        {b.name}
                        {selectedBranchFilter === b.name && <Check className="w-4 h-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          {/* OFFICER SEARCHABLE */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">KYC Officer Disclosure</Label>
            <Popover open={officerOpen} onOpenChange={setOfficerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between h-12 rounded-xl border-slate-200 bg-slate-50/50 font-bold">
                  {selectedOfficerFilter === 'all' ? "Select KYC Officer..." : officers.find(o => o.id === selectedOfficerFilter)?.firstName + " " + officers.find(o => o.id === selectedOfficerFilter)?.lastName}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input placeholder="Search personnel..." className="pl-9 h-10 rounded-lg text-sm border-slate-200" value={officerSearch} onChange={(e) => setOfficerSearch(e.target.value)} />
                  </div>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold", selectedOfficerFilter === 'all' ? "bg-primary/10 text-primary" : "hover:bg-slate-50")}
                      onClick={() => { setSelectedOfficerFilter('all'); setOfficerOpen(false); }}
                    >
                      <div className="flex items-center gap-2"><Users className="w-4 h-4" /> All Personnel</div>
                      {selectedOfficerFilter === 'all' && <Check className="w-4 h-4" />}
                    </div>
                    {filteredOfficersList.map(o => (
                      <div
                        key={o.id}
                        className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold", selectedOfficerFilter === o.id ? "bg-primary/10 text-primary" : "hover:bg-slate-50")}
                        onClick={() => { setSelectedOfficerFilter(o.id); setOfficerOpen(false); }}
                      >
                        <div className="flex flex-col">
                          <span>{o.firstName} {o.lastName}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{o.branchName || 'Institutional'}</span>
                        </div>
                        {selectedOfficerFilter === o.id && <Check className="w-4 h-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* DRILL-DOWN NAVIGATION TRACK */}
      <div className="flex items-center gap-3 bg-slate-100/50 p-2 rounded-2xl w-fit border border-slate-200/50 shadow-inner">
        <Button
          variant={viewMode === 'officers' ? 'secondary' : 'ghost'}
          onClick={() => { setViewMode('officers'); setSelectedOfficer(null); setSelectedBranch(null); }}
          className={cn("h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all", viewMode === 'officers' ? "bg-primary text-white shadow-lg" : "text-slate-500")}
        >
          Officer Matrix
        </Button>
        {selectedOfficer && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <Button
              variant={viewMode === 'branches' ? 'secondary' : 'ghost'}
              onClick={() => { setViewMode('branches'); setSelectedBranch(null); }}
              className={cn("h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all", viewMode === 'branches' ? "bg-primary text-white shadow-lg" : "text-slate-500")}
            >
              {selectedOfficer.firstName} {selectedOfficer.lastName}'s Portfolio
            </Button>
          </>
        )}
        {selectedBranch && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <Button
              variant="secondary"
              className="h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest bg-primary text-white shadow-lg"
            >
              Branch Audit: {selectedBranch}
            </Button>
          </>
        )}
      </div>

      {/* DYNAMIC VIEWPORT */}
      <div className="animate-in slide-in-from-bottom-4 duration-500">
        {viewMode === 'officers' && (
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
            <CardHeader className="bg-primary text-white p-8 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3"><Users className="w-6 h-6 text-white" /> Officer Productivity Index</CardTitle>
                <CardDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">Authorized personnel across regional branches</CardDescription>
              </div>
              <Badge variant="outline" className="bg-white/20 border-white/20 text-white font-black px-4 py-1.5 h-9">
                {processedOfficers.length} Officers Discovered
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead 
                      className={cn(
                        "py-6 pl-10 font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'name' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('name')}
                    >
                      <div className="flex items-center">
                        KYC Officer
                        <SortIndicator field="name" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'branchesMapped' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('branchesMapped')}
                    >
                      <div className="flex items-center justify-center">
                        Branches Mapped
                        <SortIndicator field="branchesMapped" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'total' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('total')}
                    >
                      <div className="flex items-center justify-center">
                        Total Volume
                        <SortIndicator field="total" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'authorized' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('authorized')}
                    >
                      <div className="flex items-center justify-center">
                        Authorized
                        <SortIndicator field="authorized" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'unseen' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('unseen')}
                    >
                      <div className="flex items-center justify-center">
                        Unseen
                        <SortIndicator field="unseen" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'avgResolutionMinutes' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('avgResolutionMinutes')}
                    >
                      <div className="flex items-center justify-center">
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1.5 cursor-help">
                                Avg. Resolution
                                <Info className="w-3.5 h-3.5 text-slate-400" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-xs font-medium normal-case tracking-normal leading-relaxed">
                              Average Resolution Time is calculated from the case submission timestamp until the final authorization/completion timestamp.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <SortIndicator field="avgResolutionMinutes" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'amended' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('amended')}
                    >
                      <div className="flex items-center justify-center">
                        Amendment Cycles
                        <SortIndicator field="amended" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className={cn(
                        "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                        sortField === 'performanceIndex' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                      )}
                      onClick={() => toggleSort('performanceIndex')}
                    >
                      <div className="flex items-center justify-center">
                        Performance Index
                        <SortIndicator field="performanceIndex" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Overview</TableHead>
                    <TableHead className="text-right pr-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedOfficers.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="py-32 text-center text-slate-400 italic">No personnel discovered in current selection context.</TableCell></TableRow>
                  ) : processedOfficers.map((off) => (
                    <TableRow key={off.id} className="hover:bg-slate-50/80 transition-all border-b border-slate-100 group">
                      <TableCell className="py-8 pl-10">
                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedOfficer(off); setViewMode('branches'); }}>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                            {off.firstName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 leading-none">{off.firstName} {off.lastName}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{off.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-black text-slate-700 text-lg">{off.stats.branchesMapped}</TableCell>
                      <TableCell className="text-center font-black text-primary text-lg">{off.stats.total}</TableCell>
                      <TableCell className="text-center font-black text-emerald-600 text-lg">{off.stats.authorized}</TableCell>
                      <TableCell className="text-center">
                        {off.stats.unseen > 0 ? (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-black text-sm px-3 py-1 gap-1.5">
                            <EyeOff className="w-3.5 h-3.5" />
                            {off.stats.unseen}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 font-black text-lg">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-black text-[10px] bg-slate-50">
                          {formatResolutionDuration(off.stats.avgResolutionMinutes)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-black text-orange-600 text-lg">{off.stats.amended}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] font-black uppercase tracking-widest", getPerformanceLabel(off.stats.performanceIndex).color)}>
                              {getPerformanceLabel(off.stats.performanceIndex).label}
                            </span>
                            <span className="font-black text-primary text-sm">{off.stats.performanceIndex}%</span>
                          </div>
                          <Progress value={off.stats.performanceIndex} className="w-24 h-1.5 bg-slate-100" />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => setShowSummary(off)} className="h-11 w-11 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/5 transition-all">
                          <Eye className="w-5 h-5" />
                        </Button>
                      </TableCell>
                      <TableCell className="text-right pr-10">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedOfficer(off); setViewMode('branches'); }} className="h-11 w-11 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/5 transition-all">
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {viewMode === 'branches' && (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
                <CardHeader className="bg-primary text-white p-8">
                  <CardTitle className="text-2xl font-black">Authorized Jurisdiction Portfolio</CardTitle>
                  <CardDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">Specific branch mappings for {selectedOfficer.firstName} {selectedOfficer.lastName}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50 border-b">
                      <TableRow>
                        <TableHead 
                          className={cn(
                            "py-6 pl-10 font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'branch' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('branch')}
                        >
                          <div className="flex items-center">
                            Branch
                            <SortIndicator field="branch" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead
                          className={cn(
                            "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'approved' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('approved')}
                        >
                          <div className="flex items-center justify-center">
                            Authorized
                            <SortIndicator field="approved" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead
                          className={cn(
                            "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'totalFiles' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('totalFiles')}
                        >
                          <div className="flex items-center justify-center">
                            Uploaded Files
                            <SortIndicator field="totalFiles" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead 
                          className={cn(
                            "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'unseen' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('unseen')}
                        >
                          <div className="flex items-center justify-center">
                            Unseen Cases
                            <SortIndicator field="unseen" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead 
                          className={cn(
                            "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'avgResolutionMinutes' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('avgResolutionMinutes')}
                        >
                          <div className="flex items-center justify-center">
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1.5 cursor-help">
                                    Avg. Resolution
                                    <Info className="w-3.5 h-3.5 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs font-medium normal-case tracking-normal leading-relaxed">
                                  Average Resolution Time is calculated from the case submission timestamp until the final authorization/completion timestamp.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <SortIndicator field="avgResolutionMinutes" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead 
                          className={cn(
                            "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'amended' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('amended')}
                        >
                          <div className="flex items-center justify-center">
                            Amend Cycles
                            <SortIndicator field="amended" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead 
                          className={cn(
                            "text-right pr-10 font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                            branchSortField === 'pending' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                          )}
                          onClick={() => toggleBranchSort('pending')}
                        >
                          <div className="flex items-center justify-end">
                            Branch SLA Health
                            <SortIndicator field="pending" currentField={branchSortField} currentOrder={branchSortOrder} />
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentBranches.map((b: any) => (
                        <TableRow key={b.name} className="hover:bg-slate-50 transition-colors border-b cursor-pointer group" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>
                          <TableCell className="py-8 pl-10">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-primary/10 group-hover:text-primary transition-colors"><Building2 className="w-5 h-5" /></div>
                              <span className="font-black text-slate-900 text-base">{b.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-black text-emerald-600 text-lg">{b.approved}</TableCell>
                          <TableCell className="text-center font-black text-slate-700">{b.totalFiles}</TableCell>
                          <TableCell className="text-center">
                            {b.unseen > 0 ? (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-black text-sm px-3 py-1 gap-1.5">
                                <EyeOff className="w-3.5 h-3.5" />
                                {b.unseen}
                              </Badge>
                            ) : (
                              <span className="text-slate-300 font-black text-lg">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-black text-[10px] bg-slate-50">
                            {formatResolutionDuration(b.avgResolutionMinutes)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-black text-orange-600">{b.amended}</TableCell>
                          <TableCell className="text-right pr-10">
                            <Badge className={cn("font-black text-[9px] uppercase px-3 py-1", b.pending > 0 ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700")}>
                              {b.pending > 0 ? `${b.pending} ACTIVE CASES` : 'SLA COMPLIANT'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-8">
              <Card className="shadow-xl border-slate-200 overflow-hidden rounded-[2rem] bg-primary/5 border-l-4 border-l-primary">
                <CardHeader className="bg-primary p-6 border-b text-white"><CardTitle className="text-lg font-black uppercase tracking-widest text-white">Officer Profile</CardTitle></CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center font-black text-2xl text-primary shadow-xl ring-4 ring-white">{selectedOfficer.firstName.charAt(0)}</div>
                    <div>
                      <p className="text-xl font-black text-slate-900">{selectedOfficer.firstName} {selectedOfficer.lastName}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authorized Official</p>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Authorized Cases</p>
                      <p className="text-3xl font-black text-emerald-600">{selectedOfficer.stats.authorized}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-tighter flex items-center gap-1.5"><EyeOff className="w-3 h-3" /> Unseen</p>
                      <p className="text-3xl font-black text-amber-600">{selectedOfficer.stats.unseen}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Total Cycles</p>
                      <p className="text-3xl font-black text-orange-600">{selectedOfficer.stats.amended}</p>
                    </div>
                    <div className="space-y-1 col-span-3 pt-2 border-t border-slate-100">
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-[9px] font-black text-primary uppercase tracking-widest inline-flex items-center gap-1.5 cursor-help">Avg. Resolution Time <Info className="w-3 h-3 text-primary/50" /></p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs font-medium normal-case tracking-normal leading-relaxed">
                            Average Resolution Time is calculated from the case submission timestamp until the final authorization/completion timestamp.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <p className="text-2xl font-black text-primary">
                        {formatResolutionDuration(selectedOfficer.stats.avgResolutionMinutes)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {viewMode === 'cases' && (
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[3rem] bg-white">
            <CardHeader className="bg-primary text-white p-10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-white/20 rounded-3xl"><Building2 className="w-8 h-8 text-white" /></div>
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight text-white">Institutional Audit: {selectedBranch}</CardTitle>
                  <CardDescription className="text-white/70 font-bold text-[11px] uppercase tracking-widest mt-2 flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> View-only administrative oversight mode</CardDescription>
                </div>
              </div>
              <Button variant="outline" onClick={() => setViewMode('branches')} className="bg-white/10 border-white/20 text-white font-black rounded-xl h-12 px-8 hover:bg-white/20"><ChevronLeft className="w-4 h-4 mr-2" /> Return to Portfolio</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead className="py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Case ID</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Customer Identity</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Age / Resolution SLA</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Institutional Oversight</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Status</TableHead>
                    <TableHead className="text-right pr-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentCases.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-32 text-center text-slate-400 italic">No case lifecycle data discovered for this branch.</TableCell></TableRow>
                  ) : currentCases.map((sub) => {
                    const submissionTime = new Date(sub.submittedAt || sub.createdAt);
                    const escalationThresholdMinutes = (settings?.escalationHours || 72) * 60;
                    const minutesSinceSubmission = differenceInMinutes(new Date(), submissionTime);
                    const isBreached = minutesSinceSubmission >= escalationThresholdMinutes && ![KYC_STATUS.APPROVED, KYC_STATUS.REJECTED, KYC_STATUS.ESCALATED].includes(sub.status);

                    return (
                      <TableRow key={sub.id} className={cn("border-b border-slate-100 hover:bg-slate-50/50 transition-colors", isBreached && "bg-red-50/30")}>
                        <TableCell className="py-8 pl-10 font-black text-primary tabular-nums tracking-tighter">{sub.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 leading-tight text-base">{sub.customerName}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{sub.entityType || 'Individual'} Account</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Zap className={cn("w-3.5 h-3.5", sub.status === KYC_STATUS.APPROVED ? "text-emerald-500" : "text-amber-500")} />
                            <span className="font-black text-xs tabular-nums text-slate-700">
                              {(() => {
                                const approvalEntry = sub.commentHistory?.find((h: any) => h.action === KYC_STATUS.APPROVED);
                                const end = approvalEntry ? new Date(approvalEntry.timestamp) : new Date();
                                const resolutionMinutes = Math.max(0, differenceInMinutes(end, submissionTime));
                                return formatResolutionDuration(resolutionMinutes);
                              })()}
                            </span>
                            {sub.status === KYC_STATUS.APPROVED && <Badge className="bg-emerald-50 text-emerald-700 text-[8px] font-black h-4 px-1 border-emerald-100">FINAL</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isBreached ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-1.5 text-red-600">
                                <ShieldAlert className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Oversight Alert</span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleManualEscalation(sub.id)}
                                disabled={isEscalating === sub.id}
                                className="h-9 px-5 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase rounded-xl shadow-xl shadow-red-200 transition-all active:scale-95"
                              >
                                {isEscalating === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Dispatch Escalation"}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-emerald-600">
                              <ShieldCheck className="w-4 h-4 opacity-50" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Compliant</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "font-black text-[9px] uppercase px-3 py-1",
                            sub.status === KYC_STATUS.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                          )}>
                            {sub.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex justify-end gap-3">
                            <Button variant="ghost" size="icon" onClick={() => handleDownloadBundle(sub)} disabled={isDownloading === sub.id} className="h-11 w-11 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                              {isDownloading === sub.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            </Button>
                            <Button size="sm" asChild className="h-11 bg-slate-900 text-white font-black text-[10px] uppercase px-8 rounded-xl hover:bg-black transition-all shadow-lg active:scale-95">
                              <Link href={`/submissions/${sub.id}`}>Inspect Case</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* PERFORMANCE SUMMARY DIALOG */}
      <Dialog open={!!showSummary} onOpenChange={() => setShowSummary(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white">
          <DialogHeader className="p-8 bg-primary text-white space-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><TrendingUp className="w-6 h-6 text-white" /></div>
              <div>
                <DialogTitle className="text-2xl font-black leading-tight text-white">Performance Summary</DialogTitle>
                <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">Weighted officer profile</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-5 p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-16 h-16 rounded-[1.5rem] bg-primary/10 text-primary flex items-center justify-center font-black text-2xl shadow-inner border border-primary/5">{showSummary?.firstName.charAt(0)}</div>
              <div>
                <p className="text-xl font-black text-slate-900 leading-tight">{showSummary?.firstName} {showSummary?.lastName}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Institutional officer</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Branches Mapped</p>
                <p className="text-3xl font-black text-primary">{showSummary?.stats.branchesMapped}</p>
              </div>
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Authorized Cases</p>
                <p className="text-3xl font-black text-emerald-600">{showSummary?.stats.authorized ?? 0}</p>
              </div>
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amendment Cycles</p>
                <p className="text-3xl font-black text-orange-600">{showSummary?.stats.amended}</p>
              </div>
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Escalated Cases</p>
                <p className="text-3xl font-black text-destructive">{showSummary?.stats.escalated}</p>
              </div>
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100 shadow-sm space-y-1">
                <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5"><EyeOff className="w-3 h-3" /> Unseen Cases</p>
                <p className="text-3xl font-black text-amber-600">{showSummary?.stats.unseen ?? 0}</p>
              </div>
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 shadow-sm space-y-1">
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[9px] font-black text-primary uppercase tracking-widest inline-flex items-center gap-1.5 cursor-help">Avg. Resolution Time <Info className="w-3 h-3 text-primary/50" /></p>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs font-medium normal-case tracking-normal leading-relaxed">
                      Average Resolution Time is calculated from the case submission timestamp until the final authorization/completion timestamp.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p className="text-3xl font-black text-primary">
                  {formatResolutionDuration(showSummary?.stats.avgResolutionMinutes)} Resolution
                </p>
              </div>
            </div>
            <Button onClick={() => setShowSummary(null)} className="w-full h-14 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all">Close Performance Audit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
