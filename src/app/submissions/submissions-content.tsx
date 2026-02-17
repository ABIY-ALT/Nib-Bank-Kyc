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
  History,
  AlertCircle,
  Clock,
  RefreshCw,
  Zap,
  FileArchive,
  Loader2
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-mock";
import { format } from "date-fns";
import JSZip from 'jszip';
import { useState } from "react";
import { logBundleDownload } from "@/actions/submissions";
import { SubmissionStatus, ExceptionalStatus } from "@prisma/client";

export function SubmissionsPageContent({ submissions }: { submissions: KYCSubmission[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadBundle = async (sub: KYCSubmission) => {
    if (!user) return;
    setDownloadingId(sub.id);

    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const bundleName = `${sub.district.replace(/\s+/g, '_')}_${sub.branch.replace(/\s+/g, '_')}_${timestamp}`;

      const manifest = `Nib Bank KYC Bundle\nGenerated: ${now.toLocaleString()}\nCase ID: ${sub.id}\nCustomer: ${sub.customerName}`;
      zip.file("nib_bank_manifest.txt", manifest);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.body.appendChild(document.createElement('a'));
      link.href = url;
      link.download = `${bundleName}.zip`;
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);

      await logBundleDownload({
        submissionId: sub.id,
        performedBy: user.name,
        bundleName: bundleName,
        sourceDistrict: sub.district,
        sourceBranch: sub.branch
      });

      toast({ title: "Bundle Compiled", description: `Nib Bank archive is ready.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Bundle Error", description: "Failed to compile bundle." });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (sub: KYCSubmission) => {
    if (sub.isExceptional && sub.exceptionalStatus && sub.exceptionalStatus !== 'NONE' && sub.exceptionalStatus !== 'COMPLETED') {
      return (
        <Badge className="bg-yellow-50 text-yellow-800 border-yellow-200 flex items-center gap-1.5 font-bold px-3 py-1">
          <Zap className="w-3.5 h-3.5 text-yellow-600" /> {sub.exceptionalStatus.replace(/_/g, ' ')}
        </Badge>
      );
    }

    const status = sub.status as unknown as SubmissionStatus;
    const isResubmitted = sub.isResubmitted && (status === SubmissionStatus.PENDING || status === SubmissionStatus.IN_REVIEW);

    switch (status) {
      case SubmissionStatus.APPROVED: 
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold px-3 py-1">Approved</Badge>;
      case SubmissionStatus.PENDING: 
      case SubmissionStatus.IN_REVIEW:
        return isResubmitted ? 
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1.5 font-bold px-3 py-1">
            <History className="w-3.5 h-3.5" /> Pending Review
          </Badge> : 
          <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> {status}
          </Badge>;
      case SubmissionStatus.AMENDED: 
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200 flex items-center gap-1.5 font-bold px-3 py-1 animate-pulse">
          <AlertCircle className="w-3.5 h-3.5" /> Action Required
        </Badge>;
      case SubmissionStatus.REJECTED: 
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 font-bold px-3 py-1">Rejected</Badge>;
      case SubmissionStatus.ESCALATED: 
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-bold px-3 py-1">Escalated</Badge>;
      default: 
        return <Badge variant="secondary" className="font-bold px-3 py-1">{status}</Badge>;
    }
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden shadow-sm border-slate-200">
      <Table>
        <TableHeader className="bg-slate-50/50">
          <TableRow>
            <TableHead className="font-bold text-slate-600">Case ID</TableHead>
            <TableHead className="font-bold text-slate-600">Customer Details</TableHead>
            <TableHead className="font-bold text-slate-600">Branch</TableHead>
            <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
            <TableHead className="font-bold text-slate-600">Submission Date</TableHead>
            <TableHead className="text-right font-bold text-slate-600">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">No records discovered.</TableCell></TableRow>
          ) : submissions.map((sub) => (
            <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors">
              <TableCell className="font-bold text-primary tabular-nums">
                <div className="flex flex-col gap-1">
                  <span>{sub.id}</span>
                  {sub.amendmentCycles > 0 && (
                    <div className="flex items-center gap-1 text-[9px] text-orange-600 font-black uppercase">
                      <RefreshCw className="w-2" /> Cycle {sub.amendmentCycles}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 leading-tight">{sub.customerName}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">{sub.entityType || 'Individual'}</span>
                </div>
              </TableCell>
              <TableCell className="text-slate-600 font-medium">{sub.branch}</TableCell>
              <TableCell>{getStatusBadge(sub)}</TableCell>
              <TableCell className="text-slate-500 tabular-nums font-medium">
                {new Date(sub.submittedAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" disabled={downloadingId === sub.id}>
                      {downloadingId === sub.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4 text-slate-400" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem asChild>
                      <Link href={`/submissions/${sub.id}`} className="flex items-center gap-3 font-bold cursor-pointer">
                        <Eye className="w-4 h-4" /> Open Case File
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadBundle(sub)} className="flex items-center gap-3 font-bold cursor-pointer">
                      <FileArchive className="w-4 h-4" /> Download Case Bundle
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
