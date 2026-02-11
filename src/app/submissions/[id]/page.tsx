
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
  Info
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection, setDoc, increment, arrayUnion } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { KYCSubmission, Document, ExceptionalStatus } from "@/lib/kyc-data";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

// Predefined Checklist Definitions
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
  ],
  "association": [
    { id: "signatory_id", label: "National ID of signatories", mandatory: true },
    { id: "form", label: "Fully completed account opening application form", mandatory: true },
    { id: "reg_cert", label: "Certificate of registration", mandatory: true },
    { id: "bylaws", label: "Association bylaws", mandatory: true },
    { id: "minutes", label: "Minutes approving account opening", mandatory: true },
    { id: "tin", label: "TIN", mandatory: true },
    { id: "deposit", label: "Initial Deposit", mandatory: true },
    { id: "memo_articles", label: "Memorandum & Articles of Association", mandatory: false },
    { id: "approval_letter", label: "Approval letter from superior authorities", mandatory: false },
  ],
  "foreign_ngo": [
    { id: "form", label: "Fully completed account opening application form", mandatory: true },
    { id: "reg_cert", label: "Registration certificate from Ethiopian authority", mandatory: true },
    { id: "board_res", label: "Board Resolution or POA", mandatory: true },
    { id: "tin", label: "TIN", mandatory: true },
    { id: "deposit", label: "Initial Deposit", mandatory: true },
    { id: "agreement", label: "Agreement with Ethiopian Government", mandatory: false },
    { id: "memo_articles", label: "Memorandum & Articles of Association", mandatory: false },
  ],
  "foreign_employment_agency": [
    { id: "signatory_id", label: "National ID of all signatories", mandatory: true },
    { id: "agency_license", label: "Valid Foreign Employment Agency License", mandatory: true },
    { id: "form", label: "Fully completed account opening application form", mandatory: true },
    { id: "tin", label: "TIN", mandatory: true },
    { id: "deposit", label: "Initial Deposit", mandatory: true },
    { id: "address", label: "Office Address Verification", mandatory: true },
  ]
};

const DEFAULT_DOC_TYPES = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "incorporation", label: "Certificate of Incorporation" },
  { id: "tax_cert", label: "Tax Certificate" },
  { id: "other", label: "Other Document" },
];

