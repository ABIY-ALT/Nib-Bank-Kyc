"use client"

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Building2, TrendingUp, Clock, ArrowUpRight } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

const MOCK_BRANCH_METRICS = [
  { name: "Downtown Branch", volume: 145, approved: 120, actionRequired: 15, pending: 10, avgTime: "1.1d" },
  { name: "Uptown Branch", volume: 98, approved: 85, actionRequired: 8, pending: 5, avgTime: "0.9d" },
  { name: "East Side", volume: 76, approved: 60, actionRequired: 10, pending: 6, avgTime: "1.4d" },
  { name: "Northern Branch", volume: 64, approved: 55, actionRequired: 4, pending: 5, avgTime: "1.2d" },
  { name: "Valley Branch", volume: 52, approved: 45, actionRequired: 5, pending: 2, avgTime: "1.5d" },
];

export default function BranchPerformancePage() {
  const branchMetrics = MOCK_BRANCH_METRICS;
  const totalVolume = branchMetrics.reduce((acc, b) => acc + b.volume, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          <p className="text-muted-foreground text-lg">Cross-network efficiency and compliance audit trail.</p>
        </div>
        <Badge variant="outline" className="px-4 py-1 text-sm font-bold bg-white shadow-sm">
          Network Total: {totalVolume} Submissions
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {branchMetrics.map((branch) => {
          const approvalRate = Math.round((branch.approved / branch.volume) * 100);
          return (
            <Card key={branch.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300 hover:shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">{branch.name}</CardTitle>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">District Branch</p>
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
    </div>
  );
}
