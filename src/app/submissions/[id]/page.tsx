
"use client"

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Clock, 
  User, 
  History, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Download,
  ExternalLink,
  MessageSquare,
  Upload,
  FilePlus,
  X,
  ShieldAlert,
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Check,
  Search,
  Flag,
  Eye,
  Loader2,
  Archive,
  Zap,
  Shield,
  ArrowRight,
  FileType,
  ClipboardCheck,
  CheckCircle2,
  Info,
  ChevronRight,
  TrendingUp,
  ListFilter,
  MapPin,
  FileArchive,
  Building2,
  Calendar,
  Layers,
  UserCheck,
  MessagesSquare,
  Globe,
  RotateCcw
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { getSubmissionById, updateSubmissionStatus } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { SubmissionStatus, UserRole } from "@prisma/client";
import { AMENDMENT_SCENARIOS } from "@/lib/kyc-data";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { format } from "date-fns";
import JSZip from 'jszip';

const CHECKLIST_CONFIGS: Record<string, { id: string; label: string; mandatory: boolean }[]> = {
  "individual": [
    { id: "id", label: "National ID", mandatory: true },
    { id: "form", label: "Fully completed account opening application form", mandatory: true },
    { id: "name", label: "Full Name", mandatory: true },
    { id: "dob", label: "Date of Birth", mandatory: true },
    { id: "address", label: "Residential Address", mandatory: true },
    { id: "phone", label: "Phone Number", mandatory: true },
    { id: "deposit", label: "Initial Deposit", mandatory: true },
    { id: "signature", label: "Customer Signature", mandatory: true },
    { id: "tin", label: "TIN (if applicable)", mandatory: false },
  ],
  "company": [
    { id: "signatory_id", label: "National ID of all signatories", mandatory: true },
    { id: "form", label: "Fully completed account opening application form", mandatory: true },
    { id: "trade_license", label: "Valid & renewed trade license", mandatory: true },
    { id: "tin", label: "TIN", mandatory: true },
    { id: "memo_articles", label: "Authenticated Memorandum & Articles of Association", mandatory: true },
    { id: "address", label: "Company Address", mandatory: true },
    { id: "phone", label: "Company Phone Number", mandatory: true },
    { id: "deposit", label: "Initial Deposit", mandatory: true },
    { id: "board_res", label: "Board resolution authorizing account opening", mandatory: false },
  ]
};

