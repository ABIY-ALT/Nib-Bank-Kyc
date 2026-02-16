
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
  Beaker,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useCollection, useDoc, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, limit, doc, setDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { KYCSubmission, MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { useToast } from "@/hooks/use-toast";

interface Guideline {
  id: string;
  title: string;
  description: string;
  type: 'alert' | 'info';
}

export default function Dashboard() {
  const { user } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSeeding, setIsSeeding] = useState(false);

  // Dashboard context: Branch portal for officers, Global portal for management
  const isAdmin = user.role === 'Admin';
  const isManagement = ['Admin', 'Branch Banking Director', 'Supervisor', 'District Director', 'Division Manager', 'Chief Retail & SME Banking Officer', 'Chief'].includes(user.role || '');

  const dashboardQuery = useMemo(() => {
    if (!db) return null;
    if (isAdmin) {
      return query(
        collection(db, "submissions"), 
        orderBy("submittedAt", "desc"),
        limit(5)
      );
    }
    
    if (user.role === 'District Director') {
      return query(
        collection(db, "submissions"),
        where("district", "==", user.district || ""),
        orderBy("submittedAt", "desc"),
        limit(5)
      );
    }

    if (user.branch) {
      return query(
        collection(db, "submissions"), 
        where("branch", "==", user.branch),
        orderBy("submittedAt", "desc"),
        limit(5)
      );
    }

    return query(
      collection(db, "submissions"),
      orderBy("submittedAt", "desc"),
      limit(5)
    );
  }, [db, user.branch, user.district, user.role, isAdmin]);

  const { data: recentSubmissions, loading: submissionsLoading } = useCollection<KYCSubmission>(dashboardQuery);

  const settingsRef = useMemoFirebase(() => {
    return db ? doc(db, "settings", "global") : null;
  }, [db]);

  const { data: settings } = useDoc<{ guidelines?: Guideline[] }>(settingsRef);

  const stats = useMemo(() => {
    if (!recentSubmissions) return [
      { label: isManagement ? 'Global Activity' : 'Branch Activity', value: '0', icon: History, color: 'text-blue-600' },
      { label: 'Approved Cases', value: '0', icon: FileCheck, color: 'text-green-600' },
      { label: 'Action Required', value: '0', icon: AlertCircle, color: 'text-orange-600' },
      { label: 'Network SLA', value: '98%', icon: TrendingUp, color: 'text-purple-600' },
    ];

    const approvedCount = recentSubmissions.filter(s => s.status === 'Approved').length;
    const amendedCount = recentSubmissions.filter(s => s.status === 'Amended').length;

    return [
      { label: isManagement ? 'Global Active' : 'Branch Active', value: recentSubmissions.length.toString(), icon: History, color: 'text-blue-600' },
      { label: 'Approved Today', value: approvedCount.toString(), icon: FileCheck, color: 'text-green-600' },
      { label: 'Action Required', value: amendedCount.toString(), icon: AlertCircle, color: 'text-orange-600' },
      { label: 'Network SLA', value: '98.4%', icon: TrendingUp, color: 'text-purple-600' },
    ];
  }, [recentSubmissions, isManagement]);

  const handleSeedData = async () => {
    if (!db || isSeeding) return;
    setIsSeeding(true);

    try {
      // 1. Seed Submissions
      for (const sub of MOCK_SUBMISSIONS) {
        const subRef = doc(db, "submissions", sub.id!);
        await setDoc(subRef, {
          ...sub,
          isResubmitted: false,
          amendmentCycles: sub.amendmentCycles || 0,
          isExceptional: sub.isExceptional || false,
          exceptionalStatus: sub.exceptionalStatus || "None",
          checklistState: {}
        });

        // Seed some documents for each
        const docRef = doc(collection(subRef, "documents"));
        await setDoc(docRef, {
          id: docRef.id,
          name: "National_ID_Scan.pdf",
          type: "id_card",
          uploadedAt: sub.submittedAt,
          status: 'Current',
          url: "#"
        });
      }

      // 2. Seed Districts
      const districts = ["Central", "Northern", "Southern", "Eastern", "Western"];
      for (const d of districts) {
        await setDoc(doc(db, "districts", d.toLowerCase()), { id: d.toLowerCase(), name: d });
      }

      // 3. Seed Branches
      const branches = [
        { id: "dt-1", name: "Downtown", district: "Central", code: "DTN" },
        { id: "ut-1", name: "Uptown", district: "Central", code: "UPT" },
        { id: "es-1", name: "East Side", district: "Central", code: "EST" },
        { id: "nb-1", name: "Northern Branch", district: "Northern", code: "NRB" },
        { id: "sh-1", name: "Southern Hub", district: "Southern", code: "STH" }
      ];
      for (const b of branches) {
        await setDoc(doc(db, "branches", b.id), b);
      }

      toast({
        title: "Operational Data Hydrated",
        description: "Firestore has been seeded with 20+ submissions, regional branches, and districts.",
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Seeding Failure", description: "Internal error during prototype hydration." });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
            {isManagement ? 'Institutional Command' : `${user.branch} Branch Portal`}
          </h1>
          <p className="text-muted-foreground text-lg">Welcome back, {user.name}. {isManagement ? 'Overseeing network-wide KYC compliance.' : 'Managing your branch\'s local submissions.'}</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button 
              variant="outline" 
              onClick={handleSeedData} 
              disabled={isSeeding}
              className="border-dashed border-primary/50 text-primary hover:bg-primary/5 h-12 px-6 font-bold"
            >
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Beaker className="w-4 h-4 mr-2" />}
              Seed Prototype Data
            </Button>
          )}
          {user.role === 'Branch Officer' && (
            <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl h-12 px-8 font-bold text-lg">
              <Link href="/submissions/new">
                Create New Submission
              </Link>
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
              <CardDescription>Live tracking for {isManagement ? 'jurisdictional' : 'branch'} submissions.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary font-bold">
              <Link href="/submissions" className="flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {submissionsLoading ? (
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
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{sub.id} • {sub.branch} Branch</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={
                        sub.status === 'Approved' ? 'default' : 
                        sub.status === 'Amended' ? 'secondary' : 
                        sub.status === 'Pending' ? 'outline' : 'destructive'
                      } className={cn(
                        "font-bold",
                        sub.status === 'Approved' && 'bg-emerald-50 text-emerald-700 border-emerald-100',
                        sub.status === 'Amended' && 'bg-orange-50 text-orange-700 border-orange-100'
                      )}>
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
                  <p className="text-sm text-muted-foreground font-bold">No Operational Data Found</p>
                  {isAdmin && <p className="text-xs text-muted-foreground mt-1">Click "Seed Prototype Data" to initialize the dashboard.</p>}
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
                {settings?.guidelines && settings.guidelines.length > 0 ? (
                  settings.guidelines.map((guide) => (
                    <div 
                      key={guide.id} 
                      className={`flex gap-4 p-5 rounded-2xl border ${
                        guide.type === 'alert' 
                          ? 'bg-accent/5 border-accent/20' 
                          : 'bg-blue-50 border-blue-100'
                      }`}
                    >
                      {guide.type === 'alert' ? (
                        <ShieldCheck className="w-6 h-6 text-accent shrink-0" />
                      ) : (
                        <Info className="w-6 h-6 text-blue-600 shrink-0" />
                      )}
                      <div className="text-sm">
                        <p className="font-bold text-slate-900">{guide.title}</p>
                        <p className="text-slate-600 leading-relaxed mt-1 font-medium">{guide.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground italic">
                    <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No guidelines published.</p>
                  </div>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
