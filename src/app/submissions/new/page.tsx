"use client"

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Upload, 
  FilePlus, 
  Shield, 
  X, 
  FileText, 
  Eye, 
  CheckCircle2,
  Download,
  Loader2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { getBranches } from "@/actions/hierarchy";
import { getGlobalSettings } from "@/actions/settings";
import { createSubmission } from "@/actions/submissions";

interface UploadedFile {
  id: string;
  file: File;
  type: string;
  previewUrl: string;
}

const DEFAULT_ENTITY_TYPES = [
  { id: "individual", label: "Individual Account" },
  { id: "company", label: "Company Account" },
  { id: "association", label: "Association Account" },
  { id: "foreign_ngo", label: "Foreign NGO Account" },
  { id: "foreign_employment_agency", label: "Foreign Employment Agency Account" },
];

const DEFAULT_DOC_TYPES = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "incorporation", label: "Certificate of Incorporation" },
  { id: "tax_cert", label: "Tax Certificate" },
  { id: "other", label: "Other Document" },
];

export default function NewSubmission() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [remarks, setRemarks] = useState("");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [branches, setBranches] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const [b, s] = await Promise.all([getBranches(), getGlobalSettings()]);
        setBranches(b);
        setSettings(s);
      } catch (error) {
        console.error("Config load failed:", error);
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, []);

  const documentTypes = useMemo(() => {
    return settings?.documentTypes || DEFAULT_DOC_TYPES;
  }, [settings]);

  const entityClassifications = useMemo(() => {
    return settings?.entityTypes || DEFAULT_ENTITY_TYPES;
  }, [settings]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: crypto.randomUUID(),
        file: file,
        type: "",
        previewUrl: URL.createObjectURL(file)
      }));
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      const removed = prev.find(f => f.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return filtered;
    });
  };

  const handleTypeChange = (id: string, newType: string) => {
    setUploadedFiles((prev) => prev.map(f => f.id === id ? { ...f, type: newType } : f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    
    if (!customerName.trim()) {
      toast({ variant: "destructive", title: "Validation Error", description: "Customer Full Name is required." });
      return;
    }

    if (!entityType) {
      toast({ variant: "destructive", title: "Classification Required", description: "Please select an account category." });
      return;
    }

    if (uploadedFiles.length === 0) {
      toast({ variant: "destructive", title: "Missing Documents", description: "Upload at least one document." });
      return;
    }

    if (uploadedFiles.some(f => !f.type)) {
      toast({ variant: "destructive", title: "Classification Required", description: "Please select a file type for all uploaded documents." });
      return;
    }

    setIsSubmitting(true);
    try {
      const branchName = user.branchName || "HEADQUARTERS";
      const branchSlug = branchName.replace(/\s+/g, '_').toUpperCase();
      
      const randomArray = new Uint32Array(1);
      window.crypto.getRandomValues(randomArray);
      const randomSuffix = 1000 + (randomArray[0] % 9000);
      
      const submissionId = `${branchSlug}-KYC-${randomSuffix}`;
      
      const formData = new FormData();
      formData.append('id', submissionId);
      formData.append('customerName', customerName);
      formData.append('entityType', entityType);
      formData.append('branchName', branchName);
      formData.append('districtName', user.districtName || "Central");
      formData.append('submittedById', user.id);
      formData.append('submittedByName', user.name);
      formData.append('remarks', remarks);

      uploadedFiles.forEach(f => {
        formData.append('files', f.file);
        formData.append('types', f.type);
      });

      const result = await createSubmission(formData);
      
      if (result.success) {
        toast({ title: "Successful", description: `Case ${submissionId} dispatched for review.` });
        router.push('/submissions/my');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Submission Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPdf = previewFile?.file.type === 'application/pdf' || previewFile?.file.name.toLowerCase().endsWith('.pdf');

  if (loadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">New KYC Submission</h1>
        <Shield className="w-8 h-8 text-primary" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-primary text-white border-b">
            <CardTitle className="text-xl flex items-center gap-2 text-white"><CheckCircle2 className="w-5 h-5 text-white" /> Entity Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 pt-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Full Name</Label>
              <input placeholder="Full legal name" required className="h-11 w-full px-3 border rounded-md" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Classification</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select account category" />
                </SelectTrigger>
                <SelectContent>
                  {entityClassifications.map((classification: any) => (
                    <SelectItem key={classification.id} value={classification.id}>
                      {classification.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-primary text-white border-b">
            <CardTitle className="text-xl flex items-center gap-2 text-white"><FilePlus className="w-5 h-5 text-white" /> Documentation Bundle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
             <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} multiple accept=".pdf,.jpg,.jpeg,.png" />
             <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer hover:bg-primary/5 transition-all">
                <Upload className="w-10 h-10 text-primary mb-4" />
                <p className="font-bold text-xl text-slate-800">Drop customer files here</p>
                <Button variant="outline" type="button" className="mt-4 font-bold border-primary/20 text-primary hover:bg-primary/5">Browse Filesystem</Button>
             </div>

             <div className="space-y-3">
               {uploadedFiles.map((item) => (
                 <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border rounded-xl bg-white shadow-sm hover:border-primary/20 transition-all">
                   <div className="flex items-center gap-4 flex-1">
                     <div className="p-2 bg-slate-100 rounded-lg">
                       <FileText className="w-6 h-6 text-slate-400" />
                     </div>
                     <div className="flex flex-col">
                       <span className="text-sm font-bold truncate text-slate-700 max-w-[200px]">{item.file.name}</span>
                       <span className="text-[10px] text-muted-foreground uppercase font-bold">{(item.file.size / 1024).toFixed(1)} KB</span>
                     </div>
                   </div>
                   <div className="flex items-center gap-4 w-full md:w-auto">
                     <Select value={item.type} onValueChange={(val) => handleTypeChange(item.id, val)}>
                       <SelectTrigger className="h-10 w-full md:w-60 bg-slate-50/50">
                         <SelectValue placeholder="Select file type" />
                       </SelectTrigger>
                       <SelectContent>
                         {documentTypes.map((type: any) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}
                       </SelectContent>
                     </Select>
                     <div className="flex gap-1">
                       <Button variant="ghost" size="icon" type="button" onClick={() => setPreviewFile(item)} className="h-10 w-10 text-slate-500 hover:text-primary hover:bg-primary/5 rounded-full">
                         <Eye className="w-5 h-5" />
                       </Button>
                       <Button variant="ghost" size="icon" asChild className="h-10 w-10 text-slate-500 hover:text-primary hover:bg-primary/5 rounded-full">
                         <a href={item.previewUrl} download={item.file.name}>
                           <Download className="w-5 h-5" />
                         </a>
                       </Button>
                       <Button variant="ghost" size="icon" type="button" onClick={() => removeFile(item.id)} className="h-10 w-10 text-red-500 hover:bg-red-50 rounded-full">
                         <X className="w-5 h-5" />
                       </Button>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl text-white">Initial Remarks</CardTitle></CardHeader>
          <CardContent className="pt-6">
             <Textarea placeholder="Provide internal context for the KYC Officer (optional)..." className="min-h-[140px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </CardContent>
          <CardFooter className="flex justify-end gap-4 border-t pt-8">
            <Button variant="outline" type="button" onClick={() => router.back()} className="px-8 h-11 font-bold" disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" className="px-12 h-11 bg-primary font-bold shadow-lg text-white" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Dispatch for Review
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl bg-[#1a1a1a] rounded-3xl">
          <DialogHeader className="p-4 bg-primary text-white flex flex-row items-center justify-between space-y-0 border-b border-white/10 pr-14">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <DialogTitle className="text-base font-bold text-white">
                  {previewFile?.file.name}
                </DialogTitle>
                <DialogDescription className="text-white/70 text-[10px] uppercase font-black tracking-widest mt-0.5">
                  Document Inspection
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-9 font-bold px-4">
                <a href={previewFile?.previewUrl} download={previewFile?.file.name}>
                  <Download className="w-4 h-4 mr-2" /> Download Original
                </a>
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-[#121212] overflow-hidden flex flex-col">
            {isPdf ? (
              <div className="w-full h-full flex flex-col">
                <iframe 
                  src={`${previewFile?.previewUrl}#toolbar=1&navpanes=1&scrollbar=1`} 
                  className="w-full h-full border-none" 
                  title="PDF Preview"
                />
              </div>
            ) : previewFile?.file.type.startsWith('image/') ? (
              <div className="w-full h-full overflow-auto flex items-center justify-center p-8">
                <img 
                  src={previewFile?.previewUrl} 
                  alt="Preview" 
                  className="max-w-full max-h-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-sm"
                />
              </div>
            ) : (
              <div className="text-white flex flex-col items-center gap-6 p-12 text-center h-full justify-center">
                <div className="p-8 bg-white/5 rounded-full">
                  <FileText className="w-20 h-20 text-slate-500" />
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-bold">Preview Unavailable</p>
                  <p className="text-slate-400">Visualization for this file type is not supported in-browser.</p>
                </div>
                <Button asChild variant="outline" className="text-white border-white/20 hover:bg-white/10 h-12 px-8 font-bold">
                  <a href={previewFile?.previewUrl} download={previewFile?.file.name}>
                    <Download className="w-4 h-4 mr-2" />
                    Download to Inspect
                  </a>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
