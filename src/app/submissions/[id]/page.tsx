
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
  MessageSquare
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useCollection } from "@/firebase";
import { doc, updateDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { KYCSubmission, Document, AuditLog } from "@/lib/kyc-data";

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

  if (subLoading) return <div className="p-12 text-center">Loading submission...</div>;
  if (!submission) return <div className="p-12 text-center">Submission not found</div>;

  const canAction = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);

  const handleAction = (action: string) => {
    if (!submissionRef || !db) return;
    setLoading(true);

    const updateData = {
      status: action,
      lastUpdated: serverTimestamp(),
    };

    updateDoc(submissionRef, updateData)
      .then(() => {
        toast({
          title: "Success",
          description: `Submission ${submission.id} has been ${action.toLowerCase()}.`,
        });
        router.push('/submissions');
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
            <Badge variant={submission.status === 'Approved' ? 'default' : 'outline'}>
              {submission.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{submission.customerName} • {submission.branch} Branch</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Bundle
           </Button>
           <Button variant="outline" size="sm">
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
                       <Badge variant="outline" className="text-[10px] h-5">{doc.type}</Badge>
                       <Button variant="ghost" size="icon">
                         <Download className="w-4 h-4" />
                       </Button>
                       <Button variant="ghost" size="icon">
                         <ExternalLink className="w-4 h-4" />
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
              <CardTitle>Initial Remarks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-accent/5 p-4 rounded-lg border italic">
                {submission.remarks || "No remarks provided."}
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
                <span className="text-sm">{submission.customerName}</span>
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

          {canAction && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-lg">Workflow Action</CardTitle>
                <CardDescription>Review and resolve this submission.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    Review Remarks
                  </label>
                  <Textarea 
                    placeholder="Enter your justification or amendment details..." 
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="bg-background min-h-[100px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="default" 
                    className="bg-green-600 hover:bg-green-700 w-full"
                    onClick={() => handleAction('Approved')}
                    disabled={loading}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-orange-600 border-orange-200 hover:bg-orange-50 w-full"
                    onClick={() => handleAction('Amended')}
                    disabled={loading}
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Amend
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-purple-600 border-purple-200 hover:bg-purple-50 w-full"
                    onClick={() => handleAction('Escalated')}
                    disabled={loading}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Escalate
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="w-full"
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
        </div>
      </div>
    </div>
  );
}
