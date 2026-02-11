
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, where, doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Plus, 
  BookOpen, 
  Copy, 
  Trash2, 
  ShieldAlert, 
  BrainCircuit, 
  Loader2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  ClipboardCheck,
  FileType,
  ArrowRight
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { KYCFinding, KYCSubmission } from '@/lib/kyc-data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { learnKYCFindings } from '@/ai/flows/learn-kyc-findings-flow';
import Link from 'next/link';

const SEVERITY_COLORS = {
  Low: "bg-blue-100 text-blue-800",
  Medium: "bg-yellow-100 text-yellow-800",
  High: "bg-orange-100 text-orange-800",
  Critical: "bg-red-100 text-red-800"
};

const SEVERITY_ICONS = {
  Low: Info,
  Medium: AlertTriangle,
  High: ShieldAlert,
  Critical: AlertTriangle
};

const EXAMPLE_FINDINGS: Partial<KYCFinding>[] = [
  { code: "FQ-001", title: "Illegible Document Scan", description: "The uploaded copy of the National ID is blurred or cut off. Please provide a clear, high-resolution scan showing all four corners of the document.", category: "Documentation", severity: "Low", applicableTo: ["INDIVIDUAL", "COMPANY"], source: "manual" },
  { code: "FQ-002", title: "Expired Trade License", description: "The submitted Trade License has exceeded its validity period. Institutional policy requires a renewed license for the current fiscal year.", category: "Compliance", severity: "High", applicableTo: ["COMPANY"], source: "manual" },
  { code: "FQ-003", title: "Missing TIN Verification", description: "Tax Identification Number (TIN) certificate is mandatory for corporate accounts but was not found in the bundle.", category: "Documentation", severity: "Medium", applicableTo: ["COMPANY", "ASSOCIATION"], source: "manual" },
  { code: "FQ-004", title: "Signature Mismatch", description: "The signature on the account opening form does not match the specimen on the provided National ID. Please verify identity or re-sign.", category: "Identity", severity: "High", applicableTo: ["INDIVIDUAL"], source: "manual" },
  { code: "FQ-005", title: "Initial Deposit Below Threshold", description: "The initial deposit provided is below the minimum required for this account classification.", category: "Account Validation", severity: "Medium", applicableTo: ["INDIVIDUAL", "COMPANY", "ASSOCIATION"], source: "manual" },
];

