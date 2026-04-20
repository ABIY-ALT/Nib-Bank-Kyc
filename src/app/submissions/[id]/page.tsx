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
  ChevronLeft,
  ChevronRight,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentPreviewViewer,
  type PreviewableDocument,
} from "@/components/submissions/document-preview";
import { formatFileSize, getPreviewFormatLabel } from "@/lib/documents";

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
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

interface ResubmitFile {
  id: string;
  file: File;
  type: string;
  previewUrl: string;
}

const normalizeChecklistState = (raw: unknown): Record<string, boolean> => {
  if (!raw) return {};

  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, boolean>;
  }

  return {};
};

const areChecklistStatesEqual = (
  left: Record<string, boolean>,
  right: Record<string, boolean>
) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => !!left[key] === !!right[key]);
};

const resolveDocumentTypeLabel = (type: string, documentTypes: any[]) => {
  if (!type) return "Unseen classification";

  const matchedType = documentTypes.find((documentType: any) => {
    if (typeof documentType === "string") return documentType === type;
    return documentType?.id === type || documentType?.label === type;
  });

  if (typeof matchedType === "string") return matchedType;
  return matchedType?.label || type;
};

const SubmissionDocumentRow = memo(function SubmissionDocumentRow({ doc }: { doc: any }) {
  return (
    <div className="flex items-center justify-between p-5 border rounded-2xl bg-white shadow-sm border-slate-100 group hover:border-primary/30 transition-all">
      <div className="flex items-center gap-4 min-w-0">
        <div className="p-2 bg-slate-100 rounded-lg shrink-0">
          <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
        </div>
        <div className="min-w-0">
          <p className="font-black text-slate-900 truncate">{doc.name}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-black truncate">{doc.type}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" asChild className="rounded-full h-10 w-10 text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors">
          <a href={doc.url} target="_blank" rel="noopener noreferrer"><Eye className="w-5 h-5" /></a>
        </Button>
        <Button variant="ghost" size="icon" asChild className="rounded-full h-10 w-10 text-primary hover:bg-primary/5">
          <a href={doc.url} download={doc.name}><Download className="w-5 h-5" /></a>
        </Button>
      </div>
    </div>
  );
});

