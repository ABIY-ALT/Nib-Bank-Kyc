
"use client"

import React, { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter 
} from "@/components/ui/card"
import { 
  Users, 
  CheckCircle2, 
  History, 
  Filter, 
  FileDown, 
  TrendingUp,
  Clock,
  Loader2,
  ShieldCheck,
  Search,
  AlertTriangle,
  Zap,
  Inbox,
  ArrowUpRight,
  RotateCcw,
  Target,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  FileText,
  Activity,
  Building2,
  ShieldAlert,
  BarChart3,
  ExternalLink,
  Download,
  Eye,
  MapPin,
  Monitor,
  LayoutGrid,
  Scale
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { format, differenceInHours } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions, updateSubmissionStatus, logBundleDownload, getSubmissionById } from "@/actions/submissions";
import { getAllUsers } from "@/actions/users";
import { getDistricts, getBranches } from "@/actions/hierarchy";
import { getGlobalSettings } from "@/actions/settings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KYCStatus } from "@prisma/client";
import Link from "next/link";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import JSZip from 'jszip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ViewMode = 'officers' | 'branches' | 'cases';

export default function KYCOperationsMonitoringPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('officers');
  const [selectedOfficer, setSelectedOfficer] = useState<any | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  const [isEscalating, setIsEscalating] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState<any | null>(null);

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [dateRange]);

  const loadBaseData = async () => {
    try {
      const [u, d, b, s] = await Promise.all([
        getAllUsers(),
        getDistricts(),
        getBranches(),
        getGlobalSettings()
      ]);
      const kycPersonnel = u.filter((usr: any) => 
        usr.roles?.some((r: any) => 
          ['KYC_OFFICER', 'SUPERVISOR', 'KYC_SPECIALIST', 'KYC_SPECIALIST_OFFICER'].includes(r.role.name)
        )
      );
      setOfficers(kycPersonnel);
      setDistricts(d);
      setBranches(b);
      setSettings(s);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    }
  };

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      let filters: any = { limit: 5000 };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      const data = await getSubmissions(filters);
      setSubmissions(data || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Archive Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleManualEscalation = async (caseId: string) => {
    if (!user) return;
    setIsEscalating(caseId);
    try {
      await updateSubmissionStatus(caseId, KYCStatus.ESCALATED, user.id, "Strategic escalation triggered by supervisor due to oversight threshold breach.");
      toast({ title: "Escalation Successful" });
      await loadSubmissions();
    } catch (e) {
      toast({ variant: "destructive", title: "Escalation Failed" });
    } finally {
      setIsEscalating(null);
    }
  };

  const handleDownloadBundle = async (sub: any) => {
    if (!user) return;
    setIsDownloading(sub.id);
    try {
      const zip = new JSZip();
      const fullSub = await getSubmissionById(sub.id);
      if (fullSub && fullSub.documents?.length > 0) {
        const folder = zip.folder(sub.id);
        for (const doc of fullSub.documents) {
          const res = await fetch(doc.url);
          const blob = await res.blob();
          folder?.file(doc.name, blob);
        }
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CASE_${sub.id}_BUNDLE.zip`;
        link.click();
        await logBundleDownload({
          submissionId: sub.id,
          performedBy: user.name,
          bundleName: `CASE_${sub.id}_BUNDLE`,
          sourceDistrict: sub.branch?.district?.name || "General",
          sourceBranch: sub.branchName
        });
        toast({ title: "Download Successful" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Download Failed" });
    } finally {
      setIsDownloading(null);
    }
  };

  const processedOfficers = useMemo(() => {
    return officers.map(off => {
      const offSubs = submissions.filter(s => s.assignedToId === off.id);
      const approved = offSubs.filter(s => s.status === KYCStatus.APPROVED).length;
      const escalated = offSubs.filter(s => s.status === KYCStatus.ESCALATED).length;
      const amended = offSubs.reduce((acc, s) => acc + (s.amendCycles || 0), 0);
      const branchesMapped = off.assignedBranches?.length || (off.branchName ? 1 : 0);
      
      return { 
        ...off, 
        stats: { total: offSubs.length, approved, escalated, amended, branchesMapped }
      };
    }).filter(off => {
      const matchesName = `${off.firstName} ${off.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDistrict = selectedDistrict === 'all' || off.branch?.district?.name === selectedDistrict;
      const matchesBranch = selectedBranchFilter === 'all' || off.branchName === selectedBranchFilter;
      return matchesName && matchesDistrict && matchesBranch;
    });
  }, [officers, submissions, searchTerm, selectedDistrict, selectedBranchFilter]);

  const currentBranches = useMemo(() => {
    if (!selectedOfficer) return [];
    const bNames = selectedOfficer.assignedBranches?.length > 0 
      ? selectedOfficer.assignedBranches 
      : (selectedOfficer.branchName ? [selectedOfficer.branchName] : []);
    
    return bNames.map((name: string) => {
      const branchSubs = submissions.filter(s => s.branchName === name && s.assignedToId === selectedOfficer.id);
      return {
        name,
        totalFiles: branchSubs.reduce((acc, s) => acc + (s.memos?.length || 0), 0),
        total: branchSubs.length,
        approved: branchSubs.filter(s => s.status === KYCStatus.APPROVED).length,
        amended: branchSubs.reduce((acc, s) => acc + (s.amendCycles || 0), 0),
        pending: branchSubs.filter(s => [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(s.status)).length
      };
    });
  }, [selectedOfficer, submissions]);

  const currentCases = useMemo(() => {
    if (!selectedBranch || !selectedOfficer) return [];
    return submissions.filter(s => s.branchName === selectedBranch && s.assignedToId === selectedOfficer.id);
  }, [selectedBranch, selectedOfficer, submissions]);

  const handleExportCSV = () => {
    const headers = ['Officer', 'Branches', 'Volume', 'Authorized', 'Amended', 'Escalated'];
    const rows = processedOfficers.map(o => [
      `${o.firstName} ${o.lastName}`,
      o.stats.branchesMapped,
      o.stats.total,
      o.stats.approved,
      o.stats.amended,
      o.stats.escalated
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PERFORMANCE_AUDIT_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  if (loading || permissionsLoading) return <div className="py-48 text-center"><Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-primary text-white rounded-[2rem] shadow-2xl">
            <Monitor className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 font-headline tracking-tight">Ops Monitoring</h1>
            <p className="text-muted-foreground text-lg font-medium">Institutional Performance Intelligence Terminal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Button onClick={handleExportCSV} className="h-12 px-8 gap-2 bg-slate-900 text-white font-black rounded-xl shadow-xl hover:bg-black transition-all">
            <FileDown className="w-5 h-5" /> Export performance
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden rounded-[2rem]">
        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Jurisdiction District</Label>
            <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
              <SelectTrigger className="h-12 rounded-xl bg-slate-50/50 border-slate-200 font-bold"><SelectValue placeholder="All Districts" /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Global Network</SelectItem>
                {districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Branch Node</Label>
            <Select value={selectedBranchFilter} onValueChange={setSelectedBranchFilter}>
              <SelectTrigger className="h-12 rounded-xl bg-slate-50/50 border-slate-200 font-bold"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Branches</SelectItem>
                {branches.filter(b => selectedDistrict === 'all' || b.district?.name === selectedDistrict).map(b => (
                  <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Personnel Discovery</Label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search KYC Officer by name..." className="pl-11 h-12 bg-slate-50/50 rounded-xl border-slate-200 font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 bg-slate-100/50 p-2 rounded-2xl w-fit border border-slate-200/50 shadow-inner">
        <Button 
          variant={viewMode === 'officers' ? 'secondary' : 'ghost'} 
          onClick={() => { setViewMode('officers'); setSelectedOfficer(null); setSelectedBranch(null); }}
          className={cn("h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all", viewMode === 'officers' ? "bg-primary text-white shadow-lg" : "text-slate-500")}
        >
          Specialist Matrix
        </Button>
        {selectedOfficer && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <Button 
              variant={viewMode === 'branches' ? 'secondary' : 'ghost'} 
              onClick={() => { setViewMode('branches'); setSelectedBranch(null); }}
              className={cn("h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all", viewMode === 'branches' ? "bg-primary text-white shadow-lg" : "text-slate-500")}
            >
              {selectedOfficer.firstName} {selectedOfficer.lastName}'s Portfolio
            </Button>
          </>
        )}
        {selectedBranch && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <Button 
              variant="secondary" 
              className="h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest bg-primary text-white shadow-lg"
            >
              Node: {selectedBranch}
            </Button>
          </>
        )}
      </div>

      <div className="animate-in slide-in-from-bottom-4 duration-500">
        {viewMode === 'officers' && (
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
            <CardHeader className="bg-slate-900 text-white p-8 border-b">
              <CardTitle className="text-2xl font-black flex items-center gap-3"><Users className="w-6 h-6 text-primary" /> Specialist Analysis Matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead className="py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500">KYC Officer</TableHead>
                    <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Branches Mapped</TableHead>
                    <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Authorized</TableHead>
                    <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Amendment Cycles</TableHead>
                    <TableHead className="text-right pr-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedOfficers.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-32 text-center text-slate-400 italic">No personnel discovered in current filters.</TableCell></TableRow>
                  ) : processedOfficers.map((off) => (
                    <TableRow key={off.id} className="hover:bg-slate-50/80 transition-all border-b border-slate-100 group">
                      <TableCell className="py-8 pl-10">
                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedOfficer(off); setViewMode('branches'); }}>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                            {off.firstName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 leading-none">{off.firstName} {off.lastName}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{off.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-black text-slate-700 text-lg">{off.stats.branchesMapped}</TableCell>
                      <TableCell className="text-center font-black text-emerald-600 text-lg">{off.stats.approved}</TableCell>
                      <TableCell className="text-center font-black text-orange-600 text-lg">{off.stats.amended}</TableCell>
                      <TableCell className="text-right pr-10">
                        <div className="flex justify-end gap-3">
                          <Button variant="ghost" size="icon" onClick={() => setShowSummary(off)} className="h-11 w-11 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"><Eye className="w-5 h-5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedOfficer(off); setViewMode('branches'); }} className="h-11 w-11 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"><ChevronRight className="w-5 h-5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {viewMode === 'branches' && (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
                <CardHeader className="bg-slate-900 text-white p-8">
                  <CardTitle className="text-2xl font-black">Jurisdiction Portfolio</CardTitle>
                  <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Authorized nodes for {selectedOfficer.firstName} {selectedOfficer.lastName}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50 border-b">
                      <TableRow>
                        <TableHead className="py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Branch Node</TableHead>
                        <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Files Sent</TableHead>
                        <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Amend Cycles</TableHead>
                        <TableHead className="text-right pr-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Node Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentBranches.map((b: any) => (
                        <TableRow key={b.name} className="hover:bg-slate-50 transition-colors border-b cursor-pointer group" onClick={() => { setSelectedBranch(b.name); setViewMode('cases'); }}>
                          <TableCell className="py-8 pl-10">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-slate-100 rounded-2xl group-hover:bg-primary/10 group-hover:text-primary transition-colors"><Building2 className="w-5 h-5" /></div>
                              <span className="font-black text-slate-900 text-base">{b.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-black text-slate-700">{b.totalFiles}</TableCell>
                          <TableCell className="text-center font-black text-orange-600">{b.amended}</TableCell>
                          <TableCell className="text-right pr-10">
                            <Badge className={cn("font-black text-[9px] uppercase px-3 py-1", b.pending > 0 ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700")}>
                              {b.pending > 0 ? `${b.pending} ACTIVE` : 'COMPLIANT'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-8">
              <Card className="shadow-xl border-slate-200 overflow-hidden rounded-[2rem] bg-primary/5 border-l-4 border-l-primary">
                <CardHeader className="bg-primary p-6 border-b text-white"><CardTitle className="text-lg font-black uppercase tracking-widest">Personnel Insight</CardTitle></CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center font-black text-2xl text-primary shadow-xl ring-4 ring-white">{selectedOfficer.firstName.charAt(0)}</div>
                    <div>
                      <p className="text-xl font-black text-slate-900">{selectedOfficer.firstName} {selectedOfficer.lastName}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Specialist Official</p>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-6">
                    <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Approved Cases</p><p className="text-3xl font-black text-emerald-600">{selectedOfficer.stats.approved}</p></div>
                    <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Amendment Cycles</p><p className="text-3xl font-black text-orange-600">{selectedOfficer.stats.amended}</p></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {viewMode === 'cases' && (
          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[3rem] bg-white">
            <CardHeader className="bg-slate-900 text-white p-10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-primary/20 rounded-3xl"><Building2 className="w-8 h-8 text-primary" /></div>
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight">Technical Analysis: {selectedBranch}</CardTitle>
                  <CardDescription className="text-slate-400 font-bold text-[11px] uppercase tracking-widest mt-2 flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> View-only administrative mode</CardDescription>
                </div>
              </div>
              <Button variant="outline" onClick={() => setViewMode('branches')} className="bg-white/10 border-white/20 text-white font-black rounded-xl h-12 px-8 hover:bg-white/20"><ChevronLeft className="w-4 h-4 mr-2" /> Back to branches</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 border-b">
                  <TableRow>
                    <TableHead className="py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Case ID</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Customer Entity</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Institutional Oversight</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Workflow Status</TableHead>
                    <TableHead className="text-right pr-10 font-black text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentCases.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-32 text-center text-slate-400 italic">No cases discovered in this node jurisdiction.</TableCell></TableRow>
                  ) : currentCases.map((sub) => {
                    const subTime = new Date(sub.submittedAt || sub.createdAt);
                    const threshold = settings?.escalationHours || 72;
                    const hoursSince = differenceInHours(new Date(), subTime);
                    const isBreached = hoursSince >= threshold && ![KYCStatus.APPROVED, KYCStatus.REJECTED, KYCStatus.ESCALATED].includes(sub.status);
                    
                    return (
                      <TableRow key={sub.id} className={cn("border-b border-slate-100 hover:bg-slate-50/50 transition-colors", isBreached && "bg-red-50/30")}>
                        <TableCell className="py-8 pl-10 font-black text-primary tabular-nums tracking-tighter">{sub.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 leading-tight text-base">{sub.customerName}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{sub.entityType || 'Individual'} account</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isBreached ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-1.5 text-red-600">
                                <ShieldAlert className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Oversight Alert</span>
                              </div>
                              <Button 
                                size="sm" 
                                onClick={() => handleManualEscalation(sub.id)} 
                                disabled={isEscalating === sub.id}
                                className="h-9 px-5 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase rounded-xl shadow-xl shadow-red-200 transition-all active:scale-95"
                              >
                                {isEscalating === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Dispatch Escalation"}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-emerald-600">
                              <ShieldCheck className="w-4 h-4 opacity-50" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Compliant</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "font-black text-[9px] uppercase px-3 py-1",
                            sub.status === KYCStatus.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                          )}>
                            {sub.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex justify-end gap-3">
                            <Button variant="ghost" size="icon" onClick={() => handleDownloadBundle(sub)} disabled={isDownloading === sub.id} className="h-11 w-11 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                              {isDownloading === sub.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            </Button>
                            <Button size="sm" asChild className="h-11 bg-slate-900 text-white font-black text-[10px] uppercase px-8 rounded-xl hover:bg-black transition-all shadow-lg active:scale-95">
                              <Link href={`/submissions/${sub.id}`}>Inspect Case</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!showSummary} onOpenChange={() => setShowSummary(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white">
          <DialogHeader className="p-8 bg-primary text-white space-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><TrendingUp className="w-6 h-6 text-white" /></div>
              <div>
                <DialogTitle className="text-2xl font-black">Specialist Insight</DialogTitle>
                <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest">Weighted performance profile</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-5 p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-16 h-16 rounded-[1.5rem] bg-primary/10 text-primary flex items-center justify-center font-black text-2xl shadow-inner border border-primary/5">{showSummary?.firstName.charAt(0)}</div>
              <div>
                <p className="text-xl font-black text-slate-900 leading-tight">{showSummary?.firstName} {showSummary?.lastName}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Personnel</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Branches</p><p className="text-3xl font-black text-primary">{showSummary?.stats.branchesMapped}</p></div>
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Approved</p><p className="text-3xl font-black text-emerald-600">{showSummary?.stats.approved}</p></div>
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cycles</p><p className="text-3xl font-black text-orange-600">{showSummary?.stats.amended}</p></div>
              <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Escalated</p><p className="text-3xl font-black text-destructive">{showSummary?.stats.escalated}</p></div>
            </div>
            <Button onClick={() => setShowSummary(null)} className="w-full h-14 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all">Close profile</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
