"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SubmissionsPageContent } from "../submissions-content";
import { Search, Inbox, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getSubmissions } from "@/actions/submissions";
import { Pagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

export default function MySubmissionsPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
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
      const result = await getSubmissions({
        submittedBy: user.id,
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
        search: debouncedSearch || undefined,
        sortField: sort.field as any,
        sortOrder: sort.order
      });
      setSubmissions(result.submissions || []);
      setTotalCount(result.total || 0);
      setLoading(false);
    }
    loadData();
  }, [user, currentPage, sort, debouncedSearch]);

  // Server already filtered via debouncedSearch — pass results directly.

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Inbox className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              My Submissions
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Detailed history of KYC verification requests initiated by you.
          </p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search my submissions by name or ID..." 
            className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-bold text-muted-foreground">Retrieving personal vault...</p>
        </div>
      ) : (
        <>
          <SubmissionsPageContent submissions={submissions || []} sort={sort} onSortChange={(field, order) => { setSort({ field, order }); setCurrentPage(1); }} />
          
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
