"use client"

import { useEffect, useMemo, useState } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { History, Loader2, MapPin, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { usePermissions } from "@/hooks/use-permissions";
import { Pagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

export default function AmendmentReviewPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'submittedAt', order: 'asc' });

  const isAdmin = isSuperAdmin;

  // Server-side search: the list is paginated, so a client-side match over the
  // 10 visible rows could never find a case sitting on another page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      const assignedBranches = user.assignedBranches || [];
      const result = await getSubmissions({
        isResubmitted: true,
        // Only cases still awaiting a verdict belong in this queue. `isResubmitted`
        // stays true for the case's lifetime, so without a status scope a case that
        // was approved or returned again would remain stuck in Amendment Review.
        status: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW, KYC_STATUS.ESCALATED],
        branches: !isAdmin && assignedBranches.length > 0 ? assignedBranches :
          (!isAdmin && assignedBranches.length === 0 && user.branchName ? [user.branchName] : undefined),
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
        search: debouncedSearch || undefined,
        sortField: sort.field as any,
        sortOrder: sort.order
      });
      setSubmissions(result.submissions);
      setTotalCount(result.total);
      setLoading(false);
    }
    loadData();
  }, [user, isAdmin, currentPage, sort, debouncedSearch]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-40 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Loading amendment queue...</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <History className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Amendment Review</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">Prioritized queue for resubmitted cases.</p>
            {isAdmin ? (
              <Badge variant="outline" className="bg-slate-50 text-slate-600 flex items-center gap-1 px-3 font-bold border-slate-200">
                <ShieldCheck className="w-3 h-3" />
                Overall Oversight
              </Badge>
            ) : user?.assignedBranches && user.assignedBranches.length > 0 ? (
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
                <MapPin className="w-3 h-3" />
                {user.assignedBranches.length} Branch Portfolio
              </Badge>
            ) : user?.branchName && (
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
                <MapPin className="w-3 h-3" />
                {user.branchName} Office
              </Badge>
            )}
          </div>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search resubmissions by name or ID..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing amendment queue...</p>
        </div>
      ) : (
        <>
          <SubmissionsPageContent submissions={filteredSubmissions || []} sort={sort} onSortChange={(field, order) => { setSort({ field, order }); setCurrentPage(1); }} />
          
          {totalCount > ITEMS_PER_PAGE && (
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                totalItems={totalCount}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
