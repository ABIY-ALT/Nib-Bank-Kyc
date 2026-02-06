"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Users, CheckCircle, History, AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

const MOCK_OFFICER_METRICS = [
  { name: "Jane Smith", processed: 85, approved: 72, amended: 10, rejected: 3, turnaround: "0.8d" },
  { name: "Robert Brown", processed: 76, approved: 60, amended: 12, rejected: 4, turnaround: "1.2d" },
  { name: "Alice Wilson", processed: 64, approved: 58, amended: 4, rejected: 2, turnaround: "1.1d" },
  { name: "Local Officer", processed: 42, approved: 35, amended: 5, rejected: 2, turnaround: "0.9d" },
];

export default function OfficerPerformancePage() {
  const officerMetrics = MOCK_OFFICER_METRICS;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Officer Productivity</h1>
          <p className="text-muted-foreground text-lg">Detailed throughput and accuracy metrics for verification staff.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="px-4 py-1 bg-white shadow-sm">
            Total Reviews: {officerMetrics.reduce((acc, o) => acc + o.processed, 0)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {officerMetrics.map((officer) => {
          const approvalRate = Math.round((officer.approved / officer.processed) * 100);
          return (
            <Card key={officer.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">{officer.name}</CardTitle>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">KYC Specialist</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border shadow-sm text-primary">
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
      </div>
    </div>
  );
}
