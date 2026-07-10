'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { normalizeAssignedBranches } from "@/lib/jurisdiction";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  Legend
} from 'recharts';
import { 
  Check,
  ChevronsUpDown,
  FileBarChart, 
  Download, 
  Filter, 
  Search, 
  Building2,
  AlertTriangle, 
  Clock, 
  Loader2,
  TrendingUp,
  History,
  Inbox,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Activity
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { getSubmissions, getCaseMetrics, getDistrictPerformance, getMonthlyTrend } from "@/actions/submissions";
import { getBranches, getDistricts } from "@/actions/hierarchy";
import { KYC_STATUS } from "@/lib/kyc-data";
import { cn } from "@/lib/utils";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

const COLORS = ['#B89334', '#10B981', '#3F51B5', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function ManagementReportingPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { toast } = useToast();
  const router = useRouter();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [districtPerformance, setDistrictPerformance] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [districtSearch, setDistrictSearch] = useState("");
  const [districtFilterOpen, setDistrictFilterOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [branchFilterOpen, setBranchFilterOpen] = useState(false);
  const [riskSearch, setRiskSearch] = useState("");
  const [riskFilterOpen, setRiskFilterOpen] = useState(false);
  const [statusSearch, setStatusSearch] = useState("");
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    loadInstitutionalData();
  }, [user, dateRange]);

  const metricFilters = useMemo(() => {
    const branch = selectedBranch === 'all' ? undefined : selectedBranch;
    const status = selectedStatus === 'all' ? undefined : selectedStatus;
    const entityType = selectedType === 'all' ? undefined : selectedType;
    const isExceptional = selectedRisk === 'all' ? undefined : selectedRisk === 'HIGH';

    return {
      district: selectedDistrict === 'all' ? undefined : selectedDistrict,
      branch,
      status,
      entityType,
      isExceptional,
      startDate: dateRange?.from ? dateRange.from.toISOString() : undefined,
      endDate: dateRange?.to ? dateRange.to.toISOString() : undefined,
    };
  }, [selectedDistrict, selectedBranch, selectedStatus, selectedType, selectedRisk, dateRange]);

  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      try {
        const [metrics, districtRows, trendRows] = await Promise.all([
          getCaseMetrics(metricFilters),
          getDistrictPerformance(metricFilters),
          getMonthlyTrend(metricFilters),
        ]);
        if (active) {
          setSummaryStats(metrics);
          setDistrictPerformance(districtRows);
          setMonthlyTrend(trendRows);
        }
      } catch (e) {
      }
    };

    loadMetrics();
    return () => { active = false; };
  }, [metricFilters]);

  const loadInstitutionalData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let filters: any = {};
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }

      const [subs, b, d] = await Promise.all([
        getSubmissions(filters), 
        getBranches(),
        getDistricts()
      ]);
      setSubmissions(subs.submissions || []);
      setBranches(b || []);
      setDistricts(d || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Archive Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const branchOptions = useMemo(() => {
    const allBranches = branches || [];
    let availableBranches = allBranches;

    // Filter based on user's jurisdiction if not super admin
    if (!isSuperAdmin && user) {
      const userAssignedBranches = normalizeAssignedBranches(user.assignedBranches || []).map((b) => b.toLowerCase());
      const userBranchName = user.branchName?.toLowerCase();
      const userDistrictName = user.districtName?.toLowerCase();

      availableBranches = allBranches.filter((branch: any) => {
        const branchName = (branch.name || '').toLowerCase();
        const districtName = (branch.district?.name || '').toLowerCase();

        // If user has assigned branches, only include those
        if (userAssignedBranches.length > 0) {
          return userAssignedBranches.includes(branchName);
        }

        // Otherwise, include user's own branch
        if (userBranchName) {
          return branchName === userBranchName;
        }

        // District-level users (e.g. District Director) can filter across every
        // branch of their district.
        if (userDistrictName) {
          return districtName === userDistrictName;
        }

        // Management/head-office users with no branch or district binding can
        // filter across the whole network — the SERVER still scopes the data to
        // their jurisdiction, so an out-of-scope pick simply returns nothing.
        // Returning false here left these users with empty, unusable dropdowns.
        return true;
      });

      // Never present an empty, unusable filter: if jurisdiction narrowing
      // matched nothing (e.g. assigned-branch names drifted from the canonical
      // branch registry), fall back to the full list — the server still scopes
      // every query, so this can never leak out-of-jurisdiction data.
      if (availableBranches.length === 0) {
        availableBranches = allBranches;
      }
    }

    // Then filter by selected district
    availableBranches = availableBranches.filter((branch: any) => 
      selectedDistrict === "all" || branch?.district?.name === selectedDistrict
    );

    return availableBranches
      .map((branch: any) => branch.name)
      .sort((a: string, b: string) => a.localeCompare(b));
  }, [branches, selectedDistrict, isSuperAdmin, user]);

  const districtOptions = useMemo(() => {
    const allDistricts = districts || [];
    let availableDistricts = allDistricts;

    // Filter based on user's jurisdiction if not super admin
    if (!isSuperAdmin && user) {
      const userAssignedBranches = normalizeAssignedBranches(user.assignedBranches || []).map((b) => b.toLowerCase());
      const userDistrictName = user.districtName?.toLowerCase();
      const userBranchName = user.branchName?.toLowerCase();

      if (userAssignedBranches.length > 0) {
        // If user has assigned branches, get all districts those branches belong to
        availableDistricts = allDistricts.filter((district: any) => {
          return branches.some((branch: any) =>
            (branch.district?.name || '').toLowerCase() === (district.name || '').toLowerCase() &&
            userAssignedBranches.includes((branch.name || '').toLowerCase())
          );
        });
      } else if (userDistrictName) {
        // Otherwise, only include user's own district
        availableDistricts = allDistricts.filter((district: any) => (district.name || '').toLowerCase() === userDistrictName);
      } else if (userBranchName) {
        // If no district, get the district from user's branch
        const userBranch = branches.find((b: any) => (b.name || '').toLowerCase() === userBranchName);
        if (userBranch?.district?.name) {
          availableDistricts = allDistricts.filter((district: any) => district.name === userBranch.district.name);
        }
      }
      // Users with no branch/district binding (head-office management roles)
      // keep the full district list — the server still scopes the data itself.
      // Emptying the list here made the filter unusable for them.

      // Never present an empty, unusable filter: if jurisdiction narrowing
      // matched nothing, fall back to the full list — the server still scopes
      // every query, so this can never leak out-of-jurisdiction data.
      if (availableDistricts.length === 0) {
        availableDistricts = allDistricts;
      }
    }

    return availableDistricts
      .map((district: any) => district.name)
      .sort((a: string, b: string) => a.localeCompare(b));
  }, [districts, branches, isSuperAdmin, user]);

  const filteredDistrictOptions = useMemo(() => {
    const query = districtSearch.trim().toLowerCase();
    if (!query) return districtOptions;
    return districtOptions.filter((name) => name.toLowerCase().includes(query));
  }, [districtOptions, districtSearch]);

  const filteredBranchOptions = useMemo(() => {
    const query = branchSearch.trim().toLowerCase();
    if (!query) return branchOptions;
    return branchOptions.filter((name) => name.toLowerCase().includes(query));
  }, [branchOptions, branchSearch]);

  const riskOptions = useMemo(
    () => [
      { value: "LOW", label: "Standard / Low" },
      { value: "HIGH", label: "High Risk" },
    ],
    []
  );

  const filteredRiskOptions = useMemo(() => {
    const query = riskSearch.trim().toLowerCase();
    if (!query) return riskOptions;
    return riskOptions.filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query));
  }, [riskOptions, riskSearch]);

  const statusOptions = useMemo(
    () => Object.values(KYC_STATUS).map((status) => ({ value: status, label: status.replace(/_/g, " ") })),
    []
  );

  const filteredStatusOptions = useMemo(() => {
    const query = statusSearch.trim().toLowerCase();
    if (!query) return statusOptions;
    return statusOptions.filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query));
  }, [statusOptions, statusSearch]);

  useEffect(() => {
    if (selectedBranch === "all") return;
    if (!branchOptions.includes(selectedBranch)) {
      setSelectedBranch("all");
    }
  }, [branchOptions, selectedBranch]);

  useEffect(() => {
    if (selectedDistrict === "all") return;
    if (!districtOptions.includes(selectedDistrict)) {
      setSelectedDistrict("all");
    }
  }, [districtOptions, selectedDistrict]);

  const filteredData = useMemo(() => {
    return submissions.filter(sub => {
      const matchesDistrict = selectedDistrict === 'all' || sub.branch?.district?.name === selectedDistrict;
      const branchName = sub.branch?.name || sub.branchName;
      // When both district and branch are selected, require the submission to match both.
      const matchesBranch = (() => {
        if (selectedBranch === 'all') return true;
        if (selectedDistrict === 'all') return branchName === selectedBranch;
        // both selected -> ensure branch name matches and branch district matches
        const branchDistrict = sub.branch?.district?.name || sub.branch?.districtName || sub.districtName;
        return branchName === selectedBranch && branchDistrict === selectedDistrict;
      })();
      const matchesStatus = selectedStatus === 'all' || sub.status === selectedStatus;
      const matchesType = selectedType === 'all' || sub.entityType === selectedType;
      const matchesSearch = sub.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || sub.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const riskLevel = sub.isExceptional ? 'HIGH' : 'LOW';
      const matchesRisk = selectedRisk === 'all' || riskLevel === selectedRisk;

      return matchesDistrict && matchesBranch && matchesStatus && matchesType && matchesSearch && matchesRisk;
    });
  }, [submissions, selectedDistrict, selectedBranch, selectedStatus, selectedType, searchTerm, selectedRisk]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const approved = filteredData.filter(s => s.status === KYC_STATUS.APPROVED).length;
    // Precise separation of Analysis (Unseen) and Running (In Review). Both
    // exclude resubmitted cases — a case returned for amendment and resubmitted
    // is a distinct workflow from a fresh, never-seen case.
    const unseen = filteredData.filter(s => s.status === KYC_STATUS.SUBMITTED && !s.isResubmitted).length;
    const running = filteredData.filter(s => s.status === KYC_STATUS.IN_REVIEW && !s.isResubmitted).length;
    const rejected = filteredData.filter(s => s.status === KYC_STATUS.REJECTED).length;
    const returned = filteredData.filter(s => s.status === KYC_STATUS.ACTION_REQUIRED).length;
    const resubmitted = filteredData.filter(s => s.isResubmitted).length;
    
    const branchBreakdown: Record<string, number> = {};
    filteredData.forEach(s => {
      branchBreakdown[s.branchName] = (branchBreakdown[s.branchName] || 0) + 1;
    });

    return { total, approved, unseen, running, rejected, returned, resubmitted, branchBreakdown };
  }, [filteredData]);

  const chartsData = useMemo(() => {
    // Prefer the SQL-counted metrics (accurate over the whole dataset); the
    // client-derived `stats`/`filteredData` come from a fetch capped at 5000
    // rows and only serve as a fallback while the metrics are still loading.
    const source = summaryStats
      ? {
          approved: summaryStats.authorized,
          unseen: summaryStats.unseen,
          running: summaryStats.running,
          returned: summaryStats.needAmendment,
          resubmitted: summaryStats.resubmitted,
        }
      : stats;

    const statusPie = [
      { name: 'Authorized', value: source.approved },
      { name: 'Analysis', value: source.unseen },
      { name: 'Running', value: source.running },
      { name: 'Gaps', value: source.returned },
      { name: 'Resubmitted', value: source.resubmitted }
    ].filter(d => d.value > 0);

    const standardCount = selectedRisk === 'HIGH'
      ? 0
      : (summaryStats ? summaryStats.total : filteredData.filter(s => !s.isExceptional).length);
    const highRiskCount = selectedRisk === 'LOW'
      ? 0
      : (summaryStats ? summaryStats.exceptional : filteredData.filter(s => s.isExceptional).length);
    const riskBar = [
      { name: 'Standard', count: standardCount },
      { name: 'High Risk', count: highRiskCount }
    ];

    return { statusPie, riskBar };
  }, [filteredData, stats, summaryStats, selectedRisk]);

  const handleExportExcel = async () => {
    if (!user) return;
    setIsExporting(true);
    toast({ title: "Compiling Spreadsheet", description: "Gathering every filtered record for export..." });
    try {
      // Pull the complete filtered dataset straight from the server instead of
      // the in-memory `filteredData` — that list is sourced from a submissions
      // fetch capped at 5000 rows, so exports on a district/status with more
      // matches than that silently dropped the rest.
      const result = await getSubmissions({
        ...metricFilters,
        status: metricFilters.status ? [metricFilters.status] : undefined,
        limit: 100000,
      });
      let exportRows = result.submissions || [];
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        exportRows = exportRows.filter((sub: any) =>
          sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term)
        );
      }

      if (exportRows.length === 0) {
        toast({ variant: "destructive", title: "Nothing to export", description: "No records match the current filters." });
        return;
      }

      const headers = ['Case ID', 'Customer Name', 'Status', 'Is Resubmitted', 'Branch', 'District', 'Risk Level', 'Account Type', 'Submitted At'];
      const rows = exportRows.map((sub: any) => [
        sub.id,
        sub.customerName,
        sub.status,
        sub.isResubmitted ? 'Yes' : 'No',
        sub.branchName,
        sub.branch?.district?.name || sub.districtName || 'N/A',
        sub.isExceptional ? 'High' : 'Standard',
        sub.entityType || 'Individual',
        sub.submittedAt ? format(new Date(sub.submittedAt), 'yyyy-MM-dd h:mm:ss a') : 'N/A'
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NIB_KYC_REPORT_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: `${exportRows.length} record(s) exported.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Export Failed", description: "Could not compile the export file." });
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Intelligence Deck...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
            <FileBarChart className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Management Reporting</h1>
            <p className="text-muted-foreground text-lg font-medium">Institutional performance analytics and risk oversight console.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <Button className="h-12 px-8 gap-3 bg-primary text-white font-black shadow-xl rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98]" onClick={handleExportExcel} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />} Export Data (CSV)
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <CardHeader className="bg-slate-50/50 border-b py-4">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Intelligence Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Regional District</Label>
            <Popover
              open={districtFilterOpen}
              onOpenChange={(open) => {
                setDistrictFilterOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 w-full justify-between rounded-xl border-slate-200 text-xs font-bold"
                >
                  <span className="truncate">{selectedDistrict === "all" ? "Overall Network" : selectedDistrict}</span>
                  <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <Input
                    placeholder="Search district..."
                    className="pl-3 h-10 rounded-lg text-sm border-slate-200"
                    value={districtSearch}
                    onChange={(e) => setDistrictSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                        selectedDistrict === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                      )}
                      onClick={() => {
                        setSelectedDistrict("all");
                        setSelectedBranch("all");
                        setDistrictFilterOpen(false);
                      }}
                    >
                      <span>Overall Network</span>
                      {selectedDistrict === "all" && <Check className="h-4 w-4" />}
                    </div>
                    {filteredDistrictOptions.map((name) => (
                      <div
                        key={name}
                        className={cn(
                          "mt-1 flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                          selectedDistrict === name ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                        )}
                        onClick={() => {
                          setSelectedDistrict(name);
                          setSelectedBranch("all");
                          setDistrictFilterOpen(false);
                        }}
                      >
                        <span className="truncate">{name}</span>
                        {selectedDistrict === name && <Check className="h-4 w-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Branch</Label>
            <Popover open={branchFilterOpen} onOpenChange={setBranchFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 w-full justify-between rounded-xl border-slate-200 text-xs font-bold">
                  <span className="truncate">{selectedBranch === "all" ? "All Branches" : selectedBranch}</span>
                  <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <Input
                    placeholder="Search branch..."
                    className="pl-3 h-10 rounded-lg text-sm border-slate-200"
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                        selectedBranch === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                      )}
                      onClick={() => {
                        setSelectedBranch("all");
                        setBranchFilterOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2"><Building2 className="w-4 h-4" /> All Branches</div>
                      {selectedBranch === "all" && <Check className="h-4 w-4" />}
                    </div>
                    {filteredBranchOptions.map((name) => (
                      <div
                        key={name}
                        className={cn(
                          "mt-1 flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                          selectedBranch === name ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                        )}
                        onClick={() => {
                          setSelectedBranch(name);
                          setBranchFilterOpen(false);
                        }}
                      >
                        <span className="truncate">{name}</span>
                        {selectedBranch === name && <Check className="h-4 w-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Risk Level</Label>
            <Popover open={riskFilterOpen} onOpenChange={setRiskFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 w-full justify-between rounded-xl border-slate-200 text-xs font-bold">
                  <span className="truncate">
                    {selectedRisk === "all" ? "All Profiles" : riskOptions.find((option) => option.value === selectedRisk)?.label || selectedRisk}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <Input
                    placeholder="Search risk level..."
                    className="pl-3 h-10 rounded-lg text-sm border-slate-200"
                    value={riskSearch}
                    onChange={(e) => setRiskSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                        selectedRisk === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                      )}
                      onClick={() => {
                        setSelectedRisk("all");
                        setRiskFilterOpen(false);
                      }}
                    >
                      <span>All Profiles</span>
                      {selectedRisk === "all" && <Check className="h-4 w-4" />}
                    </div>
                    {filteredRiskOptions.map((option) => (
                      <div
                        key={option.value}
                        className={cn(
                          "mt-1 flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                          selectedRisk === option.value ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                        )}
                        onClick={() => {
                          setSelectedRisk(option.value);
                          setRiskFilterOpen(false);
                        }}
                      >
                        <span className="truncate">{option.label}</span>
                        {selectedRisk === option.value && <Check className="h-4 w-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Workflow Status</Label>
            <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 w-full justify-between rounded-xl border-slate-200 text-xs font-bold">
                  <span className="truncate">{selectedStatus === "all" ? "All Stages" : selectedStatus.replace(/_/g, " ")}</span>
                  <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                <div className="p-3 border-b bg-slate-50/50">
                  <Input
                    placeholder="Search status..."
                    className="pl-3 h-10 rounded-lg text-sm border-slate-200"
                    value={statusSearch}
                    onChange={(e) => setStatusSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1">
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                        selectedStatus === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                      )}
                      onClick={() => {
                        setSelectedStatus("all");
                        setStatusFilterOpen(false);
                      }}
                    >
                      <span>All Stages</span>
                      {selectedStatus === "all" && <Check className="h-4 w-4" />}
                    </div>
                    {filteredStatusOptions.map((option) => (
                      <div
                        key={option.value}
                        className={cn(
                          "mt-1 flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-sm font-bold",
                          selectedStatus === option.value ? "bg-primary/10 text-primary" : "hover:bg-slate-50"
                        )}
                        onClick={() => {
                          setSelectedStatus(option.value);
                          setStatusFilterOpen(false);
                        }}
                      >
                        <span className="truncate">{option.label}</span>
                        {selectedStatus === option.value && <Check className="h-4 w-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedStatus("all");
                setSelectedRisk("all");
                setSelectedDistrict("all");
                setSelectedBranch("all");
                setDistrictSearch("");
                setBranchSearch("");
                setRiskSearch("");
                setStatusSearch("");
                setDistrictFilterOpen(false);
                setBranchFilterOpen(false);
                setRiskFilterOpen(false);
                setStatusFilterOpen(false);
                setDateRange(undefined);
              }}
              className="w-full h-10 gap-2 font-bold text-slate-400 hover:text-primary"
            >
              <RotateCcw className="w-4 h-4" /> Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        {[
          { label: 'Total Cases', value: summaryStats?.total ?? stats.total, icon: Inbox, color: 'text-slate-900', bg: 'bg-white', status: undefined as string | undefined },
          { label: 'Unseen Analysis', value: summaryStats?.unseen ?? stats.unseen, icon: Clock, color: 'text-primary', bg: 'bg-white', status: KYC_STATUS.SUBMITTED },
          { label: 'Running (In Review)', value: summaryStats?.running ?? stats.running, icon: Activity, color: 'text-blue-500', bg: 'bg-white', status: KYC_STATUS.IN_REVIEW },
          { label: 'Authorized Recently', value: summaryStats?.authorized ?? stats.approved, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-white', status: KYC_STATUS.APPROVED },
          { label: 'Need Amendment', value: summaryStats?.needAmendment ?? stats.returned, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-white', status: KYC_STATUS.ACTION_REQUIRED },
          { label: 'Resubmitted', value: summaryStats?.resubmitted ?? stats.resubmitted, icon: RotateCcw, color: 'text-purple-600', bg: 'bg-white', status: undefined as string | undefined },
        ].map((item, i) => (
          <Card
            key={i}
            onClick={() => {
              // FILTER SYNCHRONIZATION: drill into the Case Archive carrying the
              // card's status plus the dashboard's active district/branch/date filters.
              const params = new URLSearchParams();
              if (item.status) params.set('status', item.status);
              if (selectedDistrict !== 'all') params.set('district', selectedDistrict);
              if (selectedBranch !== 'all') params.set('branch', selectedBranch);
              if (dateRange?.from) params.set('from', dateRange.from.toISOString());
              if (dateRange?.to) params.set('to', dateRange.to.toISOString());
              const qs = params.toString();
              router.push(qs ? `/submissions?${qs}` : '/submissions');
            }}
            className={cn("shadow-lg border-slate-200 overflow-hidden group hover:scale-[1.02] hover:border-primary/40 transition-all rounded-2xl cursor-pointer", item.bg)}
          >
            <CardHeader className="p-4 pb-2 border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{item.label}</span>
                <item.icon className={cn("w-4 h-4", item.color)} />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className={cn("text-4xl font-black tracking-tighter", item.color)}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <History className="w-5 h-5 text-white" /> Workflow Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            {chartsData.statusPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartsData.statusPie} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                    {chartsData.statusPie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No data available for chart.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-white" /> Risk Level Aggregation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            {chartsData.riskBar.some(r => r.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartsData.riskBar}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(184, 147, 52, 0.05)' }} />
                  <Bar dataKey="count" fill="#B89334" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No risk data available.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-white" /> Institutional KYC Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            {monthlyTrend.some(m => m.volume > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="volume" stroke="#B89334" strokeWidth={3} dot={{ r: 4, fill: '#B89334' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No trend data available.</div>
            )}
          </CardContent>
        </Card>

        {/* District Level Performance Comparison Chart */}
        <Card className="lg:col-span-3 shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Building2 className="w-5 h-5 text-white" /> District Level Performance Comparison
            </CardTitle>
            <CardDescription className="text-slate-200">Compare authorized, pending, and returned cases across districts sorted by efficiency.</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 h-[400px]">
            {districtPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={districtPerformance}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fontWeight: 'bold' }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fontWeight: 'bold' }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip cursor={{ fill: 'rgba(184, 147, 52, 0.05)' }} />
                  <Legend verticalAlign="top" align="center" iconType="circle" />
                  <Bar dataKey="authorized" fill="#10B981" radius={[4, 4, 0, 0]} name="Authorized" />
                  <Bar dataKey="pending" fill="#3F51B5" radius={[4, 4, 0, 0]} name="Pending" />
                  <Bar dataKey="returned" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Returned" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No district performance data available for selected filters.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
