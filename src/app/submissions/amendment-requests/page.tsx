
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Input } from "@/components/ui/input";

export default function AmendmentRequestsPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const amendmentRequestQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("submittedBy", "==", user.name),
      where("status", "==", "Amended"),
      orderBy("submittedAt", "desc")
    );
  }, [db, user.name]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(amendmentRequestQuery);

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
            <AlertCircle className="w-8 h-8 text-orange-600" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Action Required</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Submissions requiring your attention and requested corrections.
          </p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search action items by name or ID..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing correction queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
