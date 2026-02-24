"use client"

import { useEffect, useMemo, useState, useRef } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { Zap, Loader2, Search, Info, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-mock";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSubmissions, initiateExceptionalWorkflow } from "@/actions/submissions";
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
import { usePermissions } from "@/hooks/use-permissions";
import Link from "next/link";

export default function ExceptionalCasesPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [availableCases, setAvailableCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [riskJustification, setRiskJustification] = useState("");
  const [remarks, setRemarks] = useState("");
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = isSuperAdmin;

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      const [exceptional, all] = await Promise.all([
        getSubmissions({ isExceptional: true }),
        getSubmissions({ isExceptional: false, branch: isAdmin ? undefined : user.branchName || undefined })
      ]);
      setSubmissions(exceptional);
      setAvailableCases(all);
      setLoading(false);
    }
    loadData();
  }, [user, isAdmin]);

  const selectedCase = useMemo(() => 
    availableCases.find(c => c.id === selectedCaseId), 
  [availableCases, selectedCaseId]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  const handleInitiateException = async () => {
    if (!user || !selectedCaseId || !exceptionReason || !riskJustification || !memoFile) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields are required." });
      return;
    }

    try {
      await initiateExceptionalWorkflow(selectedCaseId, {
        reason: exceptionReason,
        justification: riskJustification,
        remarks,
        initiatedBy: user.name,
        memoData: { name: memoFile.name }
      });
      
      toast({ title: "Exception Initiated", description: "Case dispatched to District Director." });
      setIsAddDialogOpen(false);
      resetForm();
      const exceptional = await getSubmissions({ isExceptional: true });
      setSubmissions(exceptional);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    }
  };

  const resetForm = () => {
    setSelectedCaseId("");
    setExceptionReason("");
    setRiskJustification("");
    setRemarks("");
    setMemoFile(null);
  };

  if (permissionsLoading) return <div className="py-32 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>;

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
            <p className="text-sm text-slate-500 max-w-xs mx-auto">No high-risk cases currently require hierarchy oversight.</p>
          </div>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-600 fill-yellow-600" />
              Initiate Exceptional Request
            </DialogTitle>
            <DialogDescription>Assign a high-level approval workflow to an existing case.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Case ID Selection</Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger className="h-12 border-slate-200"><SelectValue placeholder="Select Case ID..." /></SelectTrigger>
                  <SelectContent>
                    {availableCases.map(c => <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer Full Name</Label>
                <div className="h-12 border rounded-md bg-slate-50 px-3 flex items-center text-sm font-bold text-slate-900 truncate">
                  {selectedCase ? selectedCase.customerName : "Select Case..."}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exception Reason</Label>
              <Select value={exceptionReason} onValueChange={setExceptionReason}>
                <SelectTrigger className="h-12 border-slate-200"><SelectValue placeholder="Select reason..." /></SelectTrigger>
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
              <Textarea placeholder="Explain why..." className="min-h-[80px]" value={riskJustification} onChange={(e) => setRiskJustification(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supporting Memo (PDF Only)</Label>
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center cursor-pointer hover:bg-primary/5 transition-all bg-white shadow-sm">
                <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-bold text-slate-900">{memoFile ? memoFile.name : "Select Institutional Memo"}</p>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={(e) => setMemoFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          <DialogFooter className="pt-6 border-t mt-4 gap-2">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="px-6 font-bold h-11">Cancel</Button>
            <Button className="bg-[#B89334] text-white font-black px-10 shadow-lg h-11" disabled={!selectedCaseId || !memoFile} onClick={handleInitiateException}>
              Dispatch Exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
