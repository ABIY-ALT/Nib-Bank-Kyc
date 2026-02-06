"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { ShieldAlert, Loader2 } from "lucide-react";

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-8 h-8 text-destructive" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Escalated Cases</h1>
        </div>
        <p className="text-muted-foreground text-lg">High-priority cases requiring supervisor or director-level risk assessment and final resolution.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Retrieving escalation queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
