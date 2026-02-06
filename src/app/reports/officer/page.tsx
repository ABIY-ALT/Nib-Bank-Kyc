
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
  Users, 
  Download, 
  TrendingUp, 
  History,
  CheckCircle2,
  Clock,
  PieChart as PieChartIcon,
  FileDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MOCK_OFFICER_REPORTS = [
  { name: "Jane Smith", total: 124, approved: 110, amended: 10, rejected: 4, accuracy: 89 },
  { name: "Robert Brown", total: 98, approved: 80, amended: 12, rejected: 6, accuracy: 82 },
  { name: "Alice Wilson", total: 76, approved: 68, amended: 5, rejected: 3, accuracy: 90 },
  { name: "System Auto", total: 45, approved: 45, amended: 0, rejected: 0, accuracy: 100 },
];

export default function OfficerReportsPage() {
  const { toast } = useToast();
  const [reportData, setReportData] = useState<any[] | null>(null);

  const handleGenerateReport = () => {
    setReportData(MOCK_OFFICER_REPORTS);
    toast({
      title: "Staff Audit Complete",
      description: `Analyzed staff historical verification actions.`,
    });
  };

  const handleExportXLSX = () => {
    if (!reportData) return;
    
    const headers = ['Officer Name', 'Total Reviews', 'Approved', 'Amendments', 'Accuracy'];
    const rows = reportData.map(o => [
      o.name, o.total, o.approved, o.amended, `${o.accuracy}%`
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `staff-performance-matrix-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    
    toast({
      title: "Export Successful",
      description: "Staff performance matrix has been saved to CSV.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Staff Productivity Reports</h1>
          <p className="text-muted-foreground text-lg">Audit staff throughput and decision accuracy.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setReportData(null)}>
            <History className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary shadow-lg font-bold" onClick={handleGenerateReport}>
            <PieChartIcon className="w-4 h-4" />
            Compile Staff Analytics
          </Button>
        </div>
      </div>

      {!reportData ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <Users className="w-12 h-12 text-slate-300" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <p className="font-bold text-slate-900 text-xl">No Analysis Active</p>
              <p className="text-sm text-slate-500">
                Generate a staff productivity report to see accuracy and resolution metrics for your KYC specialized team.
              </p>
            </div>
            <Button size="lg" className="px-8 font-bold" onClick={handleGenerateReport}>Start Full Audit</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">System Throughput</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-slate-900">343</span>
                  <div className="p-2 bg-primary/5 rounded-lg">
                    <History className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Resolution Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-blue-600">1.2d</span>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-emerald-600">94%</span>
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xl border-slate-200 overflow-hidden bg-white">
            <CardHeader className="border-b bg-slate-50/30 p-6">
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl font-black text-[#101828] tracking-tight flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-primary" /> Staff Performance Matrix
                </CardTitle>
                <Button 
                  onClick={handleExportXLSX}
                  className="bg-primary hover:bg-primary/90 text-white font-bold h-11 px-6 shadow-md shadow-primary/20 gap-2"
                >
                  <FileDown className="w-5 h-5" /> Export XLSX
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[#F9FAFB]">
                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                    <TableHead className="font-black py-5 text-slate-500 uppercase tracking-widest text-[11px] pl-8">Officer Name</TableHead>
                    <TableHead className="font-black py-5 text-slate-500 uppercase tracking-widest text-[11px]">Total Reviews</TableHead>
                    <TableHead className="font-black py-5 text-emerald-600 uppercase tracking-widest text-[11px]">Approved</TableHead>
                    <TableHead className="font-black py-5 text-[#E67E22] uppercase tracking-widest text-[11px]">Amendments</TableHead>
                    <TableHead className="text-right font-black py-5 text-slate-500 uppercase tracking-widest text-[11px] pr-8">Accuracy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((officer) => (
                    <TableRow key={officer.name} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                      <TableCell className="font-black text-slate-900 py-6 pl-8 text-[15px]">{officer.name}</TableCell>
                      <TableCell className="font-bold text-slate-600 text-[15px]">{officer.total}</TableCell>
                      <TableCell className="text-emerald-600 font-black text-[15px]">{officer.approved}</TableCell>
                      <TableCell className="text-[#E67E22] font-black text-[15px]">{officer.amended}</TableCell>
                      <TableCell className="text-right pr-8">
                        <Badge variant="secondary" className="bg-[#F0F5FF] text-[#3F51B5] border-[#D1E0FF] font-black px-4 py-1 text-[13px] rounded-full shadow-sm">
                          {officer.accuracy}%
                        </Badge>
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
