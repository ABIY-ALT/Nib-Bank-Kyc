
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
  Upload
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useCollection } from "@/firebase";
import { doc, updateDoc, collection, serverTimestamp } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { KYCSubmission, Document } from "@/lib/kyc-data";

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const user = currentUser;
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);

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

  // Auto-set status to 'In Review' when an officer opens a 'Pending' case
  useEffect(() => {
    const canReview = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);
    if (submission && submission.status === 'Pending' && canReview && submissionRef) {
      updateDoc(submissionRef, { 
        status: 'In Review',
        lastUpdated: serverTimestamp() 
      }).catch(err => console.error("Auto-review update failed", err));
    }
  }, [submission, user.role, submissionRef]);

  if (subLoading) return <div className="p-12 text-center text-muted-foreground">Loading submission details...</div>;
  if (!submission) return <div className="p-12 text-center">Submission not found.</div>;

  const isOwner = submission.submittedBy === user.name;
  const canAction = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);
  const isAmended = submission.status === 'Amended';

  const handleAction = (action: string) => {
    if (!submissionRef || !db) return;

    // Requirement: Must provide remarks when requesting an amendment
    if (action === 'Amended' && !remarks.trim()) {
      toast({
        variant: "destructive",
        title: "Remarks Required",
        description: "Please specify what needs to be amended so the Branch Officer can fix it.",
      });
      return;
    }

    setLoading(true);

    const updateData: any = {
      status: action,
      remarks: remarks || submission.remarks || "", 
      lastUpdated: serverTimestamp(),
    };

    // If a branch officer is responding to an amendment
    if (action === 'Pending' && isAmended && isOwner) {
       updateData.isResubmitted = true;
       updateData.resubmittedAt = serverTimestamp();
    }

    updateDoc(submissionRef, updateData)
      .then(() => {
        toast({
          title: "Status Updated",
          description: `Submission ${submission.id} is now ${action}.`,
        });
        router.push(canAction ? '/submissions/queue' : '/submissions/my');
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
              submission.status === 'Approved' ? 'bg-green-100 text-green-800' :
              submission.status === 'Rejected' ? 'bg-red-100 text-red-800' :
              submission.status === 'Amended' ? 'bg-orange-100 text-orange-800' :
              submission.status === 'Escalated' ? 'bg-purple-100 text-purple-800' : ''
            }>
              {submission.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{submission.customerName} • {submission.branch} Branch</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => toast({ title: "Bundle Generated", description: "The KYC bundle is being downloaded." })}>
            <Download className="w-4 h-4 mr-2" />
            Bundle
           </Button>
           <Button variant="outline" size="sm" onClick={() => toast({ title: "Audit Logs", description: "Fetching full audit trail..." })}>
            <History className="w-4 h-4 mr-2" />
            Logs
           </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Identity and verification documents for this submission.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documents && documents.length > 0 ? documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 p-2 rounded">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">Uploaded {new Date(doc.uploadedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className="text-[10px] h-5 uppercase">{doc.type}</Badge>
                       <Button variant="ghost" size="icon" onClick={() => toast({ title: "Download", description: `Downloading ${doc.name}...` })}>
                         <Download className="w-4 h-4" />
                       </Button>
                       <Button variant="ghost" size="icon" asChild>
                         <a href={doc.url} target="_blank" rel="noopener noreferrer">
                           <ExternalLink className="w-4 h-4" />
                         </a>
                       </Button>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-muted-foreground">No documents found.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submission Remarks / History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-accent/5 p-4 rounded-lg border italic text-sm">
                {submission.remarks || "No current remarks."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Entity Name</span>
                <span className="text-sm font-medium">{submission.customerName}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Entity Type</span>
                <span className="text-sm capitalize">{submission.entityType || "N/A"}</span>
              </div>
              <Separator />
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Submitted By</span>
                <span className="text-sm flex items-center gap-2">
                  <User className="w-3 h-3" />
                  {submission.submittedBy}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Timeline</span>
                <span className="text-sm flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {new Date(submission.submittedAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {canAction && submission.status !== 'Approved' && submission.status !== 'Rejected' && (
            <Card className="border-primary/20 bg-slate-50/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Workflow Action</CardTitle>
                <CardDescription>Review and resolve this submission.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold flex items-center gap-1 text-slate-700">
                    <MessageSquare className="w-3 h-3" />
                    Review Remarks
                  </label>
                  <Textarea 
                    placeholder="Enter justification, amendment details, or internal notes..." 
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="bg-background min-h-[100px] text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="default" 
                    className="bg-[#78C49D] hover:bg-[#66B38C] text-white w-full border-none shadow-sm h-11"
                    onClick={() => handleAction('Approved')}
                    disabled={loading}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    className="bg-[#FFF5ED] text-[#E67E22] border-[#FDE3CF] hover:bg-[#FDE3CF] w-full h-11"
                    onClick={() => handleAction('Amended')}
                    disabled={loading}
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Amend
                  </Button>
                  <Button 
                    variant="outline" 
                    className="bg-[#F5F3FF] text-[#8B5CF6] border-[#EDE9FE] hover:bg-[#EDE9FE] w-full h-11"
                    onClick={() => handleAction('Escalated')}
                    disabled={loading}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Escalate
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="bg-[#F28B82] hover:bg-[#EE675C] text-white w-full border-none shadow-sm h-11"
                    onClick={() => handleAction('Rejected')}
                    disabled={loading}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isOwner && isAmended && (
             <Card className="border-orange-200 bg-orange-50/30">
               <CardHeader>
                 <CardTitle className="text-lg text-orange-800">Action Required</CardTitle>
                 <CardDescription>This submission requires your correction.</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <p className="text-sm text-orange-900 font-medium">Please review the remarks and upload the missing documents.</p>
                 <Button 
                   className="w-full bg-orange-600 hover:bg-orange-700"
                   onClick={() => handleAction('Pending')}
                   disabled={loading}
                 >
                   <Upload className="w-4 h-4 mr-2" />
                   Mark as Corrected
                 </Button>
               </CardContent>
             </Card>
          )}
        </div>
      </div>
    </div>
  );
}
