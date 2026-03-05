
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
  CardFooter 
} from "@/components/ui/card"
import { 
  Users, 
  CheckCircle2, 
  History, 
  Filter, 
  FileDown, 
  Calendar as CalendarIcon, 
  TrendingUp,
  Clock,
  Loader2,
  ShieldCheck,
  UserCheck,
  Search,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Inbox,
  ArrowUpRight,
  RotateCcw,
  Target,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  FileText,
  Play,
  Goal,
  Activity,
  BarChart3,
  ExternalLink,
  Building2,
  Trophy,
  User,
  LayoutDashboard
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast"
import { subDays, format, differenceInHours, addHours, isAfter, startOfDay } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions, updateSubmissionStatus } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KYCStatus } from "@prisma/client";
import Link from "next/link";

export default function KYCOperationsMonitoringPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"queue" | "team">("queue");
  const [isEscalating, setIsEscalating] = useState<string | null>(null);
  
  // Filtering States
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedOfficer, setSelectedOfficer] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "custom">("month");
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const roleContext = useMemo(() => {
    if (!user) return 'OFFICER';
    const roleName = user.roles?.[0]?.role?.name || '';
    if (isSuperAdmin || roleName === 'DISTRICT_DIRECTOR') return 'DIRECTOR';
    if (roleName === 'SUPERVISOR' || roleName === 'BRANCH_MANAGER') return 'SUPERVISOR';
    return 'OFFICER';
  }, [user, isSuperAdmin]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
      setLastUpdated(new Date());
    }, 30000); 
    return () => clearInterval(interval);
  }, [fromDate, toDate, roleContext, user, selectedBranch, selectedOfficer]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let filters: any = { startDate: fromDate, endDate: toDate, limit: 1000 };
      
      if (roleContext === 'OFFICER') {
        filters.assignedToId = user?.id;
      } else if (roleContext === 'SUPERVISOR' && user?.branchName) {
        filters.branch = user.branchName;
      }
      
      const [data, globalSettings] = await Promise.all([
        getSubmissions(filters),
        getGlobalSettings()
      ]);
      setSubmissions(data);
      setSettings(globalSettings);
    } catch (e) {
      toast({ variant: "destructive", title: "Audit Error" });
    } finally {
      setLoading(false);
    }
  };

  const handleRangeSelection = (range: "today" | "week" | "month") => {
    setDateRange(range);
    const now = new Date();
    let start;
    if (range === 'today') start = startOfDay(now);
    else if (range === 'week') start = subDays(now, 7);
    else start = subDays(now, 30);
    
    setFromDate(format(start, 'yyyy-MM-dd'));
    setToDate(format(now, 'yyyy-MM-dd'));
  };

  const handleManualEscalation = async (caseId: string) => {
    if (!user) return;
    setIsEscalating(caseId);
    try {
      await updateSubmissionStatus(caseId, KYCStatus.ESCALATED, user.id, "Manual supervisor escalation triggered due to SLA watchdog breach.");
      toast({ title: "Successful", description: "Case dispatched to Senior Risk Assessor." });
      await loadData();
    } catch (e) {
      toast({ variant: "destructive", title: "Escalation Failed" });
    } finally {
      setIsEscalating(null);
    }
  };

  const uniqueBranches = useMemo(() => {
    const branches = new Set<string>();
    submissions.forEach(s => {
      const name = s.branch?.name || s.branchName;
      if (name) branches.add(name);
    });
    return Array.from(branches).sort();
  }, [submissions]);

  const uniqueOfficers = useMemo(() => {
    const officers = new Map<string, string>();
    submissions.forEach(s => {
      if (s.assignedTo) {
        officers.set(s.assignedToId, `${s.assignedTo.firstName} ${s.assignedTo.lastName}`);
      }
    });
    return Array.from(officers.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions]);

  const filteredData = useMemo(() => {
    return submissions.filter(s => {
      const matchesSearch = s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch = selectedBranch === "all" || (s.branch?.name === selectedBranch || s.branchName === selectedBranch);
      const matchesOfficer = selectedOfficer === "all" || s.assignedToId === selectedOfficer;
      return matchesSearch && matchesBranch && matchesOfficer;
    });
  }, [submissions, searchTerm, selectedBranch, selectedOfficer]);

  const analytics = useMemo(() => {
    const total = filteredData.length;
    const completed = filteredData.filter(s => s.status === KYCStatus.APPROVED).length;
    
    const slaItems = filteredData.map(sub => {
      const standardDeadline = addHours(new Date(sub.submittedAt || sub.createdAt), 24);
      const now = new Date();
      const hoursSinceSubmission = differenceInHours(now, new Date(sub.submittedAt || sub.createdAt));
      
      const isBreached = isAfter(now, standardDeadline);
      const hoursLeft = differenceInHours(standardDeadline, now);
      const isAtRisk = !isBreached && hoursLeft < 4;

      const escalationThreshold = settings?.escalationHours || 72;
      const isWatchdogBreached = hoursSinceSubmission >= escalationThreshold && sub.status !== KYCStatus.APPROVED && sub.status !== KYCStatus.REJECTED && sub.status !== KYCStatus.ESCALATED;
      
      return { 
        ...sub, 
        deadline: standardDeadline, 
        hoursLeft, 
        isWatchdogBreached,
        slaStatus: isBreached ? 'BREACHED' : (isAtRisk ? 'AT_RISK' : 'ON_TRACK') 
      };
    });

    const slaHealth = total > 0 ? Math.round((slaItems.filter(s => s.slaStatus !== 'BREACHED').length / total) * 100) : 100;
    const dailyTarget = roleContext === 'OFFICER' ? 50 : 200;
    const goalProgress = Math.min(Math.round((completed / dailyTarget) * 100), 100);

    const teamStats: Record<string, any> = {};
    filteredData.forEach(sub => {
      if (!sub.assignedToId) return;

      const officerId = sub.assignedToId;
      const officerName = sub.assignedTo ? `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}` : 'System/Unassigned';
      
      if (!teamStats[officerId]) {
        teamStats[officerId] = {
          id: officerId,
          name: officerName,
          total: 0,
          completed: 0,
          pending: 0,
          breached: 0,
          highRisk: 0,
          amended: 0,
          score: 0
        };
      }
      
      teamStats[officerId].total++;
      if (sub.status === KYCStatus.APPROVED) teamStats[officerId].completed++;
      else if ([KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(sub.status)) teamStats[officerId].pending++;
      
      if (sub.status === KYCStatus.ACTION_REQUIRED) teamStats[officerId].amended++;
      if (sub.isExceptional) teamStats[officerId].highRisk++;
      
      const deadline = addHours(new Date(sub.submittedAt || sub.createdAt), 24);
      if (isAfter(new Date(), deadline)) teamStats[officerId].breached++;
    });

    const teamPerformance = Object.values(teamStats).map((o: any) => {
      const slaRate = o.total > 0 ? Math.round(((o.total - o.breached) / o.total) * 100) : 100;
      const returnRate = o.total > 0 ? (o.amended / o.total) * 100 : 0;
      const qualityScore = Math.max(0, 100 - returnRate);
      
      const prodScore = Math.min((o.completed / 50) * 100, 100) * 0.4;
      const finalScore = Math.round(prodScore + (slaRate * 0.3) + (qualityScore * 0.2) + (Math.min(o.highRisk * 10, 100) * 0.1));
      
      return { ...o, slaRate, qualityScore, finalScore };
    }).sort((a, b) => b.finalScore - a.finalScore);

    return { total, completed, slaHealth, goalProgress, slaItems, teamPerformance };
  }, [filteredData, roleContext, settings]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const resetFilters = () => {
    setSelectedBranch("all");
    setSelectedOfficer("all");
    setSearchTerm("");
    handleRangeSelection("month");
  };

  const handleExport = () => {
    toast({ title: "Compiling Intelligence", description: "Filtering active dataset for export..." });
  };

  if (permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Syncing Intelligence Terminal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-8">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-primary text-white rounded-[1.5rem] shadow-2xl shadow-primary/20 ring-4 ring-primary/10">
            <LayoutDashboard className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 font-headline tracking-tight">Ops Monitoring</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <p className="text-slate-500 font-medium text-lg">Institutional Intelligence Terminal</p>
              <div className="h-4 w-px bg-slate-200" />
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Live Sync: {format(lastUpdated, 'HH:mm:ss')}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200">
          {(["today", "week", "month"] as const).map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => handleRangeSelection(r)}
              className={cn(
                "px-6 h-10 rounded-xl font-black text-[10px] uppercase tracking-[0.1em] transition-all",
                dateRange === r ? "bg-white text-primary shadow-lg shadow-black/5" : "text-slate-500 hover:text-primary"
              )}
            >
              {r}
            </Button>
          ))}
          <Button 
            variant="outline" 
            onClick={() => setDateRange("custom")}
            className={cn(
              "h-10 px-6 border-none shadow-none font-black text-[10px] uppercase tracking-[0.1em] rounded-xl gap-2 transition-all",
              dateRange === 'custom' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-transparent text-slate-500 hover:bg-white"
            )}
          >
            <CalendarIcon className="w-3.5 h-3.5" /> Custom
          </Button>
        </div>
      </div>

      {/* FILTER CONSOLE */}
      <Card className="border-slate-200 shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] overflow-hidden">
        <CardContent className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-3 space-y-2.5">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
              <Building2 className="w-3.5 h-3.5" /> Jurisdiction Branch
            </Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-14 rounded-2xl bg-slate-50/50 border-slate-200/60 font-bold text-slate-700 focus:ring-primary/20">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-2xl">
                <SelectItem value="all" className="font-bold">Master Network (Global)</SelectItem>
                {uniqueBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-3 space-y-2.5">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
              <User className="w-3.5 h-3.5" /> Active Reviewer
            </Label>
            <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
              <SelectTrigger className="h-14 rounded-2xl bg-slate-50/50 border-slate-200/60 font-bold text-slate-700 focus:ring-primary/20">
                <SelectValue placeholder="All Specialists" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-2xl">
                <SelectItem value="all" className="font-bold">Combined Workforce</SelectItem>
                {uniqueOfficers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-4 space-y-2.5">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
              <Search className="w-3.5 h-3.5" /> Discovery
            </Label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Case ID, Entity or Account..." 
                className="pl-12 h-14 border-slate-200/60 font-bold bg-slate-50/50 rounded-2xl focus-visible:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="lg:col-span-2 flex items-end">
            <Button variant="ghost" onClick={resetFilters} className="w-full h-14 gap-2 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl">
              <RotateCcw className="w-4 h-4" /> Reset Filters
            </Button>
          </div>

          {dateRange === 'custom' && (
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-300">
              <div className="space-y-2.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Audit Start Date</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-14 rounded-2xl border-slate-200 font-bold bg-slate-50/50" />
              </div>
              <div className="space-y-2.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Audit Conclusion Date</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-14 rounded-2xl border-slate-200 font-bold bg-slate-50/50" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CORE KPI METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all duration-500">
          <CardHeader className="p-6 pb-2 border-b bg-slate-50/50 flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Network Load</span>
            <Inbox className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex items-baseline gap-2">
              <div className="text-6xl font-black text-slate-900 tracking-tighter">{analytics.total}</div>
              <div className="text-slate-400 font-bold text-sm uppercase">Units</div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">+12% vs Benchmark</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all duration-500 border-l-8 border-l-emerald-500">
          <CardHeader className="p-6 pb-2 border-b bg-emerald-50/30 flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-[0.2em]">Compliance Health</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-6xl font-black text-emerald-600 tracking-tighter">{analytics.slaHealth}%</div>
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                <span>Threshold Analysis</span>
                <span>95% Target</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${analytics.slaHealth}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all duration-500 border-l-8 border-l-primary">
          <CardHeader className="p-6 pb-2 border-b bg-primary/5 flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">Velocity Goal</span>
            <Goal className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-6xl font-black text-primary tracking-tighter">{analytics.goalProgress}%</div>
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                <span>Authorized: {analytics.completed}</span>
                <span>Quota: {roleContext === 'OFFICER' ? '50' : '200'}</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${analytics.goalProgress}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all duration-500 border-l-8 border-l-orange-500">
          <CardHeader className="p-6 pb-2 border-b bg-orange-50/30 flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-orange-600 tracking-[0.2em]">Efficiency TAT</span>
            <Clock className="w-4 h-4 text-orange-600" />
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex items-baseline gap-2">
              <div className="text-6xl font-black text-slate-900 tracking-tighter">1.2</div>
              <div className="text-slate-400 font-black text-2xl uppercase">Hrs</div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-orange-600">
              <TrendingUp className="w-4 h-4 rotate-180" />
              <span className="text-[10px] font-black uppercase tracking-widest">-15m Reduction</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-9 space-y-8">
          {(roleContext === 'SUPERVISOR' || roleContext === 'DIRECTOR') && (
            <div className="flex gap-2 p-2 bg-slate-100/80 w-fit rounded-[1.5rem] border border-slate-200 backdrop-blur-md">
              <Button 
                variant="ghost" 
                onClick={() => setActiveTab("queue")}
                className={cn(
                  "rounded-xl font-black text-[10px] uppercase tracking-widest px-8 h-12 transition-all",
                  activeTab === "queue" ? "bg-white text-primary shadow-xl shadow-black/5 scale-[1.02]" : "text-slate-500"
                )}
              >
                <Inbox className="w-4 h-4 mr-3" /> Operations Queue
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setActiveTab("team")}
                className={cn(
                  "rounded-xl font-black text-[10px] uppercase tracking-widest px-8 h-12 transition-all",
                  activeTab === "team" ? "bg-white text-primary shadow-xl shadow-black/5 scale-[1.02]" : "text-slate-500"
                )}
              >
                <Users className="w-4 h-4 mr-3" /> Specialist Matrix
              </Button>
            </div>
          )}

          {activeTab === "queue" ? (
            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[3rem] bg-white ring-1 ring-slate-100">
              <CardHeader className="bg-slate-900 text-white p-10 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight">Technical Operations Queue</CardTitle>
                  <CardDescription className="text-slate-400 font-bold text-[11px] uppercase tracking-[0.2em] mt-2">
                    Prioritized Technical Analysis Stream &bull; {analytics.total} Active Units
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-primary/30 text-primary font-black px-6 py-2 rounded-full h-10 text-[10px] tracking-widest">
                  {analytics.total} UNITS DISCOVERED
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b">
                    <TableRow>
                      <TableHead className="w-[160px] font-black py-6 pl-10 text-[11px] uppercase text-slate-500 tracking-widest">Case ID</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Customer Entity</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">SLA Lifecycle</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Watchdog</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Origin</TableHead>
                      <TableHead className="text-right pr-10 font-black text-[11px] uppercase text-slate-500 tracking-widest">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.slaItems.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-48 text-center italic text-slate-400 bg-slate-50/30">No pending operations discovered in this analysis window.</TableCell></TableRow>
                    ) : analytics.slaItems.map((sub) => (
                      <React.Fragment key={sub.id}>
                        <TableRow 
                          className={cn(
                            "group transition-all cursor-pointer border-b border-slate-100",
                            sub.slaStatus === 'BREACHED' ? "bg-red-50/40" : (sub.slaStatus === 'AT_RISK' ? "bg-amber-50/40" : "hover:bg-slate-50/80")
                          )}
                          onClick={() => toggleRow(sub.id)}
                        >
                          <TableCell className="py-8 pl-10">
                            <div className="flex flex-col">
                              <span className="font-black text-primary tabular-nums text-sm">{sub.id}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Ref ID</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1.5">
                              <span className="font-black text-slate-900 leading-tight text-base group-hover:text-primary transition-colors">{sub.customerName}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] h-4.5 font-black uppercase px-2 bg-white border-slate-200">{sub.entityType || 'Individual'}</Badge>
                                {sub.isExceptional && <Badge className="bg-orange-100 text-orange-700 border-none text-[8px] font-black h-4 px-1.5 uppercase">Escalated</Badge>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "font-black text-[9px] uppercase px-4 py-1 rounded-full border-none shadow-sm",
                              sub.slaStatus === 'BREACHED' ? 'bg-red-600 text-white' : (sub.slaStatus === 'AT_RISK' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')
                            )}>
                              {sub.slaStatus.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {sub.isWatchdogBreached ? (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5 text-red-600">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-black uppercase tracking-tighter">Threshold Breach</span>
                                </div>
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={(e) => { e.stopPropagation(); handleManualEscalation(sub.id); }}
                                  disabled={isEscalating === sub.id}
                                  className="h-7 px-3 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-red-200"
                                >
                                  {isEscalating === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-1 fill-white" />}
                                  Escalate
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Within Bounds</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-[11px] font-black text-slate-700">{sub.branchName}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{sub.createdBy?.firstName || 'Staff'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-10">
                            <div className="flex justify-end gap-3">
                              <Button size="sm" asChild className="h-10 bg-slate-900 hover:bg-black text-white font-black text-[10px] uppercase tracking-widest px-6 rounded-xl shadow-xl transition-all active:scale-95">
                                <Link href={`/submissions/${sub.id}`}>Inspect Case</Link>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-slate-400 hover:bg-primary/5 hover:text-primary">
                                {expandedRows.has(sub.id) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(sub.id) && (
                          <TableRow className="bg-slate-50/50 border-b border-slate-100 animate-in slide-in-from-top-2">
                            <TableCell colSpan={6} className="p-10">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                                <div className="space-y-4">
                                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Technical Log</Label>
                                  <div className="relative p-5 bg-white rounded-[1.5rem] border border-slate-200/60 shadow-sm">
                                    <div className="absolute top-4 right-4"><Zap className="w-3 h-3 text-slate-200" /></div>
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium italic">
                                      "Technical analysis initiated. Reviewing jurisdictional AML compliance parameters and customer identity bundle authenticity."
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Bundle Assets</Label>
                                  <div className="flex flex-wrap gap-2.5">
                                    {['National_ID.pdf', 'Memo_Authorized.jpg', 'Utility_Proof.png'].map(f => (
                                      <Badge key={f} variant="outline" className="bg-white border-slate-200 text-[10px] font-black py-1.5 px-3 rounded-lg text-slate-500 hover:border-primary/30 transition-colors cursor-default">{f}</Badge>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-end justify-end">
                                  <Button variant="ghost" className="h-12 px-6 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary/5 border border-primary/10">
                                    View Detailed Trail <ExternalLink className="w-4 h-4 ml-3" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="bg-slate-50/80 border-t py-6 px-10 flex justify-between items-center">
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-red-600 shadow-sm" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">SLA Breached</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">High Risk (&lt;4h)</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Standard Lifecycle</span></div>
                </div>
                <div className="text-[10px] font-mono font-black text-primary/40 uppercase tracking-widest bg-white px-4 py-1.5 rounded-full border border-slate-100">
                  Threshold Watchdog: {settings?.escalationHours || 72} Hours
                </div>
              </CardFooter>
            </Card>
          ) : (
            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[3rem] bg-white animate-in slide-in-from-right-4 duration-500 ring-1 ring-slate-100">
              <CardHeader className="bg-slate-900 text-white p-10 flex flex-row items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-primary/20 rounded-[1.5rem] shadow-2xl ring-2 ring-primary/10">
                    <Trophy className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl font-black tracking-tight">Efficiency & Accuracy Matrix</CardTitle>
                    <CardDescription className="text-slate-400 font-bold text-[11px] uppercase tracking-[0.2em] mt-2">
                      Weighted Specialist Metrics &bull; Audit Score Formula 40/30/20/10
                    </CardDescription>
                  </div>
                </div>
                <Button 
                  onClick={handleExport}
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white font-black text-[10px] uppercase tracking-[0.2em] h-12 px-8 rounded-2xl hover:bg-white/20"
                >
                  <FileDown className="w-4 h-4 mr-3" /> Master Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b">
                    <TableRow>
                      <TableHead className="font-black py-6 pl-10 text-[11px] uppercase text-slate-500 tracking-widest">Specialist Official</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Authorized</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">SLA Compliance</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Methodology Gaps</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Active Load</TableHead>
                      <TableHead className="text-right pr-10 font-black text-[11px] uppercase text-slate-500 tracking-widest">Efficiency Index</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.teamPerformance.map((officer) => (
                      <TableRow key={officer.id} className="hover:bg-slate-50/80 transition-all border-b border-slate-100 group">
                        <TableCell className="py-8 pl-10">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-base shadow-sm ring-4 ring-primary/5">
                              {officer.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 leading-tight text-base group-hover:text-primary transition-colors">{officer.name}</span>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Verification Node</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-black text-slate-700 text-lg">{officer.completed}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-2">
                            <span className={cn(
                              "text-xs font-black",
                              officer.slaRate >= 90 ? "text-emerald-600" : officer.slaRate >= 75 ? "text-primary" : "text-red-600"
                            )}>{officer.slaRate}%</span>
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={cn("h-full rounded-full", officer.slaRate >= 90 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${officer.slaRate}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-black text-[10px] px-4 py-1.5 rounded-full">{officer.amended}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-blue-50 text-blue-700 border-none font-black text-[10px] px-4 py-1.5 rounded-full">{officer.pending}</Badge>
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex items-center justify-end gap-5">
                            <div className="flex flex-col items-end">
                              <span className="text-2xl font-black text-slate-900 tracking-tighter">{officer.finalScore}%</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Composite Rating</span>
                            </div>
                            <div className={cn(
                              "w-2.5 h-12 rounded-full shadow-lg",
                              officer.finalScore >= 80 ? "bg-emerald-500 shadow-emerald-200" : 
                              officer.finalScore >= 60 ? "bg-primary shadow-primary/20" : "bg-orange-500 shadow-orange-200"
                            )} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="bg-slate-50/80 border-t py-8 px-10 flex justify-between items-center">
                <div className="flex gap-6">
                  <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <Trophy className="w-4 h-4 text-primary" />
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Branch MVP: <span className="text-primary font-black ml-1">{analytics.teamPerformance[0]?.name}</span></p>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Institutional Audit Engine v2.0</p>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* QUICK ACTION PANEL */}
        <div className="lg:col-span-3 space-y-10">
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white ring-1 ring-slate-100">
            <CardHeader className="bg-primary text-white p-8 border-b">
              <CardTitle className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3 text-white">
                <Zap className="w-4 h-4 fill-white" /> Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <Button 
                onClick={handleExport}
                className="w-full h-16 bg-slate-900 hover:bg-black text-white font-black text-base rounded-[1.5rem] shadow-xl gap-4 transition-all active:scale-[0.98]"
              >
                <FileDown className="w-5 h-5" /> Export Intelligence
              </Button>
              <Button 
                variant="outline" 
                className="w-full h-14 border-slate-200 font-bold text-[10px] uppercase tracking-widest rounded-[1.5rem] gap-3 hover:bg-slate-50 transition-all text-slate-600" 
                onClick={() => setActiveTab(activeTab === "queue" ? "team" : "queue")}
              >
                <Trophy className="w-4 h-4 text-primary" /> {activeTab === "queue" ? "Specialist Matrix" : "Operations Queue"}
              </Button>
              <div className="pt-6 border-t border-dashed border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><Target className="w-4 h-4 text-slate-400" /></div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-tight">Current Target: <span className="text-slate-900">200 Cases/Day</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><BarChart3 className="w-4 h-4 text-slate-400" /></div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-tight">Network Health: <span className="text-emerald-600">Stable</span></p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-slate-900 text-white border-none">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-black">SLA Alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0 space-y-4">
              {analytics.slaItems.filter(s => s.slaStatus === 'BREACHED').length > 0 ? (
                <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 flex gap-4">
                  <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                  <p className="text-xs font-bold text-red-200 leading-relaxed">
                    {analytics.slaItems.filter(s => s.slaStatus === 'BREACHED').length} cases have exceeded the 24-hour analysis window. Immediate supervisor assignment required.
                  </p>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex gap-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                  <p className="text-xs font-bold text-emerald-200 leading-relaxed">
                    All authorized nodes are currently operating within established SLA parameters.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
