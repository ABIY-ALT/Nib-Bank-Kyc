
'use client';

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Inbox, MapPin, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";

export default function ReviewQueuePage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const reviewQueueQuery = useMemo(() => {
    if (!db) return null;
    
    // Admins and Global Supervisors can see everything
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    
    if (isGlobalReviewer) {
      return query(
        collection(db, "submissions"),
        where("status", "in", ["Pending", "In Review"]),
        orderBy("submittedAt", "desc")
      );
    }

    // Local KYC Officers are restricted to their assigned portfolio of branches
    // Note: Firestore 'in' queries support up to 30 values.
    const assigned = user.assignedBranches || [];
    
    if (assigned.length > 0) {
      return query(
        collection(db, "submissions"),
        where("status", "in", ["Pending", "In Review"]),
        where("branch", "in", assigned),
        orderBy("submittedAt", "desc")
      );
    }

    // Fallback: If no branches assigned, return nothing
    return null;
  }, [db, user.role, user.assignedBranches]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(reviewQueueQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  const isLocalized = !['Admin', 'Director', 'Supervisor'].includes(user.role || '') && (user.assignedBranches?.length || 0) > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Review Queue</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">Central hub for processing new applications.</p>
            {isLocalized && (
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
                <MapPin className="w-3 h-3" />
                Portfolio Coverage ({user.assignedBranches?.length} Branches)
              </Badge>
            )}
            {!isLocalized && ['Admin', 'Director', 'Supervisor'].includes(user.role || '') && (
              <Badge variant="outline" className="bg-slate-50 text-slate-600 flex items-center gap-1 px-3 font-bold border-slate-200">
                <ShieldCheck className="w-3 h-3" />
                Global Oversight
              </Badge>
            )}
          </div>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search queue by name or ID..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing jurisdictional queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
