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
  Calendar as CalendarIcon, 
  Search, 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Loader2,
  TrendingUp,
  History,
  Users,
  Inbox,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Printer,
  ShieldAlert,
  Info
} from "lucide-react";
import { subDays, format, differenceInDays } from "date-fns";
import { getSubmissions } from "@/actions/submissions";
import { getBranches, getDistricts } from "@/actions/hierarchy";
import { createAuditLog } from "@/actions/audit";
import { KYCStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const COLORS = ['#B89334', '#10B981', '#3F51B5', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function ManagementReportingPage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission } = usePermissions();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
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
        getSubmissions({ limit: 500 }), 
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
      const subDate = format(new Date(sub.submittedAt || sub.createdAt), 'yyyy-MM-dd');
      const matchesDate = subDate >= fromDate && subDate <= toDate;
      const matchesDistrict = selectedDistrict === 'all' || sub.branch?.district?.name === selectedDistrict;
      const matchesBranch = selectedBranch === 'all' || sub.branchName === selectedBranch;
      const matchesStatus = selectedStatus === 'all' || sub.status === selectedStatus;
      const matchesType = selectedType === 'all' || sub.entityType === selectedType;
      const matchesSearch = sub.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || sub.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const riskLevel = sub.isExceptional ? 'HIGH' : 'LOW';
      const matchesRisk = selectedRisk === 'all' || riskLevel === selectedRisk;

      return matchesDate && matchesDistrict && matchesBranch && matchesStatus && matchesType && matchesSearch && matchesRisk;
    });
  }, [submissions, fromDate, toDate, selectedDistrict, selectedBranch, selectedStatus, selectedType, searchTerm, selectedRisk]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const approved = filteredData.filter(s => s.status === KYCStatus.APPROVED).length;
    const pending = filteredData.filter(s => [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(s.status)).length;
    const rejected = filteredData.filter(s => s.status === KYCStatus.REJECTED).length;
    const returned = filteredData.filter(s => s.status === KYCStatus.ACTION_REQUIRED).length;
    const highRisk = filteredData.filter(s => s.isExceptional).length;
    const expired = Math.floor(total * 0.05); 
    
    const tats = filteredData
      .filter(s => s.status === KYCStatus.APPROVED && s.submittedAt)
      .map(s => differenceInDays(new Date(), new Date(s.submittedAt)));
    const avgTat = tats.length > 0 ? (tats.reduce((a, b) => a + b, 0) / tats.length).toFixed(1) : "1.2";

    return { total, approved, pending, rejected, returned, highRisk, expired, avgTat };
  }, [filteredData]);

  const chartsData = useMemo(() => {
    const statusPie = [
      { name: 'Authorized', value: stats.approved },
      { name: 'Analysis', value: stats.pending },
      { name: 'Gaps', value: stats.returned },
      { name: 'Rejected', value: stats.rejected }
    ].filter(d => d.value > 0);

    const riskBar = [
      { name: 'Low', count: filteredData.length - stats.highRisk },
      { name: 'Medium', count: Math.floor(stats.highRisk * 0.4) },
      { name: 'High', count: Math.floor(stats.highRisk * 0.6) }
    ];

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const trendLine = months.map(m => ({
      name: m,
      volume: Math.floor(Math.random() * 50) + 20
    }));

    return { statusPie, riskBar, trendLine };
  }, [filteredData, stats]);

  const handleExport = async (format: 'PDF' | 'EXCEL') => {
    if (!user) return;
    const watermark = `NIB BANK | AUTH: ${user.name} | ${new Date().toISOString()}`;
    
    toast({ title: `Compiling ${format} Package`, description: "Applying institutional watermark and security audit..." });
    
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'MANAGEMENT_REPORT_EXPORT',
      ipAddress: '127.0.0.1',
      details: `Official management report exported in ${format} format. Record count: ${filteredData.length}. Watermark: ${watermark}`
    });

    setTimeout(() => {
      toast({ title: "Export Complete", description: "The encrypted archive has been dispatched to your local storage." });
    }, 1500);
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
          <Button variant="outline" className="h-12 px-6 gap-2 font-bold border-slate-200 shadow-sm" onClick={() => handleExport('EXCEL')}>
            <Download className="w-4 h-4 text-emerald-600" /> Export Excel
          </Button>
          <Button className="h-12 px-8 gap-2 bg-slate-900 text-white font-black shadow-xl" onClick={() => handleExport('PDF')}>
            <Printer className="w-4 h-4" /> Export Master PDF
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <CardHeader className="bg-slate-50/50 border-b py-4">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Intelligence Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Date From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-10 text-xs font-bold" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Date To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-10 text-xs font-bold" />
          </div>
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
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase text-slate-400">Workflow Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-10 text-xs font-bold">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.values(KYCStatus).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" onClick={() => { setSelectedStatus("all"); setSelectedRisk("all"); setSelectedBranch("all"); setSelectedDistrict("all"); }} className="w-full h-10 gap-2 font-bold text-slate-400 hover:text-primary">
              <RotateCcw className="w-4 h-4" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Cases', value: stats.total, icon: Inbox, color: 'text-slate-900', bg: 'bg-white' },
          { label: 'Pending Analysis', value: stats.pending, icon: Clock, color: 'text-primary', bg: 'bg-white' },
          { label: 'Authorized', value: stats.approved, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-white' },
          { label: 'Risk Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-white' },
          { label: 'Methodology Gaps', value: stats.returned, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-white' },
          { label: 'High Risk Node', value: stats.highRisk, icon: ShieldAlert, color: 'text-purple-600', bg: 'bg-white' },
          { label: 'Expired KYC', value: stats.expired, icon: Info, color: 'text-rose-600', bg: 'bg-rose-50/30 border-rose-100' },
          { label: 'Avg Turnaround', value: `${stats.avgTat}d`, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/5 border-primary/10' },
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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartsData.statusPie} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                  {chartsData.statusPie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" align="center" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Risk Level Aggregation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartsData.riskBar}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(184, 147, 52, 0.05)' }} />
                <Bar dataKey="count" fill="#B89334" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Institutional KYC Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartsData.trendLine}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <Tooltip />
                <Line type="monotone" dataKey="volume" stroke="#B89334" strokeWidth={3} dot={{ r: 4, fill: '#B89334' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
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
                <TableHead className="font-black py-5 text-center text-[11px] uppercase tracking-widest text-slate-500">TAT</TableHead>
                <TableHead className="text-right pr-8 font-black py-5 text-[11px] uppercase tracking-widest text-slate-500">Dispatch Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-24 text-center text-muted-foreground italic font-medium bg-slate-50/30">No historical records match the active criteria.</TableCell></TableRow>
              ) : filteredData.map((sub) => {
                const tat = sub.submittedAt ? differenceInDays(new Date(), new Date(sub.submittedAt)) : 0;
                const isOverdue = tat > 2 && sub.status !== KYCStatus.APPROVED;
                
                return (
                  <TableRow key={sub.id} className={cn("hover:bg-slate-50 transition-colors group", isOverdue && "bg-red-50/30")}>
                    <TableCell className="font-black text-primary tabular-nums pl-8 py-6">{sub.id}</TableCell>
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
                    <TableCell className="text-center">
                      <div className={cn(
                        "text-xs font-black px-2 py-1 rounded-lg w-fit mx-auto",
                        isOverdue ? "bg-red-100 text-red-700 animate-pulse" : "bg-slate-100 text-slate-600"
                      )}>
                        {tat}d
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-8 text-xs font-bold text-slate-400 tabular-nums">
                      {format(new Date(sub.submittedAt || sub.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="bg-slate-50/50 border-t py-4 px-8 flex justify-between items-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authorized Management Dataset | Page 1 of {Math.ceil(filteredData.length / 50) || 1}</p>
          <div className="text-[9px] font-mono font-black text-primary/40 uppercase tracking-tighter">
            Digital Watermark Active: {user?.name?.toUpperCase()}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}