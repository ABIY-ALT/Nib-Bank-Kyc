import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default function GlobalAuditLogPage() {
  const auditLogs = [
    { id: 'LOG-1', user: 'Admin User', action: 'User Created', target: 'Mike Manager', timestamp: '2024-03-21 14:00' },
    { id: 'LOG-2', user: 'Admin User', action: 'Policy Updated', target: 'SLA Config', timestamp: '2024-03-21 13:30' },
    { id: 'LOG-3', user: 'Jane Smith', action: 'KYC Decision', target: 'KYC-1001', timestamp: '2024-03-21 12:15' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Master record of all system modifications and critical workflow actions.</p>
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium">{log.user}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{log.action}</Badge>
                </TableCell>
                <TableCell>{log.target}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{log.timestamp}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
