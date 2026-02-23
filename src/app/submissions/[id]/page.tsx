"use client"

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Clock, 
  MessageSquare,
  ArrowLeft,
  ShieldCheck,
  Check,
  Search,
  Eye,
  Loader2,
  FileArchive,
  MapPin,
  MessagesSquare,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Activity,
  SendHorizontal,
  RotateCcw,
  Upload,
  X,
  Plus,
  BookOpen,
  Download,
  RefreshCw,
  ShieldAlert
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { getSubmissionById, updateSubmissionStatus, resubmitSubmission } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { KYCStatus } from "@prisma/client";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import JSZip from 'jszip';
import { usePermissions } from "@/hooks/use-permissions";
import { AMENDMENT_SCENARIOS } from "@/lib/kyc-data";

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  
  const [submission, setSubmission] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [remarks, setRemarks] = useState("");
  const [isCustomRemark, setIsCustomRemark] = useState(true);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isActioning, setIsActioning] = useState<string | null>(null);

  const [resubmitFiles, setResubmitFiles] = useState<{file: File, type: string, id: string}[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadData() {
      if (!params.id) return;
      try {
        const [sub, s] = await Promise.all([
          getSubmissionById(params.id as string),
          getGlobalSettings()
        ]);
        setSubmission(sub);
        setSettings(s);
      } catch (error) {
        console.error("Load failed:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id]);

  const isReviewer = useMemo(() => {
    return hasPermission('KYC_VERIFY_CHECKLIST') || hasPermission('KYC_APPROVE_STANDARD');
  }, [hasPermission]);

  const canRespond = useMemo(() => {
    return hasPermission('CASE_RESPOND_AMENDMENT') || hasPermission('CASE_RESUBMIT');
  }, [hasPermission]);

  const isTerminal = submission?.status === KYCStatus.APPROVED || submission?.status === KYCStatus.REJECTED;
  const isActionRequired = submission?.status === KYCStatus.ACTION_REQUIRED;

  const handleAction = async (action: KYCStatus) => {
    if (!submission || !user || isTerminal || isActioning) return;

    if (action === KYCStatus.ACTION_REQUIRED && !remarks.trim()) {
      toast({ variant: "destructive", title: "Information Required", description: "Amendment requests require detailed remarks." });
      return;
    }

    if (action === KYCStatus.ESCALATED && !remarks.trim()) {
      toast({ variant: "destructive", title: "Justification Required", description: "Please explain the reason for escalation." });
      return;
    }

    setIsActioning(action);
    try {
      await updateSubmissionStatus(submission.id, action, user.id, remarks);
      toast({ title: "Workflow Updated", description: `Case moved to ${action.replace(/_/g, ' ')}.` });
      
      const updated = await getSubmissionById(submission.id);
      setSubmission(updated);
      setRemarks("");
      setIsCustomRemark(true);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    } finally {
      setIsActioning(null);
    }
  };

  const handleResubmit = async () => {
    if (!submission || !user || isActioning) return;
    if (!remarks.trim()) {
      toast({ variant: "destructive", title: "Notes Required", description: "Explain the corrections made." });
      return;
    }

    setIsActioning(KYCStatus.SUBMITTED);
    try {
      const formData = new FormData();
      formData.append('id', submission.id);
      formData.append('userId', user.id);
      formData.append('remarks', remarks);
      
      resubmitFiles.forEach(f => {
        formData.append('files', f.file);
        formData.append('types', f.type);
      });

      const res = await resubmitSubmission(formData);
      if (res.success) {
        toast({ title: "Case Resubmitted", description: "Corrections and documents dispatched." });
        const updated = await getSubmissionById(submission.id);
        setSubmission(updated);
        setRemarks("");
        setIsCustomRemark(true);
        setResubmitFiles([]);
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Resubmission Failed", description: e.message });
    } finally {
      setIsActioning(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(f => ({
        file: f,
        type: "other",
        id: Math.random().toString(36).substr(2, 9)
      }));
      setResubmitFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeResubmitFile = (id: string) => {
    setResubmitFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateResubmitFileType = (id: string, type: string) => {
    setResubmitFiles(prev => prev.map(f => f.id === id ? { ...f, type } : f));
  };

  const handleDownloadBundle = async () => {
    if (!submission || !user) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      zip.file("manifest.txt", `Case ID: ${submission.id}\nCustomer: ${submission.customerName}`);
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `KYC_${submission.id}.zip`;
      link.click();
      toast({ title: "Bundle Downloaded" });
    } catch (error) {
      toast({ variant: "destructive", title: "Download Failed" });
    } finally {
      setIsDownloading(false);
    }
  };

  const workflowSteps = useMemo(() => {
    if (!submission) return [];
    
    const status = submission.status as KYCStatus;
    
    return [
      { 
        id: 'submitted', 
        label: 'Submission', 
        description: 'Case registered by branch',
        state: 'completed',
        icon: CheckCircle2
      },
      { 
        id: 'review', 
        label: 'KYC Review', 
        description: 'Specialist analysis',
        state: status === KYCStatus.SUBMITTED ? 'active' : 'completed',
        icon: Search
      },
      { 
        id: 'determination', 
        label: 'Determination', 
        description: status === KYCStatus.ACTION_REQUIRED ? 'Action Required' : status === KYCStatus.ESCALATED ? 'Senior Assessment' : 'Institutional Verdict',
        state: status === KYCStatus.ACTION_REQUIRED ? 'alert' : 
               status === KYCStatus.IN_REVIEW ? 'active' : 
               status === KYCStatus.ESCALATED ? 'active' :
               (status === KYCStatus.APPROVED || status === KYCStatus.REJECTED) ? 'completed' : 'pending',
        icon: status === KYCStatus.ACTION_REQUIRED ? AlertCircle : 
              status === KYCStatus.ESCALATED ? ShieldAlert :
              status === KYCStatus.REJECTED ? XCircle : ShieldCheck
      },
      { 
        id: 'finalized', 
        label: 'Case Closed', 
        description: 'Lifecycle conclusion',
        state: (status === KYCStatus.APPROVED || status === KYCStatus.REJECTED) ? 'completed' : 'pending',
        icon: FileArchive
      }
    ];
  }, [submission]);

  if (loading) return <div className="p-12 text-center text-muted-foreground animate-pulse"><Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-primary/5 text-primary"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black font-headline text-slate-900 tracking-tight">{submission.id}</h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(
                  "font-black px-3 py-1 uppercase text-[10px] tracking-widest",
                  submission.status === KYCStatus.APPROVED && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  submission.status === KYCStatus.ACTION_REQUIRED && 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse', 
                  submission.status === KYCStatus.REJECTED && 'bg-red-50 text-red-700 border-red-200',
                  submission.status === KYCStatus.SUBMITTED && 'bg-primary/5 text-primary border-primary/20',
                  submission.status === KYCStatus.ESCALATED && 'bg-purple-50 text-purple-700 border-purple-200'
                )}>
                  {submission.status.replace(/_/g, ' ')}
                </Badge>
                {(submission.amendCycles || 0) > 0 && (
                  <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-100 flex items-center gap-1.5 font-black text-[10px] px-3">
                    <RefreshCw className="w-3 h-3" /> Cycle {submission.amendCycles}
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-wider">{submission.customerName} • {submission.branchName} Node</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button className="bg-primary hover:bg-primary/90 text-white font-black px-6 shadow-xl h-11 rounded-xl gap-2" onClick={handleDownloadBundle} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
            Download Archive
           </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-lg overflow-hidden rounded-3xl bg-white">
        <CardContent className="p-8">
          <div className="relative flex flex-col md:flex-row justify-between gap-8 md:gap-0">
            <div className="absolute top-[22px] left-0 right-0 h-0.5 bg-slate-100 hidden md:block" />
            {workflowSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.id} className="relative z-10 flex md:flex-col items-center md:items-center gap-4 md:gap-3 md:w-1/4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm border-2",
                    step.state === 'completed' && "bg-primary border-primary text-white shadow-primary/20",
                    step.state === 'active' && "bg-white border-primary text-primary animate-pulse shadow-xl",
                    step.state === 'alert' && "bg-orange-50 border-orange-500 text-orange-600 shadow-orange-100",
                    step.state === 'pending' && "bg-slate-50 border-slate-100 text-slate-300"
                  )}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-left md:text-center space-y-0.5">
                    <p className={cn(
                      "text-xs font-black uppercase tracking-[0.15em]",
                      step.state === 'completed' ? "text-primary" : 
                      step.state === 'active' ? "text-primary" : 
                      step.state === 'alert' ? "text-orange-600" : "text-slate-400"
                    )}>
                      {step.label}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-primary p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <CardTitle className="text-xl font-black tracking-tight text-white">Case Documents</CardTitle>
              </div>
              <Badge variant="secondary" className="bg-white/20 border-white/20 font-bold text-white uppercase text-[10px] tracking-widest px-3">{submission.documents?.length || 0} Files</Badge>
            </CardHeader>
            <CardContent className="pt-6 px-6">
              <div className="grid gap-4">
                {submission.documents?.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-5 border rounded-2xl bg-white shadow-sm hover:border-primary/30 transition-all group border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-primary/5 transition-colors">
                          <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 group-hover:text-primary transition-colors">{doc.name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-black">{doc.type}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                         <Button variant="ghost" size="icon" onClick={() => setPreviewFile({ name: doc.name, url: doc.url })} className="rounded-full h-10 w-10 hover:bg-primary/5 text-primary"><Eye className="w-5 h-5" /></Button>
                         <Button variant="ghost" size="icon" asChild className="rounded-full h-10 w-10 hover:bg-primary/5 text-primary">
                           <a href={doc.url} download={doc.name}>
                             <Download className="w-5 h-5" />
                           </a>
                         </Button>
                      </div>
                    </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-3xl">
            <CardHeader className="bg-primary p-6 border-b flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <MessagesSquare className="w-5 h-5 text-white" />
                </div>
                <CardTitle className="text-xl font-black tracking-tight text-white">Audit History</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-8 px-8 pb-10">
              <div className="relative space-y-8">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                {submission.commentHistory && (submission.commentHistory as any[]).length > 0 ? (
                  (submission.commentHistory as any[]).map((entry, idx) => (
                    <div key={idx} className="relative flex gap-6 animate-in slide-in-from-left duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="z-10 w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center shrink-0 shadow-sm group-hover:border-primary/20 transition-colors">
                        <MessageSquare className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="flex-1 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-1">
                          <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{entry.performedBy} <span className="text-primary ml-1">[{entry.role}]</span></span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed font-medium">{entry.comment}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-muted-foreground italic flex flex-col items-center gap-3">
                    <Activity className="w-10 h-10 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No historical entries recorded.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-xl border-primary/20 bg-primary/5 overflow-hidden rounded-3xl sticky top-24">
            <CardHeader className="bg-primary border-b border-white/10 py-5 px-6">
              <CardTitle className="text-[11px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-white" /> Institutional Context
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Entity</p>
                  <p className="font-black text-slate-900 text-lg leading-tight">{submission.customerName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Originating Node</p>
                  <p className="font-black text-slate-900">{submission.branchName} Branch</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submitted By</p>
                  <p className="font-black text-slate-900">{submission.createdBy?.firstName} {submission.createdBy?.lastName || 'Institutional Staff'}</p>
                </div>
                <div className="space-y-1 pt-4 border-t border-primary/10">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Workflow</p>
                  <p className="font-black text-primary uppercase text-sm">{submission.status.replace(/_/g, ' ')}</p>
                </div>
            </CardContent>
          </Card>

          {isActionRequired && canRespond && (
            <Card className="border-orange-200 shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-500 bg-orange-50/10">
              <CardHeader className="bg-orange-600 text-white border-b py-5">
                <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
                  <RotateCcw className="w-5 h-5 text-white" /> Correction Workspace
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6 px-6 pb-8">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Response Note</Label>
                  <Textarea 
                    placeholder="Describe the corrections made (e.g., 'Attached missing ID copy')..." 
                    value={remarks} 
                    onChange={(e) => setRemarks(e.target.value)} 
                    className="min-h-[120px] bg-white border-orange-200 focus-visible:ring-orange-200 rounded-2xl font-medium" 
                  />
                </div>

                <div className="space-y-4">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Add Supplemental Documents</Label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-orange-200 rounded-2xl p-6 text-center cursor-pointer hover:bg-orange-50 transition-all"
                  >
                    <Upload className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-orange-600">Click to attach new files</p>
                    <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileSelect} />
                  </div>

                  {resubmitFiles.length > 0 && (
                    <div className="space-y-2">
                      {resubmitFiles.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 p-2 bg-white border border-orange-100 rounded-lg">
                          <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-700 truncate">{item.file.name}</p>
                            <select 
                              className="text-[9px] font-black uppercase text-orange-600 bg-transparent border-none p-0 h-auto focus:ring-0"
                              value={item.type}
                              onChange={(e) => updateResubmitFileType(item.id, e.target.value)}
                            >
                              <option value="id_card">ID Card</option>
                              <option value="passport">Passport</option>
                              <option value="trade_license">Trade License</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-slate-400 hover:text-primary">
                              <a href={URL.createObjectURL(item.file)} download={item.file.name}>
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={() => removeResubmitFile(item.id)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button 
                  onClick={handleResubmit} 
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black h-14 rounded-xl shadow-lg shadow-orange-100 gap-2" 
                  disabled={!!isActioning || !remarks.trim()}
                >
                  {isActioning === KYCStatus.SUBMITTED ? <Loader2 className="w-5 h-5 animate-spin" /> : <SendHorizontal className="w-5 h-5" />}
                  Resubmit Corrected Case
                </Button>
                <p className="text-[10px] text-center text-orange-400 font-bold uppercase">The case will be flagged as "Resubmitted" for Specialists.</p>
              </CardContent>
            </Card>
          )}

          {!isTerminal && !isActionRequired && isReviewer && (
            <Card className="border-primary/20 shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-500">
              <CardHeader className="bg-primary text-white border-b py-5">
                <CardTitle className="text-lg font-black tracking-tight text-white">KYC Determination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6 px-6 pb-8">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen className="w-3 h-3" /> Standard Findings / Scenarios
                  </Label>
                  <Select onValueChange={(val) => {
                    if (val.toLowerCase().includes("other")) {
                      setIsCustomRemark(true);
                      setRemarks("");
                    } else {
                      setIsCustomRemark(false);
                      setRemarks(val);
                    }
                  }}>
                    <SelectTrigger className="h-11 bg-slate-50/50 border-slate-200 focus:ring-primary/20 rounded-xl font-medium">
                      <SelectValue placeholder="Select a standard comment..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AMENDMENT_SCENARIOS.map((scenario, idx) => (
                        <SelectItem key={idx} value={scenario}>
                          {scenario}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Official Decision Remarks</Label>
                  <Textarea 
                    placeholder="Provide detailed instructions or verification notes..." 
                    value={remarks} 
                    onChange={(e) => setRemarks(e.target.value)} 
                    readOnly={!isCustomRemark}
                    className={cn(
                      "min-h-[140px] border-slate-200 focus-visible:ring-primary/20 rounded-2xl font-medium",
                      !isCustomRemark ? "bg-slate-100 cursor-not-allowed text-slate-600" : "bg-slate-50/50"
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button 
                    onClick={() => handleAction(KYCStatus.APPROVED)} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg shadow-emerald-100" 
                    disabled={!!isActioning}
                  >
                    Approve
                  </Button>
                  <Button 
                    onClick={() => handleAction(KYCStatus.ACTION_REQUIRED)} 
                    variant="outline" 
                    className="text-orange-600 border-orange-200 font-black h-12 rounded-xl hover:bg-orange-50" 
                    disabled={!!isActioning}
                  >
                    Amend
                  </Button>
                  <Button 
                    onClick={() => handleAction(KYCStatus.ESCALATED)} 
                    className="bg-purple-600 hover:bg-purple-700 text-white font-black h-12 rounded-xl shadow-lg shadow-purple-100" 
                    disabled={!!isActioning}
                  >
                    Escalate
                  </Button>
                </div>
                <p className="text-[10px] text-center text-slate-400 font-bold uppercase mt-2">Determinations are logged in the Institutional Vault.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] overflow-hidden flex flex-col p-0 border-none bg-[#1a1a1a] rounded-3xl shadow-2xl">
          <DialogHeader className="p-4 bg-primary text-white flex flex-row items-center justify-between space-y-0 border-b border-white/10 pr-14">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <DialogTitle className="text-base font-bold text-white">
                  {previewFile?.name}
                </DialogTitle>
                <DialogDescription className="text-white/70 text-[10px] uppercase font-black tracking-widest mt-0.5">
                  Institutional Document Inspection
                </DialogDescription>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-9 font-bold px-4">
              <a href={previewFile?.url} download={previewFile?.name}>
                <Download className="w-4 h-4 mr-2" /> Download Document
              </a>
            </Button>
          </DialogHeader>
          <div className="flex-1 bg-[#121212] overflow-hidden flex items-center justify-center text-white">
            <p className="font-bold text-slate-500 uppercase tracking-widest text-xs">Visualization optimized for secure inspection.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
