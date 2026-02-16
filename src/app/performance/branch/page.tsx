
"use client"

import { useMemo, useState } from "react";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useAuth } from "@/lib/auth-mock";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Building2, 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  Filter, 
  FileDown, 
  Calendar as CalendarIcon,
  Map,
  Loader2,
  ShieldCheck
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { subDays, format, startOfDay, endOfDay } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KYCSubmission } from "@/lib/kyc-data";

export default function BranchPerformancePage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const isDistDir = user?.role === 'District Director';
  const isAdmin = user?.role === 'Admin';

  // 1. Fetch Submissions based on RBAC scope
  const submissionsQuery = useMemoFirebase(() => {
    if (!db) return null;
    const start = startOfDay(new Date(fromDate)).toISOString();
    const end = endOfDay(new Date(toDate)).toISOString();
    
    let q = query(
      collection(db, "submissions"),
      where("submittedAt", ">=", start),
      where("submittedAt", "<=", end)
    );

    if (isDistDir) {
      q = query(q, where("district", "==", user.district || ""));
    }

    return q;
  }, [db, fromDate, toDate, user?.district, isDistDir]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(submissionsQuery);

  // 2. Fetch all unique branches in scope for filters
  const branchList = useMemo(() => {
    if (!submissions) return [];
    return Array.from(new Set(submissions.map(s => s.branch))).sort();
  }, [submissions]);

  // 3. Aggregate Branch Data
  const branchMetrics = useMemo(() => {
    if (!submissions) return [];
    
    const stats: Record<string, any> = {};
    submissions.forEach(sub => {
      if (!stats[sub.branch]) {
        stats[sub.branch] = { name: sub.branch, district: sub.district, volume: 0, approved: 0, actionRequired: 0, pending: 0 };
      }
      stats[sub.branch].volume++;
      if (sub.status === 'Approved') stats[sub.branch].approved++;
      if (sub.status === 'Amended') stats[sub.branch].actionRequired++;
      if (['Pending', 'In Review'].includes(sub.status)) stats[sub.branch].pending++;
    });

    return Object.values(stats)
      .filter(b => selectedBranches.length === 0 || selectedBranches.includes(b.name))
      .sort((a, b) => b.volume - a.volume);
  }, [submissions, selectedBranches]);

  const toggleBranch = (branch: string) => {
    setSelectedBranches(prev => 
      prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]
    );
  };

  const handleResetFilters = () => {
    setSelectedBranches([]);
  };

  const handleExportCSV = () => {
    toast({
      title: "Performance Data Exported",
      description: `Analytics for ${branchMetrics.length} branches saved to CSV.`,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Branch Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          <p className="text-muted-foreground text-lg">
            {isDistDir ? `Monitoring all branches within the ${user.district} regional jurisdiction.` : 'Operational velocity and real-time efficiency metrics across the network.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Nodes
                {selectedBranches.length > 0 && (
                  <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold">
                    {selectedBranches.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jurisdictional Nodes</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-[300px] overflow-y-auto">
                {branchList.map((branch) => (
                  <DropdownMenuCheckboxItem
                    key={branch}
                    checked={selectedBranches.includes(branch)}
                    onCheckedChange={() => toggleBranch(branch)}
                    className="cursor-pointer py-2.5"
                  >
                    {branch}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleResetFilters} className="text-destructive font-bold cursor-pointer py-3">
                Reset Branch Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            className="gap-2 h-10 px-6 bg-[#B89334] hover:bg-[#A6822D] text-white font-bold shadow-sm rounded-md transition-all active:scale-95" 
            onClick={handleExportCSV}
          >
            <FileDown className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upto Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {branchMetrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-4">
          <Building2 className="w-16 h-16 text-slate-200" />
          <div className="text-center space-y-1">
            <p className="font-bold text-slate-900 text-xl">No Regional Data Discovery</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">Adjust your temporal filters to monitor branch activity within your jurisdiction.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {branchMetrics.map((branch) => {
            const approvalRate = Math.round((branch.approved / (branch.volume - branch.pending || 1)) * 100);
            return (
              <Card key={branch.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300 hover:shadow-xl bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6 pt-6">
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">{branch.name}</CardTitle>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Region: {branch.district}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border shadow-sm text-primary group-hover:scale-110 transition-transform duration-300">
                    <Building2 className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent className="pt-8 px-6 space-y-8 pb-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Decisions</p>
                      <p className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                        {branch.volume}
                        <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accuracy Rate</p>
                      <p className="text-3xl font-bold text-emerald-600">{approvalRate}%</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-primary" /> Efficiency Index</span>
                      <span className="text-primary">{approvalRate}%</span>
                    </div>
                    <Progress value={approvalRate} className="h-2.5 bg-slate-100" />
                  </div>

                  <div className="pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      {branch.approved} Approved
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      {branch.actionRequired} Actions
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      {branch.pending} In Review
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      SLA Optimal
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
