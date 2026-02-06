"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query } from "firebase/firestore";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Users, TrendingUp, Clock, CheckCircle, Loader2, History, AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

interface OfficerMetric {
  name: string;
  processed: number;
  approved: number;
  amended: number;
  avgTurnaround: string;
}

export default function OfficerPerformancePage() {
  const db = useFirestore();
  const { data: submissions, loading } = useCollection<KYCSubmission>(
    db ? query(collection(db, "submissions")) : null
  );

  const officerMetrics = useMemo(() => {
    if (!submissions) return [];
    
    // In this workflow, we track performance of the KYC Reviewers (Officers)
    // We look at 'reviewedBy' field (added during review action)
    const metrics: Record<string, any> = {};
    
    submissions.forEach(sub => {
      // If reviewedBy isn't present, we fallback to a placeholder for unassigned/pending
      // In a real app, this field is set when an officer takes an action
      const reviewer = (sub as any).reviewedBy || "Unassigned";
      
      if (!metrics[reviewer]) {
        metrics[reviewer] = { 
          name: reviewer, 
          processed: 0, 
          approved: 0, 
          amended: 0, 
          rejected: 0,
          totalCycles: 0,
          times: [] as number[]
        };
      }
      
      metrics[reviewer].processed += 1;
      if (sub.status === 'Approved') metrics[reviewer].approved += 1;
      if (sub.status === 'Amended') metrics[reviewer].amended += 1;
      if (sub.status === 'Rejected') metrics[reviewer].rejected += 1;
      if (sub.isResubmitted) metrics[reviewer].totalCycles += 1;

      // Calculate turnaround if we have review timestamp
      if ((sub as any).reviewedAt && sub.submittedAt) {
        const start = new Date(sub.submittedAt).getTime();
        const end = new Date((sub as any).reviewedAt).getTime();
        metrics[reviewer].times.push(end - start);
      }
    });

    return Object.values(metrics)
      .filter(m => m.name !== "Unassigned")
      .map(m => {
        const avg = m.times.length > 0 
          ? (m.times.reduce((a: number, b: number) => a + b, 0) / m.times.length / (1000 * 60 * 60 * 24)).toFixed(1) 
          : "0.0";
        return {
          ...m,
          avgTurnaround: `${avg}d`
        };
      })
      .sort((a, b) => b.processed - a.processed);
  }, [submissions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Officer Productivity</h1>
          <p className="text-muted-foreground text-lg">Detailed throughput and accuracy metrics for verification staff.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="px-4 py-1 bg-white shadow-sm">
            Total Reviews: {submissions?.length || 0}
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-bold animate-pulse">Calculating staff productivity metrics...</p>
        </div>
      ) : officerMetrics.length === 0 ? (
        <div className="p-20 border-2 border-dashed rounded-3xl text-center bg-slate-50/50">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-bold text-lg">No officer activity recorded.</p>
          <p className="text-slate-400 text-sm mt-1">Productivity metrics will appear once review actions are taken.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {officerMetrics.map((officer) => {
            const approvalRate = officer.processed > 0 ? Math.round((officer.approved / officer.processed) * 100) : 0;
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
                      <p className="text-3xl font-bold text-blue-600">{officer.avgTurnaround}</p>
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
                      {officer.totalCycles} Cycles
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
      )}
    </div>
  );
}
