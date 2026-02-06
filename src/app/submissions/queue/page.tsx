
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function ReviewQueuePage() {
  const db = useFirestore();

  const reviewQueueQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("status", "in", ["Pending", "In Review"]),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(reviewQueueQuery);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-muted-foreground">Manage and process pending KYC verification requests.</p>
      </div>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading queue...</div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
