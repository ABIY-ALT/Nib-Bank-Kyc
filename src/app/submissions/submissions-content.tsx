
"use client"

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
  Loader2,
  ShieldCheck,
  XCircle,
  ShieldAlert
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
import { KYCStatus } from "@prisma/client";

export function SubmissionsPageContent({ submissions }: { submissions: any[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadBundle = async (sub: any) => {
    if (!user) return;
    setDownloadingId(sub.id);

    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const bundleName = `${(sub.districtName || "Central").replace(/\s+/g, '_')}_${(sub.branchName || "Global").replace(/\s+/g, '_')}_${timestamp}`;

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
        sourceDistrict: sub.districtName || "Central",
        sourceBranch: sub.branchName || "Global"
      });

      toast({ title: "Bundle Compiled", description: `Nib Bank archive is ready.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Bundle Error", description: "Failed to compile bundle." });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (sub: any) => {
    if (sub.isExceptional && sub.exceptionalStatus && sub.exceptionalStatus !== 'NONE' && sub.exceptionalStatus !== 'COMPLETED') {
      return (
        <Badge className="bg-yellow-50 text-yellow-800 border-yellow-200 flex items-center gap-1.5 font-black text-[9px] px-3 py-1 uppercase tracking-tighter">
          <Zap className="w-3 h-3 text-yellow-600" /> Hierarchy: {sub.exceptionalStatus.replace(/_/g, ' ')}
        </Badge>
      );
    }

    const status = sub.status as KYCStatus;
    const isResubmitted = sub.isResubmitted && (status === KYCStatus.SUBMITTED || status === KYCStatus.IN_REVIEW);

    switch (status) {
      case KYCStatus.APPROVED: 
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-black text-[9px] px-3 py-1 uppercase flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> Successfully Authorized
        </Badge>;
      case KYCStatus.SUBMITTED: 
      case KYCStatus.IN_REVIEW:
        return isResubmitted ? 
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1.5 font-black text-[9px] px-3 py-1 uppercase">
            <History className="w-3 h-3" /> Resubmitted
          </Badge> : 
          <Badge variant="outline" className="text-slate-500 font-black text-[9px] px-3 py-1 flex items-center gap-1.5 uppercase">
            <Clock className="w-3 h-3" /> {status === KYCStatus.SUBMITTED ? 'Awaiting Specialist' : 'Specialist Analysis'}
          </Badge>;
      case KYCStatus.ACTION_REQUIRED: 
        return <Badge className="bg-orange-50 text-orange-700 border-orange-200 flex items-center gap-1.5 font-black text-[9px] px-3 py-1 uppercase animate-pulse">
          <AlertCircle className="w-3 h-3" /> Action Required
        </Badge>;
      case KYCStatus.REJECTED: 
        return <Badge className="bg-red-50 text-red-700 border-red-200 font-black text-[9px] px-3 py-1 uppercase flex items-center gap-1.5">
          <XCircle className="w-3 h-3" /> Risk Rejected
        </Badge>;
      case KYCStatus.ESCALATED: 
        return <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-black text-[9px] px-3 py-1 uppercase flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3" /> Senior Assessment
        </Badge>;
      default: 
        return <Badge variant="secondary" className="font-bold px-3 py-1 uppercase text-[9px]">{status}</Badge>;
    }
  };

  return (
    <div className="border rounded-2xl bg-card overflow-hidden shadow-xl border-slate-200 bg-white">
      <Table>
        <TableHeader className="bg-slate-50/80">
          <TableRow>
            <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest py-5 pl-8">Case ID</TableHead>
            <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Customer Entity</TableHead>
            <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Authorized Node</TableHead>
            <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Workflow Status</TableHead>
            <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Dispatch Date</TableHead>
            <TableHead className="text-right font-black text-slate-500 text-[11px] uppercase tracking-widest pr-8">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic bg-slate-50/30">No institutional records discovered.</TableCell></TableRow>
          ) : submissions.map((sub) => (
            <TableRow key={sub.id} className="hover:bg-slate-50 transition-colors group">
              <TableCell className="font-black text-primary tabular-nums pl-8">
                <div className="flex flex-col gap-1">
                  <span>{sub.id}</span>
                  {(sub.amendCycles || 0) > 0 && (
                    <div className="flex items-center gap-1 text-[8px] text-orange-600 font-black uppercase tracking-tighter">
                      <RefreshCw className="w-2 h-2" /> Cycle {sub.amendCycles}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-6">
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 leading-tight">{sub.customerName}</span>
                  <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">{sub.entityType?.replace(/_/g, ' ') || 'Individual'} Account</span>
                </div>
              </TableCell>
              <TableCell className="text-slate-600 font-bold text-xs">{sub.branchName}</TableCell>
              <TableCell>{getStatusBadge(sub)}</TableCell>
              <TableCell className="text-slate-400 tabular-nums font-bold text-[10px] uppercase">
                {format(new Date(sub.submittedAt), 'MMM dd, yyyy')}
              </TableCell>
              <TableCell className="text-right pr-8">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 hover:bg-primary/5" disabled={downloadingId === sub.id}>
                      {downloadingId === sub.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <MoreVertical className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 rounded-xl border-slate-200 shadow-2xl">
                    <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-4 py-2 border-b">Case Action Menu</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href={`/submissions/${sub.id}`} className="flex items-center gap-3 font-bold py-3 cursor-pointer hover:bg-primary/5 text-slate-700">
                        <Eye className="w-4 h-4 text-primary" /> Open Case File
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadBundle(sub)} className="flex items-center gap-3 font-bold py-3 cursor-pointer hover:bg-primary/5 text-slate-700">
                      <FileArchive className="w-4 h-4 text-emerald-600" /> Download Case Bundle
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
