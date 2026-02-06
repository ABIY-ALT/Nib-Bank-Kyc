"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function AmendmentRequestsPage() {
  const db = useFirestore();

  // "Action Required" cases for Branch Officers
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
        <h1 className="text-3xl font-bold">Action Required</h1>
        <p className="text-muted-foreground">Cases returned by KYC Officers for additional documentation or clarification.</p>
      </div>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading actions...</div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
