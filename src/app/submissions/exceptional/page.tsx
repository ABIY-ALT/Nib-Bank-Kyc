
"use client"

import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, doc, updateDoc, setDoc } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState, useRef } from "react";
import { KYCSubmission, ExceptionalStatus } from "@/lib/kyc-data";
import { Zap, Loader2, Search, Info, Plus, FileText, Upload, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ExceptionalCasesPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Initiation Dialog State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [riskJustification, setRiskJustification] = useState("");
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch available cases for Branch Manager to trigger exception on
  const branchCasesQuery = useMemoFirebase(() => {
    if (!db || user.role !== 'Branch Manager') return null;
    return query(
      collection(db, "submissions"),
      where("branch", "==", user.branch || ""),
      where("isExceptional", "==", false)
    );
  }, [db, user.role, user.branch]);

  const { data: availableCases } = useCollection<KYCSubmission>(branchCasesQuery);

  const selectedCase = useMemo(() => 
    availableCases?.find(c => c.id === selectedCaseId), 
  [availableCases, selectedCaseId]);

  // 2. Exceptional Queue Query
  const exceptionalQuery = useMemo(() => {
    if (!db) return null;
    
    if (['Admin', 'Director', 'Supervisor'].includes(user.role || '')) {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        orderBy("submittedAt", "desc")
      );
    }

    if (user.role === 'District Director') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("district", "==", user.district || ""),
        orderBy("submittedAt", "desc")
      );
    }

    if (user.role === 'Branch Manager' && user.branch) {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("branch", "==", user.branch),
        orderBy("submittedAt", "desc")
      );
    }

    const assigned = user.assignedBranches || [];
    if (user.role === 'KYC Officer' && assigned.length > 0) {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("branch", "in", assigned),
        orderBy("submittedAt", "desc")
      );
    }

    return null;
  }, [db, user.role, user.branch, user.district, user.assignedBranches]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(exceptionalQuery);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  const handleInitiateException = async () => {
    if (!db || !selectedCaseId || !exceptionReason || !riskJustification) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields and memo are mandatory." });
      return;
    }

    const subRef = doc(db, "submissions", selectedCaseId);
    const updateData = {
      isExceptional: true,
      exceptionalStatus: 'Awaiting District' as ExceptionalStatus,
      exceptionalData: {
        reason: exceptionReason,
        justification: riskJustification,
        memoUrl: "#", // Mocked URL
        initiatedBy: user.name,
        initiatedAt: new Date().toISOString(),
        approvalHistory: []
      }
    };

    // If memo file exists, add it to documents sub-collection
    if (memoFile) {
      const docRef = doc(collection(subRef, "documents"));
      await setDoc(docRef, {
        id: docRef.id,
        name: `Exceptional_Memo_${selectedCaseId}.pdf`,
        type: 'Exceptional Memo',
        uploadedAt: new Date().toISOString(),
        url: "#",
        status: 'Current'
      });
    }

    await updateDoc(subRef, updateData);
    
    toast({ title: "Exception Initiated", description: `Case ${selectedCaseId} forwarded to District Director.` });
    setIsAddDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSelectedCaseId("");
    setExceptionReason("");
    setRiskJustification("");
    setMemoFile(null);
  };

  const handleSeedException = async () => {
    if (!db) return;
    const id = `SEED-KYC-${Math.floor(1000 + Math.random() * 9000)}`;
    const subRef = doc(db, "submissions", id);
    const sampleData: any = {
      id,
      customerName: "Sample High-Value Corp",
      entityType: "corporate",
      branch: user.branch || "Downtown",
      district: user.district || "Central",
      submittedBy: "System Admin",
      submittedAt: new Date().toISOString(),
      status: "Pending",
      isExceptional: true,
      exceptionalStatus: "Awaiting District",
      exceptionalData: {
        reason: "High deposit amount",
        justification: "Strategic corporate partner requiring immediate account activation despite missing secondary utility bill.",
        initiatedBy: user.name,
        initiatedAt: new Date().toISOString(),
        memoUrl: "#",
        approvalHistory: []
      },
      isResubmitted: false,
      amendmentCycles: 0,
      documents: []
    };
    await setDoc(subRef, sampleData);
    toast({ title: "Sample Seeded" });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-600 text-white rounded-lg shadow-lg">
              <Zap className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Exceptional Approvals</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">High-risk and non-standard KYC requests requiring institutional hierarchy oversight.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {user.role === 'Branch Manager' && (
            <Button 
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold h-12 px-6 shadow-xl gap-2"
            >
              <Plus className="w-5 h-5" />
              Initiate Exceptional Request
            </Button>
          )}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search exceptions..." 
              className="pl-11 h-12 rounded-full border-2 border-yellow-600/30 focus-visible:ring-yellow-600/20 bg-white shadow-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Alert className="bg-amber-50 border-amber-200 text-amber-900 shadow-sm">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs font-medium text-amber-800">
          <strong>Hierarchy Protocol:</strong> Exceptional cases are reviewed by the District Director, KYC Director, and Supervisor in sequence. Once approved, they return to the KYC Officer for final processing.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing institutional exceptions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 text-center">
          <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
            <Zap className="w-12 h-12 text-slate-200" />
          </div>
          <div className="space-y-2">
            <p className="font-bold text-slate-900 text-xl">No active exceptions</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">There are currently no high-risk cases awaiting approval in your jurisdiction.</p>
          </div>
          {user.role === 'Admin' && (
            <Button onClick={handleSeedException} variant="outline" className="font-bold border-yellow-600 text-yellow-600">
              Seed Test Exception
            </Button>
          )}
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}

      {/* Initiation Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-600" />
              Institutional Exception Request
            </DialogTitle>
            <DialogDescription>
              Initiate a high-level approval workflow for an existing case in your branch.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Case ID</Label>
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select existing case..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCases?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.id} - {c.customerName}</SelectItem>
                  ))}
                  {(!availableCases || availableCases.length === 0) && (
                    <p className="p-2 text-xs text-center text-muted-foreground">No eligible cases found in your branch.</p>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedCase && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="p-2 bg-white rounded-lg border shadow-sm">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer Name</p>
                  <p className="text-sm font-bold text-slate-900">{selectedCase.customerName}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason for Exception</Label>
                <Select value={exceptionReason} onValueChange={setExceptionReason}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select primary reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Missing critical documents">Missing critical documents</SelectItem>
                    <SelectItem value="High deposit amount">High deposit amount</SelectItem>
                    <SelectItem value="High-risk profile">High-risk profile</SelectItem>
                    <SelectItem value="Case aging beyond SLA">Case aging beyond SLA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Risk Justification</Label>
                <Textarea 
                  placeholder="Provide detailed context for the hierarchy approvers..." 
                  className="min-h-[100px]"
                  value={riskJustification}
                  onChange={(e) => setRiskJustification(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supporting Memo (PDF)</Label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:bg-slate-50 transition-all group"
                >
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-xs font-bold text-slate-600">{memoFile ? memoFile.name : "Upload Signed Approval Memo"}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">Mandatory institutional evidence</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".pdf" 
                  onChange={(e) => setMemoFile(e.target.files?.[0] || null)} 
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-6 border-t mt-4">
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button 
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-black px-8 shadow-lg"
              disabled={!selectedCaseId || !exceptionReason || !riskJustification}
              onClick={handleInitiateException}
            >
              Dispatch Exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
