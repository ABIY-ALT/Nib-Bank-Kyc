'use client';

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { getGlobalAuditLogs } from "@/actions/audit";

export default function GlobalAuditLogPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    const data = await getGlobalAuditLogs();
    setLogs(data);
    setLoading(false);
  };

  const filteredLogs = logs.filter(log => 
    log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['ID', 'User', 'Email', 'Action', 'IP Address', 'Timestamp', 'Details'];
    const csvContent = [headers.join(','), ...logs.map(log => [log.id, log.userName || 'N/A', log.userEmail, log.action, log.ipAddress, log.timestamp, log.details || ''].join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-trail-${new Date().toISOString()}.csv`;
    link.click();
    toast({ title: "Export Successful" });
  };

  const getActionIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('login')) return UserCheck;
    if (act.includes('logout')) return LogOut;
    if (act.includes('user')) return UserCog;
    return Activity;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-lg shadow-lg"><ShieldCheck className="w-6 h-6" /></div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Security Audit Log</h1>
            <p className="text-muted-foreground text-lg">Master institutional security record.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search trail..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-11" /></div>
          <Button onClick={handleExportCSV} className="gap-2 shadow-lg font-bold h-11 px-6 bg-primary">
            <FileDown className="w-4 h-4" /> Export Trail
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4 pl-6">Performed By</TableHead>
              <TableHead className="font-bold">Action Taken</TableHead>
              <TableHead className="font-bold">Details</TableHead>
              <TableHead className="font-bold">Network Origin</TableHead>
              <TableHead className="font-bold pr-6">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></TableCell></TableRow>
            ) : filteredLogs.map((log) => {
              const ActionIcon = getActionIcon(log.action);
              return (
                <TableRow key={log.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell className="py-4 pl-6">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900">{log.userName || 'Institutional User'}</span>
                      <span className="text-[10px] text-muted-foreground font-bold">{log.userEmail}</span>
                    </div>
                  </TableCell>
                  <TableCell><div className="flex items-center gap-2"><div className="p-1.5 bg-primary/5 rounded-md"><ActionIcon className="w-3.5 h-3.5 text-primary" /></div><Badge variant="secondary" className="text-[10px] uppercase font-bold">{log.action}</Badge></div></TableCell>
                  <TableCell><p className="text-sm font-medium text-slate-600 line-clamp-1 max-w-[300px]">{log.details}</p></TableCell>
                  <TableCell><div className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md w-fit"><Monitor className="w-3 h-3 inline mr-1" />{log.ipAddress}</div></TableCell>
                  <TableCell className="pr-6 text-right"><div className="flex flex-col"><span className="text-xs font-bold text-slate-900">{format(new Date(log.timestamp), 'MMM dd, yyyy')}</span><span className="text-[10px] text-muted-foreground font-bold">{format(new Date(log.timestamp), 'HH:mm:ss')}</span></div></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
