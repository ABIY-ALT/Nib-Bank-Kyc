'use client';

import { useState, useMemo } from "react";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
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
  Filter, 
  Calendar as CalendarIcon,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FollowUpVerification } from "@/lib/kyc-data";

export default function FollowUpReportsPage() {
  const { toast } = useToast();
  const db = useFirestore();
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedResult, setSelectedResult] = useState<string>("all");
  const [reportDataActive, setReportDataActive] = useState(false);

  const followUpQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collection(db, "follow_up_verifications"),
      where("status", "==", "Completed"),
      orderBy("verifiedAt", "desc")
    );
  }, [db]);

  const { data: allVerifications, loading } = useCollection<FollowUpVerification>(followUpQuery);

  const filteredData = useMemo(() => {
    if (!allVerifications) return [];
    
    const start = startOfDay(new Date(fromDate)).toISOString();
    const end = endOfDay(new Date(toDate)).toISOString();

    return allVerifications.filter(v => {
      const matchesDate = v.verifiedAt && v.verifiedAt >= start && v.verifiedAt <= end;
      const matchesResult = selectedResult === "all" || v.result === selectedResult;
      return matchesDate && matchesResult;
    });
  }, [allVerifications, fromDate, toDate, selectedResult]);

  const handleGenerateReport = () => {
    setReportDataActive(true);
    toast({
      title: "Follow-up Report Compiled",
      description: `Analyzed ${filteredData.length} audit records.`,
    });
  };

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
      v.verifiedAt ? new Date(v.verifiedAt).toLocaleString() : 'N/A',
      v.remarks ? v.remarks.replace(/,/g, ';') : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nib-followup-compliance-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();

    toast({
      title: "Export Successful",
      description: "Institutional audit report has been saved to CSV.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Follow-up Reports</h1>
          <p className="text-muted-foreground text-lg font-medium">Head Office quality control data for regulatory verification and accuracy audits.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-11 px-6 font-bold border-slate-200 bg-white" onClick={() => { setReportDataActive(false); setSelectedResult("all"); }}>
            <History className="w-4 h-4" /> Reset
          </Button>
          <Button 
            className="gap-2 bg-primary hover:bg-primary/90 h-11 px-6 font-bold shadow-lg" 
            disabled={!reportDataActive || filteredData.length === 0}
            onClick={handleExportCSV}
          >
            <ShieldCheck className="w-4 h-4" /> Download Compliance Report
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-xl flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" /> Audit Discovery
          </CardTitle>
          <CardDescription>Filter historical Head Office verifications for institutional reporting.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-10 h-11 font-bold" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">To Date</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-10 h-11 font-bold" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Audit Finding</Label>
              <Select value={selectedResult} onValueChange={setSelectedResult}>
                <SelectTrigger className="h-11"><SelectValue placeholder="All Results" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="Correct" className="text-emerald-600 font-bold">Correct (Compliant)</SelectItem>
                  <SelectItem value="Discrepancy" className="text-orange-600 font-bold">Discrepancy (Errors)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button size="lg" className="px-12 h-14 font-black gap-2 shadow-xl bg-primary hover:bg-primary/90" onClick={handleGenerateReport}>
              <ClipboardCheck className="w-5 h-5" />
              Execute Data Pull
            </Button>
          </div>
        </CardContent>
      </Card>

      {!reportDataActive ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <FileText className="w-12 h-12 text-slate-300" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <p className="font-bold text-slate-900 text-xl">Audit Report Inactive</p>
              <p className="text-sm text-slate-500 font-medium">
                Configure your parameters above and click "Execute Data Pull" to retrieve historical Head Office quality control records.
              </p>
            </div>
          </CardContent>
        </Card>
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
                        {v.verifiedAt ? new Date(v.verifiedAt).toLocaleDateString() : 'N/A'}
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
