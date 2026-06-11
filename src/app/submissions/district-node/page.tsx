
"use client"

import { useMemo, useState, useEffect } from "react";
import { 
  Check,
  ChevronsUpDown,
  Loader2, 
  Search, 
  ShieldCheck, 
  Users, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Inbox,
  Activity,
  Building2,
  ShieldAlert,
  RefreshCw,
  Map
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bar, 
  BarChart, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip,
  Cell,
  PieChart,
  Pie
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { SubmissionsPageContent } from "../submissions-content";
import { getSubmissions } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

const STATUS_COLORS = {
  APPROVED: "#10B981",
  SUBMITTED: "#3F51B5",
  ACTION_REQUIRED: "#F59E0B",
  REJECTED: "#EF4444",
  ESCALATED: "#8B5CF6"
};

const chartConfig = {
  APPROVED: { label: "Successfully Authorized", color: STATUS_COLORS.APPROVED },
  SUBMITTED: { label: "Officer Analysis", color: STATUS_COLORS.SUBMITTED },
  ACTION_REQUIRED: { label: "Need Amendment", color: STATUS_COLORS.ACTION_REQUIRED },
  REJECTED: { label: "Risk Rejected", color: STATUS_COLORS.REJECTED },
} satisfies ChartConfig;

const volumeConfig = {
  count: { label: "Volume", color: "hsl(var(--primary))" }
} satisfies ChartConfig;

export default function DistrictMonitoringPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [matrixBranchFilter, setMatrixBranchFilter] = useState<string>("all");
  const [matrixBranchSearch, setMatrixBranchSearch] = useState("");
  const [matrixBranchOpen, setMatrixBranchOpen] = useState(false);
  const [staffMatrixFilter, setStaffMatrixFilter] = useState<string>("all");
  const [staffMatrixSearch, setStaffMatrixSearch] = useState("");
  const [staffMatrixOpen, setStaffMatrixOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const isAdmin = isSuperAdmin;
  const districtName = user?.districtName || "";

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      try {
        let filters: any = {
          district: isAdmin ? undefined : (districtName || undefined),
          limit: 1000
        };

        if (dateRange?.from) {
          filters.startDate = dateRange.from.toISOString();
          if (dateRange.to) filters.endDate = dateRange.to.toISOString();
        }

        const data = await getSubmissions(filters);
        setSubmissions(data);
      } catch (error) {
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, isAdmin, districtName, dateRange]);

  const analytics = useMemo(() => {
    if (!submissions || submissions.length === 0) return null;

    const stats = {
      total: submissions.length,
      approved: submissions.filter(s => s.status === KYC_STATUS.APPROVED).length,
      pending: submissions.filter(s => [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(s.status)).length,
      rejected: submissions.filter(s => s.status === KYC_STATUS.REJECTED).length,
      amended: submissions.filter(s => s.status === KYC_STATUS.ACTION_REQUIRED).length,
      branches: {} as Record<string, { name: string, total: number, approved: number, pending: number, amended: number }>,
      officers: {} as Record<string, { name: string, total: number, approved: number, amended: number, pending: number, cycles: number }>,
      byStatus: [
        { name: 'APPROVED', value: 0, fill: STATUS_COLORS.APPROVED },
        { name: 'SUBMITTED', value: 0, fill: STATUS_COLORS.SUBMITTED },
        { name: 'ACTION_REQUIRED', value: 0, fill: STATUS_COLORS.ACTION_REQUIRED },
        { name: 'REJECTED', value: 0, fill: STATUS_COLORS.REJECTED },
      ],
      volumeHistory: [] as { date: string, count: number }[]
    };

    const dateMap: Record<string, number> = {};

    submissions.forEach(sub => {
      // SECURITY: Log any district mismatches for audit (backend filtering should prevent these)
      if (!isAdmin && districtName) {
        const branchDistrict = sub.branch?.district?.name || '';
        const submissionDistrict = sub.districtName || '';
        const userDistrictLower = districtName.toLowerCase();
        
        const branchMatches = branchDistrict.toLowerCase() === userDistrictLower;
        const submissionMatches = submissionDistrict.toLowerCase() === userDistrictLower;
        
        // Log warning if either field doesn't match, but still process the submission
        // (Backend filtering should have prevented this - if it happens, it's a data consistency issue)
        if (!branchMatches || !submissionMatches) {
          console.warn(
            `[AUDIT] Submission ${sub.id} has district inconsistency: branch=${branchDistrict}, submission=${submissionDistrict}, user=${districtName}`
          );
        }
      }

      const bName = sub.branch?.name || sub.branchName || "Unknown Branch";
      if (!stats.branches[bName]) {
        stats.branches[bName] = { name: bName, total: 0, approved: 0, pending: 0, amended: 0 };
      }
      stats.branches[bName].total++;

      const officerName = sub.createdBy ? `${sub.createdBy.firstName} ${sub.createdBy.lastName}` : 'Institutional Staff';
      const officerKey = sub.createdById || 'SYSTEM';
      if (!stats.officers[officerKey]) {
        stats.officers[officerKey] = { name: officerName, total: 0, approved: 0, amended: 0, pending: 0, cycles: 0 };
      }
      stats.officers[officerKey].total++;
      stats.officers[officerKey].cycles += (sub.amendCycles || 0);
      
      if (sub.status === KYC_STATUS.APPROVED) {
        stats.branches[bName].approved++;
        stats.officers[officerKey].approved++;
        stats.byStatus[0].value++;
      } else if (sub.status === KYC_STATUS.ACTION_REQUIRED) {
        stats.branches[bName].amended++;
        stats.officers[officerKey].amended++;
        stats.byStatus[2].value++;
      } else if ([KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(sub.status)) {
        stats.branches[bName].pending++;
        stats.officers[officerKey].pending++;
        stats.byStatus[1].value++;
      } else if (sub.status === KYC_STATUS.REJECTED) {
        stats.byStatus[3].value++;
      }

      if (sub.submittedAt) {
        const d = format(new Date(sub.submittedAt), 'MMM dd');
        dateMap[d] = (dateMap[d] || 0) + 1;
      }
    });

    stats.volumeHistory = Object.entries(dateMap).map(([date, count]) => ({ date, count }));

    return stats;
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => {
      const matchesSearch = sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term);
      const matchesBranch = matrixBranchFilter === 'all' || (sub.branch?.name === matrixBranchFilter || sub.branchName === matrixBranchFilter);
      const matchesDistrict = isAdmin ? true : (sub.branch?.district?.name === districtName || sub.districtName === districtName);
      return matchesSearch && matchesBranch && matchesDistrict;
    });
  }, [submissions, searchTerm]);

  const branchMatrixOptions = useMemo(() => {
    return Object.keys(analytics?.branches || {}).sort((a, b) => a.localeCompare(b));
  }, [analytics?.branches]);

  const filteredBranchMatrixOptions = useMemo(() => {
    const term = matrixBranchSearch.trim().toLowerCase();
    if (!term) return branchMatrixOptions;
    return branchMatrixOptions.filter((name) => name.toLowerCase().includes(term));
  }, [branchMatrixOptions, matrixBranchSearch]);

  const staffMatrixOptions = useMemo(() => {
    const officers = Object.values(analytics?.officers || {}) as Array<{ name: string }>;
    return officers.map((officer) => officer.name).sort((a, b) => a.localeCompare(b));
  }, [analytics?.officers]);

  const filteredStaffMatrixOptions = useMemo(() => {
    const term = staffMatrixSearch.trim().toLowerCase();
    if (!term) return staffMatrixOptions;
    return staffMatrixOptions.filter((name) => name.toLowerCase().includes(term));
  }, [staffMatrixOptions, staffMatrixSearch]);

  useEffect(() => {
    if (matrixBranchFilter === "all") return;
    if (!branchMatrixOptions.includes(matrixBranchFilter)) {
      setMatrixBranchFilter("all");
    }
  }, [branchMatrixOptions, matrixBranchFilter]);

  useEffect(() => {
    if (staffMatrixFilter === "all") return;
    if (!staffMatrixOptions.includes(staffMatrixFilter)) {
      setStaffMatrixFilter("all");
    }
  }, [staffMatrixFilter, staffMatrixOptions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <Map className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {isAdmin ? "District Monitoring" : `${districtName || 'Unassigned'} District Monitoring`}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg font-medium">
              Institutional oversight of branches within the regional jurisdiction.
            </p>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
              <ShieldCheck className="w-3 h-3" />
              {isAdmin ? "MASTER" : "DISTRICT DIRECTOR"} Authorization
            </Badge>
          </div>
        </div>
        <div className="flex gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search records by case ID or customer name..." className="pl-11 h-12 rounded-xl border-slate-200 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Monitoring Data...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all duration-300">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Regional Volume</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between"><span className="text-4xl font-black text-slate-900 tracking-tighter">{analytics?.total || 0}</span><div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-primary/5 group-hover:text-primary transition-colors"><Inbox className="w-6 h-6" /></div></CardContent>
            </Card>
            <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Successfully Authorized</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between"><span className="text-4xl font-black text-emerald-600 tracking-tighter">{analytics?.approved || 0}</span><div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600"><CheckCircle2 className="w-6 h-6" /></div></CardContent>
            </Card>
            <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Amendments</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between"><span className="text-4xl font-black text-orange-600 tracking-tighter">{analytics?.amended || 0}</span><div className="p-3 bg-orange-50 rounded-2xl text-orange-600"><AlertCircle className="w-6 h-6" /></div></CardContent>
            </Card>
            <Card className="shadow-lg border-slate-200 border-l-4 border-l-primary">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Unseen Analysis</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between"><span className="text-4xl font-black text-primary tracking-tighter">{analytics?.pending || 0}</span><div className="p-3 bg-primary/5 rounded-2xl text-primary"><Activity className="w-6 h-6" /></div></CardContent>
            </Card>
          </div>

          <Tabs defaultValue="summary" className="space-y-6">
            <TabsList className="bg-slate-100 p-1 border h-12">
              <TabsTrigger value="summary" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8"><TrendingUp className="w-4 h-4 mr-2" />Regional Pulse</TabsTrigger>
              <TabsTrigger value="all-cases" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8"><Activity className="w-4 h-4 mr-2" />Monitoring Archive</TabsTrigger>
              <TabsTrigger value="branch-matrix" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8"><Building2 className="w-4 h-4 mr-2" />Branch Throughput</TabsTrigger>
              <TabsTrigger value="staff-matrix" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8"><Users className="w-4 h-4 mr-2" />Staff Productivity</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
                  <CardHeader className="bg-slate-50/50 border-b">
                    <CardTitle className="text-xl">Workflow Distribution</CardTitle>
                    <CardDescription>Breakdown of regional verification determinations.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-8 flex flex-col items-center">
                    <ChartContainer config={chartConfig} className="h-[300px] w-full">
                      <PieChart>
                        <Pie data={analytics?.byStatus || []} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                          {analytics?.byStatus.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
                  <CardHeader className="bg-slate-50/50 border-b">
                    <CardTitle className="text-xl">Regional Traffic Trend</CardTitle>
                    <CardDescription>Historical monitoring traffic trend.</CardDescription>
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
              <SubmissionsPageContent submissions={filteredSubmissions || []} />
            </TabsContent>

            <TabsContent value="branch-matrix">
              <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
                <CardHeader className="bg-slate-50/50 border-b">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <CardTitle className="text-xl">Branch Throughput Matrix</CardTitle>
                      <CardDescription>Comparative monitoring data for local branches.</CardDescription>
                    </div>
                    <Popover open={matrixBranchOpen} onOpenChange={setMatrixBranchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 w-full justify-between gap-2 border-slate-200 bg-white md:w-[280px]">
                          <span className="truncate text-sm font-bold">
                            {matrixBranchFilter === "all" ? "All Branches" : matrixBranchFilter}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 rounded-xl border border-slate-200 p-0 shadow-xl">
                        <div className="relative border-b border-slate-100 p-3">
                          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            placeholder="Search branch..."
                            value={matrixBranchSearch}
                            onChange={(e) => setMatrixBranchSearch(e.target.value)}
                            className="h-10 rounded-lg border-slate-200 pl-9 text-sm"
                          />
                        </div>
                        <ScrollArea className="max-h-64 p-2">
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                              matrixBranchFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                            )}
                            onClick={() => {
                              setMatrixBranchFilter("all");
                              setMatrixBranchOpen(false);
                            }}
                          >
                            <span>All Branches</span>
                            {matrixBranchFilter === "all" && <Check className="h-4 w-4" />}
                          </button>
                          {filteredBranchMatrixOptions.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className={cn(
                                "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                                matrixBranchFilter === name ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                              )}
                              onClick={() => {
                                setMatrixBranchFilter(name);
                                setMatrixBranchOpen(false);
                              }}
                            >
                              <span className="truncate">{name}</span>
                              {matrixBranchFilter === name && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow>
                        <TableHead className="font-bold py-4 pl-8">Branch</TableHead>
                        <TableHead className="font-bold text-center">Case Volume</TableHead>
                        <TableHead className="font-bold text-center text-emerald-600">Authorized</TableHead>
                        <TableHead className="font-bold text-center text-orange-600">Amended</TableHead>
                        <TableHead className="font-bold text-center text-primary">Unseen</TableHead>
                        <TableHead className="font-bold text-right pr-8">Efficiency Index</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.values(analytics?.branches || {})
                        .filter((branch) => matrixBranchFilter === "all" || branch.name === matrixBranchFilter)
                        .map((branch) => {
                        const efficiency = Math.round((branch.approved / (branch.total - branch.pending || 1)) * 100);
                        return (
                          <TableRow key={branch.name} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="py-4 pl-8 font-bold text-slate-900 flex items-center gap-3">
                              <Building2 className="w-4 h-4 text-slate-400" />
                              {branch.name}
                            </TableCell>
                            <TableCell className="text-center font-bold">{branch.total}</TableCell>
                            <TableCell className="text-center"><Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold">{branch.approved}</Badge></TableCell>
                            <TableCell className="text-center"><Badge variant="secondary" className="bg-orange-50 text-orange-700 font-bold">{branch.amended}</Badge></TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="bg-primary/10 text-primary font-bold">{branch.pending}</Badge>
                            </TableCell>
                            <TableCell className="text-right pr-8">
                              <div className="flex flex-col items-end gap-1.5">
                                <span className="text-xs font-black text-emerald-600">{efficiency}%</span>
                                <Progress value={efficiency} className="w-24 h-1.5 bg-slate-100" />
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

            <TabsContent value="staff-matrix">
              <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
                <CardHeader className="bg-slate-50/50 border-b">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <CardTitle className="text-xl">Staff Productivity</CardTitle>
                      <CardDescription>Individual officer performance aggregated across the district monitoring zone.</CardDescription>
                    </div>
                    <Popover open={staffMatrixOpen} onOpenChange={setStaffMatrixOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 w-full justify-between gap-2 border-slate-200 bg-white md:w-[280px]">
                          <span className="truncate text-sm font-bold">
                            {staffMatrixFilter === "all" ? "All Staff" : staffMatrixFilter}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 rounded-xl border border-slate-200 p-0 shadow-xl">
                        <div className="relative border-b border-slate-100 p-3">
                          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            placeholder="Search staff..."
                            value={staffMatrixSearch}
                            onChange={(e) => setStaffMatrixSearch(e.target.value)}
                            className="h-10 rounded-lg border-slate-200 pl-9 text-sm"
                          />
                        </div>
                        <ScrollArea className="max-h-64 p-2">
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                              staffMatrixFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                            )}
                            onClick={() => {
                              setStaffMatrixFilter("all");
                              setStaffMatrixOpen(false);
                            }}
                          >
                            <span>All Staff</span>
                            {staffMatrixFilter === "all" && <Check className="h-4 w-4" />}
                          </button>
                          {filteredStaffMatrixOptions.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className={cn(
                                "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                                staffMatrixFilter === name ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                              )}
                              onClick={() => {
                                setStaffMatrixFilter(name);
                                setStaffMatrixOpen(false);
                              }}
                            >
                              <span className="truncate">{name}</span>
                              {staffMatrixFilter === name && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow>
                        <TableHead className="font-bold py-4 pl-8">Staff Member</TableHead>
                        <TableHead className="font-bold text-center">Total Requests</TableHead>
                        <TableHead className="font-bold text-center text-emerald-600">Authorized</TableHead>
                        <TableHead className="font-bold text-center text-orange-600">Amended</TableHead>
                        <TableHead className="font-bold text-center text-primary">Unseen</TableHead>
                        <TableHead className="font-bold text-center text-slate-500">Total Cycles</TableHead>
                        <TableHead className="font-bold text-right pr-8">Efficiency Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.values(analytics?.officers || {})
                        .filter((officer) => staffMatrixFilter === "all" || officer.name === staffMatrixFilter)
                        .map((officer) => {
                        const efficiency = Math.round((officer.approved / (officer.total - officer.pending || 1)) * 100);
                        return (
                          <TableRow key={officer.name} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="py-4 pl-8 font-bold text-slate-900">{officer.name}</TableCell>
                            <TableCell className="text-center font-bold">{officer.total}</TableCell>
                            <TableCell className="text-center"><Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold">{officer.approved}</Badge></TableCell>
                            <TableCell className="text-center"><Badge variant="secondary" className="bg-orange-50 text-orange-700 font-bold">{officer.amended}</Badge></TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="bg-primary/10 text-primary font-bold">{officer.pending}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-primary/30 text-primary font-black flex items-center gap-1.5 w-fit mx-auto">
                                <RefreshCw className="w-3 h-3" /> {officer.cycles}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right pr-8">
                              <div className="flex flex-col items-end gap-1.5">
                                <span className="text-xs font-black text-emerald-600">{efficiency}%</span>
                                <Progress value={efficiency} className="w-24 h-1.5 bg-slate-100" />
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
        </>
      )}
    </div>
  );
}
