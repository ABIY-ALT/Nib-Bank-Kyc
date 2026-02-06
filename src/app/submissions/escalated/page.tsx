
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function EscalatedCasesPage() {
  const db = useFirestore();

  const escalatedQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("status", "==", "Escalated"),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(escalatedQuery);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Escalated Cases</h1>
        <p className="text-muted-foreground">High-priority cases requiring supervisor or director oversight.</p>
      </div>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading escalated cases...</div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
