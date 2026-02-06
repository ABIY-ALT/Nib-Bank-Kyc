
"use client"

import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Users, CheckCircle, History, AlertTriangle, Filter, Search, X, FileDown, Calendar as CalendarIcon, ChevronDown, Clock, TrendingUp } from "lucide-react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const MOCK_OFFICER_METRICS = [
  { name: "Jane Smith", branch: "Downtown", processed: 85, approved: 72, amended: 10, rejected: 3, turnaround: "0.8d" },
  { name: "Robert Brown", branch: "Uptown", processed: 76, approved: 60, amended: 12, rejected: 4, turnaround: "1.2d" },
  { name: "Alice Wilson", branch: "Downtown", processed: 64, approved: 58, amended: 4, rejected: 2, turnaround: "1.1d" },
  { name: "Local Officer", branch: "East Side", processed: 42, approved: 35, amended: 5, rejected: 2, turnaround: "0.9d" },
];

const BRANCH_OPTIONS = ["Downtown", "Uptown", "East Side", "Valley Branch"];
const OFFICER_NAMES = MOCK_OFFICER_METRICS.map(o => o.name);

export default function OfficerPerformancePage() {
  const { toast } = useToast();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState("all");
  
  const [isUnitOpen, setIsUnitOpen] = useState(true);
  const [isSpecialistOpen, setIsSpecialistOpen] = useState(true);

  const filteredOfficers = useMemo(() => {
    return MOCK_OFFICER_METRICS.filter(o => {
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(o.branch);
      const matchesOfficer = selectedOfficers.length === 0 || selectedOfficers.includes(o.name);
      return matchesBranch && matchesOfficer;
    });
  }, [selectedBranches, selectedOfficers]);

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
    setTimeRange("all");
  };

  const handleExportCSV = () => {
    const headers = ['Officer', 'Branch', 'Processed', 'Approved', 'Amended', 'Rejected', 'Turnaround'];
    const rows = filteredOfficers.map(o => [
      o.name, o.branch, o.processed, o.approved, o.amended, o.rejected, o.turnaround
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `officer-productivity-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`);
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
          <Button variant="outline" className="gap-2 h-11 px-6 font-bold shadow-sm border-slate-200" onClick={handleExportCSV}>
            <FileDown className="w-4 h-4 text-primary" />
            Export Report
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 h-11 px-6 font-bold text-slate-600 border-slate-200 relative shadow-sm">
                <Filter className="w-4 h-4" />
                Filter Personnel
                {(selectedBranches.length > 0 || selectedOfficers.length > 0 || timeRange !== 'all') && (
                  <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold">
                    {selectedBranches.length + selectedOfficers.length + (timeRange !== 'all' ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0 shadow-2xl border-slate-200 overflow-hidden bg-white" align="end">
              <div className="p-6 pb-2 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-3xl tracking-tight font-headline">Staff Filters</h3>
                {(selectedBranches.length > 0 || selectedOfficers.length > 0 || timeRange !== 'all') && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-[11px] font-bold text-primary hover:bg-primary/5 uppercase tracking-widest px-2">
                    Clear
                  </Button>
                )}
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <Label className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400/80">Audit Period</Label>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-full h-12 border-primary border-2 shadow-none focus:ring-0">
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="w-4 h-4 text-slate-400" />
                        <SelectValue placeholder="Select Range" />
                      </div>
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

                <Collapsible open={isUnitOpen} onOpenChange={setIsUnitOpen} className="space-y-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full group">
                    <Label className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400/80 cursor-pointer">Institutional Unit</Label>
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", isUnitOpen && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 animate-in slide-in-from-top-1 duration-200">
                    <div className="grid gap-4">
                      {BRANCH_OPTIONS.map((branch) => (
                        <div key={branch} className="flex items-center space-x-4 group cursor-pointer" onClick={() => toggleBranch(branch)}>
                          <Checkbox 
                            id={`branch-${branch}`} 
                            checked={selectedBranches.includes(branch)}
                            onCheckedChange={() => toggleBranch(branch)}
                            className="rounded-full h-8 w-8 border-2 border-primary data-[state=checked]:bg-white data-[state=checked]:text-primary transition-all duration-200"
                          />
                          <Label htmlFor={`branch-${branch}`} className="text-lg font-bold text-slate-700 cursor-pointer group-hover:text-primary transition-colors">
                            {branch}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator className="bg-slate-100/80" />

                <Collapsible open={isSpecialistOpen} onOpenChange={setIsSpecialistOpen} className="space-y-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full group">
                    <Label className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400/80 cursor-pointer">Individual Specialist</Label>
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", isSpecialistOpen && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 animate-in slide-in-from-top-1 duration-200">
                    <ScrollArea className="h-[220px] -mr-2 pr-4">
                      <div className="grid gap-4">
                        {OFFICER_NAMES.map((name) => (
                          <div key={name} className="flex items-center space-x-4 group cursor-pointer" onClick={() => toggleOfficer(name)}>
                            <Checkbox 
                              id={`officer-${name}`} 
                              checked={selectedOfficers.includes(name)}
                              onCheckedChange={() => toggleOfficer(name)}
                              className="rounded-full h-8 w-8 border-2 border-primary data-[state=checked]:bg-white data-[state=checked]:text-primary transition-all duration-200"
                            />
                            <Label htmlFor={`officer-${name}`} className="text-lg font-bold text-slate-700 cursor-pointer group-hover:text-primary transition-colors">
                              {name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </PopoverContent>
          </Popover>
          <div className="px-6 py-3.5 bg-white border border-slate-100 rounded-full shadow-sm flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
             <span className="text-sm font-bold text-slate-900">Active Dataset: {filteredOfficers.length} Officers</span>
          </div>
        </div>
      </div>

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
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    {officer.rejected} Rejections
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
