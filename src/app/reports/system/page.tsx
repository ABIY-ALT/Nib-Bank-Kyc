
'use client';

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
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
  Globe, 
  ShieldCheck,
  Building2,
  FileDown,
  Loader2,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSubmissions } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

export default function SystemWideReportsPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [stats, setStats] = useState<{ total: number; approved: number; pending: number; unseen: number; accuracy: string; branches: { name: string; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportDataActive, setReportDataActive] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      let filters: any = {};
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const data = await getSubmissions(filters);
      setReportDataActive(true);

      if (!data || data.length === 0) {
        setSubmissions([]);
        setStats(null);
        return;
      }

      setSubmissions(data);

      // All figures derive from the same record set so the cards, the accuracy
      // index, and the Branch Network throughput always reconcile exactly.
      const approved = data.filter((s: any) => s.status === KYC_STATUS.APPROVED).length;
      const actionRequired = data.filter((s: any) => s.status === KYC_STATUS.ACTION_REQUIRED).length;
      const unseen = data.filter((s: any) => s.status === KYC_STATUS.SUBMITTED).length;
      const pending = data.filter((s: any) => [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(s.status)).length;
      const decided = approved + actionRequired;

      const branches = data.reduce((acc: Record<string, number>, sub: any) => {
        const name = sub.branchName || 'Unknown Branch';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setStats({
        total: data.length,
        approved,
        pending,
        unseen,
        // Accuracy = authorized share of all decided cases (authorized + amendments).
        accuracy: decided > 0 ? ((approved / decided) * 100).toFixed(1) : '0.0',
        branches: Object.entries(branches).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
      });
      toast({
        title: "Compliance Report Ready",
        description: `Analyzed ${data.length} system-wide records.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Report Generation Failed" });
    } finally {
      setLoading(false);
    }
  };

  const computedStats = useMemo(() => {
    if (!stats) return null;
    return stats;
  }, [stats]);

  const handleExportCSV = () => {
    if (!stats) return;
    const headers = ['Category', 'Value'];
    const dataRows = [['Total Volume', stats.total], ['Approvals', stats.approved], ['Unseen', stats.unseen], ['Accuracy (%)', stats.accuracy]];
    stats.branches.forEach(b => dataRows.push([`Branch: ${b.name}`, b.count]));
    const csvContent = [headers.join(','), ...dataRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-system-compliance-report.csv`);
    link.click();
    toast({ title: "Report Export Successful" });
  };

  const resetFilters = () => {
    setReportDataActive(false);
    setSubmissions([]);
    setStats(null);
    setDateRange(undefined);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg"><Globe className="w-6 h-6 text-white" /></div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System-wide Compliance</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Master institutional oversight of all branches and specialized staff.</p>
        </div>
        <div className="flex gap-2">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <Button variant="outline" className="gap-2 h-12 px-6 border-slate-200 bg-white" onClick={resetFilters}><RotateCcw className="w-4 h-4" /> Reset</Button>
          <Button className="gap-2 bg-primary shadow-xl font-bold h-12 px-6 text-white rounded-xl" onClick={handleGenerateReport} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Generate Compliance Report</Button>
        </div>
      </div>

      {!reportDataActive ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 shadow-inner rounded-[2.5rem]">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-8">
            <div className="p-8 bg-white rounded-full shadow-2xl border border-slate-100"><Globe className="w-16 h-16 text-primary" /></div>
            <div className="max-w-md mx-auto space-y-3"><p className="font-extrabold text-slate-900 text-2xl tracking-tight">Compliance Report Standby</p><p className="text-slate-500 leading-relaxed font-medium">Run the system-wide report to aggregate real-time case data across all branches and specialized staff.</p></div>
            <Button size="lg" className="px-12 h-14 font-extrabold text-lg shadow-2xl shadow-primary/20 text-white bg-primary rounded-xl" onClick={handleGenerateReport} disabled={loading}>{loading ? "Building Report..." : "Generate System Report"}</Button>
          </CardContent>
        </Card>
      ) : !stats ? (
        <Card className="border border-slate-200 bg-white shadow-lg rounded-[2rem]">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="p-5 bg-slate-50 rounded-full border border-slate-100">
              <Globe className="w-10 h-10 text-primary" />
            </div>
            <div className="max-w-lg space-y-2">
              <p className="text-2xl font-extrabold tracking-tight text-slate-900">No records found for this report</p>
              <p className="text-slate-500 font-medium">Try a different date range or reset the filters to generate a broader system-wide compliance report.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card className="bg-primary text-white shadow-2xl rounded-2xl overflow-hidden border-none"><CardHeader className="pb-2 bg-white/10"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/80">Total Volume</CardTitle></CardHeader><CardContent className="pt-4"><span className="text-5xl font-black text-white tracking-tighter">{stats.total}</span></CardContent></Card>
             <Card className="shadow-lg border-slate-200 rounded-2xl bg-white overflow-hidden"><CardHeader className="pb-2 bg-slate-50"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Total Approvals</CardTitle></CardHeader><CardContent className="pt-4"><span className="text-5xl font-black text-emerald-600 tracking-tighter">{computedStats?.approved ?? 0}</span></CardContent></Card>
             <Card className="shadow-lg border-slate-200 rounded-2xl bg-white overflow-hidden"><CardHeader className="pb-2 bg-slate-50"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Unseen Review</CardTitle></CardHeader><CardContent className="pt-4"><span className="text-5xl font-black text-orange-600 tracking-tighter">{computedStats?.unseen ?? 0}</span></CardContent></Card>
             <Card className="shadow-lg border-slate-200 rounded-2xl bg-white overflow-hidden"><CardHeader className="pb-2 bg-slate-50"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Accuracy Index</CardTitle></CardHeader><CardContent className="pt-4"><span className="text-5xl font-black text-primary tracking-tighter">{computedStats?.accuracy ?? '0.0'}%</span></CardContent></Card>
          </div>
          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="bg-primary text-white border-b p-6 flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-black flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg"><Building2 className="w-5 h-5 text-white" /></div>
                Branch Network
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleExportCSV} className="text-white font-bold hover:bg-white/10 h-10 px-4">
                <FileDown className="w-4 h-4 mr-2" /> Export Summary
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Jurisdiction Branch</TableHead>
                    <TableHead className="font-black text-right pr-8 text-[11px] uppercase tracking-widest text-slate-500">Throughput</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.branches.map((branch) => (
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
        </div>
      )}
    </div>
  );
}
