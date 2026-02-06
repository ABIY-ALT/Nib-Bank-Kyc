
"use client"

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { 
  Building2, 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  Filter, 
  X, 
  FileDown, 
  Calendar as CalendarIcon 
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

const MOCK_BRANCH_METRICS = [
  { name: "Downtown Branch", district: "Central", volume: 145, approved: 120, actionRequired: 15, pending: 10, avgTime: "1.1d" },
  { name: "Uptown Branch", district: "Northern", volume: 98, approved: 85, actionRequired: 8, pending: 5, avgTime: "0.9d" },
  { name: "East Side", district: "Eastern", volume: 76, approved: 60, actionRequired: 10, pending: 6, avgTime: "1.4d" },
  { name: "Northern Branch", district: "Northern", volume: 64, approved: 55, actionRequired: 4, pending: 5, avgTime: "1.2d" },
  { name: "Valley Branch", district: "Central", volume: 52, approved: 45, actionRequired: 5, pending: 2, avgTime: "1.5d" },
];

const DISTRICTS = ["Central", "Northern", "Eastern", "Southern"];

export default function BranchPerformancePage() {
  const { toast } = useToast();
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState("all");

  const filteredMetrics = useMemo(() => {
    if (selectedDistricts.length === 0) return MOCK_BRANCH_METRICS;
    return MOCK_BRANCH_METRICS.filter(b => selectedDistricts.includes(b.district));
  }, [selectedDistricts]);

  const totalVolume = filteredMetrics.reduce((acc, b) => acc + b.volume, 0);

  const toggleDistrict = (dist: string) => {
    setSelectedDistricts(prev => 
      prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]
    );
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
    link.setAttribute('download', `branch-performance-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    
    toast({
      title: "Performance Data Exported",
      description: `Analytics for ${filteredMetrics.length} branches saved to CSV.`,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          <p className="text-muted-foreground text-lg">Cross-network efficiency and compliance audit trail.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="outline" className="gap-2 h-11 px-6 font-bold shadow-sm border-slate-200" onClick={handleExportCSV}>
            <FileDown className="w-4 h-4 text-primary" />
            Export Report
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 h-11 px-6 font-bold text-slate-600 border-slate-200 relative shadow-sm">
                <Filter className="w-4 h-4" />
                Filter Network
                {(selectedDistricts.length > 0 || timeRange !== 'all') && (
                  <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold">
                    {selectedDistricts.length + (timeRange !== 'all' ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 shadow-2xl border-slate-200 overflow-hidden bg-white" align="end">
              <div className="p-6 pb-0 flex items-center justify-between">
                <h3 className="font-bold text-[#101828] text-2xl tracking-tight">Network Filters</h3>
                {(selectedDistricts.length > 0 || timeRange !== 'all') && (
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedDistricts([]); setTimeRange("all"); }} className="h-8 text-[11px] font-bold text-primary hover:bg-primary/5 uppercase tracking-widest px-2">
                    Clear
                  </Button>
                )}
              </div>
              
              <div className="p-6 space-y-8">
                <div className="space-y-4">
                  <Label className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400/80">Audit Period</Label>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-full h-10 border-slate-200">
                      <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" />
                      <SelectValue placeholder="Select Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Historical Data</SelectItem>
                      <SelectItem value="7d">Last 7 Days</SelectItem>
                      <SelectItem value="30d">Last 30 Days</SelectItem>
                      <SelectItem value="90d">Current Quarter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="bg-slate-100/80" />

                <div className="space-y-5">
                  <Label className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400/80">Regional Districts</Label>
                  <div className="grid gap-4">
                    {DISTRICTS.map((dist) => (
                      <div key={dist} className="flex items-center space-x-4 group cursor-pointer" onClick={() => toggleDistrict(dist)}>
                        <Checkbox 
                          id={`dist-${dist}`} 
                          checked={selectedDistricts.includes(dist)}
                          onCheckedChange={() => toggleDistrict(dist)}
                          className="rounded-full h-6 w-6 border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-all duration-200"
                        />
                        <Label htmlFor={`dist-${dist}`} className="text-[15px] font-bold text-slate-700 cursor-pointer group-hover:text-primary transition-colors">
                          {dist}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="px-6 py-3.5 bg-white border border-slate-100 rounded-full shadow-sm flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
             <span className="text-sm font-bold text-slate-900">Dataset Volume: {totalVolume}</span>
          </div>
        </div>
      </div>

      {filteredMetrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-4">
          <Building2 className="w-16 h-16 text-slate-200" />
          <div className="text-center space-y-1">
            <p className="font-bold text-slate-900 text-xl">No Branches Found</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">Try adjusting your filters to see metrics for other regions.</p>
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
