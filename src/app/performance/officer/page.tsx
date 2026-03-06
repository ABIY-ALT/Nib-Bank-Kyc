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
  TrendingUp,
  Clock,
  Loader2,
  ShieldCheck,
  Search,
  AlertTriangle,
  Zap,
  Inbox,
  ArrowUpRight,
  RotateCcw,
  Target,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  FileText,
  Activity,
  BarChart3,
  ExternalLink,
  Building2,
  Trophy,
  User,
  LayoutDashboard,
  Goal,
  ShieldAlert
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { format, differenceInHours, addHours, isAfter } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions, updateSubmissionStatus } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KYCStatus } from "@prisma/client";
import Link from "next/link";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

export default function KYCOperationsMonitoringPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading, hasPermission } = usePermissions();
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const roleContext = useMemo(() => {
    if (!user) return 'OFFICER';
    const roleName = user.roles?.[0]?.role?.name || '';
    if (isSuperAdmin || roleName === 'DISTRICT_DIRECTOR') return 'DIRECTOR';
    if (roleName === 'SUPERVISOR' || roleName === 'BRANCH_MANAGER') return 'SUPERVISOR';
    return 'OFFICER';
  }, [user, isSuperAdmin]);

  const canEscalate = useMemo(() => {
    return roleContext === 'SUPERVISOR' || roleContext === 'DIRECTOR' || isSuperAdmin;
  }, [roleContext, isSuperAdmin]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
      setLastUpdated(new Date());
    }, 30000); 
    return () => clearInterval(interval);
  }, [roleContext, user, selectedBranch, selectedOfficer, dateRange]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let filters: any = { limit: 1000 };
      
      if (roleContext === 'OFFICER') {
        filters.assignedToId = user?.id;
      } else if (roleContext === 'SUPERVISOR' && user?.branchName) {
        filters.branch = user.branchName;
      }

      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) {
          filters.endDate = dateRange.to.toISOString();
        }
      }
      
      const [data, globalSettings] = await Promise.all([
        getSubmissions(filters),
        getGlobalSettings()
      ]);
      setSubmissions(data || []);
      setSettings(globalSettings);
    } catch (e) {
      toast({ variant: "destructive", title: "Audit Error" });
    } finally {
      setLoading(false);
    }
  };

  const handleManualEscalation = async (caseId: string) => {
    if (!user) return;
    setIsEscalating(caseId);
    try {
      await updateSubmissionStatus(caseId, KYCStatus.ESCALATED, user.id, "Strategic escalation triggered by supervisor due to oversight threshold breach.");
      toast({ title: "Escalation Successful", description: "Case dispatched to Senior Risk Assessor." });
      await loadData();
    } catch (e) {
      toast({ variant: "destructive", title: "Escalation Failed" });
    } finally {
      setIsEscalating(null);
    }
  };

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
      const subTime = new Date(sub.submittedAt || sub.createdAt);
      const standardDeadline = addHours(subTime, 24);
      const now = new Date();
      const hoursSinceSubmission = differenceInHours(now, subTime);
      
      const isBreached = isAfter(now, standardDeadline);
      const hoursLeft = differenceInHours(standardDeadline, now);
      const isAtRisk = !isBreached && hoursLeft < 4;

      const escalationThreshold = settings?.escalationHours || 72;
      const isOversightBreached = hoursSinceSubmission >= escalationThreshold && sub.status !== KYCStatus.APPROVED && sub.status !== KYCStatus.REJECTED && sub.status !== KYCStatus.ESCALATED;
      
      return { 
        ...sub, 
        deadline: standardDeadline, 
        hoursLeft, 
        isOversightBreached,
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
        <div className="flex items-center gap-3">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <Button variant="ghost" onClick={loadData} className="h-12 w-12 rounded-xl border border-slate-200 bg-white">
            <RotateCcw className="w-5 h-5 text-slate-400" />
          </Button>
        </div>
      </div>

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
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all duration-500 border-l-8 border-l-emerald-500">
          <CardHeader className="p-6 pb-2 border-b bg-emerald-50/30 flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-[0.2em]">Compliance Health</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-6xl font-black text-emerald-600 tracking-tighter">{analytics.slaHealth}%</div>
          </CardContent>
        </Card>

        <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all duration-500 border-l-8 border-l-primary">
          <CardHeader className="p-6 pb-2 border-b bg-primary/5 flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">Velocity Goal</span>
            <Goal className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-6xl font-black text-primary tracking-tighter">{analytics.goalProgress}%</div>
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
          </CardContent>
        </Card>
      </div>

      <div className="space-y-8">
        {(roleContext === 'SUPERVISOR' || roleContext === 'DIRECTOR') && (
          <div className="flex gap-2 p-2 bg-slate-100/80 w-fit rounded-[1.5rem] border border-slate-200 backdrop-blur-md">
            <Button 
              variant="ghost" 
              onClick={() => setActiveTab("queue")}
              className={cn(
                "rounded-xl font-black text-[10px] uppercase tracking-widest px-8 h-12 transition-all",
                activeTab === "queue" ? "bg-white text-primary shadow-xl shadow-black/5" : "text-slate-500"
              )}
            >
              <Inbox className="w-4 h-4 mr-3" /> Operations Queue
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setActiveTab("team")}
              className={cn(
                "rounded-xl font-black text-[10px] uppercase tracking-widest px-8 h-12 transition-all",
                activeTab === "team" ? "bg-white text-primary shadow-xl shadow-black/5" : "text-slate-500"
              )}
            >
              <Users className="w-4 h-4 mr-3" /> Specialist Matrix
            </Button>
          </div>
        )}

        {activeTab === "queue" ? (
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[3rem] bg-white ring-1 ring-slate-100">
            <CardHeader className="bg-slate-900 text-white p-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight">Technical Operations Queue</CardTitle>
                  <CardDescription className="text-slate-400 font-bold text-[11px] uppercase tracking-[0.2em] mt-2">
                    Prioritized Technical Analysis Stream • {analytics.total} Active Units
                  </CardDescription>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Search by name or ID..." 
                    className="pl-12 h-14 border-white/10 bg-white/5 text-white font-bold rounded-2xl focus-visible:ring-primary/20"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead className="w-[240px] font-black py-6 pl-10 text-[11px] uppercase text-slate-500 tracking-widest">Case ID</TableHead>
                    <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Customer Entity</TableHead>
                    <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">SLA Lifecycle</TableHead>
                    <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Institutional Oversight</TableHead>
                    <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Origin</TableHead>
                    <TableHead className="text-right pr-10 font-black text-[11px] uppercase text-slate-500 tracking-widest">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.slaItems.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-48 text-center italic text-slate-400 bg-slate-50/30">No pending operations discovered.</TableCell></TableRow>
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
                            <span className="font-black text-[#B89334] tabular-nums text-sm">{sub.id}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Ref ID</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            <span className="font-black text-slate-900 leading-tight text-base">{sub.customerName}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[9px] h-4.5 font-black uppercase px-2 bg-white border-slate-200">{sub.entityType || 'Individual'}</Badge>
                              {sub.status === KYCStatus.ESCALATED && (
                                <Badge className="bg-orange-50 text-orange-700 border-orange-100 text-[8px] font-black h-4 px-1.5 uppercase">
                                  Escalated
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "font-black text-[9px] uppercase px-4 py-1 rounded-full border-none shadow-sm",
                            sub.slaStatus === 'BREACHED' ? 'bg-[#EF4444] text-white' : (sub.slaStatus === 'AT_RISK' ? 'bg-[#F59E0B] text-white' : 'bg-[#10B981] text-white')
                          )}>
                            {sub.slaStatus.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            {sub.isOversightBreached ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-red-600">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-black uppercase tracking-tighter">Oversight Alert</span>
                                </div>
                                {canEscalate && (
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={(e) => { e.stopPropagation(); handleManualEscalation(sub.id); }}
                                    disabled={isEscalating === sub.id}
                                    className="h-8 px-4 text-[9px] font-black uppercase tracking-widest rounded-xl shadow-lg"
                                  >
                                    {isEscalating === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3 mr-1.5" />}
                                    Dispatch Escalation
                                  </Button>
                                )}
                              </div>
                            ) : sub.status === KYCStatus.ESCALATED ? (
                              <div className="flex items-center gap-1.5 text-[#8B5CF6]">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-black uppercase tracking-tighter">Strategic Review Active</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliant</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-11px font-black text-slate-700 uppercase">{sub.branchName}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Branch</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex justify-end gap-3">
                            <Button size="sm" asChild className="h-12 bg-slate-900 hover:bg-black text-white font-black text-[10px] uppercase tracking-widest px-8 rounded-xl shadow-xl transition-all active:scale-95">
                              <Link href={`/submissions/${sub.id}`}>Inspect Case</Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-slate-400">
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
                                <div className="p-5 bg-white rounded-[1.5rem] border border-slate-200/60 shadow-sm">
                                  <p className="text-xs text-slate-600 leading-relaxed font-medium italic">
                                    "Reviewing jurisdictional AML compliance parameters and customer identity bundle authenticity."
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Bundle Assets</Label>
                                <div className="flex flex-wrap gap-2.5">
                                  {sub.memos && sub.memos.length > 0 ? sub.memos.map((memo: any) => (
                                    <Badge key={memo.id} variant="outline" className="bg-white border-slate-200 text-[10px] font-black py-1.5 px-3 rounded-lg text-slate-500">
                                      {memo.name}
                                    </Badge>
                                  )) : (
                                    <span className="text-[10px] font-bold text-slate-400 italic">No assets discovered.</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-end justify-end">
                                <Button variant="ghost" asChild className="h-12 px-6 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] text-primary border border-primary/10">
                                  <Link href={`/submissions/${sub.id}`}>
                                    View Detailed Trail <ExternalLink className="w-4 h-4 ml-3" />
                                  </Link>
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
                <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-[#EF4444] shadow-sm" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">SLA Breached</span></div>
                <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-[#F59E0B] shadow-sm" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">High Risk (&lt;4h)</span></div>
                <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-[#10B981] shadow-sm" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Standard Lifecycle</span></div>
              </div>
              <div className="text-[10px] font-mono font-black text-[#B89334]/40 uppercase tracking-widest bg-white px-6 py-2 rounded-full border border-slate-100 shadow-sm">
                Threshold Oversight: {settings?.escalationHours || 72} Hours
              </div>
            </CardFooter>
          </Card>
        )}

        {activeTab === "team" && (
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[3rem] bg-white animate-in slide-in-from-right-4 duration-500">
            <CardHeader className="bg-slate-900 text-white p-10 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-3xl font-black tracking-tight">Specialist Analysis Matrix</CardTitle>
                <CardDescription className="text-slate-400 font-bold text-[11px] uppercase tracking-[0.2em] mt-2">
                  Weighted Personnel Metrics • Authorized Workforce Grid
                </CardDescription>
              </div>
              <Button onClick={loadData} variant="outline" className="bg-white/10 border-white/20 text-white font-black text-[10px] uppercase h-12 px-8 rounded-2xl">
                <RotateCcw className="w-4 h-4 mr-3" /> Refresh Grid
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead className="font-black py-6 pl-10 text-[11px] uppercase text-slate-500 tracking-widest">Specialist Official</TableHead>
                    <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Authorized</TableHead>
                    <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">SLA Compliance</TableHead>
                    <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Quality Score</TableHead>
                    <TableHead className="text-right pr-10 font-black text-[11px] uppercase text-slate-500 tracking-widest">Efficiency Index</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.teamPerformance.map((officer) => (
                    <TableRow key={officer.id} className="hover:bg-slate-50/80 transition-all border-b border-slate-100">
                      <TableCell className="py-8 pl-10">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-[#B89334]/10 text-[#B89334] flex items-center justify-center font-black shadow-sm">
                            {officer.name.charAt(0)}
                          </div>
                          <span className="font-black text-slate-900">{officer.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-black text-slate-700 text-lg">{officer.completed}</TableCell>
                      <TableCell className="text-center">
                        <span className={cn("text-xs font-black", officer.slaRate >= 90 ? "text-emerald-600" : "text-primary")}>{officer.slaRate}%</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-black text-slate-600">{Math.round(officer.qualityScore)}%</span>
                      </TableCell>
                      <TableCell className="text-right pr-10">
                        <div className="flex items-center justify-end gap-4">
                          <span className="text-2xl font-black text-slate-900 tracking-tighter">{officer.finalScore}%</span>
                          <div className={cn("w-2 h-10 rounded-full", officer.finalScore >= 80 ? "bg-emerald-500" : "bg-primary")} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
