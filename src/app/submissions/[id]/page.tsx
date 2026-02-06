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
  ShieldAlert
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useCollection } from "@/firebase";
import { doc, updateDoc, collection, serverTimestamp, setDoc } from "firebase/firestore";
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
    const canReview = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);
    if (submission && (submission.status === 'Pending') && canReview && submissionRef) {
      updateDoc(submissionRef, { 
        status: 'In Review',
      }).catch(() => {});
    }
  }, [submission, user.role, submissionRef]);

  if (subLoading) return <div className="p-12 text-center text-muted-foreground">Loading submission details...</div>;
  if (!submission) return <div className="p-12 text-center">Submission not found.</div>;

  const isOwner = submission.submittedBy === user.name;
  const isKYCOfficer = user.role === 'KYC Officer' || user.role === 'Admin';
  const isSupervisor = user.role === 'Supervisor' || user.role === 'Director';
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
        title: "Remarks Required",
        description: `Please provide context for the ${action === 'Amended' ? 'Amendment Request' : action}.`,
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
         await setDoc(docRef, {
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
          title: "Submission Updated",
          description: `Case marked as ${action === 'Amended' ? 'Action Required' : action}.`,
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold">{submission.id}</h1>
            <Badge variant={submission.status === 'Approved' ? 'default' : 'outline'} className={
              submission.status === 'Approved' ? 'bg-green-100 text-green-800 border-green-200' :
              submission.status === 'Rejected' ? 'bg-red-100 text-red-800 border-red-200' :
              submission.status === 'Amended' ? 'bg-orange-100 text-orange-800 border-orange-200' :
              submission.status === 'Escalated' ? 'bg-purple-100 text-purple-800 border-purple-200' : 
              submission.status === 'In Review' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''
            }>
              {submission.status === 'Amended' ? 'Action Required' : 
               (submission.isResubmitted && submission.status === 'Pending' ? 'Pending Review' : submission.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground">{submission.customerName} • {submission.branch} Branch</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => toast({ title: "Bundle Generated", description: "Downloading KYC Pack..." })}>
            <Download className="w-4 h-4 mr-2" /> Download Pack
           </Button>
           <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-2" /> Audit Trail
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Verification Documents</CardTitle>
                <CardDescription>Click to view or download document files.</CardDescription>
              </div>
              {isOwner && isAmended && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <FilePlus className="w-4 h-4 mr-2" /> Add Corrected File
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
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/5 p-2 rounded text-primary group-hover:bg-primary/10 transition-colors">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">{doc.type.toUpperCase()} • Received {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" onClick={() => toast({ title: "Download", description: `Downloading ${doc.name}` })}><Download className="w-4 h-4" /></Button>
                         <Button variant="ghost" size="icon" asChild>
                           <a href={doc.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
                         </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 text-muted-foreground italic">No documents currently uploaded.</p>
                )}
                
                {/* Pending New Files in Amendment Mode */}
                {newFiles.map((item) => (
                  <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border border-blue-200 bg-blue-50/30 rounded-lg">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 bg-blue-100 rounded text-blue-600">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{item.file.name}</span>
                        <span className="text-xs text-blue-600 font-semibold italic">Ready for resubmission</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <Select value={item.type} onValueChange={(val) => handleNewFileTypeChange(item.id, val)}>
                        <SelectTrigger className="h-9 w-40 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeNewFile(item.id)} className="text-destructive">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submission Remarks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-4 bg-muted/20 text-sm whitespace-pre-wrap min-h-[120px]">
                {submission.remarks || "No additional remarks provided for this submission."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Customer Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Legal Name</span>
                <span className="text-sm font-semibold">{submission.customerName}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Entity Type</span>
                <span className="text-sm capitalize">{submission.entityType || 'Individual'}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Originating Branch</span>
                <span className="text-sm">{submission.branch}</span>
              </div>
              <Separator />
              <div className="grid gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><User className="w-3 h-3" /> Submitted by {submission.submittedBy}</div>
                <div className="flex items-center gap-2"><Clock className="w-3 h-3" /> Received {new Date(submission.submittedAt).toLocaleString()}</div>
                {submission.isResubmitted && (
                  <div className="flex items-center gap-2 text-primary font-medium">
                    <History className="w-3 h-3" /> Resubmitted {new Date(submission.resubmittedAt!).toLocaleString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KYC Officer Actions */}
          {isKYCOfficer && (submission.status === 'Pending' || submission.status === 'In Review') && (
            <Card className="border-primary/20 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">KYC Reviewer Actions</CardTitle>
                <CardDescription>Conduct review and select outcome.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Reviewer Remarks</label>
                  <Textarea 
                    placeholder="Provide specific reasons for approval, amendment, or rejection..." 
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="min-h-[120px] bg-white border-primary/20 focus-visible:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleAction('Approved')} className="bg-[#78C49D] hover:bg-[#66B38C] text-white font-bold" disabled={loading}>Approve</Button>
                  <Button onClick={() => handleAction('Amended')} variant="outline" className="bg-[#FFF5ED] text-[#E67E22] border-[#FDE3CF] hover:bg-[#FDE3CF] font-bold" disabled={loading}>Amend</Button>
                  <Button onClick={() => handleAction('Escalated')} variant="outline" className="bg-[#F5F3FF] text-[#8B5CF6] border-[#EDE9FE] hover:bg-[#EDE9FE] font-bold" disabled={loading}>Escalate</Button>
                  <Button onClick={() => handleAction('Rejected')} variant="destructive" className="bg-[#F28B82] hover:bg-[#EE675C] font-bold" disabled={loading}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Branch Officer Amendment/Resubmission */}
          {isOwner && isAmended && (
             <Card className="border-orange-300 bg-orange-50 shadow-md">
               <CardHeader>
                 <CardTitle className="text-lg text-orange-900 flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5" />
                   Branch Correction
                 </CardTitle>
                 <CardDescription className="text-orange-700">Please address the reviewer's instructions above.</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-orange-900">Officer Response</label>
                   <Textarea 
                     placeholder="Detail the corrections made or documents added..." 
                     value={remarks}
                     onChange={(e) => setRemarks(e.target.value)}
                     className="bg-white border-orange-200"
                   />
                 </div>
                 <Button 
                   className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold"
                   onClick={() => handleAction('Pending')}
                   disabled={loading || (newFiles.length === 0 && !remarks.trim())}
                 >
                   <Upload className="w-4 h-4 mr-2" />
                   {loading ? "Processing..." : "Submit Corrections"}
                 </Button>
               </CardContent>
             </Card>
          )}

          {/* Supervisor Resolution for Escalated Cases */}
          {isSupervisor && submission.status === 'Escalated' && (
            <Card className="border-purple-300 bg-purple-50 shadow-lg">
               <CardHeader>
                 <CardTitle className="text-lg text-purple-900 flex items-center gap-2">
                   <ShieldAlert className="w-5 h-5" />
                   Supervisor Oversight
                 </CardTitle>
                 <CardDescription className="text-purple-700">Final resolution for escalated case.</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-purple-900">Resolution Remarks</label>
                   <Textarea 
                     placeholder="Final decision rationale..." 
                     value={remarks}
                     onChange={(e) => setRemarks(e.target.value)}
                     className="bg-white border-purple-200"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => handleAction('Approved')} className="bg-[#78C49D] hover:bg-[#66B38C] text-white font-bold">Resolve: Approve</Button>
                    <Button onClick={() => handleAction('Rejected')} variant="destructive" className="bg-[#F28B82] hover:bg-[#EE675C] font-bold">Resolve: Reject</Button>
                 </div>
               </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
