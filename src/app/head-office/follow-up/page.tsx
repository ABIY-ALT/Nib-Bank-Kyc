
'use client';

import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, doc, setDoc, limit, getDocs } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-mock";
import { 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Building2, 
  User, 
  FileText,
  Loader2,
  Filter,
  History,
  Dices,
  FileDown
} from "lucide-react";
import { useMemo, useState } from "react";
import { KYCSubmission, FollowUpVerification } from "@/lib/kyc-data";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

export default function FollowUpDashboard() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSampling, setIsSampling] = useState(false);

  // 1. Fetch completed verifications for analytics and reporting
  const verificationsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "follow_up_verifications"), orderBy("verifiedAt", "desc")) : null;
  }, [db]);

  const { data: verifications, loading: vLoading } = useCollection<FollowUpVerification>(verificationsQuery);

  // 2. Fetch pending verifications (The Sample Queue)
  const pendingQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "follow_up_verifications"), where("status", "==", "Pending")) : null;
  }, [db]);

  const { data: pendingVerifications, loading: pLoading } = useCollection<FollowUpVerification>(pendingQuery);

  // 3. Sampling Logic: Select random approved cases
  const handleSampleCases = async () => {
    if (!db) return;
    setIsSampling(true);
    
    try {
      // Get all approved submissions
      const q = query(collection(db, "submissions"), where("status", "==", "Approved"), limit(50));
      const snapshot = await getDocs(q);
      const approvedCases = snapshot.docs.map(d => d.data() as KYCSubmission);
      
      // Filter out those already in verification
      const existingIds = new Set(verifications?.map(v => v.submissionId) || []);
      const pendingIds = new Set(pendingVerifications?.map(v => v.submissionId) || []);
      const pool = approvedCases.filter(c => !existingIds.has(c.id) && !pendingIds.has(c.id));

      if (pool.length === 0) {
        toast({ variant: "destructive", title: "Sampling Exhausted", description: "No new approved cases available for audit selection." });
        return;
      }

      // Select 5 random cases
      const shuffled = pool.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 5);

      for (const caseData of selected) {
        const verifyId = `audit-${Date.now()}-${caseData.id}`;
        const ref = doc(db, "follow_up_verifications", verifyId);
        await setDoc(ref, {
          id: verifyId,
          submissionId: caseData.id,
          customerName: caseData.customerName,
          branch: caseData.branch,
          officer: caseData.submittedBy,
          accountType: caseData.entityType || "individual",
          status: "Pending",
          verifiedAt: new Date().toISOString()
        });
      }

      toast({ title: "Sample Generated", description: `Added ${selected.length} random cases to the follow-up queue.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Could not generate sample queue." });
    } finally {
      setIsSampling(false);
    }
  };

  // 4. Analytics Data
  const analytics = useMemo(() => {
    if (!verifications) return { rate: 0, total: 0, discrepancies: 0, byBranch: {} as Record<string, number> };
    
    const completed = verifications.filter(v => v.status === 'Completed');
    const total = completed.length;
    const discrepancies = completed.filter(v => v.result === 'Discrepancy').length;
    const rate = total > 0 ? Math.round(((total - discrepancies) / total) * 100) : 100;

    const byBranch: Record<string, number> = {};
    completed.filter(v => v.result === 'Discrepancy').forEach(v => {
      byBranch[v.branch] = (byBranch[v.branch] || 0) + 1;
    });

    return { rate, total, discrepancies, byBranch };
  }, [verifications]);

  // 5. Export Logic
  const handleExportReport = () => {
    if (!verifications || verifications.filter(v => v.status === 'Completed').length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "There are no completed audit records to export." });
      return;
    }

    const completed = verifications.filter(v => v.status === 'Completed');
    const headers = ['Audit ID', 'Case ID', 'Customer', 'Branch', 'Officer', 'Result', 'Auditor', 'Audit Date', 'Remarks'];
    const rows = completed.map(v => [
      v.id,
      v.submissionId,
      v.customerName,
      v.branch,
      v.officer,
      v.result,
      v.verifiedBy || 'N/A',
      new Date(v.verifiedAt).toLocaleString(),
      v.remarks ? v.remarks.replace(/,/g, ';') : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nib-kyc-followup-audit-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Audit Report Exported",
      description: `Institutional record of ${completed.length} audits saved to CSV.`,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-slate-900 text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Follow-up Verification</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Head Office quality control and institutional audit workspace.</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline"
            onClick={handleExportReport}
            className="h-12 px-6 font-bold shadow-sm gap-2 border-slate-200 bg-white"
          >
            <FileDown className="w-5 h-5 text-primary" />
            Export Audit Report
          </Button>
          <Button 
            onClick={handleSampleCases} 
            disabled={isSampling}
            className="bg-primary hover:bg-primary/90 h-12 px-8 font-black shadow-xl gap-2 rounded-xl transition-all active:scale-95"
          >
            {isSampling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Dices className="w-5 h-5" />}
            Generate Random Audit Sample
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-lg border-slate-200 overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Compliance Index</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-slate-900">{analytics.rate}%</div>
            <Progress value={analytics.rate} className="h-1.5 mt-3 bg-slate-100" />
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Audited</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-slate-900">{analytics.total} Cases</div>
            <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase">Institutional lifetime</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden group border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Discrepancies</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-orange-600">{analytics.discrepancies}</div>
            <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase">Actionable errors found</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-600">Active Queue</CardTitle>
            <RefreshCw className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-blue-600">{pendingVerifications?.length || 0}</div>
            <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase">Awaiting verification</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Verification Sample Queue</CardTitle>
              <CardDescription>Randomly sampled cases requiring Head Office sign-off.</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold px-3">
              {pendingVerifications?.length || 0} Cases
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {pLoading ? (
              <div className="py-20 text-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Synchronizing queue...</div>
            ) : pendingVerifications && pendingVerifications.length > 0 ? (
              <div className="divide-y">
                {pendingVerifications.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{v.customerName}</p>
                        <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-200">{v.accountType}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        {v.submissionId} • {v.branch} • By: {v.officer}
                      </p>
                    </div>
                    <Button asChild size="sm" className="font-bold shadow-sm rounded-lg bg-slate-900">
                      <Link href={`/head-office/follow-up/${v.id}`}>
                        Execute Audit <TrendingUp className="w-3.5 h-3.5 ml-2" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center space-y-4">
                <Dices className="w-12 h-12 text-slate-200 mx-auto" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">Queue Exhausted</p>
                  <p className="text-sm text-muted-foreground">Generate a new sample to begin quality control.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Audit Log
              </CardTitle>
              <CardDescription>Recently completed institutional verifications.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {verifications?.filter(v => v.status === 'Completed').slice(0, 5).map((v) => (
                  <div key={v.id} className="flex gap-4 p-4 border rounded-xl bg-white shadow-sm hover:border-primary/20 transition-all">
                    <div className={cn(
                      "p-2 rounded-lg h-fit",
                      v.result === 'Correct' ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
                    )}>
                      {v.result === 'Correct' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900 leading-none">{v.customerName}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{v.branch} Node • {new Date(v.verifiedAt).toLocaleDateString()}</p>
                      {v.remarks && <p className="text-xs text-slate-600 italic line-clamp-1">"{v.remarks}"</p>}
                    </div>
                  </div>
                ))}
                {(!verifications || verifications.filter(v => v.status === 'Completed').length === 0) && (
                  <div className="text-center py-10 text-muted-foreground italic text-sm">No audit history found.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-slate-200 overflow-hidden bg-slate-900 text-white">
            <CardHeader className="border-b border-white/10">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Jurisdictional Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {Object.entries(analytics.byBranch).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([branch, count]) => (
                  <div key={branch} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-sm font-bold text-slate-300">{branch}</span>
                    <Badge className="bg-orange-500 text-white border-none font-black">{count} Errors</Badge>
                  </div>
                ))}
                {Object.keys(analytics.byBranch).length === 0 && (
                  <p className="text-center py-4 text-slate-500 text-xs font-bold uppercase tracking-widest">System nodes compliant</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
