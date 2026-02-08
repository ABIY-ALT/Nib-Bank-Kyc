
'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      toast({ variant: "destructive", title: "Validation Error", description: "Branch Name and Regional District are required fields." });
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

    toast({ title: "Branch Registered", description: `${branchForm.name} has been added to the institutional map.` });
    setIsBranchDialogOpen(false);
    setBranchForm({ name: '', district: '', code: '' });
  };

  const handleSaveDistrict = () => {
    if (!db) return;
    if (!districtForm.name) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please enter a name for the district." });
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

    toast({ title: "District Established", description: `${districtForm.name} added to regional registry.` });
    setIsDistrictDialogOpen(false);
    setDistrictForm({ name: '' });
  };

  const handleDelete = (coll: string, id: string) => {
    if (!db || !confirm("Caution: Removing this node may affect existing staff mappings. Proceed?")) return;
    const docRef = doc(db, coll, id);
    
    deleteDoc(docRef)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      });
      
    toast({ title: "Node Removed", description: "The record has been purged from the institutional directory." });
  };

  const canAddBranch = districts && districts.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Hierarchy</h1>
          <p className="text-muted-foreground text-lg font-medium">Manage districts and establish branch nodes across the network.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditingDistrict(null); setDistrictForm({ name: '' }); setIsDistrictDialogOpen(true); }} className="gap-2 h-11 px-6 border-primary/20 hover:bg-primary/5 text-primary font-bold">
            <Globe className="w-4 h-4" /> Add District
          </Button>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button 
                    onClick={() => { setEditingBranch(null); setBranchForm({ name: '', district: '', code: '' }); setIsBranchDialogOpen(true); }} 
                    className="gap-2 h-11 px-8 shadow-lg bg-primary hover:bg-primary/90 font-bold"
                    disabled={!canAddBranch}
                  >
                    <Plus className="w-4 h-4" /> Add Branch
                  </Button>
                </span>
              </TooltipTrigger>
              {!canAddBranch && (
                <TooltipContent className="bg-slate-900 text-white border-none p-3 max-w-xs">
                  <div className="flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">
                      Dependency Required: You must establish at least one District before registering a branch.
                    </p>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-md border-slate-200 h-fit">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> 
              Regional Districts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {districtsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : districts?.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-slate-50 space-y-2">
                  <Globe className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm text-muted-foreground font-bold">No districts defined yet.</p>
                </div>
              ) : (
                districts?.map(dist => (
                  <div key={dist.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50 transition-all group bg-white shadow-sm hover:border-primary/20">
                    <span className="font-bold text-slate-700">{dist.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingDistrict(dist); setDistrictForm(dist); setIsDistrictDialogOpen(true); }} className="h-8 w-8 text-primary hover:bg-primary/5">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete('districts', dist.id)} className="h-8 w-8 text-destructive hover:bg-destructive/5">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" /> 
              Branch Directory
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {branchesLoading ? (
                <div className="col-span-full flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : branches?.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
                  <Building2 className="w-12 h-12 text-slate-200 mx-auto" />
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900 text-lg">Empty Directory</p>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">Establish districts first, then populate the map with institutional branch nodes.</p>
                  </div>
                </div>
              ) : (
                branches?.map(branch => (
                  <div key={branch.id} className="flex flex-col p-5 border rounded-2xl bg-white shadow-sm hover:border-primary/30 transition-all group relative">
                    <h3 className="font-bold text-slate-900 text-lg leading-tight">{branch.name}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 text-[10px] font-black uppercase">
                        {branch.district} District
                      </Badge>
                      {branch.code && (
                        <Badge variant="outline" className="text-[10px] font-mono font-bold text-slate-400 border-slate-200">
                          {branch.code}
                        </Badge>
                      )}
                    </div>
                    <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingBranch(branch); setBranchForm(branch); setIsBranchDialogOpen(true); }} className="h-9 w-9 text-primary bg-white shadow-sm border border-slate-100 hover:bg-slate-50 rounded-full">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete('branches', branch.id)} className="h-9 w-9 text-destructive bg-white shadow-sm border border-slate-100 hover:bg-red-50 rounded-full">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Branch Dialog */}
      <Dialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Branch Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Regional District (Required First)</Label>
              <Select value={branchForm.district} onValueChange={val => setBranchForm({...branchForm, district: val})}>
                <SelectTrigger className="h-12 border-primary/20 focus:ring-primary shadow-sm bg-white">
                  <SelectValue placeholder="Select Parent District" />
                </SelectTrigger>
                <SelectContent>
                  {districts?.map(d => <SelectItem key={d.id} value={d.name} className="font-bold">{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground italic">If the district isn't listed, close this and add it via 'Add District'.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Branch Name</Label>
              <Input 
                value={branchForm.name} 
                onChange={e => setBranchForm({...branchForm, name: e.target.value})} 
                className="h-12 bg-white" 
                placeholder="e.g. Downtown Central"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Internal Office Code</Label>
              <Input 
                value={branchForm.code} 
                onChange={e => setBranchForm({...branchForm, code: e.target.value})} 
                className="h-12 bg-white font-mono" 
                placeholder="e.g. BR-001"
              />
            </div>
          </div>
          <DialogFooter className="pt-8 border-t mt-6">
            <Button variant="outline" onClick={() => setIsBranchDialogOpen(false)} className="px-6 font-bold h-11">Cancel</Button>
            <Button onClick={handleSaveBranch} className="shadow-xl bg-primary hover:bg-primary/90 px-10 font-black h-11">
              Save Institutional Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit District Dialog */}
      <Dialog open={isDistrictDialogOpen} onOpenChange={setIsDistrictDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-primary" />
              Regional Entity
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">District Name</Label>
              <Input 
                value={districtForm.name} 
                onChange={e => setDistrictForm({...districtForm, name: e.target.value})} 
                className="h-12 bg-white" 
                placeholder="e.g. Northern Province"
              />
            </div>
          </div>
          <DialogFooter className="pt-8 border-t mt-6">
            <Button variant="outline" onClick={() => setIsDistrictDialogOpen(false)} className="px-6 font-bold h-11">Cancel</Button>
            <Button onClick={handleSaveDistrict} className="font-black bg-primary hover:bg-primary/90 px-8 h-11 shadow-lg">
              Establish Region
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
