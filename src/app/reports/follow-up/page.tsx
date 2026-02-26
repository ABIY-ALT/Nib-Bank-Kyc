'use client';

import { useState, useMemo, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardCheck, 
  Download, 
  History,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Calendar as CalendarIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFollowUpVerifications } from "@/actions/follow-up";

export default function FollowUpReportsPage() {
  const { toast } = useToast();
  
  const [allVerifications, setAllVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedResult, setSelectedResult] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getFollowUpVerifications();
      setAllVerifications(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Sync Error", description: "Failed to fetch audit data." });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!allVerifications) return [];
    
    const start = startOfDay(new Date(fromDate));
    const end = endOfDay(new Date(toDate));

    return allVerifications.filter(v => {
      if (v.status !== 'COMPLETED') return false;
      
      const verifiedDate = new Date(v.verifiedAt);
      const matchesDate = verifiedDate >= start && verifiedDate <= end;
      const matchesResult = selectedResult === "all" || v.result === selectedResult;
      
      return matchesDate && matchesResult;
    });
  }, [allVerifications, fromDate, toDate, selectedResult]);

  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    
    const headers = ['Audit ID', 'Case ID', 'Customer', 'Branch', 'Result', 'Verified By', 'Date', 'Remarks'];
    const rows = filteredData.map(v => [
      v.id,
      v.submissionId,
      v.customerName,
      v.branch,
      v.result,
      v.verifiedBy || 'N/A',
      v.verifiedAt ? format(new Date(v.verifiedAt), 'yyyy-MM-dd HH:mm:ss') : 'N/A',
      v.remarks ? v.remarks.replace(/,/g, ';') : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-followup-compliance-report-${format(new Date(), 'yyyyMMdd')}.csv`);
    link.click();

    toast({
      title: "Export Successful",
      description: "Institutional follow up report has been saved to CSV.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Follow up Report</h1>
          <p className="text-muted-foreground text-lg font-medium">Head Office quality control data for regulatory verification and accuracy audits.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-11 px-6 font-bold border-slate-200 bg-white" onClick={() => { setSelectedResult("all"); setFromDate(format(subDays(new Date(), 30), 'yyyy-MM-dd')); setToDate(format(new Date(), 'yyyy-MM-dd')); }}>
            <History className="w-4 h-4" /> Reset
          </Button>
          <Button 
            className="gap-2 bg-primary hover:bg-primary/90 h-11 px-6 font-bold shadow-lg" 
            disabled={filteredData.length === 0}
            onClick={handleExportCSV}
          >
            <ShieldCheck className="w-4 h-4" /> Download Report
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">To Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Audit Finding</Label>
                <Select value={selectedResult} onValueChange={setSelectedResult}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="All Results" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Results</SelectItem>
                    <SelectItem value="Correct" className="text-emerald-600 font-bold">Correct (Compliant)</SelectItem>
                    <SelectItem value="Discrepancy" className="text-orange-600 font-bold">Discrepancy (Errors)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Compiling Audit Records...</p>
        </div>
      ) : (
        <Card className="border-slate-200 shadow-xl animate-in slide-in-from-top-4 duration-500 overflow-hidden">
          <CardHeader className="bg-slate-900 text-white p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-bold tracking-tight flex items-center gap-3">
                  <ClipboardCheck className="w-6 h-6 text-primary" />
                  Quality Control Log
                </CardTitle>
                <p className="text-slate-400 text-sm font-medium">Head Office audits from {fromDate} to {toDate}</p>
              </div>
              <Badge variant="outline" className="bg-primary/20 text-white border-primary/40 font-black px-4 h-8">
                {filteredData.length} Validated Records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-black py-4 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Audit Node</TableHead>
                    <TableHead className="font-black py-4 text-[11px] uppercase tracking-widest text-slate-500">Customer / Case</TableHead>
                    <TableHead className="font-black py-4 text-[11px] uppercase tracking-widest text-slate-500 text-center">Result</TableHead>
                    <TableHead className="font-black py-4 text-[11px] uppercase tracking-widest text-slate-500">Verified By</TableHead>
                    <TableHead className="font-black py-4 text-[11px] uppercase tracking-widest text-slate-500 text-right pr-8">Audit Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((v) => (
                    <TableRow key={v.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                      <TableCell className="font-bold text-primary tabular-nums py-5 pl-8">{v.id}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{v.customerName}</span>
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{v.submissionId} • {v.branch}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={v.result === 'Correct' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-orange-50 text-orange-700 border-orange-100'}>
                          {v.result === 'Correct' ? <CheckCircle2 className="w-3 h-3 mr-1.5" /> : <AlertTriangle className="w-3 h-3 mr-1.5" />}
                          {v.result}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-slate-700">{v.verifiedBy || 'System'}</TableCell>
                      <TableCell className="text-right pr-8 text-xs font-bold text-slate-500 tabular-nums">
                        {v.verifiedAt ? format(new Date(v.verifiedAt), 'MMM dd, yyyy') : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-20 text-center text-muted-foreground font-medium italic">
                        No quality control data matches your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
