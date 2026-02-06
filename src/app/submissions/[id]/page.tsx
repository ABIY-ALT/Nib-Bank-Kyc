
"use client"

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
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
  ArrowLeft
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useCollection } from "@/firebase";
import { doc, updateDoc, collection, setDoc } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { KYCSubmission, Document } from "@/lib/kyc-data";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

const DOCUMENT_TYPES = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "incorporation", label: "Certificate of Incorporation" },
  { id: "tax_cert", label: "Tax Certificate" },
  { id: "other", label: "Other Document" },
];

interface UploadedFile {
  id: string;
  file: File;
  type: string;
}

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useAuth();
  const [remarks, setRemarks] = useState("");
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submissionRef = useMemo(() => {
    if (!db || !params.id) return null;
    return doc(db, "submissions", params.id as string);
  }, [db, params.id]);

  const { data: submission, loading: subLoading } = useDoc<KYCSubmission>(submissionRef);

  const docsQuery = useMemo(() => {
    if (!submissionRef) return null;
    return collection(submissionRef, "documents");
  }, [submissionRef]);

  const { data: documents } = useCollection<Document>(docsQuery);

  useEffect(() => {
    const isReviewer = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);
    if (submission && (submission.status === 'Pending') && isReviewer && submissionRef && !submission.isResubmitted) {
      updateDoc(submissionRef, { status: 'In Review' }).catch(() => {});
    }
  }, [submission, user.role, submissionRef]);

  if (subLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Retrieving case file...</div>;
  if (!submission) return <div className="p-12 text-center">Case file not found.</div>;

  const isOwner = submission.submittedBy === user.name;
  const isKYCOfficer = ['KYC Officer', 'Admin'].includes(user.role);
  const isSupervisor = ['Supervisor', 'Director'].includes(user.role);
  const isAmended = submission.status === 'Amended';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const added = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        type: "id_card"
      }));
      setNewFiles((prev) => [...prev, ...added]);
    }
  };

  const removeNewFile = (id: string) => {
    setNewFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleNewFileTypeChange = (id: string, newType: string) => {
    setNewFiles((prev) => prev.map(f => f.id === id ? { ...f, type: newType } : f));
  };

  const handleAction = (action: string) => {
    if (!submissionRef || !db) return;

    if ((action === 'Amended' || action === 'Rejected' || action === 'Escalated') && !remarks.trim()) {
      toast({
        variant: "destructive",
        title: "Instructions Required",
        description: `Please provide specific feedback for the ${action}.`,
      });
      return;
    }

    const updateData: any = {
      status: action,
      remarks: remarks || submission.remarks || "", 
    };

    if (['Approved', 'Amended', 'Rejected', 'Escalated'].includes(action)) {
      updateData.reviewedBy = user.name;
      updateData.reviewedAt = new Date().toISOString();
    }

    if (action === 'Pending' && isAmended && isOwner) {
       updateData.isResubmitted = true;
       updateData.resubmittedAt = new Date().toISOString();
       
       newFiles.forEach(file => {
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
    }

    updateDoc(submissionRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: submissionRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: action === 'Pending' ? "Correction Resubmitted" : "Status Updated",
      description: `Case moved to ${action}.`,
    });
    router.back();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold font-headline">{submission.id}</h1>
              <Badge variant={submission.status === 'Approved' ? 'default' : 'outline'} className={
                submission.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                submission.status === 'Amended' ? 'bg-orange-100 text-orange-800' : ''
              }>
                {submission.status === 'Amended' ? 'Action Required' : submission.status}
              </Badge>
            </div>
            <p className="text-muted-foreground font-medium">{submission.customerName} • {submission.branch} Branch</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => toast({ title: "Bundle Generated", description: "Downloading package..." })}>
            <Download className="w-4 h-4 mr-2" /> Download Pack
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Verification Assets</CardTitle>
                <CardDescription>Tagged customer documents.</CardDescription>
              </div>
              {isOwner && isAmended && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <FilePlus className="w-4 h-4 mr-2" /> Add Correction
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} multiple />
              <div className="space-y-4">
                {documents?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50 transition-all group border-slate-200">
                      <div className="flex items-center gap-4">
                        <FileText className="w-6 h-6 text-primary" />
                        <div>
                          <p className="font-bold text-slate-900">{doc.name}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            {doc.type.replace('_', ' ')} • {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" asChild className="rounded-full">
                           <a href={doc.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
                         </Button>
                      </div>
                    </div>
                ))}
                {newFiles.map((item) => (
                  <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border border-blue-200 bg-blue-50/30 rounded-xl">
                    <span className="text-sm font-bold flex-1">{item.file.name}</span>
                    <Select value={item.type} onValueChange={(val) => handleNewFileTypeChange(item.id, val)}>
                      <SelectTrigger className="h-10 w-48 bg-white border-blue-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => removeNewFile(item.id)} className="text-destructive rounded-full">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader><CardTitle className="text-xl">Review Context</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-xl border p-5 bg-slate-50 text-slate-700 text-sm whitespace-pre-wrap min-h-[120px]">
                {submission.remarks || "No additional remarks."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader><CardTitle className="text-lg">Customer Data</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Legal Identity</span>
                <span className="text-sm font-bold text-slate-900">{submission.customerName}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Branch</span>
                <span className="text-sm font-medium">{submission.branch}</span>
              </div>
              <Separator />
              <div className="grid gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Originator: {submission.submittedBy}</div>
                <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Created: {new Date(submission.submittedAt).toLocaleString()}</div>
              </div>
            </CardContent>
          </Card>

          {isKYCOfficer && (submission.status === 'Pending' || submission.status === 'In Review') && (
            <Card className="border-primary/20 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">Compliance Decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  placeholder="Enter specific instructions..." 
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="min-h-[140px]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleAction('Approved')} className="bg-[#4CAF50] hover:bg-[#43A047] font-bold">Approve</Button>
                  <Button onClick={() => handleAction('Amended')} variant="outline" className="text-[#E67E22] font-bold">Request Fix</Button>
                  <Button onClick={() => handleAction('Escalated')} variant="outline" className="text-[#8B5CF6] font-bold">Escalate</Button>
                  <Button onClick={() => handleAction('Rejected')} variant="destructive" className="font-bold">Reject</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isOwner && isAmended && (
             <Card className="border-orange-300 bg-orange-50/50 shadow-lg">
               <CardHeader>
                 <CardTitle className="text-lg text-orange-900 flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5" /> Correction Loop
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <Textarea 
                   placeholder="Summary of fixes..." 
                   value={remarks}
                   onChange={(e) => setRemarks(e.target.value)}
                 />
                 <Button 
                   className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-12"
                   onClick={() => handleAction('Pending')}
                   disabled={newFiles.length === 0 && !remarks.trim()}
                 >
                   Submit Correction
                 </Button>
               </CardContent>
             </Card>
          )}
        </div>
      </div>
    </div>
  );
}
