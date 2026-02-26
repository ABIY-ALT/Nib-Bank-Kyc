"use client"

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Filter, 
  FileDown, 
  Loader2,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Inbox,
  AlertCircle,
  Building2,
  Activity,
  ArrowUpRight,
  ShieldAlert,
  Clock
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { KYCStatus } from "@prisma/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default function BranchPerformancePage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const isDistDir = hasPermission('REPORT_VIEW_DISTRICT');
  const isAdmin = isSuperAdmin;

  useEffect(() => {
    loadData();
  }, [fromDate, toDate, isAdmin, isDistDir, user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getSubmissions({
      startDate: fromDate,
      endDate: toDate,
      district: isDistDir && !isAdmin ? user.districtName || undefined : undefined
    });
    setSubmissions(data);
    setLoading(false);
  };

  const branchList = useMemo(() => {
    return Array.from(new Set(submissions.map(s => s.branchName))).sort() as string[];
  }, [submissions]);

  const branchMetrics = useMemo(() => {
    const stats: Record<string, any> = {};
    submissions.forEach(sub => {
      const bName = sub.branchName || 'Unknown';
      if (!stats[bName]) {
        stats[bName] = { name: bName, district: sub.districtName, volume: 0, approved: 0, amended: 0, pending: 0 };
      }
      stats[bName].volume++;
      if (sub.status === KYCStatus.APPROVED) stats[bName].approved++;
      if (sub.status === KYCStatus.ACTION_REQUIRED) stats[bName].amended++;
      if ([KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(sub.status as any)) stats[bName].pending++;
    });

    return Object.values(stats)
      .filter(b => selectedBranches.length === 0 || selectedBranches.includes(b.name))
      .sort((a, b) => b.volume - a.volume);
  }, [submissions, selectedBranches]);

  const aggregateStats = useMemo(() => {
    const total = branchMetrics.reduce((acc, b) => acc + b.volume, 0);
    const approved = branchMetrics.reduce((acc, b) => acc + b.approved, 0);
    const amended = branchMetrics.reduce((acc, b) => acc + b.amended, 0);
    const accuracy = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, amended, accuracy };
  }, [branchMetrics]);

  const handleExportCSV = () => {
    toast({ title: "Performance Dataset Exported", description: "Audit trail compiled for selected nodes." });
  };

  if (loading || permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Relational network efficiency and methodology throughput monitoring.</p>
        </div>
        <div className="flex gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 font-bold h-12 px-6 border-slate-200 bg-white rounded-xl shadow-sm">
                <Filter className="w-4 h-4 text-primary" /> Filter Nodes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl shadow-2xl">
              <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-4 py-2">Authorized Jurisdiction</DropdownMenuLabel>
              {branchList.map(b => (
                <DropdownMenuCheckboxItem key={b} checked={selectedBranches.includes(b)} onCheckedChange={() => setSelectedBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}>
                  {b}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl" onClick={handleExportCSV}>
            <FileDown className="w-5 h-5" /> Export Data
          </Button>
        </div>
      </div>

      {isDistDir && !isAdmin && user?.districtName && (
        <Alert className="bg-primary/5 border-primary/20 text-primary-foreground shadow-lg rounded-2xl border-l-4 border-l-primary animate-in slide-in-from-left duration-500">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <AlertDescription className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-3">
            Regional Command Active: <Badge className="bg-primary text-white font-black px-4">{user.districtName} Node</Badge>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50">Node Volume</CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-slate-900 tracking-tighter">{aggregateStats.total}</span>
            <div className="p-2 bg-slate-100 rounded-lg"><Inbox className="w-4 h-4 text-slate-400" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600 bg-slate-50/50">Successfully Authorized</CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-emerald-600 tracking-tighter">{aggregateStats.approved}</span>
            <div className="p-2 bg-emerald-50 rounded-lg"><ShieldCheck className="w-4 h-4 text-emerald-600" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600 bg-slate-50/50">Methodology Gaps</CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-orange-600 tracking-tighter">{aggregateStats.amended}</span>
            <div className="p-2 bg-orange-50 rounded-lg"><ShieldAlert className="w-4 h-4 text-orange-600" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-primary bg-slate-50/50">Efficiency Index</CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-primary tracking-tighter">{aggregateStats.accuracy}%</span>
            <div className="p-2 bg-primary/5 rounded-lg"><Activity className="w-4 h-4 text-primary" /></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Analysis Start</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold bg-slate-50/30" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Analysis Conclusion</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold bg-slate-50/30" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {branchMetrics.map((branch) => {
          const efficiency = Math.round((branch.approved / (branch.volume - branch.pending || 1)) * 100);
          return (
            <Card key={branch.name} className="shadow-xl border-slate-200 overflow-hidden group hover:border-primary/40 transition-all rounded-3xl bg-white">
              <CardHeader className="bg-slate-50/80 border-b p-6 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">{branch.name}</CardTitle>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" /> {branch.district} Regional Node
                  </p>
                </div>
                <Badge variant="outline" className="bg-white text-primary border-primary/20 font-black h-7">
                  {branch.volume} Cases
                </Badge>
              </CardHeader>
              <CardContent className="pt-8 px-6 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Successfully Authorized</p>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-emerald-600">{branch.approved}</span>
                      <ShieldCheck className="w-4 h-4 text-emerald-600/30" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Methodology Gaps</p>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-orange-600">{branch.amended}</span>
                      <ShieldAlert className="w-4 h-4 text-orange-600/30" />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Accuracy Index</p>
                      <p className={cn(
                        "text-lg font-black leading-none",
                        efficiency >= 90 ? "text-emerald-600" : efficiency >= 70 ? "text-primary" : "text-orange-600"
                      )}>{efficiency}%</p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-200" />
                  </div>
                  <Progress value={efficiency} className={cn(
                    "h-2 bg-slate-100",
                    efficiency >= 90 ? "[&>div]:bg-emerald-500" : efficiency >= 70 ? "[&>div]:bg-primary" : "[&>div]:bg-orange-500"
                  )} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}