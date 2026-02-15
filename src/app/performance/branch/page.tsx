
"use client"

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Building2, 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  Filter, 
  FileDown, 
  Calendar as CalendarIcon,
  Map
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

const MOCK_BRANCH_METRICS = [
  { name: "Downtown Branch", district: "Central", volume: 145, approved: 120, actionRequired: 15, pending: 10, avgTime: "1.1d" },
  { name: "Uptown Branch", district: "Northern", volume: 98, approved: 85, actionRequired: 8, pending: 5, avgTime: "0.9d" },
  { name: "East Side", district: "Eastern", volume: 76, approved: 60, actionRequired: 10, pending: 6, avgTime: "1.4d" },
  { name: "Northern Branch", district: "Northern", volume: 64, approved: 55, actionRequired: 4, pending: 5, avgTime: "1.2d" },
  { name: "Valley Branch", district: "Central", volume: 52, approved: 45, actionRequired: 5, pending: 2, avgTime: "1.5d" },
];

const DISTRICTS = ["Central", "Northern", "Eastern", "Southern"];
const BRANCH_NAMES = Array.from(new Set(MOCK_BRANCH_METRICS.map(b => b.name))).sort();

export default function BranchPerformancePage() {
  const { toast } = useToast();
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const filteredMetrics = useMemo(() => {
    return MOCK_BRANCH_METRICS.filter(b => {
      const matchesDistrict = selectedDistricts.length === 0 || selectedDistricts.includes(b.district);
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(b.name);
      return matchesDistrict && matchesBranch;
    });
  }, [selectedDistricts, selectedBranches, fromDate, toDate]);

  const toggleDistrict = (dist: string) => {
    setSelectedDistricts(prev => 
      prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]
    );
  };

  const toggleBranch = (branch: string) => {
    setSelectedBranches(prev => 
      prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]
    );
  };

  const handleResetFilters = () => {
    setSelectedDistricts([]);
    setSelectedBranches([]);
  };

  const handleExportCSV = () => {
    const headers = ['Branch Name', 'District', 'Total Volume', 'Approved', 'Action Required', 'Pending', 'Avg Processing Time'];
    const rows = filteredMetrics.map(b => [
      b.name, b.district, b.volume, b.approved, b.actionRequired, b.pending, b.avgTime
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `branch-performance-${fromDate}-to-${toDate}.csv`);
    link.click();
    
    toast({
      title: "Performance Data Exported",
      description: `Analytics for ${filteredMetrics.length} branches saved to CSV.`,
    });
  };

  const activeFilterCount = selectedDistricts.length + selectedBranches.length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          <p className="text-muted-foreground text-lg">Operational velocity and real-time efficiency metrics across the network.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm hover:bg-slate-50">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter Scope
                {activeFilterCount > 0 && (
                  <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Regional Scope</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer py-3">
                  <Map className="w-4 h-4 mr-2 text-slate-400" />
                  <span>Regional District</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {DISTRICTS.map((dist) => (
                    <DropdownMenuCheckboxItem
                      key={dist}
                      checked={selectedDistricts.includes(dist)}
                      onCheckedChange={() => toggleDistrict(dist)}
                      className="cursor-pointer py-2.5"
                    >
                      {dist}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer py-3">
                  <Building2 className="w-4 h-4 mr-2 text-slate-400" />
                  <span>Branch Name</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64 max-h-[300px] overflow-y-auto">
                  {BRANCH_NAMES.map((branch) => (
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

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleResetFilters} className="text-destructive font-bold cursor-pointer py-3">
                Reset All Filters
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

      {filteredMetrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-4">
          <Building2 className="w-16 h-16 text-slate-200" />
          <div className="text-center space-y-1">
            <p className="font-bold text-slate-900 text-xl">No Branches Found</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">Try adjusting your filters to see metrics for other regions or specific nodes.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredMetrics.map((branch) => {
            const approvalRate = Math.round((branch.approved / branch.volume) * 100);
            return (
              <Card key={branch.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300 hover:shadow-xl bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6 pt-6">
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">{branch.name}</CardTitle>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">District: {branch.district}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border shadow-sm text-primary group-hover:scale-110 transition-transform duration-300">
                    <Building2 className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent className="pt-8 px-6 space-y-8 pb-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Volume</p>
                      <p className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                        {branch.volume}
                        <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approval Rate</p>
                      <p className="text-3xl font-bold text-emerald-600">{approvalRate}%</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-primary" /> Efficiency Index</span>
                      <span className="text-primary">{approvalRate}%</span>
                    </div>
                    <Progress value={approvalRate} className="h-2.5 bg-slate-100" />
                  </div>

                  <div className="pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      {branch.approved} Approved
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      {branch.actionRequired} Actions
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      {branch.pending} Pending
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {branch.avgTime} Avg Time
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
