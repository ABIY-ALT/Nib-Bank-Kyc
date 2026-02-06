
"use client"

import { useState, useMemo } from "react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Download, 
  Filter, 
  Calendar as CalendarIcon,
  Search,
  Loader2,
  Building2,
  Map
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BranchReportsPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [selectedDistrict, setSelectedDistrict] = useState("All Districts");
  const [selectedBranch, setSelectedBranch] = useState("All Branches");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<KYCSubmission[] | null>(null);

  const { data: districts } = useCollection<{id: string, name: string}>(
    db ? query(collection(db, "districts"), orderBy("name")) : null
  );

  const { data: branches } = useCollection<{id: string, name: string, district: string}>(
    db ? query(collection(db, "branches"), orderBy("name")) : null
  );

  const filteredBranches = useMemo(() => {
    if (!branches) return [];
    if (selectedDistrict === "All Districts") return branches;
    return branches.filter(b => b.district === selectedDistrict);
  }, [branches, selectedDistrict]);

  const submissionsQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(submissionsQuery);

  const handleGenerateReport = () => {
    if (!submissions) {
      setReportData([]);
      return;
    }

    let filtered = [...submissions];

    if (selectedDistrict !== "All Districts") {
      filtered = filtered.filter(sub => (sub as any).district === selectedDistrict);
    }

    if (selectedBranch !== "All Branches") {
      filtered = filtered.filter(sub => sub.branch === selectedBranch);
    }

    setReportData(filtered);
    toast({
      title: "Report Generated",
      description: `Found ${filtered.length} matching records.`,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Compliance Reporting</h1>
          <p className="text-muted-foreground text-lg">Generate audit-ready analytical reports for branches and districts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => { setReportData(null); setSelectedDistrict("All Districts"); setSelectedBranch("All Branches"); }}>
            <Filter className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90" disabled={!reportData || reportData.length === 0}>
            <Download className="w-4 h-4" /> Export Report
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" /> Report Parameters
          </CardTitle>
          <CardDescription>Configure the scope and filters for the data aggregation.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Map className="w-3 h-3" /> Regional District
              </label>
              <Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("All Branches"); }}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Districts">All Districts</SelectItem>
                  {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="w-3 h-3" /> Specific Branch
              </label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Branches">All Branches</SelectItem>
                  {filteredBranches.map(b => (
                    <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon className="w-3 h-3" /> Time Horizon
              </label>
              <Button variant="outline" className="w-full h-11 justify-start text-left font-normal" disabled>
                Last 30 Days (Standard Audit)
              </Button>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button size="lg" className="px-12 font-bold gap-2 shadow-lg" onClick={handleGenerateReport} disabled={loading}>
              <FileText className="w-4 h-4" />
              Generate Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {reportData && (
        <Card className="border-slate-200 shadow-xl animate-in slide-in-from-top-4 duration-300">
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-bold">Report: {selectedDistrict} / {selectedBranch}</CardTitle>
                <p className="text-slate-400 text-sm mt-1">Generated for audit on {new Date().toLocaleDateString()}</p>
              </div>
              <Badge variant="outline" className="bg-primary/20 text-white border-primary/40 font-bold px-4">
                {reportData.length} Records Found
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-8">
            <div className="border rounded-xl overflow-hidden shadow-inner">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold">Case ID</TableHead>
                    <TableHead className="font-bold">Customer</TableHead>
                    <TableHead className="font-bold">Branch</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="font-bold">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 italic">No records found matching filters.</TableCell>
                    </TableRow>
                  ) : reportData.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-bold text-primary">{sub.id}</TableCell>
                      <TableCell className="font-medium">{sub.customerName}</TableCell>
                      <TableCell>{sub.branch}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-bold text-[10px] uppercase">
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(sub.submittedAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
