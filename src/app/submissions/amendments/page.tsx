
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { History, Loader2, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";

export default function AmendmentReviewPage() {
  const db = useFirestore();
  const { user } = useAuth();

  // "Amendment Review" shows cases that were previously 'Amended' but have since been resubmitted
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
    
    // Filter by status and localized branch assignment
    return submissions.filter(sub => {
      const matchesStatus = ["Pending", "In Review"].includes(sub.status);
      const matchesBranch = !user.branch || user.branch === 'Central HQ' || sub.branch === user.branch;
      return matchesStatus && matchesBranch;
    });
  }, [submissions, user.branch]);

  const isLocalized = user.role === 'KYC Officer' && user.branch && user.branch !== 'Central HQ';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
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
