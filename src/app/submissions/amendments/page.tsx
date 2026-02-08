
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { History, Loader2, MapPin, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function AmendmentReviewPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const amendmentReviewQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("isResubmitted", "==", true),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(amendmentReviewQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => {
      const matchesStatus = ["Pending", "In Review"].includes(sub.status);
      const matchesBranch = !user.branch || user.branch === 'Central HQ' || sub.branch === user.branch;
      const matchesSearch = sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term);
      return matchesStatus && matchesBranch && matchesSearch;
    });
  }, [submissions, user.branch, searchTerm]);

  const isLocalized = user.role === 'KYC Officer' && user.branch && user.branch !== 'Central HQ';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <History className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Amendment Review</h1>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-lg">
              Prioritized queue for resubmitted cases.
            </p>
            {isLocalized && (
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
                <MapPin className="w-3 h-3" />
                {user.branch} Office
              </Badge>
            )}
          </div>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search resubmissions by name or ID..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing amendment queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
