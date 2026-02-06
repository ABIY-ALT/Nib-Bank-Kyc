
"use client"

import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Map, TrendingUp, Building2, AlertTriangle, BarChart3, Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

const MOCK_DISTRICT_METRICS = [
  { name: "Central", branchCount: 12, volume: 450, complianceRate: 94, tier: "High" },
  { name: "Northern", branchCount: 8, volume: 320, complianceRate: 88, tier: "Medium" },
  { name: "Southern", branchCount: 10, volume: 280, complianceRate: 91, tier: "High" },
  { name: "Eastern", branchCount: 6, volume: 190, complianceRate: 85, tier: "Medium" },
];

const PERFORMANCE_TIERS = ["High", "Medium", "Low"];

export default function DistrictPerformancePage() {
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);

  const filteredDistricts = useMemo(() => {
    if (selectedTiers.length === 0) return MOCK_DISTRICT_METRICS;
    return MOCK_DISTRICT_METRICS.filter(d => selectedTiers.includes(d.tier));
  }, [selectedTiers]);

  const totalVolume = filteredDistricts.reduce((acc, d) => acc + d.volume, 0);

  const toggleTier = (tier: string) => {
    setSelectedTiers(prev => 
      prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">District Performance</h1>
          <p className="text-muted-foreground text-lg">Regional oversight of KYC efficiency and institutional compliance.</p>
        </div>
        <div className="flex gap-3 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 h-11 px-6 font-bold text-slate-600 border-slate-200 relative shadow-sm">
                <Filter className="w-4 h-4" />
                Performance Tier
                {selectedTiers.length > 0 && (
                  <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold">
                    {selectedTiers.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-6 space-y-6 shadow-2xl border-slate-200" align="end">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Tier Filters</h3>
                {selectedTiers.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTiers([])} className="h-8 text-[11px] font-bold text-primary uppercase tracking-wider px-2 hover:bg-primary/5">
                    Reset
                  </Button>
                )}
              </div>
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Compliance Health</Label>
                <div className="grid gap-3">
                  {PERFORMANCE_TIERS.map((tier) => (
                    <div key={tier} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`tier-${tier}`} 
                        checked={selectedTiers.includes(tier)}
                        onCheckedChange={() => toggleTier(tier)}
                      />
                      <Label htmlFor={`tier-${tier}`} className="text-sm font-medium cursor-pointer">{tier} Performing</Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Badge variant="outline" className="px-4 py-2.5 bg-white shadow-sm font-bold text-primary border-primary/20">
            Total In View: {totalVolume}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredDistricts.map((district) => (
          <Card key={district.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6">
              <div>
                <CardTitle className="text-xl font-bold text-slate-900">{district.name} District</CardTitle>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5 text-primary">Regional Operations</p>
              </div>
              <div className="p-2.5 bg-white rounded-xl border shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <Map className="w-5 h-5" />
              </div>
            </CardHeader>
            <CardContent className="pt-8 px-6 space-y-6 pb-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">District Volume</p>
                  <p className="text-3xl font-bold text-slate-900">{district.volume}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Branches</p>
                  <p className="text-3xl font-bold text-primary">{district.branchCount}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> SLA Compliance</span>
                  <span className="text-orange-600">{district.complianceRate}%</span>
                </div>
                <Progress value={district.complianceRate} className="h-2 bg-slate-100" />
              </div>

              <div className="pt-6 border-t border-slate-100 grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Coverage Efficiency
                  </span>
                  <span className="text-primary font-bold">{district.tier}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    Resolution Rate
                  </span>
                  <span className="text-emerald-600">{district.complianceRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredDistricts.length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed rounded-3xl text-muted-foreground font-medium italic">
            No regional data matches the selected criteria.
          </div>
        )}
      </div>

      <Card className="border-primary/20 bg-slate-900 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <BarChart3 className="w-32 h-32" />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Network Summary</CardTitle>
          <p className="text-slate-400">Aggregated insights across all regional districts.</p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-8 py-4">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Global Volume</p>
              <p className="text-5xl font-extrabold">{totalVolume}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Districts</p>
              <p className="text-5xl font-extrabold text-primary">{filteredDistricts.length}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Health</p>
              <p className="text-5xl font-extrabold text-emerald-500">98%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
