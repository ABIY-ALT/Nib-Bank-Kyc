
"use client"

import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, doc, updateDoc, setDoc } from "firebase/firestore";
import { SubmissionsPageContent } from "../submissions-content";
import { useMemo, useState, useRef } from "react";
import { KYCSubmission, ExceptionalStatus } from "@/lib/kyc-data";
import { Zap, Loader2, Search, Info, Plus, FileText, Upload, ShieldAlert, FileType, CheckCircle2, Beaker } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
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
  const [remarks, setRemarks] = useState("");
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user.role === 'Admin';

  // 1. Fetch available cases for Branch Manager/Admin to trigger exception on
  // Changed: Removing where("isExceptional", "==", false) filter to handle legacy cases missing the field
  const branchCasesQuery = useMemoFirebase(() => {
    if (!db) return null;
    const canTrigger = user.role === 'Branch Manager' || isAdmin;
    if (!canTrigger) return null;

    if (isAdmin) {
      return query(collection(db, "submissions"));
    }

    return query(
      collection(db, "submissions"),
      where("branch", "==", user.branch || "")
    );
  }, [db, user.role, user.branch, isAdmin]);

  const { data: rawAvailableCases } = useCollection<KYCSubmission>(branchCasesQuery);

  // Client-side filter to be robust against missing isExceptional flags
  const availableCases = useMemo(() => {
    return rawAvailableCases?.filter(c => c.isExceptional !== true) || [];
  }, [rawAvailableCases]);

  const selectedCase = useMemo(() => 
    availableCases?.find(c => c.id === selectedCaseId), 
  [availableCases, selectedCaseId]);

  // 2. Exceptional Queue Query - Institutional Visibility
  const exceptionalQuery = useMemo(() => {
    if (!db) return null;
    
    // Management & Global Roles
    if (['Admin', 'Director', 'Supervisor'].includes(user.role || '')) {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        orderBy("submittedAt", "desc")
      );
    }

    // Regional Roles
    if (user.role === 'District Director') {
      return query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("district", "==", user.district || ""),
        orderBy("submittedAt", "desc")
      );
    }

    // Branch Roles (Managers and assigned KYC Officers)
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

  // TESTING UTILITY: Seed a sample case that is eligible for the dropdown
  const handleSeedSampleCase = () => {
    if (!db) return;
    const testId = `SEED-KYC-${Math.floor(1000 + Math.random() * 9000)}`;
    const ref = doc(db, "submissions", testId);
    const data = {
      id: testId,
      customerName: "Sample Test Customer (Auto-Seeded)",
      entityType: "individual",
      branch: user.branch || "Headquarters",
      district: user.district || "Central",
      submittedBy: user.name,
      submittedAt: new Date().toISOString(),
      status: "Pending",
      isResubmitted: false,
      amendmentCycles: 0,
      isExceptional: false // This ensures it shows up in the dropdown
    };

    setDoc(ref, data).then(() => {
      toast({ title: "Sample Case Created", description: `Case ${testId} is now eligible for the exception workflow.` });
    });
  };

  const handleInitiateException = () => {
    if (!db || !selectedCaseId || !exceptionReason || !riskJustification || !memoFile) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields and the PDF memo are mandatory institutional requirements." });
      return;
    }

    const subRef = doc(db, "submissions", selectedCaseId);
    const updateData = {
      isExceptional: true,
      exceptionalStatus: 'Awaiting District' as ExceptionalStatus,
      remarks: remarks || "",
      exceptionalData: {
        reason: exceptionReason,
        justification: riskJustification,
        memoUrl: "#", 
        initiatedBy: user.name,
        initiatedAt: new Date().toISOString(),
        approvalHistory: []
      }
    };

    updateDoc(subRef, updateData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: subRef.path,
        operation: 'update',
        requestResourceData: updateData
      }));
    });

    // Link memo to document bundle
    const docRef = doc(collection(subRef, "documents"));
    const memoData = {
      id: docRef.id,
      name: `Exceptional_Memo_${selectedCaseId}.pdf`,
      type: 'Exceptional Memo',
      uploadedAt: new Date().toISOString(),
      url: "#",
      status: 'Current'
    };
    
    setDoc(docRef, memoData).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: docRef.path,
        operation: 'create',
        requestResourceData: memoData
      }));
    });
    
    toast({ title: "Exception Initiated", description: `Case ${selectedCaseId} dispatched to District Director.` });
    setIsAddDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSelectedCaseId("");
    setExceptionReason("");
    setRiskJustification("");
    setRemarks("");
    setMemoFile(null);
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
          <p className="text-muted-foreground text-lg font-medium">Hierarchy oversight for high-risk and non-standard verification requests.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {isAdmin && (
            <Button 
              variant="outline"
              onClick={handleSeedSampleCase}
              className="border-dashed border-primary/50 text-primary hover:bg-primary/5 gap-2"
            >
              <Beaker className="w-4 h-4" />
              Seed Sample Case
            </Button>
          )}
          {(user.role === 'Branch Manager' || isAdmin) && (
            <Button 
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-[#B89334] hover:bg-[#A6822D] text-white font-bold h-12 px-8 shadow-xl gap-2 rounded-lg transition-all active:scale-95"
            >
              <Zap className="w-5 h-5 fill-white" />
              Trigger Exception
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

      <Alert className="bg-amber-50 border-amber-200 text-amber-900 shadow-sm border-l-4 border-l-yellow-600">
        <Info className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-xs font-bold text-amber-800 uppercase tracking-tight">
          Institutional Protocol: Exceptional cases require sequential sign-off from District, Director, and Supervisor nodes.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing jurisdictional exceptions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 text-center">
          <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
            <Zap className="w-12 h-12 text-slate-200" />
          </div>
          <div className="space-y-2">
            <p className="font-bold text-slate-900 text-xl">Exception Queue Empty</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">No high-risk cases currently require hierarchy oversight in your jurisdiction.</p>
          </div>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}

      {/* Initiation Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-600 fill-yellow-600" />
              Initiate Exceptional Request
            </DialogTitle>
            <DialogDescription>
              Assign a high-level approval workflow to an existing case.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Case ID Selection</Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger className="h-12 border-slate-200">
                    <SelectValue placeholder="Select Case ID..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCases?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>
                    ))}
                    {(!availableCases || availableCases.length === 0) && (
                      <div className="p-4 text-center">
                        <p className="text-xs text-muted-foreground italic mb-2">No eligible cases found.</p>
                        {isAdmin && (
                          <Button variant="outline" size="sm" onClick={handleSeedSampleCase} className="text-[10px] h-7">
                            Seed Test Case
                          </Button>
                        )}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer Full Name</Label>
                <div className="h-12 border rounded-md bg-slate-50 px-3 flex items-center text-sm font-bold text-slate-900 truncate">
                  {selectedCase ? selectedCase.customerName : "Select Case ID First..."}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exception Reason</Label>
              <Select value={exceptionReason} onValueChange={setExceptionReason}>
                <SelectTrigger className="h-12 border-slate-200"><SelectValue placeholder="Identify primary reason..." /></SelectTrigger>
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
                placeholder="Explain why this exception should be authorized..." 
                className="min-h-[80px] bg-white border-slate-200"
                value={riskJustification}
                onChange={(e) => setRiskJustification(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Institutional Remarks</Label>
              <Textarea 
                placeholder="Additional notes for the District Director..." 
                className="min-h-[80px] bg-white border-slate-200"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supporting Memo (PDF Only)</Label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center cursor-pointer hover:bg-primary/5 transition-all group bg-white shadow-sm"
              >
                <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-bold text-slate-900">{memoFile ? memoFile.name : "Select Institutional Memo"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Required: Official signed PDF memo</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type !== 'application/pdf') {
                    toast({ variant: 'destructive', title: 'Invalid File', description: 'Institutional memos must be in PDF format.' });
                    return;
                  }
                  setMemoFile(file || null);
                }} 
              />
            </div>
          </div>

          <DialogFooter className="pt-6 border-t mt-4 gap-2">
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }} className="px-6 font-bold h-11">Cancel</Button>
            <Button 
              className="bg-[#B89334] hover:bg-[#A6822D] text-white font-black px-10 shadow-lg h-11"
              disabled={!selectedCaseId || !exceptionReason || !riskJustification || !memoFile}
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
