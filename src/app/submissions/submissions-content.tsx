
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
  FileDown,
  History,
  AlertCircle
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
  const getStatusBadge = (sub: KYCSubmission) => {
    const status = sub.status;
    const isResubmitted = sub.isResubmitted && status === 'Pending';

    switch (status) {
      case 'Approved': 
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">{status}</Badge>;
      case 'Pending': 
        return isResubmitted ? 
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 flex items-center gap-1 w-fit shadow-sm">
            <History className="w-3 h-3" /> Pending Review
          </Badge> : 
          <Badge variant="outline" className="text-slate-500">{status}</Badge>;
      case 'In Review': 
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100">{status}</Badge>;
      case 'Amended': 
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 flex items-center gap-1 w-fit animate-pulse">
            <AlertCircle className="w-3 h-3" /> Action Required
          </Badge>
        );
      case 'Rejected': 
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">{status}</Badge>;
      case 'Escalated': 
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">{status}</Badge>;
      default: 
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden shadow-sm border-slate-200">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="font-bold text-slate-600">ID</TableHead>
            <TableHead className="font-bold text-slate-600">Customer</TableHead>
            <TableHead className="font-bold text-slate-600">Branch</TableHead>
            <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
            <TableHead className="font-bold text-slate-600">Date Received</TableHead>
            <TableHead className="text-right font-bold text-slate-600">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-slate-50 p-4 rounded-full mb-2">
                    <History className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="font-semibold text-slate-900">Queue empty</p>
                  <p className="text-sm">There are currently no items matching this criteria.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : submissions.map((sub) => (
            <TableRow key={sub.id} className="group hover:bg-slate-50/50 transition-colors">
              <TableCell className="font-bold text-primary tabular-nums">{sub.id}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">{sub.customerName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{sub.entityType || 'Individual'}</span>
                </div>
              </TableCell>
              <TableCell className="text-slate-600">{sub.branch}</TableCell>
              <TableCell>{getStatusBadge(sub)}</TableCell>
              <TableCell className="text-slate-500 tabular-nums">
                {new Date(sub.submittedAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Case Management</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href={`/submissions/${sub.id}`} className="cursor-pointer flex items-center gap-2 font-medium text-primary">
                        <Eye className="w-4 h-4" />
                        View Case File
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer flex items-center gap-2">
                      <FileDown className="w-4 h-4" />
                      Download Assets
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive cursor-pointer">
                      Withdraw Request
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
