
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
  CheckCircle2,
  RotateCcw
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getSubmissions } from "@/actions/submissions"
import { getDistricts } from "@/actions/hierarchy"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

export default function DistrictPerformancePage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

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
  }, [user, isAdmin, isDistDir, selectedDistrict, dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      let filters: any = {
        district: activeDistrict || undefined,
        limit: 1000
      };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const [subs, dists] = await Promise.all([
        getSubmissions(filters),
        isAdmin ? getDistricts() : Promise.resolve([])
      ]);
      setSubmissions(subs || []);
      setDistricts(dists || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const stats = {
      total: submissions.length,
      approved: submissions.filter(s => s.status === KYC_STATUS.APPROVED).length,
      pending: submissions.filter(s => [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(s.status)).length,
      amended: submissions.filter(s => s.status === KYC_STATUS.ACTION_REQUIRED).length,
      byBranch: {} as Record<string, { total: number, approved: number, pending: number, amended: number }>
    };

    submissions.forEach(sub => {
      const bName = sub.branchName || 'Unmapped Node';
      if (!stats.byBranch[bName]) stats.byBranch[bName] = { total: 0, approved: 0, pending: 0, amended: 0 };
      stats.byBranch[bName].total++;
      if (sub.status === KYC_STATUS.APPROVED) stats.byBranch[bName].approved++;
      if (sub.status === KYC_STATUS.ACTION_REQUIRED) stats.byBranch[bName].amended++;
      if ([KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(sub.status)) stats.byBranch[bName].pending++;
    });

    return stats;
  }, [submissions]);

  const branchCount = Object.keys(analytics.byBranch).length;

  if (loading || permissionsLoading) return <div className="py-40 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl"><BarChart3 className="w-8 h-8" /></div>
          <div><h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">{activeDistrict ? `${activeDistrict} District` : 'District Monitoring'}</h1><div className="flex items-center gap-2 mt-1"><p className="text-muted-foreground text-lg font-medium">Regional monitoring console.</p><Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black px-3 py-1">{branchCount} Branches</Badge></div></div>
        </div>
        <div className="flex gap-3">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          {isAdmin && (
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2 font-bold h-12 px-6 border-slate-200 shadow-sm bg-white rounded-xl"><Globe className="w-4 h-4 text-primary" /> {selectedDistrict === 'all' ? 'All Regions' : selectedDistrict}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-xl shadow-2xl"><DropdownMenuItem onClick={() => setSelectedDistrict('all')} className="font-bold">All Regions</DropdownMenuItem>{districts.map(d => <DropdownMenuItem key={d.id} onClick={() => setSelectedDistrict(d.name)} className="font-medium">{d.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          )}
          <Button className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl" onClick={() => toast({ title: "Export Started" })}><FileDown className="w-5 h-5" /> Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50">Volume</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-slate-900 tracking-tighter">{analytics.total}</span><div className="p-2 bg-slate-50 rounded-lg"><TrendingUp className="w-4 h-4 text-slate-400" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600 bg-slate-50/50">Authorized</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-emerald-600 tracking-tighter">{analytics.approved}</span><div className="p-2 bg-emerald-50 rounded-lg"><ShieldCheck className="w-4 h-4 text-emerald-600" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-orange-600 bg-slate-50/50">Amended</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-orange-600 tracking-tighter">{analytics.amended}</span><div className="p-2 bg-orange-50 rounded-lg"><ShieldAlert className="w-4 h-4 text-orange-600" /></div></CardContent></Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary bg-white overflow-hidden rounded-2xl"><CardHeader className="pb-2 text-[10px] font-black uppercase text-primary bg-slate-50/50">Pending</CardHeader><CardContent className="pt-4 flex items-end justify-between"><span className="text-5xl font-black text-primary tracking-tighter">{analytics.pending}</span><div className="p-2 bg-primary/5 rounded-lg"><Zap className="w-4 h-4 text-primary" /></div></CardContent></Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-2xl border-slate-200 overflow-hidden bg-white rounded-3xl"><CardHeader className="bg-slate-50/50 border-b p-6"><div><CardTitle className="text-xl flex items-center gap-3 font-headline text-slate-900"><LayoutGrid className="w-5 h-5 text-primary" /> Branch Matrix</CardTitle></div></CardHeader><CardContent className="p-0"><Table><TableHeader className="bg-slate-50/80"><TableRow><TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Branch</TableHead><TableHead className="font-black text-center text-[11px] uppercase text-slate-500">Volume</TableHead><TableHead className="font-black text-center text-emerald-600 text-[11px] uppercase">Authorized</TableHead><TableHead className="font-black text-right pr-8 text-[11px] uppercase w-[180px] text-slate-500">Efficiency</TableHead></TableRow></TableHeader><TableBody>{Object.entries(analytics.byBranch).map(([name, data]) => { const efficiency = Math.round((data.approved / (data.total - data.pending || 1)) * 100); return (<TableRow key={name} className="hover:bg-slate-50 transition-colors group"><TableCell className="font-bold py-6 pl-8 text-slate-900 flex items-center gap-3"><div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-all"><Building2 className="w-5 h-5" /></div>{name}</TableCell><TableCell className="text-center font-black text-lg text-slate-700">{data.total}</TableCell><TableCell className="text-center"><Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-black px-4 py-1">{data.approved}</Badge></TableCell><TableCell className="text-right pr-8"><div className="flex flex-col items-end gap-2"><div className="flex items-center gap-2"><span className={cn("font-black text-base", efficiency >= 90 ? "text-emerald-600" : efficiency >= 70 ? "text-primary" : "text-orange-600")}>{efficiency}%</span><ArrowUpRight className="w-3 h-3 text-slate-300" /></div><Progress value={efficiency} className={cn("w-full h-1.5 bg-slate-100", efficiency >= 90 ? "[&>div]:bg-emerald-500" : efficiency >= 70 ? "[&>div]:bg-primary" : "[&>div]:bg-orange-500")} /></div></TableCell></TableRow>); })}</TableBody></Table></CardContent></Card>
        <div className="space-y-8"><Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white"><CardHeader className="bg-primary p-6 border-b text-white"><CardTitle className="text-white text-lg font-black uppercase tracking-widest flex items-center gap-2"><Target className="w-5 h-5 text-white" /> Regional Pulse</CardTitle></CardHeader><CardContent className="p-6 space-y-6"><div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4"><div className="space-y-2"><div className="flex justify-between text-xs font-bold text-slate-700"><span>Accuracy Index</span><span>{analytics.total > 0 ? Math.round((analytics.approved / analytics.total) * 100) : 0}%</span></div><Progress value={analytics.total > 0 ? (analytics.approved / analytics.total) * 100 : 0} className="h-2 bg-white" /></div></div></CardContent></Card></div>
      </div>
    </div>
  )
}
