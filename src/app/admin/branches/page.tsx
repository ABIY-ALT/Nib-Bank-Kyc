'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Building2, Plus, MapPin, Trash2, Edit2, Loader2, Globe, AlertCircle } from "lucide-react";
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
import { getBranches, getDistricts, createBranch, createDistrict, deleteNode } from '@/actions/hierarchy';

export default function BranchesDistrictsPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [isDistrictDialogOpen, setIsDistrictDialogOpen] = useState(false);
  const [branchForm, setBranchForm] = useState<any>({ name: '', districtName: '', code: '' });
  const [districtForm, setDistrictForm] = useState<any>({ name: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [b, d] = await Promise.all([getBranches(), getDistricts()]);
    setBranches(b);
    setDistricts(d);
    setLoading(false);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name || !branchForm.districtName) return;
    await createBranch(branchForm);
    toast({ title: "Branch Registered" });
    setIsBranchDialogOpen(false);
    loadData();
  };

  const handleSaveDistrict = async () => {
    if (!districtForm.name) return;
    await createDistrict(districtForm.name);
    toast({ title: "District Established" });
    setIsDistrictDialogOpen(false);
    loadData();
  };

  const handleDelete = async (type: 'district' | 'branch', id: string) => {
    if (!confirm("Are you sure?")) return;
    await deleteNode(type, id);
    toast({ title: "Node Removed" });
    loadData();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Hierarchy</h1>
          <p className="text-muted-foreground text-lg">Manage regions and nodes in SQL.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsDistrictDialogOpen(true)} className="gap-2 h-11 px-6 border-primary/20 text-primary font-bold">
            <Globe className="w-4 h-4" /> Add District
          </Button>
          <Button onClick={() => setIsBranchDialogOpen(true)} className="gap-2 h-11 px-8 shadow-lg bg-primary hover:bg-primary/90 font-bold" disabled={districts.length === 0}>
            <Plus className="w-4 h-4" /> Add Branch
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-md h-fit">
          <CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-xl flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /> Districts</CardTitle></CardHeader>
          <CardContent className="pt-6 space-y-3">
            {districts.map(dist => (
              <div key={dist.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/20 transition-all group">
                <span className="font-bold text-slate-700">{dist.name}</span>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('district', dist.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-xl flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> Branch Directory</CardTitle></CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {branches.map(branch => (
                <div key={branch.id} className="flex flex-col p-5 border rounded-2xl bg-white shadow-sm hover:border-primary/30 transition-all group relative">
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">{branch.name}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 text-[10px] font-black uppercase">{branch.districtName} District</Badge>
                    {branch.code && <Badge variant="outline" className="text-[10px] font-mono font-bold text-slate-400 border-slate-200">{branch.code}</Badge>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete('branch', branch.id)} className="absolute top-4 right-4 h-9 w-9 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-2xl font-bold">Branch Configuration</DialogTitle></DialogHeader>
          <div className="space-y-6 pt-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Regional District</Label>
              <Select value={branchForm.districtName} onValueChange={val => setBranchForm({...branchForm, districtName: val})}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select Parent District" /></SelectTrigger>
                <SelectContent>{districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Branch Name</Label>
              <Input value={branchForm.name} onChange={e => setBranchForm({...branchForm, name: e.target.value})} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Office Code</Label>
              <Input value={branchForm.code} onChange={e => setBranchForm({...branchForm, code: e.target.value})} className="h-12 font-mono" />
            </div>
          </div>
          <DialogFooter className="pt-8 border-t mt-6">
            <Button variant="outline" onClick={() => setIsBranchDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBranch} className="shadow-xl bg-primary px-10 font-black h-11">Save Node</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDistrictDialogOpen} onOpenChange={setIsDistrictDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-2xl font-bold">Regional Entity</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">District Name</Label>
              <Input value={districtForm.name} onChange={e => setDistrictForm({...districtForm, name: e.target.value})} className="h-12" />
            </div>
          </div>
          <DialogFooter className="pt-8 border-t mt-6">
            <Button variant="outline" onClick={() => setIsDistrictDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDistrict} className="font-black bg-primary px-8 h-11 shadow-lg">Establish Region</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
