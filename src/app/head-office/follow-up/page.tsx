
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Building2, 
  Loader2,
  Dices,
  History,
  FileText,
  Zap,
  ChevronRight
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getFollowUpVerifications, seedFollowUpPool } from "@/actions/follow-up";
import { getSubmissions } from "@/actions/submissions";
import { KYCStatus } from "@prisma/client";

export default function FollowUpDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSampling, setIsSampling] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getFollowUpVerifications();
    setVerifications(data);
    setLoading(false);
  };

  const pendingVerifications = useMemo(() => 
    verifications.filter(v => v.status === 'PENDING'), 
  [verifications]);

  const handleSampleCases = async () => {
    setIsSampling(true);
    try {
      const approved = await getSubmissions({
        status: [KYCStatus.APPROVED],
        limit: 100
      });

      const existingIds = new Set(verifications.map(v => v.submissionId));
      const assignable = approved.filter(s => !existingIds.has(s.id));

      if (assignable.length === 0) {
        toast({ 
          variant: "destructive", 
          title: "Sampling Pool Empty", 
          description: "No new un-audited cases discovered in the archive." 
        });
        return;
      }

      const selected = assignable.sort(() => 0.5 - Math.random()).slice(0, 5);
      const poolData = selected.map(s => ({
        submissionId: s.id,
        customerName: s.customerName,
        branch: s.branchName,
        officer: s.createdBy?.firstName ? `${s.createdBy.firstName} ${s.createdBy.lastName}` : 'Unknown',
        accountType: s.entityType || "individual",
        status: "PENDING",
        verifiedAt: new Date().toISOString()
      }));

      await seedFollowUpPool(poolData);
      toast({ title: "Random Sample Generated", description: `Added ${selected.length} cases to the shared pool.` });
      loadData();
    } catch (e) {
      toast({ variant: "destructive", title: "Sampling Error" });
    } finally {
      setIsSampling(false);
    }
  };

  const handleStartRandomAudit = () => {
    if (pendingVerifications.length === 0) return;
    const randomCase = pendingVerifications[Math.floor(Math.random() * pendingVerifications.length)];
    router.push(`/head-office/follow-up/${randomCase.id}`);
  };

  const analytics = useMemo(() => {
    const completed = verifications.filter(v => v.status === 'COMPLETED');
    const total = completed.length;
    const discrepancies = completed.filter(v => v.result === 'Discrepancy').length;
    const rate = total > 0 ? Math.round(((total - discrepancies) / total) * 100) : 100;

    const byBranch: Record<string, number> = {};
    completed.filter(v => v.result === 'Discrepancy').forEach(v => {
      byBranch[v.branch] = (byBranch[v.branch] || 0) + 1;
    });

    return { rate, total, discrepancies, byBranch };
  }, [verifications]);

  const handleExportHistory = () => {
    const completed = verifications.filter(v => v.status === 'COMPLETED');
    if (completed.length === 0) return;

    const headers = ['Audit ID', 'Case ID', 'Customer', 'Branch', 'Result', 'Auditor', 'Audit Date'];
    const rows = completed.map(v => [v.id, v.submissionId, v.customerName, v.branch, v.result, v.verifiedBy || 'N/A', format(new Date(v.verifiedAt), 'yyyy-MM-dd')]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nib-followup-history-${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
    toast({ title: "History Exported" });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Follow up</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Head Office shared pool for quality control and random audit.</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={handleStartRandomAudit}
            disabled={pendingVerifications.length === 0}
            className="h-12 px-8 font-black bg-primary hover:bg-primary/90 text-white shadow-xl gap-2"
          >
            <Zap className="w-5 h-5 fill-white" />
            Start Next Random Audit
          </Button>
          <Button variant="outline" onClick={handleExportHistory} className="h-12 px-6 font-bold shadow-sm gap-2 border-slate-200">
            <History className="w-5 h-5 text-primary" />
            Export History
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-bold text-slate-900">Shared Audit Pool Management</p>
            <p className="text-sm text-slate-500">Seed the pool with cases from the Institutional Archive for random verification.</p>
          </div>
          <Button onClick={handleSampleCases} disabled={isSampling} className="bg-primary text-white font-black h-12 px-8 gap-3 shadow-xl min-w-[240px] rounded-xl">
            {isSampling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Dices className="w-5 h-5" />}
            Seed Shared Pool
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-lg border-slate-200 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-primary/5">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Compliance Index</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-slate-900">{analytics.rate}%</div>
            <Progress value={analytics.rate} className="h-1.5 mt-3 bg-slate-100" />
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-2 bg-primary/5">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Checked</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-slate-900">{analytics.total}</div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500">
          <CardHeader className="pb-2 bg-primary/5">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Discrepancies</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-orange-600">{analytics.discrepancies}</div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-2 bg-primary/5">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-600">Shared Queue</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-blue-600">{pendingVerifications.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-xl border-slate-200 overflow-hidden min-h-[400px]">
          <CardHeader className="bg-primary text-white border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl text-white">Institutional Shared Pool</CardTitle>
              <CardDescription className="text-white/70">Sampled cases available for any Head Office specialist.</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-white/20 border-white/20 text-white font-bold px-3">
              {pendingVerifications.length} Cases Available
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="font-bold">Syncing pool...</p>
              </div>
            ) : pendingVerifications.length > 0 ? (
              <div className="divide-y">
                {pendingVerifications.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{v.customerName}</p>
                        <Badge variant="outline" className="text-[9px] font-black uppercase">{v.accountType}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        {v.submissionId} • {v.branch} • By: {v.officer}
                      </p>
                    </div>
                    <Button asChild size="sm" className="font-bold shadow-sm rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors">
                      <Link href={`/head-office/follow-up/${v.id}`}>
                        Pick Case <ChevronRight className="w-3.5 h-3.5 ml-2" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center space-y-4">
                <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto"><Zap className="w-12 h-12 text-slate-300" /></div>
                <p className="font-bold text-slate-900">Pool Exhausted</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2 text-white">
                <History className="w-5 h-5 text-white" />
                Audit History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {verifications.filter(v => v.status === 'COMPLETED').slice(0, 5).map((v) => (
                  <div key={v.id} className="flex gap-4 p-4 border rounded-xl bg-white shadow-sm">
                    <div className={cn("p-2 rounded-lg h-fit", v.result === 'Correct' ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600")}>
                      {v.result === 'Correct' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900 leading-none">{v.customerName}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{v.branch} • {v.verifiedAt ? format(new Date(v.verifiedAt), 'MMM dd') : 'N/A'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
