
"use client"

import { useState } from "react";
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
  FileText, 
  Download, 
  Filter, 
  Calendar as CalendarIcon,
  Search,
  Building2,
  Map
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MOCK_REPORT_RECORDS = [
  { id: "KYC-8291", customerName: "Global Tech Solutions", branch: "Downtown", status: "Approved", date: "2024-03-21" },
  { id: "KYC-1022", customerName: "Sarah Jenkins", branch: "Uptown", status: "Pending", date: "2024-03-20" },
  { id: "KYC-3341", customerName: "Marcus Thorne", branch: "Downtown", status: "Amended", date: "2024-03-19" },
  { id: "KYC-5562", customerName: "Precision Logistics", branch: "East Side", status: "Approved", date: "2024-03-18" },
  { id: "KYC-9901", customerName: "Elena Rodriguez", branch: "Valley Branch", status: "Escalated", date: "2024-03-17" },
];

export default function BranchReportsPage() {
  const { toast } = useToast();
  const [selectedDistrict, setSelectedDistrict] = useState("All Districts");
  const [selectedBranch, setSelectedBranch] = useState("All Branches");
  const [reportData, setReportData] = useState<any[] | null>(null);

  const handleGenerateReport = () => {
    setReportData(MOCK_REPORT_RECORDS);
    toast({
      title: "Report Generated",
      description: `Found ${MOCK_REPORT_RECORDS.length} matching records.`,
    });
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const headers = ['Case ID', 'Customer', 'Branch', 'Status', 'Date'];
    const csvContent = [
      headers.join(','),
      ...reportData.map(record => 
        [record.id, record.customerName, record.branch, record.status, record.date].map(val => `"${val}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `nib-kyc-branch-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: "Branch report has been saved to CSV.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Compliance Reporting</h1>
          <p className="text-muted-foreground text-lg font-medium">Generate audit-ready analytical reports for branches and districts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-11 px-6 font-bold border-slate-200 bg-white" onClick={() => { setReportData(null); setSelectedDistrict("All Districts"); setSelectedBranch("All Branches"); }}>
            <Filter className="w-4 h-4" /> Reset
          </Button>
          <Button 
            className="gap-2 bg-primary hover:bg-primary/90 h-11 px-6 font-bold shadow-lg" 
            disabled={!reportData}
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4" /> Export Report
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-xl flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" /> Report Parameters
          </CardTitle>
          <CardDescription>Configure the scope and filters for the data aggregation.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Map className="w-3 h-3" /> Regional District
              </label>
              <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Districts">All Districts</SelectItem>
                  <SelectItem value="Central">Central</SelectItem>
                  <SelectItem value="Northern">Northern</SelectItem>
                  <SelectItem value="Southern">Southern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="w-3 h-3" /> Specific Branch
              </label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Branches">All Branches</SelectItem>
                  <SelectItem value="Downtown">Downtown</SelectItem>
                  <SelectItem value="Uptown">Uptown</SelectItem>
                  <SelectItem value="East Side">East Side</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon className="w-3 h-3" /> Time Horizon
              </label>
              <Button variant="outline" className="w-full h-11 justify-start text-left font-normal border-slate-200 bg-slate-50/50" disabled>
                Last 30 Days (Standard Audit)
              </Button>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button size="lg" className="px-12 h-14 font-bold gap-2 shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90" onClick={handleGenerateReport}>
              <FileText className="w-5 h-5" />
              Generate Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {reportData && (
        <Card className="border-slate-200 shadow-xl animate-in slide-in-from-top-4 duration-500 overflow-hidden">
          <CardHeader className="bg-slate-900 text-white rounded-t-lg p-6">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">Report: {selectedDistrict} / {selectedBranch}</CardTitle>
                <p className="text-slate-400 text-sm mt-1 font-medium">Generated for institutional audit on {new Date().toLocaleDateString()}</p>
              </div>
              <Badge variant="outline" className="bg-primary/20 text-white border-primary/40 font-bold px-4 h-8">
                {reportData.length} Records Found
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-8">
            <div className="border rounded-xl overflow-hidden shadow-inner bg-white">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-bold py-4 text-slate-600">Case ID</TableHead>
                    <TableHead className="font-bold text-slate-600">Customer Details</TableHead>
                    <TableHead className="font-bold text-slate-600">Originating Branch</TableHead>
                    <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
                    <TableHead className="font-bold text-slate-600">Review Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((sub) => (
                    <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-bold text-primary tabular-nums">{sub.id}</TableCell>
                      <TableCell className="font-bold text-slate-900">{sub.customerName}</TableCell>
                      <TableCell className="font-medium text-slate-600">{sub.branch}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-bold text-[10px] uppercase tracking-widest px-3">
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-bold tabular-nums">{sub.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
