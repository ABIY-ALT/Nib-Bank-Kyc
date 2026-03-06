
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  Legend
} from 'recharts';
import { 
  FileBarChart, 
  Download, 
  Filter, 
  Search, 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Loader2,
  TrendingUp,
  History,
  Inbox,
  CheckCircle2,
  RotateCcw,
  ShieldAlert
} from "lucide-react";
import { format, differenceInDays, startOfMonth, eachMonthOfInterval, isSameMonth, subDays } from "date-fns";
import { getSubmissions } from "@/actions/submissions";
import { getBranches, getDistricts } from "@/actions/hierarchy";
import { createAuditLog } from "@/actions/audit";
import { KYCStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const COLORS = ['#B89334', '#10B981', '#3F51B5', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function ManagementReportingPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadInstitutionalData();
  }, [user]);

  const loadInstitutionalData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [subs, b, d] = await Promise.all([
        getSubmissions({ limit: 5000 }), 
        getBranches(),
        getDistricts()
      ]);
      setSubmissions(subs);
      setBranches(b);
      setDistricts(d);
    } catch (e) {
      toast({ variant: "destructive", title: "Archive Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return submissions.filter(sub => {
      const matchesDistrict = selectedDistrict === 'all' || sub.branch?.district?.name === selectedDistrict;
      const matchesBranch = selectedBranch === 'all' || sub.branchName === selectedBranch;
      const matchesStatus = selectedStatus === 'all' || sub.status === selectedStatus;
      const matchesType = selectedType === 'all' || sub.entityType === selectedType;
      const matchesSearch = sub.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || sub.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const riskLevel = sub.isExceptional ? 'HIGH' : 'LOW';
      const matchesRisk = selectedRisk === 'all' || riskLevel === selectedRisk;

      return matchesDistrict && matchesStatus && matchesType && matchesSearch && matchesRisk;
    });
  }, [submissions, selectedDistrict, selectedStatus, selectedType, searchTerm, selectedRisk]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const approved = filteredData.filter(s => s.status === KYCStatus.APPROVED).length;
    const pending = filteredData.filter(s => [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(s.status)).length;
    const rejected = filteredData.filter(s => s.status === KYCStatus.REJECTED).length;
    const returned = filteredData.filter(s => s.status === KYCStatus.ACTION_REQUIRED).length;
    const highRisk = filteredData.filter(s => s.isExceptional).length;
    
    const branchBreakdown: Record<string, number> = {};
    filteredData.forEach(s => {
      branchBreakdown[s.branchName] = (branchBreakdown[s.branchName] || 0) + 1;
    });

    const tats = filteredData
      .filter(s => s.status === KYCStatus.APPROVED && s.submittedAt)
      .map(s => differenceInDays(new Date(), new Date(s.submittedAt)));
    const avgTat = tats.length > 0 ? (tats.reduce((a, b) => a + b, 0) / tats.length).toFixed(1) : "1.2";

    return { total, approved, pending, rejected, returned, highRisk, avgTat, branchBreakdown };
  }, [filteredData]);

  const chartsData = useMemo(() => {
    const statusPie = [
      { name: 'Authorized', value: stats.approved },
      { name: 'Analysis', value: stats.pending },
      { name: 'Gaps', value: stats.returned },
      { name: 'Rejected', value: stats.rejected }
    ].filter(d => d.value > 0);

    const riskBar = [
      { name: 'Standard', count: filteredData.filter(s => !s.isExceptional).length },
      { name: 'High Risk', count: filteredData.filter(s => s.isExceptional).length }
    ];

    // Real trend line calculation (last 6 months)
    const end = new Date();
    const start = startOfMonth(subDays(end, 180));
    const months = eachMonthOfInterval({ start, end });
    
    const trendLine = months.map(m => {
      const monthLabel = format(m, 'MMM yy');
      const count = filteredData.filter(s => isSameMonth(new Date(s.submittedAt || s.createdAt), m)).length;
      return { name: monthLabel, volume: count };
    });

    return { statusPie, riskBar, trendLine };
  }, [filteredData, stats]);

  const handleExportExcel = async () => {
    if (!user) return;
    
    toast({ title: "Compiling Spreadsheet", description: "Filtering active dataset for export..." });
    const headers = ['Case ID', 'Customer Name', 'Status', 'Branch', 'District', 'Risk Level', 'Account Type', 'Submitted At'];
    const rows = filteredData.map(sub => [
      sub.id,
      sub.customerName,
      sub.status,
      sub.branchName,
      sub.branch?.district?.name || 'N/A',
      sub.isExceptional ? 'High' : 'Standard',
      sub.entityType || 'Individual',
      sub.submittedAt ? format(new Date(sub.submittedAt), 'yyyy-MM-dd HH:mm:ss') : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `NIB_KYC_REPORT_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'MANAGEMENT_REPORT_EXPORT',
      ipAddress: '127.0.0.1',
      details: `Official management report exported in Excel (CSV) format. Record count: ${filteredData.length}.`
    });
  };

  const getRiskBadge = (sub: any) => {
    if (sub.isExceptional) return <Badge className="bg-red-50 text-red-700 border-red-100 font-black text-[9px] uppercase">High Risk</Badge>;
    return <Badge variant="outline" className="text-slate-400 font-bold text-[9px] uppercase">Standard</Badge>;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Intelligence Deck...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
            <FileBarChart className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Management Reporting</h1>
            <p className="text-muted-foreground text-lg font-medium">Institutional performance analytics and risk oversight console.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button className="h-12 px-8 gap-3 bg-primary text-white font-black shadow-xl rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98]" onClick={handleExportExcel}>
            <Download className="w-5 h-5" /> Export Data (CSV)
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <CardHeader className="bg-slate-50/50 border-b py-4">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Intelligence Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Regional District</Label>
            <Select value={selectedDistrict} onValueChange={setSelectedDistrict} disabled={!isSuperAdmin}>
              <SelectTrigger className="h-10 text-xs font-bold">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Global Network</SelectItem>
                {districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Risk Level</Label>
            <Select value={selectedRisk} onValueChange={setSelectedRisk}>
              <SelectTrigger className="h-10 text-xs font-bold">
                <SelectValue placeholder="All Risks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Profiles</SelectItem>
                <SelectItem value="LOW">Standard / Low</SelectItem>
                <SelectItem value="HIGH">High Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Workflow Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-10 text-xs font-bold">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.values(KYCStatus).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" onClick={() => { setSelectedStatus("all"); setSelectedRisk("all"); setSelectedDistrict("all"); }} className="w-full h-10 gap-2 font-bold text-slate-400 hover:text-primary">
              <RotateCcw className="w-4 h-4" /> Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Cases', value: stats.total, icon: Inbox, color: 'text-slate-900', bg: 'bg-white' },
          { label: 'Pending Analysis', value: stats.pending, icon: Clock, color: 'text-primary', bg: 'bg-white' },
          { label: 'Authorized', value: stats.approved, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-white' },
          { label: 'Methodology Gaps', value: stats.returned, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-white' },
        ].map((item, i) => (
          <Card key={i} className={cn("shadow-lg border-slate-200 overflow-hidden group hover:scale-[1.02] transition-all", item.bg)}>
            <CardHeader className="p-4 pb-2 border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{item.label}</span>
                <item.icon className={cn("w-4 h-4", item.color)} />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className={cn("text-4xl font-black tracking-tighter", item.color)}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Workflow Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            {chartsData.statusPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartsData.statusPie} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                    {chartsData.statusPie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No data available for chart.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Risk Level Aggregation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            {stats.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartsData.riskBar}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(184, 147, 52, 0.05)' }} />
                  <Bar dataKey="count" fill="#B89334" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No risk data available.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Institutional KYC Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            {filteredData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartsData.trendLine}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="volume" stroke="#B89334" strokeWidth={3} dot={{ r: 4, fill: '#B89334' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 italic text-sm">No trend data available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-3xl bg-white">
        <CardHeader className="bg-slate-900 text-white border-b flex flex-row items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-2xl">
              <History className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black">Lifecycle Audit Log</CardTitle>
              <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Institutional record of verified entities.</CardDescription>
            </div>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search archive..." 
              className="pl-11 h-11 bg-white/5 border-white/10 text-white font-bold rounded-2xl focus-visible:ring-primary/20"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Case ID</TableHead>
                <TableHead className="font-black py-5 text-[11px] uppercase tracking-widest text-slate-500">Customer Entity</TableHead>
                <TableHead className="font-black py-5 text-[11px] uppercase tracking-widest text-slate-500">Authorized Node</TableHead>
                <TableHead className="font-black py-5 text-center text-[11px] uppercase tracking-widest text-slate-500">Risk Profile</TableHead>
                <TableHead className="font-black py-5 text-[11px] uppercase tracking-widest text-slate-500">Verdict Status</TableHead>
                <TableHead className="text-right pr-8 font-black py-5 text-[11px] uppercase tracking-widest text-slate-500">Dispatch Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-24 text-center text-muted-foreground italic font-medium bg-slate-50/30">No historical records match the active criteria.</TableCell></TableRow>
              ) : filteredData.slice(0, 50).map((sub) => (
                <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors group">
                  <TableCell className="font-black text-primary tabular-nums py-6 pl-8">{sub.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 leading-tight">{sub.customerName}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{sub.entityType || 'Individual'} Account</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-slate-600 flex items-center gap-2 py-6">
                    <Building2 className="w-3.5 h-3.5 text-slate-300" /> {sub.branchName}
                  </TableCell>
                  <TableCell className="text-center">{getRiskBadge(sub)}</TableCell>
                  <TableCell>
                    <Badge className={cn(
                      "font-black text-[9px] uppercase px-3 py-1",
                      sub.status === KYCStatus.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600'
                    )}>
                      {sub.status?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8 text-xs font-bold text-slate-400 tabular-nums">
                    {sub.submittedAt ? format(new Date(sub.submittedAt), 'MMM dd, yyyy') : 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="bg-slate-50/50 border-t py-4 px-8 flex justify-between items-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authorized Management Dataset | Viewing {Math.min(50, filteredData.length)} Records</p>
          <div className="text-[9px] font-mono font-black text-primary/40 uppercase tracking-tighter">
            Digital Watermark Active: {user?.name?.toUpperCase()}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
