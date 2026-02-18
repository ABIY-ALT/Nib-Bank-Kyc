"use client"

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-mock";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Filter, 
  FileDown, 
  Loader2
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
  }, [fromDate, toDate, isAdmin, isDistDir]);

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

  const handleExportCSV = () => {
    toast({ title: "Performance Data Exported" });
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
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          <p className="text-muted-foreground text-lg font-medium">Relational network efficiency and throughput monitoring.</p>
        </div>
        <div className="flex gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 font-bold h-10 border-slate-200">
                <Filter className="w-4 h-4" /> Filter Nodes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400">Jurisdiction</DropdownMenuLabel>
              {branchList.map(b => (
                <DropdownMenuCheckboxItem key={b} checked={selectedBranches.includes(b)} onCheckedChange={() => setSelectedBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}>
                  {b}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="gap-2 h-10 px-6 bg-primary font-bold shadow-lg" onClick={handleExportCSV}><FileDown className="w-4 h-4" /> Export</Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">From Date</Label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">To Date</Label><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {branchMetrics.map((branch) => {
          const approvalRate = Math.round((branch.approved / (branch.volume - branch.pending || 1)) * 100);
          return (
            <Card key={branch.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all">
              <CardHeader className="bg-slate-50/80 border-b p-6">
                <CardTitle className="text-xl font-bold">{branch.name}</CardTitle>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{branch.district} District</p>
              </CardHeader>
              <CardContent className="pt-8 px-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Volume</p><p className="text-3xl font-black">{branch.volume}</p></div>
                  <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Accuracy</p><p className="text-3xl font-black text-emerald-600">{approvalRate}%</p></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600"><span>Efficiency Index</span><span>{approvalRate}%</span></div>
                  <Progress value={approvalRate} className="h-2" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
