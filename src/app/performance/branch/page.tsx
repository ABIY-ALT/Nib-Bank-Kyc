"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query } from "firebase/firestore";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Building2, TrendingUp, Users, Clock, Loader2, ArrowUpRight } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

export default function BranchPerformancePage() {
  const db = useFirestore();
  const { data: submissions, loading } = useCollection<KYCSubmission>(
    db ? query(collection(db, "submissions")) : null
  );

  const branchMetrics = useMemo(() => {
    if (!submissions) return [];
    
    const branches: Record<string, any> = {};
    
    submissions.forEach(sub => {
      const b = sub.branch || "Headquarters";
      if (!branches[b]) {
        branches[b] = { 
          name: b, 
          volume: 0, 
          approved: 0, 
          rejected: 0, 
          pending: 0,
          actionRequired: 0
        };
      }
      branches[b].volume += 1;
      if (sub.status === 'Approved') branches[b].approved += 1;
      if (sub.status === 'Rejected') branches[b].rejected += 1;
      if (sub.status === 'Pending' || sub.status === 'In Review') branches[b].pending += 1;
      if (sub.status === 'Amended') branches[b].actionRequired += 1;
    });

    return Object.values(branches).sort((a, b) => b.volume - a.volume);
  }, [submissions]);

  const totalVolume = branchMetrics.reduce((acc, b) => acc + b.volume, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Performance</h1>
          <p className="text-muted-foreground text-lg">Cross-network efficiency and compliance audit trail.</p>
        </div>
        <Badge variant="outline" className="px-4 py-1 text-sm font-bold bg-white shadow-sm">
          Network Total: {totalVolume} Submissions
        </Badge>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-bold animate-pulse">Aggregating real-time branch data...</p>
        </div>
      ) : branchMetrics.length === 0 ? (
        <div className="p-20 border-2 border-dashed rounded-3xl text-center bg-slate-50/50">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-bold text-lg">No branch activity found.</p>
          <p className="text-slate-400 text-sm mt-1">Metrics will appear once submissions are created.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {branchMetrics.map((branch) => {
            const approvalRate = branch.volume > 0 ? Math.round((branch.approved / branch.volume) * 100) : 0;
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
                      1.2d Avg Time
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