const DEFAULT_DOC_TYPES = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "other", label: "Other Document" },
];

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [submission, setSubmission] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [remarks, setRemarks] = useState("");
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [otherScenarioText, setOtherScenarioText] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [newFiles, setNewFiles] = useState<{file: File, type: string}[]>([]);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isActioning, setIsActioning] = useState<string | null>(null);
  
  const [isExceptionDialogOpen, setIsExceptionDialogOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [riskJustification, setRiskJustification] = useState("");
  const [memoFile, setMemoFile] = useState<File | null>(null);
  
  const exceptionMemoInputRef = useRef<HTMLInputElement>(null);
  const correctionInputRef = useRef<HTMLInputElement>(null);
  const decisionMemoInputRef = useRef<HTMLInputElement>(null);
  const [decisionMemoFile, setDecisionMemoFile] = useState<File | null>(null);

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

  const documentTypes = useMemo(() => {
    return settings?.documentTypes || DEFAULT_DOC_TYPES;
  }, [settings]);

  const currentChecklist = useMemo(() => {
    return CHECKLIST_CONFIGS[submission?.entityType || "individual"] || CHECKLIST_CONFIGS["individual"];
  }, [submission?.entityType]);

  const isAdmin = user?.role === UserRole.ADMIN;
  const isKYCOfficer = user?.role === UserRole.KYC_OFFICER; 
  const isReviewer = [UserRole.KYC_OFFICER, UserRole.SUPERVISOR, UserRole.ADMIN].includes(user?.role as UserRole);
  const isSeniorReviewer = [UserRole.SUPERVISOR, UserRole.ADMIN].includes(user?.role as UserRole);
  const isOwner = submission?.submittedBy?.id === user?.id;

  const isTerminal = submission?.status === SubmissionStatus.APPROVED || submission?.status === SubmissionStatus.REJECTED;

  const handleAction = async (action: SubmissionStatus) => {
    if (!submission || !user || isTerminal || isActioning) return;

    setIsActioning(action);
    try {
      await updateSubmissionStatus(submission.id, action, user.id, remarks);
      toast({ title: "Workflow Updated", description: `Case moved to ${action}.` });
      
      // Reload submission
      const updated = await getSubmissionById(submission.id);
      setSubmission(updated);
      setRemarks("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    } finally {
      setIsActioning(null);
    }
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

  if (loading) return <div className="p-12 text-center text-muted-foreground animate-pulse"><Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  const steps = [
    { title: "Submitted", status: "completed" as const, icon: Check },
    { title: "KYC Verification", status: (isTerminal ? "completed" : "active") as const, icon: Search },
    { title: "Final Decision", status: (isTerminal ? "completed" : "upcoming") as const, icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold font-headline">{submission.id}</h1>
              <Badge variant="outline" className={cn(
                submission.status === SubmissionStatus.APPROVED && 'bg-emerald-100 text-emerald-800 border-emerald-200',
                submission.status === SubmissionStatus.AMENDED && 'bg-orange-100 text-orange-800 border-orange-200', 
              )}>
                {submission.status}
              </Badge>
            </div>
            <p className="text-muted-foreground font-medium">{submission.customerName} • {submission.branchName} Node</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button className="bg-primary hover:bg-primary/90 text-white font-bold px-6 shadow-lg h-10" onClick={handleDownloadBundle} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileArchive className="w-4 h-4 mr-2" />}
            Download Bundle
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50">
              <CardTitle className="text-xl flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Case Documents</CardTitle>
              <Badge variant="outline" className="bg-white font-bold text-slate-500 uppercase text-[10px] tracking-widest">{submission.documents?.length || 0} Files</Badge>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              <div className="grid gap-4">
                {submission.documents?.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/30 transition-all group border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{doc.name}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{doc.type}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" onClick={() => setPreviewFile({ name: doc.name, url: doc.url })} className="rounded-full"><Eye className="w-4 h-4" /></Button>
                      </div>
                    </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2"><MessagesSquare className="w-5 h-5 text-primary" /> Audit History</CardTitle>
            </CardHeader>
            <CardContent className="pt-8 px-8">
              <div className="relative space-y-8">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                {submission.commentHistory && submission.commentHistory.length > 0 ? (
                  (submission.commentHistory as any[]).map((entry, idx) => (
                    <div key={idx} className="relative flex gap-6">
                      <div className="z-10 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                        <MessageSquare className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="flex-1 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-black text-slate-900">{entry.performedBy} ({entry.role})</span>
                          <span className="text-[10px] font-bold text-slate-400">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-700">{entry.comment}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-muted-foreground italic">No historical comments.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-primary/20 bg-primary/5 overflow-hidden sticky top-24">
            <CardHeader className="bg-primary/10 border-b border-primary/10 py-4">
              <CardTitle className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2"><MapPin className="w-4 h-4" /> Details</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Customer</p>
                  <p className="font-black text-slate-900">{submission.customerName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Branch</p>
                  <p className="font-black text-slate-900">{submission.branchName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Submitted By</p>
                  <p className="font-black text-slate-900">{submission.submittedBy?.name}</p>
                </div>
            </CardContent>
          </Card>

          {!isTerminal && isReviewer && (
            <Card className="border-primary/20 shadow-xl">
              <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-lg font-bold">KYC Determination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Decision Remarks</Label>
                  <Textarea placeholder="Instructions for branch..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[120px]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleAction(SubmissionStatus.APPROVED)} className="bg-emerald-600 hover:bg-emerald-700 font-bold" disabled={!!isActioning}>
                    Approve
                  </Button>
                  <Button onClick={() => handleAction(SubmissionStatus.AMENDED)} variant="outline" className="text-orange-600 border-orange-200 font-bold" disabled={!!isActioning}>
                    Request Fix
                  </Button>
                  <Button onClick={() => handleAction(SubmissionStatus.REJECTED)} variant="destructive" className="font-bold col-span-2" disabled={!!isActioning}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] overflow-hidden flex flex-col p-0 border-none bg-[#1a1a1a]">
          <DialogHeader className="p-4 bg-[#242424] text-white flex flex-row items-center justify-between border-b border-white/5 pr-14">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg"><FileText className="w-5 h-5 text-primary" /></div>
              <DialogTitle className="text-base font-bold">{previewFile?.name}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-[#121212] overflow-hidden flex items-center justify-center text-white">
            <p>Preview functionality limited in Pure SQL mode. Use "Download Bundle" for full access.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
