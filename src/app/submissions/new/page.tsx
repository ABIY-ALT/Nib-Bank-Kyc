
"use client"

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardDescription, 
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
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";

interface UploadedFile {
  id: string;
  file: File;
  type: string;
  previewUrl: string;
}

const DEFAULT_ENTITY_TYPES = [
  { id: "individual", label: "Individual" },
  { id: "corporate", label: "Corporate" },
  { id: "sme", label: "SME (Small/Medium Enterprise)" },
  { id: "ngo", label: "NGO (Non-Profit Organization)" },
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
  const db = useFirestore();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [remarks, setRemarks] = useState("");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const settingsRef = useMemoFirebase(() => {
    return db ? doc(db, "settings", "global") : null;
  }, [db]);

  const { data: settings, loading: settingsLoading } = useDoc<{ 
    documentTypes: { id: string, label: string }[],
    entityTypes: { id: string, label: string }[]
  }>(settingsRef);

  const documentTypes = useMemo(() => {
    return settings?.documentTypes || DEFAULT_DOC_TYPES;
  }, [settings]);

  const entityClassifications = useMemo(() => {
    const list = settings?.entityTypes || DEFAULT_ENTITY_TYPES;
    // Set initial value once settings load
    if (list.length > 0 && !entityType) {
      setEntityType(list[0].id);
    }
    return list;
  }, [settings, entityType]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        type: documentTypes[0]?.id || "id_card",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    
    if (uploadedFiles.length === 0) {
      toast({ variant: "destructive", title: "Missing Documents", description: "Upload at least one document." });
      return;
    }

    const submissionId = `KYC-${Math.floor(1000 + Math.random() * 9000)}`;
    const submissionRef = doc(db, "submissions", submissionId);
    
    const submissionData = {
      id: submissionId,
      customerName,
      entityType,
      branch: user.branch || "Headquarters",
      district: user.district || "Central",
      submittedBy: user.name,
      submittedAt: new Date().toISOString(),
      status: "Pending",
      remarks,
    };

    setDoc(submissionRef, submissionData)
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: submissionRef.path, operation: 'create', requestResourceData: submissionData }));
      });

    uploadedFiles.forEach(file => {
      const docRef = doc(collection(submissionRef, "documents"));
      setDoc(docRef, {
        id: docRef.id,
        name: file.file.name,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        url: "#",
        status: 'Current'
      }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'create' }));
      });
    });

    toast({ title: "Submission Created", description: `Case ${submissionId} dispatched.` });
    router.push('/submissions/my');
  };

  const isPdf = previewFile?.file.type === 'application/pdf' || previewFile?.file.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-extrabold tracking-tight text-primary font-headline">New KYC Submission</h1>
        <Shield className="w-8 h-8 text-primary" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Entity Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 pt-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Full Name</Label>
              <Input placeholder="Full legal name" required className="h-11" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Classification</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  {entityClassifications.map((classification) => (
                    <SelectItem key={classification.id} value={classification.id}>
                      {classification.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2"><FilePlus className="w-5 h-5 text-accent" /> Documentation Bundle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
             <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} multiple accept=".pdf,.jpg,.jpeg,.png" />
             <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/5 transition-all">
                <Upload className="w-10 h-10 text-accent mb-4" />
                <p className="font-bold text-xl text-slate-800">Drop customer files here</p>
                <Button variant="outline" type="button" className="mt-4 font-bold border-accent/20 text-accent hover:bg-accent/5">Browse Filesystem</Button>
             </div>

             <div className="space-y-3">
               {settingsLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Fetching classifications...</div>}
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
                       <SelectTrigger className="h-10 w-full md:w-60 bg-slate-50/50"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         {documentTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}
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

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-xl">Remarks</CardTitle></CardHeader>
          <CardContent>
             <Textarea placeholder="Provide internal context for the KYC Officer (optional)..." className="min-h-[140px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </CardContent>
          <CardFooter className="flex justify-end gap-4 border-t pt-8">
            <Button variant="outline" type="button" onClick={() => router.back()} className="px-8 h-11 font-bold">Cancel</Button>
            <Button type="submit" className="px-12 h-11 bg-primary font-bold shadow-lg">Dispatch for Review</Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[90vw] w-[1200px] h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl bg-[#1a1a1a]">
          <DialogHeader className="p-4 bg-[#242424] text-white flex flex-row items-center justify-between space-y-0 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <DialogTitle className="text-base font-bold text-slate-100">
                  {previewFile?.file.name}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-0.5">
                  Document Inspection • {isPdf ? 'application/pdf' : 'image/preview'}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 mr-8">
              <Button asChild variant="outline" size="sm" className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-9 font-bold px-4">
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