export default function KYCFQReferencePage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [findingForm, setFindingForm] = useState<Partial<KYCFinding>>({
    code: "",
    title: "",
    description: "",
    category: "Documentation",
    severity: "Low",
    applicableTo: ["INDIVIDUAL"],
    active: true,
    source: "manual"
  });

  const isAdmin = user.role === 'Admin';

  const findingsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "kyc_findings"), orderBy("code")) : null;
  }, [db]);

  const { data: findings, loading } = useCollection<KYCFinding>(findingsQuery);

  const submissionsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "submissions"), where("status", "==", "Amended")) : null;
  }, [db]);

  const { data: pastAmendedCases } = useCollection<KYCSubmission>(submissionsQuery);

  const filteredFindings = useMemo(() => {
    if (!findings) return [];
    return findings.filter(f => {
      const matchesSearch = f.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          f.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          f.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory;
      const matchesSeverity = selectedSeverity === 'all' || f.severity === selectedSeverity;
      return matchesSearch && matchesCategory && matchesSeverity && f.active;
    });
  }, [findings, searchTerm, selectedCategory, selectedSeverity]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Comment Copied", description: "Standardized remark is ready to be pasted." });
  };

  const handleSaveFinding = () => {
    if (!db) return;
    if (!findingForm.code || !findingForm.title || !findingForm.description) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields are required for standardization." });
      return;
    }

    const findingId = findingForm.id || `fq-${Date.now()}`;
    const findingRef = doc(db, "kyc_findings", findingId);
    const data = {
      ...findingForm,
      id: findingId,
      createdAt: new Date().toISOString(),
      active: true,
      source: findingForm.source || 'manual'
    };

    setDoc(findingRef, data)
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: findingRef.path,
          operation: findingForm.id ? 'update' : 'create',
          requestResourceData: data
        }));
      });

    toast({ title: "Finding Registered", description: `Standardized code ${findingForm.code} added to library.` });
    setIsAddDialogOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (!db || !confirm("Caution: Purging this finding will remove it from the institutional reference list. Proceed?")) return;
    const ref = doc(db, "kyc_findings", id);
    deleteDoc(ref).catch(() => {});
    toast({ title: "Finding Purged" });
  };

  const resetForm = () => {
    setFindingForm({
      code: "",
      title: "",
      description: "",
      category: "Documentation",
      severity: "Low",
      applicableTo: ["INDIVIDUAL"],
      active: true,
      source: "manual"
    });
  };

  const handleAutoLearn = async () => {
    if (!pastAmendedCases || pastAmendedCases.length === 0) {
      toast({ title: "Insufficient Data", description: "No historical amendment remarks found to analyze." });
      return;
    }

    setIsLearning(true);
    try {
      const historicalRemarks = pastAmendedCases.map(c => c.remarks || "").filter(r => r.length > 10);
      const existingFindingTitles = findings?.map(f => f.title) || [];

      const result = await learnKYCFindings({ historicalRemarks, existingFindingTitles });

      if (result.suggestedFindings.length === 0) {
        toast({ title: "Analysis Complete", description: "No new recurring patterns identified in recent cases." });
      } else {
        // Automatically add suggested findings
        result.suggestedFindings.forEach((suggestion, idx) => {
          if (!db) return;
          const nextCode = `FQ-A${(findings?.length || 0) + idx + 100}`;
          const id = `auto-${Date.now()}-${idx}`;
          const ref = doc(db, "kyc_findings", id);
          const data = {
            ...suggestion,
            id,
            code: nextCode,
            createdAt: new Date().toISOString(),
            active: true,
            source: 'auto'
          };
          setDoc(ref, data);
        });
        toast({ title: "Institutional Learning Complete", description: `Discovered and added ${result.suggestedFindings.length} new standardized findings.` });
      }
    } catch (error) {
      console.error("AI Learning Error:", error);
      toast({ variant: "destructive", title: "AI Learning Failed", description: "Could not analyze institutional history at this time." });
    } finally {
      setIsLearning(false);
    }
  };

  const handleSeedExamples = () => {
    if (!db) return;
    EXAMPLE_FINDINGS.forEach((f, idx) => {
      const id = `example-${idx}`;
      const ref = doc(db, "kyc_findings", id);
      setDoc(ref, { ...f, id, createdAt: new Date().toISOString(), active: true });
    });
    toast({ title: "Library Seeded", description: "Standardized reference set has been loaded." });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-slate-900 text-white rounded-lg shadow-lg">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">KYC F&amp;Q Reference</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Standardized institutional knowledge base for verification comments and compliance queries.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {isAdmin && (
            <>
              <Button 
                variant="outline" 
                onClick={handleAutoLearn} 
                disabled={isLearning}
                className="gap-2 border-primary/30 text-primary hover:bg-primary/5 font-bold"
              >
                {isLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                AI Learning
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 bg-primary shadow-xl font-bold">
                <Plus className="w-4 h-4" /> Add Finding
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 shadow-sm border-slate-200 h-fit sticky top-20">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Code or keyword..." 
                  className="pl-9 h-10 border-slate-200" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Identity">Identity</SelectItem>
                  <SelectItem value="Documentation">Documentation</SelectItem>
                  <SelectItem value="Compliance">Compliance</SelectItem>
                  <SelectItem value="Account Validation">Account Validation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Severity</Label>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <ClipboardCheck className="w-3.5 h-3.5" /> Compliance Links
              </div>
              <Button variant="link" asChild className="p-0 h-auto text-primary font-bold text-sm justify-start">
                <Link href="/submissions/new">
                  <ArrowRight className="w-3.5 h-3.5 mr-2" /> Start New Submission
                </Link>
              </Button>
              <Button variant="link" onClick={() => toast({ title: "Loading Guidelines..." })} className="p-0 h-auto text-slate-600 font-bold text-sm justify-start">
                <FileType className="w-3.5 h-3.5 mr-2" /> NBE Document Matrix
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-bold">Syncing institutional registry...</p>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 text-center">
              <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
                <BookOpen className="w-12 h-12 text-slate-200" />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-slate-900 text-xl">No Findings Discovered</p>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">Try adjusting your filters or use the seed button to populate the institutional library.</p>
                {isAdmin && (
                  <Button variant="outline" onClick={handleSeedExamples} className="mt-4 border-dashed border-primary/50 text-primary font-bold">
                    Seed Standardized Library
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredFindings.map((finding) => {
                const SeverityIcon = SEVERITY_ICONS[finding.severity] || Info;
                return (
                  <Card key={finding.id} className="group hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col bg-white overflow-hidden border-slate-200">
                    <CardHeader className="bg-slate-50/50 border-b pb-4 pt-5 px-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-primary tracking-tighter uppercase">{finding.code}</span>
                          <CardTitle className="text-lg font-bold leading-tight group-hover:text-primary transition-colors">{finding.title}</CardTitle>
                        </div>
                        <Badge className={SeverityIcon === AlertTriangle ? "bg-red-50 text-red-700 border-red-100" : SEVERITY_COLORS[finding.severity]}>
                          <SeverityIcon className="w-3 h-3 mr-1.5" /> {finding.severity}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 px-6 flex-1 space-y-4">
                      <p className="text-sm text-slate-600 leading-relaxed font-medium line-clamp-4 italic">"{finding.description}"</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none text-[10px] font-bold">{finding.category}</Badge>
                        {finding.applicableTo.map(type => (
                          <Badge key={type} variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-slate-200">{type}</Badge>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50/30 border-t p-4 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {finding.source === 'auto' ? (
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-bold">
                            <BrainCircuit className="w-3 h-3 mr-1" /> AI Suggested
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[9px] font-bold">Manual</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(finding.id)} className="h-8 w-8 text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleCopy(finding.description)} className="h-8 gap-2 font-bold px-4">
                          <Copy className="w-3.5 h-3.5" /> Copy Remark
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Plus className="w-6 h-6 text-primary" /> Register New Finding
            </DialogTitle>
            <DialogDescription>Add a standardized comment to the institutional knowledge base.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Internal Reference Code</Label>
                <Input 
                  placeholder="e.g. FQ-101" 
                  value={findingForm.code} 
                  onChange={e => setFindingForm({...findingForm, code: e.target.value.toUpperCase()})}
                  className="font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Institutional Category</Label>
                <Select value={findingForm.category} onValueChange={(val: any) => setFindingForm({...findingForm, category: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Identity">Identity</SelectItem>
                    <SelectItem value="Documentation">Documentation</SelectItem>
                    <SelectItem value="Compliance">Compliance</SelectItem>
                    <SelectItem value="Account Validation">Account Validation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Finding Title</Label>
              <Input 
                placeholder="Short descriptive label" 
                value={findingForm.title}
                onChange={e => setFindingForm({...findingForm, title: e.target.value})}
                className="font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Standardized Remark (The Comment)</Label>
              <Textarea 
                placeholder="The formal instructions the Branch Officer will see..." 
                className="min-h-[120px] bg-slate-50/50"
                value={findingForm.description}
                onChange={e => setFindingForm({...findingForm, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Risk Severity</Label>
                <Select value={findingForm.severity} onValueChange={(val: any) => setFindingForm({...findingForm, severity: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low" className="text-blue-600 font-bold">Low Impact</SelectItem>
                    <SelectItem value="Medium" className="text-yellow-600 font-bold">Medium Risk</SelectItem>
                    <SelectItem value="High" className="text-orange-600 font-bold">High Risk</SelectItem>
                    <SelectItem value="Critical" className="text-red-600 font-bold">Critical Violation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Registry Source</Label>
                <div className="h-10 flex items-center px-3 border rounded-md bg-slate-50 text-xs font-bold uppercase text-slate-400">
                  Manual Entry
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-6 border-t mt-4">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="px-6 font-bold">Cancel</Button>
            <Button onClick={handleSaveFinding} className="px-10 bg-primary font-black shadow-lg">Save Institutional Finding</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
