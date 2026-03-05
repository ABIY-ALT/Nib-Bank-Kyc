
'use client';

import { useState, useMemo } from "react";
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
  Download, 
  Globe, 
  History,
  ShieldCheck,
  Building2,
  Users,
  Calendar as CalendarIcon,
  FileDown,
  Loader2,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { KYCStatus } from "@prisma/client";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";

export default function SystemWideReportsPage() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportDataActive, setReportDataActive] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const handleGenerateReport = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast({ variant: "destructive", title: "Range Required" });
      return;
    }
    setLoading(true);
    try {
      const data = await getSubmissions({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        limit: 5000 // Large limit for global audit
      });
      setSubmissions(data);
      setReportDataActive(true);
      toast({
        title: "Institutional Audit Complete",
        description: `Analyzed ${data.length} system-wide records.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Aggregation Failed" });
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (!submissions.length) return null;

    const total = submissions.length;
    const approved = submissions.filter(s => s.status === KYCStatus.APPROVED).length;
    const pending = submissions.filter(s => [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(s.status)).length;
    const accuracy = total > 0 ? ((approved / (total - pending || 1)) * 100).toFixed(1) : "0.0";

    const branchMap: Record<string, number> = {};
    const officerMap: Record<string, number> = {};

    submissions.forEach(sub => {
      const bName = sub.branchName || "Unknown Node";
      branchMap[bName] = (branchMap[bName] || 0) + 1;

      if (sub.assignedTo) {
        const oName = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
        officerMap[oName] = (officerMap[oName] || 0) + 1;
      }
    });

    const branches = Object.entries(branchMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const officers = Object.entries(officerMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { total, approved, pending, accuracy, branches, officers };
  }, [submissions]);

  const handleExportCSV = () => {
    if (!stats) return;
    
    const headers = ['Category', 'Value'];
    const dataRows = [
      ['Total Volume', stats.total],
      ['Approvals', stats.approved],
      ['Pending', stats.pending],
      ['Accuracy (%)', stats.accuracy]
    ];
    
    stats.branches.forEach(b => dataRows.push([`Branch: ${b.name}`, b.count]));
    stats.officers.forEach(o => dataRows.push([`Officer: ${o.name}`, o.count]));
    
    const csvContent = [headers.join(','), ...dataRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-global-audit-export.csv`);
    link.click();
    
    toast({ title: "CSV Export Successful" });
  };

  const resetFilters = () => {
    setReportDataActive(false);
    setSubmissions([]);
    setDateRange({ from: subDays(new Date(), 30), to: new Date() });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System-wide Compliance</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Master institutional oversight of all branches and specialized staff.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-11 px-6 border-slate-200 bg-white" onClick={resetFilters}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary shadow-xl font-bold h-11 px-6 text-white rounded-xl" onClick={handleGenerateReport} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Compile Master Audit
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 w-full">
              <DatePickerWithRange 
                date={dateRange} 
                onDateChange={setDateRange} 
                label="Global Network Timeline" 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!reportDataActive ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 shadow-inner rounded-[2.5rem]">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-8">
            <div className="relative p-8 bg-white rounded-full shadow-2xl border border-slate-100">
              <Globe className="w-16 h-16 text-primary" />
            </div>
            <div className="max-w-md mx-auto space-y-3">
              <p className="font-extrabold text-slate-900 text-2xl tracking-tight">Network Audit Standby</p>
              <p className="text-slate-500 leading-relaxed font-medium">Run the institutional audit to aggregate real-time data across all network nodes from the Vault.</p>
            </div>
            <Button size="lg" className="px-12 h-14 font-extrabold text-lg shadow-2xl shadow-primary/20 text-white bg-primary rounded-xl" onClick={handleGenerateReport} disabled={loading}>
              {loading ? "Aggregating Intelligence..." : "Execute Global Aggregation"}
            </Button>
          </CardContent>
        </Card>
      ) : stats ? (
        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card className="bg-primary text-white shadow-2xl overflow-hidden border-none rounded-2xl">
               <CardHeader className="pb-2 bg-white/10">
                 <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/80">Total Volume</CardTitle>
               </CardHeader>
               <CardContent className="pt-4">
                 <span className="text-5xl font-black text-white tracking-tighter">{stats.total}</span>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200 overflow-hidden bg-white rounded-2xl">
               <CardHeader className="pb-2 bg-slate-50">
                 <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Total Approvals</CardTitle>
               </CardHeader>
               <CardContent className="pt-4">
                 <span className="text-5xl font-black text-emerald-600 tracking-tighter">{stats.approved}</span>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200 overflow-hidden bg-white rounded-2xl">
               <CardHeader className="pb-2 bg-slate-50">
                 <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Pending Review</CardTitle>
               </CardHeader>
               <CardContent className="pt-4">
                 <span className="text-5xl font-black text-orange-600 tracking-tighter">{stats.pending}</span>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200 overflow-hidden bg-white rounded-2xl">
               <CardHeader className="pb-2 bg-slate-50">
                 <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Accuracy Index</CardTitle>
               </CardHeader>
               <CardContent className="pt-4">
                 <span className="text-5xl font-black text-primary tracking-tighter">{stats.accuracy}%</span>
               </CardContent>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
              <CardHeader className="bg-primary text-white border-b p-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-black flex items-center gap-3 text-white">
                  <div className="p-2 bg-white/20 rounded-lg"><Building2 className="w-5 h-5 text-white" /></div>
                  Branch Network
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleExportCSV} className="text-white font-bold hover:bg-white/10 h-10 px-4">
                  <FileDown className="w-4 h-4 mr-2" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Jurisdiction Node</TableHead>
                      <TableHead className="font-black text-right pr-8 text-[11px] uppercase tracking-widest text-slate-500">Throughput</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.branches.length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="py-10 text-center italic text-slate-400">No branch data available.</TableCell></TableRow>
                    ) : stats.branches.map((branch) => (
                      <TableRow key={branch.name} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-bold text-slate-800 py-5 pl-8">{branch.name}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="secondary" className="font-black px-4 py-1.5 bg-primary/5 text-primary border-primary/10">
                            {branch.count} Cases
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
              <CardHeader className="bg-primary text-white border-b p-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-black flex items-center gap-3 text-white">
                  <div className="p-2 bg-white/20 rounded-lg"><Users className="w-5 h-5 text-white" /></div>
                  Specialist Throughput
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleExportCSV} className="text-white font-bold hover:bg-white/10 h-10 px-4">
                  <FileDown className="w-4 h-4 mr-2" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Personnel Name</TableHead>
                      <TableHead className="font-black text-right pr-8 text-[11px] uppercase tracking-widest text-slate-500">Decisions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.officers.length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="py-10 text-center italic text-slate-400">No specialist data available.</TableCell></TableRow>
                    ) : stats.officers.map((officer) => (
                      <TableRow key={officer.name} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-bold text-slate-800 py-5 pl-8">{officer.name}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="outline" className="font-black border-primary/30 text-primary px-4 py-1.5 bg-white shadow-sm">
                            {officer.count} Reviews
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="py-20 text-center text-muted-foreground italic">No data discovered for the selected range.</div>
      )}
    </div>
  );
}
