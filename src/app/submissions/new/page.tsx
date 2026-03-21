"use client";

import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Upload,
  FilePlus,
  Shield,
  X,
  FileText,
  Eye,
  CheckCircle2,
  Download,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getGlobalSettings } from "@/actions/settings";
import { createSubmission } from "@/actions/submissions";
import { cn } from "@/lib/utils";
import {
  DocumentPreviewNavigation,
  DocumentPreviewViewer,
  PreviewableDocument,
  formatFileSize,
  getPreviewFormatLabel,
} from "@/components/submissions/document-preview";

interface UploadedFile {
  id: string;
  file: File;
  type: string;
  previewUrl: string;
}



interface UploadedFileRowProps {
  item: UploadedFile;
  documentTypes: any[];
  isSelected: boolean;
  onTypeChange: (id: string, newType: string) => void;
  onPreview: (file: UploadedFile) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

const getFileStatusLabel = (file: UploadedFile) =>
  file.type ? "Ready for submission" : "Classification pending";

const resolveDocumentTypeLabel = (typeId: string, documentTypes: any[]) => {
  if (!typeId) return "Awaiting classification";

  const matchedType = documentTypes.find((type: any) => {
    if (typeof type === "string") return type === typeId;
    return type?.id === typeId || type?.label === typeId;
  });

  if (typeof matchedType === "string") return matchedType;
  return matchedType?.label || typeId;
};

const toPreviewDocument = (
  file: UploadedFile | null,
  documentTypes: any[]
): PreviewableDocument | null => {
  if (!file) return null;

  return {
    id: file.id,
    name: file.file.name,
    previewUrl: file.previewUrl,
    mimeType: file.file.type,
    size: file.file.size,
    documentType: resolveDocumentTypeLabel(file.type, documentTypes),
    status: getFileStatusLabel(file),
  };
};

function PreviewMetadataBadges({
  file,
  documentTypes,
  tone = "light",
}: {
  file: UploadedFile | null;
  documentTypes: any[];
  tone?: "light" | "dark";
}) {
  if (!file) return null;

  const isDark = tone === "dark";
  const sharedClasses = "px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]";
  const defaultTone = isDark
    ? "border-white/10 bg-white/10 text-white/80"
    : "border-slate-200 bg-slate-50 text-slate-600";
  const accentTone = isDark
    ? "border-white/10 bg-white/15 text-white"
    : "border-primary/15 bg-primary/10 text-primary";
  const classificationTone = file.type
    ? isDark
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
    : isDark
      ? "border-orange-300/20 bg-orange-300/10 text-orange-100"
      : "border-orange-200 bg-orange-50 text-orange-600";

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className={cn(sharedClasses, accentTone)}>
        {getPreviewFormatLabel(toPreviewDocument(file, documentTypes))}
      </Badge>
      <Badge variant="outline" className={cn(sharedClasses, classificationTone)}>
        Type: {resolveDocumentTypeLabel(file.type, documentTypes)}
      </Badge>
      <Badge variant="outline" className={cn(sharedClasses, defaultTone)}>
        Status: {getFileStatusLabel(file)}
      </Badge>
      <Badge variant="outline" className={cn(sharedClasses, defaultTone)}>
        {formatFileSize(file.file.size)}
      </Badge>
    </div>
  );
}

