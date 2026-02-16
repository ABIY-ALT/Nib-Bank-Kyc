"use client"

import { useMemo, useState } from "react"
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useAuth } from "@/lib/auth-mock";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from "@/components/ui/card"
import { 
  Map, 
  TrendingUp, 
  Building2, 
  AlertTriangle, 
  BarChart3, 
  Filter, 
  FileDown,
  CheckCircle2,
  Clock,
  Inbox,
  Globe,
  Loader2,
  Calendar,
  ChevronRight,
  ShieldCheck
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu"
import { 
  Bar, 
  BarChart, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip,
  Cell,
  PieChart,
  Pie
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast"
import { subDays, format, startOfDay, endOfDay } from "date-fns";
import { KYCSubmission } from "@/lib/kyc-data";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_COLORS = {
  Approved: "#10B981",
  Pending: "#3F51B5",
  Amended: "#F59E0B",
  Rejected: "#EF4444",
  Escalated: "#8B5CF6"
};

const chartConfig = {
  Approved: { label: "Approved", color: STATUS_COLORS.Approved },
  Pending: { label: "Pending", color: STATUS_COLORS.Pending },
  Amended: { label: "Action Required", color: STATUS_COLORS.Amended },
  Rejected: { label: "Rejected", color: STATUS_COLORS.Rejected },
} satisfies ChartConfig;

export default function DistrictPerformancePage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>("all");

  const isAdmin = user?.role === 'Admin';
  const isDistDir = user?.role === 'District Director';
  
  // RBAC: Locked District for Directors
  const activeDistrict = isDistDir ? user.district : (selectedDistrictFilter === 'all' ? null : selectedDistrictFilter);

  // 1. Fetch Submissions for analytics
  const submissionsQuery = useMemoFirebase(() => {
    if (!db) return null;
    const start = startOfDay(new Date(fromDate)).toISOString();
    const end = endOfDay(new Date(toDate)).toISOString();
    
    let q = query(
      collection(db, "submissions"),
      where("submittedAt", ">=", start),
      where("submittedAt", "<=", end)
    );

    if (activeDistrict) {
      q = query(q, where("district", "==", activeDistrict));
    }

    return q;
  }, [db, fromDate, toDate, activeDistrict]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(submissionsQuery);

  // 2. Fetch District List for Admin
  const districtsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "districts"), orderBy("name")) : null;
  }, [db]);
  const { data: districts } = useCollection<{id: string, name: string}>(districtsQuery);

  // 3. Analytics Engine
  const analytics = useMemo(() => {
    if (!submissions) return null;

    const stats = {
      total: submissions.length,
      approved: submissions.filter(s => s.status === 'Approved').length,
      pending: submissions.filter(s => ['Pending', 'In Review'].includes(s.status)).length,
      rejected: submissions.filter(s => s.status === 'Rejected').length,
      amended: submissions.filter(s => s.status === 'Amended').length,
      byBranch: {} as Record<string, { total: number, approved: number, pending: number }>,
      byStatus: [
        { name: 'Approved', value: 0, fill: STATUS_COLORS.Approved },
        { name: 'Pending', value: 0, fill: STATUS_COLORS.Pending },
        { name: 'Action Required', value: 0, fill: STATUS_COLORS.Amended },
        { name: 'Rejected', value: 0, fill: STATUS_COLORS.Rejected },
      ]
    };

    submissions.forEach(sub => {
      // Branch Breakdown
      if (!stats.byBranch[sub.branch]) {
        stats.byBranch[sub.branch] = { total: 0, approved: 0, pending: 0 };
      }
      stats.byBranch[sub.branch].total++;
      if (sub.status === 'Approved') stats.byBranch[sub.branch].approved++;
      if (['Pending', 'In Review'].includes(sub.status)) stats.byBranch[sub.branch].pending++;

      // Status Pie
      if (sub.status === 'Approved') stats.byStatus[0].value++;
      else if (['Pending', 'In Review'].includes(sub.status)) stats.byStatus[1].value++;
      else if (sub.status === 'Amended') stats.byStatus[2].value++;
      else if (sub.status === 'Rejected') stats.byStatus[3].value++;
    });

    return stats;
  }, [submissions]);

  const handleExportCSV = () => {
    if (!analytics) return;
    toast({
      title: "Regional Data Exported",
      description: `Institutional summary for ${activeDistrict || 'Global Network'} saved to CSV.`,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Retrieving Regional Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {isDistDir ? `${user.district} District Command` : 'Regional Oversight'}
            </h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">
            {isDistDir ? `Monitoring institutional health for the ${user.district} geographical hub.` : 'Global monitoring of regional districts and branch throughput.'}
          </p>
        </div>
        
        <div className="flex gap-3">
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 h-11 px-6 border-slate-200 bg-white font-bold shadow-sm">
                  <Globe className="w-4 h-4 text-primary" />
                  Region: {selectedDistrictFilter === 'all' ? 'All Districts' : selectedDistrictFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase font-black tracking-widest text-slate-400">Select Jurisdiction</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedDistrictFilter('all')}>All Districts (Global)</DropdownMenuItem>
                {districts?.map(d => (
                  <DropdownMenuItem key={d.id} onClick={() => setSelectedDistrictFilter(d.name)}>{d.name} District</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          <Button onClick={handleExportCSV} className="gap-2 h-11 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-lg">
            <FileDown className="w-4 h-4" />
            Export Archive
          </Button>
        </div>
      </div>

      {/* Temporal Filter Bar */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upto Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Regional Volume</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-slate-900 tracking-tighter">{analytics?.total || 0}</span>
            <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-primary/5 group-hover:text-primary transition-colors">
              <Inbox className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Total Approvals</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-emerald-600 tracking-tighter">{analytics?.approved || 0}</span>
            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Pending Verification</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-primary tracking-tighter">{analytics?.pending || 0}</span>
            <div className="p-3 bg-primary/5 rounded-2xl text-primary">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-red-600">Rejected Cases</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-red-600 tracking-tighter">{analytics?.rejected || 0}</span>
            <div className="p-3 bg-red-50 rounded-2xl text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* BRANCH BREAKDOWN */}
        <Card className="lg:col-span-2 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Branch Throughput Matrix</CardTitle>
              <CardDescription>Regional node efficiency and SLA resolution status.</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold px-4">
              {Object.keys(analytics?.byBranch || {}).length} Active Nodes
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-black py-4 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Branch Name</TableHead>
                  <TableHead className="font-black text-center text-[11px] uppercase tracking-widest text-slate-500">Volume</TableHead>
                  <TableHead className="font-black text-center text-[11px] uppercase tracking-widest text-slate-500">Approved</TableHead>
                  <TableHead className="font-black text-center text-[11px] uppercase tracking-widest text-slate-500">Pending</TableHead>
                  <TableHead className="font-black text-right pr-8 text-[11px] uppercase tracking-widest text-slate-500">Efficiency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(analytics?.byBranch || {}).map(([name, data]) => {
                  const efficiency = Math.round((data.approved / (data.total - data.pending || 1)) * 100);
                  return (
                    <TableRow key={name} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-black text-slate-900 py-5 pl-8 text-[15px]">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 rounded-lg text-slate-400 group-hover:text-primary transition-colors">
                            <Building2 className="w-4 h-4" />
                          </div>
                          {name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold tabular-nums text-slate-600">{data.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-none font-bold">{data.approved}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-primary border-primary/20 font-bold">{data.pending}</Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{efficiency}%</span>
                            <Progress value={efficiency} className="w-20 h-1 bg-slate-100" />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {Object.keys(analytics?.byBranch || {}).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic font-medium">
                      No branch activity discovered in this temporal window.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* DISTRIBUTION & STATUS */}
        <div className="space-y-8">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl">Workflow Distribution</CardTitle>
              <CardDescription>Breakdown of case determinations.</CardDescription>
            </CardHeader>
            <CardContent className="pt-8 flex flex-col items-center">
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <PieChart>
                  <Pie
                    data={analytics?.byStatus || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {analytics?.byStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
              <div className="grid grid-cols-2 gap-4 w-full pt-6">
                {analytics?.byStatus.map(status => (
                  <div key={status.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.fill }} />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{status.name}</span>
                    <span className="text-xs font-bold text-slate-900 ml-auto tabular-nums">{status.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-slate-900 bg-slate-900 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <ShieldCheck className="w-32 h-32" />
            </div>
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Network Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-2">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">SLA Compliance Index</p>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-black">98.2%</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[10px]">OPTIMAL</Badge>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium italic">
                "Regional throughput is currently within institutional safety margins. 12 branches are operating at high-velocity resolution levels."
              </p>
              <Button asChild variant="outline" className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 font-bold">
                <a href="#">
                  View Detailed Regional Audit
                  <ChevronRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
