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
  ChevronRight,
  LayoutDashboard,
  Shield,
  Building2,
  MapPin,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getSubmissions } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { KYCStatus } from "@prisma/client";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * Optimized Institutional Dashboard.
 * Uses Promise.all for parallel data fetching and Vault-level filtering.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { hasPermission, loading: permissionsLoading, isSuperAdmin } = usePermissions();
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      if (!user) return;
      setLoading(true);
      try {
        const isDirector = user.roles?.some(ur => ur.role.name === 'DISTRICT_DIRECTOR');
        const isSpecialist = user.roles?.some(ur => ['KYC_SPECIALIST', 'KYC_OFFICER', 'SUPERVISOR'].includes(ur.role.name));
        
        let filters: any = { limit: 10 }; // Leaner limit for dashboard

        if (!isSuperAdmin) {
          if (isDirector && user.districtName) {
            filters.district = user.districtName;
          } else if (isSpecialist) {
            // Specialists MUST be restricted to their assigned portfolio or home branch
            if (user.assignedBranches && user.assignedBranches.length > 0) {
              filters.branches = user.assignedBranches;
            } else if (user.branchName) {
              filters.branch = user.branchName;
            } else {
              // If an Institutional KYC Officer has no assignments, they see nothing by default
              filters.branch = "RESTRICTED_ACCESS_PENDING_ASSIGNMENT";
            }
          } else if (user.branchName) {
            filters.branch = user.branchName;
          } else {
            // General catch-all for node-less roles to prevent global data leak
            filters.branch = "RESTRICTED_ACCESS";
          }
        }

        // Parallel aggregation to prevent waterfalls
        const [subs, globalSettings] = await Promise.all([
          getSubmissions(filters),
          getGlobalSettings()
        ]);
        
        setRecentSubmissions(subs);
        setSettings(globalSettings);
      } catch (error) {
        console.error("Dashboard aggregation failed:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [user, isSuperAdmin]);

  const dashboardContext = useMemo(() => {
    const roleName = user?.roles?.[0]?.role?.name || 'OFFICER';
    
    if (isSuperAdmin) return {
      title: 'Institutional Command',
      subtitle: 'Global network oversight and master control.',
      scope: 'Global',
      icon: Shield
    };
    
    if (roleName === 'DISTRICT_DIRECTOR') return {
      title: `${user?.districtName || 'Regional'} District Command`,
      subtitle: `Overseeing operational health for regional branches.`,
      scope: 'Regional',
      icon: MapPin
    };

    if (['KYC_SPECIALIST', 'KYC_OFFICER', 'SUPERVISOR'].includes(roleName)) return {
      title: 'KYC Verification Hub',
      subtitle: `Portfolio visibility across authorized jurisdiction nodes.`,
      scope: 'Portfolio',
      icon: Zap
    };

    return {
      title: user?.branchName ? `${user.branchName} Overview` : 'Local Branch Overview',
      subtitle: 'Local branch activity monitoring and amendment tracking.',
      scope: 'Branch',
      icon: Building2
    };
  }, [user, isSuperAdmin]);

  const stats = useMemo(() => {
    const scopeLabel = dashboardContext.scope;
    if (!recentSubmissions) return [];

    const approvedCount = recentSubmissions.filter(s => s.status === KYCStatus.APPROVED).length;
    const actionCount = recentSubmissions.filter(s => s.status === KYCStatus.ACTION_REQUIRED).length;

    return [
      { label: `${scopeLabel} Active`, value: recentSubmissions.length.toString(), icon: History, color: 'text-blue-600' },
      { label: 'Approved Recently', value: approvedCount.toString(), icon: FileCheck, color: 'text-emerald-600' },
      { label: 'Action Required', value: actionCount.toString(), icon: AlertCircle, color: 'text-orange-600' },
      { label: 'SLA Compliance', value: '98.4%', icon: TrendingUp, color: 'text-primary' },
    ];
  }, [recentSubmissions, dashboardContext]);

  if (permissionsLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Syncing secure session...</p>
      </div>
    );
  }

  const Icon = dashboardContext.icon;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Icon className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {dashboardContext.title}
            </h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">{dashboardContext.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasPermission('CASE_SUBMIT') && (
            <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl h-12 px-8 font-black text-lg rounded-2xl">
              <a href="/submissions/new">Create New Submission</a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/30 transition-all rounded-2xl bg-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{stat.label}</CardTitle>
              <stat.icon className={cn("h-4 w-4 transition-transform group-hover:scale-125", stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black text-slate-900 tracking-tighter">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between p-6">
            <div>
              <CardTitle className="text-xl font-bold">Activity Stream</CardTitle>
              <CardDescription>Live tracking for {dashboardContext.scope.toLowerCase()} authorized cases.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary font-bold hover:bg-primary/5">
              <a href="/submissions" className="flex items-center gap-1">
                View Archive <ChevronRight className="w-4 h-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Querying Vault...</p>
                </div>
              ) : recentSubmissions && recentSubmissions.length > 0 ? (
                recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">{sub.customerName}</p>
                        {sub.isExceptional && <Badge className="bg-yellow-50 text-yellow-700 border-yellow-100 text-[8px] h-4 font-black uppercase">Hierarchy</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        {sub.id} • {sub.branch?.name || sub.branchName} Node
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className={cn(
                        "font-black text-[10px] uppercase px-3 py-1",
                        sub.status === KYCStatus.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                        sub.status === KYCStatus.ACTION_REQUIRED ? 'bg-orange-50 text-orange-700 border-orange-100' :
                        'bg-blue-50 text-blue-700 border-blue-100'
                      )}>
                        {sub.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/5 text-primary">
                        <a href={`/submissions/${sub.id}`}><ArrowUpRight className="w-5 h-5" /></a>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed">
                  <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">No Operational Data Found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-xl font-bold">Institutional Guidelines</CardTitle>
            <CardDescription>Critical policy updates for verification specialists.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
             <div className="space-y-4">
                {settings?.guidelines && (settings.guidelines as any[]).length > 0 ? (
                  (settings.guidelines as any[]).map((guide) => (
                    <div key={guide.id} className={`flex gap-4 p-5 rounded-2xl border ${guide.type === 'alert' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'}`}>
                      {guide.type === 'alert' ? <AlertCircle className="w-6 h-6 text-orange-600 shrink-0" /> : <Info className="w-6 h-6 text-blue-600 shrink-0" />}
                      <div className="text-sm">
                        <p className="font-bold text-slate-900">{guide.title}</p>
                        <p className="text-slate-600 leading-relaxed mt-1 font-medium">{guide.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16 text-muted-foreground italic">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Info className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest">No guidelines published.</p>
                  </div>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
