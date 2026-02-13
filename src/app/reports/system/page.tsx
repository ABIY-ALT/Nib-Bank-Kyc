
"use client"

import { useState } from "react";
import { 
  Card, 
  CardContent, 
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Globe, 
  History,
  ShieldCheck,
  Building2,
  Users,
  Calendar as CalendarIcon,
  FileDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const MOCK_SYSTEM_STATS = {
  total: 1245,
  approved: 980,
  pending: 185,
  accuracy: "97.2%",
  branches: [
    { name: "Downtown Branch", count: 420 },
    { name: "Uptown Branch", count: 310 },
    { name: "East Side", count: 285 },
    { name: "Northern Branch", count: 230 },
  ],
  officers: [
    { name: "Jane Smith", count: 340 },
    { name: "Robert Brown", count: 310 },
    { name: "Alice Wilson", count: 290 },
    { name: "Local Specialist", count: 185 },
  ]
};

export default function SystemWideReportsPage() {
  const { toast } = useToast();
  const [reportData, setReportData] = useState<any | null>(null);
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const handleGenerateReport = () => {
    setReportData(MOCK_SYSTEM_STATS);
    toast({
      title: "Institutional Audit Complete",
      description: `Analyzed 1,245 system-wide records from ${fromDate} to ${toDate}.`,
    });
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const headers = ['Category', 'Value'];
    const dataRows = [
      ['Total Volume', reportData.total],
      ['Approvals', reportData.approved],
      ['Pending', reportData.pending],
      ['Accuracy', reportData.accuracy]
    ];
    
    reportData.branches.forEach((b: any) => dataRows.push([`Branch: ${b.name}`, b.count]));
    reportData.officers.forEach((o: any) => dataRows.push([`Officer: ${o.name}`, o.count]));
    
    const csvContent = [headers.join(','), ...dataRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-kyc-global-audit-${fromDate}-to-${toDate}.csv`);
    link.click();
    
    toast({
      title: "CSV Export Successful",
      description: "Institutional dataset has been exported for analysis.",
    });
  };

  const handleExportPDF = () => {
    toast({
      title: "Generating Master PDF Bundle",
      description: "Compiling institutional audit records into a secure PDF package...",
    });
  };

  const resetFilters = () => {
    setReportData(null);
    setFromDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    setToDate(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <Globe className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System-wide Compliance</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Master institutional oversight of all branches and specialized staff.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 font-bold h-10 px-6 border-slate-200 bg-white" onClick={resetFilters}>
            <History className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary shadow-xl font-bold h-10 px-6" onClick={handleGenerateReport}>
            <ShieldCheck className="w-4 h-4" />
            Compile Master Audit
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="pl-10 h-11 border-slate-200 focus-visible:ring-primary font-bold"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upto Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="pl-10 h-11 border-slate-200 focus-visible:ring-primary font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!reportData ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 shadow-inner">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-8">
            <div className="relative p-8 bg-white rounded-full shadow-2xl border border-slate-100">
              <Globe className="w-16 h-16 text-primary" />
            </div>
            <div className="max-w-md mx-auto space-y-3">
              <p className="font-extrabold text-slate-900 text-2xl">Network Audit Offline</p>
              <p className="text-slate-500 leading-relaxed font-medium">Run the institutional audit to aggregate data across all network nodes.</p>
            </div>
            <Button size="lg" className="px-12 h-14 font-extrabold text-lg shadow-2xl shadow-primary/20" onClick={handleGenerateReport}>
              Execute Global Aggregation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card className="bg-slate-900 text-white shadow-2xl">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Volume</CardTitle>
               </CardHeader>
               <CardContent>
                 <span className="text-5xl font-black">{reportData.total}</span>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-emerald-600">Approvals</CardTitle>
               </CardHeader>
               <CardContent>
                 <span className="text-5xl font-black text-emerald-600">{reportData.approved}</span>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-orange-600">Pending</CardTitle>
               </CardHeader>
               <CardContent>
                 <span className="text-5xl font-black text-orange-600">{reportData.pending}</span>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-purple-600">Accuracy</CardTitle>
               </CardHeader>
               <CardContent>
                 <span className="text-5xl font-black text-purple-600">{reportData.accuracy}</span>
               </CardContent>
             </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" /> Branch Network
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleExportCSV} className="text-primary font-bold">
                  <FileDown className="w-4 h-4 mr-2" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100/50">
                      <TableHead className="font-bold py-4">Branch</TableHead>
                      <TableHead className="font-bold text-right pr-8">Submissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.branches.map((branch: any) => (
                      <TableRow key={branch.name}>
                        <TableCell className="font-bold text-slate-800 py-4">{branch.name}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="secondary" className="font-bold px-3 py-1">{branch.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Officer Throughput
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleExportCSV} className="text-primary font-bold">
                  <FileDown className="w-4 h-4 mr-2" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100/50">
                      <TableHead className="font-bold py-4">Specialist</TableHead>
                      <TableHead className="font-bold text-right pr-8">Decisions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.officers.map((officer: any) => (
                      <TableRow key={officer.name}>
                        <TableCell className="font-bold text-slate-800 py-4">{officer.name}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="outline" className="font-bold border-primary/20 text-primary px-3 py-1">
                            {officer.count} Reviews
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center pt-8">
            <Button size="lg" className="px-16 h-16 font-bold text-xl gap-3 shadow-2xl" onClick={handleExportPDF}>
              <Download className="w-6 h-6" /> Export Master PDF Bundle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
