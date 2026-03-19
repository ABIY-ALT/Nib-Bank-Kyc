'use client';

import { useState, useEffect, useMemo } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Download, 
  Filter, 
  Search,
  Building2,
  Map,
  Loader2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getSubmissions } from "@/actions/submissions";
import { getDistricts, getBranches } from "@/actions/hierarchy";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

export default function BranchReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const isDistDir = user?.roles?.some(ur => ur.role.name === 'DISTRICT_DIRECTOR');
  const activeDistrict = isDistDir ? user?.districtName : (selectedDistrict === 'all' ? undefined : selectedDistrict);

  useEffect(() => {
    async function loadConfig() {
      setInitializing(true);
      try {
        const [d, b] = await Promise.all([getDistricts(), getBranches()]);
        setDistricts(d || []);
        setBranches(b || []);
        
        if (isDistDir && user?.districtName) {
          setSelectedDistrict(user.districtName);
        }
      } catch (e) {
        toast({ variant: "destructive", title: "Config Load Failed" });
      } finally {
        setInitializing(false);
      }
    }
    loadConfig();
  }, [user, isDistDir]);

  const filteredBranches = useMemo(() => {
    if (selectedDistrict === 'all') return branches;
    return branches.filter(b => b.district?.name === selectedDistrict || b.districtName === selectedDistrict);
  }, [branches, selectedDistrict]);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      let filters: any = {
        district: activeDistrict || undefined,
        branch: selectedBranch === 'all' ? undefined : selectedBranch,
        limit: 1000
      };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const data = await getSubmissions(filters);
      setReportData(data || []);
      toast({ title: "Report Generated", description: `Retrieved ${data.length} records.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Query Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!reportData || reportData.length === 0) return;
    const headers = ['Case ID', 'Customer', 'Branch', 'Status', 'Date'];
    const csvContent = [headers.join(','), ...reportData.map(record => [record.id, record.customerName, record.branchName, record.status, format(new Date(record.submittedAt), 'yyyy-MM-dd')].map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-compliance-report-${format(new Date(), 'yyyyMMdd')}.csv`);
    link.click();
    toast({ title: "Export Successful" });
  };

  if (initializing) return <div className="py-40 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Compliance Reporting</h1>
          <p className="text-muted-foreground text-lg font-medium">Audit-ready historical data for regulatory reporting.</p>
        </div>
        <div className="flex gap-2">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <Button variant="outline" className="gap-2 h-12 px-6 border-slate-200 bg-white" onClick={() => { setReportData(null); setSelectedDistrict(isDistDir ? user?.districtName || "all" : "all"); setSelectedBranch("all"); setDateRange(undefined); }}><RotateCcw className="w-4 h-4" /> Reset</Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90 h-12 px-6 font-bold shadow-lg" disabled={!reportData || reportData.length === 0} onClick={handleExportCSV}><Download className="w-4 h-4" /> Export Report</Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden"><CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-xl flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Audit Parameters</CardTitle></CardHeader><CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Map className="w-3 h-3" /> Regional District</Label><Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("all"); }} disabled={isDistDir}><SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="All Districts" /></SelectTrigger><SelectContent><SelectItem value="all">All Districts</SelectItem>{districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Building2 className="w-3 h-3" /> Specific Branch</Label><Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="All Branches" /></SelectTrigger><SelectContent><SelectItem value="all">All Branches</SelectItem>{filteredBranches.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}</SelectContent></Select></div><div className="md:col-span-2 flex justify-end"><Button size="lg" className="px-12 h-14 bg-primary text-white font-black rounded-xl" onClick={handleGenerateReport} disabled={loading}>{loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileText className="w-5 h-5 mr-2" />} Compile Audit Trail</Button></div></CardContent></Card>

      {reportData && (
        <Card className="border-slate-200 shadow-xl overflow-hidden rounded-[2rem] bg-white"><CardHeader className="bg-slate-900 text-white p-8"><div className="flex justify-between items-center"><div><CardTitle className="text-2xl font-bold tracking-tight">Audit Archive: {selectedDistrict === 'all' ? 'Overall' : selectedDistrict}</CardTitle><p className="text-slate-400 text-sm mt-1 font-medium italic">Validated records aggregated on {format(new Date(), 'dd/MM/yyyy')}</p></div><Badge className="bg-primary/20 text-white border-primary/40 font-black px-4 h-8">{reportData.length} Records</Badge></div></CardHeader><CardContent className="p-0"><Table><TableHeader className="bg-slate-50/80"><TableRow><TableHead className="font-black py-4 pl-8 text-[11px] uppercase">Case ID</TableHead><TableHead className="font-black text-[11px] uppercase">Customer</TableHead><TableHead className="font-black text-[11px] uppercase">Branch</TableHead><TableHead className="font-black text-center text-[11px] uppercase">Status</TableHead><TableHead className="font-black text-right pr-8 text-[11px] uppercase">Review Date</TableHead></TableRow></TableHeader><TableBody>{reportData.map((sub) => (<TableRow key={sub.id} className="hover:bg-slate-50 transition-colors border-b"><TableCell className="font-bold text-primary pl-8">{sub.id}</TableCell><TableCell className="font-bold text-slate-900">{sub.customerName}</TableCell><TableCell className="font-medium text-slate-600"><div className="flex flex-col"><span className="font-bold">{sub.branchName}</span><span className="text-[9px] uppercase font-black text-slate-400">{sub.districtName} District</span></div></TableCell><TableCell className="text-center"><Badge className="font-bold">{sub.status}</Badge></TableCell><TableCell className="text-xs text-slate-500 font-bold text-right pr-8">{sub.submittedAt ? format(new Date(sub.submittedAt), 'MMM dd, yyyy') : 'N/A'}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}
