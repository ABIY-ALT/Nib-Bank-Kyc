
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
  Users, 
  CheckCircle2, 
  History, 
  Filter, 
  FileDown, 
  Calendar as CalendarIcon, 
  TrendingUp,
  Clock,
  Loader2,
  ShieldCheck,
  UserCheck,
  Search
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function OfficerPerformancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadData();
  }, [fromDate, toDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSubmissions({
        startDate: fromDate,
        endDate: toDate
      });
      setSubmissions(data);
    } catch (e) {
      toast({ variant: "destructive", title: "Audit Error" });
    } finally {
      setLoading(false);
    }
  };

  const performanceMatrix = useMemo(() => {
    const matrix: Record<string, any> = {};
    
    submissions.forEach(sub => {
      if (!sub.assignedToId) return;

      const officerName = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
      const officerId = sub.assignedToId;
      
      if (!matrix[officerId]) {
        matrix[officerId] = { 
          id: officerId, 
          name: officerName, 
          total: 0, 
          approved: 0, 
          amended: 0, 
          rejected: 0 
        };
      }
      
      matrix[officerId].total++;
      if (['ACTIVE', 'GOVERNANCE_APPROVED', 'APPROVED'].includes(sub.status)) matrix[officerId].approved++;
      if (['ACTION_REQUIRED', 'AMENDED'].includes(sub.status)) matrix[officerId].amended++;
      if (sub.status === 'REJECTED') matrix[officerId].rejected++;
    });

    return Object.values(matrix)
      .map(o => ({
        ...o,
        accuracy: o.total > 0 ? Math.round((o.approved / o.total) * 100) : 0
      }))
      .filter(o => selectedOfficers.length === 0 || selectedOfficers.includes(o.id))
      .sort((a, b) => b.total - a.total);
  }, [submissions, selectedOfficers]);

  const OFFICER_LIST = useMemo(() => {
    const list: Record<string, string> = {};
    submissions.forEach(sub => {
      if (sub.assignedToId) {
        list[sub.assignedToId] = `${sub.assignedTo.firstName} ${sub.assignedTo.lastName}`;
      }
    });
    return Object.entries(list).map(([id, name]) => ({ id, name }));
  }, [submissions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary text-white rounded-lg shadow-lg"><TrendingUp className="w-6 h-6" /></div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Specialist Productivity</h1>
            <p className="text-muted-foreground text-lg font-medium">Monitoring throughput and determination accuracy for KYC specialists.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={loading}>
              <Button variant="outline" className="gap-2 h-11 px-6 border-slate-200 bg-white font-bold shadow-sm">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Specialists
                {selectedOfficers.length > 0 && (
                  <Badge className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-black">{selectedOfficers.length}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personnel Scope</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {OFFICER_LIST.map((officer) => (
                <DropdownMenuCheckboxItem 
                  key={officer.id} 
                  checked={selectedOfficers.includes(officer.id)} 
                  onCheckedChange={() => setSelectedOfficers(prev => prev.includes(officer.id) ? prev.filter(x => x !== officer.id) : [...prev, officer.id])}
                >
                  {officer.name}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSelectedOfficers([])} className="text-destructive font-bold cursor-pointer">Clear Selections</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button className="gap-2 h-11 px-6 bg-slate-900 text-white font-bold shadow-lg" onClick={() => toast({ title: "Exporting spreadsheet..." })}>
            <FileDown className="w-4 h-4" /> Export Report
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upto Date</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-10 h-11 border-slate-200 font-bold" />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Aggregating Intelligence...</p>
        </div>
      ) : performanceMatrix.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-32 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <ShieldCheck className="w-12 h-12 text-slate-200" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <p className="font-bold text-slate-900 text-2xl tracking-tight">Productivity Pool Empty</p>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                No determinations have been recorded by specialists in this timeframe. Check the SQL Archive for historical records.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-lg border-slate-200 bg-white overflow-hidden group hover:border-primary/40 transition-all">
              <CardHeader className="pb-2 bg-slate-50/50 border-b">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Determinations</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex items-center justify-between">
                <span className="text-5xl font-black text-slate-900 tracking-tighter">{performanceMatrix.reduce((acc, o) => acc + o.total, 0)}</span>
                <History className="w-8 h-8 text-primary opacity-20" />
              </CardContent>
            </Card>
            <Card className="shadow-lg border-slate-200 border-l-4 border-l-emerald-500 bg-white overflow-hidden">
              <CardHeader className="pb-2 bg-slate-50/50 border-b">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Decision Accuracy</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex items-center justify-between">
                <span className="text-5xl font-black text-emerald-600 tracking-tighter">
                  {Math.round(performanceMatrix.reduce((acc, o) => acc + o.accuracy, 0) / performanceMatrix.length)}%
                </span>
                <CheckCircle2 className="w-8 h-8 text-emerald-600 opacity-20" />
              </CardContent>
            </Card>
            <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500 bg-white overflow-hidden">
              <CardHeader className="pb-2 bg-slate-50/50 border-b">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Amendments Issued</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex items-center justify-between">
                <span className="text-5xl font-black text-orange-600 tracking-tighter">{performanceMatrix.reduce((acc, o) => acc + o.amended, 0)}</span>
                <Clock className="w-8 h-8 text-orange-600 opacity-20" />
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-2xl border-slate-200 overflow-hidden bg-white">
            <CardHeader className="border-b bg-slate-50/30 p-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-3 font-headline">
                  <UserCheck className="w-6 h-6 text-primary" /> Specialist Performance Matrix
                </CardTitle>
                <CardDescription>Individual accuracy and resolution metrics derived from SQL determinations.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-white text-slate-500 font-black px-4 py-1 border-slate-200 shadow-sm">
                {performanceMatrix.length} Specialists Audited
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-black py-5 pl-8 text-slate-500 text-[11px] uppercase tracking-widest">Specialist Name</TableHead>
                    <TableHead className="font-black py-5 text-slate-500 text-[11px] uppercase tracking-widest text-center">Total Reviews</TableHead>
                    <TableHead className="font-black py-5 text-emerald-600 text-[11px] uppercase tracking-widest text-center">Approved</TableHead>
                    <TableHead className="font-black py-5 text-orange-600 text-[11px] uppercase tracking-widest text-center">Amended</TableHead>
                    <TableHead className="text-right font-black py-5 pr-8 text-slate-500 text-[11px] uppercase tracking-widest">Accuracy Index</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceMatrix.map((officer) => (
                    <TableRow key={officer.id} className="hover:bg-slate-50 transition-colors group">
                      <TableCell className="font-black text-slate-900 py-6 pl-8 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shadow-sm">
                          {officer.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span>{officer.name}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase">KYC Specialist</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold text-slate-700">{officer.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-black px-3 py-1">
                          {officer.approved}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-black px-3 py-1">
                          {officer.amended}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={cn(
                            "font-black text-sm",
                            officer.accuracy >= 90 ? "text-emerald-600" : officer.accuracy >= 70 ? "text-primary" : "text-orange-600"
                          )}>{officer.accuracy}%</span>
                          <Progress value={officer.accuracy} className="w-24 h-1.5 bg-slate-100" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
