
"use client"

import { useState, useMemo } from "react";
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
  TrendingUp, 
  History,
  CheckCircle2,
  Clock,
  PieChart as PieChartIcon,
  FileDown,
  Filter,
  Calendar as CalendarIcon,
  ChevronDown
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const MOCK_OFFICER_REPORTS = [
  { name: "Jane Smith", total: 124, approved: 110, amended: 10, rejected: 4, accuracy: 89 },
  { name: "Robert Brown", total: 98, approved: 80, amended: 12, rejected: 6, accuracy: 82 },
  { name: "Alice Wilson", total: 76, approved: 68, amended: 5, rejected: 3, accuracy: 90 },
  { name: "System Auto", total: 45, approved: 45, amended: 0, rejected: 0, accuracy: 100 },
];

export default function OfficerReportsPage() {
  const { toast } = useToast();
  const [reportDataActive, setReportDataActive] = useState(false);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState("all");

  const OFFICER_NAMES = MOCK_OFFICER_REPORTS.map(o => o.name);

  const filteredData = useMemo(() => {
    return MOCK_OFFICER_REPORTS.filter(o => {
      const matchesOfficer = selectedOfficers.length === 0 || selectedOfficers.includes(o.name);
      return matchesOfficer;
    });
  }, [selectedOfficers]);

  const handleGenerateReport = () => {
    setReportDataActive(true);
    toast({
      title: "Staff Audit Complete",
      description: `Analyzed ${filteredData.length} specialist records for the selected period.`,
    });
  };

  const handleExportXLSX = () => {
    if (!reportDataActive || filteredData.length === 0) return;
    
    const headers = ['Officer Name', 'Total Reviews', 'Approved', 'Amendments', 'Accuracy'];
    const rows = filteredData.map(o => [
      o.name, o.total, o.approved, o.amended, `${o.accuracy}%`
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `staff-productivity-audit-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    
    toast({
      title: "Export Successful",
      description: "Personnel productivity matrix has been saved to CSV.",
    });
  };

  const toggleOfficer = (name: string) => {
    setSelectedOfficers(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const timeRangeLabel = {
    all: "Full Archive",
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    "90d": "Current Quarter"
  }[timeRange];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Staff Productivity Reports</h1>
          <p className="text-muted-foreground text-lg">Audit staff throughput and decision accuracy across institutional nodes.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 border-slate-200 bg-white font-medium shadow-sm hover:bg-slate-50 gap-2 min-w-[140px] justify-between">
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-slate-400" />
                  {timeRangeLabel}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setTimeRange("all")} className="cursor-pointer">Full Archive</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeRange("7d")} className="cursor-pointer">Last 7 Days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeRange("30d")} className="cursor-pointer">Last 30 Days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeRange("90d")} className="cursor-pointer">Current Quarter</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm hover:bg-slate-50">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter
                {selectedOfficers.length > 0 && (
                  <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold">
                    {selectedOfficers.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personnel Scope</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer py-3">
                  <span>Individual Specialist</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                  {OFFICER_NAMES.map((name) => (
                    <DropdownMenuCheckboxItem
                      key={name}
                      checked={selectedOfficers.includes(name)}
                      onCheckedChange={() => toggleOfficer(name)}
                      className="cursor-pointer py-2.5"
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setSelectedOfficers([]); setReportDataActive(false); }} className="text-destructive font-bold cursor-pointer">
                Clear Productivity Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            className="gap-2 h-10 px-6 bg-[#B89334] hover:bg-[#A6822D] text-white font-bold shadow-sm rounded-md transition-all active:scale-95 disabled:opacity-50" 
            onClick={handleExportXLSX}
            disabled={!reportDataActive}
          >
            <FileDown className="w-4 h-4" />
            Export XLSX
          </Button>
        </div>
      </div>

      {!reportDataActive ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <Users className="w-12 h-12 text-slate-300" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <p className="font-bold text-slate-900 text-xl">Audit Analysis Inactive</p>
              <p className="text-sm text-slate-500 font-medium">
                Generate a staff productivity report to aggregate resolution and accuracy metrics for your specialized verification team.
              </p>
            </div>
            <Button 
              size="lg" 
              className="px-12 h-14 bg-[#B89334] hover:bg-[#A6822D] text-white font-black text-lg shadow-xl shadow-primary/20" 
              onClick={handleGenerateReport}
            >
              Initialize Audit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Total Throughput</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tighter">
                    {filteredData.reduce((acc, o) => acc + o.total, 0)}
                  </span>
                  <div className="p-2 bg-primary/5 rounded-lg">
                    <History className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Audit Horizon</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-blue-600 tracking-tighter">{timeRangeLabel}</span>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Avg Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-emerald-600 tracking-tighter">
                    {filteredData.length > 0 ? Math.round(filteredData.reduce((acc, o) => acc + o.accuracy, 0) / filteredData.length) : 0}%
                  </span>
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
                <CardTitle className="text-2xl font-black text-[#101828] tracking-tight flex items-center gap-3 font-headline">
                  <TrendingUp className="w-6 h-6 text-primary" /> Personnel Audit Matrix
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="font-black px-4 py-1.5 bg-white border-slate-200">
                    {filteredData.length} Specialists Selected
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[#F9FAFB]">
                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                    <TableHead className="font-black py-5 text-slate-500 uppercase tracking-widest text-[11px] pl-8">Specialist Name</TableHead>
                    <TableHead className="font-black py-5 text-slate-500 uppercase tracking-widest text-[11px]">Verification Count</TableHead>
                    <TableHead className="font-black py-5 text-emerald-600 uppercase tracking-widest text-[11px]">Approved</TableHead>
                    <TableHead className="font-black py-5 text-[#E67E22] uppercase tracking-widest text-[11px]">Amendments</TableHead>
                    <TableHead className="text-right font-black py-5 text-slate-500 uppercase tracking-widest text-[11px] pr-8">Accuracy %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((officer) => (
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
                  {filteredData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-20 text-center text-muted-foreground font-medium italic">
                        No specialist data matches the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