const UploadedFileRow = memo(function UploadedFileRow({
  item,
  documentTypes,
  isSelected,
  onTypeChange,
  onPreview,
  onSelect,
  onRemove,
}: UploadedFileRowProps) {

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 md:flex-row md:items-center hover:border-primary/40 hover:bg-primary/[0.03] cursor-pointer"
      )}
      onClick={() => { onSelect(item.id); onPreview(item); }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.id);
          onPreview(item);
        }
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div
          className={cn(
            "rounded-xl p-2 transition-colors",
            isSelected ? "bg-primary/10" : "bg-slate-100"
          )}
        >
          <FileText className={cn("h-6 w-6", isSelected ? "text-primary" : "text-slate-400")} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="max-w-[260px] truncate text-sm font-bold text-slate-800">
              {item.file.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {formatFileSize(item.file.size)}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {getPreviewFormatLabel(toPreviewDocument(item, documentTypes))}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
                item.type
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-orange-200 bg-orange-50 text-orange-600"
              )}
            >
              {item.type ? "Classified" : "Type pending"}
            </Badge>
          </div>
        </div>
      </div>

      <div
        className="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <Select value={item.type} onValueChange={(value) => onTypeChange(item.id, value)}>
          <SelectTrigger className="h-10 w-full bg-slate-50/60 font-bold md:w-64">
            <SelectValue placeholder="Select file type" />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-2xl">
            {documentTypes.length > 0 ? (
              documentTypes.map((type: any) => (
                <SelectItem key={type.id} value={type.id} className="font-medium">
                  {type.label}
                </SelectItem>
              ))
            ) : (
              <div className="p-4 text-center text-xs italic text-muted-foreground">
                No document types configured.
              </div>
            )}
          </SelectContent>
        </Select>

        <div className="flex gap-1 self-end sm:self-auto">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => onPreview(item)}
            className="h-10 w-10 rounded-full text-slate-500 hover:bg-primary/5 hover:text-primary"
            title="View"
          >
            <Eye className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-10 w-10 rounded-full text-slate-500 hover:bg-primary/5 hover:text-primary"
          >
            <a href={item.previewUrl} download={item.file.name}>
              <Download className="h-5 w-5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => onRemove(item.id)}
            className="h-10 w-10 rounded-full text-red-500 hover:bg-red-50"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
});

UploadedFileRow.displayName = "UploadedFileRow";

