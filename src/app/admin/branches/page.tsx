
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Plus, 
  MapPin, 
  Trash2, 
  Loader2, 
  Globe, 
  Edit2, 
  Search, 
  ChevronRight,
  FilterX,
  X
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBranches, getDistricts, createBranch, updateBranch, createDistrict, updateDistrict, deleteNode } from '@/actions/hierarchy';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePermissions } from '@/hooks/use-permissions';
import { SYSTEM_SECTION_COPY } from '@/lib/access-ui';

export default function BranchesDistrictsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Selection & Filtering State
  const [activeDistrictId, setActiveDistrictId] = useState<string | null>(null);
  const [branchSearchQuery, setBranchSearchQuery] = useState("");
  
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [isDistrictDialogOpen, setIsDistrictDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<{ type: 'district' | 'branch', id: string } | null>(null);
  
  const [branchForm, setBranchForm] = useState<any>({ name: '', districtName: '', code: '' });
  const [districtForm, setDistrictForm] = useState<any>({ name: '' });

  useEffect(() => {
    if (!permissionsLoading && !hasPermission('MANAGE_BRANCHES')) {
      router.push('/unauthorized?required=MANAGE_BRANCHES');
    }
  }, [hasPermission, permissionsLoading, router]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [b, d] = await Promise.all([getBranches(), getDistricts()]);
      setBranches(b || []);
      setDistricts(d || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Data retrieval failed" });
    } finally {
      setLoading(false);
    }
  };

  const activeDistrict = useMemo(() => 
    districts.find(d => d.id === activeDistrictId), 
  [districts, activeDistrictId]);

  const filteredBranches = useMemo(() => {
    return branches.filter(branch => {
      const matchesDistrict = !activeDistrictId || branch.districtId === activeDistrictId;
      const matchesSearch = branch.name.toLowerCase().includes(branchSearchQuery.toLowerCase()) || 
                           (branch.code && branch.code.toLowerCase().includes(branchSearchQuery.toLowerCase()));
      return matchesDistrict && matchesSearch;
    });
  }, [branches, activeDistrictId, branchSearchQuery]);

  const handleOpenBranchDialog = (branch?: any) => {
    if (branch) {
      setEditingNode({ type: 'branch', id: branch.id });
      setBranchForm({ 
        name: branch.name, 
        districtName: branch.district?.name || '', 
        code: branch.code || '' 
      });
    } else {
      setEditingNode(null);
      // Default to selected district if one is active
      setBranchForm({ 
        name: '', 
        districtName: activeDistrict?.name || districts[0]?.name || '', 
        code: '' 
      });
    }
    setIsBranchDialogOpen(true);
  };

  const handleOpenDistrictDialog = (district?: any) => {
    if (district) {
      setEditingNode({ type: 'district', id: district.id });
      setDistrictForm({ name: district.name });
    } else {
      setEditingNode(null);
      setDistrictForm({ name: '' });
    }
    setIsDistrictDialogOpen(true);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name || !branchForm.districtName) {
      toast({ variant: "destructive", title: "Information Required" });
      return;
    }
    
    setIsSaving(true);
    try {
      if (editingNode?.type === 'branch') {
        await updateBranch(editingNode.id, branchForm);
        toast({ title: "Successful" });
      } else {
        await createBranch(branchForm);
        toast({ title: "Successful" });
      }
      setIsBranchDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDistrict = async () => {
    if (!districtForm.name) return;
    
    setIsSaving(true);
    try {
      if (editingNode?.type === 'district') {
        await updateDistrict(editingNode.id, districtForm.name);
        toast({ title: "Successful" });
      } else {
        await createDistrict(districtForm.name);
        toast({ title: "Successful" });
      }
      setIsDistrictDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (type: 'district' | 'branch', id: string) => {
    if (!confirm(`Permanently remove this ${type}? This action cannot be undone.`)) return;
    try {
      await deleteNode(type, id);
      toast({ title: "Successful" });
      if (type === 'district' && activeDistrictId === id) setActiveDistrictId(null);
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Delete Denied", description: "Branch may contain active records." });
    }
  };

  if (loading || permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-48 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Scanning Institutional Hierarchy...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">{SYSTEM_SECTION_COPY.MANAGE_BRANCHES.label}</h1>
          <p className="text-muted-foreground text-lg font-medium">{SYSTEM_SECTION_COPY.MANAGE_BRANCHES.description}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" onClick={() => handleOpenDistrictDialog()} className="flex-1 md:flex-none gap-2 h-12 px-6 border-primary/20 text-primary font-black rounded-xl hover:bg-primary/5 transition-all">
            <Globe className="w-4 h-4" /> Add District
          </Button>
          <Button onClick={() => handleOpenBranchDialog()} className="flex-1 md:flex-none gap-2 h-12 px-8 shadow-xl bg-primary hover:bg-primary/90 font-black rounded-xl text-white transition-all active:scale-[0.98]" disabled={districts.length === 0}>
            <Plus className="w-4 h-4" /> Add Branch
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* DISTRICT PANEL */}
        <Card className="lg:col-span-4 shadow-xl border-slate-200 rounded-[2rem] overflow-hidden flex flex-col h-[700px]">
          <CardHeader className="bg-primary text-white border-b py-6 px-8">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-3 font-black">
                <MapPin className="w-5 h-5 text-white" /> 
                Districts
              </CardTitle>
              <Badge className="bg-white/20 border-white/20 text-white font-black">{districts.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-2">
                <div 
                  onClick={() => setActiveDistrictId(null)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border group",
                    activeDistrictId === null 
                      ? "bg-primary text-white border-primary shadow-lg" 
                      : "bg-white border-slate-100 hover:border-primary/20 text-slate-600"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", activeDistrictId === null ? "bg-white/20" : "bg-slate-50")}>
                      <Globe className="w-4 h-4" />
                    </div>
                    <span className="font-black text-sm uppercase tracking-wider">All Regions (Overall)</span>
                  </div>
                  {activeDistrictId === null && <ChevronRight className="w-4 h-4" />}
                </div>

                {districts.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No districts defined.</p>
                  </div>
                ) : districts.map(dist => (
                  <div 
                    key={dist.id} 
                    onClick={() => setActiveDistrictId(dist.id)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border group",
                      activeDistrictId === dist.id 
                        ? "bg-primary text-white border-primary shadow-lg" 
                        : "bg-white border-slate-100 hover:border-primary/20 text-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", activeDistrictId === dist.id ? "bg-white/20" : "bg-slate-50")}>
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="font-black text-sm uppercase tracking-wider">{dist.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {activeDistrictId === dist.id ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); handleOpenDistrictDialog(dist); }} 
                            className="h-8 w-8 text-primary hover:bg-primary/5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); handleDelete('district', dist.id); }} 
                            className="h-8 w-8 text-destructive hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* BRANCH PANEL */}
        <Card className="lg:col-span-8 shadow-2xl overflow-hidden border-slate-200 rounded-[2.5rem] bg-white flex flex-col h-[700px]">
          <CardHeader className="bg-primary text-white border-b py-8 px-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3 text-white">
                  <Building2 className="w-6 h-6 text-white" /> 
                  {activeDistrict ? `${activeDistrict.name} Branches` : 'Overall Branch List'}
                </CardTitle>
                <CardDescription className="text-white/70 font-bold text-[10px] uppercase tracking-[0.2em]">
                  {filteredBranches.length} Branches Discovered in Current Filter
                </CardDescription>
              </div>
              
              <div className="relative w-full md:w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
                <Input 
                  placeholder="Search branch or code..." 
                  className="pl-11 h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 font-bold rounded-2xl focus-visible:ring-white/20 transition-all shadow-inner"
                  value={branchSearchQuery}
                  onChange={(e) => setBranchSearchQuery(e.target.value)}
                />
                {branchSearchQuery && (
                  <button 
                    onClick={() => setBranchSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-8">
                {filteredBranches.length === 0 ? (
                  <div className="text-center py-32 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                    <div className="p-6 bg-white rounded-full w-fit mx-auto mb-6 shadow-sm">
                      <FilterX className="w-12 h-12 text-slate-200" />
                    </div>
                    <p className="font-black text-slate-900 text-xl tracking-tight">No Branch Discovered</p>
                    <p className="text-sm text-muted-foreground mt-2 font-medium">
                      {activeDistrict 
                        ? `Register new branches under the ${activeDistrict.name} district.` 
                        : "Adjust your search parameters or select a district to view registered branches."}
                    </p>
                    {activeDistrict && (
                      <Button onClick={() => handleOpenBranchDialog()} className="mt-8 bg-primary text-white font-black px-8 h-12 rounded-xl shadow-xl shadow-primary/20">
                        <Plus className="w-4 h-4 mr-2" /> Register First Branch
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredBranches.map(branch => (
                      <div key={branch.id} className="flex flex-col p-6 border rounded-3xl bg-white shadow-sm hover:border-primary/30 hover:shadow-xl transition-all group relative border-slate-100">
                        <div className="flex justify-between items-start mb-4">
                          <div className="space-y-1">
                            <h3 className="font-black text-slate-900 text-lg leading-none tracking-tight group-hover:text-primary transition-colors">{branch.name}</h3>
                            <div className="flex items-center gap-2 pt-1">
                              <Badge variant="outline" className="text-[9px] font-mono font-black text-slate-400 border-slate-200 bg-slate-50/50 uppercase">
                                CODE: {branch.code || 'N/A'}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenBranchDialog(branch)} className="h-10 w-10 text-primary hover:bg-primary/5 rounded-full"><Edit2 className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete('branch', branch.id)} className="h-10 w-10 text-destructive hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                        
                        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-slate-300" />
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            {branch.district?.name || 'Institutional'} Region
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="bg-slate-50/80 border-t py-4 px-10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
              Authorized Master Registry & bull; {filteredBranches.length} Verified Entries
            </p>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <DialogTitle className="text-2xl font-black flex items-center gap-3 tracking-tight text-white">
              <div className="p-2 bg-white/20 rounded-xl"><Building2 className="w-6 h-6 text-white" /></div>
              {editingNode ? 'Modify Branch' : 'Register Branch'}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Regional District</Label>
              <Select value={branchForm.districtName} onValueChange={val => setBranchForm({...branchForm, districtName: val})}>
                <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-bold"><SelectValue placeholder="Select Parent District" /></SelectTrigger>
                <SelectContent className="rounded-2xl">{districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Branch Name</Label>
              <Input placeholder="e.g. Merkato Branch" value={branchForm.name} onChange={e => setBranchForm({...branchForm, name: e.target.value})} className="h-14 rounded-2xl font-black bg-slate-50 border-slate-200 px-5 text-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Office Code</Label>
              <Input placeholder="e.g. BR-001" value={branchForm.code} onChange={e => setBranchForm({...branchForm, code: e.target.value})} className="h-14 rounded-2xl font-mono bg-slate-50 border-slate-200 px-5 text-lg" />
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4">
            <button onClick={() => setIsBranchDialogOpen(false)} disabled={isSaving} className="text-sm font-bold text-slate-400 hover:text-slate-800">Discard</button>
            <Button onClick={handleSaveBranch} disabled={isSaving} className="shadow-2xl bg-primary px-10 font-black h-14 rounded-2xl text-white hover:bg-primary/90 transition-all active:scale-[0.95]">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingNode ? 'Commit Changes' : 'Confirm Registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDistrictDialogOpen} onOpenChange={setIsDistrictDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <DialogTitle className="text-2xl font-black flex items-center gap-3 tracking-tight text-white">
              <div className="p-2 bg-white/20 rounded-xl"><Globe className="w-6 h-6 text-white" /></div>
              {editingNode ? 'Update Region' : 'Establish District'}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">District Name</Label>
              <Input placeholder="e.g. Central Addis" value={districtForm.name} onChange={e => setDistrictForm({...districtForm, name: e.target.value})} className="h-14 rounded-2xl font-black bg-slate-50 border-slate-200 px-5 text-lg" />
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4">
            <button onClick={() => setIsDistrictDialogOpen(false)} disabled={isSaving} className="text-sm font-bold text-slate-400 hover:text-slate-800">Discard</button>
            <Button onClick={handleSaveDistrict} disabled={isSaving} className="font-black bg-primary px-8 h-14 shadow-2xl rounded-2xl text-white hover:bg-primary/90 transition-all active:scale-[0.95]">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingNode ? 'Save Changes' : 'Confirm Establishment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