const ResubmitFileRow = memo(function ResubmitFileRow({
  item,
  documentTypes,
  onTypeChange,
  onRemove,
}: {
  item: ResubmitFile;
  documentTypes: any[];
  onTypeChange: (id: string, type: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 shrink-0">
            <FileText className="w-5 h-5 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 truncate">{item.file.name}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">
                {formatFileSize(item.file.size)}
              </p>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] uppercase font-black tracking-widest",
                  item.type
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-orange-200 bg-orange-50 text-orange-600"
                )}
              >
                {item.type ? resolveDocumentTypeLabel(item.type, documentTypes) : "Type pending"}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(item.id)}
          className="h-10 w-10 text-red-500 hover:bg-red-50 rounded-full shrink-0"
          title="Remove file"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Document Type</Label>
          <Select value={item.type} onValueChange={(value) => onTypeChange(item.id, value)}>
            <SelectTrigger className="h-11 rounded-xl font-bold">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {Array.isArray(documentTypes) && documentTypes.map((type: any) => {
                const label = typeof type === 'string' ? type : type?.label;
                const key = typeof type === 'string' ? type : (type?.id || type?.label);
                if (!label) return null;
                return (
                  <SelectItem key={key} value={label}>{label}</SelectItem>
                );
              })}
              <SelectItem value="OTHER">OTHER</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            asChild
            className="h-11 rounded-xl font-black w-full"
            title="Preview"
          >
            <a href={item.previewUrl} target="_blank" rel="noopener noreferrer">
              <Eye className="w-5 h-5 mr-2" />
              Preview
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
});

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const routeSubmissionId = params && Array.isArray(params.id) ? params.id[0] : params?.id;

  const [submission, setSubmission] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [remarks, setRemarks] = useState("");
  const [isCustomRemark, setIsCustomRemark] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [isActioning, setIsActioning] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const checklistSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checklistLatestRef = useRef<Record<string, boolean>>({});

  const [resubmitFiles, setResubmitFiles] = useState<ResubmitFile[]>([]);
  const resubmitInputRef = useRef<HTMLInputElement>(null);
  const resubmitFilesRef = useRef<ResubmitFile[]>([]);

  const [govMemo, setGovMemo] = useState<File | null>(null);
  const govFileInputRef = useRef<HTMLInputElement>(null);

  const [fileToPurge, setFileToPurge] = useState<any | null>(null);
  const [isPurging, setIsPurging] = useState<string | null>(null);

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isDocPreviewModalOpen, setIsDocPreviewModalOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!routeSubmissionId) return;
      try {
        const [sub, s] = await Promise.all([
          getSubmissionById(routeSubmissionId as string),
          getGlobalSettings()
        ]);
        setSubmission(sub);
        setSettings(s);
      } catch (error) {

      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [routeSubmissionId]);

  useEffect(() => {
    const nextChecklistState = normalizeChecklistState(submission?.checklistState);
    checklistLatestRef.current = nextChecklistState;
    setChecklist((currentChecklist) =>
      areChecklistStatesEqual(currentChecklist, nextChecklistState)
        ? currentChecklist
        : nextChecklistState
    );
  }, [submission?.checklistState]);

  useEffect(() => {
    resubmitFilesRef.current = resubmitFiles;
  }, [resubmitFiles]);

  useEffect(() => {
    return () => {
      if (checklistSyncRef.current) clearTimeout(checklistSyncRef.current);
      resubmitFilesRef.current.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    };
  }, []);

  const documentTypes = useMemo(() => {
    return settings?.documentTypes || [];
  }, [settings]);

  const submissionDocuments = useMemo(() => {
    return Array.isArray(submission?.documents) ? submission.documents : [];
  }, [submission?.documents]);

  const previewableDocuments: PreviewableDocument[] = useMemo(() => {
    return submissionDocuments.map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      previewUrl: doc.previewUrl || doc.url,
      mimeType: doc.mimeType,
      size: doc.size,
      documentType: doc.type,
    }));
  }, [submissionDocuments]);

  const handleDocumentSelect = useCallback((doc: PreviewableDocument) => {
    setActiveDocId(doc.id);
    setIsDocPreviewModalOpen(true);
  }, []);

  const activeDocIndex = useMemo(() => {
    return previewableDocuments.findIndex((d) => d.id === activeDocId);
  }, [activeDocId, previewableDocuments]);

  const activeDocPreview = activeDocIndex >= 0 ? previewableDocuments[activeDocIndex] : null;

  useEffect(() => {
    if (previewableDocuments.length > 0 && !activeDocId) {
      setActiveDocId(previewableDocuments[0].id);
    }
  }, [previewableDocuments, activeDocId]);



  const goToPreviousDoc = useCallback(() => {
    if (activeDocIndex > 0) {
      setActiveDocId(previewableDocuments[activeDocIndex - 1].id);
    }
  }, [activeDocIndex, previewableDocuments]);

  const goToNextDoc = useCallback(() => {
    if (activeDocIndex >= 0 && activeDocIndex < previewableDocuments.length - 1) {
      setActiveDocId(previewableDocuments[activeDocIndex + 1].id);
    }
  }, [activeDocIndex, previewableDocuments]);

  const isCreator = user?.id === submission?.createdById;
  const isEscalated = submission?.status === KYC_STATUS.ESCALATED;
  const wasEscalated = useMemo(() => {
    if (!submission) return false;
    if (submission.status === KYC_STATUS.ESCALATED) return true;

    return Array.isArray(submission.commentHistory)
      && submission.commentHistory.some((entry: any) => entry?.action === KYC_STATUS.ESCALATED);
  }, [submission]);

  const isReviewer = useMemo(() => {
    if (isSuperAdmin) return true;
    if (isCreator) return false;
    return hasPermission('KYC_VIEW_QUEUE') || (submission?.status === KYC_STATUS.ESCALATED && hasPermission('VIEW_ESCALATED_CASES'));
  }, [hasPermission, isSuperAdmin, isCreator, submission?.status]);

  const canBulkManageChecklist = useMemo(() => {
    if (isSuperAdmin) return true;
    return user?.roles?.some((ur: any) =>
      ['KYC_OFFICER', 'KYC_SPECIALIST_OFFICER'].includes(ur.role?.name)
    ) && isReviewer;
  }, [isSuperAdmin, isReviewer, user]);

  const isTerminal = submission?.status === KYC_STATUS.APPROVED || submission?.status === KYC_STATUS.REJECTED;

  // Only the creator (branch officer) or super admin can upload additional documents.
  // KYC officers and other reviewers can only view/preview/download.
  const canUploadDocuments = useMemo(() => {
    if (isSuperAdmin) return true;
    if (isCreator) return true;
    // Allow branch roles to upload for their cases
    return user?.roles?.some((ur: any) =>
      ['BRANCH_OFFICER', 'BRANCH_MANAGER'].includes(ur.role?.name)
    ) ?? false;
  }, [isSuperAdmin, isCreator, user]);

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

  const refreshSubmission = useCallback(async (submissionId: string) => {
    const updatedSubmission = await getSubmissionById(submissionId);
    setSubmission(updatedSubmission);
    return updatedSubmission;
  }, []);

  const handleAction = useCallback(async (action: string) => {
    if (!submission || !user || isTerminal || isActioning) return;

    if ((action === KYC_STATUS.ACTION_REQUIRED || action === KYC_STATUS.ESCALATED) && !remarks.trim()) {
      toast({ variant: "destructive", title: "Information Required", description: "This action requires detailed remarks." });
      return;
    }

    setIsActioning(action);
    try {
      await updateSubmissionStatus(submission.id, action, user.id, remarks);
      toast({ title: "Successful", description: `Case moved to ${action.replace(/_/g, ' ')}.` });
      await refreshSubmission(submission.id);
      setRemarks("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    } finally {
      setIsActioning(null);
    }
  }, [isActioning, isTerminal, refreshSubmission, remarks, submission, toast, user]);

  const handleResubmit = useCallback(async () => {
    if (!submission || !user || isActioning) return;

    const hasFiles = resubmitFiles.length > 0;
    const hasRemarks = !!remarks.trim();

    if (!hasFiles && !hasRemarks) {
      toast({ variant: "destructive", title: "Response Required", description: "Attach documents or provide a comment." });
      return;
    }

    if (hasFiles && resubmitFiles.some(f => !f.type)) {
      toast({ variant: "destructive", title: "Document Types Required", description: "Select a type for each attached document." });
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
        toast({ title: "Successful", description: "Case resubmitted for officer analysis." });
        await refreshSubmission(submission.id);
        setRemarks("");
        setResubmitFiles(prev => {
          prev.forEach(p => URL.revokeObjectURL(p.previewUrl));
          return [];
        });
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Resubmission Failed", description: e.message });
    } finally {
      setIsActioning(null);
    }
  }, [isActioning, refreshSubmission, remarks, resubmitFiles, submission, toast, user]);

  const handleFileSelection = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const valid: ResubmitFile[] = [];
      for (const f of files) {
        if (f.size > MAX_FILE_SIZE) {
          toast({ variant: "destructive", title: "File Too Large", description: f.name });
          continue;
        }
        if (!ALLOWED_TYPES.includes(f.type)) {
          toast({ variant: "destructive", title: "Invalid Type", description: f.name });
          continue;
        }
        valid.push({ file: f, type: "", id: crypto.randomUUID(), previewUrl: URL.createObjectURL(f) });
      }
      setResubmitFiles(prev => [...prev, ...valid]);
    }

    // Allow picking the same file again after removal.
    e.target.value = "";
  }, [toast]);

  const removeResubmitFile = useCallback((id: string) => {
    setResubmitFiles(prev => {
      const removed = prev.find(f => f.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  const handleResubmitTypeChange = useCallback((id: string, type: string) => {
    setResubmitFiles(prev => prev.map(f => f.id === id ? { ...f, type } : f));
  }, []);

  const handleExceptionalStep = useCallback(async (nextStatus: string, actionLabel: string) => {
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
      await refreshSubmission(submission.id);
      setRemarks("");
      setGovMemo(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Transition Failed" });
    } finally {
      setIsActioning(null);
    }
  }, [govMemo, isActioning, refreshSubmission, remarks, submission, toast, user]);

  const handleConfirmPurge = useCallback(async () => {
    if (!fileToPurge) return;
    setIsPurging(fileToPurge.id);
    try {
      const res = await deleteInstitutionalFile(fileToPurge.id);
      if (res.success) {
        toast({ title: "Successful" });
        if (submission?.id) {
          await refreshSubmission(submission.id);
        }
      }
    } finally {
      setIsPurging(null);
      setFileToPurge(null);
    }
  }, [fileToPurge, refreshSubmission, submission?.id, toast]);

  const scheduleChecklistSync = useCallback((submissionId: string, nextState: Record<string, boolean>) => {
    checklistLatestRef.current = nextState;
    if (checklistSyncRef.current) clearTimeout(checklistSyncRef.current);
    checklistSyncRef.current = setTimeout(async () => {
      try {
        await updateSubmissionChecklist(submissionId, checklistLatestRef.current);
      } catch (e) {
        toast({ variant: "destructive", title: "Sync Error" });
      }
    }, 300);
  }, [toast]);

  const handleChecklistToggle = useCallback((itemId: string) => {
    if (!isReviewer || isTerminal || !submission?.id) return;
    setChecklist(prev => {
      const nextState = { ...prev, [itemId]: !prev[itemId] };
      scheduleChecklistSync(submission.id, nextState);
      return nextState;
    });
  }, [isReviewer, isTerminal, scheduleChecklistSync, submission?.id]);

  const handleChecklistBulkUpdate = useCallback((nextValue: boolean) => {
    if (!canBulkManageChecklist || isTerminal || !submission?.id) return;

    const nextState = nextValue
      ? Object.fromEntries(KYC_CHECKLIST_ITEMS.map(item => [item.id, true]))
      : {};

    setChecklist(nextState);
    scheduleChecklistSync(submission.id, nextState);
  }, [canBulkManageChecklist, isTerminal, scheduleChecklistSync, submission?.id]);

  const handleScenarioChange = useCallback((value: string) => {
    const requiresCustomRemark = /\bother\b/i.test(value);
    setSelectedScenario(value);
    setIsCustomRemark(requiresCustomRemark);
    setRemarks(requiresCustomRemark ? "" : value);
  }, []);

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

    if (wasEscalated) {
      return [
        { id: 'sub', label: 'Submission', desc: 'Case Dispatched', state: 'completed', icon: CheckCircle2 },
        { id: 'review', label: 'Officer Analysis', desc: 'Technical Review', state: 'completed', icon: Search },
        {
          id: 'senior',
          label: 'Senior Assessment',
          desc: 'Escalated Review',
          state: status === KYC_STATUS.ESCALATED ? 'active' : 'completed',
          icon: ShieldAlert
        },
        {
          id: 'verdict',
          label: 'Institutional Verdict',
          desc: 'Senior Decision',
          state: status === KYC_STATUS.ESCALATED ? 'pending' : (isTerminal ? 'completed' : 'active'),
          icon: ShieldCheck
        },
        {
          id: 'closed',
          label: 'Case Closed',
          desc: 'Lifecycle Conclusion',
          state: isTerminal ? 'completed' : 'pending',
          icon: Activity
        }
      ];
    }

    return [
      { id: 'sub', label: 'Submission', desc: 'Case Dispatched', state: 'completed', icon: CheckCircle2 },
      { id: 'review', label: 'Officer Analysis', desc: 'Technical Review', state: status === KYC_STATUS.SUBMITTED ? 'active' : 'completed', icon: Search },
      { id: 'verdict', label: 'Institutional Verdict', desc: 'Final Assessment', state: status === KYC_STATUS.IN_REVIEW ? 'active' : (isTerminal ? 'completed' : 'pending'), icon: ShieldCheck },
      { id: 'closed', label: 'Case Closed', desc: 'Lifecycle Conclusion', state: isTerminal ? 'completed' : 'pending', icon: Activity }
    ];
  }, [submission, isTerminal]);

  const sortedHistory = useMemo(() => {
    if (!submission?.commentHistory || !Array.isArray(submission.commentHistory)) return [];
    return [...submission.commentHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [submission?.commentHistory]);

  if (loading) return <div className="p-12 text-center text-muted-foreground animate-pulse"><Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  const canRespondToAmendment =
    isCreator &&
    !submission.isExceptional &&
    !isTerminal &&
    submission.status === KYC_STATUS.ACTION_REQUIRED;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-primary/5 text-primary"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black font-headline text-foreground tracking-tight">{submission.id}</h1>
              <Badge variant="outline" className={cn(
                "font-black px-3 py-1 uppercase text-[10px] tracking-widest",
                submission.status === KYC_STATUS.APPROVED && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                submission.status === KYC_STATUS.ESCALATED && 'bg-violet-50 text-violet-700 border-violet-200',
                submission.isExceptional && 'bg-yellow-50 text-yellow-700 border-yellow-200'
              )}>
                {submission.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-wider">{submission.customerName} | {submission.branchName}</p>
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
            <CardContent className="pt-6 px-6 space-y-5">
              {submissionDocuments.length > 0 && (
                <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.02),rgba(15,118,110,0.05))] p-4 shadow-sm mb-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Attached Files</p>
                      <p className="mt-2 text-xs font-medium text-slate-500">Select any document to inspect.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {previewableDocuments.length} file{previewableDocuments.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                {submissionDocuments.map((doc: any) => {
                  const previewDoc = previewableDocuments.find((p) => p.id === doc.id);
                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 md:flex-row md:items-center hover:border-primary/40 hover:bg-primary/[0.03] cursor-pointer"
                      onClick={() => { setActiveDocId(doc.id); setIsDocPreviewModalOpen(true); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveDocId(doc.id); setIsDocPreviewModalOpen(true); } }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="rounded-xl p-2 bg-slate-100 transition-colors">
                          <FileText className="h-6 w-6 text-slate-400" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="max-w-[260px] truncate text-sm font-bold text-slate-800">{doc.name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {doc.size && (
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{formatFileSize(doc.size)}</span>
                            )}
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{getPreviewFormatLabel(previewDoc || null)}</span>
                            <Badge variant="outline" className={cn(
                              "px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
                              doc.type ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-600"
                            )}>
                              {doc.type ? "Classified" : "Unclassified"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="h-10 w-full md:w-48 flex items-center rounded-md border border-slate-200 bg-slate-50/60 px-3">
                          <span className="truncate text-sm font-bold text-slate-700">{doc.type ? resolveDocumentTypeLabel(doc.type, documentTypes) : "No type assigned"}</span>
                        </div>
                        <div className="flex gap-1 self-end sm:self-auto">
                          <Button variant="ghost" size="icon" type="button" className="h-10 w-10 rounded-full text-slate-500 hover:bg-primary/5 hover:text-primary" onClick={() => { setActiveDocId(doc.id); setIsDocPreviewModalOpen(true); }}>
                            <Eye className="h-5 w-5" />
                          </Button>
                          <Button variant="ghost" size="icon" asChild className="h-10 w-10 rounded-full text-slate-500 hover:bg-primary/5 hover:text-primary">
                            <a href={doc.url} download={doc.name}><Download className="h-5 w-5" /></a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Dialog open={isDocPreviewModalOpen} onOpenChange={setIsDocPreviewModalOpen}>
            <DialogContent className="h-[92vh] w-[1240px] max-w-[92vw] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-3xl border-none bg-[#08111f] p-0 shadow-2xl [&>button]:right-4 [&>button]:top-2.5 [&>button]:z-30 [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-full [&>button]:border [&>button]:border-white/15 [&>button]:bg-white/10 [&>button]:text-white [&>button]:opacity-100 [&>button]:ring-0 [&>button]:ring-offset-0 [&>button]:focus:ring-0 [&>button]:focus:ring-offset-0 [&>button]:focus-visible:ring-0 [&>button]:focus-visible:ring-offset-0 [&>button]:data-[state=open]:bg-white/20 [&>button]:data-[state=open]:text-white">
              <DialogHeader className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(3,37,76,0.98),rgba(14,84,120,0.94))] px-3 py-1 pr-24 text-white sm:px-4 sm:py-1.5 sm:pr-28">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="rounded-md bg-white/15 p-1">
                      <FileText className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="truncate text-left text-[12px] font-black leading-none text-white sm:text-[13px]">
                        {activeDocPreview?.name || "Document Preview"}
                      </DialogTitle>
                      {activeDocPreview && (
                        <p className="truncate text-left text-[8px] font-bold uppercase tracking-[0.08em] text-white/65 sm:text-[9px]">
                          {getPreviewFormatLabel(activeDocPreview)}
                          {activeDocPreview.size ? ` | ${formatFileSize(activeDocPreview.size)}` : ""}
                          {activeDocPreview.documentType ? ` | ${activeDocPreview.documentType}` : " | Unclassified"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={goToPreviousDoc}
                      disabled={activeDocIndex <= 0}
                      className="h-6 w-6 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-7 sm:w-7"
                      title="Previous document"
                    >
                      <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </Button>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/75 sm:text-[9px]">
                      {activeDocIndex >= 0 ? activeDocIndex + 1 : 0} of {previewableDocuments.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={goToNextDoc}
                      disabled={activeDocIndex >= previewableDocuments.length - 1}
                      className="h-6 w-6 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-7 sm:w-7"
                      title="Next document"
                    >
                      <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </Button>
                    {activeDocPreview && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-6 rounded-full border-white/25 bg-white/10 px-2 text-[9px] font-bold text-white hover:bg-white/20 hover:text-white sm:h-7 sm:px-2.5"
                      >
                        <a href={activeDocPreview.previewUrl} download={activeDocPreview.name}>
                          <Download className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden lg:inline">Download</span>
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </DialogHeader>
              <div className="min-h-0 overflow-hidden bg-[#050d18] p-4 sm:p-6">
                <DocumentPreviewViewer
                  file={activeDocPreview}
                  className="h-full border-white/10 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_rgba(3,7,18,0.98)_58%)]"
                  emptyStateTitle="No file selected"
                  emptyStateDescription="Choose a document from the list to open it in preview."
                />
              </div>
            </DialogContent>
          </Dialog>

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
                {canBulkManageChecklist && (
                  <div className="flex items-center gap-2 pb-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleChecklistBulkUpdate(true)}
                      disabled={isTerminal || verifiedCount === KYC_CHECKLIST_ITEMS.length}
                      className="h-8 rounded-full px-4 text-[10px] font-black uppercase tracking-widest"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Select All
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleChecklistBulkUpdate(false)}
                      disabled={isTerminal || verifiedCount === 0}
                      className="h-8 rounded-full px-4 text-[10px] font-black uppercase tracking-widest"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Deselect All
                    </Button>
                  </div>
                )}
                {KYC_CHECKLIST_ITEMS.map((item) => (
                  <div key={item.id} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", checklist[item.id] ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100")}>
                    <div className="flex items-center space-x-3"><Checkbox id={item.id} checked={checklist[item.id] || false} onCheckedChange={() => handleChecklistToggle(item.id)} disabled={!isReviewer || isTerminal} /><label htmlFor={item.id} className="text-[11px] font-bold uppercase tracking-tight">{item.label}</label></div>
                    {checklist[item.id] && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] h-4 uppercase font-black">Verified</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {canRespondToAmendment && (
            <Card className="border-orange-200 shadow-2xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="bg-orange-600 text-white border-b py-5">
                <CardTitle className="text-lg font-black text-white">Amendment Response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6 px-6 pb-8">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Comment to KYC Officer</Label>
                  <Textarea
                    placeholder="Explain what you corrected and what changed..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="min-h-[140px] rounded-2xl bg-slate-50/50 font-medium"
                  />
                </div>

                <input
                  ref={resubmitInputRef}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={handleFileSelection}
                />

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resubmitInputRef.current?.click()}
                  className="w-full h-12 font-black rounded-xl border-orange-300 text-orange-700 hover:bg-orange-50"
                  disabled={!!isActioning}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Attach Corrected Documents
                </Button>

                {resubmitFiles.length > 0 && (
                  <div className="space-y-3">
                    {resubmitFiles.map((item) => (
                      <ResubmitFileRow
                        key={item.id}
                        item={item}
                        documentTypes={documentTypes}
                        onTypeChange={handleResubmitTypeChange}
                        onRemove={removeResubmitFile}
                      />
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleResubmit}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black h-12 rounded-xl shadow-lg"
                  disabled={!!isActioning}
                >
                  {isActioning === "RESUBMIT" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send Response
                </Button>
              </CardContent>
            </Card>
          )}

          {!submission.isExceptional && !isTerminal && isReviewer && (
            <Card className="border-primary/20 shadow-2xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="bg-primary text-white border-b py-5"><CardTitle className="text-lg font-black text-white">{isEscalated ? 'Senior Assessment' : 'Technical Verdict'}</CardTitle></CardHeader>
              <CardContent className="space-y-6 pt-6 px-6 pb-8">
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scenario Library</Label><Select value={selectedScenario} onValueChange={handleScenarioChange}><SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="Select Findings..." /></SelectTrigger><SelectContent>{AMENDMENT_SCENARIOS.map((s, i) => <SelectItem key={i} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isEscalated ? 'Senior Assessment Remarks' : 'Final Determination Remarks'}</Label><Textarea placeholder={isCustomRemark ? "Write a new comment..." : "Selected finding will appear here..."} value={remarks} onChange={(e) => setRemarks(e.target.value)} readOnly={!isCustomRemark} className="min-h-[140px] rounded-2xl bg-slate-50/50 font-medium" /></div>
                <div className={cn("grid grid-cols-1 gap-3", isEscalated ? "md:grid-cols-2" : "md:grid-cols-3")}>
                  <Button onClick={() => handleAction(KYC_STATUS.APPROVED)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg" disabled={!!isActioning}>Authorize</Button>
                  <Button onClick={() => handleAction(KYC_STATUS.ACTION_REQUIRED)} variant="outline" className="border-orange-600 text-orange-600 font-black h-12 rounded-xl hover:bg-orange-50" disabled={!!isActioning}>Amend</Button>
                  {!isEscalated && (
                    <Button onClick={() => handleAction(KYC_STATUS.ESCALATED)} className="bg-slate-900 hover:bg-black text-white font-black h-12 rounded-xl shadow-lg" disabled={!!isActioning}>Escalate</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
