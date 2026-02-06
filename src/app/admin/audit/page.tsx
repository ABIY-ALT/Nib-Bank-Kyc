import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { History, ShieldCheck, UserCog, Building2 } from "lucide-react"

const MOCK_AUDIT_LOGS = [
  { id: 'LOG-1', user: 'Admin User', action: 'User Created', target: 'Mike Manager', timestamp: '2024-03-21 14:00', icon: UserCog },
  { id: 'LOG-2', user: 'Admin User', action: 'Policy Updated', target: 'SLA Config', timestamp: '2024-03-21 13:30', icon: ShieldCheck },
  { id: 'LOG-3', user: 'Jane Smith', action: 'KYC Decision', target: 'KYC-1001', timestamp: '2024-03-21 12:15', icon: History },
  { id: 'LOG-4', user: 'Admin User', action: 'Branch Added', target: 'West Coast Hub', timestamp: '2024-03-21 11:45', icon: Building2 },
  { id: 'LOG-5', user: 'Robert Brown', action: 'Case Escalated', target: 'KYC-8822', timestamp: '2024-03-21 10:20', icon: History },
  { id: 'LOG-6', user: 'Alice Wilson', action: 'User Permissions Modified', target: 'Local Officer', timestamp: '2024-03-21 09:15', icon: UserCog },
];

export default function GlobalAuditLogPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <History className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">Master record of all system modifications and critical workflow actions.</p>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold">Performed By</TableHead>
              <TableHead className="font-bold">Action Taken</TableHead>
              <TableHead className="font-bold">Affected Resource</TableHead>
              <TableHead className="font-bold">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_AUDIT_LOGS.map((log) => (
              <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors">
                <TableCell className="font-bold text-slate-900">{log.user}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <log.icon className="w-4 h-4 text-primary" />
                    <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                      {log.action}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-slate-600">{log.target}</TableCell>
                <TableCell className="text-muted-foreground text-xs font-medium">{log.timestamp}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
