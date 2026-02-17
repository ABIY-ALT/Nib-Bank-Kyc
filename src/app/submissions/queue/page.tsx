'use client';

import { useEffect, useMemo, useState } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Inbox, MapPin, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { getSubmissions } from "@/actions/submissions";
import { SubmissionStatus, UserRole } from "@prisma/client";

export default function ReviewQueuePage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isAdmin = user?.role === UserRole.ADMIN;

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      const data = await getSubmissions({
        status: [SubmissionStatus.PENDING, SubmissionStatus.IN_REVIEW],
        isExceptional: false,
        isResubmitted: false,
        branch: isAdmin ? undefined : (user.assignedBranches?.length ? undefined : user.branchName || undefined)
      });
      setSubmissions(data);
      setLoading(false);
    }
    loadData();
  }, [user, isAdmin]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Review Queue</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">Central hub for processing initial applications.</p>
            {isAdmin && (
              <Badge variant="outline" className="bg-slate-50 text-slate-600 flex items-center gap-1 px-3 font-bold border-slate-200">
                <ShieldCheck className="w-3 h-3" /> Global Oversight
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
          <p className="font-medium">Synchronizing review queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
