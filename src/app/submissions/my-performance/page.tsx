
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Search, 
  Filter, 
  Zap, 
  ShieldCheck, 
  Clock, 
  History, 
  Building2, 
  CheckCircle2, 
  Inbox, 
  Activity,
  ArrowUpRight,
  RotateCcw,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { getSubmissions } from '@/actions/submissions';
import { getGlobalSettings } from '@/actions/settings';
import { KYC_STATUS } from '@/lib/kyc-data';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

export default function MyCasesPerformancePage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const router = useRouter();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (!permissionsLoading && !user) {
      router.push('/login');
    }
  }, [user, permissionsLoading, router]);

  useEffect(() => {
    if (user) {
      loadMyCases();
      loadConfiguration();
    }
  }, [user, dateRange]);

  const loadMyCases = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let filters: any = {
        assignedToId: user.id,
        limit: 1000
      };

      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }

      const data = await getSubmissions(filters);
      setSubmissions(data || []);
    } catch (error) {
      toast({ variant: "destructive", title: "Sync Failed", description: "Could not retrieve your cases from the Vault." });
    } finally {
      setLoading(false);
    }
  };

  const loadConfiguration = async () => {
    try {
      const s = await getGlobalSettings();
      setSettings(s);
    } catch (e) {
      console.error("Failed to load global config");
    }
  };

  // MANDATORY: Entity classifications are derived exclusively from configuration
  const entityClassifications = useMemo(() => {
    return settings?.entityTypes || [];
  }, [settings]);

  const assignedBranchesList = useMemo(() => {
    if (!user) return [];
    if (Array.isArray(user.assignedBranches)) return user.assignedBranches;
    return user.branchName ? [user.branchName] : [];
  }, [user]);

  const filteredSubmissions = useMemo(() => {
    return (submissions || []).filter(sub => {
      const matchesSearch = sub.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || sub.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch = selectedBranch === 'all' || sub.branchName === selectedBranch;
      const matchesStatus = selectedStatus === 'all' || sub.status === selectedStatus;
      const matchesType = selectedType === 'all' || sub.entityType === selectedType;

      return matchesSearch && matchesBranch && matchesStatus && matchesType;
    });
  }, [submissions, searchTerm, selectedBranch, selectedStatus, selectedType]);

  const stats = useMemo(() => {
    const total = filteredSubmissions.length;
    const running = filteredSubmissions.filter(s => s.status === KYC_STATUS.IN_REVIEW).length;
    const completed = filteredSubmissions.filter(s => s.status === KYC_STATUS.APPROVED || s.status === KYC_STATUS.REJECTED).length;
    const pending = filteredSubmissions.filter(s => s.status === KYC_STATUS.SUBMITTED).length;

    const branchBreakdown: Record<string, number> = {};
    filteredSubmissions.forEach(s => {
      branchBreakdown[s.branchName] = (branchBreakdown[s.branchName] || 0) + 1;
    });

    return { total, running, completed, pending, branchBreakdown };
  }, [filteredSubmissions]);

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedBranch("all");
    setSelectedStatus("all");
    setSelectedType("all");
    setDateRange(undefined);
  };

  if (loading || permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Querying Specialist Node...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">My Cases & Performance</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Specialist analysis dashboard and jurisdiction metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="h-12 w-64 bg-white border-slate-200 font-bold rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <SelectValue placeholder="Branch View Mode" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-2xl">
              <SelectItem value="all" className="font-bold">Combined (All Nodes)</SelectItem>
              {assignedBranchesList.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={loadMyCases} className="h-12 w-12 rounded-xl border border-slate-200 bg-white">
            <RotateCcw className="w-5 h-5 text-slate-400" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200 group hover:border-primary/40 transition-all rounded-3xl bg-white overflow-hidden">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Assigned</span>
            <Inbox className="w-3.5 h-3.5 text-primary" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-slate-900 tracking-tighter">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 border-l-4 border-l-blue-500 rounded-3xl bg-white overflow-hidden">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Running (In Review)</span>
            <Activity className="w-3.5 h-3.5 text-blue-600" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-blue-600 tracking-tighter">{stats.running}</div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 rounded-3xl bg-white overflow-hidden">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Completed Verdicts</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-emerald-600 tracking-tighter">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 rounded-3xl bg-white overflow-hidden">
          <CardHeader className="p-4 bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Awaiting Analysis</span>
            <Clock className="w-3.5 h-3.5 text-orange-600" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-5xl font-black text-orange-600 tracking-tighter">{stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <Card className="lg:col-span-1 shadow-md h-fit border-slate-200 rounded-2xl overflow-hidden sticky top-20">
          <CardHeader className="bg-slate-50/80 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" /> Advanced Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500">Global Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Case ID or Customer..." className="pl-9 h-10 border-slate-200 font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500">Workflow Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-10 border-slate-200">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl">
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.values(KYC_STATUS).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500">Account Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-10 border-slate-200">
                  <SelectValue placeholder="All Classifications" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl">
                  <SelectItem value="all">All Types</SelectItem>
                  {entityClassifications.length > 0 ? (
                    entityClassifications.map((type: any) => (
                      <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">No types configured.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" onClick={resetFilters} className="w-full gap-2 font-bold text-slate-400 hover:text-primary">
              <RotateCcw className="w-4 h-4" /> Reset Workspace
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          <Tabs defaultValue="work-queue" className="w-full">
            <TabsList className="bg-slate-100 p-1 border h-12 rounded-xl mb-6">
              <TabsTrigger value="work-queue" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8 h-full rounded-lg">
                <Zap className="w-4 h-4 mr-2" /> Active Work Tray
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8 h-full rounded-lg">
                <History className="w-4 h-4 mr-2" /> Resolved Archive
              </TabsTrigger>
              <TabsTrigger value="nodes" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8 h-full rounded-lg">
                <Building2 className="w-4 h-4 mr-2" /> Jurisdiction Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="work-queue" className="animate-in slide-in-from-bottom-2 duration-300">
              <Card className="shadow-xl border-slate-200 overflow-hidden rounded-[2rem] bg-white">
                <CardHeader className="bg-primary text-white p-6 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black">Technical Work Queue</CardTitle>
                    <CardDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">Pending and in-review institutional cases</CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-white/20 border-white/20 text-white font-black px-4 py-1">
                    {filteredSubmissions.filter(s => ![KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(s.status)).length} Priority Items
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow>
                        <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Case Identifier</TableHead>
                        <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Customer Entity</TableHead>
                        <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Node</TableHead>
                        <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Workflow Status</TableHead>
                        <TableHead className="text-right pr-8 font-black text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubmissions.filter(s => ![KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(s.status)).length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="py-24 text-center italic text-slate-400 bg-slate-50/30">Your active tray is clear. No pending operations discovered.</TableCell></TableRow>
                      ) : filteredSubmissions.filter(s => ![KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(s.status)).map((sub) => (
                        <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors group">
                          <TableCell className="font-black text-primary tabular-nums py-6 pl-8">{sub.id}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 leading-tight">{sub.customerName}</span>
                              <span className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">{sub.entityType?.replace(/_/g, ' ') || 'Individual'} Account</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-slate-600 text-xs">
                            <div className="flex items-center gap-2"><Building2 className="w-3 h-3 text-slate-300" /> {sub.branchName}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "font-black text-[9px] uppercase px-3",
                              sub.status === KYC_STATUS.SUBMITTED ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                            )}>
                              {sub.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <Button size="sm" asChild className="h-9 bg-primary hover:bg-primary/90 text-white font-black text-xs rounded-xl shadow-lg shadow-primary/10">
                              <Link href={`/submissions/${sub.id}`}>Run Analysis <ChevronRight className="w-3.5 h-3.5 ml-1.5" /></Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="animate-in slide-in-from-bottom-2 duration-300">
              <Card className="shadow-xl border-slate-200 overflow-hidden rounded-[2rem] bg-white">
                <CardHeader className="bg-slate-50/50 border-b p-6">
                  <CardTitle className="text-xl">Lifecycle History</CardTitle>
                  <CardDescription>Comprehensive record of your terminal verdicts</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow>
                        <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Case ID</TableHead>
                        <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Customer Entity</TableHead>
                        <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Status</TableHead>
                        <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500 text-right pr-8">Verdict Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubmissions.filter(s => [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(s.status)).length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="py-24 text-center italic text-slate-400">No terminal verdicts recorded in this analysis period.</TableCell></TableRow>
                      ) : filteredSubmissions.filter(s => [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(s.status)).map((sub) => (
                        <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="font-bold text-slate-900 py-5 pl-8 tabular-nums">{sub.id}</TableCell>
                          <TableCell className="font-bold text-slate-700">{sub.customerName}</TableCell>
                          <TableCell>
                            <Badge className={sub.status === KYC_STATUS.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}>
                              {sub.status === KYC_STATUS.APPROVED ? 'Successfully Authorized' : 'Risk Rejected'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-8 text-xs font-bold text-slate-400 tabular-nums">
                            {format(new Date(sub.updatedAt || sub.submittedAt), 'MMM dd, yyyy')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="nodes" className="animate-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(stats.branchBreakdown).map(([branch, count]) => (
                  <Card key={branch} className="shadow-lg border-slate-200 overflow-hidden rounded-3xl group hover:border-primary/40 transition-all bg-white">
                    <CardHeader className="bg-slate-50/50 border-b p-6 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-black text-slate-900">{branch}</CardTitle>
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest mt-1">Jurisdiction Metrics</CardDescription>
                      </div>
                      <div className="p-2.5 bg-primary/5 text-primary rounded-xl group-hover:scale-110 transition-transform">
                        <Building2 className="w-5 h-5" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="flex items-end justify-between">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Portfolio</p>
                          <p className="text-4xl font-black text-slate-900 tracking-tighter">{count} <span className="text-lg text-slate-300 ml-1">Cases</span></p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedBranch(branch)} className="text-primary font-black text-[10px] uppercase tracking-widest h-9 px-4 rounded-lg bg-primary/5 hover:bg-primary hover:text-white">
                          Filter Focus <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
