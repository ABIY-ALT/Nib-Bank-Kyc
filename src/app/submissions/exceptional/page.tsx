
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Zap, Loader2, MapPin, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function ExceptionalCasesPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const exceptionalQuery = useMemo(() => {
    if (!db) return null;
    
    // Logic for approvers
    if (user.role === 'District Director') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "==", "Awaiting District"),
        where("district", "==", user.district || ""),
        orderBy("submittedAt", "desc")
      );
    }

    if (user.role === 'Director') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "==", "Awaiting Director"),
        orderBy("submittedAt", "desc")
      );
    }

    if (user.role === 'Supervisor') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "==", "Awaiting Supervisor"),
        orderBy("submittedAt", "desc")
      );
    }

    // Admins and Branch Managers see their relevant active exceptions
    if (user.role === 'Admin') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        orderBy("submittedAt", "desc")
      );
    }

    if (user.role === 'Branch Manager') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("branch", "==", user.branch || ""),
        orderBy("submittedAt", "desc")
      );
    }

    return null;
  }, [db, user.role, user.branch, user.district]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(exceptionalQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Zap className="w-8 h-8 text-yellow-600" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Exceptional Approvals</h1>
          </div>
          <p className="text-muted-foreground text-lg">High-risk and non-standard KYC requests requiring specialized oversight.</p>
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

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Retrieving exceptional queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
