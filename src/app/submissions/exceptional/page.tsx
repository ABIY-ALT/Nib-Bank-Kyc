"use client"

import { useEffect, useMemo, useState, useRef } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { Zap, Loader2, Search, Info, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth";
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

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

export default function ExceptionalCasesPage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
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
  const canTrigger = hasPermission('BRANCH_CASE_CREATE');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const assignedBranches = user.assignedBranches || [];
      const isDistrictDirector = user.roles?.some((ur: any) => ur.role?.name === 'DISTRICT_DIRECTOR');
      const branchContext = isAdmin ? undefined : (user.branchName || "RESTRICTED_BRANCH");
      const branchesContext = isAdmin ? undefined : (assignedBranches.length > 0 ? assignedBranches : undefined);
      const districtContext = isDistrictDirector ? user.districtName : undefined;

      const exceptionalPromise = getSubmissions({ 
        isExceptional: true,
        branch: !isDistrictDirector ? branchContext : undefined,
        branches: !isDistrictDirector ? branchesContext : undefined,
        district: districtContext
      });

      const availablePromise = getSubmissions({ 
        isExceptional: false, 
        branch: !isDistrictDirector ? branchContext : undefined,
        branches: !isDistrictDirector ? branchesContext : undefined,
        district: districtContext
      });

      const [exceptional, all] = await Promise.all([exceptionalPromise, availablePromise]);
      const activeExceptional = exceptional || [];
      const available = (all || []).filter((candidate: any) =>
        !activeExceptional.some((existing: any) => existing.id === candidate.id)
      );
      setSubmissions(activeExceptional);
      setAvailableCases(available);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ variant: "destructive", title: "File Too Large", description: "Memo exceeds the 30MB institutional limit." });
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({ variant: "destructive", title: "Invalid Type", description: "Only PDF or image files are allowed." });
        return;
      }
      setMemoFile(file);
    }
  };

  const handleInitiateException = async () => {
    if (!user || !selectedCaseId || !exceptionReason || !riskJustification || !memoFile) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields (including PDF/Image memo) are required." });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('id', selectedCaseId);
      formData.append('reason', exceptionReason);
      formData.append('justification', riskJustification);
      formData.append('remarks', remarks);
      formData.append('initiatedBy', user.name);
      formData.append('userId', user.id);
      formData.append('memo', memoFile);

      const res = await initiateExceptionalWorkflow(formData);
      
      if (res.success) {
        toast({ title: "Successful", description: "Case dispatched to Governance branches." });
        setIsAddDialogOpen(false);
        resetForm();
        await loadData();
      } else {
        throw new Error(res.error);
      }
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
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Exceptional Approvals</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Hierarchy oversight for high-risk and non-standard verification requests.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {canTrigger && (
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
            Standard Protocol: Exceptional cases require sequential sign-off from District, Director, and Supervisor branches.
          </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing exceptions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 text-center">
          <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
            <Zap className="w-12 h-12 text-slate-200" />
          </div>
          <div className="space-y-2">
            <p className="font-bold text-slate-900 text-xl">Exception Queue Empty</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">No high-risk cases currently require hierarchy oversight in your branch.</p>
          </div>
        </div>
      ) : (
        <SubmissionsPageContent submissions={filteredSubmissions || []} />
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white space-y-1">
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl"><Zap className="w-6 h-6 text-white fill-white" /></div>
              Initiate Exceptional Flow
            </DialogTitle>
            <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest pl-11">
              Promoting case to hierarchy governance
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Case ID</Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger className="h-12 border-slate-200 rounded-xl font-bold"><SelectValue placeholder="Select ID..." /></SelectTrigger>
                  <SelectContent>
                    {availableCases.length === 0 ? (
                      <SelectItem value="none" disabled>No cases discovered in branch</SelectItem>
                    ) : availableCases.map(c => <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer Identity</Label>
                <div className="h-12 border rounded-xl bg-slate-50 px-4 flex items-center text-sm font-black text-slate-900 truncate">
                  {selectedCase ? selectedCase.customerName : "---"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Escalation Trigger</Label>
              <Select value={exceptionReason} onValueChange={setExceptionReason}>
                <SelectTrigger className="h-12 border-slate-200 rounded-xl font-bold"><SelectValue placeholder="Select classification..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Missing critical documents">Missing critical documents</SelectItem>
                  <SelectItem value="High deposit amount">High deposit amount</SelectItem>
                  <SelectItem value="High-risk profile">High-risk profile</SelectItem>
                  <SelectItem value="Case aging beyond SLA">Case aging beyond SLA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Governance Justification</Label>
              <Textarea 
                placeholder="Detail why this case requires high-level sign-off..." 
                className="min-h-[100px] rounded-xl font-medium" 
                value={riskJustification} 
                onChange={(e) => setRiskJustification(e.target.value)} 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Institutional Memo (PDF/Image)</Label>
              <div 
                onClick={() => fileInputRef.current?.click()} 
                className="border-2 border-dashed border-primary/20 rounded-2xl p-8 text-center cursor-pointer hover:bg-primary/5 transition-all bg-white group"
              >
                <div className="bg-primary/10 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm font-black text-slate-900">{memoFile ? memoFile.name : "Select Signature-Authorized Memo"}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Maximum 30MB • Only PDF or Image</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".pdf,.jpg,.jpeg,.png" 
                onChange={handleMemoChange} 
              />
            </div>
          </div>

          <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4 rounded-b-3xl">
            <button 
              onClick={() => setIsAddDialogOpen(false)} 
              className="text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
            >
              Abort Request
            </button>
            <Button 
              className="bg-primary hover:bg-primary/90 text-white font-black px-10 shadow-xl h-14 rounded-xl" 
              disabled={!selectedCaseId || !memoFile} 
              onClick={handleInitiateException}
            >
              Dispatch to Governance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
