
'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Building2, Plus, MapPin, Trash2, Edit2, Loader2, Globe } from "lucide-react";
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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface Branch {
  id: string;
  name: string;
  district: string;
  code: string;
}

interface District {
  id: string;
  name: string;
}

export default function BranchesDistrictsPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [isDistrictDialogOpen, setIsDistrictDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
  
  const [branchForm, setBranchForm] = useState<Partial<Branch>>({ name: '', district: '', code: '' });
  const [districtForm, setDistrictForm] = useState<Partial<District>>({ name: '' });

  const branchesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "branches"), orderBy("name")) : null;
  }, [db]);

  const { data: branches, loading: branchesLoading } = useCollection<Branch>(branchesQuery);

  const districtsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "districts"), orderBy("name")) : null;
  }, [db]);

  const { data: districts, loading: districtsLoading } = useCollection<District>(districtsQuery);

  const handleSaveBranch = () => {
    if (!db) return;
    if (!branchForm.name || !branchForm.district) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Name and District are required." });
      return;
    }

    const id = editingBranch?.id || `branch-${Date.now()}`;
    const branchRef = doc(db, "branches", id);
    const data = { ...branchForm, id };

    setDoc(branchRef, data, { merge: true })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: branchRef.path,
          operation: editingBranch ? 'update' : 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({ title: "Branch Saved", description: `${branchForm.name} updated.` });
    setIsBranchDialogOpen(false);
    setBranchForm({ name: '', district: '', code: '' });
  };

  const handleSaveDistrict = () => {
    if (!db) return;
    if (!districtForm.name) {
      toast({ variant: "destructive", title: "Missing Name", description: "District name is required." });
      return;
    }

    const id = editingDistrict?.id || `dist-${Date.now()}`;
    const districtRef = doc(db, "districts", id);
    const data = { ...districtForm, id };

    setDoc(districtRef, data, { merge: true })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: districtRef.path,
          operation: editingDistrict ? 'update' : 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({ title: "District Saved", description: `${districtForm.name} defined.` });
    setIsDistrictDialogOpen(false);
    setDistrictForm({ name: '' });
  };

  const handleDelete = (coll: string, id: string) => {
    if (!db || !confirm("Are you sure?")) return;
    const docRef = doc(db, coll, id);
    
    deleteDoc(docRef)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      });
      
    toast({ title: "Deleted", description: "Record removed successfully." });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Hierarchy</h1>
          <p className="text-muted-foreground text-lg font-medium">Manage districts and branches.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditingDistrict(null); setDistrictForm({ name: '' }); setIsDistrictDialogOpen(true); }} className="gap-2">
            <Globe className="w-4 h-4" /> Add District
          </Button>
          <Button onClick={() => { setEditingBranch(null); setBranchForm({ name: '', district: '', code: '' }); setIsBranchDialogOpen(true); }} className="gap-2 shadow-lg">
            <Plus className="w-4 h-4" /> Add Branch
          </Button>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <Card className="md:col-span-1 shadow-md border-slate-200 h-fit">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> Districts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {districtsLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 
               districts?.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center">No districts defined.</p>
               ) :
               districts?.map(dist => (
                <div key={dist.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50 transition-all group bg-white shadow-sm">
                  <span className="font-bold text-slate-700">{dist.name}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingDistrict(dist); setDistrictForm(dist); setIsDistrictDialogOpen(true); }} className="h-8 w-8 text-primary">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete('districts', dist.id)} className="h-8 w-8 text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-xl border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" /> Branches
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {branchesLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto col-span-2" /> :
               branches?.length === 0 ? (
                <p className="text-slate-400 font-medium text-center col-span-2">No branches in system.</p>
               ) :
               branches?.map(branch => (
                <div key={branch.id} className="flex flex-col p-5 border rounded-2xl bg-white shadow-sm hover:border-primary/30 transition-all group relative">
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">{branch.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px] font-bold text-primary">
                      {branch.district} District
                    </Badge>
                  </div>
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingBranch(branch); setBranchForm(branch); setIsBranchDialogOpen(true); }} className="h-8 w-8 text-primary bg-white shadow-sm border">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete('branches', branch.id)} className="h-8 w-8 text-destructive bg-white shadow-sm border">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Branch Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Branch Name</Label>
              <Input value={branchForm.name} onChange={e => setBranchForm({...branchForm, name: e.target.value})} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Internal Code</Label>
                <Input value={branchForm.code} onChange={e => setBranchForm({...branchForm, code: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Regional District</Label>
                <Select value={branchForm.district} onValueChange={val => setBranchForm({...branchForm, district: val})}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select District" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsBranchDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBranch} className="shadow-lg px-8 font-bold">Save Branch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDistrictDialogOpen} onOpenChange={setIsDistrictDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Regional District</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">District Name</Label>
              <Input value={districtForm.name} onChange={e => setDistrictForm({...districtForm, name: e.target.value})} className="h-11" />
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsDistrictDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDistrict} className="font-bold">Save Region</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
