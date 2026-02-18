"use client"

import { useEffect, useMemo, useState } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { AlertCircle, Loader2, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getSubmissions } from "@/actions/submissions";
import { KYCStatus } from "@prisma/client";
import { usePermissions } from "@/hooks/use-permissions";

export default function AmendmentRequestsPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isAdmin = isSuperAdmin;

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      const data = await getSubmissions({
        status: [KYCStatus.ACTION_REQUIRED],
        createdById: isAdmin ? undefined : user.id
      });
      setSubmissions(data);
      setLoading(false);
    }
    loadData();
  }, [user, isAdmin]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions
      .filter(sub => 
        sub.customerName.toLowerCase().includes(term) || 
        sub.id.toLowerCase().includes(term)
      );
  }, [submissions, searchTerm]);

  if (permissionsLoading) return <div className="py-32 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-8 h-8 text-orange-600" />
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Action Required</h1>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-lg">
              {isAdmin ? 'Monitoring all network cases requiring correction.' : 'Submissions requiring your attention and requested corrections.'}
            </p>
            {isAdmin && (
              <Badge variant="outline" className="bg-slate-50 text-slate-600 flex items-center gap-1 px-3 font-bold border-slate-200">
                <ShieldCheck className="w-3 h-3" />
                Global Oversight
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search action items..." 
              className="pl-11 h-12 rounded-full border-2 border-primary focus-visible:ring-primary/20 bg-white shadow-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing correction queue...</p>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}
    </div>
  );
}
