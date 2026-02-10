
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy, doc, setDoc } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission, ExceptionalStatus } from "@/lib/kyc-data";
import { Zap, Loader2, Search, Info } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ExceptionalCasesPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const exceptionalQuery = useMemo(() => {
    if (!db) return null;
    
    // 1. Admins see all exceptional cases globally
    if (user.role === 'Admin' || user.role === 'Director' || user.role === 'Supervisor') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        orderBy("submittedAt", "desc")
      );
    }

    // 2. District Director: Sees cases within their regional district
    if (user.role === 'District Director') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("district", "==", user.district || ""),
        orderBy("submittedAt", "desc")
      );
    }

    // 3. Branch Manager: Sees cases originating from their specific node
    if (user.role === 'Branch Manager' && user.branch) {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("branch", "==", user.branch),
        orderBy("submittedAt", "desc")
      );
    }

    // 4. KYC Officer: Sees cases within their assigned portfolio of branches
    const assigned = user.assignedBranches || [];
    if (user.role === 'KYC Officer' && assigned.length > 0) {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("branch", "in", assigned),
        orderBy("submittedAt", "desc")
      );
    }

    return null;
  }, [db, user.role, user.branch, user.district, user.assignedBranches]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(exceptionalQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  const handleSeedException = async () => {
    if (!db) return;
    
    const id = `SEED-KYC-${Math.floor(1000 + Math.random() * 9000)}`;
    const subRef = doc(db, "submissions", id);
    
    const sampleData: any = {
      id,
      customerName: "Sample High-Value Corp",
      entityType: "corporate",
      branch: "Downtown",
      district: "Central",
      submittedBy: "System Admin",
      submittedAt: new Date().toISOString(),
      status: "In Review",
      isExceptional: true,
      exceptionalStatus: "Awaiting District",
      exceptionalData: {
        reason: "High deposit amount",
        justification: "Strategic corporate partner requiring immediate account activation despite missing secondary utility bill.",
        initiatedBy: "Mike Manager",
        initiatedAt: new Date().toISOString(),
        memoUrl: "#",
        approvalHistory: []
      },
      isResubmitted: false,
      amendmentCycles: 0,
      documents: []
    };

    await setDoc(subRef, sampleData);
    toast({ title: "Sample Seeded", description: "A test exceptional case has been added to the database." });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Zap className="w-8 h-8 text-yellow-600" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Exceptional Approvals</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Monitoring high-risk and non-standard KYC requests across the hierarchy.</p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search exceptions..." 
            className="pl-11 h-12 rounded-full border-2 border-yellow-600 focus-visible:ring-yellow-600/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Alert className="bg-primary/5 border-primary/10 text-primary-foreground/80 shadow-sm">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs font-medium text-slate-600">
          This workspace provides shared visibility for Branch Managers, KYC Specialists, and the regional approval hierarchy to track high-priority exceptions.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing institutional exceptions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6">
          <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
            <Zap className="w-12 h-12 text-slate-200" />
          </div>
          <div className="text-center space-y-2">
            <p className="font-bold text-slate-900 text-xl">No exceptions found</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">There are currently no active high-risk cases in your jurisdictional view.</p>
          </div>
          {user.role === 'Admin' && (
            <Button onClick={handleSeedException} className="bg-yellow-600 hover:bg-yellow-700 font-bold px-8 shadow-lg">
              Seed Sample Exception
            </Button>
          )}
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
