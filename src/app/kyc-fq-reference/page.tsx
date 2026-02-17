'use client';

import { useState, useMemo, useEffect } from 'react';
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
  Layers,
  RotateCcw,
  ExternalLink,
  ShieldCheck
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
import { getFindings, upsertFinding, deleteFinding, seedFindings } from '@/actions/findings';
import { FindingCategory, FindingSeverity, UserRole } from '@prisma/client';

const SEVERITY_COLORS = {
  LOW: "bg-blue-100 text-blue-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800"
};

const SEVERITY_ICONS = {
  LOW: Info,
  MEDIUM: AlertTriangle,
  HIGH: ShieldAlert,
  CRITICAL: AlertTriangle
};

const ACCOUNT_TYPES = [
  { id: "INDIVIDUAL", label: "Individual" },
  { id: "COMPANY", label: "Company" },
  { id: "ASSOCIATION", label: "Association" },
  { id: "FOREIGN NGO", label: "Foreign NGO" },
  { id: "FOREIGN EMPLOYMENT AGENCY", label: "Foreign Employment Agency" },
];

const EXAMPLE_FINDINGS: Partial<KYCFinding>[] = [
  {
    code: "FQ-001",
    title: "National ID Expiry",
    description: "The provided National ID has expired or will expire within 30 days. Please request a renewed identification document.",
    category: "IDENTITY",
    severity: "HIGH",
    applicableTo: ["INDIVIDUAL", "ASSOCIATION"],
  },
  {
    code: "FQ-002",
    title: "Trade License Renewal",
    description: "The business trade license is not renewed for the current Ethiopian fiscal year.",
    category: "DOCUMENTATION",
    severity: "CRITICAL",
    applicableTo: ["COMPANY"],
  }
];

