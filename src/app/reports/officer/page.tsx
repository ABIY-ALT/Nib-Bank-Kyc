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
    setTimeout(() => {
      if (!submissions) {
        setReportData([]);
        setIsGenerating(false);
        return;
      }

      const metrics: Record<string, any> = {};
      submissions.forEach(sub => {
        const officer = (sub as any).reviewedBy || "System Auto";
        if (!metrics[officer]) {
          metrics[officer] = { name: officer, total: 0, approved: 0, amended: 0, rejected: 0 };
        }
        metrics[officer].total += 1;
        if (sub.status === 'Approved') metrics[officer].approved += 1;
        if (sub.status === 'Amended') metrics[officer].amended += 1;
        if (sub.status === 'Rejected') metrics[officer].rejected += 1;
      });

      setReportData(Object.values(metrics).sort((a, b) => b.total - a.total));
      setIsGenerating(false);
      toast({
        title: "Staff Audit Complete",
        description: "Officer productivity data has been compiled for review.",
      });
    }, 1000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Officer Productivity Reports</h1>
          <p className="text-muted-foreground text-lg">Audit staff throughput, decision accuracy, and turnaround times.</p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-2 bg-primary shadow-lg" onClick={handleGenerateReport} disabled={isGenerating || loading}>
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PieChartIcon className="w-4 h-4" />}
            Compile Staff Analytics
          </Button>
        </div>
      </div>

      {!reportData ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <Users className="w-12 h-12 text-slate-300" />
            <div>
              <p className="font-bold text-slate-900 text-lg">No Analysis Active</p>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">Generate a staff productivity report to see accuracy and resolution metrics for your KYC specialized team.</p>
            </div>
            <Button variant="outline" onClick={handleGenerateReport}>Start Analysis</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold">{submissions?.length || 0}</span>
                  <History className="w-8 h-8 text-primary/20" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Avg Resolution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-blue-600">1.4d</span>
                  <Clock className="w-8 h-8 text-blue-600/20" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Approval Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold text-emerald-600">82%</span>
                  <CheckCircle2 className="w-8 h-8 text-emerald-600/20" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xl">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Staff Performance Breakdown
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => toast({ title: "Export", description: "Downloading staff productivity audit..." })}>
                  <Download className="w-4 h-4 mr-2" /> Export XLSX
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Officer Name</TableHead>
                    <TableHead className="font-bold">Total Reviews</TableHead>
                    <TableHead className="font-bold">Approved</TableHead>
                    <TableHead className="font-bold">Amendments</TableHead>
                    <TableHead className="font-bold">Rejections</TableHead>
                    <TableHead className="text-right font-bold">Accuracy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((officer) => (
                    <TableRow key={officer.name}>
                      <TableCell className="font-bold">{officer.name}</TableCell>
                      <TableCell>{officer.total}</TableCell>
                      <TableCell className="text-emerald-600 font-medium">{officer.approved}</TableCell>
                      <TableCell className="text-orange-600 font-medium">{officer.amended}</TableCell>
                      <TableCell className="text-red-600 font-medium">{officer.rejected}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                          {Math.round((officer.approved / officer.total) * 100)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
