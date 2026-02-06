
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
  CheckCircle2
} from "lucide-react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, doc, setDoc, query, orderBy } from "firebase/firestore";
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
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [entityType, setEntityType] = useState("individual");
  const [remarks, setRemarks] = useState("");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Legal Name</Label>
              <Input placeholder="Full legal name" required className="h-11" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Classification</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select classification" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
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
             <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/5">
                <Upload className="w-10 h-10 text-accent mb-4" />
                <p className="font-bold text-xl text-slate-800">Drop customer files here</p>
                <Button variant="outline" type="button" className="mt-4">Browse Filesystem</Button>
             </div>

             {uploadedFiles.map((item) => (
               <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border rounded-xl bg-white shadow-sm">
                 <div className="flex items-center gap-4 flex-1">
                   <FileText className="w-6 h-6 text-slate-600" />
                   <span className="text-sm font-bold truncate">{item.file.name}</span>
                 </div>
                 <Select value={item.type} onValueChange={(val) => handleTypeChange(item.id, val)}>
                   <SelectTrigger className="h-10 md:w-60"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     {DOCUMENT_TYPES.map((type) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}
                   </SelectContent>
                 </Select>
                 <div className="flex gap-1">
                   <Button variant="ghost" size="icon" type="button" onClick={() => setPreviewFile(item)}><Eye className="w-4 h-4" /></Button>
                   <Button variant="ghost" size="icon" type="button" onClick={() => removeFile(item.id)} className="text-destructive"><X className="w-4 h-4" /></Button>
                 </div>
               </div>
             ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-xl">Remarks</CardTitle></CardHeader>
          <CardContent>
             <Textarea placeholder="Context for KYC Officer..." className="min-h-[140px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </CardContent>
          <CardFooter className="flex justify-end gap-4 border-t pt-8">
            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" className="px-12 bg-primary font-bold">Dispatch for Review</Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Inspection</DialogTitle></DialogHeader>
          <div className="flex items-center justify-center min-h-[500px] bg-slate-900 rounded-xl overflow-hidden">
            {previewFile?.file.type.startsWith('image/') ? (
              <img src={previewFile.previewUrl} alt="Preview" className="max-w-full max-h-[70vh] object-contain" />
            ) : <p className="text-white">PDF Preview Unavailable</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
