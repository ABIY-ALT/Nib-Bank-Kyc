
'use client';

import { currentUser } from "@/lib/auth-mock";
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
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy, limit } from "firebase/firestore";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function Dashboard() {
  const user = currentUser;
  const db = useFirestore();

  // Branch-filtered queries
  const branchSubmissionsQuery = useMemo(() => {
    if (!db || !user.branch) return null;
    return query(
      collection(db, "submissions"), 
      where("branch", "==", user.branch),
      orderBy("submittedAt", "desc"),
      limit(5)
    );
  }, [db, user.branch]);

  const { data: recentSubmissions, loading } = useCollection<KYCSubmission>(branchSubmissionsQuery);

  // Mock stats for prototype (in real app these would be aggregations)
  const stats = [
    { label: 'My Branch Submissions', value: recentSubmissions?.length.toString() || '0', icon: History, color: 'text-blue-600' },
    { label: 'Approved Cases', value: '12', icon: FileCheck, color: 'text-green-600' },
    { label: 'Action Required', value: '3', icon: AlertCircle, color: 'text-orange-600' },
    { label: 'Avg Processing', value: '1.4 Days', icon: TrendingUp, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-headline">
            {user.branch} Branch Portal
          </h1>
          <p className="text-muted-foreground">Welcome back, {user.name}. Manage your branch's KYC submissions.</p>
        </div>
        {user.role === 'Branch Officer' && (
          <Button asChild className="bg-primary hover:bg-primary/90 shadow-md">
            <Link href="/submissions/new">
              Create New Submission
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Recent Branch Activity</CardTitle>
            <CardDescription>Status tracking for your latest submissions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {loading ? (
                <p className="text-sm text-muted-foreground italic">Updating records...</p>
              ) : recentSubmissions && recentSubmissions.length > 0 ? (
                recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{sub.customerName}</p>
                      <p className="text-xs text-muted-foreground">{sub.id} • {new Date(sub.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={
                        sub.status === 'Approved' ? 'default' : 
                        sub.status === 'Amended' ? 'secondary' : 
                        sub.status === 'Pending' ? 'outline' : 'destructive'
                      } className={
                        sub.status === 'Amended' ? 'bg-orange-100 text-orange-800 border-orange-200' : ''
                      }>
                        {sub.status === 'Amended' ? 'Action Required' : sub.status}
                      </Badge>
                      <Button variant="ghost" size="icon" asChild className="text-primary hover:text-primary hover:bg-primary/5">
                        <Link href={`/submissions/${sub.id}`}>
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No recent activity for this branch.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Guidelines & Notifications</CardTitle>
            <CardDescription>Important updates for Branch Officers.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                <div className="flex gap-4 p-4 rounded-xl border bg-accent/5 border-accent/20">
                  <History className="w-5 h-5 text-accent shrink-0" />
                  <div className="text-sm">
                    <p className="font-bold text-slate-800">Policy Update</p>
                    <p className="text-slate-600 leading-relaxed mt-1">High-resolution document scans are now mandatory for all corporate KYC submissions.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 rounded-xl border bg-blue-50/50 border-blue-100">
                  <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-bold text-slate-800">SLA Reminder</p>
                    <p className="text-slate-600 leading-relaxed mt-1">Action Required items must be resubmitted within 24 hours to maintain branch SLA.</p>
                  </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
