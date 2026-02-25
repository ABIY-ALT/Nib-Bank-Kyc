
"use client"

import { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-mock";
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
  Target
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
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
  Legend
} from 'recharts';
import { useToast } from "@/hooks/use-toast"
import { subDays, format, differenceInDays } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { createAuditLog } from "@/actions/audit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KYCStatus } from "@prisma/client";

const COLORS = ['#B89334', '#10B981', '#3F51B5', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function OfficerPerformancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadData();
  }, [fromDate, toDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSubmissions({
        startDate: fromDate,
        endDate: toDate,
        limit: 1000 // Fetch a larger set for comprehensive analytics
      });
      setSubmissions(data);
    } catch (e) {
      toast({ variant: "destructive", title: "Institutional Audit Error" });
    } finally {
      setLoading(false);
    }
  };

  const performanceMatrix = useMemo(() => {
    const matrix: Record<string, any> = {};
    
    // 1. Raw Aggregation
    submissions.forEach(sub => {
      if (!sub.assignedToId) return;

      const officerName = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
      const officerId = sub.assignedToId;
      const branchName = sub.branchName || "Unknown Node";
      
      if (!matrix[officerId]) {
        matrix[officerId] = { 
          id: officerId, 
          name: officerName, 
          branch: branchName,
          total: 0, 
          completed: 0, 
          pending: 0,
          returned: 0, 
          escalated: 0,
          highRisk: 0,
          multiReturn: 0,
          tatDaysSum: 0,
          slaCompliant: 0
        };
      }
      
      const stats = matrix[officerId];
      stats.total++;
      
      if (sub.status === KYCStatus.APPROVED) {
        stats.completed++;
        // Calculate TAT
        const start = new Date(sub.submittedAt);
        const end = new Date(); // In production use approvedAt, fallback to now for demo
        const tat = differenceInDays(end, start);
        stats.tatDaysSum += tat;
        if (tat <= 2) stats.slaCompliant++;
      } else if (sub.status === KYCStatus.ACTION_REQUIRED) {
        stats.returned++;
      } else if (sub.status === KYCStatus.ESCALATED) {
        stats.escalated++;
      } else {
        stats.pending++;
      }

      if (sub.isExceptional) stats.highRisk++;
      if ((sub.amendCycles || 0) > 1) stats.multiReturn++;
    });

    // 2. Performance Scoring Algorithm
    const officers = Object.values(matrix);
    if (officers.length === 0) return [];

    const maxCompleted = Math.max(...officers.map(o => o.completed), 1);
    const maxHighRisk = Math.max(...officers.map(o => o.highRisk), 1);

    return officers.map(o => {
      const avgTat = o.completed > 0 ? (o.tatDaysSum / o.completed).toFixed(1) : "0.0";
      const slaRate = o.completed > 0 ? Math.round((o.slaCompliant / o.completed) * 100) : 0;
      const returnRate = o.total > 0 ? (o.returned / o.total) * 100 : 0;
      const multiReturnRate = o.total > 0 ? (o.multiReturn / o.total) * 100 : 0;
      const qualityScore = Math.max(0, 100 - (returnRate + multiReturnRate));

      // Weights: 40% Productivity, 30% SLA, 20% Quality, 10% High-Risk
      const prodScore = (o.completed / maxCompleted) * 100;
      const riskScore = (o.highRisk / maxHighRisk) * 100;
      
      const finalScore = Math.round(
        (prodScore * 0.4) + 
        (slaRate * 0.3) + 
        (qualityScore * 0.2) + 
        (riskScore * 0.1)
      );

      return {
        ...o,
        avgTat,
        slaRate,
        returnRate: returnRate.toFixed(1),
        multiReturnRate: multiReturnRate.toFixed(1),
        score: finalScore
      };
    })
    .filter(o => selectedOfficers.length === 0 || selectedOfficers.includes(o.id))
    .sort((a, b) => b.score - a.score);
  }, [submissions, selectedOfficers]);

  const aggregateStats = useMemo(() => {
    if (performanceMatrix.length === 0) return null;
    
    return {
      totalAssigned: performanceMatrix.reduce((acc, o) => acc + o.total, 0),
      totalCompleted: performanceMatrix.reduce((acc, o) => acc + o.completed, 0),
      totalPending: performanceMatrix.reduce((acc, o) => acc + o.pending, 0),
      totalReturned: performanceMatrix.reduce((acc, o) => acc + o.returned, 0),
      totalEscalated: performanceMatrix.reduce((acc, o) => acc + o.escalated, 0),
      avgSla: Math.round(performanceMatrix.reduce((acc, o) => acc + o.slaRate, 0) / performanceMatrix.length),
      avgTat: (performanceMatrix.reduce((acc, o) => acc + parseFloat(o.avgTat), 0) / performanceMatrix.length).toFixed(1),
      totalHighRisk: performanceMatrix.reduce((acc, o) => acc + o.highRisk, 0),
      multiReturnPerc: (performanceMatrix.reduce((acc, o) => acc + o.multiReturn, 0) / performanceMatrix.reduce((acc, o) => acc + o.total, 1) * 100).toFixed(1)
    };
  }, [performanceMatrix]);

  const chartData = useMemo(() => {
    const workload = performanceMatrix.map(o => ({ name: o.name, value: o.total }));
    const returnComparison = performanceMatrix.slice(0, 5).map(o => ({ name: o.name, returns: o.returned, multiReturns: o.multiReturn }));
    const ranking = performanceMatrix.slice(0, 8).map(o => ({ name: o.name, score: o.score, sla: o.slaRate }));

    return { workload, returnComparison, ranking };
  }, [performanceMatrix]);

  const handleExportReport = async () => {
    if (!user || performanceMatrix.length === 0) return;
    
    toast({ title: "Compiling Performance Dataset", description: "Encrypting institutional audit trail..." });

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'OFFICER_PRODUCTIVITY_EXPORT',
      ipAddress: '127.0.0.1',
      details: `Specialist productivity report exported for period ${fromDate} to ${toDate}. Records: ${performanceMatrix.length}.`
    });

    const headers = ['Officer', 'Branch', 'Assigned', 'Completed', 'Returned', 'Escalated', 'Avg TAT', 'SLA %', 'High Risk', 'Perf Score'];
    const rows = performanceMatrix.map(o => [o.name, o.branch, o.total, o.completed, o.returned, o.escalated, o.avgTat, o.slaRate, o.highRisk, o.score]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nib-specialist-performance-${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  const OFFICER_LIST = useMemo(() => {
    const list: Record<string, string> = {};
    submissions.forEach(sub => {
      if (sub.assignedToId) {
        list[sub.assignedToId] = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
      }
    });
    return Object.entries(list).map(([id, name]) => ({ id, name }));
  }, [submissions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
            <UserCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Specialist Analysis Center</h1>
            <p className="text-muted-foreground text-lg font-medium">Monitoring throughput, methodology accuracy, and SLA compliance.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={loading}>
              <Button variant="outline" className="gap-2 h-12 px-6 border-slate-200 bg-white font-bold shadow-sm rounded-xl">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Pool
                {selectedOfficers.length > 0 && (
                  <Badge className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-black">{selectedOfficers.length}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl shadow-2xl">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-2">Authorized Analysts</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {OFFICER_LIST.map((officer) => (
                <DropdownMenuCheckboxItem 
                  key={officer.id} 
                  checked={selectedOfficers.includes(officer.id)} 
                  onCheckedChange={() => setSelectedOfficers(prev => prev.includes(officer.id) ? prev.filter(x => x !== officer.id) : [...prev, officer.id])}
                >
                  {officer.name}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSelectedOfficers([])} className="text-destructive font-bold cursor-pointer">Clear Workspace</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl" onClick={handleExportReport}>
            <FileDown className="w-5 h-5" /> Export Intelligence
          </Button>
        </div>
      </div>

      {/* KPI GRID */}
      {aggregateStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all rounded-2xl">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Assigned</span>
              <Inbox className="w-3.5 h-3.5 text-slate-300" />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-4xl font-black text-slate-900 tracking-tighter">{aggregateStats.totalAssigned}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 rounded-2xl">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Successfully Authorized</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600/30" />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-4xl font-black text-emerald-600 tracking-tighter">{aggregateStats.totalCompleted}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 rounded-2xl">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-orange-600">Action Required</span>
              <RotateCcw className="w-3.5 h-3.5 text-orange-600/30" />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-4xl font-black text-orange-600 tracking-tighter">{aggregateStats.totalReturned}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary rounded-2xl">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-primary">SLA Compliance</span>
              <Target className="w-3.5 h-3.5 text-primary/30" />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-4xl font-black text-primary tracking-tighter">{aggregateStats.avgSla}%</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-slate-200 border-l-4 border-l-red-500 rounded-2xl">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-red-600">High Risk Managed</span>
              <ShieldAlert className="w-3.5 h-3.5 text-red-600/30" />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-4xl font-black text-red-600 tracking-tighter">{aggregateStats.totalHighRisk}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* FILTER CONSOLE */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis Start</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold bg-slate-50/30" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis Conclusion</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold bg-slate-50/30" />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Specialist Intelligence...</p>
        </div>
      ) : performanceMatrix.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-[2.5rem]">
          <CardContent className="flex flex-col items-center justify-center py-32 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <ShieldCheck className="w-12 h-12 text-slate-200" />
            </div>
            <p className="font-bold text-slate-900 text-xl">Productivity Pool Empty</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          {/* ANALYTICS CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
              <CardHeader className="bg-slate-50/50 border-b p-6">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Specialist Ranking
                </CardTitle>
                <CardDescription>Comparative Score vs SLA Compliance</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.ranking} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fontWeight: 'bold' }} width={80} />
                    <RechartsTooltip />
                    <Bar dataKey="score" fill="#B89334" radius={[0, 4, 4, 0]} barSize={12} />
                    <Bar dataKey="sla" fill="#10B981" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
              <CardHeader className="bg-slate-50/50 border-b p-6">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Scale className="w-5 h-5 text-primary" /> Workload Distribution
                </CardTitle>
                <CardDescription>Assigned case volume by specialist</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData.workload} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5}>
                      {chartData.workload.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
              <CardHeader className="bg-slate-50/50 border-b p-6">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-primary" /> Quality Analysis
                </CardTitle>
                <CardDescription>Top 5 analysts with methodology gaps</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.returnComparison}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RechartsTooltip />
                    <Bar dataKey="returns" fill="#F59E0B" name="Returns" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="multiReturns" fill="#EF4444" name="Multi-Return" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* DETAILED DATA TABLE */}
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="bg-slate-900 text-white border-b p-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">Performance Matrix</CardTitle>
                <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Specialist Analysis Efficiency Audit</CardDescription>
              </div>
              <Badge variant="outline" className="bg-white/10 text-white border-white/20 font-black px-4 h-9">
                {performanceMatrix.length} Analysts Scored
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black py-5 pl-8 text-[11px] uppercase text-slate-500">Specialist Name</TableHead>
                      <TableHead className="font-black py-5 text-[11px] uppercase text-slate-500">Home Node</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-slate-500">Assigned</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-emerald-600">Authorized</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-orange-600">Returns</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-slate-500">Avg TAT</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-slate-500">SLA %</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-red-600">High Risk</TableHead>
                      <TableHead className="font-black py-5 text-center text-[11px] uppercase text-purple-600">Multi-Ret</TableHead>
                      <TableHead className="text-right pr-8 font-black py-5 text-[11px] uppercase text-primary">Performance Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performanceMatrix.map((officer) => (
                      <TableRow key={officer.id} className="hover:bg-slate-50 transition-colors group">
                        <TableCell className="font-black text-slate-900 py-6 pl-8 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shadow-sm">
                            {officer.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span>{officer.name}</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">KYC Specialist</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-xs text-slate-500">{officer.branch}</TableCell>
                        <TableCell className="text-center font-bold">{officer.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-black px-3 py-1">
                            {officer.completed}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-black px-3 py-1">
                            {officer.returned}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-xs">{officer.avgTat}d</TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "text-xs font-black",
                            officer.slaRate >= 90 ? "text-emerald-600" : "text-orange-600"
                          )}>{officer.slaRate}%</span>
                        </TableCell>
                        <TableCell className="text-center font-bold text-red-600">{officer.highRisk}</TableCell>
                        <TableCell className="text-center font-bold text-purple-600">{officer.multiReturn}</TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "font-black text-lg",
                                officer.score >= 80 ? "text-emerald-600" : officer.score >= 60 ? "text-primary" : "text-orange-600"
                              )}>{officer.score}</span>
                              <ArrowUpRight className="w-4 h-4 text-slate-200" />
                            </div>
                            <Progress value={officer.score} className={cn(
                              "w-24 h-1.5 bg-slate-100",
                              officer.score >= 80 ? "[&>div]:bg-emerald-500" : officer.score >= 60 ? "[&>div]:bg-primary" : "[&>div]:bg-orange-500"
                            )} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50/50 border-t py-4 px-8 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Weighted Institutional Scorecard: 40% Productivity | 30% SLA | 20% Quality | 10% Risk Profile</span>
              <span className="font-mono text-primary/40">Audit Trace Active: {user?.name}</span>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
