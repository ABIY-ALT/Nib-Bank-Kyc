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
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { getFollowUpVerifications } from "@/actions/follow-up";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

export default function FollowUpReportsPage() {
  const { toast } = useToast();
  
  const [allVerifications, setAllVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getFollowUpVerifications();
      setAllVerifications(data || []);
    } catch (error) {
      toast({ variant: "destructive", title: "Sync Error" });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!allVerifications) return [];
    return allVerifications.filter(v => {
      if (v.status !== 'COMPLETED') return false;
      const matchesResult = selectedResult === "all" || v.result === selectedResult;
      
      let matchesDate = true;
      if (dateRange?.from) {
        const vDate = new Date(v.verifiedAt);
        const start = dateRange.from;
        const end = dateRange.to || dateRange.from;
        matchesDate = vDate >= start && vDate <= end;
      }

      return matchesResult && matchesDate;
    });
  }, [allVerifications, selectedResult, dateRange]);

  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    const headers = ['Audit ID', 'Case ID', 'Customer', 'Branch', 'Result', 'Verified By', 'Date'];
    const rows = filteredData.map(v => [v.id, v.submissionId, v.customerName, v.branch, v.result, v.verifiedBy || 'N/A', format(new Date(v.verifiedAt), 'yyyy-MM-dd')]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-followup-report.csv`);
    link.click();
    toast({ title: "Export Successful" });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Follow up Report</h1>
          <p className="text-muted-foreground text-lg font-medium">Head Office quality control data for regulatory verification.</p>
        </div>
        <div className="flex gap-2">
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <Button variant="outline" className="gap-2 h-12 px-6 border-slate-200 bg-white" onClick={() => { setSelectedResult("all"); setDateRange(undefined); }}><RotateCcw className="w-4 h-4" /> Reset</Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90 h-12 px-6 font-bold shadow-lg text-white" disabled={filteredData.length === 0} onClick={handleExportCSV}><ShieldCheck className="w-4 h-4" /> Download Report</Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-6">
          <div className="space-y-2 max-w-sm">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Audit Finding</Label>
            <Select value={selectedResult} onValueChange={setSelectedResult}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="All Results" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="Correct">Correct (Compliant)</SelectItem>
                <SelectItem value="Discrepancy">Discrepancy (Errors)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-40 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>
      ) : (
        <Card className="border-slate-200 shadow-xl overflow-hidden rounded-[2rem] bg-white">
          <CardHeader className="bg-primary text-white p-6 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <ClipboardCheck className="w-6 h-6 text-white" />
                Quality Control Log
              </CardTitle>
            </div>
            <Badge variant="outline" className="bg-white/20 border-white/40 text-white font-black px-4 h-8">{filteredData.length} Records</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-black py-4 pl-8 text-[11px] uppercase">Audit ID</TableHead>
                  <TableHead className="font-black text-[11px] uppercase">Customer / Case</TableHead>
                  <TableHead className="font-black text-center text-[11px] uppercase">Result</TableHead>
                  <TableHead className="font-black text-[11px] uppercase">Verified By</TableHead>
                  <TableHead className="font-black text-right pr-8 text-[11px] uppercase">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((v) => (
                  <TableRow key={v.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <TableCell className="font-bold text-primary py-5 pl-8">{v.id}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{v.customerName}</span>
                        <span className="text-[10px] font-black uppercase text-slate-400">{v.submissionId}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={v.result === 'Correct' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}>{v.result}</Badge>
                    </TableCell>
                    <TableCell className="font-bold text-slate-700">{v.verifiedBy || 'System'}</TableCell>
                    <TableCell className="text-right pr-8 text-xs font-bold text-slate-500">{v.verifiedAt ? format(new Date(v.verifiedAt), 'MMM dd, yyyy') : 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
