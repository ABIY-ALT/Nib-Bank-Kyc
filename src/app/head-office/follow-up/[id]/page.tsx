'use client';

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FolderArchive,
  Loader2,
  ShieldCheck,
  User,
} from "lucide-react";

import { getFollowUpById, updateFollowUp } from "@/actions/follow-up";
import { getMemoAccessUrl } from "@/actions/memos";
import { getSubmissionById } from "@/actions/submissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

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
  const [activeDocumentAction, setActiveDocumentAction] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [params.id]);

  const loadData = async () => {
    if (!params.id) return;

    setLoading(true);
    const followUpRecord = await getFollowUpById(params.id as string);

    if (followUpRecord) {
      setVerification(followUpRecord);
      setRemarks(followUpRecord.remarks || "");

      const currentSubmission = await getSubmissionById(followUpRecord.submissionId);
      setSubmission(currentSubmission);
    } else {
      setVerification(null);
      setSubmission(null);
      setRemarks("");
    }

    setLoading(false);
  };

  const handleAction = async (result: "Correct" | "Discrepancy") => {
    if (!verification) return;

    if (result === "Discrepancy" && !remarks.trim()) {
      toast({ variant: "destructive", title: "Remarks Required" });
      return;
    }

    setIsSubmitting(result);
    const response = await updateFollowUp(verification.id, {
      result,
      remarks,
      verifiedBy: user?.name,
      status: "COMPLETED",
    });

    if (response.success) {
      toast({ title: "Successful" });
      router.push("/head-office/follow-up");
    } else {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: response.error || "Unable to complete follow-up review.",
      });
      setIsSubmitting(null);
    }
  };

  const handleDocumentAccess = async (memoId: string, fileName: string, mode: "view" | "download") => {
    const actionKey = `${memoId}:${mode}`;
    setActiveDocumentAction(actionKey);

    try {
      const response = await getMemoAccessUrl(memoId, { download: mode === "download" });
      if (!response.success || !response.url) {
        throw new Error(response.error || "Unable to open document.");
      }

      if (mode === "view") {
        window.open(response.url, "_blank", "noopener,noreferrer");
        return;
      }

      const link = window.document.createElement("a");
      link.href = response.url;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    } catch (error) {
      toast({
        variant: "destructive",
        title: mode === "view" ? "Open Failed" : "Download Failed",
        description: "Unable to access this document right now.",
      });
    } finally {
      setActiveDocumentAction(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse py-32 text-center text-muted-foreground">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin" />
        Retrieving case assets...
      </div>
    );
  }

  if (!verification || !submission) {
    return <div className="p-12 text-center">Follow-up record missing.</div>;
  }

  const isCompleted = verification.status === "COMPLETED";

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-headline text-3xl font-black tracking-tight text-slate-900">
              Follow-up Session: {submission.id}
            </h1>
            <p className="flex items-center gap-2 font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {submission.branchName?.toLowerCase().includes("branch")
                ? submission.branchName
                : `${submission.branchName} Branch`}
            </p>
          </div>
        </div>

        <Badge variant="outline" className="font-bold uppercase tracking-wider">
          {verification.status}
        </Badge>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <Card className="overflow-hidden border-slate-200 shadow-lg">
            <CardHeader className="border-b bg-primary text-white">
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <FolderArchive className="h-5 w-5 text-white" />
                Asset Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {submission.documents?.length ? (
                submission.documents.map((document: any) => {
                  const viewActionKey = `${document.id}:view`;
                  const downloadActionKey = `${document.id}:download`;
                  return (
                    <div
                      key={document.id}
                      className="group flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition-all hover:border-primary/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-slate-100 p-2">
                          <FileText className="h-6 w-6 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{document.name}</p>
                          <p className="text-[10px] font-black uppercase text-muted-foreground">{document.type}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {document.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full"
                              onClick={() => handleDocumentAccess(document.id, document.name, "view")}
                              disabled={activeDocumentAction !== null}
                              aria-label={`View ${document.name}`}
                            >
                              {activeDocumentAction === viewActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-primary hover:bg-primary/5"
                              onClick={() => handleDocumentAccess(document.id, document.name, "download")}
                              disabled={activeDocumentAction !== null}
                              aria-label={`Download ${document.name}`}
                            >
                              {activeDocumentAction === downloadActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        ) : (
                          <p className="text-xs font-bold text-slate-400">Link unavailable</p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm font-medium text-slate-500">
                  No case documents are attached to this follow-up record.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-primary/20 bg-white shadow-xl">
            <CardHeader className="border-b bg-primary text-white">
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <ShieldCheck className="h-5 w-5 text-white" />
                Determination
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Review Remarks & Feedback
                </Label>
                <Textarea
                  placeholder="Detail findings..."
                  className="min-h-[140px] bg-slate-50/30"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  disabled={!!isSubmitting || isCompleted}
                />
              </div>

              {isCompleted ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                  This follow-up review is completed. Documents remain available for viewing and download.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    className="h-14 bg-emerald-600 font-black text-white shadow-lg hover:bg-emerald-700"
                    onClick={() => handleAction("Correct")}
                    disabled={!!isSubmitting}
                  >
                    {isSubmitting === "Correct" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                    )}
                    Mark Correct
                  </Button>
                  <Button
                    variant="outline"
                    className="h-14 border-orange-600 font-black text-orange-600 shadow-md"
                    onClick={() => handleAction("Discrepancy")}
                    disabled={!!isSubmitting}
                  >
                    {isSubmitting === "Discrepancy" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <AlertTriangle className="mr-2 h-5 w-5" />
                    )}
                    Log Discrepancy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-24 overflow-hidden border-slate-200 shadow-lg">
            <CardHeader className="border-b border-white/10 bg-primary text-white">
              <CardTitle className="text-lg font-bold uppercase tracking-widest text-white">
                Follow-up Context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 pt-8">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="h-fit rounded-lg bg-slate-100 p-2 text-slate-500">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400">Customer</p>
                    <p className="font-bold text-slate-900">{submission.customerName}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-fit rounded-lg bg-slate-100 p-2 text-slate-500">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400">Branch</p>
                    <p className="font-bold text-slate-900">{submission.branchName}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 border-t pt-6">
                <p className="rounded-xl bg-slate-50 p-4 text-xs font-medium italic leading-relaxed text-slate-500">
                  Findings here impact branch performance metrics in reporting.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
