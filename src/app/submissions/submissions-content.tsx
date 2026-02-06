
"use client"

import { KYCSubmission } from "@/lib/kyc-data";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MoreVertical, 
  Eye,
  FileDown
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

export function SubmissionsPageContent({ submissions }: { submissions: KYCSubmission[] }) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{status}</Badge>;
      case 'Pending': return <Badge variant="outline">{status}</Badge>;
      case 'In Review': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{status}</Badge>;
      case 'Amended': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">{status}</Badge>;
      case 'Rejected': return <Badge variant="destructive">{status}</Badge>;
      case 'Escalated': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">{status}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="border rounded-lg bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Submission ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted On</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No submissions found in this category.
              </TableCell>
            </TableRow>
          ) : submissions.map((sub) => (
            <TableRow key={sub.id}>
              <TableCell className="font-medium">{sub.id}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{sub.customerName}</span>
                  <span className="text-xs text-muted-foreground">{sub.customerId || 'N/A'}</span>
                </div>
              </TableCell>
              <TableCell>{sub.branch}</TableCell>
              <TableCell>{getStatusBadge(sub.status)}</TableCell>
              <TableCell>{new Date(sub.submittedAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href={`/submissions/${sub.id}`} className="cursor-pointer flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer flex items-center gap-2" onClick={() => alert('Download starting...')}>
                      <FileDown className="w-4 h-4" />
                      Download Docs
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive cursor-pointer">
                      Cancel Submission
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
