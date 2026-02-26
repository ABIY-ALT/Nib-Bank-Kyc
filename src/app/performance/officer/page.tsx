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
  Scale,
  Target,
  ChevronRight,
  MoreHorizontal,
  ChevronDown,
  MessageSquare,
  FileText,
  Play,
  Goal,
  Activity,
  BarChart3,
  ExternalLink,
  Building2,
  Trophy
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  RadialBarChart,
  RadialBar
} from 'recharts';
import { useToast } from "@/hooks/use-toast"
import { subDays, format, differenceInHours, addHours, isAfter } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"queue" | "team">("queue");
  
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
  }, [fromDate, toDate, roleContext, user]);

  const loadData = async () => {
    setLoading(true);
    try {
      let filters: any = { startDate: fromDate, endDate: toDate, limit: 1000 };
      
      if (roleContext === 'OFFICER') {
        filters.createdById = user?.id;
      } else if (roleContext === 'SUPERVISOR' && user?.branchName) {
        filters.branch = user.branchName;
      }
      
      const data = await getSubmissions(filters);
      setSubmissions(data);
    } catch (e) {
      toast({ variant: "destructive", title: "Audit Error" });
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const total = submissions.length;
    const completed = submissions.filter(s => s.status === KYCStatus.APPROVED).length;
    
    const slaItems = submissions.map(sub => {
      const deadline = addHours(new Date(sub.submittedAt || sub.createdAt), 24);
      const now = new Date();
      const hoursLeft = differenceInHours(deadline, now);
      const isBreached = isAfter(now, deadline);
      const isAtRisk = !isBreached && hoursLeft < 4;
      
      return { 
        ...sub, 
        deadline, 
        hoursLeft, 
        slaStatus: isBreached ? 'BREACHED' : (isAtRisk ? 'AT_RISK' : 'ON_TRACK') 
      };
    });

    const slaHealth = total > 0 ? Math.round((slaItems.filter(s => s.slaStatus !== 'BREACHED').length / total) * 100) : 100;
    const dailyTarget = roleContext === 'OFFICER' ? 50 : 200;
    const goalProgress = Math.min(Math.round((completed / dailyTarget) * 100), 100);

    const teamStats: Record<string, any> = {};
    submissions.forEach(sub => {
      const officerId = sub.createdById || 'UNASSIGNED';
      const officerName = sub.createdBy ? `${sub.createdBy.firstName} ${sub.createdBy.lastName}` : 'System/Unassigned';
      
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
  }, [submissions, roleContext]);

  const handleExportPerformance = () => {
    if (analytics.teamPerformance.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No performance records to export." });
      return;
    }

    const headers = ['Officer Name', 'Authorized', 'SLA Rate (%)', 'Gaps Found', 'Active Load', 'Efficiency Index (%)'];
    const rows = analytics.teamPerformance.map(o => [
      o.name,
      o.completed,
      o.slaRate,
      o.amended,
      o.pending,
      o.finalScore
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-team-performance-${format(new Date(), 'yyyyMMdd')}.csv`);
    link.click();
    
    toast({ title: "Export Successful", description: "Team performance matrix saved to CSV." });
  };

  const chartData = useMemo(() => {
    const distribution = [
      { name: 'Individual', value: 400 },
      { name: 'Corporate', value: 300 },
      { name: 'NGO', value: 150 },
    ];

    const slaGauge = [
      { name: 'Compliant', value: analytics.slaHealth, fill: '#10B981' },
      { name: 'Remaining', value: 100 - analytics.slaHealth, fill: '#f1f5f9' },
    ];

    return { distribution, slaGauge };
  }, [analytics]);

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
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Syncing Secure Workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-4 mb-1">
            <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
              <Zap className="w-8 h-8 fill-white" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">KYC Operations Monitoring</h1>
              <p className="text-muted-foreground text-lg font-medium flex items-center gap-2">
                Real-time productivity and methodology oversight &bull; 
                <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-500" /> LAST SYNC: {format(lastUpdated, 'HH:mm:ss')}
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border shadow-inner">
            {(["today", "week", "month"] as const).map((r) => (
              <Button
                key={r}
                variant="ghost"
                size="sm"
                onClick={() => setDateRange(r)}
                className={cn(
                  "px-4 h-9 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all",
                  dateRange === r ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary"
                )}
              >
                {r}
              </Button>
            ))}
          </div>
          <Button variant="outline" className="h-11 px-6 border-slate-200 shadow-sm font-bold rounded-xl gap-2 bg-white">
            <CalendarIcon className="w-4 h-4 text-primary" /> Custom
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all rounded-3xl">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              {roleContext === 'DIRECTOR' ? 'Global Queue' : (roleContext === 'SUPERVISOR' ? 'Team Queue' : 'My Queue')}
            </span>
            <Inbox className="w-3.5 h-3.5 text-primary" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-end justify-between">
              <div className="text-5xl font-black text-slate-900 tracking-tighter">{analytics.total}</div>
              <Badge className="mb-1 bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">+12% vs prev</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden rounded-3xl">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">SLA Health Index</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-emerald-600 tracking-tighter">{analytics.slaHealth}%</div>
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                <span>Compliance Target</span>
                <span>95%</span>
              </div>
              <Progress value={analytics.slaHealth} className="h-1.5 bg-slate-100" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden rounded-3xl">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Goal Progress</span>
            <Goal className="w-3.5 h-3.5 text-primary" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-primary tracking-tighter">{analytics.goalProgress}%</div>
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                <span>Resolved: {analytics.completed}</span>
                <span>Target: {roleContext === 'OFFICER' ? '50' : '200'}</span>
              </div>
              <Progress value={analytics.goalProgress} className="h-1.5 bg-slate-100" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden rounded-3xl">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Avg Processing</span>
            <Clock className="w-3.5 h-3.5 text-orange-600" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-slate-900 tracking-tighter">1.2<span className="text-lg text-slate-400 ml-1">hrs</span></div>
            <Badge variant="outline" className="mt-4 text-[9px] border-orange-200 bg-orange-50 text-orange-700 font-black">-15m improvement</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {(roleContext === 'SUPERVISOR' || roleContext === 'DIRECTOR') && (
            <div className="flex gap-2 p-1 bg-slate-100 w-fit rounded-2xl border mb-2">
              <Button 
                variant={activeTab === "queue" ? "default" : "ghost"} 
                onClick={() => setActiveTab("queue")}
                className={cn("rounded-xl font-bold px-6 h-10", activeTab === "queue" ? "bg-white text-primary shadow-sm" : "text-slate-500")}
              >
                <Inbox className="w-4 h-4 mr-2" /> Operations Queue
              </Button>
              <Button 
                variant={activeTab === "team" ? "default" : "ghost"} 
                onClick={() => setActiveTab("team")}
                className={cn("rounded-xl font-bold px-6 h-10", activeTab === "team" ? "bg-white text-primary shadow-sm" : "text-slate-500")}
              >
                <Users className="w-4 h-4 mr-2" /> Team Efficiency Matrix
              </Button>
            </div>
          )}

          {activeTab === "queue" ? (
            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
              <CardHeader className="bg-slate-900 text-white p-8 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black tracking-tight">Active Operations Queue</CardTitle>
                  <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">
                    Prioritized Technical Analysis Matrix &bull; {analytics.total} Active Nodes
                  </CardDescription>
                </div>
                <div className="relative w-72">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Search work queue..." 
                    className="pl-11 h-11 bg-white/5 border-white/10 text-white font-bold rounded-2xl focus-visible:ring-primary/20"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="w-[140px] font-black py-5 pl-8 text-[11px] uppercase text-slate-500 tracking-widest">Case ID</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Customer Entity</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Deadline</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">SLA Status</TableHead>
                      <TableHead className="font-black text-[11px] uppercase text-slate-500 tracking-widest">Assigned</TableHead>
                      <TableHead className="text-right pr-8 font-black text-[11px] uppercase text-slate-500 tracking-widest">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.slaItems.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-32 text-center italic text-slate-400 bg-slate-50/30">Vault clear. No pending operations discovered.</TableCell></TableRow>
                    ) : analytics.slaItems.filter(s => s.customerName.toLowerCase().includes(searchTerm.toLowerCase())).map((sub) => (
                      <React.Fragment key={sub.id}>
                        <TableRow 
                          className={cn(
                            "group transition-all cursor-pointer",
                            sub.slaStatus === 'BREACHED' ? "bg-red-50/30 border-l-4 border-l-red-600" : (sub.slaStatus === 'AT_RISK' ? "bg-amber-50/30 border-l-4 border-l-amber-500" : "hover:bg-slate-50")
                          )}
                          onClick={() => toggleRow(sub.id)}
                        >
                          <TableCell className="py-6 pl-8 font-black text-primary tabular-nums">{sub.id}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 leading-tight">{sub.customerName}</span>
                              <Badge variant="outline" className="w-fit text-[8px] h-4 font-black uppercase mt-1 px-1.5">{sub.entityType || 'Individual'}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] font-bold text-slate-500">
                            {format(sub.deadline, 'MMM dd, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "font-black text-[9px] uppercase px-3",
                              sub.slaStatus === 'BREACHED' ? 'bg-red-600 text-white' : (sub.slaStatus === 'AT_RISK' ? 'bg-amber-500 text-white' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                            )}>
                              {sub.slaStatus.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[11px] font-bold text-slate-600">
                            {sub.createdBy?.firstName || 'System'}
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" asChild className="h-8 bg-primary hover:bg-primary/90 text-white font-black text-[10px] rounded-lg">
                                <Link href={`/submissions/${sub.id}`}>Open Case</Link>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400">
                                {expandedRows.has(sub.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(sub.id) && (
                          <TableRow className="bg-slate-50/50 border-b border-slate-100 animate-in slide-in-from-top-2">
                            <TableCell colSpan={6} className="p-8">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-3">
                                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><MessageSquare className="w-3 h-3" /> Recent Activity</Label>
                                  <p className="text-xs text-slate-600 leading-relaxed italic border-l-2 border-primary/20 pl-4">
                                    "Standard identity verification completed. Awaiting core banking (T24) data synchronization for final methodology sign-off."
                                  </p>
                                </div>
                                <div className="space-y-3">
                                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><FileText className="w-3 h-3" /> Asset Inventory</Label>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-bold">National_ID.pdf</Badge>
                                    <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-bold">Utility_Bill.jpg</Badge>
                                  </div>
                                </div>
                                <div className="flex items-end justify-end">
                                  <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5">
                                    View Audit Trail <ExternalLink className="w-3 h-3 ml-2" />
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
              <CardFooter className="bg-slate-50/50 border-t py-4 px-8 flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-600" /><span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">SLA Breached</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500" /><span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">At Risk (&lt;4h)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">On Track</span></div>
                </div>
                <p className="text-[9px] font-mono font-black text-primary/40 uppercase tracking-tighter">
                  Institutional Ops Console Locked to: {user?.name?.toUpperCase()}
                </p>
              </CardFooter>
            </Card>
          ) : (
            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white animate-in slide-in-from-right-4 duration-500">
              <CardHeader className="bg-slate-900 text-white p-8 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/20 rounded-2xl">
                    <Trophy className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black tracking-tight">Team Efficiency Matrix</CardTitle>
                    <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">
                      Individual Methodology & Throughput Scoring &bull; 40/30/20/10 Formula
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black py-5 pl-8 text-[11px] uppercase text-slate-500 tracking-widest">Specialist Official</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Authorized</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">SLA Compliance</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Gaps Found</TableHead>
                      <TableHead className="font-black text-center text-[11px] uppercase text-slate-500 tracking-widest">Active Load</TableHead>
                      <TableHead className="text-right pr-8 font-black text-[11px] uppercase text-slate-500 tracking-widest">Efficiency Index</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.teamPerformance.map((officer) => (
                      <TableRow key={officer.id} className="hover:bg-slate-50 transition-colors group">
                        <TableCell className="py-6 pl-8">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/5 text-primary flex items-center justify-center font-black text-xs">
                              {officer.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 leading-tight">{officer.name}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Specialist Analysis Node</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-black text-slate-700">{officer.completed}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={cn(
                              "text-xs font-black",
                              officer.slaRate >= 90 ? "text-emerald-600" : officer.slaRate >= 75 ? "text-primary" : "text-red-600"
                            )}>{officer.slaRate}%</span>
                            <Progress value={officer.slaRate} className="w-16 h-1 bg-slate-100" />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-bold">{officer.amended}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 font-black">{officer.pending}</Badge>
                        </TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex flex-col items-end">
                              <span className="text-lg font-black text-slate-900 leading-none">{officer.finalScore}%</span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Weighted Composite</span>
                            </div>
                            <div className={cn(
                              "w-2 h-10 rounded-full",
                              officer.finalScore >= 80 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : 
                              officer.finalScore >= 60 ? "bg-primary" : "bg-orange-500"
                            )} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t py-6 px-8 flex justify-between items-center">
                <div className="flex gap-4">
                  <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /><p className="text-[10px] font-bold text-slate-500 uppercase">Top Performer: {analytics.teamPerformance[0]?.name}</p></div>
                </div>
                <Button 
                  variant="ghost" 
                  onClick={handleExportPerformance}
                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5"
                >
                  Full Team Export <FileDown className="w-3 h-3 ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        <div className="space-y-8">
          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="bg-primary text-white p-6 border-b">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Zap className="w-4 h-4 fill-white" /> Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {roleContext === 'OFFICER' ? (
                <>
                  <Button className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg gap-3">
                    <Play className="w-5 h-5 fill-white" /> Start Next Case
                  </Button>
                  <Button variant="outline" className="w-full h-12 border-slate-200 font-bold rounded-xl gap-2 hover:bg-slate-50">
                    <MessageSquare className="w-4 h-4 text-primary" /> Pending Responses
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    onClick={handleExportPerformance}
                    className="w-full h-14 bg-slate-900 hover:bg-black text-white font-black rounded-xl shadow-lg gap-3"
                  >
                    <FileDown className="w-5 h-5" /> Export Intelligence
                  </Button>
                  <Button variant="outline" className="w-full h-12 border-slate-200 font-bold rounded-xl gap-2 hover:bg-slate-50" onClick={() => setActiveTab(activeTab === "queue" ? "team" : "queue")}>
                    <Trophy className="w-4 h-4 text-primary" /> {activeTab === "queue" ? "View Leaderboard" : "Back to Queue"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="p-6 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">
                {roleContext === 'OFFICER' ? 'My SLA Gauge' : 'Institutional Trend'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                {roleContext === 'OFFICER' ? (
                  <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" barSize={10} data={chartData.slaGauge} startAngle={90} endAngle={-270}>
                    <RadialBar dataKey="value" cornerRadius={10} background />
                    <RechartsTooltip />
                  </RadialBarChart>
                ) : (
                  <BarChart data={chartData.distribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <RechartsTooltip cursor={{ fill: 'rgba(184, 147, 52, 0.05)' }} />
                    <Bar dataKey="value" fill="#B89334" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
            <CardFooter className="bg-slate-50/30 p-4 border-t text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full">
                Interactive Analytics Deck
              </p>
            </CardFooter>
          </Card>

          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-primary/5">
            <CardHeader className="p-6 border-b border-primary/10">
              <CardTitle className="text-primary text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Target className="w-4 h-4" /> Efficiency Index
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-5 rounded-2xl bg-white border border-primary/10 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">First-Time-Right</span>
                  <span className="text-lg font-black text-emerald-600">88.4%</span>
                </div>
                <Progress value={88.4} className="h-1.5 [&>div]:bg-emerald-500" />
              </div>
              <div className="p-5 rounded-2xl bg-white border border-primary/10 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SLA Compliance</span>
                  <span className="text-lg font-black text-primary">{analytics.slaHealth}%</span>
                </div>
                <Progress value={analytics.slaHealth} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
