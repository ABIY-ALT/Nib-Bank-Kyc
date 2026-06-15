
"use client"

import { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from "@/components/ui/card"
import { 
  BarChart3, 
  FileDown,
  Check,
  ChevronsUpDown,
  Globe,
  Loader2,
  Inbox,
  Building2,
  TrendingUp,
  LayoutGrid,
  MapPin,
  ShieldCheck,
  Zap,
  Search,
  Target,
  ArrowUpRight,
  ShieldAlert,
  Clock,
  CheckCircle2,
  RotateCcw
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getSubmissions, getCaseMetrics } from "@/actions/submissions"
import { getDistricts } from "@/actions/hierarchy"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import { calculatePerformanceIndex, getPerformanceLabel } from "@/lib/performance";
import { differenceInMinutes } from "date-fns";

export default function DistrictPerformancePage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("all");
  const [branchFilterSearch, setBranchFilterSearch] = useState("");
  const [branchFilterOpen, setBranchFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const isAdmin = isSuperAdmin;
  const isDistDir = hasPermission('DASHBOARD_VIEW_DISTRICT');
  
  const activeDistrict = isDistDir && !isAdmin ? user?.districtName : (selectedDistrict === 'all' ? null : selectedDistrict);

  useEffect(() => {
    async function loadInitial() {
      if (isDistDir && user?.districtName && !isAdmin) {
        setSelectedDistrict(user.districtName);
      }
      await loadData();
    }
    loadInitial();
  }, [user, isAdmin, isDistDir, selectedDistrict, dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      let filters: any = {
        district: activeDistrict || undefined,
        limit: 1000
      };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const [subs, dists, metrics] = await Promise.all([
        getSubmissions(filters),
        isAdmin ? getDistricts() : Promise.resolve([]),
        getCaseMetrics(filters)
      ]);
      setSubmissions(subs || []);
      setDistricts(dists || []);
      setSummaryStats(metrics);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const stats = {
      total: 0,
      authorized: submissions.filter(s => s.status === KYC_STATUS.APPROVED).length,
      amended: submissions.filter(s => s.status === KYC_STATUS.ACTION_REQUIRED).length,
      unseen: submissions.filter(s => s.status === KYC_STATUS.SUBMITTED).length,
      resubmitted: submissions.filter(s => s.isResubmitted).length,
      byBranch: {} as Record<string, any>
    };

    // REFINED: Total only considers Authorized, Amended, and Unseen
    stats.total = stats.authorized + stats.amended + stats.unseen;

    submissions.forEach(sub => {
      const bName = sub.branchName || 'Unmapped Branch';
      if (!stats.byBranch[bName]) {
        stats.byBranch[bName] = { total: 0, unseen: 0, authorized: 0, amended: 0, resubmitted: 0 };
      }

      if (sub.status === KYC_STATUS.APPROVED) {
        stats.byBranch[bName].authorized++;
        stats.byBranch[bName].total++;
      }

      if (sub.status === KYC_STATUS.ACTION_REQUIRED) {
        stats.byBranch[bName].amended++;
        stats.byBranch[bName].total++;
      }

      if (sub.status === KYC_STATUS.SUBMITTED) {
        stats.byBranch[bName].unseen++;
        stats.byBranch[bName].total++;
      }

      if (sub.isResubmitted) {
        stats.byBranch[bName].resubmitted++;
      }
    });

    return stats;
  }, [submissions]);

  const branchCount = Object.keys(analytics.byBranch).length;
  const branchOptions = useMemo(() => {
    return Object.keys(analytics.byBranch).sort((a, b) => a.localeCompare(b));
  }, [analytics.byBranch]);

  const filteredBranchOptions = useMemo(() => {
    const query = branchFilterSearch.trim().toLowerCase();
    if (!query) return branchOptions;
    return branchOptions.filter((name) => name.toLowerCase().includes(query));
  }, [branchOptions, branchFilterSearch]);

  useEffect(() => {
    if (selectedBranchFilter === "all") return;
    if (!branchOptions.includes(selectedBranchFilter)) {
      setSelectedBranchFilter("all");
    }
  }, [branchOptions, selectedBranchFilter]);

  const branchRows = useMemo(() => {
    const entries = Object.entries(analytics.byBranch);
    return entries.filter(([name]) => selectedBranchFilter === "all" || name === selectedBranchFilter);
  }, [analytics.byBranch, selectedBranchFilter]);

  if (loading || permissionsLoading) return <div className="py-40 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl"><BarChart3 className="w-8 h-8" /></div>
          <div><h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">{activeDistrict ? `${activeDistrict} District` : 'District Monitoring'}</h1><div className="flex items-center gap-2 mt-1"><p className="text-muted-foreground text-lg font-medium">Regional monitoring console.</p><Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black px-3 py-1">{branchCount} Branches</Badge></div></div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <Popover open={branchFilterOpen} onOpenChange={setBranchFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-12 max-w-[280px] justify-between gap-2 border-slate-200 bg-white px-4 font-bold shadow-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="truncate">{selectedBranchFilter === "all" ? "All Branches" : selectedBranchFilter}</span>
                </div>
                <ChevronsUpDown className="h-4 w-4 text-slate-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-xl border border-slate-200 p-0 shadow-2xl">
              <div className="relative border-b border-slate-100 p-3">
                <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search branch..."
                  value={branchFilterSearch}
                  onChange={(e) => setBranchFilterSearch(e.target.value)}
                  className="h-10 rounded-lg border-slate-200 pl-9 text-sm"
                />
              </div>
              <ScrollArea className="max-h-64 p-2">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                    selectedBranchFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                  )}
                  onClick={() => {
                    setSelectedBranchFilter("all");
                    setBranchFilterOpen(false);
                  }}
                >
                  <span>All Branches</span>
                  {selectedBranchFilter === "all" && <Check className="h-4 w-4" />}
                </button>
                {filteredBranchOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={cn(
                      "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                      selectedBranchFilter === name ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                    )}
                    onClick={() => {
                      setSelectedBranchFilter(name);
                      setBranchFilterOpen(false);
                    }}
                  >
                    <span className="truncate">{name}</span>
                    {selectedBranchFilter === name && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          {isAdmin && (
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2 font-bold h-12 px-6 border-slate-200 shadow-sm bg-white rounded-xl"><Globe className="w-4 h-4 text-primary" /> {selectedDistrict === 'all' ? 'All Regions' : selectedDistrict}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-xl shadow-2xl"><DropdownMenuItem onClick={() => setSelectedDistrict('all')} className="font-bold">All Regions</DropdownMenuItem>{districts.map(d => <DropdownMenuItem key={d.id} onClick={() => setSelectedDistrict(d.name)} className="font-medium">{d.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          )}
          <Button className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl" onClick={() => toast({ title: "Export Started" })}><FileDown className="w-5 h-5" /> Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50">Volume</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-slate-900 tracking-tighter">{summaryStats?.total ?? analytics.total}</span><div className="p-2 bg-slate-50 rounded-lg"><TrendingUp className="w-4 h-4 text-slate-400" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600 bg-slate-50/50">Authorized</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-emerald-600 tracking-tighter">{summaryStats?.authorized ?? analytics.authorized}</span><div className="p-2 bg-emerald-50 rounded-lg"><ShieldCheck className="w-4 h-4 text-emerald-600" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600 bg-slate-50/50">Amended</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-orange-600 tracking-tighter">{summaryStats?.needAmendment ?? analytics.amended}</span><div className="p-2 bg-orange-50 rounded-lg"><ShieldAlert className="w-4 h-4 text-orange-600" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-primary bg-slate-50/50">Unseen</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-primary tracking-tighter">{summaryStats?.unseen ?? analytics.unseen}</span><div className="p-2 bg-primary/5 rounded-lg"><Zap className="w-4 h-4 text-primary" /></div></CardContent></Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-2xl border-slate-200 overflow-hidden bg-white rounded-3xl"><CardHeader className="bg-slate-50/50 border-b p-6"><div><CardTitle className="text-xl flex items-center gap-3 font-headline text-slate-900"><LayoutGrid className="w-5 h-5 text-primary" /> Branch Matrix</CardTitle></div></CardHeader><CardContent className="p-0"><Table><TableHeader className="bg-slate-50/80"><TableRow><TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Branch</TableHead><TableHead className="font-black text-center text-[11px] uppercase text-slate-500">Volume</TableHead><TableHead className="font-black text-center text-emerald-600 text-[11px] uppercase">Authorized</TableHead><TableHead className="font-black text-right pr-8 text-[11px] uppercase w-[180px] text-slate-500">Performance Index</TableHead></TableRow></TableHeader><TableBody>{branchRows.map(([name, data]) => { 
          const efficiency = calculatePerformanceIndex({
            total: data.total,
            unseen: data.unseen || 0,
            amended: data.amended || 0,
            authorized: data.authorized || 0,
            recycles: data.resubmitted || 0,
          });
          return (
            <TableRow key={name} className="hover:bg-slate-50 transition-colors group">
              <TableCell className="font-bold py-6 pl-8 text-slate-900 flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-all"><Building2 className="w-5 h-5" /></div>
                {name}
              </TableCell>
              <TableCell className="text-center font-black text-lg text-slate-700">{data.total}</TableCell>
              <TableCell className="text-center"><Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-black px-4 py-1">{data.authorized}</Badge></TableCell>
              <TableCell className="text-right pr-8">
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", getPerformanceLabel(efficiency).color)}>
                      {getPerformanceLabel(efficiency).label}
                    </span>
                    <span className={cn("font-black text-base", getPerformanceLabel(efficiency).color)}>{efficiency}%</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-300" />
                  </div>
                  <Progress 
                    value={efficiency} 
                    className={cn(
                      "h-1.5 w-24 bg-slate-100", 
                      efficiency >= 90 ? "[&>div]:bg-emerald-500" : 
                      efficiency >= 75 ? "[&>div]:bg-blue-600" : 
                      efficiency >= 50 ? "[&>div]:bg-slate-600" : 
                      efficiency >= 25 ? "[&>div]:bg-orange-500" : 
                      "[&>div]:bg-red-500"
                    )} 
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}</TableBody></Table></CardContent></Card>
        <div className="space-y-8"><Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white"><CardHeader className="bg-primary p-6 border-b text-white"><CardTitle className="text-white text-lg font-black uppercase tracking-widest flex items-center gap-2"><Target className="w-5 h-5 text-white" /> Regional Pulse</CardTitle></CardHeader><CardContent className="p-6 space-y-6"><div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4"><div className="space-y-2"><div className="flex justify-between text-xs font-bold text-slate-700"><span>Performance Index</span><span>{(() => {
          return calculatePerformanceIndex({
            total: analytics.total,
            unseen: analytics.unseen || 0,
            amended: analytics.amended || 0,
            authorized: analytics.authorized || 0,
            recycles: analytics.resubmitted || 0,
          });
        })()}%</span></div><Progress value={(() => {
          return calculatePerformanceIndex({
            total: analytics.total,
            unseen: analytics.unseen || 0,
            amended: analytics.amended || 0,
            authorized: analytics.authorized || 0,
            recycles: analytics.resubmitted || 0,
          });
        })()} className="h-2 bg-white" /></div></div></CardContent></Card></div>
      </div>
    </div>
  )
}
