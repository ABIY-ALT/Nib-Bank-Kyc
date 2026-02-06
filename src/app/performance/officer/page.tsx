
"use client"

import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Users, CheckCircle, History, AlertTriangle, Filter, Search } from "lucide-react"
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

const MOCK_OFFICER_METRICS = [
  { name: "Jane Smith", branch: "Downtown", processed: 85, approved: 72, amended: 10, rejected: 3, turnaround: "0.8d" },
  { name: "Robert Brown", branch: "Uptown", processed: 76, approved: 60, amended: 12, rejected: 4, turnaround: "1.2d" },
  { name: "Alice Wilson", branch: "Downtown", processed: 64, approved: 58, amended: 4, rejected: 2, turnaround: "1.1d" },
  { name: "Local Officer", branch: "East Side", processed: 42, approved: 35, amended: 5, rejected: 2, turnaround: "0.9d" },
];

const BRANCH_OPTIONS = ["Downtown", "Uptown", "East Side", "Valley Branch"];
const OFFICER_NAMES = MOCK_OFFICER_METRICS.map(o => o.name);

export default function OfficerPerformancePage() {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);

  const filteredOfficers = useMemo(() => {
    return MOCK_OFFICER_METRICS.filter(o => {
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(o.branch);
      const matchesOfficer = selectedOfficers.length === 0 || selectedOfficers.includes(o.name);
      return matchesBranch && matchesOfficer;
    });
  }, [selectedBranches, selectedOfficers]);

  const totalReviews = filteredOfficers.reduce((acc, o) => acc + o.processed, 0);

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
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Officer Productivity</h1>
          <p className="text-muted-foreground text-lg">Detailed throughput and accuracy metrics for verification staff.</p>
        </div>
        <div className="flex gap-3 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 h-11 px-6 font-bold text-slate-600 border-slate-200 relative shadow-sm">
                <Filter className="w-4 h-4" />
                Filter Personnel
                {(selectedBranches.length > 0 || selectedOfficers.length > 0) && (
                  <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold">
                    {selectedBranches.length + selectedOfficers.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-6 space-y-6 shadow-2xl border-slate-200" align="end">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-lg">Staff Filters</h3>
                {(selectedBranches.length > 0 || selectedOfficers.length > 0) && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-[11px] font-bold text-primary uppercase tracking-wider px-2 hover:bg-primary/5">
                    Clear
                  </Button>
                )}
              </div>
              
              <div className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Institutional Unit</Label>
                  <div className="grid gap-3">
                    {BRANCH_OPTIONS.map((branch) => (
                      <div key={branch} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleBranch(branch)}>
                        <Checkbox 
                          id={`branch-${branch}`} 
                          checked={selectedBranches.includes(branch)}
                          onCheckedChange={() => toggleBranch(branch)}
                          className="rounded-full h-5 w-5 border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-all"
                        />
                        <Label htmlFor={`branch-${branch}`} className="text-sm font-bold text-slate-700 cursor-pointer group-hover:text-primary transition-colors">
                          {branch}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="bg-slate-100" />

                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Individual Specialist</Label>
                  <ScrollArea className="h-[140px] pr-4">
                    <div className="grid gap-3">
                      {OFFICER_NAMES.map((name) => (
                        <div key={name} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleOfficer(name)}>
                          <Checkbox 
                            id={`officer-${name}`} 
                            checked={selectedOfficers.includes(name)}
                            onCheckedChange={() => toggleOfficer(name)}
                            className="rounded-full h-5 w-5 border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-all"
                          />
                          <Label htmlFor={`officer-${name}`} className="text-sm font-bold text-slate-700 cursor-pointer group-hover:text-primary transition-colors">
                            {name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Badge variant="outline" className="px-4 py-2.5 bg-white shadow-sm font-bold border-slate-200 text-primary">
            Active Dataset: {filteredOfficers.length} Officers
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredOfficers.map((officer) => {
          const approvalRate = Math.round((officer.approved / officer.processed) * 100);
          return (
            <Card key={officer.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300 hover:shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">{officer.name}</CardTitle>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{officer.branch} Office</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  <Users className="w-5 h-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-8 px-6 space-y-6 pb-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cases Processed</p>
                    <p className="text-3xl font-bold text-slate-900">{officer.processed}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg. Turnaround</p>
                    <p className="text-3xl font-bold text-blue-600">{officer.turnaround}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Approval Accuracy</span>
                    <span className="text-emerald-600">{approvalRate}%</span>
                  </div>
                  <Progress value={approvalRate} className="h-2 bg-slate-100" />
                </div>

                <div className="pt-6 border-t border-slate-100 grid grid-cols-2 gap-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    {officer.approved} Approved
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    {officer.amended} Amendments
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <History className="w-3.5 h-3.5 text-indigo-500" />
                    {officer.processed} Cycles
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
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
