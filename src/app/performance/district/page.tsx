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
  Building2,
  TrendingUp,
  LayoutGrid,
  MapPin,
  ShieldCheck
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
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

export default function DistrictPerformancePage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");

  const isAdmin = isSuperAdmin;
  const isDistDir = hasPermission('REPORT_VIEW_DISTRICT');
  
  const activeDistrict = isDistDir && !isAdmin ? user?.districtName : (selectedDistrict === 'all' ? null : selectedDistrict);

  useEffect(() => {
    async function loadInitial() {
      if (isDistDir && user?.districtName && !isAdmin) {
        setSelectedDistrict(user.districtName);
      }
      await loadData();
    }
    loadInitial();
  }, [user, isAdmin, isDistDir, fromDate, toDate, selectedDistrict]);

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
      approved: submissions.filter(s => ['APPROVED'].includes(s.status)).length,
      pending: submissions.filter(s => ['SUBMITTED', 'IN_REVIEW'].includes(s.status)).length,
      amended: submissions.filter(s => ['ACTION_REQUIRED'].includes(s.status)).length,
      byBranch: {} as Record<string, { total: number, approved: number, pending: number, amended: number }>
    };

    submissions.forEach(sub => {
      const bName = sub.branchName || 'Unmapped Node';
      if (!stats.byBranch[bName]) stats.byBranch[bName] = { total: 0, approved: 0, pending: 0, amended: 0 };
      stats.byBranch[bName].total++;
      if (['APPROVED'].includes(sub.status)) stats.byBranch[bName].approved++;
      if (['ACTION_REQUIRED'].includes(sub.status)) stats.byBranch[bName].amended++;
      if (['SUBMITTED', 'IN_REVIEW'].includes(sub.status)) stats.byBranch[bName].pending++;
    });

    return stats;
  }, [submissions]);

  if ((loading || permissionsLoading) && submissions.length === 0) {
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

      {activeDistrict && !isAdmin && (
        <Alert className="bg-primary/5 border-primary/20 text-primary-foreground shadow-sm">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
            Authorized Jurisdiction: <Badge className="bg-primary text-white font-black">{activeDistrict}</Badge> Command Node Active
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis Start Date</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-11 font-bold" />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis End Date</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-11 font-bold" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all bg-white overflow-hidden">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 flex flex-row justify-between items-center bg-slate-50/50">
            Regional Volume <Inbox className="w-3 h-3 text-slate-300" />
          </CardHeader>
          <CardContent className="pt-4 text-4xl font-black text-slate-900 tracking-tighter">{analytics.total}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600 bg-slate-50/50">
            Total Approvals
          </CardHeader>
          <CardContent className="pt-4 text-4xl font-black text-emerald-600 tracking-tighter">{analytics.approved}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600 bg-slate-50/50">
            Action Required
          </CardHeader>
          <CardContent className="pt-4 text-4xl font-black text-orange-600 tracking-tighter">{analytics.amended}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary bg-white overflow-hidden">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-primary bg-slate-50/50">
            In Review
          </CardHeader>
          <CardContent className="pt-4 text-4xl font-black text-primary tracking-tighter">{analytics.pending}</CardContent>
        </Card>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 font-headline text-slate-900">
              <LayoutGrid className="w-5 h-5 text-primary" /> Branch Throughput Matrix
            </CardTitle>
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Efficiency and volume comparison across regional branch nodes.</CardDescription>
          </div>
          {activeDistrict && (
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold px-4 py-1.5 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> {activeDistrict} Jurisdiction
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest">Branch Node</TableHead>
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
                      <TableCell className="font-bold py-6 pl-8 text-slate-900 flex items-center gap-2">
                        <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                          <Building2 className="w-4 h-4" />
                        </div>
                        {name}
                      </TableCell>
                      <TableCell className="text-center font-bold text-slate-700">{data.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold px-3 py-1">
                          {data.approved}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-bold px-3 py-1">
                          {data.amended}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={cn(
                            "font-black text-sm",
                            efficiency >= 90 ? "text-emerald-600" : efficiency >= 70 ? "text-primary" : "text-orange-600"
                          )}>{efficiency}%</span>
                          <Progress value={efficiency} className="w-24 h-1.5 bg-slate-100" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-32 text-center text-muted-foreground italic bg-slate-50/30">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
                        <TrendingUp className="w-12 h-12 text-slate-200" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-900 text-lg">No Operational Data Discovered</p>
                        <p className="text-sm">Adjust filters or verify jurisdictional activity in SQL Archive.</p>
                      </div>
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

import { Alert, AlertDescription } from "@/components/ui/alert";