export default function KYCFFQReferencePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [findingForm, setFindingForm] = useState<any>({
    code: "",
    title: "",
    description: "",
    category: "DOCUMENTATION",
    severity: "LOW",
    applicableTo: [],
    active: true,
    source: "manual"
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getFindings();
    setFindings(data);
    setLoading(false);
  };

  const canManageFindings = useMemo(() => {
    return [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.BRANCH_BANKING_DIRECTOR].includes(user?.role as UserRole);
  }, [user?.role]);

  const filteredFindings = useMemo(() => {
    if (!findings) return [];
    return findings.filter(f => {
      const matchesSearch = f.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          f.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory;
      const matchesSeverity = selectedSeverity === 'all' || f.severity === selectedSeverity;
      return matchesSearch && matchesCategory && matchesSeverity;
    });
  }, [findings, searchTerm, selectedCategory, selectedSeverity]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Comment Copied" });
  };

  const handleSeedLibrary = async () => {
    if (!canManageFindings) return;
    await seedFindings(EXAMPLE_FINDINGS);
    toast({ title: "Library Seeded" });
    loadData();
  };

  const handleSaveFinding = async () => {
    if (!canManageFindings) return;
    const res = await upsertFinding(findingForm);
    if (res.success) {
      toast({ title: "Finding Registered" });
      setIsAddDialogOpen(false);
      resetForm();
      loadData();
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Purge this finding?")) return;
    await deleteFinding(id);
    toast({ title: "Finding Purged" });
    loadData();
  };

  const resetForm = () => {
    setFindingForm({
      code: "",
      title: "",
      description: "",
      category: "DOCUMENTATION",
      severity: "LOW",
      applicableTo: [],
      active: true,
      source: "manual"
    });
  };

  const toggleApplicability = (typeId: string) => {
    const current = findingForm.applicableTo || [];
    if (current.includes(typeId)) {
      setFindingForm({ ...findingForm, applicableTo: current.filter((id: string) => id !== typeId) });
    } else {
      setFindingForm({ ...findingForm, applicableTo: [...current, typeId] });
    }
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
          <p className="text-muted-foreground text-lg">Institutional SQL knowledge base for compliance queries.</p>
        </div>
        <div className="flex gap-2">
          {canManageFindings && (
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 bg-primary shadow-xl font-bold">
              <Plus className="w-4 h-4" /> Add Finding
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 shadow-sm h-fit sticky top-20">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Code or keyword..." className="pl-9 h-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.values(FindingCategory).map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Severity</Label>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  {Object.values(FindingSeverity).map(sev => <SelectItem key={sev} value={sev}>{sev}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" onClick={() => { setSearchTerm(""); setSelectedCategory("all"); setSelectedSeverity("all"); }} className="w-full gap-2">
              <RotateCcw className="w-4 h-4" /> Clear Filters
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-bold text-muted-foreground">Syncing SQL registry...</p>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl text-center">
              <BookOpen className="w-12 h-12 text-slate-200 mb-4" />
              <p className="font-bold text-slate-900 text-xl">No Findings Found</p>
              {canManageFindings && findings.length === 0 && (
                <Button variant="outline" onClick={handleSeedLibrary} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" /> Seed SQL Library
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredFindings.map((finding) => {
                const SeverityIcon = SEVERITY_ICONS[finding.severity as FindingSeverity] || Info;
                return (
                  <Card key={finding.id} className="group hover:border-primary/40 transition-all flex flex-col bg-white overflow-hidden border-slate-200">
                    <CardHeader className="bg-slate-50/50 border-b pb-4 pt-5 px-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-primary uppercase">{finding.code}</span>
                          <CardTitle className="text-lg font-bold">{finding.title}</CardTitle>
                        </div>
                        <Badge className={SEVERITY_COLORS[finding.severity as FindingSeverity]}>
                          <SeverityIcon className="w-3 h-3 mr-1.5" /> {finding.severity}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 px-6 flex-1">
                      <p className="text-sm text-slate-600 italic">"{finding.description}"</p>
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        <Badge variant="secondary" className="text-[10px] font-bold">{finding.category}</Badge>
                        {finding.applicableTo?.map((type: string) => (
                          <Badge key={type} variant="outline" className="text-[9px] uppercase">{type}</Badge>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50/30 border-t p-4 flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">SQL Archive</span>
                      <div className="flex gap-2">
                        {canManageFindings && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(finding.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleCopy(finding.description)} className="h-8 gap-2 font-bold px-4">
                          <Copy className="w-3.5 h-3.5" /> Copy
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
              <ShieldCheck className="w-6 h-6 text-primary" /> Register Finding
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Code</Label>
                <Input placeholder="e.g. FQ-101" value={findingForm.code} onChange={e => setFindingForm({...findingForm, code: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Category</Label>
                <Select value={findingForm.category} onValueChange={(val: any) => setFindingForm({...findingForm, category: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(FindingCategory).map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Title</Label>
              <Input placeholder="Descriptive label" value={findingForm.title} onChange={e => setFindingForm({...findingForm, title: e.target.value})} />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Description</Label>
              <Textarea className="min-h-[120px]" value={findingForm.description} onChange={e => setFindingForm({...findingForm, description: e.target.value})} />
            </div>

            <div className="space-y-4 pt-2 border-t">
              <Label className="text-[10px] font-black uppercase">Applicability</Label>
              <div className="grid grid-cols-2 gap-3">
                {ACCOUNT_TYPES.map((type) => (
                  <div key={type.id} className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100">
                    <Checkbox id={`type-${type.id}`} checked={findingForm.applicableTo?.includes(type.id)} onCheckedChange={() => toggleApplicability(type.id)} />
                    <label htmlFor={`type-${type.id}`} className="text-xs font-bold text-slate-700 cursor-pointer">{type.label}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label className="text-[10px] font-black uppercase">Severity</Label>
              <Select value={findingForm.severity} onValueChange={(val: any) => setFindingForm({...findingForm, severity: val})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(FindingSeverity).map(sev => <SelectItem key={sev} value={sev}>{sev}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-6 border-t mt-4">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFinding} className="bg-primary font-black shadow-lg">Commit to SQL</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
