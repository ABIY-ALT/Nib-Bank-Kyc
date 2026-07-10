'use client';

import { useEffect, useMemo, useState } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Inbox, ShieldCheck, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { getSubmissions } from "@/actions/submissions";
import { getBranchMappings } from "@/actions/branch-mappings";
import { KYC_STATUS } from "@/lib/kyc-data";
import { usePermissions } from "@/hooks/use-permissions";
import { Pagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

export default function ReviewActionPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tempBranchNames, setTempBranchNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'submittedAt', order: 'asc' });

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

      const [result, mappings] = await Promise.all([
        getSubmissions({
          status: [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW],
          isExceptional: false,
          isResubmitted: false,
          branches: isSuperAdmin ? undefined : (
            assignedBranches.length > 0
              ? assignedBranches
              : [user.branchName || "RESTRICTED_NODE_UNASSIGNED"]
          ),
          limit: ITEMS_PER_PAGE,
          offset: (currentPage - 1) * ITEMS_PER_PAGE,
          search: debouncedSearch || undefined,
          sortField: sort.field as any,
          sortOrder: sort.order
        }),
        getBranchMappings(),
      ]);

      const tempNames = new Set<string>(
        mappings
          .filter((m: any) =>
            m.active &&
            m.type === 'TEMPORARY' &&
            m.officers.some((o: any) => o.user?.id === user.id)
          )
          .map((m: any) => (m.branchName || '').toLowerCase())
      );
      setTempBranchNames(tempNames);
      setSubmissions(result.submissions || []);
      setTotalCount(result.total || 0);
      setLoading(false);
    }
    loadData();
  }, [user, isSuperAdmin, currentPage, sort, debouncedSearch]);

  // Server already handles search via debouncedSearch.
  // Only map isTemporaryBranch — the search filter is applied server-side.
  const mappedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return submissions.map(sub => ({
      ...sub,
      isTemporaryBranch: tempBranchNames.has((sub.branchName || '').toLowerCase()),
    }));
  }, [submissions, tempBranchNames]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Review & Action</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-muted-foreground text-lg">Central hub for processing applications.</p>
            {isSuperAdmin ? (
              <Badge variant="outline" className="bg-slate-50 text-slate-600 flex items-center gap-1 px-3 font-bold border-slate-200">
                <ShieldCheck className="w-3 h-3" /> Overall Oversight
              </Badge>
            ) : user?.assignedBranches && user.assignedBranches.length > 0 && (
              <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 flex items-center gap-1 px-3 font-bold">
                <MapPin className="w-3 h-3" />
                {user.assignedBranches.length} Branch Portfolio
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
        <>
          <SubmissionsPageContent submissions={mappedSubmissions || []} sort={sort} onSortChange={(field, order) => { setSort({ field, order }); setCurrentPage(1); }} />
          
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
