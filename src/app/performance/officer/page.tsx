"use client"

import React, { useMemo, useState, useEffect, useCallback } from "react"
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
  Map as MapIcon,
  Check,
  ChevronsUpDown,
  Info,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter,
  Sparkles,
  Layers,
  Activity,
  Lightbulb,
  X,
  ArrowRight,
  Compass,
  MoreHorizontal
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import { format, differenceInMinutes, differenceInDays } from "date-fns";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSubmissions, updateSubmissionStatus, logBundleDownload, getSubmissionById } from "@/actions/submissions";
import { getAllUsers } from "@/actions/users";
import { getBranchMappings } from "@/actions/branch-mappings";
import { getDistricts, getBranches } from "@/actions/hierarchy";
import { getGlobalSettings } from "@/actions/settings";
import { cn } from "@/lib/utils";
import { KYC_STATUS } from "@/lib/kyc-data";
import { calculateOfficerPerformanceIndex, getPerformanceLabel } from "@/lib/performance";
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
  DialogFooter,
} from "@/components/ui/dialog";

type ViewMode = 'officers' | 'branches' | 'cases' | 'branch-matrix';

const MINUTES_IN_DAY = 1440;
const MINUTES_IN_HOUR = 60;

// Threshold constants
const UNSEEN_SEVERITY_THRESHOLDS = {
  AMBER: 1,
  ORANGE: 4,
  RED: 8,
  PULSE: 12,
};

const CAPACITY_HIGH_UNSEEN = 8;
const PERF_THRESHOLD_LOW = 80;
const AMEND_THRESHOLD_HIGH = 5;

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

interface IndependentSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  summaryBadge?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  headerBadge?: React.ReactNode;
}

