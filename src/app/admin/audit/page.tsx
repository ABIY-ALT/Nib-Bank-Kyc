
'use client';

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
import { History, ShieldCheck, UserCog, Building2, FileDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const MOCK_AUDIT_LOGS = [
  { id: 'LOG-1', user: 'Admin User', action: 'User Created', target: 'Mike Manager', timestamp: '2024-03-21 14:00', icon: UserCog },
  { id: 'LOG-2', user: 'Admin User', action: 'Policy Updated', target: 'SLA Config', timestamp: '2024-03-21 13:30', icon: ShieldCheck },
  { id: 'LOG-3', user: 'Jane Smith', action: 'KYC Decision', target: 'KYC-1001', timestamp: '2024-03-21 12:15', icon: History },
  { id: 'LOG-4', user: 'Admin User', action: 'Branch Added', target: 'West Coast Hub', timestamp: '2024-03-21 11:45', icon: Building2 },
  { id: 'LOG-5', user: 'Robert Brown', action: 'Case Escalated', target: 'KYC-8822', timestamp: '2024-03-21 10:20', icon: History },
  { id: 'LOG-6', user: 'Alice Wilson', action: 'User Permissions Modified', target: 'Local Officer', timestamp: '2024-03-21 09:15', icon: UserCog },
];

export default function GlobalAuditLogPage() {
  const { toast } = useToast();

  const handleExportCSV = () => {
    const headers = ['ID', 'Performed By', 'Action', 'Target', 'Timestamp'];
    const csvContent = [
      headers.join(','),
      ...MOCK_AUDIT_LOGS.map(log => 
        [log.id, log.user, log.action, log.target, log.timestamp].map(val => `"${val}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `nib-kyc-audit-log-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: "Institutional audit trail has been saved to CSV.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Audit Log</h1>
            <p className="text-muted-foreground text-lg font-medium">Master record of all system modifications and critical workflow actions.</p>
          </div>
        </div>
        <Button onClick={handleExportCSV} className="gap-2 shadow-lg font-bold">
          <FileDown className="w-4 h-4" />
          Export Audit Trail
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4">Performed By</TableHead>
              <TableHead className="font-bold">Action Taken</TableHead>
              <TableHead className="font-bold">Affected Resource</TableHead>
              <TableHead className="font-bold">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_AUDIT_LOGS.map((log) => (
              <TableRow key={log.id} className="hover:bg-slate-50 transition-colors group">
                <TableCell className="font-bold text-slate-900 py-4">{log.user}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <log.icon className="w-4 h-4 text-primary" />
                    <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold">
                      {log.action}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-slate-600">{log.target}</TableCell>
                <TableCell className="text-muted-foreground text-xs font-bold tabular-nums">{log.timestamp}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
