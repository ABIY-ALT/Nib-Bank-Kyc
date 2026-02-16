
"use client"

import { KYCSubmission, Document } from "@/lib/kyc-data";
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
  RefreshCw,
  Archive,
  Zap,
  FileArchive,
  Loader2
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
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { doc, collection, setDoc, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/auth-mock";
import { format } from "date-fns";
import JSZip from 'jszip';
import { useState } from "react";

export function SubmissionsPageContent({ submissions }: { submissions: KYCSubmission[] }) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadBundle = async (sub: KYCSubmission) => {
    if (!db || !user) return;
    setDownloadingId(sub.id);

    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const districtName = sub.district.replace(/\s+/g, '_');
      const branchName = sub.branch.replace(/\s+/g, '_');
      const bundleName = `${districtName}_${branchName}_${timestamp}`;

      const docsSnap = await getDocs(collection(doc(db, "submissions", sub.id), "documents"));
      const docList = docsSnap.docs.map(d => ({ ...d.data(), id: d.id }) as Document);

      const manifest = `Nib Bank KYC Bundle
Generated: ${now.toLocaleString()}
Case ID: ${sub.id}
Customer: ${sub.customerName}
Source: ${sub.district} District / ${sub.branch} Branch
Officer: ${sub.submittedBy}
Inventory Count: ${docList.length}

--- DOCUMENTS ---
${docList.map(d => `- [${d.type.toUpperCase()}] ${d.name}`).join('\n') || 'No documents discovered.'}
`;
      zip.file("nib_bank_manifest.txt", manifest);

      if (docList.length > 0) {
        const assets = zip.folder("captured_assets");
        for (const docObj of docList) {
          try {
            const sourceUrl = docObj.url === '#' 
              ? (docObj.name.toLowerCase().endsWith('.pdf') 
                  ? 'https://placehold.co/1200x1600/png?text=Institutional+PDF+Source' 
                  : `https://picsum.photos/seed/${docObj.id}/1200/1600`)
              : docObj.url;

            const response = await fetch(sourceUrl);
            const blob = await response.blob();
            assets?.file(docObj.name, blob);
          } catch (err) {
            console.error(`Failed to package ${docObj.name}:`, err);
            assets?.file(`${docObj.name}_ERROR.txt`, `Institutional error: File capture failed for ${docObj.name}`);
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.body.appendChild(document.createElement('a'));
      link.href = url;
      link.download = `${bundleName}.zip`;
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);

      const logRef = doc(collection(doc(db, "submissions", sub.id), "bundle_downloads"));
      setDoc(logRef, {
        id: logRef.id,
        performedBy: user.name,
        timestamp: now.toISOString(),
        bundleName: bundleName,
        sourceDistrict: sub.district,
        sourceBranch: sub.branch
      }).catch(() => {});

      toast({
        title: "Bundle Compiled",
        description: `Nib Bank archive ${bundleName} is ready.`,
      });
    } catch (error) {
      console.error("Archive failure:", error);
      toast({
        variant: "destructive",
        title: "Bundle Error",
        description: "Failed to compile the institutional document bundle."
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (sub: KYCSubmission) => {
    if (sub.isExceptional && sub.exceptionalStatus !== 'COMPLETED' && sub.exceptionalStatus !== 'NONE' && sub.exceptionalStatus) {
      return (
        <Badge className="bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100 flex items-center gap-1.5 w-fit font-bold px-3 py-1">
          <Zap className="w-3.5 h-3.5 text-yellow-600" /> {sub.exceptionalStatus.replace(/_/g, ' ')}
        </Badge>
      );
    }

    const status = sub.status;
    const isResubmitted = sub.isResubmitted && (status === 'PENDING' || status === 'IN_REVIEW');

    switch (status) {
      case 'APPROVED': 
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-bold px-3 py-1">Approved</Badge>;
      case 'PENDING': 
      case 'IN_REVIEW':
        return isResubmitted ? 
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1.5 w-fit shadow-sm font-bold px-3 py-1">
            <History className="w-3.5 h-3.5" /> Pending Review
          </Badge> : 
          status === 'IN_REVIEW' ?
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100 font-bold px-3 py-1">In Review</Badge> :
          <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Pending
          </Badge>;
      case 'AMENDED': 
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 flex items-center gap-1.5 w-fit animate-pulse font-bold px-3 py-1">
            <AlertCircle className="w-3.5 h-3.5" /> Action Required
          </Badge>
        );
      case 'REJECTED': 
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 font-bold px-3 py-1">Rejected</Badge>;
      case 'ESCALATED': 
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
                      <RefreshCw className="w-2" /> Cycle {sub.amendmentCycles}
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
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200 transition-colors" disabled={downloadingId === sub.id}>
                      {downloadingId === sub.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <MoreVertical className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-2">
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-1 px-3">Case Options</DropdownMenuLabel>
                    <DropdownMenuItem asChild className="rounded-md focus:bg-primary/5 focus:text-primary cursor-pointer">
                      <Link href={`/submissions/${sub.id}`} className="flex items-center gap-3 font-bold py-3 px-3">
                        <Eye className="w-4 h-4" />
                        Open Case File
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleDownloadBundle(sub)}
                      className="rounded-md focus:bg-primary/5 cursor-pointer py-3 px-3"
                    >
                      <div className="flex items-center gap-3 font-bold text-slate-700">
                        <FileArchive className="w-4 h-4 text-slate-500" />
                        Download Case Bundle
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