interface PreviewDoc {
  id: string;
  name: string;
  type: string;
  url: string;
  isPdf?: boolean;
}

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useAuth();
  
  const [remarks, setRemarks] = useState("");
  const [newFiles, setNewFiles] = useState<{file: File, type: string}[]>([]);
  const [previewFile, setPreviewFile] = useState<PreviewDoc | null>(null);
  
  // Exceptional Request State
  const [isExceptionDialogOpen, setIsExceptionDialogOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [riskJustification, setRiskJustification] = useState("");
  const exceptionMemoInputRef = useRef<HTMLInputElement>(null);
  const correctionInputRef = useRef<HTMLInputElement>(null);
  const [memoFile, setMemoFile] = useState<File | null>(null);

  const submissionRef = useMemoFirebase(() => {
    if (!db || !params.id) return null;
    return doc(db, "submissions", params.id as string);
  }, [db, params.id]);

  const { data: submission, loading: subLoading } = useDoc<KYCSubmission>(submissionRef);

  const settingsRef = useMemoFirebase(() => {
    return db ? doc(db, "settings", "global") : null;
  }, [db]);

  const { data: settings } = useDoc<{ documentTypes: { id: string, label: string }[] }>(settingsRef);

  const documentTypes = useMemo(() => {
    return settings?.documentTypes || DEFAULT_DOC_TYPES;
  }, [settings]);

  const docsQuery = useMemoFirebase(() => {
    if (!submissionRef) return null;
    return collection(submissionRef, "documents");
  }, [submissionRef]);

  const { data: documents } = useCollection<Document>(docsQuery);

  const isAdmin = user.role === 'Admin';
  const isKYCOfficer = user.role === 'KYC Officer';
  const isOwner = submission?.submittedBy === user.name;
  const isBranchMgr = user.role === 'Branch Manager' || isAdmin;

  useEffect(() => {
    const isReviewer = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role || '');
    if (submission && (submission.status === 'Pending') && isReviewer && submissionRef && !submission.isResubmitted && !submission.isExceptional) {
      updateDoc(submissionRef, { status: 'In Review' }).catch(() => {});
    }
  }, [submission, user.role, submissionRef]);

  if (subLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  const handleCorrectionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).map(f => ({ file: f, type: "" }));
      setNewFiles(prev => [...prev, ...files]);
    }
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateNewFileType = (index: number, type: string) => {
    setNewFiles(prev => prev.map((f, i) => i === index ? { ...f, type } : f));
  };

  const handleAction = (action: string) => {
    if (!submissionRef || !db) return;

    if (action === 'Pending' && submission.status === 'Amended' && (isOwner || isAdmin)) {
      if (newFiles.some(f => !f.type)) {
        toast({ variant: "destructive", title: "Classification Required", description: "Select a document type for all uploaded corrections." });
        return;
      }
    }

    if ((action === 'Amended' || action === 'Rejected' || action === 'Escalated') && !remarks.trim() && !isAdmin) {
      toast({ variant: "destructive", title: "Instructions Required", description: `Please provide specific feedback for the ${action}.` });
      return;
    }

    const updateData: any = {
      status: action,
      remarks: remarks || submission.remarks || "", 
    };

    if (action === 'Amended') updateData.amendmentCycles = increment(1);
    
    if (['Approved', 'Amended', 'Rejected', 'Escalated'].includes(action)) {
      updateData.reviewedBy = user.name;
      updateData.reviewedAt = new Date().toISOString();
    }

    if (action === 'Pending' && submission.status === 'Amended' && (isOwner || isAdmin)) {
       updateData.isResubmitted = true;
       updateData.resubmittedAt = new Date().toISOString();
       newFiles.forEach(file => {
         const docRef = doc(collection(submissionRef, "documents"));
         const docData = { id: docRef.id, name: file.file.name, type: file.type, uploadedAt: new Date().toISOString(), url: "#", status: 'Current' };
         setDoc(docRef, docData).catch(async (error) => {
           errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'create', requestResourceData: docData }));
         });
       });
    }

    updateDoc(submissionRef, updateData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: submissionRef.path,
        operation: 'update',
        requestResourceData: updateData
      }));
    });

    toast({ title: "Workflow Updated", description: `Case moved to ${action}.` });
    router.back();
  };

  const handleTriggerExceptional = () => {
    if (!submissionRef || !db || !memoFile) {
      toast({ variant: "destructive", title: "Missing Evidence", description: "The approval memo (PDF) is mandatory for exceptions." });
      return;
    }
    if (!exceptionReason || !riskJustification) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Reason and Risk Justification are mandatory." });
      return;
    }

    const updateData = {
      isExceptional: true,
      exceptionalStatus: 'Awaiting District' as ExceptionalStatus,
      exceptionalData: {
        reason: exceptionReason,
        justification: riskJustification,
        memoUrl: "#", 
        initiatedBy: user.name,
        initiatedAt: new Date().toISOString(),
        approvalHistory: []
      }
    };

    updateDoc(submissionRef, updateData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: submissionRef.path,
        operation: 'update',
        requestResourceData: updateData
      }));
    });
    
    const docRef = doc(collection(submissionRef, "documents"));
    const memoData = {
      id: docRef.id,
      name: `Institutional_Memo_${submission.id}.pdf`,
      type: 'Exceptional Memo',
      uploadedAt: new Date().toISOString(),
      url: "#",
      status: 'Current'
    };
    setDoc(docRef, memoData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'create', requestResourceData: memoData }));
    });

    setIsExceptionDialogOpen(false);
    toast({ title: "Exceptional Request Dispatched", description: "Case forwarded to District Director for initial review." });
  };

  const handleExceptionalApproval = (action: 'Approved' | 'Rejected' | 'Clarification') => {
    if (!submissionRef || !db || !submission.exceptionalData) return;
    if (!remarks.trim() && !isAdmin) {
      toast({ variant: "destructive", title: "Remarks Required", description: "Decision remarks are mandatory for exceptional cases." });
      return;
    }

    const currentStatus = submission.exceptionalStatus;
    let nextStatus: ExceptionalStatus = 'Completed';

    if (action === 'Rejected') {
      nextStatus = 'Rejected';
    } else if (action === 'Clarification') {
      nextStatus = 'Clarification Required';
    } else {
      if (currentStatus === 'Awaiting District') nextStatus = 'Awaiting Director';
      else if (currentStatus === 'Awaiting Director') nextStatus = 'Awaiting Supervisor';
      else if (currentStatus === 'Awaiting Supervisor') nextStatus = 'Completed';
    }

    const approvalNode = {
      role: user.role || "Admin",
      action,
      performedBy: user.name,
      timestamp: new Date().toISOString(),
      remarks
    };

    const updateData: any = {
      exceptionalStatus: nextStatus,
      "exceptionalData.approvalHistory": arrayUnion(approvalNode)
    };

    if (nextStatus === 'Completed') {
      updateData.status = 'Pending'; 
      updateData.isResubmitted = false; 
    }

    updateDoc(submissionRef, updateData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: submissionRef.path,
        operation: 'update',
        requestResourceData: updateData
      }));
    });

    toast({ title: "Exceptional Decision Saved", description: `Workflow status updated to ${nextStatus}.` });
    setRemarks("");
  };

  const handleToggleChecklistItem = (itemId: string, currentStatus: boolean) => {
    const canEdit = isKYCOfficer || isAdmin;
    if (!canEdit || !submissionRef) return;

    const newStatus = !currentStatus;
    const updateData = {
      [`checklistState.${itemId}`]: newStatus
    };

    updateDoc(submissionRef, updateData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: submissionRef.path,
        operation: 'update',
        requestResourceData: updateData
      }));
    });
  };

  const currentChecklist = CHECKLIST_CONFIGS[submission.entityType || "individual"] || CHECKLIST_CONFIGS["individual"];

  const steps = submission.isExceptional 
    ? [
        { title: "Submitted", status: "completed" as const, icon: Check },
        { 
          title: "District Director", 
          status: (['Awaiting Director', 'Awaiting Supervisor', 'Completed'].includes(submission.exceptionalStatus || '')) ? "completed" as const : (submission.exceptionalStatus === 'Awaiting District' ? "active" as const : "upcoming" as const), 
          icon: Zap,
          description: submission.exceptionalStatus === 'Awaiting District' ? "Awaiting Regional Authorization" : undefined
        },
        { 
          title: "KYC Director", 
          status: (['Awaiting Supervisor', 'Completed'].includes(submission.exceptionalStatus || '')) ? "completed" as const : (submission.exceptionalStatus === 'Awaiting Director' ? "active" as const : "upcoming" as const), 
          icon: Shield,
          description: submission.exceptionalStatus === 'Awaiting Director' ? "Strategic Risk Review" : undefined
        },
        { 
          title: "Supervisor", 
          status: (submission.exceptionalStatus === 'Completed') ? "completed" as const : (submission.exceptionalStatus === 'Awaiting Supervisor' ? "active" as const : "upcoming" as const), 
          icon: ShieldCheck,
          description: submission.exceptionalStatus === 'Awaiting Supervisor' ? "Institutional Verification" : undefined
        },
        { 
          title: submission.status === 'Escalated' ? "Senior Escalation" : "Final KYC Verification", 
          status: submission.exceptionalStatus === 'Completed' && (['Pending', 'In Review', 'Amended', 'Escalated'].includes(submission.status)) ? "active" as const : (["Approved", "Rejected"].includes(submission.status) ? "completed" as const : "upcoming" as const), 
          icon: submission.status === 'Escalated' ? AlertTriangle : Search,
          description: submission.status === 'Escalated' 
            ? "High-Priority Specialist Review" 
            : (submission.amendmentCycles && submission.amendmentCycles > 0 
              ? `Cycle ${submission.amendmentCycles} Active` 
              : (submission.status === 'Amended' ? "Awaiting Correction" : undefined))
        }
      ]
    : [
        { title: "Submitted", status: "completed" as const, icon: Check },
        { 
          title: submission.status === 'Escalated' ? "Senior Escalation" : "KYC Verification", 
          status: (["Approved", "Rejected"].includes(submission.status) ? "completed" : "active") as const, 
          icon: submission.status === 'Escalated' ? AlertTriangle : Search,
          description: submission.status === 'Escalated' 
            ? "High-Priority Specialist Review" 
            : (submission.amendmentCycles && submission.amendmentCycles > 0 
              ? `Cycle ${submission.amendmentCycles} Active` 
              : (submission.status === 'Amended' ? "Correction Required" : "Institutional analysis in progress"))
        },
        { 
          title: "Final Decision", 
          status: (["Approved", "Rejected"].includes(submission.status) ? "completed" : "upcoming") as const, 
          icon: ShieldCheck,
          description: submission.status === 'Approved' ? "Verification Authorized" : submission.status === 'Rejected' ? "Verification Declined" : undefined
        }
      ];

  const currentExceptionalRole = 
    submission.exceptionalStatus === 'Awaiting District' ? 'District Director' :
    submission.exceptionalStatus === 'Awaiting Director' ? 'Director' :
    submission.exceptionalStatus === 'Awaiting Supervisor' ? 'Supervisor' : null;

  const isCurrentExceptionalApprover = user.role === currentExceptionalRole || isAdmin;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold font-headline">{submission.id}</h1>
              <Badge variant={submission.status === 'Approved' ? 'default' : 'outline'} className={cn(
                submission.status === 'Approved' && 'bg-emerald-100 text-emerald-800',
                submission.status === 'Amended' && 'bg-orange-100 text-orange-800', 
                submission.isExceptional && submission.exceptionalStatus !== 'Completed' && 'bg-yellow-100 text-yellow-800 border-yellow-200'
              )}>
                {submission.isExceptional && submission.exceptionalStatus !== 'Completed' ? `Exception: ${submission.exceptionalStatus}` : submission.status}
              </Badge>
            </div>
            <p className="text-muted-foreground font-medium">{submission.customerName} • {submission.branch} Branch</p>
          </div>
        </div>
        <div className="flex gap-2">
           {isBranchMgr && !submission.isExceptional && (
             <Button className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold" onClick={() => setIsExceptionDialogOpen(true)}>
               <Zap className="w-4 h-4 mr-2" /> Trigger Exception
             </Button>
           )}
           <Button variant="outline" size="sm" className="shadow-sm border-slate-200 bg-white font-bold px-4 h-10" onClick={() => toast({ title: "Generating Bundle..." })}>
            <Archive className="w-4 h-4 mr-2" /> Download Case Bundle
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {submission.isExceptional && (
            <Alert className="bg-yellow-50 border-yellow-200 text-yellow-900 shadow-sm">
              <Zap className="h-5 w-5 text-yellow-600" />
              <AlertTitle className="font-bold">Exceptional KYC Active</AlertTitle>
              <AlertDescription className="font-medium space-y-2">
                <p>Reason: <span className="font-bold">{submission.exceptionalData?.reason}</span></p>
                <p className="italic">"{submission.exceptionalData?.justification}"</p>
              </AlertDescription>
            </Alert>
          )}

          {submission.isExceptional && submission.exceptionalStatus !== 'Completed' && isCurrentExceptionalApprover && (
            <Card className="border-yellow-600 shadow-xl overflow-hidden bg-yellow-50/10 animate-in zoom-in-95 duration-300">
              <CardHeader className="bg-yellow-600 text-white">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Shield className="w-5 h-5" /> 
                  Institutional Review: {isAdmin ? `${currentExceptionalRole} (via Admin Override)` : user.role}
                </CardTitle>
                <CardDescription className="text-yellow-100 font-medium">Please provide your determination for this exceptional request.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <Label className="font-bold text-slate-700">Decision Remarks (Mandatory)</Label>
                <Textarea 
                  placeholder="Provide detailed approval/rejection notes for the audit trail..." 
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="min-h-[120px] bg-white border-yellow-200 focus:ring-yellow-600"
                />
                <div className="grid grid-cols-3 gap-3">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold h-12" onClick={() => handleExceptionalApproval('Approved')}>
                    Approve Level
                  </Button>
                  <Button variant="outline" className="text-orange-600 border-orange-600 bg-white font-bold h-12" onClick={() => handleExceptionalApproval('Clarification')}>
                    Request Info
                  </Button>
                  <Button variant="destructive" className="font-bold h-12" onClick={() => handleExceptionalApproval('Rejected')}>
                    Reject Exception
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Verification Assets
              </CardTitle>
              <Badge variant="outline" className="bg-white font-bold text-slate-500 uppercase text-[10px] tracking-widest">
                {documents?.length || 0} Files Attached
              </Badge>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              {/* Document List */}
              <div className="space-y-4">
                {documents?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50 transition-all group border-slate-200 bg-white">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-2 rounded-lg",
                          doc.type === 'Exceptional Memo' ? "bg-yellow-100 text-yellow-700" : "bg-primary/10 text-primary"
                        )}>
                          {doc.type === 'Exceptional Memo' ? <Zap className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{doc.name}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            {doc.type.replace('_', ' ')} • {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" onClick={() => setPreviewFile({ id: doc.id, name: doc.name, type: doc.type, url: doc.url === '#' ? 'https://picsum.photos/seed/doc/1200/1600' : doc.url, isPdf: doc.name.toLowerCase().endsWith('.pdf') })} className="rounded-full text-slate-500 hover:text-primary"><Eye className="w-4 h-4" /></Button>
                         <Button variant="ghost" size="icon" asChild className="rounded-full text-slate-500 hover:text-primary">
                           <a href={doc.url === '#' ? '#' : doc.url} download={doc.name}><Download className="w-4 h-4" /></a>
                         </Button>
                      </div>
                    </div>
                ))}
              </div>

              {/* Dynamic KYC Checklist */}
              <div className="space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <ClipboardCheck className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                    Verification Checklist: {submission.entityType?.replace(/_/g, ' ') || "Individual"}
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                  {currentChecklist.map((item) => {
                    const isVerified = submission.checklistState?.[item.id] || false;
                    const canEditChecklist = isKYCOfficer || isAdmin;
                    
                    return (
                      <div 
                        key={item.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-all",
                          isVerified ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50/50 border-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded flex items-center justify-center border",
                            isVerified ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-200"
                          )}>
                            {isVerified && <Check className="w-3 h-3" />}
                          </div>
                          <span className={cn(
                            "text-sm font-bold",
                            isVerified ? "text-emerald-900" : "text-slate-700"
                          )}>
                            {item.label} {item.mandatory && <span className="text-destructive">*</span>}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={!canEditChecklist}
                            onClick={() => handleToggleChecklistItem(item.id, isVerified)}
                            className={cn(
                              "h-8 font-black text-xs px-3 rounded-full transition-all",
                              isVerified 
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                                : "bg-white border border-slate-200 text-slate-400 hover:bg-slate-50"
                            )}
                          >
                            {isVerified ? "✔ VERIFIED" : "✖ NOT VERIFIED"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {submission.entityType === 'foreign_ngo' && (
                  <Alert className="bg-blue-50 border-blue-100 py-2">
                    <AlertCircle className="w-4 h-4 text-blue-600" />
                    <AlertDescription className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">
                      Special Rule: National ID not mandatory until enforced by NBE schedule for foreign NGOs.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {submission.isExceptional && submission.exceptionalData?.approvalHistory && submission.exceptionalData.approvalHistory.length > 0 && (
            <Card className="shadow-sm border-slate-200">
              <CardHeader><CardTitle className="text-xl">Exception Audit Trail</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {submission.exceptionalData.approvalHistory.map((step, idx) => (
                  <div key={idx} className="flex gap-4 items-start border-l-2 border-slate-100 pl-4 pb-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      {step.action === 'Approved' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{step.role}: {step.action}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(step.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-600 italic">"{step.remarks}"</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">BY: {step.performedBy}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b py-6 px-8"><CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-widest">Case Lifecycle</CardTitle></CardHeader>
            <CardContent className="pt-8 pb-10 px-8">
              <div className="relative space-y-10">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                {steps.map((step, idx) => {
                  const Icon = step.icon;
                  return (
                    <div key={idx} className="relative flex gap-6 group">
                      <div className={cn(
                        "z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                        step.status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" :
                        step.status === "active" ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-300"
                      )}><Icon className={cn("w-5 h-5", step.status === "active" && "animate-pulse")} /></div>
                      <div className="space-y-1.5 pt-0.5">
                        <p className={cn("text-base font-bold", step.status === "upcoming" ? "text-slate-300" : "text-slate-900")}>{step.title}</p>
                        {step.description && (
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary/70 animate-in fade-in slide-in-from-left-1 duration-500">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Amendment Response Workspace */}
          {(isOwner || isAdmin) && submission.status === 'Amended' && (
            <Card className="border-orange-200 shadow-xl bg-orange-50/5 animate-in slide-in-from-right-4 duration-500">
              <CardHeader className="bg-orange-100/50 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-orange-600" />
                  Correction Workspace
                </CardTitle>
                <CardDescription className="text-orange-800 font-medium">Provide requested documentation to resolve verify requirements.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="p-4 rounded-xl bg-white border border-orange-200 shadow-sm">
                  <Label className="text-[10px] font-black uppercase text-orange-800 tracking-widest mb-2 block">Institutional Feedback</Label>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed italic">"{submission.remarks}"</p>
                </div>

                <div className="space-y-4">
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={correctionInputRef} 
                    multiple 
                    onChange={handleCorrectionFileChange} 
                  />
                  <div 
                    onClick={() => correctionInputRef.current?.click()}
                    className="border-2 border-dashed border-orange-300 rounded-2xl p-8 text-center cursor-pointer hover:bg-orange-50 transition-all group bg-white shadow-sm"
                  >
                    <div className="bg-orange-100 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="w-5 h-5 text-orange-600" />
                    </div>
                    <p className="text-xs font-bold text-orange-900">Attach Corrected Files</p>
                    <p className="text-[9px] text-orange-600 uppercase font-black mt-1">Accepts PDF & Images</p>
                  </div>

                  <div className="space-y-2">
                    {newFiles.map((f, idx) => (
                      <div key={idx} className="p-3 border rounded-xl bg-white shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-[11px] font-bold truncate text-slate-700">{f.file.name}</span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive rounded-full" onClick={() => removeNewFile(idx)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                        <Select value={f.type} onValueChange={(val) => updateNewFileType(idx, val)}>
                          <SelectTrigger className="h-9 text-[10px] border-orange-100 bg-orange-50/30">
                            <SelectValue placeholder="Categorize File..." />
                          </SelectTrigger>
                          <SelectContent>
                            {documentTypes.map(t => <SelectItem key={t.id} value={t.id} className="text-xs font-bold">{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t p-6">
                <Button 
                  className="w-full bg-orange-600 hover:bg-orange-700 font-black h-12 shadow-xl shadow-orange-200"
                  onClick={() => handleAction('Pending')}
                  disabled={newFiles.length === 0}
                >
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Submit Corrections
                </Button>
              </CardFooter>
            </Card>
          )}

          {(isKYCOfficer || isAdmin) && (submission.status === 'Pending' || submission.status === 'In Review' || submission.status === 'Escalated' || submission.status === 'Amended' || isAdmin) && (!submission.isExceptional || submission.exceptionalStatus === 'Completed' || isAdmin) && (
            <Card className="border-primary/20 shadow-xl">
              <CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-lg">KYC Determination</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Decision Remarks</Label>
                <Textarea placeholder="Provide verification feedback for the audit trail..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[140px] bg-white" />
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleAction('Approved')} className="bg-[#4CAF50] hover:bg-[#43A047] font-bold h-11">Approve</Button>
                  <Button onClick={() => handleAction('Amended')} variant="outline" className="text-[#E67E22] font-bold h-11">Request Fix</Button>
                  <Button onClick={() => handleAction('Escalated')} variant="outline" className="text-[#8B5CF6] border-[#8B5CF6] font-bold h-11">Escalate</Button>
                  <Button onClick={() => handleAction('Rejected')} variant="destructive" className="font-bold h-11">Reject</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Exceptional Initiation Dialog */}
      <Dialog open={isExceptionDialogOpen} onOpenChange={setIsExceptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-yellow-600" /> Initiate Exceptional Request</DialogTitle>
            <DialogDescription>Forward this case for regional and strategic approval hierarchy oversight.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason for Exception</Label>
              <Select value={exceptionReason} onValueChange={setExceptionReason}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select primary reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Missing critical documents">Missing critical documents</SelectItem>
                  <SelectItem value="High deposit amount">High deposit amount</SelectItem>
                  <SelectItem value="High-risk profile">High-risk profile</SelectItem>
                  <SelectItem value="Case aging beyond SLA">Case aging beyond SLA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Risk Justification</Label>
              <Textarea 
                placeholder="Explain why this exception is justified..." 
                className="min-h-[120px]" 
                value={riskJustification}
                onChange={(e) => setRiskJustification(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supporting Memo (PDF Only)</Label>
              <div 
                onClick={() => exceptionMemoInputRef.current?.click()}
                className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center cursor-pointer hover:bg-primary/5 transition-all group bg-white shadow-sm"
              >
                <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-bold text-slate-900">{memoFile ? memoFile.name : "Select Institutional Memo"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Accepts only .pdf files</p>
              </div>
              <input 
                type="file" 
                ref={exceptionMemoInputRef} 
                className="hidden" 
                accept="application/pdf" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type !== 'application/pdf') {
                    toast({ variant: 'destructive', title: 'Invalid File', description: 'Please upload a PDF document only.' });
                    return;
                  }
                  setMemoFile(file || null);
                }} 
              />
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsExceptionDialogOpen(false)}>Cancel</Button>
            <Button 
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold px-8 h-11" 
              onClick={handleTriggerExceptional}
              disabled={!exceptionReason || !riskJustification || !memoFile}
            >
              Dispatch Exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] overflow-hidden flex flex-col p-0 border-none bg-[#1a1a1a]">
          <DialogHeader className="p-4 bg-[#242424] text-white flex flex-row items-center justify-between border-b border-white/5 pr-14">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg"><FileText className="w-5 h-5 text-primary" /></div>
              <div className="flex flex-col">
                <DialogTitle className="text-base font-bold">{previewFile?.name}</DialogTitle>
                <DialogDescription className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-0.5">Document Inspection</DialogDescription>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-9 font-bold px-4">
              <a href={previewFile?.url} download={previewFile?.name}><Download className="w-4 h-4 mr-2" /> Download Original</a>
            </Button>
          </DialogHeader>
          <div className="flex-1 bg-[#121212] overflow-hidden flex flex-col">
            {previewFile?.isPdf ? (
              <iframe src={`${previewFile.url}#toolbar=1`} className="w-full h-full border-none" title="PDF Preview" />
            ) : (
              <div className="w-full h-full overflow-auto flex items-center justify-center p-8">
                <img src={previewFile?.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-sm" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
