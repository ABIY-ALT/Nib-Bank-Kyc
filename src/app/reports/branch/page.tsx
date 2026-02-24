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
  Calendar as CalendarIcon,
  Search,
  Building2,
  Map,
  Loader2,
  CheckCircle2,
  Clock,
  ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-mock";
import { getSubmissions } from "@/actions/submissions";
import { getDistricts, getBranches } from "@/actions/hierarchy";
import { subDays, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KYCStatus } from "@prisma/client";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function BranchReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Filter States
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const isDistDir = user?.roles?.some(ur => ur.role.name === 'DISTRICT_DIRECTOR');
  const activeDistrict = isDistDir ? user?.districtName : (selectedDistrict === 'all' ? undefined : selectedDistrict);

  useEffect(() => {
    async function loadConfig() {
      setInitializing(true);
      try {
        const [d, b] = await Promise.all([getDistricts(), getBranches()]);
        setDistricts(d);
        setBranches(b);
        
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
      const data = await getSubmissions({
        district: activeDistrict || undefined,
        branch: selectedBranch === 'all' ? undefined : selectedBranch,
        startDate: fromDate,
        endDate: toDate
      });
      setReportData(data);
      toast({
        title: "Report Generated",
        description: `Retrieved ${data.length} records from the archive.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Query Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!reportData || reportData.length === 0) return;
    
    const headers = ['Case ID', 'Customer', 'Branch', 'Status', 'Date'];
    const csvContent = [
      headers.join(','),
      ...reportData.map(record => 
        [record.id, record.customerName, record.branchName, record.status, format(new Date(record.submittedAt), 'yyyy-MM-dd')].map(val => `"${val}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `nib-compliance-report-${format(new Date(), 'yyyyMMdd')}.csv`);
    link.click();
    toast({ title: "Export Successful" });
  };

  if (initializing) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Syncing Audit Parameters...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Compliance Reporting</h1>
          <p className="text-muted-foreground text-lg font-medium">Audit-ready historical data for regulatory reporting and institutional verification.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-11 px-6 font-bold border-slate-200 bg-white" onClick={() => { setReportData(null); setSelectedDistrict(isDistDir ? user?.districtName || "all" : "all"); setSelectedBranch("all"); }}>
            <Filter className="w-4 h-4" /> Reset
          </Button>
          <Button 
            className="gap-2 bg-primary hover:bg-primary/90 h-11 px-6 font-bold shadow-lg" 
            disabled={!reportData || reportData.length === 0}
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4" /> Export Report
          </Button>
        </div>
      </div>

      {isDistDir && user?.districtName && (
        <Alert className="bg-primary/5 border-primary/20 text-primary-foreground shadow-sm">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
            Regional Audit Mode: Locked to <Badge className="bg-primary text-white font-black">{user.districtName} District</Badge>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-xl flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" /> Audit Parameters
          </CardTitle>
          <CardDescription>Configure the scope for regulatory data aggregation.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Map className="w-3 h-3" /> Regional District
              </Label>
              <Select 
                value={selectedDistrict} 
                onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("all"); }}
                disabled={isDistDir}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="All Districts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts</SelectItem>
                  {districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="w-3 h-3" /> Specific Branch
              </Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {filteredBranches.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">From Date</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">To Date</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button size="lg" className="px-12 h-14 font-black gap-2 shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90" onClick={handleGenerateReport} disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
              Compile Audit Trail
            </Button>
          </div>
        </CardContent>
      </Card>

      {reportData && (
        <Card className="border-slate-200 shadow-xl animate-in slide-in-from-top-4 duration-500 overflow-hidden">
          <CardHeader className="bg-slate-900 text-white rounded-t-lg p-6">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">Audit Archive: {selectedDistrict === 'all' ? 'Global' : selectedDistrict} / {selectedBranch === 'all' ? 'All Nodes' : selectedBranch}</CardTitle>
                <p className="text-slate-400 text-sm mt-1 font-medium italic">Validated for regulatory standards on {format(new Date(), 'dd/MM/yyyy')}</p>
              </div>
              <Badge variant="outline" className="bg-primary/20 text-white border-primary/40 font-black px-4 h-8">
                {reportData.length} Validated Records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-black py-4 pl-8 text-[11px] uppercase tracking-widest">Case ID</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest">Customer Details</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest">Originating Node</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-center">Workflow Status</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-right pr-8">Review Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-20 text-center text-muted-foreground font-medium italic">
                        No historical records discovered for this criteria.
                      </TableCell>
                    </TableRow>
                  ) : reportData.map((sub) => (
                    <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors border-b">
                      <TableCell className="font-bold text-primary tabular-nums pl-8">{sub.id}</TableCell>
                      <TableCell className="font-bold text-slate-900">{sub.customerName}</TableCell>
                      <TableCell className="font-medium text-slate-600">
                        <div className="flex flex-col">
                          <span className="font-bold">{sub.branchName}</span>
                          <span className="text-[9px] uppercase font-black text-slate-400">{sub.districtName} District</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={sub.status === 'APPROVED' ? 'default' : 'outline'} className={sub.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 font-bold' : 'font-bold'}>
                          {sub.status === 'APPROVED' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-bold tabular-nums text-right pr-8">
                        {format(new Date(sub.submittedAt), 'MMM dd, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
