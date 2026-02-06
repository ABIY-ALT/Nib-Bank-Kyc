
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { ShieldAlert, Loader2, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";

export default function EscalatedCasesPage() {
  const db = useFirestore();
  const { user } = useAuth();

  const escalatedQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("status", "in", ["Escalated"]),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(escalatedQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    
    // Apply branch level oversight if the supervisor is assigned to a specific branch
    if (user.branch && user.branch !== 'Central HQ') {
      return submissions.filter(sub => sub.branch === user.branch);
    }
    
    return submissions;
  }, [submissions, user.branch]);

  const isLocalized = user.branch && user.branch !== 'Central HQ';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-8 h-8 text-destructive" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Escalated Cases</h1>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-lg">High-priority cases requiring senior risk assessment.</p>
          {isLocalized && (
            <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-100 flex items-center gap-1 px-3 font-bold">
              <MapPin className="w-3 h-3" />
              {user.branch} Oversight
            </Badge>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Retrieving escalation queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
