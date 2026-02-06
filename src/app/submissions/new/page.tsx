
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
  Info, 
  X, 
  FileText, 
  Eye, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, doc, setDoc, query, orderBy } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { useAuth } from "@/lib/auth-mock";
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

const DOCUMENT_TYPES = [
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
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [entityType, setEntityType] = useState("individual");
  const [remarks, setRemarks] = useState("");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: branches } = useCollection<{id: string, name: string}>(
    db ? query(collection(db, "branches"), orderBy("name")) : null
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        type: "id_card",
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

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    
    if (uploadedFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Missing Documents",
        description: "Please upload at least one verification document.",
      });
      return;
    }

    setLoading(true);
    
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
      .then(async () => {
        const docPromises = uploadedFiles.map(file => {
          const docRef = doc(collection(submissionRef, "documents"));
          return setDoc(docRef, {
            id: docRef.id,
            name: file.file.name,
            type: file.type,
            uploadedAt: new Date().toISOString(),
            url: "#",
            status: 'Current'
          });
        });

        await Promise.all(docPromises);

        toast({
          title: "Submission Created",
          description: `Case ${submissionId} has been successfully sent to the Review Queue.`,
        });
        router.push('/submissions/my');
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: submissionRef.path,
          operation: 'create',
          requestResourceData: submissionData,
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
      });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-primary font-headline">New KYC Submission</h1>
          <p className="text-muted-foreground mt-2">Create a secure identity verification package for a new customer.</p>
        </div>
        <div className="bg-primary/5 p-3 rounded-full">
          <Shield className="w-8 h-8 text-primary" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Entity Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 pt-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500">Legal Name / Business Entity</Label>
              <Input 
                id="name" 
                placeholder="Enter full legal name" 
                required 
                className="h-11 focus-visible:ring-primary"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider text-slate-500">Classification</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger id="type" className="h-11">
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual / Retail</SelectItem>
                  <SelectItem value="corporate">Corporate / SME</SelectItem>
                  <SelectItem value="ngo">NGO / Institutional</SelectItem>
                  <SelectItem value="government">Government / Public Body</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Originating Branch</Label>
              <Input value={user.branch || "Headquarters"} disabled className="bg-slate-50 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Officer in Charge</Label>
              <Input value={user.name} disabled className="bg-slate-50 h-11" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <FilePlus className="w-5 h-5 text-accent" />
              Documentation Bundle
            </CardTitle>
            <CardDescription>Upload high-resolution scans and assign compliance tags.</CardDescription>
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
               onClick={triggerFileUpload}
               className="border-2 border-dashed border-slate-300 rounded-2xl p-16 flex flex-col items-center justify-center text-center space-y-4 hover:bg-accent/5 hover:border-accent/40 transition-all cursor-pointer group"
             >
                <div className="bg-accent/10 p-5 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <Upload className="w-10 h-10 text-accent" />
                </div>
                <div>
                  <p className="font-bold text-xl text-slate-800">Drop customer files here</p>
                  <p className="text-sm text-slate-500 mt-1 italic">Supports PDF, JPG, and PNG (Max 10MB per file)</p>
                </div>
                <Button variant="outline" type="button" className="mt-2 border-slate-300">Browse Filesystem</Button>
             </div>

             {uploadedFiles.length > 0 && (
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <Label className="text-sm font-bold text-slate-700 uppercase tracking-tighter">Manifest ({uploadedFiles.length} Assets)</Label>
                 </div>
                 <div className="grid gap-3">
                   {uploadedFiles.map((item) => (
                     <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border rounded-xl bg-white shadow-sm hover:border-primary/30 transition-colors">
                       <div className="flex items-center gap-4 flex-1">
                         <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                           <FileText className="w-6 h-6" />
                         </div>
                         <div className="flex flex-col overflow-hidden">
                           <span className="text-sm font-bold text-slate-900 truncate max-w-[200px] md:max-w-xs">{item.file.name}</span>
                           <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                         </div>
                       </div>
                       
                       <div className="flex items-center gap-3 w-full md:w-auto">
                         <Select 
                           value={item.type} 
                           onValueChange={(val) => handleTypeChange(item.id, val)}
                         >
                           <SelectTrigger className="h-10 md:w-60 border-slate-200">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {DOCUMENT_TYPES.map((type) => (
                               <SelectItem key={type.id} value={type.id}>
                                 {type.label}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         
                         <div className="flex gap-1">
                           <Button 
                             variant="ghost" 
                             size="icon" 
                             type="button"
                             onClick={() => setPreviewFile(item)}
                             className="h-10 w-10 text-primary hover:bg-primary/5 rounded-full"
                           >
                             <Eye className="w-4 h-4" />
                           </Button>
                           <Button 
                             variant="ghost" 
                             size="icon" 
                             type="button"
                             onClick={() => removeFile(item.id)}
                             className="h-10 w-10 text-destructive hover:bg-destructive/5 rounded-full"
                           >
                             <X className="w-4 h-4" />
                           </Button>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl">Originator Comments</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
             <Textarea 
               placeholder="Provide any additional context for the KYC Officer..." 
               className="min-h-[140px] focus-visible:ring-primary border-slate-200 rounded-xl" 
               value={remarks}
               onChange={(e) => setRemarks(e.target.value)}
             />
          </CardContent>
          <CardFooter className="flex flex-col md:flex-row justify-between gap-4 border-t pt-8">
            <div className="flex gap-3 w-full md:w-auto">
              <Button variant="outline" type="button" className="flex-1 md:flex-none px-8" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1 md:flex-none px-12 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                {loading ? "Establishing Secure Connection..." : "Dispatch for Review"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Document Inspection</DialogTitle>
            <DialogDescription>{previewFile?.file.name} • {previewFile?.type.replace('_', ' ')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-xl border bg-slate-900 p-2 flex items-center justify-center min-h-[500px]">
            {previewFile?.file.type.startsWith('image/') ? (
              <img src={previewFile.previewUrl} alt="Preview" className="max-w-full max-h-[70vh] object-contain shadow-2xl" />
            ) : (
              <div className="text-center text-white space-y-4">
                <FileText className="w-16 h-16 mx-auto opacity-50" />
                <p>PDF Preview not available in this browser window.<br/>Please download to verify content if needed.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
             <Button variant="outline" onClick={() => setPreviewFile(null)}>Close Preview</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
