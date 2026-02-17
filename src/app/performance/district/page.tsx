
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
  Building2
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
import { SubmissionStatus } from "@prisma/client";

export default function DistrictPerformancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");

  const isAdmin = user?.role === 'ADMIN';
  const isDistDir = user?.role === 'DISTRICT_DIRECTOR';
  
  // Lock to user's district if they are a District Director
  const activeDistrict = isDistDir ? user.districtName : (selectedDistrict === 'all' ? null : selectedDistrict);

  useEffect(() => {
    loadData();
  }, [fromDate, toDate, activeDistrict]);

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
      approved: submissions.filter(s => s.status === 'APPROVED').length,
      pending: submissions.filter(s => ['PENDING', 'IN_REVIEW'].includes(s.status)).length,
      rejected: submissions.filter(s => s.status === 'REJECTED').length,
      byBranch: {} as Record<string, { total: number, approved: number, pending: number }>
    };

    submissions.forEach(sub => {
      const bName = sub.branchName || 'Global HQ';
      if (!stats.byBranch[bName]) stats.byBranch[bName] = { total: 0, approved: 0, pending: 0 };
      stats.byBranch[bName].total++;
      if (sub.status === 'APPROVED') stats.byBranch[bName].approved++;
      if (['PENDING', 'IN_REVIEW'].includes(sub.status)) stats.byBranch[bName].pending++;
    });

    return stats;
  }, [submissions]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Syncing SQL Hub...</p>
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
              {activeDistrict ? `${activeDistrict} District Oversight` : 'Global Oversight'}
            </h1>
            <p className="text-muted-foreground text-lg font-medium">Institutional health and regional node throughput.</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 font-bold h-11 px-6 border-slate-200">
                  <Globe className="w-4 h-4 text-primary" /> {selectedDistrict === 'all' ? 'All Districts' : selectedDistrict}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setSelectedDistrict('all')}>All Districts</DropdownMenuItem>
                {districts.map(d => <DropdownMenuItem key={d.id} onClick={() => setSelectedDistrict(d.name)}>{d.name} District</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button className="gap-2 h-11 px-6 bg-slate-900 font-bold shadow-lg" onClick={() => toast({ title: "Exporting CSV..." })}>
            <FileDown className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">To Date</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-slate-400 flex flex-row justify-between items-center">
            Total Volume <Inbox className="w-3 h-3 text-slate-300" />
          </CardHeader>
          <CardContent className="text-4xl font-black text-slate-900">{analytics.total}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-emerald-600">Approvals</CardHeader>
          <CardContent className="text-4xl font-black text-emerald-600">{analytics.approved}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-primary">Pending</CardHeader>
          <CardContent className="text-4xl font-black text-primary">{analytics.pending}</CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-red-500">
          <CardHeader className="pb-2 text-[10px] font-black uppercase text-red-600">Rejected</CardHeader>
          <CardContent className="text-4xl font-black text-red-600">{analytics.rejected}</CardContent>
        </Card>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Branch Throughput Matrix</CardTitle>
            <CardDescription>Comparative performance across regional nodes.</CardDescription>
          </div>
          {activeDistrict && (
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold">
              <Building2 className="w-3 h-3 mr-1.5" /> {activeDistrict} Nodes
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="font-black py-4 pl-8">Branch Name</TableHead>
                <TableHead className="font-black text-center">Volume</TableHead>
                <TableHead className="font-black text-center text-emerald-600">Approved</TableHead>
                <TableHead className="font-black text-right pr-8">Efficiency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(analytics.byBranch).length > 0 ? (
                Object.entries(analytics.byBranch).map(([name, data]) => (
                  <TableRow key={name} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-bold py-5 pl-8 text-slate-900">{name}</TableCell>
                    <TableCell className="text-center font-bold">{data.total}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold px-3">{data.approved}</Badge>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <span className="font-black text-primary">
                        {Math.round((data.approved / (data.total - data.pending || 1)) * 100)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center text-muted-foreground italic">
                    No jurisdictional data discovered for this date range.
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
