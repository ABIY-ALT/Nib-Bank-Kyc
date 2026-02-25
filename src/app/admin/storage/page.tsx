'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from "@/lib/auth-mock";
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
  AlertTriangle, 
  FileText, 
  Building2, 
  Loader2,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  Info,
  ExternalLink
} from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getStorageInventory, deleteInstitutionalFile } from '@/actions/storage';
import { cn } from '@/lib/utils';

export default function StorageVaultPage() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();

  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  
  // Requirement: Track files downloaded locally to enable delete
  const [downloadedIds, setDownloadedFiles] = useState<Set<string>>(new Set());
  
  const [isPurging, setIsPurging] = useState<string | null>(null);
  const [fileToPurge, setFileToPurge] = useState<any | null>(null);

  useEffect(() => {
    loadInventory();
  }, [user]);

  const loadInventory = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getStorageInventory({
      userId: user.id,
      isSuperAdmin,
      assignedBranches: user.assignedBranches || [],
      branchName: user.branchName || undefined
    });
    setInventory(data);
    setLoading(false);
  };

  const filteredFiles = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return inventory.filter(f => {
      const matchesSearch = 
        f.name.toLowerCase().includes(term) || 
        f.kyc?.customerName.toLowerCase().includes(term) ||
        f.kyc?.id.toLowerCase().includes(term);
      
      const matchesBranch = branchFilter === 'all' || f.kyc?.branchName === branchFilter;
      
      return matchesSearch && matchesBranch;
    });
  }, [inventory, searchTerm, branchFilter]);

  const branches = useMemo(() => {
    return Array.from(new Set(inventory.map(f => f.kyc?.branchName))).filter(Boolean).sort();
  }, [inventory]);

  const handleDownload = (file: any) => {
    const link = document.createElement('a');
    link.href = file.fileUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Unlock deletion for this file
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
        toast({ title: "Asset Purged", description: "File permanently removed from Vault storage." });
        setInventory(prev => prev.filter(f => f.id !== fileToPurge.id));
      } else {
        toast({ variant: "destructive", title: "Purge Denied", description: res.error });
      }
    } finally {
      setIsPurging(null);
      setFileToPurge(null);
    }
  };

  if (permissionsLoading || loading && inventory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Scanning Institutional Storage...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <HardDrive className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Storage Vault</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Managing signature-authorized assets across the network.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-4 py-1.5 font-black h-10 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> 
            {isSuperAdmin ? 'Master Node Access' : `Branch Node: ${user?.branchName || 'Assigned'}`}
          </Badge>
        </div>
      </div>

      {/* FILTER CONSOLE */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Discover Asset</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by Case ID, Customer, or Filename..." 
                className="pl-10 h-11 border-slate-200 font-bold bg-slate-50/30 rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-4 space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Jurisdiction Filter</Label>
            <select 
              className="w-full h-11 px-4 border border-slate-200 rounded-xl bg-slate-50/30 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="all">All Authorized Nodes</option>
              {branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex items-end">
            <Button variant="ghost" onClick={() => { setSearchTerm(""); setBranchFilter("all"); }} className="w-full h-11 gap-2 font-bold text-slate-400 hover:text-primary">
              <RotateCcw className="w-4 h-4" /> Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WARNING BANNER */}
      <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex gap-4 animate-in slide-in-from-top-2 duration-500">
        <div className="bg-amber-100 p-2 rounded-xl h-fit">
          <Info className="w-5 h-5 text-amber-700" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-black text-amber-900 uppercase">Institutional Policy: Zero-Loss Protocol</p>
          <p className="text-xs text-amber-800 font-medium leading-relaxed">
            Assets can only be purged from the Vault after a local backup has been initiated. This ensures regulatory compliance and prevents accidental data loss during technical audits.
          </p>
        </div>
      </div>

      {/* DATA TABLE */}
      <Card className="border-slate-200 shadow-xl overflow-hidden rounded-3xl bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest py-5 pl-8">Asset Name</TableHead>
                <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Case Context</TableHead>
                <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Origin Node</TableHead>
                <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest text-center">Status</TableHead>
                <TableHead className="text-right font-black text-slate-500 text-[11px] uppercase tracking-widest pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-32 text-center italic text-slate-400 bg-slate-50/30">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-6 bg-white rounded-full shadow-sm">
                        <HardDrive className="w-12 h-12 text-slate-200" />
                      </div>
                      <p className="font-black text-slate-900 uppercase tracking-widest text-xs">No matching assets discovered in the Vault.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredFiles.map((file) => (
                <TableRow key={file.id} className="group hover:bg-slate-50 transition-colors">
                  <TableCell className="pl-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-primary/5 text-primary rounded-xl group-hover:scale-110 transition-transform">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 leading-tight truncate max-w-[240px]">{file.name}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{format(new Date(file.createdAt), 'MMM dd, yyyy • HH:mm')}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-black text-primary tabular-nums text-xs">{file.kyc?.id}</span>
                      <span className="text-[10px] text-slate-500 font-bold truncate max-w-[180px]">{file.kyc?.customerName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-slate-300" />
                      <span className="text-xs font-bold text-slate-600">{file.kyc?.branchName || 'Institutional'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {downloadedIds.has(file.id) ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-black text-[9px] uppercase">Unlocked</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 font-bold text-[9px] uppercase border-slate-200">Locked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDownload(file)}
                        className="h-10 w-10 rounded-xl hover:bg-emerald-50 hover:text-emerald-600"
                        title="Download to Local Storage"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setFileToPurge(file)}
                        disabled={!downloadedIds.has(file.id) || isPurging === file.id}
                        className={cn(
                          "h-10 w-10 rounded-xl",
                          downloadedIds.has(file.id) ? "hover:bg-red-50 hover:text-red-600" : "opacity-30 grayscale"
                        )}
                        title={downloadedIds.has(file.id) ? "Purge from Vault" : "Download required to unlock purge"}
                      >
                        {isPurging === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="bg-slate-50/50 border-t py-4 px-8 flex justify-between items-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vault Inventory &bull; {filteredFiles.length} Records Displayed</p>
          <div className="flex items-center gap-2 text-[9px] font-mono font-black text-primary/40 uppercase">
            <ShieldCheck className="w-3 h-3" /> Digital Asset Tracking Active
          </div>
        </CardFooter>
      </Card>

      {/* CONFIRMATION DIALOG */}
      <AlertDialog open={!!fileToPurge} onOpenChange={() => !isPurging && setFileToPurge(null)}>
        <AlertDialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-white">
            <AlertDialogHeader className="p-8 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white rounded-2xl shadow-sm">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="space-y-1">
                  <AlertDialogTitle className="text-xl font-black text-red-900 tracking-tight">
                    Confirm Permanent Purge
                  </AlertDialogTitle>
                  <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Institutional Warning</p>
                </div>
              </div>
            </AlertDialogHeader>
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  You are about to permanently delete <span className="text-red-600">"{fileToPurge?.name}"</span> from the case record <span className="font-black text-slate-900">{fileToPurge?.kyc?.id}</span>.
                </p>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
                  <RotateCcw className="w-5 h-5 text-slate-400 shrink-0" />
                  <p className="text-xs font-black text-slate-500 uppercase leading-normal">
                    This action is final and cannot be undone. All physical clusters and vault metadata associated with this file will be wiped.
                  </p>
                </div>
              </div>
            </div>
            <AlertDialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4">
              <AlertDialogCancel disabled={!!isPurging} className="rounded-xl font-bold h-12 px-6">Abort Action</AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => { e.preventDefault(); handleConfirmPurge(); }}
                disabled={!!isPurging}
                className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl h-12 px-10 shadow-xl shadow-red-200"
              >
                {isPurging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Purge Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
