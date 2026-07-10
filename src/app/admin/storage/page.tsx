'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
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
  ArrowRight,
  Archive,
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
import JSZip from 'jszip';
import { getStorageInventory, deleteInstitutionalFile } from '@/actions/storage';
import { getDistricts, getBranches } from '@/actions/hierarchy';
import { resolveDownloadFileName } from '@/lib/documents';
import { cn } from '@/lib/utils';

type AssetCategory = 'ALL' | 'INITIAL' | 'AMENDMENT' | 'MEMO' | 'OTHER';

const StorageFileRow = memo(function StorageFileRow({
  file,
  isDownloaded,
  purging,
  onDownload,
  onRequestPurge,
  onSelect,
  isSelected,
}: {
  file: any;
  isDownloaded: boolean;
  purging: boolean;
  onDownload: (file: any) => void;
  onRequestPurge: (file: any) => void;
  onSelect: (fileId: string) => void;
  isSelected: boolean;
}) {
  return (
    <TableRow className="group/file hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
      <TableCell className="pl-10 py-6">
        <div className="flex items-center gap-4">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(file.id)}
          />
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
              Timestamp: {format(new Date(file.createdAt), 'MMM dd, yyyy - h:mm a')}
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
        {isDownloaded ? (
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
            onClick={() => onDownload(file)}
            className="h-11 w-11 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 border border-transparent hover:border-emerald-100"
            title="Download to Local Audit Storage"
          >
            <Download className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRequestPurge(file)}
            disabled={!isDownloaded || purging}
            className={cn(
              "h-11 w-11 rounded-xl transition-all",
              isDownloaded ? "hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-100" : "opacity-20 grayscale"
            )}
            title={isDownloaded ? "Permanent Vault Purge" : "Download required to unlock purge"}
          >
            {purging ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function StorageVaultPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const canManageVaultStorage = hasPermission('MANAGE_VAULT_STORAGE');

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
  const [purgingFileId, setPurgingFileId] = useState<string | null>(null);
  const [purging, setPurging] = useState<string[]>([]);
  const [fileToPurge, setFileToPurge] = useState<any | null>(null);
  const [filesToBulkPurge, setFilesToBulkPurge] = useState<any[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!permissionsLoading && !canManageVaultStorage) {
      router.push('/unauthorized?required=MANAGE_VAULT_STORAGE');
    }
  }, [canManageVaultStorage, permissionsLoading, router]);

  const loadMetadata = useCallback(async () => {
    try {
      const [d, b] = await Promise.all([getDistricts(), getBranches()]);
      setDistricts(d || []);
      setBranches(b || []);
    } catch (e) {
    }
  }, []);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      // SECURITY: No client-side privilege params — server derives all from session
      const data = await getStorageInventory();
      setInventory(data || []);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageVaultStorage) {
      loadMetadata();
      loadInventory();
    }
  }, [canManageVaultStorage, loadInventory, loadMetadata]);

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

  const handleSingleDownload = useCallback((file: any) => {
    const link = document.createElement('a');
    link.href = file.fileUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setDownloadedFiles(prev => {
      if (prev.has(file.id)) return prev;
      const next = new Set(prev);
      next.add(file.id);
      return next;
    });
    
    toast({
      title: "Archive Extraction Successful",
      description: "File saved to local storage. Purge capability unlocked.",
    });
  }, [toast]);

  const handleSelectAllVisible = useCallback(() => {
    const visibleFiles = groupedInventory.flatMap(c => c.files.map((f: any) => f.id));
    if (visibleFiles.length === 0) return;
    
    const allSelected = visibleFiles.every(id => selectedFiles.has(id));
    
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleFiles.forEach(id => next.delete(id));
      } else {
        visibleFiles.forEach(id => next.add(id));
      }
      return next;
    });
  }, [groupedInventory, selectedFiles]);

  const handleBulkDownload = useCallback(async () => {
    const filesToDownload = inventory.filter(file => selectedFiles.has(file.id));
    if (filesToDownload.length === 0 || isZipping) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const bundleName = `NIB_STORAGE_BUNDLE_${timestamp}`;
      const rootFolder = zip.folder(bundleName);
      
      const manifestHeader = `NIB BANK INSTITUTIONAL STORAGE ARCHIVE\n` +
                             `==================================================\n` +
                             `EXPORT METADATA\n` +
                             `==================================================\n` +
                             `Authorizing Official:  ${user?.firstName || ''} ${user?.lastName || 'Unknown'}\n` +
                             `Export Timestamp:      ${now.toLocaleString()}\n` +
                             `Total Assets Extracted: ${filesToDownload.length}\n` +
                             `Archive Root:          ${bundleName}\n` +
                             `==================================================\n\n` +
                             `EXTRACTION LOG:\n`;
      
      let manifestBody = "";

      toast({
        title: "Starting Bundle Extraction",
        description: `Zipping ${filesToDownload.length} files...`,
      });

      // Group files by case for metadata generation
      const filesByCase: Record<string, any[]> = {};
      filesToDownload.forEach(f => {
        const kycId = f.kyc?.id || 'UNASSIGNED';
        if (!filesByCase[kycId]) filesByCase[kycId] = [];
        filesByCase[kycId].push(f);
      });

      for (const [kycId, caseFiles] of Object.entries(filesByCase)) {
        const firstFile = caseFiles[0];
        const customerName = firstFile.kyc?.customerName || 'Unknown_Customer';
        const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
        const caseFolderName = `${kycId}_${safeCustomerName}`;
        const caseFolder = rootFolder?.folder(caseFolderName);
        const docFolder = caseFolder?.folder("Documents");

        for (const file of caseFiles) {
          try {
            // FIX: Use credentials and handle binary buffer for storage extraction
            const response = await fetch(file.fileUrl, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Accept': '*/*' }
            });

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength === 0) throw new Error("Empty buffer received");
            
            const safeFileName = resolveDownloadFileName(file.name, file.originalName, file.mimeType);
            docFolder?.file(safeFileName, arrayBuffer, { binary: true });
            manifestBody += `- [SUCCESS] ${kycId}/${safeFileName}\n`;
          } catch (e) {
            console.error(`Storage bundle extraction error for ${file.name}:`, e);
            manifestBody += `- [ERROR] Failed to fetch: ${file.name} (${e instanceof Error ? e.message : 'Unknown error'})\n`;
          }
        }

        // Add CASE_METADATA.txt for each case folder in the storage bundle
        if (kycId !== 'UNASSIGNED') {
          const caseMetadata = `CASE METADATA
==================================================
Case ID:           ${kycId}
Customer Name:     ${customerName}
Entity Type:       ${firstFile.kyc?.entityType || 'Individual'}
Status:            ${firstFile.kyc?.status || 'Unknown'}
Asset Count:       ${caseFiles.length}
==================================================`;
          caseFolder?.file('CASE_METADATA.txt', caseMetadata);
        }
      }

      rootFolder?.file("nib_institutional_manifest.txt", manifestHeader + manifestBody);
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.body.appendChild(document.createElement('a'));
      link.href = url;
      link.download = `${bundleName}.zip`;
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);

      setDownloadedFiles(prev => {
        const next = new Set(prev);
        filesToDownload.forEach(f => next.add(f.id));
        return next;
      });

      toast({
        title: "Bundle Extraction Complete",
        description: `${filesToDownload.length} files compressed into ZIP. Purge capability unlocked.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Bundle Extraction Failed",
        description: "An error occurred while zipping the files.",
      });
    } finally {
      setIsZipping(false);
    }
  }, [inventory, isZipping, selectedFiles, toast]);

  const handleBulkPurge = useCallback(() => {
    const filesToPurge = inventory.filter(file => selectedFiles.has(file.id));
    const downloadableFiles = filesToPurge.filter(file => downloadedIds.has(file.id));
    
    if (downloadableFiles.length !== filesToPurge.length) {
      toast({
        variant: "destructive",
        title: "Purge Prerequisite Failed",
        description: "All selected files must be downloaded before they can be purged.",
      });
      return;
    }
    setFilesToBulkPurge(downloadableFiles);
}, [inventory, selectedFiles, downloadedIds, toast]);

const handleConfirmBulkPurge = useCallback(() => {
  setPurging(filesToBulkPurge.map(f => f.id));
  
  const purgePromises = filesToBulkPurge.map(file => deleteInstitutionalFile(file.id));
  
  Promise.all(purgePromises).then(results => {
    const successfulPurges: any[] = [];
    const failedPurges: any[] = [];

    results.forEach((result, index) => {
        if (result.success) {
            successfulPurges.push(filesToBulkPurge[index]);
        } else {
            failedPurges.push(filesToBulkPurge[index]);
        }
    });
    
    if (successfulPurges.length > 0) {
      toast({
        title: "Bulk Purge Successful",
        description: `${successfulPurges.length} files permanently removed.`,
      });
      setInventory(prev => prev.filter(f => !successfulPurges.some(p => p.id === f.id)));
      setSelectedFiles(prev => {
        const next = new Set(prev);
        successfulPurges.forEach(p => next.delete(p.id));
        return next;
      });
    }
    
    if (failedPurges.length > 0) {
      toast({
        variant: "destructive",
        title: "Bulk Purge Failed",
        description: `${failedPurges.length} files could not be removed.`,
      });
    }
  }).finally(() => {
    setPurging([]);
    setFilesToBulkPurge([]);
  });
}, [filesToBulkPurge, toast]);



  const handleConfirmSinglePurge = useCallback(async () => {
    if (!fileToPurge) return;
    setPurgingFileId(fileToPurge.id);
    try {
      const res = await deleteInstitutionalFile(fileToPurge.id);
      if (res.success) {
        toast({ title: "Successful", description: "File permanently removed from storage." });
        setInventory(prev => prev.filter(f => f.id !== fileToPurge.id));
      } else {
        toast({ variant: "destructive", title: "Purge Denied", description: res.error });
      }
    } finally {
      setPurgingFileId(null);
      setFileToPurge(null);
    }
  }, [fileToPurge, toast]);

  const toggleCase = useCallback((caseId: string) => {
    setExpandedCases(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }, []);

  const requestPurge = useCallback((file: any) => {
    setFileToPurge(file);
  }, []);

  const handleSelectFile = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedDistrict("all");
    setSelectedBranch("all");
    setSelectedCategory("ALL");
  }, []);

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
            <div className="p-3 bg-primary text-white rounded-2xl shadow-xl flex items-center gap-3">
              <HardDrive className="w-8 h-8" />
              <Archive className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">KYC Document Vault</h1>
              <p className="text-muted-foreground text-lg font-medium">Regional asset oversight and digital preservation management.</p>
            </div>
          </div>
        </div>
          <div className="flex items-center gap-3">
          <Button
            onClick={handleSelectAllVisible}
            className="h-12 font-black uppercase text-[10px] tracking-widest rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            Select All Displays
          </Button>
          <Button
            onClick={handleBulkDownload}
            disabled={selectedFiles.size === 0 || isZipping}
            className="h-12 font-black uppercase text-[10px] tracking-widest rounded-xl"
          >
            {isZipping ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isZipping ? "Extracting Bundle..." : `Download Selected (${selectedFiles.size})`}
          </Button>
          <Button
            onClick={handleBulkPurge}
            disabled={selectedFiles.size === 0 || purging.length > 0}
            variant="destructive"
            className="h-12 font-black uppercase text-[10px] tracking-widest rounded-xl"
          >
            {purging.length > 0 ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Purge Selected ({selectedFiles.size})
          </Button>
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
                  <SelectItem value="all" className="font-bold">Overall Network</SelectItem>
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
                  <SelectItem value="all" className="font-bold">All Authorized Branches</SelectItem>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCase(caseItem.id);
                    }}
                    className="ml-4 rounded-xl hover:bg-primary/10 text-primary"
                  >
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
                      <StorageFileRow
                        key={file.id}
                        file={file}
                        isDownloaded={downloadedIds.has(file.id)}
                        purging={purgingFileId === file.id || purging.includes(file.id)}
                        onDownload={handleSingleDownload}
                        onRequestPurge={requestPurge}
                        onSelect={handleSelectFile}
                        isSelected={selectedFiles.has(file.id)}
                      />
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

      <AlertDialog open={!!fileToPurge} onOpenChange={() => !purgingFileId && setFileToPurge(null)}>
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
              <AlertDialogCancel disabled={!!purgingFileId} className="rounded-xl font-bold h-14 px-8 border-slate-200">Abort Protocol</AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => { e.preventDefault(); handleConfirmSinglePurge(); }}
                disabled={!!purgingFileId}
                className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl h-14 px-12 shadow-xl shadow-red-200"
              >
                {purgingFileId ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Trash2 className="w-5 h-5 mr-2" />}
                Purge Asset
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={filesToBulkPurge.length > 0} onOpenChange={() => purging.length === 0 && setFilesToBulkPurge([])}>
        <AlertDialogContent className="max-w-lg rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-white">
            <AlertDialogHeader className="p-8 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-white rounded-3xl shadow-sm">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <div className="space-y-1">
                  <AlertDialogTitle className="text-2xl font-black text-red-900 tracking-tight">
                    Bulk Purge Confirmation
                  </AlertDialogTitle>
                  <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">You are about to delete {filesToBulkPurge.length} assets</p>
                </div>
              </div>
            </AlertDialogHeader>
            <div className="p-8">
              <p className="text-base font-bold text-slate-700 leading-relaxed">
                This will permanently delete the following files from the institutional vault. This action cannot be undone.
              </p>
              <div className="mt-4 max-h-60 overflow-y-auto space-y-2 p-4 bg-slate-50 rounded-xl border">
                {filesToBulkPurge.map(f => (
                  <p key={f.id} className="text-sm font-mono text-slate-600 truncate">{f.name}</p>
                ))}
              </div>
            </div>
            <AlertDialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4">
              <AlertDialogCancel disabled={purging.length > 0} className="rounded-xl font-bold h-14 px-8 border-slate-200">Abort Protocol</AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => { e.preventDefault(); handleConfirmBulkPurge(); }}
                disabled={purging.length > 0}
                className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl h-14 px-12 shadow-xl shadow-red-200"
              >
                {purging.length > 0 ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Trash2 className="w-5 h-5 mr-2" />}
                Purge All ({filesToBulkPurge.length})
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

