
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { 
  LayoutList, 
  Loader2, 
  MapPin, 
  Search, 
  ShieldCheck, 
  Users, 
  BarChart3, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Inbox,
  User,
  ShieldAlert,
  Globe
} from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export default function BranchNodeOversightPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const isAdmin = user.role === 'Admin';

  const branchQuery = useMemo(() => {
    if (!db) return null;
    if (isAdmin) {
      // Admins see all cases globally in this management view
      return query(
        collection(db, "submissions"),
        orderBy("submittedAt", "desc")
      );
    }
    if (!user.branch) return null;
    return query(
      collection(db, "submissions"),
      where("branch", "==", user.branch),
      orderBy("submittedAt", "desc")
    );
  }, [db, user.branch, isAdmin]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(branchQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => {
      const matchesSearch = sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term);
      return matchesSearch;
    });
  }, [submissions, searchTerm]);

  const officerMetrics = useMemo(() => {
    if (!submissions) return [];
    
    const stats: Record<string, { 
      name: string, 
      total: number, 
      approved: number, 
      amended: number, 
      pending: number 
    }> = {};

    submissions.forEach(sub => {
      const officer = sub.submittedBy;
      if (!stats[officer]) {
        stats[officer] = { name: officer, total: 0, approved: 0, amended: 0, pending: 0 };
      }
      
      stats[officer].total += 1;
      if (sub.status === 'Approved') stats[officer].approved += 1;
      else if (sub.status === 'Amended') stats[officer].amended += 1;
      else if (['Pending', 'In Review'].includes(sub.status)) stats[officer].pending += 1;
    });

    return Object.values(stats).sort((a, b) => b.total - a.total);
  }, [submissions]);

  const totalBranchStats = useMemo(() => {
    if (!submissions) return { total: 0, pending: 0, amended: 0, approved: 0 };
    return {
      total: submissions.length,
      pending: submissions.filter(s => ['Pending', 'In Review'].includes(s.status)).length,
      amended: submissions.filter(s => s.status === 'Amended').length,
      approved: submissions.filter(s => s.status === 'Approved').length
    };
  }, [submissions]);

  if (!user.branch && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 animate-in fade-in duration-500">
        <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
          <ShieldAlert className="w-16 h-16 text-slate-200" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <p className="font-bold text-slate-900 text-2xl tracking-tight">No Branch Assigned</p>
          <p className="text-sm text-slate-500 font-medium">
            This workspace provides oversight for a specific institutional node. Please assign a branch to your profile in the **Personnel Directory** to monitor local operations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <LayoutList className="w-8 h-8 text-[#B89334]" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {isAdmin ? 'Global Command Oversight' : 'Local Node Oversight'}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">
              {isAdmin 
                ? 'Master institutional monitoring of all branches and specialized staff.' 
                : `Managing operational verifications at the ${user.branch} node.`}
            </p>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
              {isAdmin ? <Globe className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              {user.role} Control
            </Badge>
          </div>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search cases..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total volume</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-black text-slate-900">{totalBranchStats.total}</span>
            <div className="p-2 bg-slate-100 rounded-lg"><Inbox className="w-5 h-5 text-slate-500" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Successfully Approved</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-black text-emerald-600">{totalBranchStats.approved}</span>
            <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200 border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Corrections Required</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-black text-orange-600">{totalBranchStats.amended}</span>
            <div className="p-2 bg-orange-50 rounded-lg"><AlertCircle className="w-5 h-5 text-orange-600" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Awaiting Review</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-black text-primary">{totalBranchStats.pending}</span>
            <div className="p-2 bg-primary/5 rounded-lg"><TrendingUp className="w-5 h-5 text-primary" /></div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all-cases" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 border h-12">
          <TabsTrigger value="all-cases" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            <LayoutList className="w-4 h-4 mr-2" />
            Case Archive
          </TabsTrigger>
          <TabsTrigger value="officer-performance" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            <Users className="w-4 h-4 mr-2" />
            Personnel Productivity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all-cases">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">Synchronizing records...</p>
            </div>
          ) : (
            <SubmissionsPageContent submissions={filteredSubmissions || []} />
          )}
        </TabsContent>

        <TabsContent value="officer-performance">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl">Staff Throughput Matrix</CardTitle>
                  <CardDescription>Individual productivity and accuracy tracking for institutional personnel.</CardDescription>
                </div>
                <Badge variant="outline" className="font-bold border-primary/20 text-primary bg-white px-4 py-1">
                  {officerMetrics.length} Active Officers
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-bold py-4 pl-8">Staff Member</TableHead>
                    <TableHead className="font-bold text-center">Total Submitted</TableHead>
                    <TableHead className="font-bold text-center text-emerald-600">Approved</TableHead>
                    <TableHead className="font-bold text-center text-orange-600">Needs Fix (Errors)</TableHead>
                    <TableHead className="font-bold text-center">In Review</TableHead>
                    <TableHead className="font-bold text-right pr-8">Efficiency Index</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {officerMetrics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                        No personnel data detected for this period.
                      </TableCell>
                    </TableRow>
                  ) : officerMetrics.map((officer) => {
                    const efficiency = Math.round((officer.approved / (officer.total - officer.pending || 1)) * 100);
                    return (
                      <TableRow key={officer.name} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="py-4 pl-8">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                              {officer.name.charAt(0)}
                            </div>
                            <span className="font-bold text-slate-900">{officer.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{officer.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">
                            {officer.approved}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={`font-bold ${officer.amended > 5 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                            {officer.amended}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-slate-500 font-medium tabular-nums">{officer.pending}</TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-black ${efficiency > 80 ? 'text-emerald-600' : efficiency > 50 ? 'text-orange-600' : 'text-red-600'}`}>
                                {efficiency}%
                              </span>
                              <Progress value={efficiency} className="w-24 h-1.5 bg-slate-100" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Initial Accuracy Score</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
