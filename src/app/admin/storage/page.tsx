'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  HardDrive, 
  Search, 
  Download, 
  Trash2, 
  FileText, 
  Building2, 
  Loader2,
  ShieldCheck,
  RotateCcw,
  Info,
  AlertTriangle,
  Map,
  ChevronDown,
  ChevronUp,
  History,
  Zap,
  FolderOpen,
  ArrowRight
} from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getStorageInventory, deleteInstitutionalFile } from '@/actions/storage';
import { getDistricts, getBranches } from '@/actions/hierarchy';
import { cn } from '@/lib/utils';

type AssetCategory = 'ALL' | 'INITIAL' | 'AMENDMENT' | 'MEMO' | 'OTHER';

export default function StorageVaultPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();

  // Data State
  const [inventory, setInventory] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>("ALL");
  
  // UI State
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedFiles] = useState<Set<string>>(new Set());
  const [isPurging, setIsPurging] = useState<string | null>(null);
  const [fileToPurge, setFileToPurge] = useState<any | null>(null);

  useEffect(() => {
    if (!permissionsLoading && !hasPermission('MANAGE_VAULT_STORAGE')) {
      router.push('/unauthorized');
    }
  }, [hasPermission, permissionsLoading, router]);

  useEffect(() => {
    if (user && hasPermission('MANAGE_VAULT_STORAGE')) {
      loadMetadata();
      loadInventory();
    }
  }, [user, hasPermission]);

  const loadMetadata = async () => {
    try {
      const [d, b] = await Promise.all([getDistricts(), getBranches()]);
      setDistricts(d || []);
      setBranches(b || []);
    } catch (e) {
      console.error("Metadata load failed", e);
    }
  };

  const loadInventory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getStorageInventory({
        userId: user.id,
        isSuperAdmin,
        assignedBranches: user.assignedBranches || [],
        branchName: user.branchName || undefined
      });
      setInventory(data || []);
    } catch (e) {
      console.error("Inventory fetch failed", e);
    } finally {
      setLoading(false);
    }
  };

  // Grouping & Filtering Logic
  const groupedInventory = useMemo(() => {
    const casesMap: Record<string, any> = {};
    const term = searchTerm.toLowerCase();

    inventory.forEach(file => {
      const kyc = file.kyc;
      if (!kyc) return;

      // 1. Context Filtering (District / Branch)
      const matchesDistrict = selectedDistrict === 'all' || kyc.branch?.district?.name === selectedDistrict;
      const matchesBranch = selectedBranch === 'all' || kyc.branchName === selectedBranch;
      
      // 2. Search Filtering
      const matchesSearch = 
        file.name.toLowerCase().includes(term) || 
        kyc.customerName.toLowerCase().includes(term) ||
        kyc.id.toLowerCase().includes(term);

      // 3. Category Logic
      const isMemo = file.type === 'GOVERNANCE_MEMO';
      const isAmendment = file.fileUrl?.includes('resubmit_');
      const isInitial = !isMemo && !isAmendment;

      let fileCategory: AssetCategory = 'OTHER';
      if (isMemo) fileCategory = 'MEMO';
      else if (isAmendment) fileCategory = 'AMENDMENT';
      else if (isInitial) fileCategory = 'INITIAL';

      const matchesCategory = selectedCategory === 'ALL' || selectedCategory === fileCategory;

      if (matchesDistrict && matchesBranch && matchesSearch && matchesCategory) {
        if (!casesMap[kyc.id]) {
          casesMap[kyc.id] = {
            id: kyc.id,
            customerName: kyc.customerName,
            branchName: kyc.branchName,
            districtName: kyc.branch?.district?.name || "Central",
            status: kyc.status,
            files: []
          };
        }
        casesMap[kyc.id].files.push({ ...file, category: fileCategory });
      }
    });

    return Object.values(casesMap).sort((a, b) => b.id.localeCompare(a.id));
  }, [inventory, searchTerm, selectedDistrict, selectedBranch, selectedCategory]);

  const availableBranchesForDistrict = useMemo(() => {
    if (selectedDistrict === 'all') return branches;
    return branches.filter(b => b.district?.name === selectedDistrict);
  }, [branches, selectedDistrict]);

  const handleDownload = (file: any) => {
    const link = document.createElement('a');
    link.href = file.fileUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setDownloadedFiles(prev => new Set([...prev, file.id]));
    
    toast({
      title: "Archive Extraction Successful",
      description: "File saved to local storage. Purge capability unlocked.",
    });
  };

  const handleConfirmPurge = async () => {
    if (!fileToPurge) return;
    setIsPurging(fileToPurge.id);
    try {
      const res = await deleteInstitutionalFile(fileToPurge.id);
      if (res.success) {
        toast({ title: "Successful", description: "File permanently removed from storage." });
        setInventory(prev => prev.filter(f => f.id !== fileToPurge.id));
      } else {
        toast({ variant: "destructive", title: "Purge Denied", description: res.error });
      }
    } finally {
      setIsPurging(null);
      setFileToPurge(null);
    }
  };

  const toggleCase = (caseId: string) => {
    const next = new Set(expandedCases);
    if (next.has(caseId)) next.delete(caseId);
    else next.add(caseId);
    setExpandedCases(next);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedDistrict("all");
    setSelectedBranch("all");
    setSelectedCategory("ALL");
  };

  if (permissionsLoading || (loading && inventory.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Querying Vault Archive...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
              <HardDrive className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">KYC Document Vault</h1>
              <p className="text-muted-foreground text-lg font-medium">Regional asset oversight and digital preservation management.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-4 py-2 font-black h-12 flex items-center gap-2 text-[10px] uppercase rounded-xl">
            <ShieldCheck className="w-4 h-4" /> 
            {isSuperAdmin ? 'Master Network Access' : `Branch: ${user?.branchName || 'Authorized'}`}
          </Badge>
        </div>
      </div>

      {/* ADVANCED FILTER CONSOLE */}
      <Card className="border-slate-200 shadow-2xl overflow-hidden bg-white rounded-[2rem]">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-3 space-y-2.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
                <Map className="w-3.5 h-3.5" /> Regional District
              </Label>
              <Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("all"); }}>
                <SelectTrigger className="h-12 rounded-xl bg-slate-50/50 border-slate-200 font-bold">
                  <SelectValue placeholder="All Regions" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl">
                  <SelectItem value="all" className="font-bold">Global Network</SelectItem>
                  {districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
                <Building2 className="w-3.5 h-3.5" /> Specific Branch
              </Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={selectedDistrict === 'all' && !isSuperAdmin}>
                <SelectTrigger className="h-12 rounded-xl bg-slate-50/50 border-slate-200 font-bold">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl">
                  <SelectItem value="all" className="font-bold">All Authorized Nodes</SelectItem>
                  {availableBranchesForDistrict.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
                <FileText className="w-3.5 h-3.5" /> Asset Classification
              </Label>
              <Select value={selectedCategory} onValueChange={(val: AssetCategory) => setSelectedCategory(val)}>
                <SelectTrigger className="h-12 rounded-xl bg-slate-50/50 border-slate-200 font-bold">
                  <SelectValue placeholder="All Assets" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl">
                  <SelectItem value="ALL" className="font-bold">All Classifications</SelectItem>
                  <SelectItem value="INITIAL">First Time Documents</SelectItem>
                  <SelectItem value="AMENDMENT">Amendment Documents</SelectItem>
                  <SelectItem value="MEMO">Governance Memos</SelectItem>
                  <SelectItem value="OTHER">Other Materials</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 px-1">
                <Search className="w-3.5 h-3.5" /> Keyword Discovery
              </Label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Case ID or Customer..." 
                  className="pl-11 h-12 border-slate-200 font-bold bg-slate-50/50 rounded-xl focus-visible:ring-primary/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <span className="text-[10px] font-black uppercase text-slate-500">Initial Bundle</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black uppercase text-slate-500">Amendment Docs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-black uppercase text-slate-500">Authorized Memos</span>
              </div>
            </div>
            <Button variant="ghost" onClick={resetFilters} className="h-10 gap-2 font-black text-[10px] uppercase text-slate-400 hover:text-primary rounded-xl">
              <RotateCcw className="w-4 h-4" /> Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* POLICY REMINDER */}
      <div className="bg-amber-50 border border-amber-200 p-6 rounded-[1.5rem] flex gap-5 animate-in slide-in-from-top-2 duration-500 shadow-sm">
        <div className="bg-white p-3 rounded-2xl h-fit shadow-sm border border-amber-100">
          <Info className="w-6 h-6 text-amber-600" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-black text-amber-900 uppercase tracking-tight">Zero-Loss Protocol Enabled</p>
          <p className="text-xs text-amber-800 font-medium leading-relaxed max-w-3xl">
            In accordance with regulatory mandates, assets may only be purged from the Institutional Vault after a local audit backup has been successfully initiated. All deletions are cryptographically logged in the security vault.
          </p>
        </div>
      </div>

      {/* CASE EXPLORER QUEUE */}
      <div className="space-y-6">
        {groupedInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-48 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] gap-6 text-center">
            <div className="p-8 bg-white rounded-full shadow-sm border border-slate-100">
              <HardDrive className="w-16 h-16 text-slate-200" />
            </div>
            <div className="space-y-2">
              <p className="font-black text-slate-900 text-2xl tracking-tight">Archive Discovery Standby</p>
              <p className="text-sm text-slate-400 font-medium max-w-sm">No cases match the active filter criteria. Adjust your jurisdiction or classification parameters.</p>
            </div>
            <Button onClick={resetFilters} variant="outline" className="rounded-xl font-bold h-11 border-primary/20 text-primary px-8">Clear Discovery Grid</Button>
          </div>
        ) : groupedInventory.map((caseItem) => (
          <Card key={caseItem.id} className={cn(
            "shadow-xl overflow-hidden rounded-[2.5rem] border-slate-200 transition-all duration-500 bg-white group",
            expandedCases.has(caseItem.id) ? "ring-2 ring-primary/20 border-primary/20" : "hover:border-primary/30"
          )}>
            <CardHeader 
              className={cn(
                "p-8 border-b transition-colors cursor-pointer",
                expandedCases.has(caseItem.id) ? "bg-primary/5" : "bg-white hover:bg-slate-50/50"
              )}
              onClick={() => toggleCase(caseItem.id)}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "p-4 rounded-3xl transition-all shadow-lg",
                    expandedCases.has(caseItem.id) ? "bg-primary text-white scale-110" : "bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"
                  )}>
                    <FolderOpen className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-slate-900 text-2xl tracking-tighter tabular-nums">{caseItem.id}</span>
                      <Badge variant="outline" className="bg-white border-primary/20 text-primary font-black uppercase text-[9px] px-3 py-1">
                        {caseItem.status}
                      </Badge>
                    </div>
                    <p className="text-slate-500 font-bold text-base mt-1">{caseItem.customerName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-8 md:pr-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Origin Branch</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Building2 className="w-4 h-4 text-slate-300" />
                      <span className="font-black text-slate-700 text-sm">{caseItem.branchName}</span>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-slate-200 hidden md:block" />
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digital Assets</span>
                    <div className="flex items-center gap-2 mt-1">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="font-black text-slate-900 text-lg tabular-nums">{caseItem.files.length}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="ml-4 rounded-xl hover:bg-primary/10 text-primary">
                    {expandedCases.has(caseItem.id) ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                  </Button>
                </div>
              </div>
            </CardHeader>

            {expandedCases.has(caseItem.id) && (
              <CardContent className="p-0 animate-in slide-in-from-top-4 duration-500">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b">
                    <TableRow>
                      <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest py-6 pl-10">Signature Asset Name</TableHead>
                      <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Classification</TableHead>
                      <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Authorized By</TableHead>
                      <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest text-center">Protocol Status</TableHead>
                      <TableHead className="text-right font-black text-slate-500 text-[11px] uppercase tracking-widest pr-10">Vault Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caseItem.files.map((file: any) => (
                      <TableRow key={file.id} className="group/file hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                        <TableCell className="pl-10 py-6">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "p-2.5 rounded-xl group-hover/file:scale-110 transition-transform",
                              file.category === 'MEMO' ? 'bg-emerald-50 text-emerald-600' : 
                              file.category === 'AMENDMENT' ? 'bg-indigo-50 text-indigo-600' : 'bg-primary/5 text-primary'
                            )}>
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 leading-tight truncate max-w-[300px]">{file.name}</span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">
                                Timestamp: {format(new Date(file.createdAt), 'MMM dd, yyyy • HH:mm')}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "font-black text-[9px] uppercase px-3 py-1 border-none",
                            file.category === 'INITIAL' && "bg-slate-100 text-slate-600",
                            file.category === 'AMENDMENT' && "bg-indigo-100 text-indigo-700",
                            file.category === 'MEMO' && "bg-emerald-100 text-emerald-700"
                          )}>
                            {file.category.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-300" />
                            <span className="text-xs font-bold text-slate-600">
                              {file.uploadedBy?.firstName} {file.uploadedBy?.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {downloadedIds.has(file.id) ? (
                            <Badge className="bg-emerald-500 text-white border-none font-black text-[9px] uppercase tracking-widest px-3">Protocol Unlocked</Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 font-bold text-[9px] uppercase border-slate-200 tracking-widest px-3">Protocol Locked</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex justify-end gap-3">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDownload(file)}
                              className="h-11 w-11 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 border border-transparent hover:border-emerald-100"
                              title="Download to Local Audit Storage"
                            >
                              <Download className="w-5 h-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => setFileToPurge(file)}
                              disabled={!downloadedIds.has(file.id) || isPurging === file.id}
                              className={cn(
                                "h-11 w-11 rounded-xl transition-all",
                                downloadedIds.has(file.id) ? "hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-100" : "opacity-20 grayscale"
                              )}
                              title={downloadedIds.has(file.id) ? "Permanent Vault Purge" : "Download required to unlock purge"}
                            >
                              {isPurging === file.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="bg-slate-50/50 p-6 flex items-center justify-between border-t">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Case Lifecycle Archive &bull; Authorized Extraction Only</p>
                  <Button variant="link" asChild className="text-primary font-black text-[10px] uppercase gap-2 h-auto p-0">
                    <a href={`/submissions/${caseItem.id}`}>View Full Case Lifecycle <ArrowRight className="w-3 h-3" /></a>
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <AlertDialog open={!!fileToPurge} onOpenChange={() => !isPurging && setFileToPurge(null)}>
        <AlertDialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-white">
            <AlertDialogHeader className="p-8 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-white rounded-3xl shadow-sm">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <div className="space-y-1">
                  <AlertDialogTitle className="text-2xl font-black text-red-900 tracking-tight">
                    Permanent Purge
                  </AlertDialogTitle>
                  <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Critical Warning</p>
                </div>
              </div>
            </AlertDialogHeader>
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <p className="text-base font-bold text-slate-700 leading-relaxed">
                  You are about to permanently delete <span className="text-red-600">"{fileToPurge?.name}"</span> from the case record <span className="font-black text-slate-900">{fileToPurge?.kyc?.id}</span>.
                </p>
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex gap-4">
                  <RotateCcw className="w-6 h-6 text-slate-400 shrink-0" />
                  <p className="text-xs font-black text-slate-500 uppercase leading-normal">
                    This action is final and irreversible. All document clusters and vault metadata associated with this asset will be wiped from the institutional storage.
                  </p>
                </div>
              </div>
            </div>
            <AlertDialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4">
              <AlertDialogCancel disabled={!!isPurging} className="rounded-xl font-bold h-14 px-8 border-slate-200">Abort Protocol</AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => { e.preventDefault(); handleConfirmPurge(); }}
                disabled={!!isPurging}
                className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl h-14 px-12 shadow-xl shadow-red-200"
              >
                {isPurging ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Trash2 className="w-5 h-5 mr-2" />}
                Purge Asset
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
