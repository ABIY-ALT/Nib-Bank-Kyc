
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Inbox, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";

export default function ReviewQueuePage() {
  const db = useFirestore();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // Primary workspace for KYC Officers: Pending or In Review
  const reviewQueueQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "submissions"),
      where("status", "in", ["Pending", "In Review"]),
      orderBy("submittedAt", "desc")
    );
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(reviewQueueQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    
    let filtered = [...submissions];

    // Branch assignment filtering for Localized KYC Officers
    if (user.role === 'KYC Officer' && user.branch && user.branch !== 'Central HQ') {
      filtered = filtered.filter(sub => sub.branch === user.branch);
    }

    const term = searchTerm.toLowerCase();
    return filtered.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm, user.branch, user.role]);

  const isLocalized = user.role === 'KYC Officer' && user.branch && user.branch !== 'Central HQ';

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
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3">
                <MapPin className="w-3 h-3" />
                {user.branch} Only
              </Badge>
            )}
          </div>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search queue by name or ID..." 
            className="pl-10 h-11 border-slate-200 focus-visible:ring-primary shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
