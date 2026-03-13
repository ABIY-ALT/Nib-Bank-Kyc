'use client';

import { useAuth } from "@/lib/auth";
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
  Zap,
  Landmark,
  ShieldAlert,
  Inbox,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getSubmissions } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { KYC_STATUS } from "@/lib/kyc-data";
import { usePermissions } from "@/hooks/use-permissions";

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
        const isSpecialist = user.roles?.some(ur => ['KYC_SPECIALIST', 'KYC_OFFICER', 'SUPERVISOR', 'KYC_SPECIALIST_OFFICER'].includes(ur.role.name));
        
        let filters: any = { limit: 100 };

        if (!isSuperAdmin) {
          if (isDirector && user.districtName) {
            filters.district = user.districtName;
          } else if (isSpecialist) {
            if (user.assignedBranches && user.assignedBranches.length > 0) {
              filters.branches = user.assignedBranches;
            } else if (user.branchName) {
              filters.branch = user.branchName;
            } else {
              filters.branch = "RESTRICTED_ACCESS_PENDING_ASSIGNMENT";
            }
          } else if (user.branchName) {
            filters.branch = user.branchName;
          } else {
            filters.branch = "RESTRICTED_ACCESS";
          }
        }

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
    const rawBranchName = user?.branchName || 'Local';
    const cleanBranchName = rawBranchName.toLowerCase().includes('branch') ? rawBranchName : `${rawBranchName} Branch`;
    
    if (isSuperAdmin) return {
      title: 'Dashboard',
      subtitle: 'Global network oversight and master control.',
      scope: 'Global',
      icon: Shield
    };
    
    if (roleName === 'DISTRICT_DIRECTOR') return {
      title: `${user?.districtName || 'Regional'} District Command`,
      subtitle: `Overseeing operational health for regional branches.`,
      scope: 'Regional',
      icon: Landmark
    };

    if (['KYC_SPECIALIST', 'KYC_OFFICER', 'SUPERVISOR'].includes(roleName)) return {
      title: 'Specialist Analysis Hub',
      subtitle: `Portfolio visibility across authorized jurisdiction nodes.`,
      scope: 'Portfolio',
      icon: Zap
    };

    return {
      title: `${cleanBranchName} Node`,
      subtitle: 'Local node activity monitoring and methodology tracking.',
      scope: 'Branch',
      icon: Building2
    };
  }, [user, isSuperAdmin]);

  const stats = useMemo(() => {
    const scopeLabel = dashboardContext.scope;
    if (!recentSubmissions) return [];

    const authorizedCount = recentSubmissions.filter(s => s.status === KYC_STATUS.APPROVED).length;
    const actionCount = recentSubmissions.filter(s => s.status === KYC_STATUS.ACTION_REQUIRED).length;
    const totalCount = recentSubmissions.length;

    const methodologyScore = totalCount > 0 
      ? Math.round(((totalCount - actionCount) / totalCount) * 100) 
      : 100;

    return [
      { label: `${scopeLabel} Active`, value: totalCount.toString(), icon: Inbox, color: 'text-blue-600' },
      { label: 'Authorized Recently', value: authorizedCount.toString(), icon: ShieldCheck, color: 'text-emerald-600' },
      { label: 'Action Required', value: actionCount.toString(), icon: AlertCircle, color: 'text-orange-600' },
      { label: 'Methodology Index', value: `${methodologyScore}%`, icon: TrendingUp, color: 'text-primary' },
    ];
  }, [recentSubmissions, dashboardContext]);

  const isBranchOfficer = useMemo(() => {
    return user?.roles?.some(ur => ur.role.name === 'BRANCH_OFFICER');
  }, [user]);

  if (permissionsLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const Icon = dashboardContext.icon;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-4 mb-1">
            <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
              <Icon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-foreground font-headline">
                {dashboardContext.title}
              </h1>
              <p className="text-muted-foreground text-lg font-medium">{dashboardContext.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isSuperAdmin && user?.districtName && (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-4 py-2 font-black h-12 flex items-center gap-2 text-xs rounded-xl shadow-sm">
              <MapPin className="w-4 h-4" /> {user.districtName} Node
            </Badge>
          )}
          {isBranchOfficer && (
            <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl h-12 px-8 font-black text-lg rounded-xl transition-all active:scale-[0.98]">
              <Link href="/submissions/new">Create Submission</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-lg border overflow-hidden group hover:border-primary/40 transition-all rounded-2xl bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{stat.label}</CardTitle>
              <stat.icon className={cn("h-4 w-4 transition-transform group-hover:scale-125", stat.color)} />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-4xl font-black text-slate-900 tracking-tighter">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between p-6">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" /> Operational Stream
              </CardTitle>
              <CardDescription>Live tracking for authorized institutional cases.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary font-bold hover:bg-primary/5">
              <Link href="/submissions" className="flex items-center gap-1">
                Institutional Archive <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
                </div>
              ) : recentSubmissions && recentSubmissions.length > 0 ? (
                recentSubmissions.slice(0, 10).map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-all group">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">{sub.customerName}</p>
                        {sub.isExceptional && (
                          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-100 text-[8px] h-4 font-black uppercase px-1.5">
                            Hierarchy Process
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                        {sub.id} • {sub.branch?.name || sub.branchName} Node
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className={cn(
                        "font-black text-[9px] uppercase px-3 py-1 border-2",
                        sub.status === KYC_STATUS.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                        sub.status === KYC_STATUS.ACTION_REQUIRED ? 'bg-orange-50 text-orange-700 border-orange-100' :
                        'bg-blue-50 text-blue-700 border-blue-100'
                      )}>
                        {sub.status === KYC_STATUS.APPROVED ? 'SUCCESSFULLY AUTHORIZED' : sub.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/10 text-primary">
                        <Link href={`/submissions/${sub.id}`}><ArrowUpRight className="w-5 h-5" /></Link>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-20 bg-slate-50/30 rounded-2xl">
                  <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-black uppercase tracking-widest">No Operational Data Found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b p-6">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" /> Methodology Updates
            </CardTitle>
            <CardDescription>Critical policy methodology for specialists.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 px-6">
             <div className="space-y-4">
                {settings?.guidelines && (settings.guidelines as any[]).length > 0 ? (
                  (settings.guidelines as any[]).map((guide) => (
                    <div key={guide.id} className={`flex gap-4 p-5 rounded-2xl border transition-all hover:scale-[1.02] ${guide.type === 'alert' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'}`}>
                      {guide.type === 'alert' ? <ShieldAlert className="w-6 h-6 text-orange-600 shrink-0" /> : <Info className="w-6 h-6 text-blue-600 shrink-0" />}
                      <div className="text-sm">
                        <p className="font-bold text-slate-900 leading-tight">{guide.title}</p>
                        <p className="text-slate-600 leading-relaxed mt-1 font-medium text-xs">{guide.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 text-muted-foreground italic">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed">
                      <Landmark className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">No methodology published.</p>
                  </div>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
