"use client"

import { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth";
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
  ShieldCheck,
  Zap,
  Target,
  ArrowUpRight,
  ShieldAlert,
  Clock,
  CheckCircle2
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
import { subDays, format } from "date-fns"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getSubmissions } from "@/actions/submissions"
import { getDistricts } from "@/actions/hierarchy"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
      toast({ variant: "destructive", title: "Sync Failed", description: "Database connection lost." });
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const stats = {
      total: submissions.length,
      approved: submissions.filter(s => s.status === 'APPROVED').length,
      pending: submissions.filter(s => ['SUBMITTED', 'IN_REVIEW'].includes(s.status)).length,
      amended: submissions.filter(s => s.status === 'ACTION_REQUIRED').length,
      byBranch: {} as Record<string, { total: number, approved: number, pending: number, amended: number }>
    };

    submissions.forEach(sub => {
      const bName = sub.branchName || 'Unmapped Node';
      if (!stats.byBranch[bName]) stats.byBranch[bName] = { total: 0, approved: 0, pending: 0, amended: 0 };
      stats.byBranch[bName].total++;
      if (sub.status === 'APPROVED') stats.byBranch[bName].approved++;
      if (sub.status === 'ACTION_REQUIRED') stats.byBranch[bName].amended++;
      if (['SUBMITTED', 'IN_REVIEW'].includes(sub.status)) stats.byBranch[bName].pending++;
    });

    return stats;
  }, [submissions]);

  const branchCount = Object.keys(analytics.byBranch).length;

  if ((loading || permissionsLoading) && submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Querying Regional Command...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl"><BarChart3 className="w-8 h-8" /></div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {activeDistrict ? `${activeDistrict} Regional Command` : 'District Monitoring'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground text-lg font-medium">Monitoring for regional branch.</p>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black px-3 py-1">
                {branchCount} Authorized Branch
              </Badge>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 font-bold h-12 px-6 border-slate-200 shadow-sm bg-white rounded-xl">
                  <Globe className="w-4 h-4 text-primary" /> {selectedDistrict === 'all' ? 'All Regions' : selectedDistrict}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-2xl">
                <DropdownMenuItem onClick={() => setSelectedDistrict('all')} className="font-bold">All Regions (Global)</DropdownMenuItem>
                {districts.map(d => <DropdownMenuItem key={d.id} onClick={() => setSelectedDistrict(d.name)} className="font-medium">{d.name} District</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl" onClick={() => toast({ title: "Compiling..." })}>
            <FileDown className="w-5 h-5" /> Export Command Deck
          </Button>
        </div>
      </div>

      {activeDistrict && !isAdmin && (
        <Alert className="bg-primary/5 border-primary/20 text-primary-foreground shadow-lg rounded-2xl border-l-4 border-l-primary animate-in slide-in-from-left duration-500">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <AlertDescription className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-3">
            Authorized Jurisdiction: <Badge className="bg-primary text-white font-black px-4">{activeDistrict}</Badge> Command engaged
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 flex flex-row justify-between items-center bg-slate-50/50">
            Regional Volume <Inbox className="w-3 h-3 text-slate-300" />
          </CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-slate-900 tracking-tighter">{analytics.total}</span>
            <div className="p-2 bg-slate-50 rounded-lg"><TrendingUp className="w-4 h-4 text-slate-400" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600 bg-slate-50/50">
            Successfully Authorized
          </CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-emerald-600 tracking-tighter">{analytics.approved}</span>
            <div className="p-2 bg-emerald-50 rounded-lg"><ShieldCheck className="w-4 h-4 text-emerald-600" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600 bg-slate-50/50">
            Methodology Gaps
          </CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-orange-600 tracking-tighter">{analytics.amended}</span>
            <div className="p-2 bg-orange-50 rounded-lg"><ShieldAlert className="w-4 h-4 text-orange-600" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary bg-white overflow-hidden rounded-2xl">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-primary bg-slate-50/50">
            Specialist Analysis
          </CardHeader>
          <CardContent className="pt-4 flex items-end justify-between">
            <span className="text-5xl font-black text-primary tracking-tighter">{analytics.pending}</span>
            <div className="p-2 bg-primary/5 rounded-lg"><Zap className="w-4 h-4 text-primary" /></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-2xl border-slate-200 overflow-hidden bg-white rounded-3xl">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between p-6">
            <div>
              <CardTitle className="text-xl flex items-center gap-3 font-headline text-slate-900">
                <LayoutGrid className="w-5 h-5 text-primary" /> Branch Throughput Matrix
              </CardTitle>
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Comparative efficiency metrics across regional branch.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Branch</TableHead>
                  <TableHead className="font-black text-center text-[11px] uppercase tracking-widest text-slate-500">Case Volume</TableHead>
                  <TableHead className="font-black text-center text-emerald-600 text-[11px] uppercase tracking-widest">Authorized</TableHead>
                  <TableHead className="font-black text-right pr-8 text-[11px] uppercase tracking-widest w-[180px] text-slate-500">Efficiency Index</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchCount === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-24 text-center italic text-slate-400 bg-slate-50/30">
                      No branch data discovered for this analysis period.
                    </TableCell>
                  </TableRow>
                ) : Object.entries(analytics.byBranch).map(([name, data]) => {
                  const efficiency = Math.round((data.approved / (data.total - data.pending || 1)) * 100);
                  return (
                    <TableRow key={name} className="hover:bg-slate-50 transition-colors group">
                      <TableCell className="font-bold py-6 pl-8 text-slate-900 flex items-center gap-3">
                        <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-all">
                          <Building2 className="w-5 h-5" />
                        </div>
                        {name}
                      </TableCell>
                      <TableCell className="text-center font-black text-lg text-slate-700">{data.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-black px-4 py-1 rounded-lg">
                          {data.approved}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-black text-base",
                              efficiency >= 90 ? "text-emerald-600" : efficiency >= 70 ? "text-primary" : "text-orange-600"
                            )}>{efficiency}%</span>
                            <ArrowUpRight className="w-3 h-3 text-slate-300" />
                          </div>
                          <Progress value={efficiency} className={cn(
                            "w-full h-1.5 bg-slate-100",
                            efficiency >= 90 ? "[&>div]:bg-emerald-500" : efficiency >= 70 ? "[&>div]:bg-primary" : "[&>div]:bg-orange-500"
                          )} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="bg-primary p-6 border-b">
              <CardTitle className="text-white text-lg font-black uppercase tracking-widest flex items-center gap-2">
                <Target className="w-5 h-5 text-white" /> Regional Pulse
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Analysis Period</span>
                  <Badge variant="outline" className="font-bold text-[9px] bg-white border-slate-200">
                    {format(new Date(fromDate), 'MMM dd')} - {format(new Date(toDate), 'MMM dd')}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Overall Accuracy</span>
                    <span>{analytics.total > 0 ? Math.round((analytics.approved / analytics.total) * 100) : 0}%</span>
                  </div>
                  <Progress value={analytics.total > 0 ? (analytics.approved / analytics.total) * 100 : 0} className="h-2 bg-white" />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Alert Console</Label>
                {analytics.amended > 5 ? (
                  <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 flex gap-3 animate-pulse">
                    <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0" />
                    <p className="text-[10px] text-orange-800 font-bold leading-relaxed uppercase">
                      High Methodology Gaps detected in the region. Specialist intervention recommended for local branch training.
                    </p>
                  </div>
                ) : branchCount > 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <p className="text-[10px] text-emerald-800 font-bold leading-relaxed uppercase">
                      Regional compliance levels are within authorized safety parameters. Maintain standard oversight.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-3">
                    <Zap className="w-5 h-5 text-blue-600 shrink-0" />
                    <p className="text-[10px] text-blue-800 font-bold leading-relaxed uppercase">
                      Standby. Waiting for regional data aggregation.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-slate-200 overflow-hidden bg-primary/5 rounded-3xl">
            <CardHeader className="p-6 border-b border-primary/10">
              <CardTitle className="text-primary text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Clock className="w-4 h-4" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period Start</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-11 font-bold bg-white rounded-xl border-slate-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period Conclusion</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-11 font-bold bg-white rounded-xl border-slate-200" />
              </div>
              <Button onClick={loadData} className="w-full h-14 bg-primary text-white font-black rounded-xl shadow-xl shadow-primary/20 mt-2 hover:bg-primary/90 transition-all active:scale-[0.95]">
                Refresh Command Deck
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
