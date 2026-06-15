
"use client"

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Check,
  ChevronsUpDown,
  Filter, 
  FileDown, 
  Loader2,
  ShieldCheck,
  TrendingUp,
  Inbox,
  Activity,
  ArrowUpRight,
  ShieldAlert,
  RotateCcw,
  Building2,
  Users,
  Search
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast"
import { getSubmissions } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { usePermissions } from "@/hooks/use-permissions";
import { calculatePerformanceIndex, getPerformanceLabel } from "@/lib/performance";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import { differenceInMinutes } from "date-fns";

export default function BranchPerformancePage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [staffOpen, setStaffOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const isDistDir = hasPermission('DASHBOARD_VIEW_DISTRICT');
  const isAdmin = isSuperAdmin;

  useEffect(() => {
    loadData();
  }, [isAdmin, isDistDir, user, dateRange]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    let filters: any = {
      district: isDistDir && !isAdmin ? user.districtName || undefined : undefined,
      limit: 1000
    };
    if (dateRange?.from) {
      filters.startDate = dateRange.from.toISOString();
      if (dateRange.to) filters.endDate = dateRange.to.toISOString();
    }
    const data = await getSubmissions(filters);
    setSubmissions(data || []);
    setLoading(false);
  };

  const staffOptions = useMemo(() => {
    const staffMap = new Map<string, string>();

    submissions.forEach((sub) => {
      const createdId = sub.createdById || sub.createdBy?.id;
      const createdName = sub.createdBy
        ? [sub.createdBy.firstName, sub.createdBy.lastName].filter(Boolean).join(" ").trim()
        : "";

      const assignedId = sub.assignedToId || sub.assignedTo?.id;
      const assignedName = sub.assignedTo
        ? [sub.assignedTo.firstName, sub.assignedTo.lastName].filter(Boolean).join(" ").trim()
        : "";

      const staffId = createdId || assignedId;
      const staffName = createdName || assignedName || sub.createdByName || sub.assignedToName || "Unknown Staff";
      if (staffId) {
        staffMap.set(String(staffId), staffName);
      }
    });

    return Array.from(staffMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions]);

  const filteredStaffOptions = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return staffOptions;
    return staffOptions.filter((staff) => staff.name.toLowerCase().includes(query));
  }, [staffOptions, staffSearch]);

  useEffect(() => {
    if (selectedStaffFilter === "all") return;
    if (!staffOptions.some((staff) => staff.id === selectedStaffFilter)) {
      setSelectedStaffFilter("all");
    }
  }, [staffOptions, selectedStaffFilter]);

  const scopedSubmissions = useMemo(() => {
    if (selectedStaffFilter === "all") return submissions;
    return submissions.filter((sub) => {
      const staffId = sub.createdById || sub.createdBy?.id || sub.assignedToId || sub.assignedTo?.id;
      return String(staffId || "") === selectedStaffFilter;
    });
  }, [submissions, selectedStaffFilter]);

  const branchList = useMemo(() => {
    return Array.from(new Set(scopedSubmissions.map(s => s.branchName))).sort() as string[];
  }, [scopedSubmissions]);

  useEffect(() => {
    setSelectedBranches((prev) => prev.filter((branchName) => branchList.includes(branchName)));
  }, [branchList]);

  const branchMetrics = useMemo(() => {
    const stats: Record<string, any> = {};
    scopedSubmissions.forEach(sub => {
      const bName = sub.branchName || 'Unknown';
      if (!stats[bName]) {
        stats[bName] = {
          name: bName,
          district: sub.districtName,
          volume: 0,
          unseen: 0,
          authorized: 0,
          amended: 0,
          resubmitted: 0
        };
      }
      
      if (sub.status === KYC_STATUS.APPROVED) {
        stats[bName].authorized++;
        stats[bName].volume++;
      }
      
      if (sub.status === KYC_STATUS.ACTION_REQUIRED) {
        stats[bName].amended++;
        stats[bName].volume++;
      }

      if (sub.status === KYC_STATUS.SUBMITTED) {
        stats[bName].unseen++;
        stats[bName].volume++;
      }

      if (sub.isResubmitted) {
        stats[bName].resubmitted++;
      }
    });

    return Object.values(stats)
      .map(b => {
        const accuracy = calculatePerformanceIndex({
          total: b.volume,
          unseen: b.unseen || 0,
          amended: b.amended || 0,
          authorized: b.authorized || 0,
          recycles: b.resubmitted || 0
        });
        return { ...b, accuracy };
      })
      .filter(b => selectedBranches.length === 0 || selectedBranches.includes(b.name))
      .sort((a, b) => b.volume - a.volume);
  }, [scopedSubmissions, selectedBranches]);

  const filteredBranchMetrics = useMemo(() => {
    const query = branchSearch.trim().toLowerCase();
    if (!query) return branchMetrics;
    return branchMetrics.filter((branch) => {
      return (
        branch.name.toLowerCase().includes(query) ||
        (branch.district?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [branchMetrics, branchSearch]);

  const aggregateStats = useMemo(() => {
    const total = branchMetrics.reduce((acc, b) => acc + b.volume, 0);
    const unseen = branchMetrics.reduce((acc, b) => acc + (b.unseen || 0), 0);
    const authorized = branchMetrics.reduce((acc, b) => acc + (b.authorized || 0), 0);
    const amended = branchMetrics.reduce((acc, b) => acc + (b.amended || 0), 0);
    const resubmitted = branchMetrics.reduce((acc, b) => acc + (b.resubmitted || 0), 0);

    const accuracy = calculatePerformanceIndex({
      total,
      unseen,
      amended,
      authorized,
      recycles: resubmitted
    });

    return { total, authorized, amended, accuracy };
  }, [branchMetrics]);

  if (loading || permissionsLoading) return <div className="py-40 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1"><div className="p-2 bg-primary text-white rounded-lg shadow-lg"><TrendingUp className="w-6 h-6" /></div><h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1></div>
          <p className="text-muted-foreground text-lg font-medium">Relational network efficiency monitoring.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <div className="relative w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search branches..."
              className="pl-11 h-12 rounded-xl border-slate-200 bg-white"
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
            />
          </div>
          <Popover open={staffOpen} onOpenChange={setStaffOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-12 max-w-[280px] justify-between gap-2 border-slate-200 bg-white px-4 font-bold shadow-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="truncate">
                    {selectedStaffFilter === "all"
                      ? "All Staff"
                      : (staffOptions.find((staff) => staff.id === selectedStaffFilter)?.name || "All Staff")}
                  </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 text-slate-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-xl border border-slate-200 p-0 shadow-2xl">
              <div className="relative border-b border-slate-100 p-3">
                <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search staff..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="h-10 rounded-lg border-slate-200 pl-9 text-sm"
                />
              </div>
              <ScrollArea className="max-h-64 p-2">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                    selectedStaffFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                  )}
                  onClick={() => {
                    setSelectedStaffFilter("all");
                    setStaffOpen(false);
                  }}
                >
                  <span>All Staff</span>
                  {selectedStaffFilter === "all" && <Check className="h-4 w-4" />}
                </button>
                {filteredStaffOptions.map((staff) => (
                  <button
                    key={staff.id}
                    type="button"
                    className={cn(
                      "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                      selectedStaffFilter === staff.id ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                    )}
                    onClick={() => {
                      setSelectedStaffFilter(staff.id);
                      setStaffOpen(false);
                    }}
                  >
                    <span className="truncate">{staff.name}</span>
                    {selectedStaffFilter === staff.id && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2 font-bold h-12 px-6 border-slate-200 bg-white rounded-xl shadow-sm"><Filter className="w-4 h-4 text-primary" /> Filter Branch</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64 rounded-xl shadow-2xl"><DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-4 py-2">Authorized Jurisdiction</DropdownMenuLabel>{branchList.map(b => (<DropdownMenuCheckboxItem key={b} checked={selectedBranches.includes(b)} onCheckedChange={() => setSelectedBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}>{b}</DropdownMenuCheckboxItem>))}</DropdownMenuContent></DropdownMenu>
          <Button className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl" onClick={() => toast({ title: "Export Started" })}><FileDown className="w-5 h-5" /> Export Data</Button>
        </div>
      </div>

      {isDistDir && !isAdmin && user?.districtName && (
        <Alert className="bg-primary/5 border-primary/20 text-primary shadow-lg rounded-2xl border-l-4 border-l-primary animate-in slide-in-from-left duration-500"><ShieldCheck className="h-5 w-5 text-primary" /><AlertDescription className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-3">Regional Command Active: <Badge className="bg-primary text-white font-black px-4">{user.districtName} District</Badge></AlertDescription></Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50">Volume</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-slate-900 tracking-tighter">{aggregateStats.total}</span><div className="p-2 bg-slate-100 rounded-lg"><Inbox className="w-4 h-4 text-slate-400" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600 bg-slate-50/50">Successfully Authorized</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-emerald-600 tracking-tighter">{aggregateStats.authorized}</span><div className="p-2 bg-emerald-50 rounded-lg"><ShieldCheck className="w-4 h-4 text-emerald-600" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600 bg-slate-50/50">Amendments</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-orange-600 tracking-tighter">{aggregateStats.amended}</span><div className="p-2 bg-orange-50 rounded-lg"><ShieldAlert className="w-4 h-4 text-orange-600" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-primary bg-slate-50/50">Efficiency Index</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-primary tracking-tighter">{aggregateStats.accuracy}%</span><div className="p-2 bg-primary/5 rounded-lg"><Activity className="w-4 h-4 text-primary" /></div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredBranchMetrics.map((branch) => {
          const efficiency = Math.round((branch.authorized / (branch.volume || 1)) * 100);
          return (
            <Card key={branch.name} className="shadow-xl border-slate-200 overflow-hidden group hover:border-primary/40 transition-all rounded-3xl bg-white"><CardHeader className="bg-slate-50/80 border-b p-6 flex flex-row items-start justify-between"><div><CardTitle className="text-xl font-black text-slate-900">{branch.name}</CardTitle><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1.5"><Building2 className="w-3 h-3" /> {branch.district} District</p></div><Badge variant="outline" className="bg-white text-primary border-primary/20 font-black h-7">{branch.volume} Cases</Badge></CardHeader><CardContent className="pt-8 px-6 space-y-8"><div className="grid grid-cols-2 gap-6"><div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Successfully Authorized</p><div className="flex items-center gap-2"><span className="text-3xl font-black text-emerald-600">{branch.authorized}</span><ShieldCheck className="w-4 h-4 text-emerald-600/30" /></div></div><div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Amendments</p><div className="flex items-center gap-2"><span className="text-3xl font-black text-orange-600">{branch.amended}</span><ShieldAlert className="w-4 h-4 text-orange-600/30" /></div></div></div>                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Performance Index</p>
                      <div className="flex items-center gap-2">
                        <p className={cn("text-lg font-black leading-none", getPerformanceLabel(branch.accuracy).color)}>
                          {getPerformanceLabel(branch.accuracy).label}
                        </p>
                        <p className="text-sm font-black text-slate-500">{branch.accuracy}%</p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-200" />
                  </div>
                  <Progress 
                    value={branch.accuracy} 
                    className={cn(
                      "h-2 bg-slate-100", 
                      branch.accuracy >= 90 ? "[&>div]:bg-emerald-500" : 
                      branch.accuracy >= 75 ? "[&>div]:bg-blue-600" : 
                      branch.accuracy >= 50 ? "[&>div]:bg-slate-600" : 
                      branch.accuracy >= 25 ? "[&>div]:bg-orange-500" : 
                      "[&>div]:bg-red-500"
                    )} 
                  />
                </div></CardContent></Card>
          );
        })}
      </div>
    </div>
  );
}
