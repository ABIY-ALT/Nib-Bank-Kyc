
"use client"

import { useState, useRef } from "react";
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
import { Upload, FilePlus, Shield, Info, X, FileText } from "lucide-react";
import { useFirestore, useAuth } from "@/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { currentUser } from "@/lib/auth-mock";

interface UploadedFile {
  id: string;
  file: File;
  type: string;
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
  const db = useFirestore();
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [entityType, setEntityType] = useState("individual");
  const [remarks, setRemarks] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        type: "id_card"
      }));
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
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
      branch: currentUser.branch || "Headquarters",
      submittedBy: currentUser.name,
      submittedAt: new Date().toISOString(),
      status: "Pending",
      remarks,
    };

    setDoc(submissionRef, submissionData)
      .then(() => {
        // In a real app, we'd upload files to Storage and save refs here.
        // For this prototype, we'll just simulate the document sub-collection records.
        uploadedFiles.forEach(file => {
          const docRef = doc(collection(submissionRef, "documents"));
          setDoc(docRef, {
            id: docRef.id,
            name: file.file.name,
            type: file.type,
            uploadedAt: new Date().toISOString(),
            url: "#" // Mock URL
          });
        });

        toast({
          title: "Submission Created",
          description: `KYC request ${submissionId} has been submitted successfully.`,
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New KYC Submission</h1>
        <p className="text-muted-foreground">Submit a new customer for identity verification.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Customer Information
            </CardTitle>
            <CardDescription>Provide basic legal entity details.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Customer Full Name / Entity</Label>
              <Input 
                id="name" 
                placeholder="Legal Name" 
                required 
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Entity Type</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="ngo">NGO / Non-Profit</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Originating Branch</Label>
              <Input id="branch" value={currentUser.branch || "Headquarters"} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilePlus className="w-5 h-5 text-primary" />
              Documentation
            </CardTitle>
            <CardDescription>Upload necessary verification documents and categorize them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
               className="border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 hover:bg-accent/5 transition-colors cursor-pointer group"
             >
                <div className="bg-primary/10 p-4 rounded-full group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Click to upload files</p>
                  <p className="text-sm text-muted-foreground">or drag and drop files here (PDF, JPG, PNG)</p>
                </div>
                <Button variant="outline" type="button">Select Files</Button>
             </div>

             {uploadedFiles.length > 0 && (
               <div className="space-y-4">
                 <Label className="text-base font-semibold">Selected Documents ({uploadedFiles.length})</Label>
                 <div className="grid gap-3">
                   {uploadedFiles.map((item) => (
                     <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border rounded-lg bg-card shadow-sm">
                       <div className="flex items-center gap-3 flex-1">
                         <div className="p-2 bg-muted rounded-md">
                           <FileText className="w-5 h-5 text-primary" />
                         </div>
                         <div className="flex flex-col overflow-hidden">
                           <span className="text-sm font-medium truncate max-w-[200px] md:max-w-xs">{item.file.name}</span>
                           <span className="text-[10px] text-muted-foreground">{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                         </div>
                       </div>
                       
                       <div className="flex items-center gap-2 w-full md:w-auto">
                         <div className="flex-1 md:w-64">
                           <Select 
                             value={item.type} 
                             onValueChange={(val) => handleTypeChange(item.id, val)}
                           >
                             <SelectTrigger className="h-9">
                               <SelectValue placeholder="Select doc type" />
                             </SelectTrigger>
                             <SelectContent>
                               {DOCUMENT_TYPES.map((type) => (
                                 <SelectItem key={type.id} value={type.id}>
                                   {type.label}
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         </div>
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           type="button"
                           onClick={() => removeFile(item.id)}
                           className="h-9 w-9 text-destructive hover:bg-destructive/10 shrink-0"
                         >
                           <X className="w-4 h-4" />
                         </Button>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             <div className="flex gap-4 p-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm">
                <Info className="w-5 h-5 shrink-0" />
                <p>Ensure all documents are clearly legible and valid for at least 6 months from today's date.</p>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Initial Remarks</CardTitle>
          </CardHeader>
          <CardContent>
             <Textarea 
               placeholder="Add any initial observations or context for the KYC Officer..." 
               className="min-h-[120px]" 
               value={remarks}
               onChange={(e) => setRemarks(e.target.value)}
             />
          </CardContent>
          <CardFooter className="flex justify-end gap-3 border-t pt-6">
            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading} className="px-8">
              {loading ? "Submitting..." : "Submit for Review"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
