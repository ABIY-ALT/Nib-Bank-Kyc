
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function AmendmentRequestsPage() {
  const db = useFirestore();

  const amendmentRequestQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("status", "==", "Amended"),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(amendmentRequestQuery);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Amendment Requests</h1>
        <p className="text-muted-foreground">Active requests for additional documentation or information.</p>
      </div>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading requests...</div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
