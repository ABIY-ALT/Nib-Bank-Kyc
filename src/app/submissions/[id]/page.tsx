"use client"

import { useParams, useRouter } from "next/navigation";
import { currentUser } from "@/lib/auth-mock";
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
  const user = currentUser;
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
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

  // Auto-set to "In Review" when a KYC Officer opens a pending case
  useEffect(() => {
    const isReviewer = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);
    if (submission && (submission.status === 'Pending') && isReviewer && submissionRef && !submission.isResubmitted) {
      updateDoc(submissionRef, { 
        status: 'In Review',
      }).catch(() => {});
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

  const handleAction = async (action: string) => {
    if (!submissionRef || !db) return;

    if ((action === 'Amended' || action === 'Rejected' || action === 'Escalated') && !remarks.trim()) {
      toast({
        variant: "destructive",
        title: "Instructions Required",
        description: `Please provide specific feedback for the ${action === 'Amended' ? 'Amendment' : action}.`,
      });
      return;
    }

    setLoading(true);

    const updateData: any = {
      status: action,
      remarks: remarks || submission.remarks || "", 
    };

    // If correction being submitted by owner
    if (action === 'Pending' && isAmended && isOwner) {
       updateData.isResubmitted = true;
       updateData.resubmittedAt = new Date().toISOString();
       
       for (const file of newFiles) {
         const docRef = doc(collection(submissionRef, "documents"));
         setDoc(docRef, {
           id: docRef.id,
           name: file.file.name,
           type: file.type,
           uploadedAt: new Date().toISOString(),
           url: "#",
           status: 'Current'
         });
       }
    }

    updateDoc(submissionRef, updateData)
      .then(() => {
        toast({
          title: action === 'Pending' ? "Correction Resubmitted" : "Status Updated",
          description: action === 'Pending' ? "The case has been returned to the Review Queue." : `Case moved to ${action}.`,
        });
        router.back();
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: submissionRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
      });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold font-headline">{submission.id}</h1>
              <Badge variant={submission.status === 'Approved' ? 'default' : 'outline'} className={
                submission.status === 'Approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm' :
                submission.status === 'Rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                submission.status === 'Amended' ? 'bg-orange-100 text-orange-800 border-orange-200 animate-pulse' :
                submission.status === 'Escalated' ? 'bg-purple-100 text-purple-800 border-purple-200' : 
                submission.status === 'In Review' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''
              }>
                {submission.status === 'Amended' ? 'Action Required' : 
                 (submission.isResubmitted && submission.status === 'Pending' ? 'Pending Review' : submission.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground font-medium">{submission.customerName} • {submission.branch} Branch</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => toast({ title: "Bundle Generated", description: "Downloading complete document package..." })}>
            <Download className="w-4 h-4 mr-2" /> Download Pack
           </Button>
           <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-2" /> Audit Trail
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Verification Assets</CardTitle>
                <CardDescription>Tagged customer documents for verification.</CardDescription>
              </div>
              {isOwner && isAmended && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="bg-primary/5 text-primary border-primary/20 hover:bg-primary/10">
                  <FilePlus className="w-4 h-4 mr-2" /> Add Correction
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                multiple 
              />
              <div className="space-y-4">
                {documents && documents.length > 0 ? (
                  documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50 transition-all group border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/5 p-3 rounded-lg text-primary group-hover:bg-primary/10 transition-colors">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{doc.name}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            {doc.type.replace('_', ' ')} • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" onClick={() => toast({ title: "Download", description: `Downloading ${doc.name}` })} className="rounded-full"><Download className="w-4 h-4" /></Button>
                         <Button variant="ghost" size="icon" asChild className="rounded-full">
                           <a href={doc.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
                         </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-12 text-muted-foreground italic bg-slate-50 rounded-xl border border-dashed">No verification documents in this file.</p>
                )}
                
                {/* Branch Officer Correction Workspace */}
                {newFiles.map((item) => (
                  <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border border-blue-200 bg-blue-50/30 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold truncate">{item.file.name}</span>
                        <span className="text-xs text-blue-600 font-bold uppercase tracking-tighter">Ready for resubmission</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <Select value={item.type} onValueChange={(val) => handleNewFileTypeChange(item.id, val)}>
                        <SelectTrigger className="h-10 w-48 bg-white border-blue-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeNewFile(item.id)} className="text-destructive hover:bg-red-50 rounded-full">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl">Review Context</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border p-5 bg-slate-50 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px] shadow-inner">
                {submission.remarks || "No additional remarks provided for this submission."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader><CardTitle className="text-lg">Customer Data</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Legal Identity</span>
                <span className="text-sm font-bold text-slate-900">{submission.customerName}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entity Classification</span>
                <span className="text-sm capitalize font-medium">{submission.entityType || 'Individual'}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sourcing Branch</span>
                <span className="text-sm font-medium">{submission.branch}</span>
              </div>
              <Separator className="bg-slate-100" />
              <div className="grid gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" /> Originator: {submission.submittedBy}</div>
                <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-400" /> Created: {new Date(submission.submittedAt).toLocaleString()}</div>
                {submission.isResubmitted && (
                  <div className="flex items-center gap-2 text-primary font-bold bg-primary/5 p-2 rounded-lg">
                    <History className="w-3.5 h-3.5" /> Corrected: {new Date(submission.resubmittedAt!).toLocaleString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KYC Officer Workspace */}
          {isKYCOfficer && (submission.status === 'Pending' || submission.status === 'In Review') && (
            <Card className="border-primary/20 shadow-xl ring-1 ring-primary/5">
              <CardHeader>
                <CardTitle className="text-lg">Compliance Decision</CardTitle>
                <CardDescription>Review documents and determine outcome.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold flex items-center gap-1 uppercase tracking-tight text-slate-600">
                    <MessageSquare className="w-3 h-3" /> Reviewer Remarks
                  </label>
                  <Textarea 
                    placeholder="Document blurry? Missing proof of address? Enter specific instructions here..." 
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="min-h-[140px] bg-white border-slate-200 focus-visible:ring-primary rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleAction('Approved')} className="bg-[#4CAF50] hover:bg-[#43A047] text-white font-bold h-11" disabled={loading}>Approve</Button>
                  <Button onClick={() => handleAction('Amended')} variant="outline" className="bg-[#FFF8F1] text-[#E67E22] border-[#FDE3CF] hover:bg-[#FDE3CF] font-bold h-11" disabled={loading}>Request Fix</Button>
                  <Button onClick={() => handleAction('Escalated')} variant="outline" className="bg-[#F5F3FF] text-[#8B5CF6] border-[#EDE9FE] hover:bg-[#EDE9FE] font-bold h-11" disabled={loading}>Escalate</Button>
                  <Button onClick={() => handleAction('Rejected')} variant="destructive" className="bg-[#EF5350] hover:bg-[#D32F2F] font-bold h-11" disabled={loading}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Branch Officer Correction Loop UI */}
          {isOwner && isAmended && (
             <Card className="border-orange-300 bg-orange-50/50 shadow-lg ring-1 ring-orange-200">
               <CardHeader>
                 <CardTitle className="text-lg text-orange-900 flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5" />
                   Correction Loop
                 </CardTitle>
                 <CardDescription className="text-orange-800 font-medium italic">Officer: Please address the instructions in the context panel.</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-orange-900 uppercase tracking-tight">Your Correction Summary</label>
                   <Textarea 
                     placeholder="List the fixes made (e.g., 'Uploaded clear scan of National ID')..." 
                     value={remarks}
                     onChange={(e) => setRemarks(e.target.value)}
                     className="bg-white border-orange-200 rounded-xl"
                   />
                 </div>
                 <Button 
                   className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-12 shadow-lg shadow-orange-200"
                   onClick={() => handleAction('Pending')}
                   disabled={loading || (newFiles.length === 0 && !remarks.trim())}
                 >
                   <Upload className="w-4 h-4 mr-2" />
                   {loading ? "Synchronizing..." : "Submit Correction"}
                 </Button>
               </CardContent>
             </Card>
          )}

          {/* Supervisor Resolution */}
          {isSupervisor && submission.status === 'Escalated' && (
            <Card className="border-purple-300 bg-purple-50/50 shadow-xl ring-1 ring-purple-200">
               <CardHeader>
                 <CardTitle className="text-lg text-purple-900 flex items-center gap-2">
                   <ShieldAlert className="w-5 h-5" />
                   Supervisory Resolution
                 </CardTitle>
                 <CardDescription className="text-purple-800 font-medium">Final determination for escalated risk profile.</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-purple-900 uppercase tracking-tight">Resolution Rationale</label>
                   <Textarea 
                     placeholder="Document final decision for audit trail..." 
                     value={remarks}
                     onChange={(e) => setRemarks(e.target.value)}
                     className="bg-white border-purple-200 rounded-xl"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => handleAction('Approved')} className="bg-[#4CAF50] hover:bg-[#43A047] text-white font-bold h-11">Approve</Button>
                    <Button onClick={() => handleAction('Rejected')} variant="destructive" className="bg-[#EF5350] hover:bg-[#D32F2F] font-bold h-11">Reject</Button>
                 </div>
               </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