export default function NewSubmission() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [remarks, setRemarks] = useState("");
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFilesRef = useRef<UploadedFile[]>([]);

  const [settings, setSettings] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const nextSettings = await getGlobalSettings();
        setSettings(nextSettings);
      } catch (error) {
        console.error("Config load failed:", error);
      } finally {
        setLoadingConfig(false);
      }
    }

    loadConfig();
  }, []);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    return () => {
      uploadedFilesRef.current.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    };
  }, []);



  useEffect(() => {
    if (uploadedFiles.length === 0) {
      setActiveFileId(null);
      setIsPreviewModalOpen(false);
      return;
    }

    const activeFileStillExists = uploadedFiles.some((file) => file.id === activeFileId);
    if (!activeFileStillExists) {
      setActiveFileId(uploadedFiles[0].id);
    }
  }, [activeFileId, uploadedFiles]);

  const documentTypes = useMemo(() => {
    return settings?.documentTypes || [];
  }, [settings]);

  const entityClassifications = useMemo(() => {
    return settings?.entityTypes || [];
  }, [settings]);

  const activePreviewIndex = useMemo(() => {
    return uploadedFiles.findIndex((file) => file.id === activeFileId);
  }, [activeFileId, uploadedFiles]);

  const activeFile = activePreviewIndex >= 0 ? uploadedFiles[activePreviewIndex] : null;

  const activePreviewDocument = useMemo(() => {
    return toPreviewDocument(activeFile, documentTypes);
  }, [activeFile, documentTypes]);
  const deferredPreviewDocument = useDeferredValue(activePreviewDocument);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;

    const files = Array.from(event.target.files);
    const validFiles: UploadedFile[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: `"${file.name}" exceeds the 30MB limit.`,
        });
        continue;
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Invalid Type",
          description: "Only PDF or image files are allowed.",
        });
        continue;
      }

      validFiles.push({
        id: crypto.randomUUID(),
        file,
        type: "",
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (validFiles.length > 0) {
      setUploadedFiles((previousFiles) => [...previousFiles, ...validFiles]);
    }

    event.target.value = "";
  };

  const handleTypeChange = useCallback((id: string, newType: string) => {
    setUploadedFiles((previousFiles) =>
      previousFiles.map((file) => (file.id === id ? { ...file, type: newType } : file))
    );
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setUploadedFiles((previousFiles) => {
      const fileToRemove = previousFiles.find((file) => file.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }

      return previousFiles.filter((file) => file.id !== id);
    });
  }, []);

  const handlePreviewRequest = useCallback(
    (file: UploadedFile) => {
      startTransition(() => {
        setActiveFileId(file.id);
      });
      setIsPreviewModalOpen(true);
    },
    []
  );

  const handlePanelSelection = useCallback((id: string) => {
    startTransition(() => {
      setActiveFileId(id);
    });
  }, []);

  const goToPreviewIndex = useCallback(
    (nextIndex: number) => {
      const nextFile = uploadedFiles[nextIndex];
      if (nextFile) {
        startTransition(() => {
          setActiveFileId(nextFile.id);
        });
      }
    },
    [uploadedFiles]
  );

  const goToPreviousPreview = useCallback(() => {
    if (activePreviewIndex > 0) {
      goToPreviewIndex(activePreviewIndex - 1);
    }
  }, [activePreviewIndex, goToPreviewIndex]);

  const goToNextPreview = useCallback(() => {
    if (activePreviewIndex >= 0 && activePreviewIndex < uploadedFiles.length - 1) {
      goToPreviewIndex(activePreviewIndex + 1);
    }
  }, [activePreviewIndex, goToPreviewIndex, uploadedFiles.length]);

  useEffect(() => {
    if (uploadedFiles.length < 2) return;
    if (!isPreviewModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        !!target?.isContentEditable;

      if (isTypingTarget) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousPreview();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextPreview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    goToNextPreview,
    goToPreviousPreview,
    isPreviewModalOpen,
    uploadedFiles.length,
  ]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || isSubmitting) return;

    if (!customerName.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Customer Full Name is required.",
      });
      return;
    }

    if (!entityType) {
      toast({
        variant: "destructive",
        title: "Classification Required",
        description: "Please select an account category.",
      });
      return;
    }

    if (uploadedFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Missing Documents",
        description: "Upload at least one document.",
      });
      return;
    }

    if (uploadedFiles.some((file) => !file.type)) {
      toast({
        variant: "destructive",
        title: "Classification Required",
        description: "Please select a file type for all uploaded documents.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const branchName = user.branchName || "HEADQUARTERS";
      const branchSlug = branchName.replace(/\s+/g, "_").toUpperCase();

      const randomArray = new Uint32Array(1);
      window.crypto.getRandomValues(randomArray);
      const randomSuffix = 1000 + (randomArray[0] % 9000);

      const submissionId = `${branchSlug}-KYC-${randomSuffix}`;

      const formData = new FormData();
      formData.append("id", submissionId);
      formData.append("customerName", customerName);
      formData.append("entityType", entityType);
      formData.append("branchName", branchName);
      formData.append("districtName", user.districtName || "Central");
      formData.append("remarks", remarks);

      uploadedFiles.forEach((file) => {
        formData.append("files", file.file);
        formData.append("types", file.type);
      });

      const result = await createSubmission(formData);

      if (result.success) {
        toast({ title: "Successful", description: `Case ${submissionId} dispatched for review.` });
        router.push("/submissions/my");
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileListContent =
    uploadedFiles.length > 0 ? (
      <div className="space-y-3">
        {uploadedFiles.map((item) => (
          <UploadedFileRow
            key={item.id}
            item={item}
            documentTypes={documentTypes}
            isSelected={item.id === activeFileId}
            onTypeChange={handleTypeChange}
            onPreview={handlePreviewRequest}
            onSelect={handlePanelSelection}
            onRemove={handleRemoveFile}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
        <p className="text-sm font-bold text-slate-500">No documents uploaded yet.</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          Add PDF or image files to begin the KYC bundle.
        </p>
      </div>
    );

  if (loadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Synchronizing Config...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-slate-900">
          New KYC Submission
        </h1>
        <Shield className="h-8 w-8 text-primary" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-primary text-white">
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <CheckCircle2 className="h-5 w-5 text-white" />
              Entity Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer Full Name
              </Label>
              <input
                placeholder="Full legal name"
                required
                className="h-11 w-full rounded-md border px-3 font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Account Classification
              </Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-11 font-bold">
                  <SelectValue placeholder="Select account category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl">
                  {entityClassifications.length > 0 ? (
                    entityClassifications.map((classification: any) => (
                      <SelectItem
                        key={classification.id}
                        value={classification.id}
                        className="font-medium"
                      >
                        {classification.label}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs italic text-muted-foreground">
                      No classifications configured.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-primary text-white">
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <FilePlus className="h-5 w-5 text-white" />
              Documentation Bundle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/30 p-16 transition-all hover:bg-primary/5"
            >
              <div className="flex flex-col items-center justify-center">
                <Upload className="mb-4 h-10 w-10 text-primary" />
                <p className="text-center text-xl font-bold text-slate-800">
                  Drop customer files here
                </p>
                <p className="mt-1 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Only PDF or image files (max 30MB)
                </p>
                <Button
                  variant="outline"
                  type="button"
                  className="mt-4 border-primary/20 font-bold text-primary hover:bg-primary/5"
                >
                  Browse Filesystem
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.02),rgba(15,118,110,0.05))] p-4 shadow-sm mb-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                    Bundle Contents
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Classify all uploaded documents before submission.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500"
                  >
                    {uploadedFiles.length} file{uploadedFiles.length === 1 ? "" : "s"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {fileListContent}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-primary text-white">
            <CardTitle className="text-xl text-white">Initial Remarks</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Textarea
              placeholder="Provide internal context for the KYC Officer (optional)..."
              className="min-h-[140px] font-medium"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-4 border-t pt-8">
            <Button
              variant="outline"
              type="button"
              onClick={() => router.back()}
              className="h-11 px-8 font-bold"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 rounded-xl bg-primary px-12 font-black text-white shadow-lg transition-all hover:bg-primary/90 active:scale-[0.98]"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dispatch for Review
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="h-[92vh] w-[1240px] max-w-[92vw] overflow-hidden rounded-3xl border-none bg-[#08111f] p-0 shadow-2xl [&>button]:rounded-full [&>button]:border [&>button]:border-white/10 [&>button]:bg-white/10 [&>button]:text-white [&>button]:opacity-100">
          <DialogHeader className="space-y-0 border-b border-white/10 bg-[linear-gradient(135deg,rgba(3,37,76,0.98),rgba(14,84,120,0.94))] px-6 py-5 text-white">
            <div className="flex flex-col gap-4">
              <div className="space-y-2 pr-12">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/15 p-2">
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div className="space-y-1">
                    <DialogTitle className="text-left text-lg font-black text-white">
                      {activeFile?.file.name || "Document Preview"}
                    </DialogTitle>
                    <DialogDescription className="text-left text-[11px] font-black uppercase tracking-[0.2em] text-white/60">
                      Modal inspection mode
                    </DialogDescription>
                  </div>
                </div>
                <PreviewMetadataBadges
                  file={activeFile}
                  documentTypes={documentTypes}
                  tone="dark"
                />
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <DocumentPreviewNavigation
                  currentIndex={activePreviewIndex >= 0 ? activePreviewIndex : 0}
                  total={uploadedFiles.length}
                  onPrevious={goToPreviousPreview}
                  onNext={goToNextPreview}
                  buttonClassName="border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  counterClassName="border-white/15 bg-white/10 text-white/80"
                />

                {activeFile ? (
                  <Button
                    asChild
                    variant="outline"
                    className="h-10 rounded-full border-white/15 bg-white/10 px-5 font-bold text-white hover:bg-white/20 hover:text-white"
                  >
                    <a href={activeFile.previewUrl} download={activeFile.file.name}>
                      <Download className="h-4 w-4" />
                      Download Original
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogHeader>

          <div className="h-full flex-1 overflow-hidden bg-[#050d18] p-4 sm:p-6">
            <DocumentPreviewViewer
              file={deferredPreviewDocument}
              className="h-full border-white/10 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_rgba(3,7,18,0.98)_58%)]"
              emptyStateTitle="No file selected"
              emptyStateDescription="Choose a document from the list to open it in the preview modal."
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
