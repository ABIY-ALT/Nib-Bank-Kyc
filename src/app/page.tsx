'use client';

import { useAuth } from "@/lib/auth-mock";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  FileCheck, 
  Clock, 
  AlertCircle, 
  ArrowUpRight,
  TrendingUp,
  History,
  ShieldCheck,
  Info,
  Loader2,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getSubmissions } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { SubmissionStatus, UserRole } from "@prisma/client";
import { usePermissions } from "@/hooks/use-permissions";

export default function Dashboard() {
  const { user } = useAuth();
  const { permissions } = usePermissions(user);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === UserRole.ADMIN;
  const isKYC = user?.role === UserRole.KYC_OFFICER || user?.role === UserRole.SUPERVISOR;

  useEffect(() => {
    async function loadDashboard() {
      if (!user) return;
      setLoading(true);
      try {
        const [subs, globalSettings] = await Promise.all([
          getSubmissions({
            limit: 5,
            branch: user.role === UserRole.BRANCH_OFFICER ? user.branchName || undefined : undefined,
            district: user.role === UserRole.DISTRICT_DIRECTOR ? user.districtName || undefined : undefined
          }),
          getGlobalSettings()
        ]);
        setRecentSubmissions(subs);
        setSettings(globalSettings);
      } catch (error) {
        console.error("Dashboard data fetch failed:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [user]);

  const stats = useMemo(() => {
    const scopeLabel = isAdmin ? 'Global' : user?.role === UserRole.DISTRICT_DIRECTOR ? 'Regional' : 'Branch';
    if (!recentSubmissions || recentSubmissions.length === 0) return [
      { label: `${scopeLabel} Activity`, value: '0', icon: History, color: 'text-blue-600' },
      { label: 'Approved Cases', value: '0', icon: FileCheck, color: 'text-green-600' },
      { label: 'Action Required', value: '0', icon: AlertCircle, color: 'text-orange-600' },
      { label: 'Network SLA', value: '100%', icon: TrendingUp, color: 'text-purple-600' },
    ];

    const approvedCount = recentSubmissions.filter(s => s.status === SubmissionStatus.APPROVED).length;
    const amendedCount = recentSubmissions.filter(s => s.status === SubmissionStatus.AMENDED).length;

    return [
      { label: `${scopeLabel} Active`, value: recentSubmissions.length.toString(), icon: History, color: 'text-blue-600' },
      { label: 'Approved Recently', value: approvedCount.toString(), icon: FileCheck, color: 'text-green-600' },
      { label: 'Action Required', value: amendedCount.toString(), icon: AlertCircle, color: 'text-orange-600' },
      { label: 'Network SLA', value: '98.4%', icon: TrendingUp, color: 'text-purple-600' },
    ];
  }, [recentSubmissions, isAdmin, user]);

  const dashboardTitle = useMemo(() => {
    if (isAdmin) return 'Institutional Command';
    if (user?.role === UserRole.DISTRICT_DIRECTOR) return `${user.districtName || 'Regional'} District Portal`;
    if (isKYC) return 'KYC Verification Hub';
    return `${user?.branchName || 'Local'} Branch Portal`;
  }, [isAdmin, user, isKYC]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
            {dashboardTitle}
          </h1>
          <p className="text-muted-foreground text-lg">Welcome back, {user?.name}. Institutional session active.</p>
        </div>
        <div className="flex items-center gap-3">
          {permissions.canSubmit && (
            <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl h-12 px-8 font-bold text-lg">
              <Link href="/submissions/new">Create New Submission</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-lg border-slate-200 overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color} group-hover:scale-125 transition-transform`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-slate-900">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity Stream</CardTitle>
              <CardDescription>Live tracking for authorized jurisdictional submissions.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary font-bold">
              <Link href="/submissions" className="flex items-center gap-1">
                View Archive <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Querying Operational Vault...</p>
                </div>
              ) : recentSubmissions && recentSubmissions.length > 0 ? (
                recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">{sub.customerName}</p>
                        {sub.isExceptional && <Badge className="bg-yellow-50 text-yellow-700 border-yellow-100 text-[8px] h-4 font-black uppercase">Hierarchy</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{sub.id} • {sub.branchName} Node</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={
                        sub.status === SubmissionStatus.APPROVED ? 'default' : 
                        sub.status === SubmissionStatus.AMENDED ? 'secondary' : 
                        sub.status === SubmissionStatus.PENDING ? 'outline' : 'destructive'
                      } className={cn(
                        "font-bold",
                        sub.status === SubmissionStatus.APPROVED && 'bg-emerald-50 text-emerald-700 border-emerald-100',
                        sub.status === SubmissionStatus.AMENDED && 'bg-orange-50 text-orange-700 border-orange-100'
                      )}>
                        {sub.status === SubmissionStatus.AMENDED ? 'Action Required' : sub.status}
                      </Badge>
                      <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/5 text-primary">
                        <Link href={`/submissions/${sub.id}`}><ArrowUpRight className="w-5 h-5" /></Link>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed">
                  <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-bold">No Operational Data Found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle>System Guidelines</CardTitle>
            <CardDescription>Critical updates for compliance officers.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
             <div className="space-y-4">
                {settings?.guidelines && (settings.guidelines as any[]).length > 0 ? (
                  (settings.guidelines as any[]).map((guide) => (
                    <div key={guide.id} className={`flex gap-4 p-5 rounded-2xl border ${guide.type === 'alert' ? 'bg-accent/5 border-accent/20' : 'bg-blue-50 border-blue-100'}`}>
                      {guide.type === 'alert' ? <ShieldCheck className="w-6 h-6 text-accent shrink-0" /> : <Info className="w-6 h-6 text-blue-600 shrink-0" />}
                      <div className="text-sm">
                        <p className="font-bold text-slate-900">{guide.title}</p>
                        <p className="text-slate-600 leading-relaxed mt-1 font-medium">{guide.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground italic">
                    <Info className="w-8 h-8 mx-auto mb-2 opacity-20" /><p className="text-sm">No guidelines published.</p>
                  </div>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
