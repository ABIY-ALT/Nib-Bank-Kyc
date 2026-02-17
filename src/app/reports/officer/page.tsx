
"use client"

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth-mock";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
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
  ShieldCheck
} from "lucide-react";
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
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";

export default function OfficerReportsPage() {
  const { user } = useAuth();
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
      const data = await getSubmissions({
        startDate: fromDate,
        endDate: toDate
      });
      setSubmissions(data);
      setReportDataActive(true);
      toast({
        title: "Staff Audit Complete",
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
    
    // Aggregate by reviewer (assignedToId)
    submissions.forEach(sub => {
      const officerName = sub.assignedTo ? `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}` : "Unassigned";
      const officerId = sub.assignedToId || "unassigned";
      
      if (!matrix[officerId]) {
        matrix[officerId] = { 
          id: officerId, 
          name: officerName, 
          total: 0, 
          approved: 0, 
          amended: 0, 
          rejected: 0 
        };
      }
      
      matrix[officerId].total++;
      if (sub.status === 'APPROVED') matrix[officerId].approved++;
      if (sub.status === 'ACTION_REQUIRED' || sub.status === 'AMENDED') matrix[officerId].amended++;
      if (sub.status === 'REJECTED') matrix[officerId].rejected++;
    });

    return Object.values(matrix)
      .map(o => ({
        ...o,
        accuracy: o.total > 0 ? Math.round((o.approved / o.total) * 100) : 0
      }))
      .filter(o => selectedOfficers.length === 0 || selectedOfficers.includes(o.id))
      .sort((a, b) => b.total - a.total);
  }, [submissions, selectedOfficers]);

  const OFFICER_LIST = useMemo(() => {
    const list: Record<string, string> = {};
    submissions.forEach(sub => {
      if (sub.assignedToId) {
        list[sub.assignedToId] = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
      }
    });
    return Object.entries(list).map(([id, name]) => ({ id, name }));
  }, [submissions]);

  const handleExportXLSX = () => {
    toast({ title: "Exporting spreadsheet..." });
  };

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
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Staff Productivity Reports</h1>
            <p className="text-muted-foreground text-lg">Audit staff throughput and decision accuracy across institutional nodes.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!reportDataActive}>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Specialists
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
            className="gap-2 h-10 px-6 bg-[#B89334] hover:bg-[#A6822D] text-white font-bold shadow-sm" 
            onClick={handleExportXLSX}
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
              <p className="font-bold text-slate-900 text-xl">Audit Analysis Inactive</p>
              <p className="text-sm text-slate-500 font-medium">
                Generate a staff productivity report to aggregate resolution and accuracy metrics for your specialized verification team.
              </p>
            </div>
            <Button 
              size="lg" 
              className="px-12 h-14 bg-[#B89334] hover:bg-[#A6822D] text-white font-black text-lg shadow-xl" 
              onClick={handleGenerateReport}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Initialize Audit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Total Reviewed</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-4xl font-extrabold text-slate-900">{performanceMatrix.reduce((acc, o) => acc + o.total, 0)}</span>
                <History className="w-6 h-6 text-primary opacity-20" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-600">Avg Accuracy</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-4xl font-extrabold text-emerald-600">
                  {performanceMatrix.length > 0 ? Math.round(performanceMatrix.reduce((acc, o) => acc + o.accuracy, 0) / performanceMatrix.length) : 0}%
                </span>
                <CheckCircle2 className="w-6 h-6 text-emerald-600 opacity-20" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 border-l-4 border-l-orange-500">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-widest text-orange-600">Amendments</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-4xl font-extrabold text-orange-600">{performanceMatrix.reduce((acc, o) => acc + o.amended, 0)}</span>
                <Clock className="w-6 h-6 text-orange-600 opacity-20" />
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
            <CardHeader className="border-b bg-slate-50/30 p-6 flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold flex items-center gap-2 font-headline">
                <Users className="w-5 h-5 text-primary" /> Specialist Performance Matrix
              </CardTitle>
              <Button variant="ghost" onClick={resetFilters} className="text-xs font-bold text-muted-foreground uppercase">New Audit</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-black py-5 pl-8 text-slate-500 text-[11px] uppercase">Specialist Name</TableHead>
                    <TableHead className="font-black py-5 text-slate-500 text-[11px] uppercase text-center">Cases</TableHead>
                    <TableHead className="font-black py-5 text-emerald-600 text-[11px] uppercase text-center">Approved</TableHead>
                    <TableHead className="font-black py-5 text-orange-600 text-[11px] uppercase text-center">Amended</TableHead>
                    <TableHead className="text-right font-black py-5 pr-8 text-slate-500 text-[11px] uppercase">Accuracy</TableHead>
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
                        <Badge variant="secondary" className="bg-primary/5 text-primary font-black px-4 py-1">
                          {officer.accuracy}%
                        </Badge>
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
