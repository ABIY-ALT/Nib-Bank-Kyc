
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { LayoutList, Loader2, MapPin, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function BranchNodeOversightPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const branchQuery = useMemo(() => {
    if (!db || !user.branch) return null;
    return query(
      collection(db, "submissions"),
      where("branch", "==", user.branch),
      orderBy("submittedAt", "desc")
    );
  }, [db, user.branch]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(branchQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => {
      const matchesSearch = sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term);
      return matchesSearch;
    });
  }, [submissions, searchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <LayoutList className="w-8 h-8 text-[#B89334]" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Local Node Oversight</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">Central hub for monitoring all cases at the <strong>{user.branch}</strong> node.</p>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
              <ShieldCheck className="w-3 h-3" />
              Branch Manager Control
            </Badge>
          </div>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search branch cases..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing branch records...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
