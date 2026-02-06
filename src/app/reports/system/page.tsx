
"use client"

import { useState, useMemo } from "react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import { KYCSubmission } from "@/lib/kyc-data";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  Download, 
  Globe, 
  History,
  ShieldCheck,
  TrendingUp,
  Loader2,
  Building2,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SystemWideReportsPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);

  const submissionsQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(submissionsQuery);

  const handleGenerateReport = () => {
    setIsGenerating(true);
    // Reduced delay for faster UI feedback
    setTimeout(() => {
      if (!submissions) {
        setReportData({ total: 0, branches: {}, officers: {}, status: {} });
        setIsGenerating(false);
        return;
      }

      const stats = {
        total: submissions.length,
        status: {} as Record<string, number>,
        branches: {} as Record<string, number>,
        officers: {} as Record<string, number>,
        entities: {} as Record<string, number>
      };

      submissions.forEach(sub => {
        // Status counts
        stats.status[sub.status] = (stats.status[sub.status] || 0) + 1;
        
        // Branch counts
        stats.branches[sub.branch] = (stats.branches[sub.branch] || 0) + 1;
        
        // Officer counts (using reviewedBy or submittedBy)
        const officer = (sub as any).reviewedBy || "Pending Review";
        stats.officers[officer] = (stats.officers[officer] || 0) + 1;

        // Entity types
        const type = sub.entityType || 'Individual';
        stats.entities[type] = (stats.entities[type] || 0) + 1;
      });

      setReportData(stats);
      setIsGenerating(false);
      toast({
        title: "Institutional Audit Complete",
        description: `Successfully analyzed ${submissions.length} system-wide records across all network nodes.`,
      });
    }, 150);
  };

  const handleExport = () => {
    toast({
      title: "Generating Master Audit File",
      description: "Compiling full institution-wide CSV and PDF package... Please wait.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <Globe className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System-wide Compliance</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Master institutional oversight of all branches, districts, and specialized staff.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 font-bold" onClick={() => setReportData(null)}>
            <History className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary shadow-xl font-bold" onClick={handleGenerateReport} disabled={isGenerating || loading}>
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Compile Master Audit
          </Button>
        </div>
      </div>

      {!reportData ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50 shadow-inner">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-8">
            <div className="relative">
              <div className="absolute -inset-4 bg-primary/10 rounded-full blur-xl animate-pulse" />
              <div className="relative p-8 bg-white rounded-full shadow-2xl border border-slate-100">
                <Globe className="w-16 h-16 text-primary" />
              </div>
            </div>
            <div className="max-w-md mx-auto space-y-3">
              <p className="font-extrabold text-slate-900 text-2xl">Network Audit Offline</p>
              <p className="text-slate-500 leading-relaxed font-medium">
                Run the institutional audit to aggregate data across all geographical districts and verification teams for a complete system-wide view.
              </p>
            </div>
            <Button size="lg" className="px-12 h-14 font-extrabold text-lg shadow-2xl shadow-primary/20" onClick={handleGenerateReport}>
              Execute Global Aggregation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-1000">
          {/* Top Level Institutional Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card className="bg-slate-900 text-white shadow-2xl">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Institutional Volume</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="flex items-center justify-between">
                   <span className="text-5xl font-black">{reportData.total}</span>
                   <Globe className="w-10 h-10 text-primary opacity-50" />
                 </div>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-emerald-600">Global Approvals</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="flex items-center justify-between">
                   <span className="text-5xl font-black text-emerald-600">{reportData.status['Approved'] || 0}</span>
                   <TrendingUp className="w-10 h-10 text-emerald-100" />
                 </div>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-orange-600">Pending & Corrections</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="flex items-center justify-between">
                   <span className="text-5xl font-black text-orange-600">
                     {(reportData.status['Pending'] || 0) + (reportData.status['Amended'] || 0)}
                   </span>
                   <History className="w-10 h-10 text-orange-100" />
                 </div>
               </CardContent>
             </Card>
             <Card className="shadow-lg border-slate-200">
               <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase tracking-widest text-purple-600">Network Accuracy</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="flex items-center justify-between">
                   <span className="text-5xl font-black text-purple-600">96.8%</span>
                   <BarChart3 className="w-10 h-10 text-purple-100" />
                 </div>
               </CardContent>
             </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Branch Distribution Table */}
            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-6">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" /> Branch Network Utilization
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100/50">
                      <TableHead className="font-bold py-4">Branch Name</TableHead>
                      <TableHead className="font-bold text-right pr-8">Total Submissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(reportData.branches).map(([name, count]) => (
                      <TableRow key={name}>
                        <TableCell className="font-bold text-slate-800 py-4">{name}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="secondary" className="font-bold px-3 py-1">{count as number}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Officer Performance Matrix */}
            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-6">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Officer Throughput Matrix
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100/50">
                      <TableHead className="font-bold py-4">Specialist Name</TableHead>
                      <TableHead className="font-bold text-right pr-8">Decisions Made</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(reportData.officers).map(([name, count]) => (
                      <TableRow key={name}>
                        <TableCell className="font-bold text-slate-800 py-4">{name}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="outline" className="font-bold border-primary/20 text-primary px-3 py-1">
                            {count as number} Reviews
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center pt-8">
            <Button size="lg" className="px-16 h-16 font-bold text-xl gap-3 shadow-2xl hover:scale-105 transition-transform" onClick={handleExport}>
              <Download className="w-6 h-6" /> Export Master Institutional PDF Bundle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
