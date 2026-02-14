'use client';

import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
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
  History, 
  ShieldCheck, 
  UserCog, 
  Building2, 
  FileDown, 
  Globe, 
  Loader2, 
  Monitor,
  Activity,
  LogOut,
  ShieldAlert,
  Search,
  UserCheck
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  userRole?: string;
  action: string;
  timestamp: string;
  ipAddress: string;
  details: string;
}

export default function GlobalAuditLogPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const auditQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(100)) : null;
  }, [db]);

  const { data: logs, loading } = useCollection<AuditLogEntry>(auditQuery);

  const filteredLogs = logs?.filter(log => 
    log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleExportCSV = () => {
    if (!logs || logs.length === 0) return;

    const headers = ['ID', 'User', 'Email', 'Action', 'IP Address', 'Timestamp', 'Details'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => 
        [log.id, log.userName || 'N/A', log.userEmail, log.action, log.ipAddress, log.timestamp, log.details || ''].map(val => `"${val}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `nib-kyc-security-audit-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: "Institutional security audit trail has been saved to CSV.",
    });
  };

  const getActionIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('login') || act.includes('auth')) return UserCheck;
    if (act.includes('logout')) return LogOut;
    if (act.includes('user') || act.includes('permission')) return UserCog;
    if (act.includes('policy') || act.includes('config')) return ShieldCheck;
    if (act.includes('branch') || act.includes('district')) return Building2;
    if (act.includes('kyc') || act.includes('decision')) return History;
    if (act.includes('escalate')) return ShieldAlert;
    return Activity;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-lg shadow-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Security Audit Log</h1>
            <p className="text-muted-foreground text-lg font-medium">Master record of all system modifications, authentication events, and critical workflow actions.</p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search audit trail..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11 border-slate-200 focus-visible:ring-primary"
            />
          </div>
          <Button onClick={handleExportCSV} className="gap-2 shadow-lg font-bold h-11 px-6 bg-primary hover:bg-primary/90">
            <FileDown className="w-4 h-4" />
            Export Trail
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4 pl-6">Performed By</TableHead>
              <TableHead className="font-bold">Action Taken</TableHead>
              <TableHead className="font-bold">Context / Details</TableHead>
              <TableHead className="font-bold">Network Origin</TableHead>
              <TableHead className="font-bold pr-6">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-32 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Retrieving Security Vault...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-32 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <History className="w-12 h-12 text-slate-200" />
                    <p className="font-bold text-slate-400">No security events match your search criteria.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredLogs.map((log) => {
              const ActionIcon = getActionIcon(log.action);
              return (
                <TableRow key={log.id} className="hover:bg-slate-50 transition-colors group">
                  <TableCell className="py-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold shrink-0 text-xs">
                        {log.userName?.charAt(0) || log.userEmail.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-slate-900 truncate">{log.userName || 'Institutional User'}</span>
                        <span className="text-[10px] text-muted-foreground font-bold truncate">{log.userEmail}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/5 rounded-md">
                        <ActionIcon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <Badge variant="secondary" className="bg-white border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-tighter">
                        {log.action}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-slate-600 line-clamp-1 max-w-[300px]">
                      {log.details || 'N/A'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md w-fit">
                      <Monitor className="w-3 h-3" />
                      {log.ipAddress || 'Internal Hub'}
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex flex-col text-right">
                      <span className="text-xs font-bold text-slate-900 tabular-nums">
                        {format(new Date(log.timestamp), 'MMM dd, yyyy')}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
                        {format(new Date(log.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-100">
        <Globe className="w-5 h-5 shrink-0" />
        <p className="text-xs font-bold leading-relaxed">
          <strong>Compliance Notice:</strong> This audit trail is immutable and synchronized across the regional disaster recovery nodes. Data retention is set to 7 years per regulatory mandates.
        </p>
      </div>
    </div>
  );
}
