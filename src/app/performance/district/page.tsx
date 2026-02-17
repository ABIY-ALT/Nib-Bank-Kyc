
"use client"

import { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-mock";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from "@/components/ui/card"
import { 
  BarChart3, 
  FileDown,
  Globe,
  Loader2,
  Inbox,
  ShieldCheck,
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  LayoutGrid
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSubmissions } from "@/actions/submissions";
import { getDistricts } from "@/actions/hierarchy";
import { Progress } from "@/components/ui/progress";

export default function DistrictPerformancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isDistDir = user?.role === 'DISTRICT_DIRECTOR';
  
  const activeDistrict = isDistDir ? user.districtName : (selectedDistrict === 'all' ? null : selectedDistrict);

  useEffect(() => {
    async function loadInitial() {
      if (isDistDir && user.districtName) {
        setSelectedDistrict(user.districtName);
      }
      await loadData();
    }
    loadInitial();
  }, [user, isDistDir, fromDate, toDate, selectedDistrict]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subs, dists] = await Promise.all([
        getSubmissions({
          startDate: fromDate,
          endDate: toDate,
          district: activeDistrict || undefined
        }),
        isAdmin ? getDistricts() : Promise.resolve([])
      ]);
      setSubmissions(subs);
      setDistricts(dists);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const stats = {
      total: submissions.length,
      approved: submissions.filter(s => ['ACTIVE', 'GOVERNANCE_APPROVED'].includes(s.status)).length,
      pending: submissions.filter(s => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(s.status)).length,
      amended: submissions.filter(s => ['ACTION_REQUIRED'].includes(s.status)).length,
      byBranch: {} as Record<string, { total: number, approved: number, pending: number, amended: number }>
    };

    submissions.forEach(sub => {
      const bName = sub.branch?.name || 'Unmapped Node';
      if (!stats.byBranch[bName]) stats.byBranch[bName] = { total: 0, approved: 0, pending: 0, amended: 0 };
      stats.byBranch[bName].total++;
      if (['ACTIVE', 'GOVERNANCE_APPROVED'].includes(sub.status)) stats.byBranch[bName].approved++;
      if (sub.status === 'ACTION_REQUIRED') stats.byBranch[bName].amended++;
      if (['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(sub.status)) stats.byBranch[bName].pending++;
    });

    return stats;
  }, [submissions]);

  if (loading && submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Querying Regional Command...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary text-white rounded-lg shadow-lg"><BarChart3 className="w-6 h-6" /></div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {activeDistrict ? `${activeDistrict} District Command` : 'Global Network Oversight'}
            </h1>
            <p className="text-muted-foreground text-lg font-medium">Relational health monitoring for regional branches.</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 font-bold h-11 px-6 border-slate-200 shadow-sm bg-white">
                  <Globe className="w-4 h-4 text-primary" /> {selectedDistrict === 'all' ? 'All Regions' : selectedDistrict}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setSelectedDistrict('all')}>All Regions (Global)</DropdownMenuItem>
                {districts.map(d => <DropdownMenuItem key={d.id} onClick={() => setSelectedDistrict(d.name)}>{d.name} District</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button className="gap-2 h-11 px-6 bg-slate-900 font-bold shadow-lg" onClick={() => toast({ title: "Exporting Command Dataset..." })}>
            <FileDown className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis Start Date</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis End Date</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 flex flex-row justify-between items-center">
            Regional Volume <Inbox className="w-3 h-3 text-slate-300" />
          </CardHeader>
          <CardContent className="text-4xl font-black text-slate-900">{analytics.total}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600">Total Approvals</CardHeader>
          <CardContent className="text-4xl font-black text-emerald-600">{analytics.approved}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600">Action Required</CardHeader>
          <CardContent className="text-4xl font-black text-orange-600">{analytics.amended}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-primary">In Review</CardHeader>
          <CardContent className="text-4xl font-black text-primary">{analytics.pending}</CardContent>
        </Card>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-primary" /> Branch Throughput Matrix
            </CardTitle>
            <CardDescription>Efficiency and volume comparison across regional branch nodes.</CardDescription>
          </div>
          {activeDistrict && (
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold px-4 py-1">
              <Building2 className="w-3 h-3 mr-2" /> {activeDistrict} Control
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="font-black py-4 pl-8 text-[11px] uppercase tracking-widest">Branch Node</TableHead>
                <TableHead className="font-black text-center text-[11px] uppercase tracking-widest">Total Volume</TableHead>
                <TableHead className="font-black text-center text-emerald-600 text-[11px] uppercase tracking-widest">Approved</TableHead>
                <TableHead className="font-black text-center text-orange-600 text-[11px] uppercase tracking-widest">Amended</TableHead>
                <TableHead className="font-black text-right pr-8 text-[11px] uppercase tracking-widest">Efficiency Index</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(analytics.byBranch).length > 0 ? (
                Object.entries(analytics.byBranch).map(([name, data]) => {
                  const efficiency = Math.round((data.approved / (data.total - data.pending || 1)) * 100);
                  return (
                    <TableRow key={name} className="hover:bg-slate-50 transition-colors group">
                      <TableCell className="font-bold py-6 pl-8 text-slate-900">{name}</TableCell>
                      <TableCell className="text-center font-bold">{data.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold px-3">{data.approved}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-bold px-3">{data.amended}</Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="font-black text-primary text-sm">{efficiency}%</span>
                          <Progress value={efficiency} className="w-24 h-1 bg-slate-100" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-24 text-center text-muted-foreground italic bg-slate-50/30">
                    <div className="flex flex-col items-center gap-3">
                      <TrendingUp className="w-12 h-12 text-slate-200" />
                      <p>No operational data discovered for this regional scope and timeframe.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
