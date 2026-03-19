'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  ShieldCheck, 
  UserCog, 
  FileDown, 
  Loader2, 
  Activity,
  LogOut,
  Search,
  UserCheck,
  Globe,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { getGlobalAuditLogs } from "@/actions/audit";
import { usePermissions } from "@/hooks/use-permissions";

export default function GlobalAuditLogPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 10;

  useEffect(() => {
    if (!permissionsLoading && !hasPermission('VIEW_SYSTEM_AUDIT')) {
      router.push('/unauthorized?required=VIEW_SYSTEM_AUDIT');
    }
  }, [hasPermission, permissionsLoading, router]);

  // Search Debounce Engine
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on new discovery intent
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Data Fetching Sync
  useEffect(() => {
    if (hasPermission('VIEW_SYSTEM_AUDIT')) {
      loadLogs();
    }
  }, [page, debouncedSearch, hasPermission]);

  const loadLogs = async () => {
    setLoading(true);
    const result = await getGlobalAuditLogs({ 
      page, 
      limit, 
      search: debouncedSearch 
    });
    setLogs(result.logs);
    setTotal(result.total);
    setLoading(false);
  };

  const handleExportCSV = async () => {
    if (total === 0) return;
    
    toast({ title: "Compiling Export", description: "Fetching full history for CSV compilation..." });
    const fullResult = await getGlobalAuditLogs({ page: 1, limit: 1000, search: debouncedSearch });
    const exportLogs = fullResult.logs;

    const headers = ['ID', 'User', 'Email', 'Action', 'IP Address', 'Timestamp', 'Details'];
    const csvContent = [headers.join(','), ...exportLogs.map(log => [
      log.id, 
      log.userName || 'N/A', 
      log.userEmail || 'N/A', 
      log.action, 
      log.ipAddress || 'N/A', 
      log.timestamp, 
      (log.details || '').replace(/,/g, ';')
    ].join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nib-audit-trail-${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    link.click();
    toast({ title: "Export Successful" });
  };

  const getActionIcon = (action: string) => {
    const act = (action || "").toLowerCase();
    if (act.includes('login')) return UserCheck;
    if (act.includes('logout')) return LogOut;
    if (act.includes('user') || act.includes('provision')) return UserCog;
    return Activity;
  };

  const totalPages = Math.ceil(total / limit) || 1;

  if (permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Verifying Clearance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary text-white rounded-lg shadow-lg"><ShieldCheck className="w-6 h-6" /></div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Security Audit Log</h1>
            <p className="text-muted-foreground text-lg">Master institutional security record with real-time network origin tracking.</p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search trail or IP..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="pl-9 h-11 bg-white border-slate-200 rounded-xl font-medium" 
            />
          </div>
          <Button onClick={handleExportCSV} className="gap-2 shadow-xl font-bold h-11 px-6 bg-slate-900 text-white rounded-xl hover:bg-black transition-all">
            <FileDown className="w-4 h-4" /> Export Trail
          </Button>
        </div>
      </div>

      <div className="border rounded-2xl bg-card shadow-xl overflow-hidden border-slate-200 bg-white">
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Performed By</TableHead>
              <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Action Taken</TableHead>
              <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Details</TableHead>
              <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Network Origin</TableHead>
              <TableHead className="font-black pr-8 text-[11px] uppercase tracking-widest text-slate-500 text-right">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-32 text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Querying Audit Vault...</p>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-32 text-center">
                  <div className="max-w-xs mx-auto space-y-3">
                    <div className="p-4 bg-slate-50 rounded-full w-fit mx-auto">
                      <Search className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="font-bold text-slate-900">No logs discovered</p>
                    <p className="text-sm text-muted-foreground">Adjust filters or check network connectivity.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : logs.map((log) => {
              const ActionIcon = getActionIcon(log.action);
              return (
                <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                  <TableCell className="py-6 pl-8">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 group-hover:text-primary transition-colors">{log.userName || 'Institutional System'}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">{log.userEmail || 'system@internal'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 rounded-md">
                        <ActionIcon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase font-black border-primary/20 bg-primary/5 text-primary tracking-tighter">
                        {log.action?.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-slate-600 line-clamp-1 max-w-[300px]" title={log.details}>
                      {log.details}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-mono font-black text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2 tabular-nums">
                        <Globe className="w-3 h-3 text-primary/60" />
                        {log.ipAddress || '127.0.0.1'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-900">
                        {log.timestamp ? format(new Date(log.timestamp), 'MMM dd, yyyy') : 'N/A'}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
                        {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : ''}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* INSTITUTIONAL PAGINATION CONTROLS */}
        <div className="flex items-center justify-between px-8 py-5 bg-slate-50/50 border-t">
          <div className="space-y-0.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Page {page} of {totalPages}
            </p>
            <p className="text-[9px] font-bold text-primary uppercase">
              {total} Total Security Events Discovered
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="h-9 px-4 rounded-xl border-slate-200 bg-white font-bold text-slate-600 hover:text-primary transition-all shadow-sm active:scale-95"
            >
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            <div className="h-9 min-w-[36px] px-3 flex items-center justify-center bg-white border border-primary/20 rounded-xl font-black text-sm text-primary shadow-sm">
              {page}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages || loading}
              className="h-9 px-4 rounded-xl border-slate-200 bg-white font-bold text-slate-600 hover:text-primary transition-all shadow-sm active:scale-95"
            >
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
