"use client"

import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { 
  LayoutList, 
  Loader2, 
  MapPin, 
  Search, 
  ShieldCheck, 
  Users, 
  BarChart3, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Inbox,
  User,
  ShieldAlert,
  Globe,
  Zap,
  RefreshCw,
  Calendar as CalendarIcon,
  ChevronRight,
  TrendingDown,
  Activity,
  FileBarChart,
  Building2
} from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { subDays, format, startOfDay, endOfDay } from "date-fns";
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
import { type ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import Link from "next/link";
import { SubmissionsPageContent } from "../submissions-content";

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

const volumeConfig = {
  count: { label: "Volume", color: "hsl(var(--primary))" }
} satisfies ChartConfig;

export default function BranchNodeOversightPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Temporal Filters
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const isAdmin = user?.role === 'Admin';
  const isBranchMgr = user?.role === 'Branch Manager' || isAdmin;

  // 1. Fetch Submissions with strict jurisdictional scope
  const branchQuery = useMemoFirebase(() => {
    if (!db) return null;
    const start = startOfDay(new Date(fromDate)).toISOString();
    const end = endOfDay(new Date(toDate)).toISOString();

    let q = query(
      collection(db, "submissions"),
      where("submittedAt", ">=", start),
      where("submittedAt", "<=", end)
    );

    if (!isAdmin) {
      if (!user?.branch) return null;
      q = query(q, where("branch", "==", user.branch));
    }

    return q;
  }, [db, user?.branch, isAdmin, fromDate, toDate]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(branchQuery);

  // 2. Analytics Engine
  const analytics = useMemo(() => {
    if (!submissions) return null;

    const stats = {
      total: submissions.length,
      approved: submissions.filter(s => s.status === 'Approved').length,
      pending: submissions.filter(s => ['Pending', 'In Review'].includes(s.status)).length,
      rejected: submissions.filter(s => s.status === 'Rejected').length,
      amended: submissions.filter(s => s.status === 'Amended').length,
      officers: {} as Record<string, { name: string, total: number, approved: number, amended: number, pending: number, cycles: number }>,
      byStatus: [
        { name: 'Approved', value: 0, fill: STATUS_COLORS.Approved },
        { name: 'Pending', value: 0, fill: STATUS_COLORS.Pending },
        { name: 'Action Required', value: 0, fill: STATUS_COLORS.Amended },
        { name: 'Rejected', value: 0, fill: STATUS_COLORS.Rejected },
      ],
      volumeHistory: [] as { date: string, count: number }[]
    };

    // Date grouping for volume history
    const dateMap: Record<string, number> = {};

    submissions.forEach(sub => {
      // Officer Breakdown
      const officer = sub.submittedBy;
      if (!stats.officers[officer]) {
        stats.officers[officer] = { name: officer, total: 0, approved: 0, amended: 0, pending: 0, cycles: 0 };
      }
      stats.officers[officer].total++;
      stats.officers[officer].cycles += (sub.amendmentCycles || 0);
      if (sub.status === 'Approved') stats.officers[officer].approved++;
      else if (sub.status === 'Amended') stats.officers[officer].amended++;
      else if (['Pending', 'In Review'].includes(sub.status)) stats.officers[officer].pending++;

      // Status Distribution
      if (sub.status === 'Approved') stats.byStatus[0].value++;
      else if (['Pending', 'In Review'].includes(sub.status)) stats.byStatus[1].value++;
      else if (sub.status === 'Amended') stats.byStatus[2].value++;
      else if (sub.status === 'Rejected') stats.byStatus[3].value++;

      // Volume Trend
      const d = format(new Date(sub.submittedAt), 'MMM dd');
      dateMap[d] = (dateMap[d] || 0) + 1;
    });

    stats.volumeHistory = Object.entries(dateMap).map(([date, count]) => ({ date, count }));

    return stats;
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  if (!user?.branch && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 animate-in fade-in duration-500">
        <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
          <ShieldAlert className="w-16 h-16 text-slate-200" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <p className="font-bold text-slate-900 text-2xl tracking-tight">Access Denied: Unmapped Role</p>
          <p className="text-sm text-muted-foreground font-medium">
            This dashboard requires an institutional branch assignment. Please update your profile in the **Personnel Directory**.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <Building2 className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {isAdmin ? 'Global Command' : `${user.branch} Node Command`}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">
              {isAdmin 
                ? 'Master institutional monitoring of all branches.' 
                : `Managing operational compliance at the ${user.branch} local hub.`}
            </p>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
              <ShieldCheck className="w-3 h-3" />
              {user.role} Authorization
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {isBranchMgr && (
            <Button asChild className="bg-[#B89334] hover:bg-[#A6822D] text-white font-bold h-12 px-8 shadow-xl gap-2 rounded-lg">
              <Link href="/submissions/exceptional">
                <Zap className="w-5 h-5 fill-white" />
                Trigger Exception
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Temporal Control Bar */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
                  />
                </div>
              </div>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search local records..." 
                className="pl-11 h-12 rounded-xl border-slate-200 bg-white shadow-sm font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Volume</CardTitle>
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
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Successfully Approved</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-emerald-600 tracking-tighter">{analytics?.approved || 0}</span>
            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Corrections Required</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-orange-600 tracking-tighter">{analytics?.amended || 0}</span>
            <div className="p-3 bg-orange-50 rounded-2xl text-orange-600">
              <AlertCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Pending Review</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-4xl font-black text-primary tracking-tighter">{analytics?.pending || 0}</span>
            <div className="p-3 bg-primary/5 rounded-2xl text-primary">
              <Activity className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 border h-12">
          <TabsTrigger value="summary" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            <TrendingUp className="w-4 h-4 mr-2" />
            Summary Analytics
          </TabsTrigger>
          <TabsTrigger value="all-cases" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            <LayoutList className="w-4 h-4 mr-2" />
            Case Archive
          </TabsTrigger>
          <TabsTrigger value="officer-performance" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            <Users className="w-4 h-4 mr-2" />
            Staff Productivity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-xl">Workflow Distribution</CardTitle>
                <CardDescription>Breakdown of verification determinations at this node.</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 flex flex-col items-center">
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <PieChart>
                    <Pie
                      data={analytics?.byStatus || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {analytics?.byStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="grid grid-cols-2 gap-x-12 gap-y-4 w-full max-w-sm pt-6">
                  {analytics?.byStatus.map(status => (
                    <div key={status.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.fill }} />
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{status.name}</span>
                      <span className="text-sm font-bold text-slate-900 ml-auto tabular-nums">{status.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-xl">Node Volume Trend</CardTitle>
                <CardDescription>Historical submission traffic for the selected period.</CardDescription>
              </CardHeader>
              <CardContent className="pt-8">
                <ChartContainer config={volumeConfig} className="h-[400px] w-full">
                  <BarChart data={analytics?.volumeHistory || []}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <RechartsTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="all-cases">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">Synchronizing records...</p>
            </div>
          ) : (
            <SubmissionsPageContent submissions={filteredSubmissions || []} />
          )}
        </TabsContent>

        <TabsContent value="officer-performance">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl">Local Productivity Matrix</CardTitle>
                  <CardDescription>Individual throughput and accuracy tracking for branch personnel.</CardDescription>
                </div>
                <Badge variant="outline" className="font-bold border-primary/20 text-primary bg-white px-4 py-1">
                  {Object.keys(analytics?.officers || {}).length} Active Officers
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-bold py-4 pl-8">Staff Member</TableHead>
                    <TableHead className="font-bold text-center">Total Requests</TableHead>
                    <TableHead className="font-bold text-center text-emerald-600">Approved</TableHead>
                    <TableHead className="font-bold text-center text-orange-600">Amended (Errors)</TableHead>
                    <TableHead className="font-bold text-center text-blue-600">Correction Cycles</TableHead>
                    <TableHead className="font-bold text-right pr-8">Efficiency Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.values(analytics?.officers || {}).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                        No individual staff data detected for this audit window.
                      </TableCell>
                    </TableRow>
                  ) : Object.values(analytics?.officers || {}).map((officer) => {
                    const efficiency = Math.round((officer.approved / (officer.total - officer.pending || 1)) * 100);
                    return (
                      <TableRow key={officer.name} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="py-4 pl-8">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                              {officer.name.charAt(0)}
                            </div>
                            <span className="font-bold text-slate-900">{officer.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{officer.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">
                            {officer.approved}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={`font-bold ${officer.amended > 5 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                            {officer.amended}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 font-bold flex items-center gap-1.5 justify-center mx-auto w-12">
                            <RefreshCw className="w-2.5 h-2.5" />
                            {officer.cycles}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-black ${efficiency > 80 ? 'text-emerald-600' : efficiency > 50 ? 'text-orange-600' : 'text-red-600'}`}>
                                {efficiency}%
                              </span>
                              <Progress value={efficiency} className="w-24 h-1.5 bg-slate-100" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Initial Submission Accuracy</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
