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
  X
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { getSubmissionById, updateSubmissionStatus, updateSubmissionChecklist, processExceptionalStep, resubmitSubmission } from "@/actions/submissions";
import { deleteInstitutionalFile } from "@/actions/storage";
import { getGlobalSettings } from "@/actions/settings";
import { KYCStatus } from "@prisma/client";
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
import { AMENDMENT_SCENARIOS } from "@/lib/kyc-data";
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

  // Resubmit State
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
    // Strictly gate: creators cannot review their own cases
    if (isCreator) return false;
    return hasPermission('KYC_VERIFY_CHECKLIST') || hasPermission('KYC_APPROVE_STANDARD');
  }, [hasPermission, isSuperAdmin, isCreator]);

  const isTerminal = submission?.status === KYCStatus.APPROVED || submission?.status === KYCStatus.REJECTED;

  const showChecklist = useMemo(() => {
    if (!submission) return false;
    if (submission.isExceptional) {
      return submission.exceptionalStatus === 'COMPLETED' || submission.status === KYCStatus.APPROVED;
    }
    return true;
  }, [submission]);

  const verifiedCount = useMemo(() => {
    if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) return 0;
    return Object.values(checklist).filter(Boolean).length;
  }, [checklist]);

  const progressPercentage = (verifiedCount / KYC_CHECKLIST_ITEMS.length) * 100;

  const handleAction = async (action: KYCStatus) => {
    if (!submission || !user || isTerminal || isActioning) return;

    if ((action === KYCStatus.ACTION_REQUIRED || action === KYCStatus.ESCALATED) && !remarks.trim()) {
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
    if (resubmitFiles.some(f => !f.type)) {
      toast({ variant: "destructive", title: "Type Required", description: "Select classification for all files." });
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

  const handleGovFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ variant: "destructive", title: "File Too Large" });
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({ variant: "destructive", title: "Invalid Type" });
        return;
      }
      setGovMemo(file);
    }
  };

  const handleExceptionalStep = async (nextStatus: string, actionLabel: string) => {
    if (!submission || !user || isActioning) return;

    const needsMemo = ['AWAITING_DISTRICT', 'AWAITING_DIRECTOR', 'AWAITING_CHIEF'].includes(submission.exceptionalStatus);
    if (needsMemo && !govMemo) {
      toast({ variant: "destructive", title: "Memo Required" });
      return;
    }
    
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
    const status = submission.status as KYCStatus;
    const excStatus = submission.exceptionalStatus;
    
    if (submission.isExceptional) {
      return [
        { id: 'sub', label: 'Submission', desc: 'Case Dispatched', state: 'completed', icon: CheckCircle2 },
        { id: 'dist', label: 'District Director', desc: 'Regional Oversight', state: excStatus === 'AWAITING_DISTRICT' ? 'active' : (['None', 'AWAITING_DISTRICT'].includes(excStatus) ? 'pending' : 'completed'), icon: Landmark },
        { id: 'kycdir', label: 'KYC Director', desc: 'Strategic Risk Review', state: excStatus === 'AWAITING_DIRECTOR' ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR'].includes(excStatus) ? 'pending' : 'completed'), icon: Shield },
        { id: 'chief', label: 'Chief Retail & SME', desc: 'Strategic Path', state: excStatus === 'AWAITING_CHIEF' ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR', 'AWAITING_CHIEF'].includes(excStatus) ? 'pending' : 'completed'), icon: Zap },
        { id: 'div', label: 'Division Manager', desc: 'Resource Allocation', state: excStatus === 'AWAITING_DIVISION' ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR', 'AWAITING_CHIEF', 'AWAITING_DIVISION'].includes(excStatus) ? 'pending' : 'completed'), icon: Scale },
        { id: 'super', label: 'Supervisor', desc: 'Operational Audit', state: excStatus === 'AWAITING_SUPERVISOR' ? 'active' : (['None', 'AWAITING_DISTRICT', 'AWAITING_DIRECTOR', 'AWAITING_CHIEF', 'AWAITING_DIVISION', 'AWAITING_SUPERVISOR'].includes(excStatus) ? 'pending' : 'completed'), icon: Gavel },
        { id: 'kyco', label: 'KYC Officer', desc: 'Lifecycle Conclusion', state: excStatus === 'COMPLETED' ? 'completed' : 'pending', icon: UserCheck }
      ];
    }

    return [
      { id: 'sub', label: 'Submission', desc: 'Case Dispatched', state: 'completed', icon: CheckCircle2 },
      { id: 'review', label: 'Specialist Analysis', desc: 'Technical Review', state: status === KYCStatus.SUBMITTED ? 'active' : 'completed', icon: Search },
      { id: 'verdict', label: 'Institutional Verdict', desc: 'Final Assessment', state: status === KYCStatus.IN_REVIEW ? 'active' : (isTerminal ? 'completed' : 'pending'), icon: ShieldCheck },
      { id: 'closed', label: 'Case Closed', desc: 'Lifecycle Conclusion', state: isTerminal ? 'completed' : 'pending', icon: Activity }
    ];
  }, [submission, isTerminal]);

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
                submission.status === KYCStatus.APPROVED && 'bg-emerald-50 text-emerald-700 border-emerald-200',
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
                      <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-primary/5 transition-colors">
                        <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">{doc.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-black">{doc.type}</p>
                          {doc.type === 'GOVERNANCE_MEMO' && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] font-black h-4 px-1.5 uppercase">Authorized Memo</Badge>}
                        </div>
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
              <div className="relative space-y-8">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                {submission.commentHistory?.map((entry: any, idx: number) => (
                  <div key={idx} className="relative flex gap-6">
                    <div className="z-10 w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center shrink-0"><MessageSquare className="w-5 h-5 text-slate-400" /></div>
                    <div className="flex-1 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-black text-slate-900 uppercase">{entry.performedBy} <span className="text-primary">[{entry.role}]</span></span>
                        <div className="flex items-center gap-2">
                          {entry.memoAttached && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] h-4 font-black">MEMO ATTACHED</Badge>}
                          <span className="text-[10px] font-bold text-slate-400">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 font-medium italic">"{entry.comment}"</p>
                    </div>
                  </div>
                ))}
              </div>
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

          {/* BRANCH OFFICER RESUBMIT AREA */}
          {isCreator && submission.status === KYCStatus.ACTION_REQUIRED && (
            <Card className="border-orange-200 shadow-2xl rounded-3xl overflow-hidden bg-orange-50/30 animate-in zoom-in-95 duration-500">
              <CardHeader className="bg-orange-600 text-white p-6 border-b">
                <CardTitle className="text-lg font-black uppercase flex items-center gap-2"><RotateCcw className="w-5 h-5" /> Resubmission Panel</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="p-4 bg-white rounded-xl border border-orange-100 shadow-sm flex gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
                  <p className="text-xs font-bold text-orange-800 leading-relaxed">
                    Review the specialist comments in "Verdict History" and upload the requested assets below to move this case back into analysis.
                  </p>
                </div>

                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Correction Assets</Label>
                  <div 
                    onClick={() => resubmitInputRef.current?.click()}
                    className="border-2 border-dashed border-orange-200 rounded-2xl p-8 text-center cursor-pointer hover:bg-orange-50 transition-all bg-white group"
                  >
                    <Upload className="w-8 h-8 text-orange-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-black text-slate-900">Upload New/Corrected Files</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">PDF or Images (Max 10MB)</p>
                  </div>
                  <input type="file" ref={resubmitInputRef} className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileSelection} />

                  <div className="space-y-2">
                    {resubmitFiles.map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-3 bg-white border rounded-xl shadow-sm">
                        <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-700 flex-1 truncate">{f.file.name}</span>
                        <Select value={f.type} onValueChange={(val) => setResubmitFiles(prev => prev.map(item => item.id === f.id ? {...item, type: val} : item))}>
                          <SelectTrigger className="h-8 w-32 text-[10px] font-black uppercase"><SelectValue placeholder="Type..." /></SelectTrigger>
                          <SelectContent className="text-[10px] font-black uppercase">
                            {settings?.documentTypes?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setResubmitFiles(prev => prev.filter(item => item.id !== f.id))}><X className="w-4 h-4" /></Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Response Note</Label>
                  <Textarea placeholder="Explain the corrections made..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[100px] bg-white rounded-xl" />
                </div>

                <Button 
                  onClick={handleResubmit} 
                  className="w-full h-14 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl shadow-xl shadow-orange-200"
                  disabled={!!isActioning || resubmitFiles.length === 0}
                >
                  {isActioning === 'RESUBMIT' ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Zap className="w-5 h-5 mr-2" />}
                  Dispatch Corrections
                </Button>
              </CardContent>
            </Card>
          )}

          {/* REVIEWER VERDICT AREA */}
          {!submission.isExceptional && !isTerminal && isReviewer && (
            <Card className="border-primary/20 shadow-2xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="bg-primary text-white border-b py-5"><CardTitle className="text-lg font-black text-white">Technical Verdict</CardTitle></CardHeader>
              <CardContent className="space-y-6 pt-6 px-6 pb-8">
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scenario Library</Label><Select onValueChange={(v) => { setIsCustomRemark(v.includes("other")); setRemarks(v.includes("other") ? "" : v); }}><SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="Select Findings..." /></SelectTrigger><SelectContent>{AMENDMENT_SCENARIOS.map((s, i) => <SelectItem key={i} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Final Determination Remarks</Label><Textarea placeholder="Detail findings..." value={remarks} onChange={(e) => setRemarks(e.target.value)} readOnly={!isCustomRemark} className="min-h-[140px] rounded-2xl bg-slate-50/50 font-medium" /></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button onClick={() => handleAction(KYCStatus.APPROVED)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg" disabled={!!isActioning}>Authorize</Button>
                  <Button onClick={() => handleAction(KYCStatus.ACTION_REQUIRED)} variant="outline" className="border-orange-600 text-orange-600 font-black h-12 rounded-xl hover:bg-orange-50" disabled={!!isActioning}>Amend</Button>
                  <Button onClick={() => handleAction(KYCStatus.ESCALATED)} className="bg-slate-900 hover:bg-black text-white font-black h-12 rounded-xl shadow-lg" disabled={!!isActioning}>Escalate</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* EXCEPTIONAL DETERMINATION AREA */}
          {submission.isExceptional && !isTerminal && (
            <Card className="border-primary/20 shadow-2xl rounded-3xl overflow-hidden bg-primary/5">
              <CardHeader className="bg-primary text-white border-b py-5">
                <CardTitle className="text-lg font-black tracking-tight text-white flex items-center gap-2"><Gavel className="w-5 h-5" /> Governance Determination</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verdict Remarks</Label>
                  <Textarea placeholder="Provide justification for governance sign-off..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[100px] bg-white rounded-xl" />
                </div>

                {needsGovMemo && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Authorized Memo (Required)</Label>
                    <div onClick={() => govFileInputRef.current?.click()} className={cn("border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all bg-white group", govMemo ? "border-emerald-200 bg-emerald-50/30" : "border-primary/20 hover:bg-primary/5")}>
                      <Upload className={cn("w-6 h-6 mx-auto mb-2", govMemo ? "text-emerald-600" : "text-primary")} />
                      <p className="text-xs font-black text-slate-900 truncate max-w-full">{govMemo ? govMemo.name : "Select Signature-Authorized PDF/Image"}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">PDF or Image (Max 10MB)</p>
                    </div>
                    <input type="file" ref={govFileInputRef} className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleGovFileChange} />
                  </div>
                )}

                {submission.exceptionalStatus === 'AWAITING_DISTRICT' && hasPermission('REPORT_VIEW_DISTRICT') && (
                  <Button onClick={() => handleExceptionalStep('AWAITING_DIRECTOR', 'District Approve')} className="w-full h-12 bg-primary text-white font-black rounded-xl shadow-lg" disabled={!!isActioning || !govMemo}>Regional Sign-off</Button>
                )}

                {submission.exceptionalStatus === 'AWAITING_DIRECTOR' && isReviewer && (
                  <div className="grid gap-3">
                    <Button onClick={() => handleExceptionalStep('AWAITING_DIVISION', 'Approve & Forward to Division')} className="w-full h-14 bg-primary text-white font-black rounded-xl shadow-xl flex flex-col items-center justify-center leading-none" disabled={!!isActioning}>
                      <span>Approve & Forward to Division</span>
                      <span className="text-[9px] text-white/60 mt-1 uppercase font-bold tracking-widest">Standard Sequential Path</span>
                    </Button>
                    <Button variant="outline" onClick={() => handleExceptionalStep('AWAITING_CHIEF', 'Forward to Chief for High-Risk Review')} className="w-full h-14 border-primary text-primary font-black rounded-xl shadow-md flex flex-col items-center justify-center leading-none hover:bg-primary/5" disabled={!!isActioning || !govMemo}>
                      <span>Forward to Chief for High-Risk Review</span>
                      <span className="text-[9px] text-primary/60 mt-1 uppercase font-bold tracking-widest">Optional Strategic Path</span>
                    </Button>
                  </div>
                )}

                {submission.exceptionalStatus === 'AWAITING_CHIEF' && isSuperAdmin && (
                  <Button onClick={() => handleExceptionalStep('AWAITING_DIRECTOR', 'Chief Review Complete - Return to Director')} className="w-full h-12 bg-slate-900 text-white font-black rounded-xl shadow-lg" disabled={!!isActioning || !govMemo}>Return to KYC Director</Button>
                )}

                {submission.exceptionalStatus === 'AWAITING_DIVISION' && isSuperAdmin && (
                  <Button onClick={() => handleExceptionalStep('AWAITING_SUPERVISOR', 'Division Approve')} className="w-full h-12 bg-primary text-white font-black rounded-xl shadow-lg" disabled={!!isActioning}>Resource Sign-off</Button>
                )}

                {submission.exceptionalStatus === 'AWAITING_SUPERVISOR' && hasPermission('VIEW_SPECIALIST_PRODUCTIVITY') && (
                  <Button onClick={() => handleExceptionalStep('COMPLETED', 'Final Hierarchy Approval')} className="w-full h-12 bg-emerald-600 text-white font-black rounded-xl shadow-lg" disabled={!!isActioning}>Conclude Lifecycle</Button>
                )}

                <Button variant="ghost" onClick={() => handleAction(KYCStatus.REJECTED)} className="w-full text-destructive font-bold text-xs" disabled={!!isActioning}>Reject Entire Process</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={!!fileToPurge} onOpenChange={() => !isPurging && setFileToPurge(null)}>
        <AlertDialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-white">
            <AlertDialogHeader className="p-8 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white rounded-2xl shadow-sm"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                <div className="space-y-1"><AlertDialogTitle className="text-xl font-black text-red-900">Purge Asset</AlertDialogTitle><p className="text-[10px] font-black uppercase text-red-400">Security Warning</p></div>
              </div>
            </AlertDialogHeader>
            <div className="p-8 space-y-4">
              <p className="text-sm font-bold text-slate-700">Permanently delete <span className="text-red-600">"{fileToPurge?.name}"</span> from archive?</p>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3"><RotateCcw className="w-5 h-5 text-slate-400 shrink-0" /><p className="text-xs font-black text-slate-500 uppercase leading-normal">Irreversible action. File will be wiped from storage cluster.</p></div>
            </div>
            <AlertDialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4">
              <AlertDialogCancel disabled={!!isPurging} className="rounded-xl font-bold h-12 px-6">Abort</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleConfirmPurge(); }} disabled={!!isPurging} className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl h-12 px-10 shadow-xl shadow-red-200">{isPurging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />} Purge Asset</AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
