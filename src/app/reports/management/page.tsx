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
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    loadInstitutionalData();
  }, [user, dateRange]);

  const loadInstitutionalData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let filters: any = { limit: 5000 };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }

      const [subs, b, d] = await Promise.all([
        getSubmissions(filters), 
        getBranches(),
        getDistricts()
      ]);
      setSubmissions(subs || []);
      setBranches(b || []);
      setDistricts(d || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Archive Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return submissions.filter(sub => {
      const matchesDistrict = selectedDistrict === 'all' || sub.branch?.district?.name === selectedDistrict;
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
    
    const branchBreakdown: Record<string, number> = {};
    filteredData.forEach(s => {
      branchBreakdown[s.branchName] = (branchBreakdown[s.branchName] || 0) + 1;
    });

    return { total, approved, pending, rejected, returned, branchBreakdown };
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

    const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `NIB_KYC_REPORT_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
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
            <Button variant="ghost" onClick={() => { setSelectedStatus("all"); setSelectedRisk("all"); setSelectedDistrict("all"); setDateRange(undefined); }} className="w-full h-10 gap-2 font-bold text-slate-400 hover:text-primary">
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
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <History className="w-5 h-5 text-white" /> Workflow Distribution
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
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-white" /> Risk Level Aggregation
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
          <CardHeader className="bg-primary text-white p-6 border-b">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-white" /> Institutional KYC Trend
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
    </div>
  );
}
