"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { History, Loader2 } from "lucide-react";

export default function AmendmentReviewPage() {
  const db = useFirestore();

  // "Amendment Review" shows cases that were previously 'Amended' but have since been resubmitted
  const amendmentReviewQuery = useMemo(() => {
    if (!db) return null;
    // Specifically looking for corrections that have returned to Pending or In Review status
    return query(
      collection(db, "submissions"),
      where("isResubmitted", "==", true),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(amendmentReviewQuery);

  // Filter in memory to handle status check without needing complex composite indexes for prototype
  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    return submissions.filter(sub => ["Pending", "In Review"].includes(sub.status));
  }, [submissions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <History className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Amendment Review</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Prioritized queue for submissions that have been corrected and resubmitted by Branch Officers.
        </p>
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
