"use client"

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
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
  MessageSquare,
  ArrowLeft,
  ShieldCheck,
  Search,
  Eye,
  Loader2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Activity,
  Download,
  Shield,
  Gavel,
  Scale,
  Landmark,
  UserCheck,
  ClipboardCheck,
  Zap,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Upload,
  ShieldAlert,
  X,
  History
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { getSubmissionById, updateSubmissionStatus, updateSubmissionChecklist, processExceptionalStep, resubmitSubmission } from "@/actions/submissions";
import { deleteInstitutionalFile } from "@/actions/storage";
import { getGlobalSettings } from "@/actions/settings";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/use-permissions";
import { AMENDMENT_SCENARIOS, KYC_STATUS, EXCEPTIONAL_STATUS } from "@/lib/kyc-data";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const KYC_CHECKLIST_ITEMS = [
  { id: 'id_verified', label: 'Identity Document Authenticity' },
  { id: 'photo_match', label: 'Customer Photo Comparison' },
  { id: 'sanction_check', label: 'Sanction & AML Screening' },
  { id: 'pep_check', label: 'PEP (Politically Exposed Person) Check' },
  { id: 'mother_name', label: "Mother's Name Verification" },
  { id: 't24_sync', label: 'Core Banking (T24) Data Match' },
  { id: 'address_verified', label: 'Residential Address Validation' },
  { id: 'risk_profile', label: 'Risk Categorization Review' },
  { id: 'funds_source', label: 'Source of Funds/Wealth Verification' },
  { id: 'beneficial_owner', label: 'Beneficial Ownership Check' },
  { id: 'blacklist_check', label: 'Blacklist & Caution List Screening' },
  { id: 'signature_match', label: 'Specimen Signature Verification' }
];

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission, isSuperAdmin } = usePermissions();
  
  const [submission, setSubmission] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [remarks, setRemarks] = useState("");
  const [isCustomRemark, setIsCustomRemark] = useState(true);
  const [isActioning, setIsActioning] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const [resubmitFiles, setResubmitFiles] = useState<{file: File, type: string, id: string}[]>([]);
  const resubmitInputRef = useRef<HTMLInputElement>(null);

  const [govMemo, setGovMemo] = useState<File | null>(null);
  const govFileInputRef = useRef<HTMLInputElement>(null);

  const [fileToPurge, setFileToPurge] = useState<any | null>(null);
  const [isPurging, setIsPurging] = useState<string | null>(null);

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

  useEffect(() => {
    let state: any = {};
    if (submission?.checklistState) {
      const raw = submission.checklistState;
      if (typeof raw === 'string' && raw.trim().length > 0) {
        try { state = JSON.parse(raw); } catch { state = {}; }
      } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        state = raw;
      }
    }
    setChecklist(state || {});
  }, [submission]);

  const isCreator = user?.id === submission?.createdById;
  
  const isReviewer = useMemo(() => {
    if (isSuperAdmin) return true;
    if (isCreator) return false;
    return hasPermission('KYC_VIEW_QUEUE');
  }, [hasPermission, isSuperAdmin, isCreator]);

  const isTerminal = submission?.status === KYC_STATUS.APPROVED || submission?.status === KYC_STATUS.REJECTED;

  const showChecklist = useMemo(() => {
    if (!submission) return false;
    if (submission.isExceptional) {
      return submission.exceptionalStatus === 'COMPLETED' || submission.status === KYC_STATUS.APPROVED;
    }
    return true;
  }, [submission]);

  const verifiedCount = useMemo(() => {
    if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) return 0;
    return Object.values(checklist).filter(Boolean).length;
  }, [checklist]);

  const progressPercentage = (verifiedCount / KYC_CHECKLIST_ITEMS.length) * 100;

  const handleAction = async (action: string) => {
    if (!submission || !user || isTerminal || isActioning) return;

    if ((action === KYC_STATUS.ACTION_REQUIRED || action === KYC_STATUS.ESCALATED) && !remarks.trim()) {
      toast({ variant: "destructive", title: "Information Required", description: "This action requires detailed remarks." });
      return;
    }

    setIsActioning(action);
    try {
      await updateSubmissionStatus(submission.id, action, user.id, remarks);
      toast({ title: "Successful", description: `Case moved to ${action.replace(/_/g, ' ')}.` });
      const updated = await getSubmissionById(submission.id);
      setSubmission(updated);
      setRemarks("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    } finally {
      setIsActioning(null);
    }
  };

  const handleResubmit = async () => {
    if (!submission || !user || isActioning) return;
    if (resubmitFiles.length === 0) {
      toast({ variant: "destructive", title: "Assets Required", description: "Please attach corrected documents." });
      return;
    }
    
    setIsActioning("RESUBMIT");
    try {
      const formData = new FormData();
      formData.append('id', submission.id);
      formData.append('remarks', remarks);
      resubmitFiles.forEach(f => {
        formData.append('files', f.file);
        formData.append('types', f.type);
      });

      const res = await resubmitSubmission(formData);
      if (res.success) {
        toast({ title: "Successful", description: "Case resubmitted for specialist analysis." });
        const updated = await getSubmissionById(submission.id);
        setSubmission(updated);
        setRemarks("");
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

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const valid: {file: File, type: string, id: string}[] = [];
      for (const f of files) {
        if (f.size > MAX_FILE_SIZE) {
          toast({ variant: "destructive", title: "File Too Large", description: f.name });
          continue;
        }
        if (!ALLOWED_TYPES.includes(f.type)) {
          toast({ variant: "destructive", title: "Invalid Type", description: f.name });
          continue;
        }
        valid.push({ file: f, type: "", id: crypto.randomUUID() });
      }
      setResubmitFiles(prev => [...prev, ...valid]);
    }
  };

  const handleExceptionalStep = async (nextStatus: string, actionLabel: string) => {
    if (!submission || !user || isActioning) return;
    
    setIsActioning(nextStatus);
    try {
      const formData = new FormData();
      formData.append('id', submission.id);
      formData.append('nextStatus', nextStatus);
      formData.append('remarks', remarks);
      formData.append('actionLabel', actionLabel);
      if (govMemo) formData.append('memo', govMemo);

      await processExceptionalStep(formData);
      toast({ title: "Successful" });
      const updated = await getSubmissionById(submission.id);
      setSubmission(updated);
      setRemarks("");
      setGovMemo(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Transition Failed" });
    } finally {
      setIsActioning(null);
    }
  };

  const handleConfirmPurge = async () => {
    if (!fileToPurge) return;
    setIsPurging(fileToPurge.id);
    try {
      const res = await deleteInstitutionalFile(fileToPurge.id);
      if (res.success) {
        toast({ title: "Successful" });
        const updated = await getSubmissionById(submission.id);
        setSubmission(updated);
      }
    } finally {
      setIsPurging(null);
      setFileToPurge(null);
    }
  };

  const handleChecklistToggle = async (itemId: string) => {
    if (!isReviewer || isTerminal) return;
    const nextState = { ...checklist, [itemId]: !checklist[itemId] };
    setChecklist(nextState);
    try {
      await updateSubmissionChecklist(submission.id, nextState);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Error" });
    }
  };

  const workflowSteps = useMemo(() => {
    if (!submission) return [];
    const status = submission.status;
    const excStatus = submission.exceptionalStatus;
    
    if (submission.isExceptional) {
      return [
        { id: 'sub', label: 'Submission', desc: 'Case Dispatched', state: 'completed', icon: CheckCircle2 },
        { id: 'dist', label: 'District Director', desc: 'Regional Oversight', state: excStatus === EXCEPTIONAL_STATUS.AWAITING_DISTRICT ? 'active' : (excStatus === EXCEPTIONAL_STATUS.NONE ? 'pending' : 'completed'), icon: Landmark },
        { id: 'kycdir', label: 'KYC Director', desc: 'Strategic Risk Review', state: excStatus === EXCEPTIONAL_STATUS.AWAITING_DIRECTOR ? 'active' : (['None', 'AWAITING_DISTRICT'].includes(excStatus) ? 'pending' : 'completed'), icon: Shield },
        { id: 'chief', label: 'Chief Retail & SME', desc: 'Strategic Path', state: excStatus === EXCEPTIONAL_STATUS.AWAITING_CHIEF ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR'].includes(excStatus) ? 'pending' : 'completed'), icon: Zap },
        { id: 'div', label: 'Division Manager', desc: 'Resource Allocation', state: excStatus === EXCEPTIONAL_STATUS.AWAITING_DIVISION ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR', 'AWAITING_CHIEF'].includes(excStatus) ? 'pending' : 'completed'), icon: Scale },
        { id: 'super', label: 'Supervisor', desc: 'Operational Audit', state: excStatus === EXCEPTIONAL_STATUS.AWAITING_SUPERVISOR ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR', 'AWAITING_CHIEF', 'AWAITING_DIVISION'].includes(excStatus) ? 'pending' : 'completed'), icon: Gavel },
        { id: 'kyco', label: 'KYC Officer', desc: 'Lifecycle Conclusion', state: excStatus === EXCEPTIONAL_STATUS.COMPLETED ? 'completed' : 'pending', icon: UserCheck }
      ];
    }

    return [
      { id: 'sub', label: 'Submission', desc: 'Case Dispatched', state: 'completed', icon: CheckCircle2 },
      { id: 'review', label: 'Specialist Analysis', desc: 'Technical Review', state: status === KYC_STATUS.SUBMITTED ? 'active' : 'completed', icon: Search },
      { id: 'verdict', label: 'Institutional Verdict', desc: 'Final Assessment', state: status === KYC_STATUS.IN_REVIEW ? 'active' : (isTerminal ? 'completed' : 'pending'), icon: ShieldCheck },
      { id: 'closed', label: 'Case Closed', desc: 'Lifecycle Conclusion', state: isTerminal ? 'completed' : 'pending', icon: Activity }
    ];
  }, [submission, isTerminal]);

  const sortedHistory = useMemo(() => {
    if (!submission?.commentHistory || !Array.isArray(submission.commentHistory)) return [];
    return [...submission.commentHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [submission]);

  if (loading) return <div className="p-12 text-center text-muted-foreground animate-pulse"><Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-primary/5 text-primary"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black font-headline text-slate-900 tracking-tight">{submission.id}</h1>
              <Badge variant="outline" className={cn(
                "font-black px-3 py-1 uppercase text-[10px] tracking-widest",
                submission.status === KYC_STATUS.APPROVED && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                submission.isExceptional && 'bg-yellow-50 text-yellow-700 border-yellow-200'
              )}>
                {submission.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-wider">{submission.customerName} • {submission.branchName}</p>
          </div>
        </div>
      </div>

      <Card className="border-slate-200 shadow-lg overflow-hidden rounded-3xl bg-white">
        <CardContent className="p-8">
          <div className="relative flex flex-col md:flex-row justify-between gap-8 md:gap-0">
            <div className="absolute top-[22px] left-0 right-0 h-0.5 bg-slate-100 hidden md:block" />
            {workflowSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.id} className="relative z-10 flex md:flex-col items-center md:items-center gap-4 md:gap-3 flex-1">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm border-2",
                    step.state === 'completed' && "bg-primary border-primary text-white shadow-primary/20",
                    step.state === 'active' && "bg-white border-primary text-primary animate-pulse shadow-xl",
                    step.state === 'pending' && "bg-slate-50 border-slate-100 text-slate-300"
                  )}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-left md:text-center space-y-0.5 max-w-[120px]">
                    <p className={cn("text-[10px] font-black uppercase tracking-[0.1em] leading-tight", step.state === 'pending' ? "text-slate-400" : "text-primary")}>{step.label}</p>
                    <p className="text-[9px] font-bold text-slate-400">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="bg-primary p-6 border-b flex flex-row items-center justify-between">
              <div className="flex items-center gap-3"><FileText className="w-5 h-5 text-white" /><CardTitle className="text-xl font-black text-white">Documentation</CardTitle></div>
            </CardHeader>
            <CardContent className="pt-6 px-6">
              <div className="grid gap-4">
                {submission.documents?.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-5 border rounded-2xl bg-white shadow-sm border-slate-100 group hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-slate-100 rounded-lg">
                        <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">{doc.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black">{doc.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" asChild className="rounded-full h-10 w-10 text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer"><Eye className="w-5 h-5" /></a>
                      </Button>
                      <Button variant="ghost" size="icon" asChild className="rounded-full h-10 w-10 text-primary hover:bg-primary/5">
                        <a href={doc.url} download={doc.name}><Download className="w-5 h-5" /></a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-3xl bg-white">
            <CardHeader className="bg-primary p-6 border-b"><CardTitle className="text-xl font-black text-white">Verdict History</CardTitle></CardHeader>
            <CardContent className="pt-8 px-8 pb-10">
              {sortedHistory.length > 0 ? (
                <div className="relative space-y-8">
                  <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                  {sortedHistory.map((entry: any, idx: number) => (
                    <div key={idx} className="relative flex gap-6">
                      <div className="z-10 w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center shrink-0"><MessageSquare className="w-5 h-5 text-slate-400" /></div>
                      <div className="flex-1 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                        <div className="flex justify-between mb-2">
                          <span className="text-xs font-black text-slate-900 uppercase">{entry.performedBy} <span className="text-primary">[{entry.role}]</span></span>
                          <span className="text-[10px] font-bold text-slate-400">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium italic">"{entry.comment}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="p-4 bg-slate-50 rounded-full">
                    <History className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No history recorded for this case.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {showChecklist && (
            <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
              <CardHeader className="bg-primary p-5 border-b text-white">
                <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-3"><ClipboardCheck className="w-5 h-5" /><CardTitle className="text-lg font-black uppercase">Protocol</CardTitle></div><span className="text-[10px] font-black">{verifiedCount}/{KYC_CHECKLIST_ITEMS.length}</span></div>
                <Progress value={progressPercentage} className="h-1.5 bg-white/20" />
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {KYC_CHECKLIST_ITEMS.map((item) => (
                  <div key={item.id} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", checklist[item.id] ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100")}>
                    <div className="flex items-center space-x-3"><Checkbox id={item.id} checked={checklist[item.id] || false} onCheckedChange={() => handleChecklistToggle(item.id)} disabled={!isReviewer || isTerminal} /><label htmlFor={item.id} className="text-[11px] font-bold uppercase tracking-tight">{item.label}</label></div>
                    {checklist[item.id] && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] h-4 uppercase font-black">Verified</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!submission.isExceptional && !isTerminal && isReviewer && (
            <Card className="border-primary/20 shadow-2xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="bg-primary text-white border-b py-5"><CardTitle className="text-lg font-black text-white">Technical Verdict</CardTitle></CardHeader>
              <CardContent className="space-y-6 pt-6 px-6 pb-8">
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scenario Library</Label><Select onValueChange={(v) => { setIsCustomRemark(v.includes("other")); setRemarks(v.includes("other") ? "" : v); }}><SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="Select Findings..." /></SelectTrigger><SelectContent>{AMENDMENT_SCENARIOS.map((s, i) => <SelectItem key={i} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Final Determination Remarks</Label><Textarea placeholder="Detail findings..." value={remarks} onChange={(e) => setRemarks(e.target.value)} readOnly={!isCustomRemark} className="min-h-[140px] rounded-2xl bg-slate-50/50 font-medium" /></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button onClick={() => handleAction(KYC_STATUS.APPROVED)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg" disabled={!!isActioning}>Authorize</Button>
                  <Button onClick={() => handleAction(KYC_STATUS.ACTION_REQUIRED)} variant="outline" className="border-orange-600 text-orange-600 font-black h-12 rounded-xl hover:bg-orange-50" disabled={!!isActioning}>Amend</Button>
                  <Button onClick={() => handleAction(KYC_STATUS.ESCALATED)} className="bg-slate-900 hover:bg-black text-white font-black h-12 rounded-xl shadow-lg" disabled={!!isActioning}>Escalate</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
