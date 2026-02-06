
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
  AlertCircle,
  Clock,
  RefreshCw
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
    const isResubmitted = sub.isResubmitted && (status === 'Pending' || status === 'In Review');

    switch (status) {
      case 'Approved': 
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-bold px-3 py-1">Approved</Badge>;
      case 'Pending': 
      case 'In Review':
        return isResubmitted ? 
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1.5 w-fit shadow-sm font-bold px-3 py-1">
            <History className="w-3.5 h-3.5" /> Pending Review
          </Badge> : 
          status === 'In Review' ?
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100 font-bold px-3 py-1">In Review</Badge> :
          <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Pending
          </Badge>;
      case 'Amended': 
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 flex items-center gap-1.5 w-fit animate-pulse font-bold px-3 py-1">
            <AlertCircle className="w-3.5 h-3.5" /> Action Required
          </Badge>
        );
      case 'Rejected': 
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 font-bold px-3 py-1">Rejected</Badge>;
      case 'Escalated': 
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100 font-bold px-3 py-1">Escalated</Badge>;
      default: 
        return <Badge variant="secondary" className="font-bold px-3 py-1">{status}</Badge>;
    }
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden shadow-sm border-slate-200">
      <Table>
        <TableHeader className="bg-slate-50/50">
          <TableRow>
            <TableHead className="font-bold text-slate-600 w-[120px]">Case ID</TableHead>
            <TableHead className="font-bold text-slate-600">Customer Details</TableHead>
            <TableHead className="font-bold text-slate-600">Branch</TableHead>
            <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
            <TableHead className="font-bold text-slate-600">Submission Date</TableHead>
            <TableHead className="text-right font-bold text-slate-600">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-slate-50 p-6 rounded-full border border-slate-100 mb-2">
                    <History className="w-10 h-10 text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-900 text-lg">No records found</p>
                  <p className="max-w-xs mx-auto text-sm">There are currently no cases in this queue.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : submissions.map((sub) => (
            <TableRow key={sub.id} className="group hover:bg-slate-50/50 transition-colors border-slate-100">
              <TableCell className="font-bold text-primary tabular-nums tracking-tighter">
                <div className="flex flex-col gap-1">
                  <span>{sub.id}</span>
                  {sub.amendmentCycles && sub.amendmentCycles > 0 && (
                    <div className="flex items-center gap-1 text-[9px] text-orange-600 font-black uppercase">
                      <RefreshCw className="w-2 h-2" /> Cycle {sub.amendmentCycles}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-slate-800 leading-tight">{sub.customerName}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{sub.entityType || 'Individual'}</span>
                </div>
              </TableCell>
              <TableCell className="text-slate-600 font-medium">{sub.branch}</TableCell>
              <TableCell>{getStatusBadge(sub)}</TableCell>
              <TableCell className="text-slate-500 tabular-nums font-medium">
                {new Date(sub.submittedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200 transition-colors">
                      <MoreVertical className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 p-2">
                    <DropdownMenuLabel className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">Case Options</DropdownMenuLabel>
                    <DropdownMenuItem asChild className="rounded-md focus:bg-primary/5 focus:text-primary cursor-pointer">
                      <Link href={`/submissions/${sub.id}`} className="flex items-center gap-2.5 font-bold py-2">
                        <Eye className="w-4 h-4" />
                        Open Case File
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-md focus:bg-primary/5 cursor-pointer py-2">
                      <div className="flex items-center gap-2.5 font-medium">
                        <FileDown className="w-4 h-4 text-slate-500" />
                        Download PDF Bundle
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem className="text-destructive focus:bg-destructive/5 focus:text-destructive rounded-md cursor-pointer py-2">
                      <div className="flex items-center gap-2.5 font-medium">
                        <AlertCircle className="w-4 h-4" />
                        Cancel Submission
                      </div>
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
