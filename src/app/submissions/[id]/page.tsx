
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
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection, setDoc, increment, arrayUnion, query, orderBy, limit } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { KYCSubmission, Document, ExceptionalStatus, AMENDMENT_SCENARIOS, BundleDownloadLog, CommentHistoryEntry } from "@/lib/kyc-data";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [otherScenarioText, setOtherScenarioText] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [newFiles, setNewFiles] = useState<{file: File, type: string}[]>([]);
  const [previewFile, setPreviewFile] = useState<PreviewDoc | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Exceptional Request State
  const [isExceptionDialogOpen, setIsExceptionDialogOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [riskJustification, setRiskJustification] = useState("");
  const exceptionMemoInputRef = useRef<HTMLInputElement>(null);
  const correctionInputRef = useRef<HTMLInputElement>(null);
  const decisionMemoInputRef = useRef<HTMLInputElement>(null);
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [decisionMemoFile, setDecisionMemoFile] = useState<File | null>(null);

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

  const currentChecklist = useMemo(() => {
    return CHECKLIST_CONFIGS[submission?.entityType || "individual"] || CHECKLIST_CONFIGS["individual"];
  }, [submission?.entityType]);

  const docsQuery = useMemoFirebase(() => {
    if (!submissionRef) return null;
    return collection(submissionRef, "documents");
  }, [submissionRef]);

  const { data: documents } = useCollection<Document>(docsQuery);

  const isAdmin = user?.role === 'Admin';
  const isKYCOfficer = user?.role === 'KYC Officer'; 
  const isReviewer = ['KYC Officer', 'Supervisor', 'Branch Banking Director', 'Admin', 'Division Manager', 'Chief Retail & SME Banking Officer', 'Branch Manager', 'District Director', 'Chief'].includes(user?.role || '');
  const isSeniorReviewer = ['Supervisor', 'Branch Banking Director', 'Admin', 'Division Manager', 'Chief Retail & SME Banking Officer', 'District Director', 'Chief'].includes(user?.role || '');
  const isOwner = submission?.submittedBy === user?.name;
  const isBranchMgr = user?.role === 'Branch Manager' || isAdmin;

  const isTerminal = submission?.status === 'Approved' || submission?.status === 'Rejected';

  useEffect(() => {
    if (submission && (submission.status === 'Pending') && isReviewer && submissionRef && !submission.isResubmitted && !submission.isExceptional) {
      updateDoc(submissionRef, { status: 'In Review' }).catch(() => {});
    }
  }, [submission, isReviewer, submissionRef]);

  const handleScenarioChange = (val: string) => {
    setSelectedScenario(val);
    if (val && val !== "19. Other (specify)") {
      setRemarks(prev => {
        // If remarks already contains a finding, we replace it or append smartly
        // For this institutional implementation, we'll keep the remarks field for details
        // and handle the scenario as a headline in handleAction
        return prev;
      });
      setOtherScenarioText("");
    } else if (val === "19. Other (specify)") {
      // Clear specific text if switched to other
      setOtherScenarioText("");
    }
  };

  const handleClearScenario = () => {
    setSelectedScenario("");
    setOtherScenarioText("");
  };

  const handleOtherScenarioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setOtherScenarioText(text);
  };

  const handleSelectAllChecklist = (value: boolean) => {
    if (!submissionRef || (!isKYCOfficer && !isAdmin) || isTerminal) return;

    const newState: Record<string, boolean> = {};
    currentChecklist.forEach(item => {
      newState[item.id] = value;
    });

    const updateData = {
      checklistState: newState
    };

    updateDoc(submissionRef, updateData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: submissionRef.path,
        operation: 'update',
        requestResourceData: updateData
      }));
    });
    
    toast({
      title: value ? "All Items Verified" : "Checklist Reset",
      description: value ? "All items have been marked as verified." : "Verification status has been cleared for all items."
    });
  };

  const handleDownloadBundle = async () => {
    if (!submission || !db || !submissionRef || !user) return;
    setIsDownloading(true);

    try {
      const zip = new JSZip();
      
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const districtName = submission.district.replace(/\s+/g, '_');
      const branchName = submission.branch.replace(/\s+/g, '_');
      const bundleName = `${districtName}_${branchName}_${timestamp}`;

      const manifest = `Nib Bank KYC Bundle
Generated: ${now.toLocaleString()}
Case ID: ${submission.id}
Customer: ${submission.customerName}
Classification: ${submission.entityType?.replace(/_/g, ' ') || 'Individual'}
Source: ${submission.district} District / ${submission.branch} Branch
Officer: ${submission.submittedBy}
Total Files: ${documents?.length || 0}

--- DOCUMENT INVENTORY ---
${documents?.map(d => `- [${d.type.toUpperCase()}] ${d.name} (${new Date(d.uploadedAt).toLocaleDateString()})`).join('\n') || 'No documents discovered.'}
`;
      zip.file("nib_bank_manifest.txt", manifest);

      if (documents && documents.length > 0) {
        const docFolder = zip.folder("case_assets");
        for (const docObj of documents) {
          try {
            const sourceUrl = docObj.url === '#' 
              ? (docObj.name.toLowerCase().endsWith('.pdf') 
                  ? 'https://placehold.co/1200x1600/png?text=Institutional+PDF+Content' 
                  : `https://picsum.photos/seed/${docObj.id}/1200/1600`)
              : docObj.url;

            const response = await fetch(sourceUrl);
            const blob = await response.blob();
            docFolder?.file(docObj.name, blob);
          } catch (err) {
            console.error(`Fetch failed for ${docObj.name}:`, err);
            docFolder?.file(`${docObj.name}_ERROR.txt`, `Institutional error: Source file could not be retrieved from ${docObj.url}`);
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${bundleName}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);

      const logRef = doc(collection(submissionRef, "bundle_downloads"));
      setDoc(logRef, {
        id: logRef.id,
        performedBy: user.name,
        timestamp: now.toISOString(),
        bundleName: bundleName,
        sourceDistrict: submission.district,
        sourceBranch: submission.branch
      }).catch(() => {});

      toast({
        title: "Bundle Download Complete",
        description: `Nib Bank archive ${bundleName} contains ${documents?.length || 0} files.`,
      });
    } catch (error) {
      console.error("Bundle generation failed:", error);
      toast({
        variant: "destructive",
        title: "Archive Error",
        description: "An error occurred during bundle compilation."
      });
    } finally {
      setIsDownloading(false);
    }
  };

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
    if (!submissionRef || !db || !user || isTerminal) return;

    // INCONSISTENCY GUARD: Prevent Approval if an amendment scenario is selected
    if (action === 'Approved' && selectedScenario) {
      toast({ 
        variant: "destructive", 
        title: "Workflow Conflict", 
        description: "You cannot approve a case with active findings. Please clear the selection or 'Request Fix'." 
      });
      return;
    }

    if (action === 'Pending' && submission.status === 'Amended' && (isOwner || isAdmin)) {
      if (newFiles.some(f => !f.type)) {
        toast({ variant: "destructive", title: "Classification Required", description: "Select a document type for all uploaded corrections." });
        return;
      }
      if (newFiles.length === 0 && !correctionNote.trim()) {
        toast({ variant: "destructive", title: "Response Required", description: "Please provide either a response note or a supporting file." });
        return;
      }
    }

    if ((action === 'Amended' || action === 'Rejected' || action === 'Escalated') && !remarks.trim() && !isAdmin) {
      toast({ variant: "destructive", title: "Instructions Required", description: `Please provide specific feedback for the ${action}.` });
      return;
    }

    const now = new Date().toISOString();
    
    let finalComment = remarks;
    
    // Institutional Formatting for saved history
    if (selectedScenario) {
      const headline = selectedScenario === "19. Other (specify)" ? otherScenarioText : selectedScenario;
      finalComment = `[FINDING] ${headline}${remarks ? `\n\n[DETAILS] ${remarks}` : ''}`;
    }

    if (!finalComment.trim()) {
      if (action === 'Approved') finalComment = "Case verified and approved institutional standards.";
      else if (action === 'Pending') finalComment = correctionNote || "Documents resubmitted for review.";
      else finalComment = `Workflow action: ${action}`;
    }

    const historyEntry: CommentHistoryEntry = {
      role: user.role || 'Bank User',
      performedBy: user.name,
      timestamp: now,
      comment: finalComment,
      action: action
    };

    const updateData: any = {
      status: action,
      remarks: action === 'Approved' ? "" : (remarks || ""), 
      commentHistory: arrayUnion(historyEntry)
    };

    if (action === 'Amended') updateData.amendmentCycles = increment(1);
    
    if (['Approved', 'Amended', 'Rejected', 'Escalated'].includes(action)) {
      updateData.reviewedBy = user.name;
      updateData.reviewedAt = now;
    }

    if (action === 'Pending' && submission.status === 'Amended' && (isOwner || isAdmin)) {
       updateData.isResubmitted = true;
       updateData.resubmittedAt = now;
       newFiles.forEach(file => {
         const docRef = doc(collection(submissionRef, "documents"));
         const docData = { id: docRef.id, name: file.file.name, type: file.type, uploadedAt: new Date().toISOString(), url: "#", status: 'Current' };
         setDoc(docRef, docData).catch(() => {});
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
    setRemarks("");
    setSelectedScenario("");
    setOtherScenarioText("");
    setCorrectionNote("");
    setNewFiles([]);
  };

  const handleTriggerExceptional = () => {
    if (!submissionRef || !db || !memoFile || !user || isTerminal) {
      toast({ variant: "destructive", title: "Action Denied", description: "Hierarchy flow cannot be triggered for terminal cases." });
      return;
    }
    if (!exceptionReason || !riskJustification) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Reason and Risk Justification are mandatory." });
      return;
    }

    const now = new Date().toISOString();
    const historyEntry: CommentHistoryEntry = {
      role: user.role || 'Branch Manager',
      performedBy: user.name,
      timestamp: now,
      comment: `Triggered Hierarchy Flow: ${exceptionReason}. Justification: ${riskJustification}`,
      action: 'Hierarchy Trigger'
    };

    const updateData = {
      isExceptional: true,
      exceptionalStatus: 'Awaiting District' as ExceptionalStatus,
      commentHistory: arrayUnion(historyEntry),
      exceptionalData: {
        reason: exceptionReason,
        justification: riskJustification,
        memoUrl: "#", 
        initiatedBy: user.name,
        initiatedAt: now,
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
    const memoData = { id: docRef.id, name: `Institutional_Memo_${submission.id}.pdf`, type: 'Exceptional Memo', uploadedAt: new Date().toISOString(), url: "#", status: 'Current' };
    setDoc(docRef, memoData).catch(() => {});

    setIsExceptionDialogOpen(false);
    toast({ title: "Exceptional Request Dispatched", description: "Case forwarded to District Director." });
  };

  const handleExceptionalApproval = (action: 'Approved' | 'Rejected' | 'Clarification' | 'ForwardChief') => {
    if (!submissionRef || !db || !submission.exceptionalData || !user || isTerminal) return;
    
    const isMemoRequiredRole = ['District Director', 'Branch Banking Director', 'Chief Retail & SME Banking Officer'].includes(user.role || '');
    if (action === 'Approved' && isMemoRequiredRole && !decisionMemoFile && !isAdmin) {
      toast({ variant: "destructive", title: "Memo Required", description: "You must upload a supporting institutional memo." });
      return;
    }

    if (!remarks.trim() && !isAdmin) {
      toast({ variant: "destructive", title: "Remarks Required", description: "Decision remarks are mandatory." });
      return;
    }

    const now = new Date().toISOString();
    const currentStatus = submission.exceptionalStatus;
    let nextStatus: ExceptionalStatus = 'Completed';

    if (action === 'Rejected') nextStatus = 'Rejected';
    else if (action === 'Clarification') nextStatus = 'Clarification Required';
    else if (action === 'ForwardChief') nextStatus = 'Awaiting Chief';
    else {
      if (currentStatus === 'Awaiting District') nextStatus = 'Awaiting Director';
      else if (currentStatus === 'Awaiting Director') nextStatus = 'Awaiting Division';
      else if (currentStatus === 'Awaiting Chief') nextStatus = 'Awaiting Director';
      else if (currentStatus === 'Awaiting Division') nextStatus = 'Awaiting Supervisor';
      else if (currentStatus === 'Awaiting Supervisor') nextStatus = 'Completed';
    }

    const historyEntry: CommentHistoryEntry = {
      role: user.role || 'Management',
      performedBy: user.name,
      timestamp: now,
      comment: remarks,
      action: `Hierarchy: ${action}`
    };

    const approvalNode = {
      role: user.role || "Admin",
      action: action === 'ForwardChief' ? 'Forwarded to Chief' : (user.role === 'Chief Retail & SME Banking Officer' ? 'Returned to Director' : action),
      performedBy: user.name,
      timestamp: now,
      remarks,
      memoAttached: !!decisionMemoFile
    };

    const updateData: any = {
      exceptionalStatus: nextStatus,
      "exceptionalData.approvalHistory": arrayUnion(approvalNode),
      commentHistory: arrayUnion(historyEntry)
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

    if (decisionMemoFile) {
      const docRef = doc(collection(submissionRef, "documents"));
      const memoData = { id: docRef.id, name: `${user.role?.replace(/ /g, '_')}_Authorization_Memo.pdf`, type: 'Institutional Support Memo', uploadedAt: new Date().toISOString(), url: "#", status: 'Current' };
      setDoc(docRef, memoData).catch(() => {});
    }

    toast({ title: "Exceptional Decision Saved", description: `Workflow status updated to ${nextStatus}.` });
    setRemarks("");
    setDecisionMemoFile(null);
  };

  const handleToggleChecklistItem = (itemId: string, currentStatus: boolean) => {
    const canEdit = (isKYCOfficer || isAdmin) && !isTerminal;
    if (!canEdit || !submissionRef) return;
    const newStatus = !currentStatus;
    const updateData = { [`checklistState.${itemId}`]: newStatus };
    updateDoc(submissionRef, updateData).catch(() => {});
  };

  if (subLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  const currentExceptionalRole = 
    submission.exceptionalStatus === 'Awaiting District' ? 'District Director' :
    submission.exceptionalStatus === 'Awaiting Director' ? 'Branch Banking Director' :
    submission.exceptionalStatus === 'Awaiting Chief' ? 'Chief Retail & SME Banking Officer' :
    submission.exceptionalStatus === 'Awaiting Division' ? 'Division Manager' :
    submission.exceptionalStatus === 'Awaiting Supervisor' ? 'Supervisor' : null;

  const isCurrentExceptionalApprover = (user?.role === currentExceptionalRole || isAdmin) && !isTerminal;
  const showDirectorButtons = submission.exceptionalStatus === 'Awaiting Director' && (user?.role === 'Branch Banking Director' || isAdmin);
  const showChiefButtons = submission.exceptionalStatus === 'Awaiting Chief' && (user?.role === 'Chief Retail & SME Banking Officer' || isAdmin);

  const steps = submission.isExceptional 
    ? [
        { title: "Submitted", status: "completed" as const, icon: Check },
        { title: "District Director", status: (['Awaiting Director', 'Awaiting Chief', 'Awaiting Division', 'Awaiting Supervisor', 'Completed'].includes(submission.exceptionalStatus || '')) ? "completed" as const : (submission.exceptionalStatus === 'Awaiting District' ? "active" as const : "upcoming" as const), icon: Zap },
        { title: "Branch Banking Director", status: (['Awaiting Chief', 'Awaiting Division', 'Awaiting Supervisor', 'Completed'].includes(submission.exceptionalStatus || '')) ? "completed" as const : (submission.exceptionalStatus === 'Awaiting Director' ? "active" as const : "upcoming" as const), icon: Shield },
        { title: "Chief Retail & SME", status: (['Awaiting Division', 'Awaiting Supervisor', 'Completed'].includes(submission.exceptionalStatus || '')) ? "completed" as const : (submission.exceptionalStatus === 'Awaiting Chief' ? "active" as const : "upcoming" as const), icon: ShieldAlert },
        { title: "Division Manager", status: (['Awaiting Supervisor', 'Completed'].includes(submission.exceptionalStatus || '')) ? "completed" as const : (submission.exceptionalStatus === 'Awaiting Division' ? "active" as const : "upcoming" as const), icon: ShieldCheck },
        { title: "Supervisor", status: (submission.exceptionalStatus === 'Completed') ? "completed" as const : (submission.exceptionalStatus === 'Awaiting Supervisor' ? "active" as const : "upcoming" as const), icon: ClipboardCheck },
        { title: "KYC Officer", status: submission.exceptionalStatus === 'Completed' && (['Pending', 'In Review', 'Amended', 'Escalated'].includes(submission.status)) ? "active" as const : (["Approved", "Rejected"].includes(submission.status) ? "completed" as const : "upcoming" as const), icon: Search }
      ]
    : [
        { title: "Submitted", status: "completed" as const, icon: Check },
        { title: submission.status === 'Escalated' ? "Senior Escalation" : "KYC Verification", status: (["Approved", "Rejected"].includes(submission.status) ? "completed" : "active") as const, icon: submission.status === 'Escalated' ? AlertTriangle : Search },
        { title: "Final Decision", status: (["Approved", "Rejected"].includes(submission.status) ? "completed" : "upcoming") as const, icon: ShieldCheck }
      ];

  const isCurrentlyEscalated = submission.status === 'Escalated';
  const canResolveEscalation = isSeniorReviewer;

  // New Validation Logic: Only allow Request Fix if standard scenario is picked OR custom scenario has text
  const isFindingValid = selectedScenario && (selectedScenario !== "19. Other (specify)" || otherScenarioText.trim().length > 0);

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
                {submission.isExceptional && submission.exceptionalStatus !== 'Completed' ? `Hierarchy: ${submission.exceptionalStatus}` : submission.status}
              </Badge>
            </div>
            <p className="text-muted-foreground font-medium">{submission.customerName} • {submission.branch} Branch</p>
          </div>
        </div>
        <div className="flex gap-2">
           {isBranchMgr && !submission.isExceptional && !isTerminal && (
             <Button className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold" onClick={() => setIsExceptionDialogOpen(true)}>
               <Zap className="w-4 h-4 mr-2" /> Trigger Hierarchy Approval
             </Button>
           )}
           <Button className="bg-primary hover:bg-primary/90 text-white font-bold px-6 shadow-lg h-10" onClick={handleDownloadBundle} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileArchive className="w-4 h-4 mr-2" />}
            Download Case Bundle
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {submission.isExceptional && submission.exceptionalStatus !== 'Completed' && isCurrentExceptionalApprover && (
            <Card className="border-yellow-600 shadow-xl overflow-hidden bg-yellow-50/10 animate-in zoom-in-95 duration-300">
              <CardHeader className="bg-yellow-600 text-white">
                <CardTitle className="text-xl flex items-center gap-2"><Shield className="w-5 h-5" /> Institutional Review: {user?.role}</CardTitle>
                <CardDescription className="text-yellow-100 font-medium">Provide determination and upload supporting documentation.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {['District Director', 'Branch Banking Director', 'Chief Retail & SME Banking Officer'].includes(user?.role || '') || isAdmin ? (
                  <div className="space-y-3">
                    <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Mandatory Supporting Memo (PDF)</Label>
                    <div onClick={() => decisionMemoInputRef.current?.click()} className={cn("border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all bg-white shadow-sm", decisionMemoFile ? "border-emerald-300 bg-emerald-50/20" : "border-yellow-300 hover:bg-yellow-50/50")}>
                      {decisionMemoFile ? (
                        <div className="flex items-center justify-center gap-3 text-emerald-700">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-sm font-bold truncate">{decisionMemoFile.name}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setDecisionMemoFile(null); }}><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-6 h-6 text-yellow-600" />
                          <p className="text-xs font-bold text-slate-600">Upload Official {user?.role} Authorization Memo</p>
                        </div>
                      )}
                    </div>
                    <input type="file" ref={decisionMemoInputRef} className="hidden" accept="application/pdf" onChange={(e) => setDecisionMemoFile(e.target.files?.[0] || null)} />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">Decision Remarks (Mandatory)</Label>
                  <Textarea placeholder="Provide context for your determination..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[120px]" />
                </div>
                <div className="flex flex-wrap gap-3">
                  {showDirectorButtons ? (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 flex-1 shadow-lg" onClick={() => handleExceptionalApproval('Approved')}>Approve & Forward</Button>
                      <Button variant="secondary" className="bg-primary hover:bg-primary/90 text-white font-black h-12 flex-1 shadow-lg" onClick={() => handleExceptionalApproval('ForwardChief')}>Forward to Chief</Button>
                    </>
                  ) : showChiefButtons ? (
                    <Button className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 w-full shadow-lg" onClick={() => handleExceptionalApproval('Approved')}>Approve & Return</Button>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 flex-1 shadow-lg" onClick={() => handleExceptionalApproval('Approved')}>{currentExceptionalRole === 'Supervisor' ? 'Confirm & Dispatch' : 'Approve Level'}</Button>
                  )}
                  <Button variant="outline" className="text-orange-600 border-orange-600 bg-white font-bold h-12 px-6" onClick={() => handleExceptionalApproval('Clarification')}>Request Info</Button>
                  <Button variant="destructive" className="font-bold h-12 px-6" onClick={() => handleExceptionalApproval('Rejected')}>Reject Flow</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50">
              <CardTitle className="text-xl flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Verification Assets</CardTitle>
              <Badge variant="outline" className="bg-white font-bold text-slate-500 uppercase text-[10px] tracking-widest">{documents?.length || 0} Files</Badge>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              <div className="grid gap-4">
                {documents?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/30 transition-all group border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-2 rounded-lg", doc.type.includes('Memo') ? "bg-yellow-100 text-yellow-700" : "bg-primary/10 text-primary")}>
                          {doc.type.includes('Memo') ? <Zap className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{doc.name}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{doc.type.replace(/_/g, ' ')} • {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" onClick={() => setPreviewFile({ id: doc.id, name: doc.name, type: doc.type, url: doc.url === '#' ? 'https://picsum.photos/seed/doc/1200/1600' : doc.url, isPdf: doc.name.toLowerCase().endsWith('.pdf') })} className="rounded-full"><Eye className="w-4 h-4" /></Button>
                         <Button variant="ghost" size="icon" asChild className="rounded-full"><a href={doc.url === '#' ? '#' : doc.url} download={doc.name}><Download className="w-4 h-4" /></a></Button>
                      </div>
                    </div>
                ))}
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Verification Checklist</h3>
                  </div>
                  {(isKYCOfficer || isAdmin) && !isTerminal && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => handleSelectAllChecklist(true)}>Select All</Button>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => handleSelectAllChecklist(false)}>Reset</Button>
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  {currentChecklist.map((item) => {
                    const isVerified = submission.checklistState?.[item.id] || false;
                    return (
                      <div key={item.id} className={cn("flex items-center justify-between p-3 rounded-lg border transition-all", isVerified ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50/50 border-slate-100")}>
                        <div className="flex items-center gap-3">
                          <div className={cn("w-5 h-5 rounded flex items-center justify-center border", isVerified ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-200")}>{isVerified && <Check className="w-3 h-3" />}</div>
                          <span className={cn("text-sm font-bold", isVerified ? "text-emerald-900" : "text-slate-700")}>{item.label} {item.mandatory && <span className="text-destructive">*</span>}</span>
                        </div>
                        <Button variant="ghost" size="sm" disabled={!(isKYCOfficer || isAdmin) || isTerminal} onClick={() => handleToggleChecklistItem(item.id, isVerified)} className={cn("h-8 font-black text-xs px-3 rounded-full transition-all", isVerified ? "bg-emerald-100 text-emerald-700" : "bg-white border text-slate-400")}>
                          {isVerified ? "✔ VERIFIED" : "✖ PENDING"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-primary" />
                Audit & Communication History
              </CardTitle>
              <Badge variant="outline" className="bg-white font-bold text-[10px] tracking-widest uppercase">
                {submission.commentHistory?.length || 0} Entries
              </Badge>
            </CardHeader>
            <CardContent className="pt-8 px-8">
              <div className="relative space-y-8">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                {submission.commentHistory && submission.commentHistory.length > 0 ? (
                  submission.commentHistory.map((entry, idx) => (
                    <div key={idx} className="relative flex gap-6 animate-in fade-in slide-in-from-left-2 duration-500">
                      <div className="z-10 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                        {entry.action === 'Approved' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                         entry.action === 'Amended' ? <RefreshCw className="w-5 h-5 text-orange-500" /> :
                         entry.action === 'Rejected' ? <XCircle className="w-5 h-5 text-red-500" /> :
                         entry.action === 'Submission' ? <FilePlus className="w-5 h-5 text-primary" /> :
                         <MessageSquare className="w-5 h-5 text-slate-400" />}
                      </div>
                      <div className="flex-1 space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900">{entry.performedBy}</span>
                            <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-tighter bg-white border-slate-200">
                              {entry.role}
                            </Badge>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className={cn(
                          "text-sm leading-relaxed font-medium whitespace-pre-wrap",
                          entry.action === 'Amended' ? "text-slate-900" : "text-slate-700"
                        )}>
                          {entry.comment}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Action:</span>
                          <Badge variant="outline" className={cn(
                            "text-[9px] font-black uppercase tracking-widest bg-white",
                            entry.action === 'Amended' ? "border-red-200 text-red-600" : "border-primary/20 text-primary"
                          )}>
                            {entry.action === 'Amended' ? 'Action Required' : entry.action}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-muted-foreground italic bg-slate-50/50 rounded-2xl border-2 border-dashed">
                    No institutional comments logged for this case.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-primary/20 bg-primary/5 overflow-hidden sticky top-24">
            <CardHeader className="bg-primary/10 border-b border-primary/10 py-4">
              <CardTitle className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2"><MapPin className="w-4 h-4" /> Institutional Source</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-primary/10">
                <div className="p-5 space-y-1 relative group">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</p><User className="w-4 h-4 text-primary/20" /></div>
                  <p className="font-black text-slate-900 text-lg leading-tight">{submission.customerName}</p>
                </div>
                <div className="p-5 space-y-1 relative group bg-white/30">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Classification</p><Layers className="w-4 h-4 text-primary/20" /></div>
                  <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{submission.entityType?.replace(/_/g, ' ') || 'Individual Account'}</p>
                </div>
                <div className="p-5 space-y-1 relative group">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Region</p><Globe className="w-4 h-4 text-primary/20" /></div>
                  <p className="font-black text-slate-900">{submission.district} District</p>
                </div>
                <div className="p-5 space-y-1 relative group bg-white/30">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Node</p><Building2 className="w-4 h-4 text-primary/20" /></div>
                  <p className="font-black text-slate-900">{submission.branch} Branch</p>
                </div>
                <div className="p-5 space-y-1 relative group">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Originating Officer</p><UserCheck className="w-4 h-4 text-primary/20" /></div>
                  <p className="font-black text-slate-900">{submission.submittedBy}</p>
                </div>
                <div className="p-5 space-y-1 relative group bg-white/30">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submitted On</p><Calendar className="w-4 h-4 text-primary/20" /></div>
                  <p className="font-black text-slate-900 text-sm tabular-nums">{new Date(submission.submittedAt).toLocaleString()}</p>
                </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b py-6 px-8"><CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-widest">Case Lifecycle</CardTitle></CardHeader>
            <CardContent className="pt-8 pb-10 px-8">
              <div className="relative space-y-10">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
                {steps.map((step, idx) => {
                  const Icon = step.icon;
                  return (
                    <div key={idx} className="relative flex gap-6 group">
                      <div className={cn("z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shrink-0", step.status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" : step.status === "active" ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-300")}><Icon className={cn("w-5 h-5", step.status === "active" && "animate-pulse")} /></div>
                      <div className="space-y-1.5 pt-0.5">
                        <p className={cn("text-base font-bold", step.status === "upcoming" ? "text-slate-300" : "text-slate-900")}>{step.title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {(isOwner || isReviewer || isAdmin) && submission.status === 'Amended' && !isTerminal && (
            <Card className="border-orange-200 shadow-xl bg-orange-50/5 animate-in slide-in-from-right-4 duration-500">
              <CardHeader className="bg-orange-100/50 border-b">
                <CardTitle className="text-lg flex items-center gap-2"><RefreshCw className="w-5 h-5 text-orange-600" /> Correction Workspace</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-4">
                  <input type="file" className="hidden" ref={correctionInputRef} multiple onChange={handleCorrectionFileChange} />
                  <div onClick={() => correctionInputRef.current?.click()} className="border-2 border-dashed border-orange-300 rounded-2xl p-8 text-center cursor-pointer hover:bg-orange-50 bg-white shadow-sm">
                    <Upload className="w-5 h-5 text-orange-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-orange-900">Attach Corrected Files</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Response Note / Clarification</Label>
                    <Textarea placeholder="Explain correction or provide context..." value={correctionNote} onChange={(e) => setCorrectionNote(e.target.value)} className="min-h-[100px]" />
                  </div>
                  {newFiles.map((f, idx) => (
                    <div key={idx} className="p-3 border rounded-xl bg-white shadow-sm space-y-3">
                      <div className="flex items-center justify-between"><span className="text-[11px] font-bold truncate flex-1">{f.file.name}</span><button onClick={() => removeNewFile(idx)}><X className="w-3 h-3" /></button></div>
                      <Select value={f.type} onValueChange={(val) => updateNewFileType(idx, val)}>
                        <SelectTrigger className="h-9 text-[10px]"><SelectValue placeholder="Categorize..." /></SelectTrigger>
                        <SelectContent>{documentTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t p-6">
                <Button className="w-full bg-orange-600 hover:bg-orange-700 font-black h-12" onClick={() => handleAction('Pending')} disabled={(!isOwner && !isAdmin) || (newFiles.length === 0 && !correctionNote.trim())}>Submit Corrections</Button>
              </CardFooter>
            </Card>
          )}

          {!isTerminal && (isReviewer || isOwner || isAdmin) && (['Pending', 'In Review', 'Escalated', 'Amended'].includes(submission.status) || isAdmin) && (!submission.isExceptional || submission.exceptionalStatus === 'Completed' || isAdmin) && (
            <Card className="border-primary/20 shadow-xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> KYC Determination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {(isReviewer || isAdmin) && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Amendment Scenario Registry</Label>
                        {selectedScenario && (
                          <Button variant="ghost" size="sm" onClick={handleClearScenario} className="h-6 text-[9px] font-black uppercase text-red-600 hover:bg-red-50">
                            <RotateCcw className="w-3 h-3 mr-1" /> Clear Finding
                          </Button>
                        )}
                      </div>
                      <Select value={selectedScenario} onValueChange={handleScenarioChange}>
                        <SelectTrigger className={cn("h-11 bg-slate-50/50 border-slate-200", selectedScenario && "border-orange-300 bg-orange-50/30")}>
                          <SelectValue placeholder="Select institutional finding..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {AMENDMENT_SCENARIOS.map((scenario) => (
                            <SelectItem key={scenario} value={scenario} className="text-xs font-medium">
                              {scenario}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedScenario === "19. Other (specify)" && (
                      <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Custom Finding Headline</Label>
                        <Input 
                          placeholder="e.g. Signature missing on page 4" 
                          value={otherScenarioText} 
                          onChange={handleOtherScenarioChange} 
                          className="h-11 border-primary/20 font-bold" 
                        />
                        <p className="text-[10px] text-muted-foreground italic">Provide a short, descriptive title for the non-standard error.</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Detailed Instructions & Remarks</Label>
                  <Textarea 
                    placeholder={isReviewer || isAdmin ? "Provide step-by-step guidance for the Branch Officer..." : "No remarks."} 
                    value={remarks} 
                    onChange={(e) => setRemarks(e.target.value)} 
                    className="min-h-[140px]" 
                    disabled={!isReviewer && !isAdmin} 
                  />
                </div>
                {(isReviewer || isAdmin) && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {(!isCurrentlyEscalated || canResolveEscalation) && (
                      <Button 
                        onClick={() => handleAction('Approved')} 
                        disabled={!!selectedScenario}
                        className={cn(
                          "bg-[#4CAF50] hover:bg-[#43A047] font-bold",
                          !!selectedScenario && "opacity-50 grayscale cursor-not-allowed"
                        )}
                      >
                        {!!selectedScenario ? "Clear finding to Approve" : "Approve"}
                      </Button>
                    )}
                    {(!isCurrentlyEscalated || canResolveEscalation) && (
                      <Button 
                        onClick={() => handleAction('Amended')} 
                        variant="outline" 
                        disabled={selectedScenario === "19. Other (specify)" && !otherScenarioText.trim()}
                        className="text-[#E67E22] font-bold border-[#E67E22]/30"
                      >
                        Request Fix
                      </Button>
                    )}
                    {(!isCurrentlyEscalated && (isKYCOfficer || isAdmin)) && <Button onClick={() => handleAction('Escalated')} variant="outline" className="text-[#8B5CF6] border-[#8B5CF6] font-bold">Escalate</Button>}
                    {(isSeniorReviewer && user?.role !== 'KYC Officer') && <Button onClick={() => handleAction('Rejected')} variant="destructive" className="font-bold">Reject</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isExceptionDialogOpen} onOpenChange={setIsExceptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-yellow-600" /> Initiate Hierarchy Flow</DialogTitle>
            <DialogDescription>Forward this case for strategic approval hierarchy oversight.</DialogDescription>
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
              <Textarea placeholder="Explain why exception is justified..." className="min-h-[120px]" value={riskJustification} onChange={(e) => setRiskJustification(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supporting Memo (PDF Only)</Label>
              <div onClick={() => exceptionMemoInputRef.current?.click()} className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center cursor-pointer hover:bg-primary/5 bg-white shadow-sm">
                <Upload className="w-6 h-6 text-primary mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-900">{memoFile ? memoFile.name : "Select Institutional Memo"}</p>
              </div>
              <input type="file" ref={exceptionMemoInputRef} className="hidden" accept="application/pdf" onChange={(e) => setMemoFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsExceptionDialogOpen(false)}>Cancel</Button>
            <Button className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold px-8 h-11" onClick={handleTriggerExceptional} disabled={!exceptionReason || !riskJustification || !memoFile}>Dispatch Flow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] overflow-hidden flex flex-col p-0 border-none bg-[#1a1a1a]">
          <DialogHeader className="p-4 bg-[#242424] text-white flex flex-row items-center justify-between border-b border-white/5 pr-14">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg"><FileText className="w-5 h-5 text-primary" /></div>
              <DialogTitle className="text-base font-bold">{previewFile?.name}</DialogTitle>
            </div>
            <Button asChild variant="outline" size="sm" className="bg-white/5 border-white/10 text-white h-9 font-bold px-4">
              <a href={previewFile?.url} download={previewFile?.name}><Download className="w-4 h-4 mr-2" /> Download Original</a>
            </Button>
          </DialogHeader>
          <div className="flex-1 bg-[#121212] overflow-hidden">
            {previewFile?.isPdf ? <iframe src={`${previewFile.url}#toolbar=1`} className="w-full h-full border-none" title="PDF Preview" /> : <img src={previewFile?.url} alt="Preview" className="max-w-full max-h-full object-contain mx-auto p-8" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
