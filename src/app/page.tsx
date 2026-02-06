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
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy, limit } from "firebase/firestore";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function Dashboard() {
  const { user } = useAuth();
  const db = useFirestore();

  // Dashboard context: Branch portal for officers, Global portal for management
  const isManagement = ['Admin', 'Director', 'Supervisor', 'District Director'].includes(user.role);

  const dashboardQuery = useMemo(() => {
    if (!db) return null;
    if (isManagement) {
      return query(
        collection(db, "submissions"), 
        orderBy("submittedAt", "desc"),
        limit(5)
      );
    }
    return query(
      collection(db, "submissions"), 
      where("branch", "==", user.branch || "Headquarters"),
      orderBy("submittedAt", "desc"),
      limit(5)
    );
  }, [db, user.branch, isManagement]);

  const { data: recentSubmissions, loading } = useCollection<KYCSubmission>(dashboardQuery);

  const stats = [
    { label: isManagement ? 'Global Submissions' : 'My Branch Submissions', value: recentSubmissions?.length.toString() || '0', icon: History, color: 'text-blue-600' },
    { label: 'Approved Cases', value: '12', icon: FileCheck, color: 'text-green-600' },
    { label: 'Action Required', value: '3', icon: AlertCircle, color: 'text-orange-600' },
    { label: 'Avg Processing', value: '1.4 Days', icon: TrendingUp, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
            {isManagement ? 'Institutional Command' : `${user.branch} Branch Portal`}
          </h1>
          <p className="text-muted-foreground text-lg">Welcome back, {user.name}. {isManagement ? 'Overseeing network-wide KYC compliance.' : 'Managing your branch\'s local submissions.'}</p>
        </div>
        {user.role === 'Branch Officer' && (
          <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl h-12 px-8 font-bold text-lg">
            <Link href="/submissions/new">
              Create New Submission
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-lg border-slate-200 overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">{stat.label}</CardTitle>
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
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle>Recent Activity Stream</CardTitle>
            <CardDescription>Live tracking for {isManagement ? 'global' : 'branch'} submissions.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                  <History className="w-4 h-4 animate-spin" /> Syncing records...
                </div>
              ) : recentSubmissions && recentSubmissions.length > 0 ? (
                recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">{sub.customerName}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{sub.id} • {sub.branch} Branch</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={
                        sub.status === 'Approved' ? 'default' : 
                        sub.status === 'Amended' ? 'secondary' : 
                        sub.status === 'Pending' ? 'outline' : 'destructive'
                      } className={`font-bold ${
                        sub.status === 'Amended' ? 'bg-orange-100 text-orange-800 border-orange-200' : ''
                      }`}>
                        {sub.status === 'Amended' ? 'Action Required' : sub.status}
                      </Badge>
                      <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/5 text-primary">
                        <Link href={`/submissions/${sub.id}`}>
                          <ArrowUpRight className="w-5 h-5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed">
                  <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">No recent activity detected.</p>
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
                <div className="flex gap-4 p-5 rounded-2xl border bg-accent/5 border-accent/20">
                  <ShieldCheck className="w-6 h-6 text-accent shrink-0" />
                  <div className="text-sm">
                    <p className="font-bold text-slate-900">High-Risk Alert</p>
                    <p className="text-slate-600 leading-relaxed mt-1 font-medium">Enhanced Due Diligence (EDD) is now required for all corporate entities in the industrial sector.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-5 rounded-2xl border bg-blue-50 border-blue-100">
                  <Clock className="w-6 h-6 text-blue-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-bold text-slate-900">SLA Enforcement</p>
                    <p className="text-slate-600 leading-relaxed mt-1 font-medium">All "Action Required" items must be addressed within 24 hours to maintain branch performance rankings.</p>
                  </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
