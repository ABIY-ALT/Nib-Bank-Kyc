'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Dices,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { getApprovedCasesForFollowUp, getFollowUpVerifications, seedFollowUpPool } from "@/actions/follow-up";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function FollowUpDashboard() {
  const { toast } = useToast();
  const router = useRouter();

  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSampling, setIsSampling] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    // Load the WHOLE pool: the action defaults to take:100, which silently
    // capped the pending pool, the quality analytics, and the history export.
    const filters: any = { limit: 100000 };

    if (dateRange?.from) {
      filters.startDate = dateRange.from.toISOString();
      if (dateRange.to) filters.endDate = dateRange.to.toISOString();
    }

    const result = await getFollowUpVerifications(filters);
    setVerifications(result.verifications);
    setLoading(false);
  };

  const pendingVerifications = useMemo(
    () => verifications.filter((verification: any) => verification.status === "PENDING"),
    [verifications]
  );

  const completedVerifications = useMemo(
    () => verifications.filter((verification: any) => verification.status === "COMPLETED"),
    [verifications]
  );

  const handleSampleCases = async () => {
    setIsSampling(true);

    try {
      const approved = await getApprovedCasesForFollowUp({ limit: 100 });
      const existingIds = new Set(verifications.map((verification: any) => verification.submissionId));
      const assignable = approved.filter((submission: any) => !existingIds.has(submission.id));

      if (assignable.length === 0) {
        toast({
          variant: "destructive",
          title: "Sampling Pool Empty",
          description: "No new unsampled approved cases were found in the archive.",
        });
        return;
      }

      const selected = assignable
        .map((value: any) => ({ value, sort: window.crypto.getRandomValues(new Uint32Array(1))[0] }))
        .sort((a: any, b: any) => a.sort - b.sort)
        .map(({ value }: any) => value)
        .slice(0, 5);

      const poolData = selected.map((submission: any) => ({
        submissionId: submission.id,
        customerName: submission.customerName,
        branch: submission.branchName,
        officer: submission.createdBy?.firstName
          ? `${submission.createdBy.firstName} ${submission.createdBy.lastName}`
          : "Unknown",
        accountType: submission.entityType || "individual",
        status: "PENDING",
        verifiedAt: new Date().toISOString(),
      }));

      const result = await seedFollowUpPool(poolData);
      if (!result.success) {
        throw new Error(result.error || "Unable to seed follow-up pool.");
      }

      toast({
        title: "Random Sample Generated",
        description: `Added ${selected.length} cases to the shared pool.`,
      });
      loadData();
    } catch (error) {
      toast({ variant: "destructive", title: "Sampling Error" });
    } finally {
      setIsSampling(false);
    }
  };

  const handleStartRandomReview = () => {
    if (pendingVerifications.length === 0) return;

    const randomIndex = window.crypto.getRandomValues(new Uint32Array(1))[0] % pendingVerifications.length;
    const randomCase = pendingVerifications[randomIndex];
    router.push(`/head-office/follow-up/${randomCase.id}`);
  };

  const analytics = useMemo(() => {
    const total = completedVerifications.length;
    const discrepancies = completedVerifications.filter((verification: any) => verification.result === "Discrepancy").length;
    const rate = total > 0 ? Math.round(((total - discrepancies) / total) * 100) : 100;

    return { rate, total, discrepancies };
  }, [completedVerifications]);

  const handleExportHistory = () => {
    if (completedVerifications.length === 0) return;

    const headers = ["Review ID", "Case ID", "Customer", "Branch", "Result", "Reviewer", "Review Date"];
    const rows = completedVerifications.map((verification: any) => [
      verification.id,
      verification.submissionId,
      verification.customerName,
      verification.branch,
      verification.result,
      verification.verifiedBy || "N/A",
      format(new Date(verification.verifiedAt), "yyyy-MM-dd"),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row: any) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nib-followup-history-${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();

    toast({ title: "History Exported" });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2 text-white shadow-lg">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <h1 className="font-headline text-4xl font-extrabold tracking-tight text-slate-900">Follow up</h1>
          </div>
          <p className="text-lg font-medium text-muted-foreground">
            Head Office shared pool for quality control and random follow-up review.
          </p>
        </div>

        <div className="flex gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Button
            onClick={handleStartRandomReview}
            disabled={pendingVerifications.length === 0}
            className="h-12 gap-2 bg-primary px-8 font-black text-white shadow-xl hover:bg-primary/90"
          >
            <Zap className="h-5 w-5 fill-white" />
            Start Next Review
          </Button>
          <Button
            variant="outline"
            onClick={handleExportHistory}
            className="h-12 gap-2 border-slate-200 px-6 font-bold shadow-sm"
          >
            <History className="h-5 w-5 text-primary" />
            Export History
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardContent className="flex items-center justify-between p-4 md:p-6">
          <div className="space-y-1">
            <p className="font-bold text-slate-900">Shared Follow-up Pool Management</p>
            <p className="text-sm text-slate-500">
              Seed the pool with approved cases from the institutional archive for random review.
            </p>
          </div>
          <Button
            onClick={handleSampleCases}
            disabled={isSampling}
            className="min-w-[240px] rounded-xl bg-primary px-8 text-white shadow-xl"
          >
            {isSampling ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <Dices className="mr-3 h-5 w-5" />}
            Seed Shared Pool
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden border-slate-200 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-primary/5 pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Compliance Index</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-slate-900">{analytics.rate}%</div>
            <Progress value={analytics.rate} className="mt-3 h-1.5 bg-slate-100" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="bg-primary/5 pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Checked</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-slate-900">{analytics.total}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 border-l-4 border-l-orange-500 shadow-lg">
          <CardHeader className="bg-primary/5 pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Discrepancies</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-orange-600">{analytics.discrepancies}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="bg-primary/5 pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-600">Shared Queue</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-blue-600">{pendingVerifications.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-7">
        <Card className="min-h-[400px] overflow-hidden border-slate-200 shadow-xl lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-primary text-white">
            <div>
              <CardTitle className="text-xl text-white">Institutional Shared Pool</CardTitle>
              <CardDescription className="text-white/70">
                Sampled cases available for any Head Office officer.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="border-white/20 bg-white/20 px-3 font-bold text-white">
              {pendingVerifications.length} Cases Available
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-32 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            ) : pendingVerifications.length > 0 ? (
              <div className="divide-y">
                {pendingVerifications.map((verification: any) => (
                  <div
                    key={verification.id}
                    className="group flex items-center justify-between p-5 transition-colors hover:bg-slate-50"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{verification.customerName}</p>
                        <Badge variant="outline" className="text-[9px] font-black uppercase">
                          {verification.accountType}
                        </Badge>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {verification.submissionId} | {verification.branch} | By: {verification.officer}
                      </p>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      className="rounded-lg bg-primary font-bold text-white shadow-sm transition-colors hover:bg-primary/90"
                    >
                      <Link href={`/head-office/follow-up/${verification.id}`}>
                        Pick Case <ChevronRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 py-24 text-center">
                <div className="mx-auto w-fit rounded-full bg-slate-50 p-6">
                  <Zap className="h-12 w-12 text-slate-300" />
                </div>
                <p className="font-bold text-slate-900">Pool Exhausted</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card className="overflow-hidden border-slate-200 shadow-xl">
            <CardHeader className="border-b bg-primary text-white">
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <History className="h-5 w-5 text-white" />
                Follow-up History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {completedVerifications.slice(0, 5).map((verification: any) => (
                  <div
                    key={verification.id}
                    className="flex items-center justify-between gap-4 rounded-xl border bg-white p-4 shadow-sm"
                  >
                    <div className="flex gap-4">
                      <div
                        className={cn(
                          "h-fit rounded-lg p-2",
                          verification.result === "Correct"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-orange-50 text-orange-600"
                        )}
                      >
                        {verification.result === "Correct" ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold leading-none text-slate-900">{verification.customerName}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          {verification.branch} |{" "}
                          {verification.verifiedAt ? format(new Date(verification.verifiedAt), "MMM dd") : "N/A"}
                        </p>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <Link href={`/head-office/follow-up/${verification.id}`}>Open Case</Link>
                    </Button>
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
