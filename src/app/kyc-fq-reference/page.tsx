'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, doc, setDoc, deleteDoc } from "firebase/firestore";
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
  Loader2,
  Filter,
  AlertTriangle,
  Info,
  ClipboardCheck,
  FileType,
  ArrowRight,
  Check,
  Layers,
  RotateCcw,
  ListFilter
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
import { Checkbox } from "@/components/ui/checkbox";
import { KYCFinding } from '@/lib/kyc-data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
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

const ACCOUNT_TYPES = [
  { id: "INDIVIDUAL", label: "Individual" },
  { id: "COMPANY", label: "Company" },
  { id: "ASSOCIATION", label: "Association" },
  { id: "FOREIGN NGO", label: "Foreign NGO" },
  { id: "FOREIGN EMPLOYMENT AGENCY", label: "Foreign Employment Agency" },
];

export default function KYCFFQReferencePage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [findingForm, setFindingForm] = useState<Partial<KYCFinding>>({
    code: "",
    title: "",
    description: "",
    category: "Documentation",
    severity: "Low",
    applicableTo: [],
    active: true,
    source: "manual"
  });

  const isAdmin = user.role === 'Admin';
  const isBranchOfficer = user.role === 'Branch Officer';

  const findingsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "kyc_findings"), orderBy("code")) : null;
  }, [db]);

  const { data: findings, loading } = useCollection<KYCFinding>(findingsQuery);

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

    if (!findingForm.applicableTo || findingForm.applicableTo.length === 0) {
      toast({ variant: "destructive", title: "Applicability Required", description: "Select at least one account type this finding applies to." });
      return;
    }

    const findingId = findingForm.id || `fq-${Date.now()}`;
    const findingRef = doc(db, "kyc_findings", findingId);
    const data = {
      ...findingForm,
      id: findingId,
      createdAt: new Date().toISOString(),
      active: true,
      source: 'manual'
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
      applicableTo: [],
      active: true,
      source: "manual"
    });
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("all");
    setSelectedSeverity("all");
  };

  const toggleApplicability = (typeId: string) => {
    const current = findingForm.applicableTo || [];
    if (current.includes(typeId)) {
      setFindingForm({ ...findingForm, applicableTo: current.filter(id => id !== typeId) });
    } else {
      setFindingForm({ ...findingForm, applicableTo: [...current, typeId] });
    }
  };

  const isFiltered = searchTerm !== "" || selectedCategory !== "all" || selectedSeverity !== "all";

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
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 bg-primary shadow-xl font-bold">
              <Plus className="w-4 h-4" /> Add Finding
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 shadow-sm border-slate-200 h-fit sticky top-20">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" /> Workspace Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Search className="w-3 h-3" /> Search Records
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Code or keyword..." 
                  className="pl-9 h-10 border-slate-200 focus-visible:ring-primary" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Layers className="w-3 h-3" /> Institutional Category
              </Label>
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
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" /> Risk Severity
              </Label>
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

            {isFiltered && (
              <div className="pt-2 animate-in fade-in zoom-in-95 duration-300">
                <Button 
                  variant="ghost" 
                  onClick={handleResetFilters} 
                  className="w-full gap-2 text-slate-500 font-bold hover:bg-slate-100 h-10"
                >
                  <RotateCcw className="w-4 h-4" />
                  Clear Filters
                </Button>
              </div>
            )}

            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <ClipboardCheck className="w-3.5 h-3.5" /> Quick Actions
              </div>
              
              {isBranchOfficer && (
                <Button variant="link" asChild className="p-0 h-auto text-primary font-bold text-sm justify-start">
                  <Link href="/submissions/new">
                    <ArrowRight className="w-3.5 h-3.5 mr-2" /> Start New Submission
                  </Link>
                </Button>
              )}

              <Button variant="link" onClick={() => toast({ title: "Opening Guidelines..." })} className="p-0 h-auto text-slate-600 font-bold text-sm justify-start">
                <FileType className="w-3.5 h-3.5 mr-2" /> NBE Document Matrix
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          {isFiltered && !loading && (
            <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-xl px-6 py-3 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <ListFilter className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-bold text-slate-700">
                  Live Results: <span className="text-primary">{filteredFindings.length}</span> matching records found
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-xs font-black text-primary hover:bg-primary/10">
                RESET WORKSPACE
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-bold">Synchronizing institutional registry...</p>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 text-center">
              <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
                <BookOpen className="w-12 h-12 text-slate-200" />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-slate-900 text-xl">No Findings Discovered</p>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">Try adjusting your filters to explore the institutional library.</p>
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
                        {finding.applicableTo?.map(type => (
                          <Badge key={type} variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-slate-200">{type}</Badge>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50/30 border-t p-4 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[9px] font-bold">Manual</Badge>
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Plus className="w-6 h-6 text-primary" /> Register New Finding
            </DialogTitle>
            <DialogDescription>
              Add a standardized comment to the institutional knowledge base.
            </DialogDescription>
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

            <div className="space-y-4 pt-2 border-t">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Applicable Account Types</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ACCOUNT_TYPES.map((type) => (
                  <div key={type.id} className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                    <Checkbox 
                      id={`type-${type.id}`} 
                      checked={findingForm.applicableTo?.includes(type.id)}
                      onCheckedChange={() => toggleApplicability(type.id)}
                    />
                    <label 
                      htmlFor={`type-${type.id}`} 
                      className="text-xs font-bold text-slate-700 cursor-pointer select-none"
                    >
                      {type.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4 border-t">
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
