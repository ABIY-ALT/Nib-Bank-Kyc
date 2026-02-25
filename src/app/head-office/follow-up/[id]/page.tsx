
'use client';

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Eye, 
  ShieldCheck,
  User,
  Building2,
  Loader2,
  FolderArchive,
  Download
} from "lucide-react";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getFollowUpById, updateFollowUp } from "@/actions/follow-up";
import { getSubmissionById } from "@/actions/submissions";

export default function FollowUpVerificationDetail() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [verification, setVerification] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [params.id]);

  const loadData = async () => {
    if (!params.id) return;
    setLoading(true);
    const v = await getFollowUpById(params.id as string);
    if (v) {
      setVerification(v);
      const s = await getSubmissionById(v.submissionId);
      setSubmission(s);
    }
    setLoading(false);
  };

  const handleAction = async (result: 'Correct' | 'Discrepancy') => {
    if (result === 'Discrepancy' && !remarks.trim()) {
      toast({ variant: "destructive", title: "Remarks Required" });
      return;
    }

    setIsSubmitting(result);
    const res = await updateFollowUp(verification.id, {
      result,
      remarks,
      verifiedBy: user?.name,
      status: 'COMPLETED'
    });

    if (res.success) {
      toast({ title: "Audit Logged" });
      router.push('/head-office/follow-up');
    } else {
      toast({ variant: "destructive", title: "Action Failed" });
      setIsSubmitting(null);
    }
  };

  if (loading) return <div className="py-32 text-center text-muted-foreground animate-pulse"><Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Retrieving audit assets...</div>;
  if (!verification || !submission) return <div className="p-12 text-center">Audit record missing.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-3xl font-black font-headline text-slate-900 tracking-tight">Audit Session: {submission.id}</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-2"><Building2 className="w-4 h-4" /> {submission.branchName} Node</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl flex items-center gap-2 text-white"><FolderArchive className="w-5 h-5 text-white" /> Asset Inventory</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              {submission.documents?.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/30 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-slate-100 rounded-lg"><FileText className="w-6 h-6 text-slate-400" /></div>
                    <div><p className="font-bold text-slate-900">{doc.name}</p><p className="text-[10px] uppercase font-black text-muted-foreground">{doc.type}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9"><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" asChild className="rounded-full h-9 w-9 text-primary hover:bg-primary/5">
                      <a href={doc.fileUrl} download={doc.name}><Download className="w-4 h-4" /></a>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-xl border-primary/20 bg-white overflow-hidden">
            <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl flex items-center gap-2 text-white"><ShieldCheck className="w-5 h-5 text-white" /> Institutional Determination</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Audit Remarks & Feedback</Label>
                <Textarea placeholder="Detail findings..." className="min-h-[140px] bg-slate-50/30" value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={!!isSubmitting} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button className="bg-emerald-600 hover:bg-emerald-700 h-14 font-black shadow-lg text-white" onClick={() => handleAction('Correct')} disabled={!!isSubmitting}>{isSubmitting === 'Correct' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />} Mark Correct</Button>
                <Button variant="outline" className="h-14 font-black shadow-md text-orange-600 border-orange-600" onClick={() => handleAction('Discrepancy')} disabled={!!isSubmitting}>{isSubmitting === 'Discrepancy' ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5 mr-2" />} Log Discrepancy</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-slate-200 overflow-hidden sticky top-24">
            <CardHeader className="bg-primary text-white border-b border-white/10"><CardTitle className="text-lg font-bold uppercase tracking-widest text-white">Audit Context</CardTitle></CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="space-y-6">
                <div className="flex gap-4"><div className="p-2 bg-slate-100 rounded-lg h-fit text-slate-500"><User className="w-5 h-5" /></div><div><p className="text-[10px] font-black text-slate-400 uppercase">Customer</p><p className="font-bold text-slate-900">{submission.customerName}</p></div></div>
                <div className="flex gap-4"><div className="p-2 bg-slate-100 rounded-lg h-fit text-slate-500"><Building2 className="w-5 h-5" /></div><div><p className="text-[10px] font-black text-slate-400 uppercase">Originating Node</p><p className="font-bold text-slate-900">{submission.branchName}</p></div></div>
              </div>
              <div className="pt-6 border-t space-y-4"><p className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl italic">Findings here impact branch performance metrics in reporting.</p></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
