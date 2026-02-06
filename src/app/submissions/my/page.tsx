
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { currentUser } from "@/lib/auth-mock";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";

export default function MySubmissionsPage() {
  const db = useFirestore();
  const user = currentUser;

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Submissions</h1>
        <p className="text-muted-foreground">Track identity verification requests you initiated.</p>
      </div>
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading submissions...</div>
      ) : (
        <SubmissionsPageContent submissions={submissions || []} />
      )}
    </div>
  );
}
