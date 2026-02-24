'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Building2, Plus, MapPin, Trash2, Loader2, Globe, Edit2 } from "lucide-react";
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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBranches, getDistricts, createBranch, updateBranch, createDistrict, updateDistrict, deleteNode } from '@/actions/hierarchy';

export default function BranchesDistrictsPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [isDistrictDialogOpen, setIsDistrictDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<{ type: 'district' | 'branch', id: string } | null>(null);
  
  const [branchForm, setBranchForm] = useState<any>({ name: '', districtName: '', code: '' });
  const [districtForm, setDistrictForm] = useState<any>({ name: '' });

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
      setBranchForm({ name: '', districtName: districts[0]?.name || '', code: '' });
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
        toast({ title: "Branch Updated" });
      } else {
        await createBranch(branchForm);
        toast({ title: "Branch Registered" });
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
        toast({ title: "District Updated" });
      } else {
        await createDistrict(districtForm.name);
        toast({ title: "District Established" });
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
      toast({ title: "Node Removed" });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Delete Denied", description: "Node may contain active records." });
    }
  };

  if (loading) {
    return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Hierarchy</h1>
          <p className="text-muted-foreground text-lg">Manage regional nodes and districts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleOpenDistrictDialog()} className="gap-2 h-11 px-6 border-primary/20 text-primary font-bold">
            <Globe className="w-4 h-4" /> Add District
          </Button>
          <Button onClick={() => handleOpenBranchDialog()} className="gap-2 h-11 px-8 shadow-lg bg-primary hover:bg-primary/90 font-bold" disabled={districts.length === 0}>
            <Plus className="w-4 h-4" /> Add Branch
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-md h-fit border-slate-200 rounded-2xl overflow-hidden">
          <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl flex items-center gap-2 font-bold"><MapPin className="w-5 h-5 text-white" /> Districts</CardTitle></CardHeader>
          <CardContent className="pt-6 space-y-3">
            {districts.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground italic">No districts defined.</p>
            ) : districts.map(dist => (
              <div key={dist.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/20 transition-all group">
                <span className="font-bold text-slate-700">{dist.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenDistrictDialog(dist)} className="h-8 w-8 text-primary hover:bg-primary/5"><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete('district', dist.id)} className="h-8 w-8 text-destructive hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 shadow-xl overflow-hidden border-slate-200 rounded-3xl">
          <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl flex items-center gap-2 font-bold"><Building2 className="w-5 h-5 text-white" /> Branch Directory</CardTitle></CardHeader>
          <CardContent className="pt-6">
            {branches.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="font-bold text-slate-900">No Branches Discovered</p>
                <p className="text-sm text-muted-foreground mt-1">Register branches under an established district.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {branches.map(branch => (
                  <div key={branch.id} className="flex flex-col p-5 border rounded-2xl bg-white shadow-sm hover:border-primary/30 transition-all group relative">
                    <h3 className="font-bold text-slate-900 text-lg leading-tight">{branch.name}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 text-[10px] font-black uppercase">
                        {branch.district?.name || 'Manual'} District
                      </Badge>
                      {branch.code && <Badge variant="outline" className="text-[10px] font-mono font-bold text-slate-400 border-slate-200">{branch.code}</Badge>}
                    </div>
                    <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenBranchDialog(branch)} className="h-9 w-9 text-primary hover:bg-primary/5"><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete('branch', branch.id)} className="h-9 w-9 text-destructive hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl"><Building2 className="w-6 h-6 text-white" /></div>
              {editingNode ? 'Modify Node' : 'Branch Configuration'}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Regional District</Label>
              <Select value={branchForm.districtName} onValueChange={val => setBranchForm({...branchForm, districtName: val})}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select Parent District" /></SelectTrigger>
                <SelectContent>{districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Branch Name</Label>
              <Input placeholder="e.g. Merkato Branch" value={branchForm.name} onChange={e => setBranchForm({...branchForm, name: e.target.value})} className="h-12 rounded-xl font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Office Code</Label>
              <Input placeholder="e.g. BR-001" value={branchForm.code} onChange={e => setBranchForm({...branchForm, code: e.target.value})} className="h-12 rounded-xl font-mono" />
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t">
            <Button variant="ghost" onClick={() => setIsBranchDialogOpen(false)} disabled={isSaving} className="font-bold text-slate-500">Cancel</Button>
            <Button onClick={handleSaveBranch} disabled={isSaving} className="shadow-xl bg-primary px-10 font-black h-12 rounded-xl">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingNode ? 'Commit Changes' : 'Register Node'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDistrictDialogOpen} onOpenChange={setIsDistrictDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl"><Globe className="w-6 h-6 text-white" /></div>
              {editingNode ? 'Update Region' : 'Regional Entity'}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">District Name</Label>
              <Input placeholder="e.g. Central Addis" value={districtForm.name} onChange={e => setDistrictForm({...districtForm, name: e.target.value})} className="h-12 rounded-xl font-bold" />
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t">
            <Button variant="ghost" onClick={() => setIsDistrictDialogOpen(false)} disabled={isSaving} className="font-bold text-slate-500">Cancel</Button>
            <Button onClick={handleSaveDistrict} disabled={isSaving} className="font-black bg-primary px-8 h-12 shadow-lg rounded-xl text-white">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingNode ? 'Save Changes' : 'Establish Region'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
