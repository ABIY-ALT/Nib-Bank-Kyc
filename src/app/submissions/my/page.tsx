"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { currentUser } from "@/lib/auth-mock";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Skeleton } from "@/components/ui/skeleton";

export default function MySubmissionsPage() {
  const db = useFirestore();
  const user = currentUser;

  // Stable query for current user's submissions
  const mySubmissionsQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("submittedBy", "==", user.name),
      orderBy("submittedAt", "desc")
    );
  }, [db, user.name]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(mySubmissionsQuery);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
          My Submissions
        </h1>
        <p className="text-muted-foreground text-lg">
          Detailed history of KYC verification requests initiated by you.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
