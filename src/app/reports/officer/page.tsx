"use client"

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
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
import { 
  Users, 
  TrendingUp, 
  History,
  CheckCircle2,
  Clock,
  FileDown,
  Filter,
  Calendar as CalendarIcon,
  Loader2,
  ShieldCheck,
  UserCheck,
  LayoutList
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { Progress } from "@/components/ui/progress";
import { KYC_STATUS } from "@/lib/kyc-data";
import { cn } from "@/lib/utils";
import { calculatePerformanceIndex, getPerformanceLabel } from "@/lib/performance";
import { differenceInMinutes } from "date-fns";

export default function OfficerReportsPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reportDataActive, setReportDataActive] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      let filters: any = {
        startDate: fromDate,
        endDate: toDate
      };
      // Non-superadmin users only see submissions from their assigned branches
      if (!isSuperAdmin && user) {
        if (user.assignedBranches && user.assignedBranches.length > 0) {
          filters.branches = user.assignedBranches;
        } else if (user.branchName) {
          filters.branch = user.branchName;
        }
      }
      const data = await getSubmissions(filters);
      setSubmissions(data);
      setReportDataActive(true);
      toast({
        title: "Officer Audit Complete",
        description: `Analyzed records from the institutional archive.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Audit Error" });
    } finally {
      setLoading(false);
    }
  };

  const performanceMatrix = useMemo(() => {
    const matrix: Record<string, any> = {};

    const ensureEntry = (officerId: string, officerName: string) => {
      if (!matrix[officerId]) {
        matrix[officerId] = {
          id: officerId,
          name: officerName,
          total: 0,
          approved: 0,
          amended: 0,
          unseen: 0,
          running: 0,
          escalated: 0,
          totalCycles: 0,
          totalResolutionMins: 0,
          approvedCount: 0,
          // track case IDs to avoid double-counting per officer
          _caseIds: new Set<string>(),
        };
      }
    };

    submissions.forEach(sub => {
      // Collect officers who acted on this case (new records have userId in history)
      const actorMap = new Map<string, string>(); // id → name
      sub.commentHistory?.forEach((h: any) => {
        if (h.userId && [KYC_STATUS.APPROVED, KYC_STATUS.ACTION_REQUIRED, KYC_STATUS.IN_REVIEW].includes(h.action)) {
          actorMap.set(h.userId, h.performedBy || h.userId);
        }
      });

      // Backward compat: for old records with no userId in history, fall back to assignedToId
      const hasUserIdHistory = sub.commentHistory?.some((h: any) => h.userId);
      if (!hasUserIdHistory && sub.assignedToId) {
        const name = sub.assignedTo ? `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}` : sub.assignedToId;
        actorMap.set(sub.assignedToId, name);
      }

      actorMap.forEach((officerName, officerId) => {
        ensureEntry(officerId, officerName);
        const entry = matrix[officerId];

        // Count each case once per officer
        if (!entry._caseIds.has(sub.id)) {
          entry._caseIds.add(sub.id);
          entry.total++;
        }

        // Authorized: officer performed APPROVED action on this case
        const officerApproved =
          sub.commentHistory?.some((h: any) => h.userId === officerId && h.action === KYC_STATUS.APPROVED) ||
          (!hasUserIdHistory && sub.assignedToId === officerId && sub.status === KYC_STATUS.APPROVED);
        if (officerApproved) entry.approved++;

        // Amendment: officer performed ACTION_REQUIRED on this case
        const officerAmended =
          sub.commentHistory?.some((h: any) => h.userId === officerId && h.action === KYC_STATUS.ACTION_REQUIRED) ||
          (!hasUserIdHistory && sub.assignedToId === officerId && sub.status === KYC_STATUS.ACTION_REQUIRED);
        if (officerAmended) entry.amended++;
      });
    });

    return Object.values(matrix)
      .map(({ _caseIds: _omit, ...o }) => {
        const accuracy = calculatePerformanceIndex({
          total: o.total,
          viewed: o.viewed || 0,
          amended: o.amended || 0,
          authorized: o.approved || 0
        });
        return { ...o, accuracy };
      })
      .filter(o => selectedOfficers.length === 0 || selectedOfficers.includes(o.id))
      .sort((a, b) => b.accuracy - a.accuracy);
  }, [submissions, selectedOfficers]);

  const OFFICER_LIST = useMemo(() => {
    const list: Record<string, string> = {};
    submissions.forEach(sub => {
      // Include historically-attributed officers from commentHistory
      sub.commentHistory?.forEach((h: any) => {
        if (h.userId && h.performedBy) list[h.userId] = h.performedBy;
      });
      // Also include current assignedToId for backward compat
      if (sub.assignedToId && sub.assignedTo) {
        list[sub.assignedToId] = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
      }
    });
    return Object.entries(list).map(([id, name]) => ({ id, name }));
  }, [submissions]);

  const toggleOfficer = (id: string) => {
    setSelectedOfficers(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const resetFilters = () => {
    setSelectedOfficers([]);
    setReportDataActive(false);
    setSubmissions([]);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary text-white rounded-lg shadow-lg"><TrendingUp className="w-6 h-6" /></div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Officer Productivity</h1>
            <p className="text-muted-foreground text-lg">Institutional matrix for monitoring KYC Officer throughput and accuracy.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!reportDataActive}>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Officers
                {selectedOfficers.length > 0 && <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold">{selectedOfficers.length}</Badge>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Review Personnel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {OFFICER_LIST.map((officer) => (
                <DropdownMenuCheckboxItem key={officer.id} checked={selectedOfficers.includes(officer.id)} onCheckedChange={() => toggleOfficer(officer.id)}>
                  {officer.name}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSelectedOfficers([])} className="text-destructive font-bold cursor-pointer">Clear Selections</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            className="gap-2 h-10 px-6 bg-slate-900 text-white font-bold shadow-lg" 
            onClick={() => toast({ title: "Exporting spreadsheet..." })}
            disabled={!reportDataActive}
          >
            <FileDown className="w-4 h-4" /> Export XLSX
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
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upto Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!reportDataActive ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <ShieldCheck className="w-12 h-12 text-slate-300" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <p className="font-bold text-slate-900 text-xl">Productivity Analysis Inactive</p>
              <p className="text-sm text-slate-500 font-medium">
                Initialize the audit to aggregate real-time metrics for officers who have reviewed cases in the specified timeframe.
              </p>
            </div>
            <Button 
              size="lg" 
              className="px-12 h-14 bg-primary text-white font-black text-lg shadow-xl" 
              onClick={handleGenerateReport}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <UserCheck className="w-5 h-5 mr-2" />}
              Run Officer Audit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Cases Actioned</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-4xl font-extrabold text-slate-900">{performanceMatrix.reduce((acc, o) => acc + o.total, 0)}</span>
                <History className="w-6 h-6 text-primary opacity-20" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Avg Decision Accuracy</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-4xl font-extrabold text-emerald-600">
                  {performanceMatrix.length > 0 ? Math.round(performanceMatrix.reduce((acc, o) => acc + o.accuracy, 0) / performanceMatrix.length) : 0}%
                </span>
                <CheckCircle2 className="w-6 h-6 text-emerald-600 opacity-20" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 border-l-4 border-l-orange-500">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Amendments Issued</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-4xl font-extrabold text-orange-600">{performanceMatrix.reduce((acc, o) => acc + o.amended, 0)}</span>
                <Clock className="w-6 h-6 text-orange-600 opacity-20" />
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
            <CardHeader className="border-b bg-slate-50/30 p-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 font-headline">
                  <LayoutList className="w-5 h-5 text-primary" /> Officer Performance Matrix
                </CardTitle>
                <CardDescription>Comparative accuracy and resolution data for KYC Officers.</CardDescription>
              </div>
              <Button variant="ghost" onClick={resetFilters} className="text-xs font-bold text-muted-foreground uppercase">New Search</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-black py-5 pl-8 text-slate-500 text-[11px] uppercase">Officer Name</TableHead>
                    <TableHead className="font-black py-5 text-slate-500 text-[11px] uppercase text-center">Total Reviews</TableHead>
                    <TableHead className="font-black py-5 text-emerald-600 text-[11px] uppercase text-center">Authorized</TableHead>
                    <TableHead className="font-black py-5 text-orange-600 text-[11px] uppercase text-center">Amended</TableHead>
                    <TableHead className="text-right font-black py-5 pr-8 text-slate-500 text-[11px] uppercase">Accuracy Index</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceMatrix.map((officer) => (
                    <TableRow key={officer.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-black text-slate-900 py-6 pl-8">{officer.name}</TableCell>
                      <TableCell className="text-center font-bold">{officer.total}</TableCell>
                      <TableCell className="text-center text-emerald-600 font-bold">{officer.approved}</TableCell>
                      <TableCell className="text-center text-orange-600 font-bold">{officer.amended}</TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] font-black uppercase tracking-widest", getPerformanceLabel(officer.accuracy).color)}>
                              {getPerformanceLabel(officer.accuracy).label}
                            </span>
                            <span className="font-black text-primary text-sm">{officer.accuracy}%</span>
                          </div>
                          <Progress value={officer.accuracy} className="w-24 h-1.5 bg-slate-100" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {performanceMatrix.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic">No review data found for selected criteria.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
