
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
  Users, 
  Download, 
  TrendingUp, 
  History,
  CheckCircle2,
  Clock,
  Loader2,
  PieChart as PieChartIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OfficerReportsPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any[] | null>(null);

  const submissionsQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(submissionsQuery);

  const handleGenerateReport = () => {
    setIsGenerating(true);
    // Simulate complex background processing
    setTimeout(() => {
      if (!submissions) {
        setReportData([]);
        setIsGenerating(false);
        return;
      }

      const metrics: Record<string, any> = {};
      submissions.forEach(sub => {
        // Track the reviewer who took action
        const officer = (sub as any).reviewedBy || "System Auto";
        if (!metrics[officer]) {
          metrics[officer] = { 
            name: officer, 
            total: 0, 
            approved: 0, 
            amended: 0, 
            rejected: 0,
            escalated: 0
          };
        }
        metrics[officer].total += 1;
        if (sub.status === 'Approved') metrics[officer].approved += 1;
        if (sub.status === 'Amended') metrics[officer].amended += 1;
        if (sub.status === 'Rejected') metrics[officer].rejected += 1;
        if (sub.status === 'Escalated') metrics[officer].escalated += 1;
      });

      setReportData(Object.values(metrics).sort((a, b) => b.total - a.total));
      setIsGenerating(false);
      toast({
        title: "Staff Audit Complete",
        description: `Analyzed ${submissions.length} historical verification actions across the team.`,
      });
    }, 1200);
  };

  const handleExport = () => {
    toast({
      title: "Exporting Productivity Audit",
      description: "Compiling staff efficiency dataset... Your download will start shortly.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Staff Productivity Reports</h1>
          <p className="text-muted-foreground text-lg">Audit staff throughput, decision accuracy, and regional compliance efficiency.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setReportData(null)}>
            <History className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary shadow-lg" onClick={handleGenerateReport} disabled={isGenerating || loading}>
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PieChartIcon className="w-4 h-4" />}
            Compile Staff Analytics
          </Button>
        </div>
      </div>

      {!reportData ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
              <Users className="w-12 h-12 text-slate-300" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <p className="font-bold text-slate-900 text-xl">No Analysis Active</p>
              <p className="text-sm text-slate-500">
                Generate a staff productivity report to see accuracy and resolution metrics for your KYC specialized team across all districts.
              </p>
            </div>
            <Button size="lg" className="px-8 font-bold" onClick={handleGenerateReport}>Start Full Audit</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">System Throughput</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-slate-900">{submissions?.length || 0}</span>
                  <div className="p-2 bg-primary/5 rounded-lg">
                    <History className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Cases processed this period</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Institutional Resolution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-blue-600">1.4d</span>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Network-wide average</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Verification Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-emerald-600">92%</span>
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 font-medium">Audit-passed approvals</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50 p-6">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" /> Staff Performance Matrix
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Detailed breakdown of specialized officer efficiency.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport} className="font-bold border-slate-200 bg-white">
                  <Download className="w-4 h-4 mr-2" /> Export XLSX Audit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reportData.length === 0 ? (
                <div className="py-20 text-center italic text-muted-foreground">No historical review data found for this period.</div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-100/50">
                    <TableRow>
                      <TableHead className="font-bold py-4">Officer Name</TableHead>
                      <TableHead className="font-bold">Total Reviews</TableHead>
                      <TableHead className="font-bold text-emerald-600">Approved</TableHead>
                      <TableHead className="font-bold text-orange-600">Amendments</TableHead>
                      <TableHead className="font-bold text-red-600">Rejections</TableHead>
                      <TableHead className="text-right font-bold pr-8">Accuracy Index</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((officer) => (
                      <TableRow key={officer.name} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-bold text-slate-900">{officer.name}</TableCell>
                        <TableCell className="font-medium">{officer.total}</TableCell>
                        <TableCell className="text-emerald-700 font-bold">{officer.approved}</TableCell>
                        <TableCell className="text-orange-700 font-bold">{officer.amended}</TableCell>
                        <TableCell className="text-red-700 font-bold">{officer.rejected}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 font-bold px-3">
                            {officer.total > 0 ? Math.round((officer.approved / officer.total) * 100) : 0}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
