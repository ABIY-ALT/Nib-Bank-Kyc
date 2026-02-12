
'use client';

import { useParams, useRouter } from "next/navigation";
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection } from "firebase/firestore";
import { useAuth } from "@/lib/auth-mock";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription, 
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Download, 
  Eye, 
  History, 
  ShieldCheck,
  User,
  Building2,
  Calendar,
  Loader2,
  FolderArchive,
  Info
} from "lucide-react";
import { useState, useMemo } from "react";
import { KYCSubmission, Document, FollowUpVerification } from "@/lib/kyc-data";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";

export default function FollowUpVerificationDetail() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useAuth();
  
  const [remarks, setRemarks] = useState("");
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  // 1. Fetch the audit record
  const verifyRef = useMemoFirebase(() => {
    return db && params.id ? doc(db, "follow_up_verifications", params.id as string) : null;
  }, [db, params.id]);

  const { data: verification, loading: vLoading } = useDoc<FollowUpVerification>(verifyRef);

  // 2. Fetch the linked submission
  const submissionRef = useMemoFirebase(() => {
    return db && verification ? doc(db, "submissions", verification.submissionId) : null;
  }, [db, verification]);

  const { data: submission, loading: sLoading } = useDoc<KYCSubmission>(submissionRef);

  // 3. Fetch documents
  const docsQuery = useMemoFirebase(() => {
    return submissionRef ? collection(submissionRef, "documents") : null;
  }, [submissionRef]);

  const { data: documents } = useCollection<Document>(docsQuery);

  const handleAction = async (result: 'Correct' | 'Discrepancy') => {
    if (!verifyRef || !db) return;

    if (result === 'Discrepancy' && !remarks.trim()) {
      toast({ variant: "destructive", title: "Remarks Required", description: "Please explain the identified discrepancy for institutional feedback." });
      return;
    }

    const updateData = {
      result,
      remarks,
      verifiedBy: user.name,
      verifiedAt: new Date().toISOString(),
      status: 'Completed'
    };

    await updateDoc(verifyRef, updateData);
    toast({ title: "Audit Logged", description: `Case verification marked as ${result}.` });
    router.back();
  };

  if (vLoading || sLoading) {
    return <div className="py-32 text-center text-muted-foreground animate-pulse"><Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Retrieving audit assets...</div>;
  }

  if (!verification || !submission) return <div className="p-12 text-center">Audit record missing.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-black font-headline tracking-tight">Audit: {submission.id}</h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black uppercase text-[10px] tracking-widest">
              {verification.status} Audit
            </Badge>
          </div>
          <p className="text-muted-foreground font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4" /> {submission.branch} Branch • Quality Control Session
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <FolderArchive className="w-5 h-5 text-primary" />
                Asset Inventory (Read-Only)
              </CardTitle>
              <CardDescription>Head Office access to institutional evidence bundle.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-4">
                {documents?.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/30 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-primary/10 transition-colors">
                        <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 leading-tight">{doc.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter mt-0.5">
                          {doc.type.replace(/_/g, ' ')} • {new Date(doc.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setPreviewDoc(doc)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" asChild className="rounded-full">
                        <a href={doc.url === '#' ? 'https://picsum.photos/seed/doc/1200/1600' : doc.url} download={doc.name}><Download className="w-4 h-4" /></a>
                      </Button>
                    </div>
                  </div>
                ))}
                {(!documents || documents.length === 0) && (
                  <div className="py-12 text-center text-muted-foreground italic bg-slate-50 rounded-2xl border-2 border-dashed">
                    No documents discovered in case bundle.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-primary/20 bg-white">
            <CardHeader className="bg-primary/5 border-b border-primary/10">
              <CardTitle className="text-xl flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Institutional Determination
              </CardTitle>
              <CardDescription>Log your audit findings for the Head Office compliance database.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Audit Remarks & Feedback</Label>
                <Textarea 
                  placeholder="Detail any discrepancies found or provide audit confirmation..." 
                  className="min-h-[140px] bg-slate-50/30 focus:ring-primary border-slate-200"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  className="bg-emerald-600 hover:bg-emerald-700 h-14 font-black shadow-lg gap-2 text-white"
                  onClick={() => handleAction('Correct')}
                >
                  <CheckCircle2 className="w-5 h-5" /> Mark Correct
                </Button>
                <Button 
                  variant="outline"
                  className="h-14 font-black shadow-md gap-2 text-orange-600 border-orange-600 hover:bg-orange-50"
                  onClick={() => handleAction('Discrepancy')}
                >
                  <AlertTriangle className="w-5 h-5" /> Log Discrepancy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-slate-200 overflow-hidden sticky top-24">
            <CardHeader className="bg-slate-900 text-white border-b border-white/10">
              <CardTitle className="text-lg font-bold uppercase tracking-widest">Audit Context</CardTitle>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg h-fit text-slate-500"><User className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</p>
                    <p className="font-bold text-slate-900">{submission.customerName}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg h-fit text-slate-500"><Building2 className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Originating Node</p>
                    <p className="font-bold text-slate-900">{submission.branch} Branch</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg h-fit text-slate-500"><User className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Processing Officer</p>
                    <p className="font-bold text-slate-900">{submission.submittedBy}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="p-2 bg-slate-100 rounded-lg h-fit text-slate-500"><Calendar className="w-5 h-5" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approval Date</p>
                    <p className="font-bold text-slate-900">{new Date(submission.submittedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t space-y-4">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest">
                  <Info className="w-4 h-4" /> Institutional Note
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl italic">
                  Head Office audit determines if the branch followed institutional KYC standards and regulatory mandates. Findings here impact branch performance metrics.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden bg-black/95 border-none">
          <DialogHeader className="p-4 bg-slate-900 text-white flex flex-row items-center justify-between space-y-0 border-b border-white/5 pr-12">
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> {previewDoc?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[#121212]">
            <img src={previewDoc?.url === '#' ? 'https://picsum.photos/seed/doc/1200/1600' : previewDoc?.url} alt="Document Preview" className="max-w-full max-h-full object-contain shadow-2xl" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