const IndependentSection: React.FC<IndependentSectionProps> = ({
  title,
  subtitle,
  icon: Icon,
  summaryBadge,
  isOpen,
  onToggle,
  children,
  className = "",
  headerBadge,
}) => {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className={cn("border border-slate-200/80 bg-white rounded-[2rem] shadow-sm overflow-hidden transition-all duration-300", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full p-5 md:p-6 bg-slate-900 text-white flex items-center justify-between text-left hover:bg-slate-800 transition-colors select-none group focus:outline-none"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 bg-white/10 rounded-xl shrink-0 group-hover:scale-105 transition-transform">
              <Icon className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-black text-white tracking-tight">{title}</h3>
                {!isOpen && summaryBadge && (
                  <div className="animate-in fade-in duration-200">
                    {summaryBadge}
                  </div>
                )}
                {isOpen && headerBadge && (
                  <div className="animate-in fade-in duration-200">
                    {headerBadge}
                  </div>
                )}
              </div>
              {subtitle && <p className="text-slate-400 text-xs font-medium truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-4">
            <Badge variant="outline" className="bg-white/10 text-slate-300 border-white/20 font-bold text-[10px] uppercase hidden sm:inline-flex">
              {isOpen ? "Collapse Panel" : "Expand Panel"}
            </Badge>
            <div className="p-2 rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
              <ChevronRight
                className={cn(
                  "w-4 h-4 text-white transition-transform duration-300 ease-in-out",
                  isOpen && "rotate-90"
                )}
              />
            </div>
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
        <div className="p-6 border-t border-slate-100 bg-slate-50/30">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default function KYCOperationsMonitoringPage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();

  const hasGlobalOversight = hasPermission('VIEW_SPECIALIST_PRODUCTIVITY');

  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [allMappings, setAllMappings] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('officers');
  const [selectedOfficer, setSelectedOfficer] = useState<any | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Searchable Filter States
  const [headerSearch, setHeaderSearch] = useState("");
  const [districtSearch, setDistrictDistrict] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [officerSearch, setOfficerSearch] = useState("");

  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("all");
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState<string>("all");

  // Sorting state
  const [sortField, setSortField] = useState<string>("unseen");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>("desc");

  const [branchSortField, setBranchSortField] = useState<string>("branch");
  const [branchSortOrder, setBranchSortOrder] = useState<'asc' | 'desc'>("asc");

  // Branch Matrix state
  const [matrixBranchFilter, setMatrixBranchFilter] = useState<string>("all");
  const [matrixHealthFilter, setMatrixHealthFilter] = useState<string>("all");
  const [matrixBranchSearch, setMatrixBranchSearch] = useState("");
  const [matrixBranchOpen, setMatrixBranchOpen] = useState(false);
  const [matrixSortField, setMatrixSortField] = useState<string>("name");
  const [matrixSortOrder, setMatrixSortOrder] = useState<'asc' | 'desc'>("asc");
  const [branchMatrixPage, setBranchMatrixPage] = useState(1);
  const BRANCH_MATRIX_PAGE_SIZE = 10;

  const [caseSortField, setCaseSortField] = useState<string>("submittedAt");
  const [caseSortOrder, setCaseSortOrder] = useState<'asc' | 'desc'>("desc");

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [isEscalating, setIsEscalating] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState<any | null>(null);

  // Popover States
  const [distOpen, setDistOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [officerOpen, setOfficerOpen] = useState(false);

  // Pagination State
  const [officerPage, setOfficerPage] = useState(1);
  const OFFICER_PAGE_SIZE = 10;

  // Manager Quick Filter Chips State
  const [activeFilterChips, setActiveFilterChips] = useState<string[]>([]);
  const [recentlyReassignedIds, setRecentlyReassignedIds] = useState<string[]>([]);

  // Dismissed Recommendations State (stored locally)
  const [dismissedRecIds, setDismissedRecIds] = useState<string[]>([]);

  // Independent Progressive Disclosure Panel States (Default: ALL COLLAPSED)
  const [panelStates, setPanelStates] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('ops_monitoring_panel_states');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return {
      execSummary: false,
      attentionCenter: false,
      top5Officers: false,
      recommendations: false,
      branchHealth: false,
      advancedFilters: false,
    };
  });

  const togglePanel = useCallback((panelKey: string) => {
    setPanelStates(prev => {
      const updated = { ...prev, [panelKey]: !prev[panelKey] };
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('ops_monitoring_panel_states', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });
  }, []);

  // Smart Branch Reassignment Modal State
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignSourceOfficer, setReassignSourceOfficer] = useState<any | null>(null);
  const [reassignBranch, setReassignBranch] = useState<string | null>(null);
  const [reassignTargetOfficerId, setReassignTargetOfficerId] = useState<string | null>(null);
  const [managerOverride, setManagerOverride] = useState(false);
  const [isSubmittingReassign, setIsSubmittingReassign] = useState(false);
  const [reassignStep, setReassignStep] = useState<'select' | 'confirm'>('select');

  useEffect(() => {
    setOfficerPage(1);
  }, [selectedOfficerFilter, selectedDistrict, selectedBranchFilter, sortField, sortOrder, dateRange, activeFilterChips]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'unseen' || field === 'total' || field === 'amended' ? 'desc' : 'asc');
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

  const toggleCaseSort = (field: string) => {
    if (caseSortField === field) {
      setCaseSortOrder(caseSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setCaseSortField(field);
      setCaseSortOrder('asc');
    }
  };

  const toggleMatrixSort = (field: string) => {
    if (matrixSortField === field) {
      setMatrixSortOrder(matrixSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMatrixSortField(field);
      setMatrixSortOrder('asc');
    }
  };

  const toggleFilterChip = useCallback((chipId: string) => {
    setActiveFilterChips(prev =>
      prev.includes(chipId) ? prev.filter(c => c !== chipId) : [...prev, chipId]
    );
    setOfficerPage(1);
  }, []);

  const handleDismissRecommendation = useCallback((recId: string) => {
    setDismissedRecIds(prev => [...prev, recId]);
  }, []);

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
      const [u, d, b, s, m] = await Promise.all([
        getAllUsers(),
        getDistricts(),
        getBranches(),
        getGlobalSettings(),
        getBranchMappings(),
      ]);
      setAllMappings(m || []);

      let kycPersonnel = u.filter((usr: any) =>
        usr.roles?.some((r: any) =>
          ['KYC_OFFICER', 'SUPERVISOR', 'KYC_SPECIALIST', 'KYC_SPECIALIST_OFFICER', 'CHECKER', 'MAKER', 'GOVERNANCE'].includes(r.role.name)
        )
      );

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
      let filters: any = { limit: 5000 };

      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const result = await getSubmissions(filters);
      setSubmissions(result.submissions || []);
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
      const res = await updateSubmissionStatus(caseId, KYC_STATUS.ESCALATED, user.id, "Strategic escalation triggered by Supervisor via Institutional Oversight.");
      if (!res.success) {
        toast({ variant: "destructive", title: "Escalation Failed", description: res.error });
        return;
      }
      toast({ title: "Escalation Successful" });
      await loadSubmissions();
    } catch (e) {
      toast({ variant: "destructive", title: "Escalation Failed", description: "Please try again." });
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

  const officerTempBranches = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of allMappings) {
      if (m.type === 'TEMPORARY' && m.active) {
        for (const o of m.officers) {
          if (!map.has(o.id)) map.set(o.id, new Set());
          map.get(o.id)!.add((m.branchName || '').toLowerCase());
        }
      }
    }
    return map;
  }, [allMappings]);

  // Main processed officers array
  const processedOfficers = useMemo(() => {
    const norm = (v?: string | null) => (v || '').trim().toLowerCase();
    const branchDistrict = new Map<string, string>(
      branches.map((b: any) => [norm(b.name), norm(b.district?.name)])
    );

    const data = officers.map(off => {
      const offBranchNames = (off.assignedBranches?.length > 0
        ? off.assignedBranches
        : (off.branchName ? [off.branchName] : [])).map((b: string) => normalizeBranchName(b).toLowerCase());

      const officerActed = (s: any, action: string) =>
        s.commentHistory?.some((h: any) => h.userId === off.id && h.action === action) ||
        (s.assignedToId === off.id && s.status === action &&
          !s.commentHistory?.some((h: any) => h.userId && h.action === action));

      const offSubs = submissions.filter(s => {
        if (s.assignedToId === off.id) return true;
        const sBranchNorm = normalizeBranchName(s.branchName || "").toLowerCase();
        if (s.assignedToId === null && offBranchNames.includes(sBranchNorm)) return true;
        return s.commentHistory?.some((h: any) =>
          h.userId === off.id &&
          [KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED, KYC_STATUS.IN_REVIEW].includes(h.action)
        );
      });

      const authorized = offSubs.filter(s => officerActed(s, KYC_STATUS.APPROVED)).length;
      const viewed = offSubs.filter(s => [KYC_STATUS.IN_REVIEW, KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED].includes(s.status as any)).length;
      const amended = offSubs.filter(s => officerActed(s, KYC_STATUS.ACTION_REQUIRED)).length;
      const escalated = offSubs.filter(s => s.status === KYC_STATUS.ESCALATED).length;

      const unseenSubs = offSubs.filter(s => s.status === KYC_STATUS.SUBMITTED && !s.isResubmitted);
      const unseen = unseenSubs.length;
      const running = offSubs.filter(s => s.status === KYC_STATUS.IN_REVIEW && !s.isResubmitted).length;
      const resubmitted = offSubs.filter(s => s.isResubmitted).length;
      const branchesMapped = off.assignedBranches?.length || (off.branchName ? 1 : 0);

      // Days since last touched calculation for hover tooltip
      let daysSinceLastTouched = 0;
      if (unseenSubs.length > 0) {
        const oldestUnseenDate = unseenSubs.reduce((oldest: Date, sub: any) => {
          const subDate = new Date(sub.submittedAt || sub.createdAt);
          return subDate < oldest ? subDate : oldest;
        }, new Date());
        daysSinceLastTouched = Math.max(0, differenceInDays(new Date(), oldestUnseenDate));
      }

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

      const performanceIndex = calculateOfficerPerformanceIndex({
        total: offSubs.length,
        unseen,
        running,
      });

      return {
        ...off,
        assignedBranchesList: offBranchNames,
        stats: {
          total: offSubs.length,
          authorized,
          viewed,
          amended,
          escalated,
          unseen,
          running,
          resubmitted,
          avgResolutionMinutes,
          branchesMapped,
          performanceIndex,
          daysSinceLastTouched,
        },
      };
    }).filter(off => {
      const offBranchNamesNorm = off.assignedBranchesList;

      const matchesSelection = selectedOfficerFilter === 'all' || off.id === selectedOfficerFilter;

      const matchesDistrict = selectedDistrict === 'all' ||
        norm(off.districtName) === norm(selectedDistrict) ||
        norm(off.branch?.district?.name) === norm(selectedDistrict) ||
        offBranchNamesNorm.some((bn: string) => branchDistrict.get(bn) === norm(selectedDistrict));

      const matchesBranch = selectedBranchFilter === 'all' ||
        offBranchNamesNorm.includes(norm(selectedBranchFilter));

      return matchesSelection && matchesDistrict && matchesBranch;
    });

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
  }, [officers, submissions, branches, selectedOfficerFilter, selectedDistrict, selectedBranchFilter, sortField, sortOrder]);

  // Quick Filter Chips filtering logic (AND logic across selected chips)
  const quickFilteredOfficers = useMemo(() => {
    if (activeFilterChips.length === 0) return processedOfficers;

    return processedOfficers.filter(off => {
      return activeFilterChips.every(chip => {
        switch (chip) {
          case 'has_unseen':
            return off.stats.unseen > 0;
          case 'high_amendment':
            return off.stats.amended >= AMEND_THRESHOLD_HIGH;
          case 'below_80_perf':
            return off.stats.performanceIndex < PERF_THRESHOLD_LOW;
          case 'no_branches':
            return off.stats.branchesMapped === 0;
          case 'overloaded':
            return off.stats.unseen >= CAPACITY_HIGH_UNSEEN || off.stats.total >= 30;
          case 'underutilized':
            return off.stats.unseen === 0 && off.stats.total < 10;
          case 'needs_attention':
            return off.stats.unseen >= 4 || off.stats.performanceIndex < PERF_THRESHOLD_LOW || off.stats.amended >= AMEND_THRESHOLD_HIGH;
          case 'recently_reassigned':
            return recentlyReassignedIds.includes(off.id);
          default:
            return true;
        }
      });
    });
  }, [processedOfficers, activeFilterChips, recentlyReassignedIds]);

  // Summary Strip Data (computed from already-loaded dataset)
  const summaryStripData = useMemo(() => {
    const totalUnseen = processedOfficers.reduce((acc, o) => acc + o.stats.unseen, 0);
    const officersWithUnseen = processedOfficers.filter(o => o.stats.unseen > 0).length;

    let highestUnseenOfficer = { name: 'None', count: 0, branch: 'N/A' };
    processedOfficers.forEach(o => {
      if (o.stats.unseen > highestUnseenOfficer.count) {
        highestUnseenOfficer = {
          name: `${o.firstName} ${o.lastName}`,
          count: o.stats.unseen,
          branch: o.branchName || (o.assignedBranchesList?.[0] ? o.assignedBranchesList[0].toUpperCase() : 'N/A')
        };
      }
    });

    const branchUnseenCounts: Record<string, number> = {};
    submissions.forEach(s => {
      if (s.status === KYC_STATUS.SUBMITTED && !s.isResubmitted) {
        const bName = s.branchName || 'Unassigned';
        branchUnseenCounts[bName] = (branchUnseenCounts[bName] || 0) + 1;
      }
    });

    let highestUnseenBranch = { name: 'None', count: 0 };
    Object.entries(branchUnseenCounts).forEach(([bName, count]) => {
      if (count > highestUnseenBranch.count) {
        highestUnseenBranch = { name: bName, count };
      }
    });

    const avgUnseenPerOfficer = processedOfficers.length > 0
      ? (totalUnseen / processedOfficers.length).toFixed(1)
      : '0.0';

    return {
      totalUnseen,
      officersWithUnseen,
      highestUnseenOfficer,
      highestUnseenBranch,
      avgUnseenPerOfficer
    };
  }, [processedOfficers, submissions]);

  // Top 5 Officers With Highest Unseen
  const top5UnseenOfficers = useMemo(() => {
    return [...processedOfficers]
      .filter(o => o.stats.unseen > 0)
      .sort((a, b) => b.stats.unseen - a.stats.unseen)
      .slice(0, 5);
  }, [processedOfficers]);

  // Manager Attention Center Data
  const attentionCenterData = useMemo(() => {
    const criticalUnseenOfficers = processedOfficers.filter(o => o.stats.unseen >= CAPACITY_HIGH_UNSEEN);
    const belowPerfOfficers = processedOfficers.filter(o => o.stats.performanceIndex < PERF_THRESHOLD_LOW);

    const mappedBranchNames = new Set<string>();
    allMappings.forEach(m => {
      if (m.active && m.officers?.length > 0 && m.branchName) {
        mappedBranchNames.add(m.branchName.trim().toLowerCase());
      }
    });

    const unmappedBranches = branches.filter(b => !mappedBranchNames.has(b.name.trim().toLowerCase()));

    const branchUnseenMap: Record<string, number> = {};
    submissions.forEach(s => {
      if (s.status === KYC_STATUS.SUBMITTED && !s.isResubmitted) {
        const bn = (s.branchName || '').trim().toLowerCase();
        if (bn) branchUnseenMap[bn] = (branchUnseenMap[bn] || 0) + 1;
      }
    });

    const overloadedOfficerIds = new Set(criticalUnseenOfficers.map(o => o.id));

    const branchesRequiringReassignment = branches.filter(b => {
      const bNorm = b.name.trim().toLowerCase();
      const unseenCount = branchUnseenMap[bNorm] || 0;
      if (unseenCount >= 8) return true;
      if (!mappedBranchNames.has(bNorm)) return true;

      const branchMappings = allMappings.filter(m => m.active && (m.branchName || '').trim().toLowerCase() === bNorm);
      const branchOfficers = branchMappings.flatMap(m => m.officers || []);
      if (branchOfficers.length > 0 && branchOfficers.every(o => overloadedOfficerIds.has(o.id))) {
        return true;
      }
      return false;
    });

    const healthyOfficers = processedOfficers.filter(o => o.stats.unseen === 0 && o.stats.performanceIndex >= PERF_THRESHOLD_LOW);

    return {
      criticalUnseenCount: criticalUnseenOfficers.length,
      belowPerfCount: belowPerfOfficers.length,
      unmappedBranchCount: unmappedBranches.length,
      reassignmentNeededBranchCount: branchesRequiringReassignment.length,
      healthyOfficerCount: healthyOfficers.length,
    };
  }, [processedOfficers, branches, allMappings, submissions]);

  // SMART WORKLOAD RECOMMENDATION ENGINE (100% Client-side Intelligence)
  const smartWorkloadRecommendations = useMemo(() => {
    const recommendations: any[] = [];
    const maxTotalVolume = Math.max(...processedOfficers.map(o => o.stats.total), 1);

    // Scoring formula: 60% Unseen, 20% Perf Penalty, 15% Amend Rate, 5% Norm Volume
    const calculateCandidateScore = (o: any) => {
      const unseen = o.stats.unseen;
      const perfPenalty = 100 - o.stats.performanceIndex;
      const amendRate = o.stats.total > 0 ? (o.stats.amended / o.stats.total) * 100 : 0;
      const normVolume = (o.stats.total / maxTotalVolume) * 100;
      return (0.60 * unseen) + (0.20 * perfPenalty) + (0.15 * amendRate) + (0.05 * normVolume);
    };

    const availableCandidates = [...processedOfficers]
      .filter(o => o.stats.unseen < CAPACITY_HIGH_UNSEEN)
      .map(o => ({ officer: o, score: calculateCandidateScore(o) }))
      .sort((a, b) => a.score - b.score);

    const bestAvailable = availableCandidates[0]?.officer || null;

    // 1. Priority 1: Branches with no assigned officer
    const mappedBranchNames = new Set<string>();
    allMappings.forEach(m => {
      if (m.active && m.officers?.length > 0 && m.branchName) {
        mappedBranchNames.add(m.branchName.trim().toLowerCase());
      }
    });

    const unmappedBranches = branches.filter(b => !mappedBranchNames.has(b.name.trim().toLowerCase()));

    unmappedBranches.forEach(b => {
      const recId = `rec_unmapped_${b.id}`;
      if (dismissedRecIds.includes(recId)) return;

      const reasons: string[] = [
        `• Branch "${b.name}" has no mapped officer`,
        bestAvailable ? `• Assign immediately to ${bestAvailable.firstName} ${bestAvailable.lastName} (highest-ranked available officer)` : '• Urgent mapping required to handle incoming caseload',
        bestAvailable ? `• ${bestAvailable.firstName} has available capacity (${bestAvailable.stats.unseen} unseen, ${bestAvailable.stats.performanceIndex}% index)` : '• Prevents unassigned backlog accumulation'
      ];

      recommendations.push({
        id: recId,
        priority: 1,
        type: 'UNMAPPED_BRANCH',
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30',
        priorityLabel: '⚫ Priority 1 — Unmapped Branch',
        title: `Branch "${b.name}" has no mapped officer`,
        sourceOfficer: null,
        targetOfficer: bestAvailable,
        targetBranch: b.name,
        reasons,
        estimatedImpact: {
          improvementText: `✔ Assigns officer coverage to ${b.name}`,
          unseenReduction: 0
        },
        confidence: bestAvailable ? 'High' : 'Medium'
      });
    });

    // 2. Priority 2: Officers with critical unseen backlog (>= 8 unseen)
    const criticalOfficers = processedOfficers.filter(o => o.stats.unseen >= CAPACITY_HIGH_UNSEEN);

    criticalOfficers.forEach(src => {
      const srcBranches = src.assignedBranches?.length > 0
        ? src.assignedBranches
        : (src.branchName ? [src.branchName] : []);

      const targetBranch = srcBranches[0] || null;
      const candidates = availableCandidates.filter(c => c.officer.id !== src.id);
      const bestTarget = candidates[0]?.officer || null;

      const recId = `rec_critical_${src.id}_${targetBranch}`;
      if (dismissedRecIds.includes(recId) || !targetBranch || !bestTarget) return;

      const estimatedReduction = Math.min(src.stats.unseen, Math.ceil(src.stats.unseen / 2));
      const srcAfter = src.stats.unseen - estimatedReduction;
      const tgtAfter = bestTarget.stats.unseen + estimatedReduction;

      const confidence = estimatedReduction >= 6 ? 'High' : estimatedReduction >= 3 ? 'Medium' : 'Low';

      const reasons: string[] = [
        `• Highest unseen reduction (relieves ${estimatedReduction} pending files)`,
        `• ${bestTarget.firstName} ${bestTarget.lastName} has available capacity (${bestTarget.stats.unseen} unseen)`,
        `• Lower amendment rate & better performance score (${bestTarget.stats.performanceIndex}%)`
      ];

      recommendations.push({
        id: recId,
        priority: 2,
        type: 'CRITICAL_UNSEEN',
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30',
        priorityLabel: '🔴 Priority 2 — Critical Unseen Backlog',
        title: `Move ${targetBranch} Branch from ${src.firstName} ${src.lastName} to ${bestTarget.firstName} ${bestTarget.lastName}`,
        sourceOfficer: src,
        targetOfficer: bestTarget,
        targetBranch,
        reasons,
        estimatedImpact: {
          sourceCurrentUnseen: src.stats.unseen,
          sourceAfterUnseen: srcAfter,
          targetCurrentUnseen: bestTarget.stats.unseen,
          targetAfterUnseen: tgtAfter,
          unseenReduction: estimatedReduction,
          improvementText: `✔ Unseen reduced by ${estimatedReduction}`
        },
        confidence
      });
    });

    // 3. Priority 3: Officers below performance threshold (< 80%)
    const lowPerfOfficers = processedOfficers.filter(o => o.stats.performanceIndex < PERF_THRESHOLD_LOW && o.stats.unseen > 0);

    lowPerfOfficers.forEach(src => {
      if (criticalOfficers.some(c => c.id === src.id)) return;

      const srcBranches = src.assignedBranches?.length > 0
        ? src.assignedBranches
        : (src.branchName ? [src.branchName] : []);

      const targetBranch = srcBranches[0] || null;
      const candidates = availableCandidates.filter(c => c.officer.id !== src.id);
      const bestTarget = candidates[0]?.officer || null;

      const recId = `rec_lowperf_${src.id}_${targetBranch}`;
      if (dismissedRecIds.includes(recId) || !targetBranch || !bestTarget) return;

      const estimatedReduction = Math.min(src.stats.unseen, Math.ceil(src.stats.unseen / 2));
      const srcAfter = src.stats.unseen - estimatedReduction;
      const tgtAfter = bestTarget.stats.unseen + estimatedReduction;

      const confidence = src.stats.performanceIndex < 60 ? 'High' : 'Medium';

      const reasons: string[] = [
        `• ${src.firstName} has sub-optimal performance index (${src.stats.performanceIndex}%)`,
        `• Reassigning ${targetBranch} transfers workload to ${bestTarget.firstName} (${bestTarget.stats.performanceIndex}% index)`,
        `• Improves branch turnaround SLA and reduces amendment cycles`
      ];

      recommendations.push({
        id: recId,
        priority: 3,
        type: 'LOW_PERFORMER',
        badgeColor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        priorityLabel: '🟠 Priority 3 — Below Performance Threshold',
        title: `Officer ${src.firstName} ${src.lastName} requires assistance`,
        sourceOfficer: src,
        targetOfficer: bestTarget,
        targetBranch,
        reasons,
        estimatedImpact: {
          sourceCurrentUnseen: src.stats.unseen,
          sourceAfterUnseen: srcAfter,
          targetCurrentUnseen: bestTarget.stats.unseen,
          targetAfterUnseen: tgtAfter,
          unseenReduction: estimatedReduction,
          improvementText: `✔ Estimated turnaround improvement of +${100 - src.stats.performanceIndex}%`
        },
        confidence
      });
    });

    // 4. Priority 4: Branches mapped only to overloaded officers
    const overloadedOfficerIds = new Set(criticalOfficers.map(o => o.id));

    branches.forEach(b => {
      const bNorm = b.name.trim().toLowerCase();
      const branchMappings = allMappings.filter(m => m.active && (m.branchName || '').trim().toLowerCase() === bNorm);
      const mappedOfficers = branchMappings.flatMap(m => m.officers || []);

      if (mappedOfficers.length > 0 && mappedOfficers.every(o => overloadedOfficerIds.has(o.id))) {
        const primaryOfficerRel = mappedOfficers[0];
        const src = processedOfficers.find(o => o.id === primaryOfficerRel.id) || null;
        const candidates = availableCandidates.filter(c => !mappedOfficers.some(mo => mo.id === c.officer.id));
        const bestTarget = candidates[0]?.officer || null;

        const recId = `rec_overloaded_branch_${b.id}`;
        if (dismissedRecIds.includes(recId) || !src || !bestTarget) return;

        const estimatedReduction = Math.min(src.stats.unseen, Math.ceil(src.stats.unseen / 2));
        const srcAfter = src.stats.unseen - estimatedReduction;
        const tgtAfter = bestTarget.stats.unseen + estimatedReduction;

        recommendations.push({
          id: recId,
          priority: 4,
          type: 'OVERLOADED_MAPPING',
          badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          priorityLabel: '🟠 Priority 4 — Branch Mapped to Overloaded Staff',
          title: `Branch "${b.name}" mapped only to overloaded officers`,
          sourceOfficer: src,
          targetOfficer: bestTarget,
          targetBranch: b.name,
          reasons: [
            `• All officers currently assigned to ${b.name} are at full capacity (≥ 8 unseen)`,
            `• Reassigning ${b.name} to ${bestTarget.firstName} ${bestTarget.lastName} balances regional throughput`,
            `• Prevents bottlenecks and SLA breach warnings`
          ],
          estimatedImpact: {
            sourceCurrentUnseen: src.stats.unseen,
            sourceAfterUnseen: srcAfter,
            targetCurrentUnseen: bestTarget.stats.unseen,
            targetAfterUnseen: tgtAfter,
            unseenReduction: estimatedReduction,
            improvementText: `✔ Rebalances branch workload to available staff`
          },
          confidence: 'Medium'
        });
      }
    });

    // 5. Priority 5: High amendment cycle officers (>= 5 amendments)
    const highAmendOfficers = processedOfficers.filter(o => o.stats.amended >= AMEND_THRESHOLD_HIGH);

    highAmendOfficers.forEach(src => {
      if (criticalOfficers.some(c => c.id === src.id) || lowPerfOfficers.some(l => l.id === src.id)) return;

      const srcBranches = src.assignedBranches?.length > 0
        ? src.assignedBranches
        : (src.branchName ? [src.branchName] : []);

      const targetBranch = srcBranches[0] || null;
      const candidates = availableCandidates.filter(c => c.officer.id !== src.id);
      const bestTarget = candidates[0]?.officer || null;

      const recId = `rec_highamend_${src.id}_${targetBranch}`;
      if (dismissedRecIds.includes(recId) || !targetBranch || !bestTarget) return;

      recommendations.push({
        id: recId,
        priority: 5,
        type: 'HIGH_AMENDMENTS',
        badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        priorityLabel: '🔵 Priority 5 — High Amendment Cycles',
        title: `High correction rate for ${src.firstName} ${src.lastName}`,
        sourceOfficer: src,
        targetOfficer: bestTarget,
        targetBranch,
        reasons: [
          `• ${src.firstName} has ${src.stats.amended} amendment cycles`,
          `• ${bestTarget.firstName} has lower amendment rate and optimal accuracy`,
          `• Reassigning ${targetBranch} reduces customer resubmission friction`
        ],
        estimatedImpact: {
          sourceCurrentUnseen: src.stats.unseen,
          sourceAfterUnseen: Math.max(0, src.stats.unseen - 2),
          targetCurrentUnseen: bestTarget.stats.unseen,
          targetAfterUnseen: bestTarget.stats.unseen + 2,
          unseenReduction: 2,
          improvementText: `✔ Reduces amendment cycle latency`
        },
        confidence: 'Low'
      });
    });

    // Return top 5 highest priority recommendations
    return recommendations
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);

  }, [processedOfficers, branches, allMappings, submissions, dismissedRecIds]);

  // Branch Health Panel Data (for Branch Matrix view)
  const branchHealthPanelData = useMemo(() => {
    const branchUnseenMap: Record<string, number> = {};
    const branchTotalMap: Record<string, number> = {};
    const branchApprovedMap: Record<string, number> = {};

    submissions.forEach(s => {
      const bName = (s.branchName || '').trim();
      if (!bName) return;
      branchTotalMap[bName] = (branchTotalMap[bName] || 0) + 1;
      if (s.status === KYC_STATUS.APPROVED) {
        branchApprovedMap[bName] = (branchApprovedMap[bName] || 0) + 1;
      }
      if (s.status === KYC_STATUS.SUBMITTED && !s.isResubmitted) {
        branchUnseenMap[bName] = (branchUnseenMap[bName] || 0) + 1;
      }
    });

    const mappingByBranch = new Map<string, any[]>();
    allMappings.forEach(m => {
      if (m.active && m.branchName) {
        const bNorm = m.branchName.trim().toLowerCase();
        if (!mappingByBranch.has(bNorm)) mappingByBranch.set(bNorm, []);
        mappingByBranch.get(bNorm)!.push(m);
      }
    });

    const overloadedOfficerIds = new Set(
      processedOfficers.filter(o => o.stats.unseen >= CAPACITY_HIGH_UNSEEN).map(o => o.id)
    );

    const result = branches.map(b => {
      const bNorm = b.name.trim().toLowerCase();
      const branchMappings = mappingByBranch.get(bNorm) || [];
      const mappedOfficers = branchMappings.flatMap(m => m.officers || []);
      const hasOfficer = mappedOfficers.length > 0;

      const unseen = branchUnseenMap[b.name] || 0;
      const total = branchTotalMap[b.name] || 0;
      const approved = branchApprovedMap[b.name] || 0;
      const efficiency = total > 0 ? Math.round((approved / total) * 100) : 100;

      let category: 'healthy' | 'moderate' | 'critical' | 'unassigned' = 'healthy';

      if (!hasOfficer) {
        category = 'unassigned';
      } else if (unseen >= 8 || efficiency < 50 || mappedOfficers.every((o: any) => overloadedOfficerIds.has(o.id))) {
        category = 'critical';
      } else if (unseen >= 4 || efficiency < 80) {
        category = 'moderate';
      } else {
        category = 'healthy';
      }

      return {
        id: b.id,
        name: b.name,
        districtName: b.district?.name || 'N/A',
        unseen,
        total,
        efficiency,
        mappedOfficerCount: mappedOfficers.length,
        officerNames: mappedOfficers.map((o: any) => o.name || `${o.firstName} ${o.lastName}`).join(', '),
        category
      };
    });

    const counts = {
      healthy: result.filter(r => r.category === 'healthy').length,
      moderate: result.filter(r => r.category === 'moderate').length,
      critical: result.filter(r => r.category === 'critical').length,
      unassigned: result.filter(r => r.category === 'unassigned').length,
    };

    return { list: result, counts };
  }, [branches, submissions, allMappings, processedOfficers]);

  // Smart Branch Reassignment Candidate Ranking Formula
  const reassignSuggestions = useMemo(() => {
    if (!reassignSourceOfficer) return [];

    const sourceOfficerId = reassignSourceOfficer.id;
    const maxTotalVolume = Math.max(...processedOfficers.map(o => o.stats.total), 1);

    return processedOfficers
      .filter(o => o.id !== sourceOfficerId)
      .map(o => {
        const unseen = o.stats.unseen;
        const perfPenalty = 100 - o.stats.performanceIndex;
        const amendRate = o.stats.total > 0 ? (o.stats.amended / o.stats.total) * 100 : 0;
        const normVolume = (o.stats.total / maxTotalVolume) * 100;

        // Weighted ranking formula: 60% Current Unseen, 20% Performance Penalty, 15% Amendment Rate, 5% Normalized Total Volume
        const score = (0.60 * unseen) + (0.20 * perfPenalty) + (0.15 * amendRate) + (0.05 * normVolume);

        const isFullCapacity = unseen >= CAPACITY_HIGH_UNSEEN || (score > 15 && unseen >= 5);

        const whyReasons: string[] = [];
        if (unseen === 0) whyReasons.push('✔ Lowest unseen (0 cases)');
        else if (unseen <= 3) whyReasons.push('✔ Low unseen backlog');

        if (o.stats.performanceIndex >= 90) whyReasons.push('✔ Highest performance rating');
        else if (o.stats.performanceIndex >= 75) whyReasons.push('✔ Optimal performance');

        if (o.stats.amended === 0 || amendRate < 10) whyReasons.push('✔ Lowest amendment rate');
        if (!isFullCapacity) whyReasons.push('✔ Available capacity');

        return {
          officer: o,
          score: Math.round(score * 10) / 10,
          isFullCapacity,
          whyReasons
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [reassignSourceOfficer, processedOfficers]);

  // Handle Smart Branch Reassignment Confirmation
  const handleExecuteReassignment = async () => {
    if (!reassignSourceOfficer || !reassignBranch || !reassignTargetOfficerId) return;

    const fromOfficerId = reassignSourceOfficer.id;
    const toOfficerId = reassignTargetOfficerId;
    const branchName = reassignBranch;

    setIsSubmittingReassign(true);

    const previousSubmissions = [...submissions];
    const targetOfficer = processedOfficers.find(o => o.id === toOfficerId);

    // Optimistically update local submissions state
    setSubmissions(prev => prev.map(s => {
      if ((s.branchName || '').trim().toLowerCase() === branchName.trim().toLowerCase() && s.assignedToId === fromOfficerId) {
        return { ...s, assignedToId: toOfficerId };
      }
      return s;
    }));

    setRecentlyReassignedIds(prev => Array.from(new Set([...prev, fromOfficerId, toOfficerId])));

    try {
      const res = await fetch('/api/admin/reassign-branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branches: [branchName],
          fromOfficerId,
          toOfficerId
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Reassignment request failed');
      }

      toast({
        title: "Branch Reassigned",
        description: `Successfully reassigned ${branchName} to ${targetOfficer ? `${targetOfficer.firstName} ${targetOfficer.lastName}` : 'Target Officer'}.`,
      });

      setReassignModalOpen(false);
      setReassignSourceOfficer(null);
      setReassignBranch(null);
      setReassignTargetOfficerId(null);

      // Refresh background data
      await loadBaseData();
      await loadSubmissions();
    } catch (err: any) {
      setSubmissions(previousSubmissions);
      toast({
        variant: "destructive",
        title: "Reassignment Failed",
        description: err?.message || "Could not complete branch reassignment. Changes rolled back."
      });
    } finally {
      setIsSubmittingReassign(false);
    }
  };

  const openReassignModalForOfficer = (off: any, branchToReassign?: string) => {
    setReassignSourceOfficer(off);
    const availableBranches = off.assignedBranches?.length > 0
      ? off.assignedBranches
      : (off.branchName ? [off.branchName] : []);
    setReassignBranch(branchToReassign || availableBranches[0] || null);
    setReassignTargetOfficerId(null);
    setManagerOverride(false);
    setReassignStep('select');
    setReassignModalOpen(true);
  };

  const currentBranches = useMemo(() => {
    if (!selectedOfficer) return [];
    const bNames = selectedOfficer.assignedBranches?.length > 0
      ? selectedOfficer.assignedBranches
      : (selectedOfficer.branchName ? [selectedOfficer.branchName] : []);

    const tempSet = officerTempBranches.get(selectedOfficer.id) ?? new Set<string>();

    const data = bNames.map((name: string) => {
      const isTemporary = tempSet.has(name.toLowerCase());
      const nameNorm = normalizeBranchName(name).toLowerCase();

      const branchSubs = submissions.filter(s => {
        const sBranchNorm = normalizeBranchName(s.branchName || "").toLowerCase();
        if (sBranchNorm !== nameNorm) return false;

        if (s.assignedToId === selectedOfficer.id) return true;
        if (s.assignedToId === null) return true;

        return s.commentHistory?.some((h: any) =>
          h.userId === selectedOfficer.id &&
          [KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED, KYC_STATUS.IN_REVIEW].includes(h.action)
        );
      });
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
        isTemporary,
        totalFiles: branchSubs.reduce((acc, s) => acc + (s.documents?.length || 0), 0),
        total: branchSubs.length,
        approved: approved.length,
        unseen: branchSubs.filter(s => s.status === KYC_STATUS.SUBMITTED && !s.isResubmitted).length,
        running: branchSubs.filter(s => s.status === KYC_STATUS.IN_REVIEW && !s.isResubmitted).length,
        amended: branchSubs.reduce((acc, s) => acc + (s.amendCycles || 0), 0),
        avgResolutionMinutes,
        pending,
      };
    });

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
  }, [selectedOfficer, submissions, branchSortField, branchSortOrder, officerTempBranches]);

  const sortRows = (rows: any[], field: string, order: 'asc' | 'desc') =>
    [...rows].sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb)) : (va || 0) - (vb || 0);
      return order === 'asc' ? cmp : -cmp;
    });

  const currentCases = useMemo(() => {
    if (!selectedBranch || !selectedOfficer) return [];

    const nameNorm = normalizeBranchName(selectedBranch).toLowerCase();

    const filtered = submissions.filter(s => {
      const sBranchNorm = normalizeBranchName(s.branchName || "").toLowerCase();
      if (sBranchNorm !== nameNorm) return false;

      if (s.assignedToId === selectedOfficer.id) return true;
      if (s.assignedToId === null) return true;

      return s.commentHistory?.some((h: any) =>
        h.userId === selectedOfficer.id &&
        [KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED, KYC_STATUS.IN_REVIEW].includes(h.action)
      );
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (caseSortField) {
        case 'id':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'customer':
          cmp = (a.customerName || '').localeCompare(b.customerName || '');
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'submittedAt':
        default: {
          const aTime = new Date(a.submittedAt || a.createdAt).getTime();
          const bTime = new Date(b.submittedAt || b.createdAt).getTime();
          cmp = aTime - bTime;
          break;
        }
      }
      return caseSortOrder === 'asc' ? cmp : -cmp;
    });
  }, [selectedBranch, selectedOfficer, submissions, caseSortField, caseSortOrder]);

  const branchMatrixData = useMemo(() => {
    if (!submissions.length) return [];

    const branchStats: Record<string, {
      name: string;
      total: number;
      approved: number;
      pending: number;
      amended: number;
      resubmitted: number;
    }> = {};

    submissions.forEach(sub => {
      const bName = sub.branchName || 'Unknown Branch';
      if (!branchStats[bName]) {
        branchStats[bName] = { name: bName, total: 0, approved: 0, pending: 0, amended: 0, resubmitted: 0 };
      }

      branchStats[bName].total++;
      if (sub.isResubmitted) branchStats[bName].resubmitted++;

      if (sub.status === KYC_STATUS.APPROVED) branchStats[bName].approved++;
      else if (sub.status === KYC_STATUS.ACTION_REQUIRED) branchStats[bName].amended++;
      else if ([KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(sub.status) && !sub.isResubmitted) {
        branchStats[bName].pending++;
      }
    });

    const branchRows = Object.values(branchStats).map(branch => ({
      ...branch,
      efficiency: Math.round((branch.approved / (branch.total - branch.pending || 1)) * 100) || 0,
    }));

    return sortRows(branchRows, matrixSortField, matrixSortOrder);
  }, [submissions, matrixSortField, matrixSortOrder]);

  const branchMatrixOptions = useMemo(() => {
    return branchMatrixData.map(b => b.name).sort();
  }, [branchMatrixData]);

  const filteredBranchMatrixOptions = useMemo(() => {
    const term = matrixBranchSearch.trim().toLowerCase();
    if (!term) return branchMatrixOptions;
    return branchMatrixOptions.filter((name) => name.toLowerCase().includes(term));
  }, [branchMatrixOptions, matrixBranchSearch]);

  const filteredBranchMatrixData = useMemo(() => {
    let data = branchMatrixData;
    if (matrixBranchFilter !== 'all') {
      data = data.filter(b => b.name === matrixBranchFilter);
    }
    if (matrixHealthFilter !== 'all') {
      const healthMap = new Map(branchHealthPanelData.list.map(b => [b.name, b.category]));
      data = data.filter(b => healthMap.get(b.name) === matrixHealthFilter);
    }
    return data;
  }, [branchMatrixData, matrixBranchFilter, matrixHealthFilter, branchHealthPanelData]);

  const totalBranchMatrixPages = Math.max(1, Math.ceil(filteredBranchMatrixData.length / BRANCH_MATRIX_PAGE_SIZE));
  const safeBranchMatrixPage = Math.min(branchMatrixPage, totalBranchMatrixPages);
  const branchMatrixPageStart = (safeBranchMatrixPage - 1) * BRANCH_MATRIX_PAGE_SIZE;
  const pagedBranchMatrixData = useMemo(() =>
    filteredBranchMatrixData.slice(branchMatrixPageStart, branchMatrixPageStart + BRANCH_MATRIX_PAGE_SIZE),
    [filteredBranchMatrixData, branchMatrixPageStart]
  );

  // Export CSV of currently filtered, sorted, visible rows
  const handleExportCSV = () => {
    const headers = ['KYC Officer', 'Mapped Branches', 'Case Volume', 'Authorized', 'Unseen', 'Days Since Touch', 'Avg. Resolution', 'Amendment Cycles', 'Performance Index'];
    const rows = quickFilteredOfficers.map(o => [
      `"${o.firstName} ${o.lastName}"`,
      o.stats.branchesMapped,
      o.stats.total,
      o.stats.authorized,
      o.stats.unseen,
      o.stats.daysSinceLastTouched,
      `"${formatResolutionDuration(o.stats.avgResolutionMinutes)}"`,
      o.stats.amended,
      `"${o.stats.performanceIndex}%"`
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

  const totalOfficers = quickFilteredOfficers.length;
  const totalOfficerPages = Math.max(1, Math.ceil(totalOfficers / OFFICER_PAGE_SIZE));
  const safeOfficerPage = Math.min(officerPage, totalOfficerPages);
  const officerPageStart = (safeOfficerPage - 1) * OFFICER_PAGE_SIZE;
  const pagedOfficers = useMemo(
    () => quickFilteredOfficers.slice(officerPageStart, officerPageStart + OFFICER_PAGE_SIZE),
    [quickFilteredOfficers, officerPageStart]
  );

  // Helper for rendering severity badges with tooltip
  const renderUnseenBadge = (unseenCount: number, daysSinceTouch: number) => {
    if (unseenCount === 0) {
      return <span className="text-slate-300 font-black text-lg">0</span>;
    }

    let colorClasses = "bg-amber-50 text-amber-700 border-amber-200";
    let animateClass = "";

    if (unseenCount >= UNSEEN_SEVERITY_THRESHOLDS.PULSE) {
      colorClasses = "bg-red-600 text-white border-red-700 font-black shadow-md";
      animateClass = "animate-slow-pulse";
    } else if (unseenCount >= UNSEEN_SEVERITY_THRESHOLDS.RED) {
      colorClasses = "bg-red-50 text-red-700 border-red-200 font-black";
    } else if (unseenCount >= UNSEEN_SEVERITY_THRESHOLDS.ORANGE) {
      colorClasses = "bg-orange-50 text-orange-700 border-orange-200 font-bold";
    } else if (unseenCount >= UNSEEN_SEVERITY_THRESHOLDS.AMBER) {
      colorClasses = "bg-amber-50 text-amber-700 border-amber-200 font-bold";
    }

    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={cn("font-black text-sm px-3 py-1 gap-1.5 cursor-help border transition-all", colorClasses, animateClass)}>
              <EyeOff className="w-3.5 h-3.5" />
              {unseenCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs font-bold space-y-1">
            <p className="font-black text-amber-400 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Unseen Activity Status</p>
            <p>• Exact Unseen Cases: <span className="text-white font-black">{unseenCount}</span></p>
            <p>• Days Since Last Touched: <span className="text-amber-300 font-black">{daysSinceTouch} {daysSinceTouch === 1 ? 'day' : 'days'}</span></p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

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
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-primary text-white rounded-[2rem] shadow-2xl">
            <Monitor className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 font-headline tracking-tight">Ops Monitoring</h1>
            <p className="text-muted-foreground text-lg font-medium">Institutional Performance & Workload Management Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Always visible action 1: Refresh */}
          <Button 
            variant="outline"
            onClick={() => { loadBaseData(); loadSubmissions(); }}
            className="h-12 px-4 gap-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all shadow-sm"
            title="Manual Data Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
          </Button>

          {/* Always visible action 2: Search */}
          <div className="relative w-60 md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder="Search personnel, branch, email..."
              className="pl-10 h-12 rounded-xl border-slate-200 bg-white font-medium shadow-sm text-sm focus-visible:ring-primary"
            />
            {headerSearch && (
              <button
                type="button"
                onClick={() => setHeaderSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Always visible action 3: Date Filter */}
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />

          {/* More (⋯) Dropdown for all secondary actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-12 w-12 p-0 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                title="More Actions"
              >
                <MoreHorizontal className="w-5 h-5 text-slate-700" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-2 rounded-2xl shadow-2xl border-slate-100 bg-white">
              <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 tracking-wider px-2 py-1.5">
                Secondary Actions
              </DropdownMenuLabel>

              <DropdownMenuItem
                onClick={handleExportCSV}
                className="gap-2.5 font-bold cursor-pointer rounded-xl py-2.5 hover:bg-slate-50 text-slate-800"
              >
                <FileDown className="w-4 h-4 text-slate-600" /> Export Performance CSV
              </DropdownMenuItem>

              {activeFilterChips.length > 0 && (
                <>
                  <DropdownMenuSeparator className="my-1 bg-slate-100" />
                  <DropdownMenuItem
                    onClick={() => setActiveFilterChips([])}
                    className="gap-2.5 font-bold cursor-pointer text-red-600 focus:text-red-600 rounded-xl py-2.5 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" /> Clear Active Filters ({activeFilterChips.length})
                  </DropdownMenuItem>
                </>
              )}

              {dismissedRecIds.length > 0 && (
                <>
                  <DropdownMenuSeparator className="my-1 bg-slate-100" />
                  <DropdownMenuItem
                    onClick={() => setDismissedRecIds([])}
                    className="gap-2.5 font-bold cursor-pointer rounded-xl py-2.5 hover:bg-slate-50 text-slate-800"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-600" /> Reset Dismissed Recs ({dismissedRecIds.length})
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* INDEPENDENT PROGRESSIVE DISCLOSURE PANELS (ALL COLLAPSED BY DEFAULT) */}
      <div className="space-y-4">
        {/* PANEL 1: EXECUTIVE SUMMARY */}
        <IndependentSection
          id="execSummary"
          title="Executive Summary"
          subtitle="Key performance indicators & workload distribution metrics"
          icon={Activity}
          isOpen={!!panelStates.execSummary}
          onToggle={() => togglePanel('execSummary')}
          summaryBadge={
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 font-black text-[10px] uppercase">
              5 KPIs • {summaryStripData.totalUnseen} Total Unseen
            </Badge>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-slate-200 shadow-sm bg-white rounded-2xl p-5 border-l-4 border-l-amber-500">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Unseen Cases</p>
                <EyeOff className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-3xl font-black text-amber-600 mt-2">{summaryStripData.totalUnseen}</p>
              <p className="text-[10px] font-medium text-slate-400 mt-1">Pending first review</p>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white rounded-2xl p-5 border-l-4 border-l-orange-500">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Officers With Unseen</p>
                <Users className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-3xl font-black text-orange-600 mt-2">{summaryStripData.officersWithUnseen}</p>
              <p className="text-[10px] font-medium text-slate-400 mt-1">Of {processedOfficers.length} total officers</p>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white rounded-2xl p-5 border-l-4 border-l-red-500">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Highest Unseen Officer</p>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-xl font-black text-slate-900 mt-2 truncate">{summaryStripData.highestUnseenOfficer.name}</p>
              <p className="text-[10px] font-bold text-red-600 mt-1">{summaryStripData.highestUnseenOfficer.count} unseen cases</p>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white rounded-2xl p-5 border-l-4 border-l-purple-500">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Highest Unseen Branch</p>
                <Building2 className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-xl font-black text-slate-900 mt-2 truncate">{summaryStripData.highestUnseenBranch.name}</p>
              <p className="text-[10px] font-bold text-purple-600 mt-1">{summaryStripData.highestUnseenBranch.count} unseen cases</p>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white rounded-2xl p-5 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Unseen Per Officer</p>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-3xl font-black text-blue-600 mt-2">{summaryStripData.avgUnseenPerOfficer}</p>
              <p className="text-[10px] font-medium text-slate-400 mt-1">Caseload balance metric</p>
            </Card>
          </div>
        </IndependentSection>

        {/* PANEL 2: MANAGER ATTENTION CENTER */}
        <IndependentSection
          id="attentionCenter"
          title="Manager Attention Center"
          subtitle="Real-time risk metrics & operational alerts needing management action"
          icon={Sparkles}
          isOpen={!!panelStates.attentionCenter}
          onToggle={() => togglePanel('attentionCenter')}
          summaryBadge={
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 font-black text-[10px] uppercase">
              {attentionCenterData.criticalUnseenCount + attentionCenterData.belowPerfCount + attentionCenterData.unmappedBranchCount} Risk Alerts
            </Badge>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div 
              onClick={() => toggleFilterChip('overloaded')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                activeFilterChips.includes('overloaded') ? "bg-red-100 border-red-300 ring-2 ring-red-500" : "bg-red-50/50 border-red-100 hover:bg-red-50"
              )}
            >
              <div className="flex items-center gap-1.5 text-red-700 text-xs font-black">
                <XCircle className="w-4 h-4" />
                <span>Critical Unseen</span>
              </div>
              <p className="text-3xl font-black text-red-700 mt-2">{attentionCenterData.criticalUnseenCount}</p>
              <p className="text-[9px] font-bold text-red-600/80 mt-1">Officers ≥ 8 unseen</p>
            </div>

            <div 
              onClick={() => toggleFilterChip('below_80_perf')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                activeFilterChips.includes('below_80_perf') ? "bg-orange-100 border-orange-300 ring-2 ring-orange-500" : "bg-orange-50/50 border-orange-100 hover:bg-orange-50"
              )}
            >
              <div className="flex items-center gap-1.5 text-orange-700 text-xs font-black">
                <AlertCircle className="w-4 h-4" />
                <span>Below Perf.</span>
              </div>
              <p className="text-3xl font-black text-orange-700 mt-2">{attentionCenterData.belowPerfCount}</p>
              <p className="text-[9px] font-bold text-orange-600/80 mt-1">Officers &lt; 80% index</p>
            </div>

            <div 
              onClick={() => toggleFilterChip('no_branches')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                activeFilterChips.includes('no_branches') ? "bg-purple-100 border-purple-300 ring-2 ring-purple-500" : "bg-purple-50/50 border-purple-100 hover:bg-purple-50"
              )}
            >
              <div className="flex items-center gap-1.5 text-purple-700 text-xs font-black">
                <Building2 className="w-4 h-4" />
                <span>Unmapped Br.</span>
              </div>
              <p className="text-3xl font-black text-purple-700 mt-2">{attentionCenterData.unmappedBranchCount}</p>
              <p className="text-[9px] font-bold text-purple-600/80 mt-1">Branches without officer</p>
            </div>

            <div 
              onClick={() => { setViewMode('branch-matrix'); setMatrixHealthFilter('critical'); }}
              className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 hover:bg-amber-50 transition-all cursor-pointer hover:scale-105"
            >
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-black">
                <ArrowRightLeft className="w-4 h-4" />
                <span>Reassign Req.</span>
              </div>
              <p className="text-3xl font-black text-amber-700 mt-2">{attentionCenterData.reassignmentNeededBranchCount}</p>
              <p className="text-[9px] font-bold text-amber-600/80 mt-1">Branches at capacity</p>
            </div>

            <div 
              onClick={() => setActiveFilterChips([])}
              className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 hover:bg-emerald-50 transition-all cursor-pointer hover:scale-105"
            >
              <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-black">
                <CheckCircle2 className="w-4 h-4" />
                <span>Healthy Off.</span>
              </div>
              <p className="text-3xl font-black text-emerald-700 mt-2">{attentionCenterData.healthyOfficerCount}</p>
              <p className="text-[9px] font-bold text-emerald-600/80 mt-1">Optimal workload</p>
            </div>
          </div>
        </IndependentSection>

        {/* PANEL 3: TOP 5 UNSEEN OFFICERS */}
        <IndependentSection
          id="top5Officers"
          title="Top 5 Highest Unseen Officers"
          subtitle="Personnel with highest unseen caseload requiring immediate balance"
          icon={AlertTriangle}
          isOpen={!!panelStates.top5Officers}
          onToggle={() => togglePanel('top5Officers')}
          summaryBadge={
            <Badge className="bg-red-500/20 text-red-300 border-red-400/30 font-black text-[10px] uppercase">
              {top5UnseenOfficers.length} Officers Flagged
            </Badge>
          }
        >
          <div className="space-y-2">
            {top5UnseenOfficers.length === 0 ? (
              <p className="text-center py-8 text-xs font-bold text-slate-400 italic">No officers with unseen cases</p>
            ) : top5UnseenOfficers.map((off, idx) => (
              <div key={off.id} className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200/70 hover:bg-amber-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shadow-sm">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-bold text-sm text-slate-900">{off.firstName} {off.lastName}</p>
                    <p className="text-[10px] font-semibold text-slate-500">{off.branchName || 'Multiple Branches'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-amber-100 text-amber-800 font-black text-xs px-3 py-1">
                    {off.stats.unseen} unseen cases
                  </Badge>
                  <span className="text-xs font-bold text-slate-600">{off.stats.performanceIndex}% index</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openReassignModalForOfficer(off)}
                    className="h-8 text-xs font-bold rounded-lg border-slate-200 hover:bg-slate-100"
                  >
                    Reassign
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </IndependentSection>

        {/* PANEL 4: SMART WORKLOAD RECOMMENDATIONS */}
        <IndependentSection
          id="recommendations"
          title="Smart Workload Recommendations"
          subtitle="Client-side decision support & proactive reassignment suggestions"
          icon={Lightbulb}
          isOpen={!!panelStates.recommendations}
          onToggle={() => togglePanel('recommendations')}
          summaryBadge={
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 font-black text-[10px] uppercase">
              {smartWorkloadRecommendations.length} Recommendations
            </Badge>
          }
          headerBadge={
            dismissedRecIds.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setDismissedRecIds([]); }}
                className="h-7 text-[10px] text-slate-400 font-bold hover:text-white"
              >
                Reset Dismissed ({dismissedRecIds.length})
              </Button>
            ) : undefined
          }
        >
          {smartWorkloadRecommendations.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-100 rounded-2xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="font-black text-slate-900 text-base">✅ No workload balancing actions are currently recommended.</p>
              <p className="text-xs text-slate-500 font-semibold max-w-md mx-auto">
                All officers and branches are within acceptable workload thresholds. No immediate reassignments required.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {smartWorkloadRecommendations.map((rec) => (
                <Card key={rec.id} className="border-slate-200 shadow-sm bg-white rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow relative group">
                  <button
                    type="button"
                    onClick={() => handleDismissRecommendation(rec.id)}
                    className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Dismiss Recommendation"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pr-6 flex-wrap">
                      <Badge className={cn("text-[9px] font-black uppercase px-2.5 py-0.5 border", rec.badgeColor)}>
                        {rec.priorityLabel}
                      </Badge>
                      <Badge className={cn(
                        "text-[9px] font-black uppercase px-2 py-0.5",
                        rec.confidence === 'High' ? "bg-emerald-100 text-emerald-800" :
                        rec.confidence === 'Medium' ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                      )}>
                        Confidence: {rec.confidence}
                      </Badge>
                    </div>

                    <h4 className="font-black text-slate-900 text-sm leading-snug">{rec.title}</h4>

                    <div className="space-y-1 text-xs text-slate-600 font-medium">
                      {rec.reasons.map((r: string, idx: number) => (
                        <p key={idx} className="leading-snug">{r}</p>
                      ))}
                    </div>

                    {rec.estimatedImpact && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated Impact</p>
                        
                        {rec.sourceOfficer && rec.targetOfficer && (
                          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                            <div>
                              <span className="text-slate-500 block truncate">{rec.sourceOfficer.firstName}:</span>
                              <span className="text-slate-900 font-black">
                                Unseen: {rec.estimatedImpact.sourceCurrentUnseen} → <span className="text-emerald-600 font-black">{rec.estimatedImpact.sourceAfterUnseen}</span>
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block truncate">{rec.targetOfficer.firstName}:</span>
                              <span className="text-slate-900 font-black">
                                Unseen: {rec.estimatedImpact.targetCurrentUnseen} → <span className="text-amber-600 font-black">{rec.estimatedImpact.targetAfterUnseen}</span>
                              </span>
                            </div>
                          </div>
                        )}

                        <p className="text-xs font-black text-emerald-600 flex items-center gap-1 mt-1">
                          {rec.estimatedImpact.improvementText}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      onClick={() => {
                        const src = rec.sourceOfficer || rec.targetOfficer;
                        if (src) openReassignModalForOfficer(src, rec.targetBranch || undefined);
                      }}
                      className="flex-1 h-9 bg-slate-900 hover:bg-black text-white font-black text-xs rounded-xl gap-1.5"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" /> Open Reassignment
                    </Button>

                    {(rec.sourceOfficer || rec.targetOfficer) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const target = rec.sourceOfficer || rec.targetOfficer;
                          if (target) {
                            setSelectedOfficer(target);
                            setViewMode('branches');
                          }
                        }}
                        className="h-9 px-3 border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100"
                        title="View Officer Portfolio"
                      >
                        View Officer
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </IndependentSection>

        {/* PANEL 5: BRANCH HEALTH PANEL */}
        <IndependentSection
          id="branchHealth"
          title="Branch Health Overview"
          subtitle="Network branch operational capacity & risk classification"
          icon={Building2}
          isOpen={!!panelStates.branchHealth}
          onToggle={() => togglePanel('branchHealth')}
          summaryBadge={
            <Badge className="bg-red-500/20 text-red-300 border-red-400/30 font-black text-[10px] uppercase">
              {branchHealthPanelData.counts.critical} Critical • {branchHealthPanelData.counts.unassigned} Unassigned
            </Badge>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              onClick={() => { setViewMode('branch-matrix'); setMatrixHealthFilter('healthy'); }}
              className="p-4 rounded-2xl bg-white border border-emerald-200 hover:bg-emerald-50/50 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
            >
              <div className="flex items-center justify-between text-emerald-800 font-black text-sm">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Healthy Branches</span>
                <Badge className="bg-emerald-100 text-emerald-800 font-black text-sm">{branchHealthPanelData.counts.healthy}</Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-2">Mapped officers & low unseen caseload</p>
            </div>

            <div 
              onClick={() => { setViewMode('branch-matrix'); setMatrixHealthFilter('moderate'); }}
              className="p-4 rounded-2xl bg-white border border-amber-200 hover:bg-amber-50/50 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
            >
              <div className="flex items-center justify-between text-amber-800 font-black text-sm">
                <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-amber-600" /> Moderate Risk</span>
                <Badge className="bg-amber-100 text-amber-800 font-black text-sm">{branchHealthPanelData.counts.moderate}</Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-2">Moderate unseen or lower turnaround SLA</p>
            </div>

            <div 
              onClick={() => { setViewMode('branch-matrix'); setMatrixHealthFilter('critical'); }}
              className="p-4 rounded-2xl bg-white border border-red-200 hover:bg-red-50/50 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
            >
              <div className="flex items-center justify-between text-red-800 font-black text-sm">
                <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-red-600" /> Critical Status</span>
                <Badge className="bg-red-100 text-red-800 font-black text-sm">{branchHealthPanelData.counts.critical}</Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-2">≥ 8 unseen or mapped to overloaded staff</p>
            </div>

            <div 
              onClick={() => { setViewMode('branch-matrix'); setMatrixHealthFilter('unassigned'); }}
              className="p-4 rounded-2xl bg-white border border-purple-200 hover:bg-purple-50/50 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
            >
              <div className="flex items-center justify-between text-purple-800 font-black text-sm">
                <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-purple-600" /> Unmapped Branches</span>
                <Badge className="bg-purple-100 text-purple-800 font-black text-sm">{branchHealthPanelData.counts.unassigned}</Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-2">Zero active officers assigned</p>
            </div>
          </div>
        </IndependentSection>

        {/* PANEL 6: ADVANCED FILTERS */}
        <IndependentSection
          id="advancedFilters"
          title="Advanced Filters & Controls"
          subtitle="Jurisdiction district, branch, officer selection & quick filter chips"
          icon={Filter}
          isOpen={!!panelStates.advancedFilters}
          onToggle={() => togglePanel('advancedFilters')}
          summaryBadge={
            <Badge className="bg-primary/20 text-amber-300 border-primary/30 font-black text-[10px] uppercase">
              {activeFilterChips.length > 0 ? `${activeFilterChips.length} Chips Active` : "District, Branch & Officer Filters"}
            </Badge>
          }
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* DISTRICT SEARCHABLE */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Jurisdiction District</Label>
                <Popover open={distOpen} onOpenChange={setDistOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between h-12 rounded-xl border-slate-200 bg-white font-bold">
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
                          <div className="flex items-center gap-2"><MapIcon className="w-4 h-4" /> Overall Network</div>
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
                    <Button variant="outline" role="combobox" className="w-full justify-between h-12 rounded-xl border-slate-200 bg-white font-bold">
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
                    <Button variant="outline" role="combobox" className="w-full justify-between h-12 rounded-xl border-slate-200 bg-white font-bold">
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
            </div>

            {/* MANAGER QUICK FILTERS CHIPS BAR */}
            <div className="pt-4 border-t border-slate-200/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  <span>Manager Quick Filters (AND Logic)</span>
                </div>
                {activeFilterChips.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setActiveFilterChips([])}
                    className="h-7 text-xs text-slate-500 font-bold hover:text-red-600"
                  >
                    Clear All Filters ({activeFilterChips.length})
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'has_unseen', label: 'Has Unseen', icon: EyeOff },
                  { id: 'high_amendment', label: 'High Amendment Cycles', icon: AlertCircle },
                  { id: 'below_80_perf', label: 'Below 80% Performance', icon: TrendingUp },
                  { id: 'no_branches', label: 'No Branches Assigned', icon: Building2 },
                  { id: 'overloaded', label: 'Overloaded', icon: XCircle },
                  { id: 'underutilized', label: 'Underutilized', icon: CheckCircle2 },
                  { id: 'needs_attention', label: 'Needs Attention', icon: AlertTriangle },
                  { id: 'recently_reassigned', label: 'Recently Reassigned', icon: ArrowRightLeft },
                ].map(chip => {
                  const isActive = activeFilterChips.includes(chip.id);
                  const IconComponent = chip.icon;
                  return (
                    <Badge
                      key={chip.id}
                      onClick={() => toggleFilterChip(chip.id)}
                      className={cn(
                        "px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all gap-1.5 border shadow-sm select-none",
                        isActive 
                          ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-primary/20" 
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <IconComponent className="w-3.5 h-3.5" />
                      {chip.label}
                      {isActive && <Check className="w-3 h-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </IndependentSection>
      </div>

      {/* DRILL-DOWN NAVIGATION TRACK WITH NOTIFICATION DOTS */}
      <div className="flex items-center gap-3 bg-slate-100/50 p-2 rounded-2xl w-fit border border-slate-200/50 shadow-inner">
        <Button
          variant={viewMode === 'officers' ? 'secondary' : 'ghost'}
          onClick={() => { setViewMode('officers'); setSelectedOfficer(null); setSelectedBranch(null); }}
          className={cn("h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all relative", viewMode === 'officers' ? "bg-primary text-white shadow-lg" : "text-slate-500")}
        >
          Officer Matrix
          {summaryStripData.totalUnseen > 0 && (
            <span className="ml-2 w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block ring-2 ring-white" />
          )}
        </Button>
        <Button
          variant={viewMode === 'branch-matrix' ? 'secondary' : 'ghost'}
          onClick={() => { setViewMode('branch-matrix'); setSelectedOfficer(null); setSelectedBranch(null); }}
          className={cn("h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all relative", viewMode === 'branch-matrix' ? "bg-primary text-white shadow-lg" : "text-slate-500")}
        >
          Branch Matrix
          {summaryStripData.totalUnseen > 0 && (
            <span className="ml-2 w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block ring-2 ring-white" />
          )}
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
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-white/20 border-white/20 text-white font-black px-4 py-1.5 h-9">
                  {quickFilteredOfficers.length} Officers Showing
                </Badge>
              </div>
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
                  {quickFilteredOfficers.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="py-32 text-center text-slate-400 italic">No personnel discovered in current selection context.</TableCell></TableRow>
                  ) : pagedOfficers.map((off) => (
                    <TableRow key={off.id} className="hover:bg-slate-50/80 transition-all border-b border-slate-100 group">
                      <TableCell className="py-8 pl-10">
                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedOfficer(off); setViewMode('branches'); }}>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                            {off.firstName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 leading-none flex items-center gap-2">
                              {off.firstName} {off.lastName}
                              {recentlyReassignedIds.includes(off.id) && (
                                <Badge className="bg-blue-100 text-blue-700 text-[8px] font-black h-4 px-1.5">REASSIGNED</Badge>
                              )}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{off.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-black text-slate-700 text-lg">{off.stats.branchesMapped}</TableCell>
                      <TableCell className="text-center font-black text-primary text-lg">{off.stats.total}</TableCell>
                      <TableCell className="text-center font-black text-emerald-600 text-lg">{off.stats.authorized}</TableCell>
                      <TableCell className="text-center">
                        {renderUnseenBadge(off.stats.unseen, off.stats.daysSinceLastTouched)}
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReassignModalForOfficer(off)}
                            className="h-9 px-3 gap-1.5 rounded-xl text-slate-600 font-bold hover:text-primary hover:bg-primary/10 transition-all text-xs"
                            title="Reassign Branch Workload"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Reassign
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedOfficer(off); setViewMode('branches'); }} className="h-9 w-9 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/5 transition-all">
                            <ChevronRight className="w-5 h-5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            {totalOfficerPages > 1 && (
              <div className="flex items-center justify-between gap-4 border-t bg-slate-50/80 px-6 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safeOfficerPage <= 1}
                  onClick={() => setOfficerPage(p => Math.max(1, p - 1))}
                  className="h-9 gap-1 font-bold border-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Page {safeOfficerPage} of {totalOfficerPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safeOfficerPage >= totalOfficerPages}
                  onClick={() => setOfficerPage(p => Math.min(totalOfficerPages, p + 1))}
                  className="h-9 gap-1 font-bold border-slate-200"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* BRANCH MATRIX VIEW WITH BRANCH HEALTH PANEL */}
        {viewMode === 'branch-matrix' && (
          <div className="space-y-6">
            {/* BRANCH HEALTH SUMMARY PANEL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <Card
                onClick={() => setMatrixHealthFilter(matrixHealthFilter === 'healthy' ? 'all' : 'healthy')}
                className={cn(
                  "p-5 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                  matrixHealthFilter === 'healthy' ? "bg-emerald-100 border-emerald-300 ring-2 ring-emerald-500" : "bg-white border-slate-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-700 uppercase">🟢 Healthy Branches</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-3xl font-black text-emerald-700 mt-2">{branchHealthPanelData.counts.healthy}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Normal SLA & workload</p>
              </Card>

              <Card
                onClick={() => setMatrixHealthFilter(matrixHealthFilter === 'moderate' ? 'all' : 'moderate')}
                className={cn(
                  "p-5 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                  matrixHealthFilter === 'moderate' ? "bg-amber-100 border-amber-300 ring-2 ring-amber-500" : "bg-white border-slate-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-700 uppercase">🟡 Moderate Risk</span>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-3xl font-black text-amber-700 mt-2">{branchHealthPanelData.counts.moderate}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">4–7 unseen or 50-79% eff.</p>
              </Card>

              <Card
                onClick={() => setMatrixHealthFilter(matrixHealthFilter === 'critical' ? 'all' : 'critical')}
                className={cn(
                  "p-5 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                  matrixHealthFilter === 'critical' ? "bg-red-100 border-red-300 ring-2 ring-red-500" : "bg-white border-slate-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-red-700 uppercase">🔴 Critical Status</span>
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
                <p className="text-3xl font-black text-red-700 mt-2">{branchHealthPanelData.counts.critical}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Overloaded / high unseen</p>
              </Card>

              <Card
                onClick={() => setMatrixHealthFilter(matrixHealthFilter === 'unassigned' ? 'all' : 'unassigned')}
                className={cn(
                  "p-5 rounded-2xl border transition-all cursor-pointer hover:scale-105",
                  matrixHealthFilter === 'unassigned' ? "bg-slate-200 border-slate-400 ring-2 ring-slate-600" : "bg-white border-slate-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 uppercase">⚫ No Officer Assigned</span>
                  <Building2 className="w-4 h-4 text-slate-600" />
                </div>
                <p className="text-3xl font-black text-slate-700 mt-2">{branchHealthPanelData.counts.unassigned}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Requires mapping setup</p>
              </Card>
            </div>

            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
              <CardHeader className="bg-primary text-white p-8 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black flex items-center gap-3"><Building2 className="w-6 h-6 text-white" /> Branch Throughput Matrix</CardTitle>
                  <CardDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">Comparative monitoring data for all branches</CardDescription>
                </div>
                <Badge variant="outline" className="bg-white/20 border-white/20 text-white font-black px-4 py-1.5 h-9">
                  {filteredBranchMatrixData.length} Branches Filtered
                </Badge>
              </CardHeader>
              <CardHeader className="bg-slate-50/50 border-b">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="flex items-center gap-2">
                    <Popover open={matrixBranchOpen} onOpenChange={setMatrixBranchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 w-full justify-between gap-2 border-slate-200 bg-white md:w-[280px]">
                          <span className="truncate text-sm font-bold">
                            {matrixBranchFilter === "all" ? "All Branches" : matrixBranchFilter}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 rounded-xl border border-slate-200 p-0 shadow-xl">
                        <div className="relative border-b border-slate-100 p-3">
                          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            placeholder="Search branch..."
                            value={matrixBranchSearch}
                            onChange={(e) => setMatrixBranchSearch(e.target.value)}
                            className="h-10 rounded-lg border-slate-200 pl-9 text-sm"
                          />
                        </div>
                        <ScrollArea className="max-h-64 p-2">
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                              matrixBranchFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                            )}
                            onClick={() => {
                              setMatrixBranchFilter("all");
                              setMatrixBranchOpen(false);
                            }}
                          >
                            <span>All Branches</span>
                            {matrixBranchFilter === "all" && <Check className="h-4 w-4" />}
                          </button>
                          {filteredBranchMatrixOptions.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className={cn(
                                "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                                matrixBranchFilter === name ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                              )}
                              onClick={() => {
                                setMatrixBranchFilter(name);
                                setMatrixBranchOpen(false);
                              }}
                            >
                              <span className="truncate">{name}</span>
                              {matrixBranchFilter === name && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>

                    {matrixHealthFilter !== 'all' && (
                      <Button variant="ghost" onClick={() => setMatrixHealthFilter('all')} className="h-10 text-xs font-bold text-slate-500">
                        Clear Health Filter
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 border-b">
                    <TableRow>
                      <TableHead
                        className={cn(
                          "py-6 pl-10 font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'name' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('name')}
                      >
                        <div className="flex items-center">
                          Branch
                          <SortIndicator field="name" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                      <TableHead
                        className={cn(
                          "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'total' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('total')}
                      >
                        <div className="flex items-center justify-center">
                          Case Volume
                          <SortIndicator field="total" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                      <TableHead
                        className={cn(
                          "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'approved' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('approved')}
                      >
                        <div className="flex items-center justify-center">
                          Authorized
                          <SortIndicator field="approved" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                      <TableHead
                        className={cn(
                          "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'amended' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('amended')}
                      >
                        <div className="flex items-center justify-center">
                          Amendments
                          <SortIndicator field="amended" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                      <TableHead
                        className={cn(
                          "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'pending' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('pending')}
                      >
                        <div className="flex items-center justify-center">
                          Unseen
                          <SortIndicator field="pending" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                      <TableHead
                        className={cn(
                          "text-center font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'resubmitted' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('resubmitted')}
                      >
                        <div className="flex items-center justify-center">
                          Resubmitted
                          <SortIndicator field="resubmitted" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                      <TableHead
                        className={cn(
                          "text-right pr-10 font-black text-[11px] uppercase tracking-widest cursor-pointer transition-all duration-300 group",
                          matrixSortField === 'efficiency' ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-slate-500 hover:bg-slate-100"
                        )}
                        onClick={() => toggleMatrixSort('efficiency')}
                      >
                        <div className="flex items-center justify-end">
                          Efficiency
                          <SortIndicator field="efficiency" currentField={matrixSortField} currentOrder={matrixSortOrder} />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedBranchMatrixData.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="py-32 text-center text-slate-400 italic">No branch data available.</TableCell></TableRow>
                    ) : pagedBranchMatrixData.map((branch) => (
                      <TableRow key={branch.name} className="hover:bg-slate-50/80 transition-all border-b border-slate-100 group">
                        <TableCell className="py-6 pl-10">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              <Building2 className="w-5 h-5" />
                            </div>
                            <span className="font-black text-slate-900">{branch.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-black text-primary text-lg">{branch.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold">{branch.approved}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-bold">{branch.amended}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-primary/10 text-primary font-bold">{branch.pending}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-purple-50 text-purple-700 font-bold">{branch.resubmitted}</Badge>
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-xs font-black text-emerald-600">{branch.efficiency}%</span>
                            <Progress value={branch.efficiency} className="w-24 h-1.5 bg-slate-100" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              {totalBranchMatrixPages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t bg-slate-50/80 px-6 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safeBranchMatrixPage <= 1}
                    onClick={() => setBranchMatrixPage(p => Math.max(1, p - 1))}
                    className="h-9 gap-1 font-bold border-slate-200"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </Button>
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                    Page {safeBranchMatrixPage} of {totalBranchMatrixPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safeBranchMatrixPage >= totalBranchMatrixPages}
                    onClick={() => setBranchMatrixPage(p => Math.min(totalBranchMatrixPages, p + 1))}
                    className="h-9 gap-1 font-bold border-slate-200"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* OFFICER BRANCHES PORTFOLIO VIEW */}
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
                        <TableHead className="text-right pr-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentBranches.map((b: any) => (
                        <TableRow key={b.name} className="hover:bg-slate-50 transition-colors border-b group">
                          <TableCell className="py-8 pl-10 cursor-pointer" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-primary/10 group-hover:text-primary transition-colors"><Building2 className="w-5 h-5" /></div>
                              <div className="flex flex-col gap-1">
                                <span className="font-black text-slate-900 text-base">{b.name}</span>
                                {b.isTemporary && (
                                  <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-black px-2 py-0 h-4 w-fit">
                                    Temporary
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-black text-emerald-600 text-lg cursor-pointer" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>{b.approved}</TableCell>
                          <TableCell className="text-center font-black text-slate-700 cursor-pointer" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>{b.totalFiles}</TableCell>
                          <TableCell className="text-center cursor-pointer" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>
                            {renderUnseenBadge(b.unseen, 0)}
                          </TableCell>
                          <TableCell className="text-center cursor-pointer" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>
                            <Badge variant="outline" className="font-black text-[10px] bg-slate-50">
                              {formatResolutionDuration(b.avgResolutionMinutes)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-black text-orange-600 cursor-pointer" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>{b.amended}</TableCell>
                          <TableCell className="text-right pr-10">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReassignModalForOfficer(selectedOfficer, b.name)}
                              className="h-8 text-xs font-bold gap-1 text-slate-700 hover:text-primary"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" /> Reassign
                            </Button>
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
                <CardHeader className="bg-primary p-6 border-b text-white flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-black uppercase tracking-widest text-white">Officer Profile</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => openReassignModalForOfficer(selectedOfficer)}
                    className="h-8 bg-white/20 text-white font-bold hover:bg-white/30 text-xs gap-1.5"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Smart Reassign
                  </Button>
                </CardHeader>
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

        {/* CASE AUDIT VIEW */}
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
                    <TableHead className="py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500 cursor-pointer select-none" onClick={() => toggleCaseSort('id')}>
                      <div className="flex items-center gap-1">Case ID <SortIndicator field="id" currentField={caseSortField} currentOrder={caseSortOrder} /></div>
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500 cursor-pointer select-none" onClick={() => toggleCaseSort('customer')}>
                      <div className="flex items-center gap-1">Customer Identity <SortIndicator field="customer" currentField={caseSortField} currentOrder={caseSortOrder} /></div>
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500 cursor-pointer select-none" onClick={() => toggleCaseSort('submittedAt')}>
                      <div className="flex items-center gap-1">Age / Resolution SLA <SortIndicator field="submittedAt" currentField={caseSortField} currentOrder={caseSortOrder} /></div>
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Institutional Oversight</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500 cursor-pointer select-none" onClick={() => toggleCaseSort('status')}>
                      <div className="flex items-center gap-1">Status <SortIndicator field="status" currentField={caseSortField} currentOrder={caseSortOrder} /></div>
                    </TableHead>
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

      {/* SMART BRANCH REASSIGNMENT MODAL */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white">
          <DialogHeader className="p-6 bg-slate-900 text-white space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-2xl text-primary"><ArrowRightLeft className="w-6 h-6" /></div>
              <div>
                <DialogTitle className="text-xl font-black text-white">Smart Branch Reassignment</DialogTitle>
                <DialogDescription className="text-slate-400 text-xs font-semibold">
                  Client-side capacity balancing & batched assignment dispatch
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* SOURCE & BRANCH SELECTOR */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400">Current Officer</Label>
                <p className="text-sm font-black text-slate-900 mt-1">
                  {reassignSourceOfficer?.firstName} {reassignSourceOfficer?.lastName}
                </p>
                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                  <EyeOff className="w-3 h-3" /> {reassignSourceOfficer?.stats.unseen ?? 0} unseen cases
                </span>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400">Branch to Reassign</Label>
                <select
                  value={reassignBranch || ''}
                  onChange={(e) => setReassignBranch(e.target.value)}
                  className="w-full mt-1 h-9 rounded-xl border border-slate-200 bg-white text-xs font-bold px-3 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {(reassignSourceOfficer?.assignedBranches?.length > 0
                    ? reassignSourceOfficer.assignedBranches
                    : (reassignSourceOfficer?.branchName ? [reassignSourceOfficer.branchName] : [])
                  ).map((b: string) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* SUGGESTED OFFICERS RANKED LIST */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black text-slate-900 uppercase tracking-wide">
                  Suggested Target Officers (Ranked by Capacity Score)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="managerOverride"
                    checked={managerOverride}
                    onChange={(e) => setManagerOverride(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                  />
                  <label htmlFor="managerOverride" className="text-xs font-bold text-slate-600 cursor-pointer">
                    Manual Manager Override
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                {reassignSuggestions.map((sug) => {
                  const isSelected = reassignTargetOfficerId === sug.officer.id;
                  const isDisabled = sug.isFullCapacity && !managerOverride;

                  return (
                    <div
                      key={sug.officer.id}
                      onClick={() => {
                        if (!isDisabled) setReassignTargetOfficerId(sug.officer.id);
                      }}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4",
                        isSelected ? "bg-primary/5 border-primary ring-2 ring-primary/20 shadow-md" : "bg-white border-slate-100 hover:bg-slate-50",
                        isDisabled && "opacity-50 cursor-not-allowed bg-slate-50"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-sm">{sug.officer.firstName} {sug.officer.lastName}</span>
                          {sug.isFullCapacity ? (
                            <Badge className="bg-red-100 text-red-700 text-[9px] font-black border-red-200">🔴 Full Capacity</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 text-[9px] font-black border-emerald-200">🟢 Available</Badge>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">Score: {sug.score}</span>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] font-medium text-slate-600">
                          {sug.whyReasons.map((reason, rIdx) => (
                            <span key={rIdx} className="text-emerald-700 font-semibold">{reason}</span>
                          ))}
                        </div>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <span className="text-xs font-black text-amber-600 block">{sug.officer.stats.unseen} unseen</span>
                        <span className="text-[10px] font-bold text-slate-400">{sug.officer.stats.performanceIndex}% perf</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ESTIMATED IMPACT PREVIEW */}
            {reassignTargetOfficerId && (
              <Card className="p-4 rounded-2xl bg-amber-50/50 border-amber-200 space-y-3">
                <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-amber-600" /> Estimated Workload Impact
                </p>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-amber-100">
                    <p className="font-bold text-slate-500">Source: {reassignSourceOfficer?.firstName}</p>
                    <p className="text-sm font-black text-slate-900 mt-1">
                      Unseen: {reassignSourceOfficer?.stats.unseen} → <span className="text-emerald-600 font-black">{Math.max(0, (reassignSourceOfficer?.stats.unseen || 0) - 5)}</span>
                    </p>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-amber-100">
                    <p className="font-bold text-slate-500">
                      Target: {processedOfficers.find(o => o.id === reassignTargetOfficerId)?.firstName}
                    </p>
                    <p className="text-sm font-black text-slate-900 mt-1">
                      Unseen: {processedOfficers.find(o => o.id === reassignTargetOfficerId)?.stats.unseen} → <span className="text-amber-600 font-black">{(processedOfficers.find(o => o.id === reassignTargetOfficerId)?.stats.unseen || 0) + 5}</span>
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t flex items-center justify-between">
            <Button variant="ghost" onClick={() => setReassignModalOpen(false)} className="font-bold text-slate-500">
              Cancel
            </Button>
            <Button
              disabled={!reassignTargetOfficerId || isSubmittingReassign}
              onClick={handleExecuteReassignment}
              className="bg-slate-900 hover:bg-black text-white font-black px-6 gap-2 rounded-xl"
            >
              {isSubmittingReassign ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              Confirm Batched Reassignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  const target = showSummary;
                  setShowSummary(null);
                  openReassignModalForOfficer(target);
                }}
                className="flex-1 h-14 bg-primary text-white font-black rounded-2xl shadow-xl hover:bg-primary/90 transition-all gap-2"
              >
                <ArrowRightLeft className="w-4 h-4" /> Reassign Workload
              </Button>
              <Button onClick={() => setShowSummary(null)} variant="outline" className="h-14 px-6 border-slate-200 font-bold rounded-2xl">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
