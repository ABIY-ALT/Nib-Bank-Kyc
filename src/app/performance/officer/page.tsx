
"use client"

import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Users, 
  CheckCircle, 
  History, 
  Filter, 
  FileDown, 
  Calendar as CalendarIcon, 
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const MOCK_OFFICER_METRICS = [
  { name: "Jane Smith", branch: "Downtown", processed: 85, approved: 72, amended: 10, turnaround: "0.8d" },
  { name: "Robert Brown", branch: "Uptown", processed: 76, approved: 60, amended: 12, turnaround: "1.2d" },
  { name: "Alice Wilson", branch: "Downtown", processed: 64, approved: 58, amended: 4, turnaround: "1.1d" },
  { name: "Local Officer", branch: "East Side", processed: 42, approved: 35, amended: 5, turnaround: "0.9d" },
];

const BRANCH_OPTIONS = ["Downtown", "Uptown", "East Side", "Valley Branch"];
const OFFICER_NAMES = MOCK_OFFICER_METRICS.map(o => o.name);

export default function OfficerPerformancePage() {
  const { toast } = useToast();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const filteredOfficers = useMemo(() => {
    return MOCK_OFFICER_METRICS.filter(o => {
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(o.branch);
      const matchesOfficer = selectedOfficers.length === 0 || selectedOfficers.includes(o.name);
      return matchesBranch && matchesOfficer;
    });
  }, [selectedBranches, selectedOfficers, fromDate, toDate]);

  const toggleBranch = (branch: string) => {
    setSelectedBranches(prev => 
      prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]
    );
  };

  const toggleOfficer = (name: string) => {
    setSelectedOfficers(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const resetFilters = () => {
    setSelectedBranches([]);
    setSelectedOfficers([]);
    setFromDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    setToDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleExportCSV = () => {
    const headers = ['Officer', 'Branch', 'Processed', 'Approved', 'Amended', 'Turnaround'];
    const rows = filteredOfficers.map(o => [
      o.name, o.branch, o.processed, o.approved, o.amended, o.turnaround
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `officer-productivity-${fromDate}-to-${toDate}.csv`);
    link.click();
    
    toast({
      title: "Productivity Report Exported",
      description: `Data for ${filteredOfficers.length} officers has been saved to CSV.`,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Officer Productivity</h1>
          <p className="text-muted-foreground text-lg font-medium">Detailed throughput and accuracy metrics for verification staff.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm hover:bg-slate-50">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Personnel
                {(selectedBranches.length > 0 || selectedOfficers.length > 0) && (
                  <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold">
                    {selectedBranches.length + selectedOfficers.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personnel Scope</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer py-3">
                  <span>Branch Name</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {BRANCH_OPTIONS.map((branch) => (
                    <DropdownMenuCheckboxItem
                      key={branch}
                      checked={selectedBranches.includes(branch)}
                      onCheckedChange={() => toggleBranch(branch)}
                      className="cursor-pointer py-2.5"
                    >
                      {branch}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

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
              <DropdownMenuItem onClick={resetFilters} className="text-destructive font-bold cursor-pointer">
                Clear All Personnel Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            className="gap-2 h-10 px-6 bg-[#B89334] hover:bg-[#A6822D] text-white font-bold shadow-sm rounded-md transition-all active:scale-95" 
            onClick={handleExportCSV}
          >
            <FileDown className="w-4 h-4" />
            Export
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
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
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
                    className="pl-10 h-12 rounded-xl border-slate-200 focus-visible:ring-primary font-bold shadow-sm bg-slate-50/30"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredOfficers.map((officer) => {
          const approvalRate = Math.round((officer.approved / officer.processed) * 100);
          return (
            <Card key={officer.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300 hover:shadow-xl bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 px-6 pt-6">
                <div>
                  <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">{officer.name}</CardTitle>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">{officer.branch} Office</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-all duration-300">
                  <Users className="w-6 h-6" />
                </div>
              </CardHeader>
              <CardContent className="pt-6 px-6 space-y-8 pb-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Cases Processed</p>
                    <p className="text-4xl font-bold text-slate-900 tracking-tighter">{officer.processed}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Avg. Turnaround</p>
                    <p className="text-4xl font-bold text-blue-600 tracking-tighter">{officer.turnaround}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Approval Accuracy
                    </span>
                    <span className="text-emerald-600 font-black">{approvalRate}%</span>
                  </div>
                  <Progress value={approvalRate} className="h-2.5 bg-slate-100" />
                </div>

                <div className="pt-8 border-t border-slate-50 grid grid-cols-2 gap-y-6">
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    {officer.approved} Approved
                  </div>
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    {officer.amended} Amendments
                  </div>
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                    <History className="w-4 h-4 text-indigo-400" />
                    {officer.processed} Cycles
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredOfficers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed rounded-3xl text-muted-foreground font-medium flex flex-col items-center justify-center gap-4">
            <Users className="w-16 h-16 text-slate-200" />
            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-xl">No Staff Matches</p>
              <p className="text-sm">Adjust your filters to see historical performance data for other specialists.</p>
              <Button variant="link" onClick={resetFilters} className="text-primary font-bold">Reset All Filters</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
