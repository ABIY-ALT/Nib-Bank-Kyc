"use client"

import { useParams, useRouter } from "next/navigation";
import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
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
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function SubmissionDetails() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const submission = MOCK_SUBMISSIONS.find(s => s.id === params.id);
  const user = currentUser;
  const [remarks, setRemarks] = useState("");

  if (!submission) return <div>Submission not found</div>;

  const canAction = ['KYC Officer', 'Supervisor', 'Director', 'Admin'].includes(user.role);

  const handleAction = (action: string) => {
    toast({
      title: "Success",
      description: `Submission ${submission.id} has been ${action.toLowerCase()}.`,
    });
    router.push('/submissions');
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
                {submission.documents.map((doc) => (
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
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workflow Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-muted">
                {submission.auditLogs.map((log) => (
                  <div key={log.id} className="relative flex gap-6">
                    <div className="z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background border ring-8 ring-background">
                      <History className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{log.action}</p>
                      <p className="text-xs text-muted-foreground">by {log.performedBy} on {new Date(log.performedAt).toLocaleString()}</p>
                      <div className="mt-2 text-sm bg-accent/5 p-3 rounded border italic">
                        "{log.details}"
                      </div>
                    </div>
                  </div>
                ))}
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
                <span className="text-xs font-semibold text-muted-foreground uppercase">Registration ID</span>
                <span className="text-sm">{submission.customerId}</span>
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
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-orange-600 border-orange-200 hover:bg-orange-50 w-full"
                    onClick={() => handleAction('Amended')}
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Amend
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-purple-600 border-purple-200 hover:bg-purple-50 w-full"
                    onClick={() => handleAction('Escalated')}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Escalate
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => handleAction('Rejected')}
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