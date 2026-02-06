
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function AmendmentReviewPage() {
  const db = useFirestore();

  // "Amendment Review" shows cases that were previously 'Amended' but have since been resubmitted
  const amendmentReviewQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("isResubmitted", "==", true),
      where("status", "in", ["Pending", "In Review"]),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(amendmentReviewQuery);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Amendment Review</h1>
        <p className="text-muted-foreground">Review submissions that have been corrected following amendment requests.</p>
      </div>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading review cases...</div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
