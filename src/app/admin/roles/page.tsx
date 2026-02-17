'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ShieldCheck, 
  Plus,
  Settings2,
  Trash2,
  Zap,
  Check,
  CheckCircle2,
  X,
  ShieldAlert,
  CheckSquare,
  Square,
  LayoutGrid
} from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRoleDefinitions, getAllPermissions, upsertRole, deactivateRole, seedInstitutionalPermissions } from '@/actions/roles';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function StaffRolesPage() {
  const { toast } = useToast();
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [roleName, setRoleName] = useState("");
  const [permissionsForm, setPermissionsForm] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([getRoleDefinitions(), getAllPermissions()]);
      setRoleDefinitions(r);
      setAllPermissions(p);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setIsSyncing(true);
    await seedInstitutionalPermissions();
    toast({ title: "Institutional Slugs Sync'd", description: "Blueprint framework initialized." });
    await loadData();
    setIsSyncing(false);
  };

  const handleOpenAdd = () => {
    setSelectedRole(null);
    setRoleName("");
    setPermissionsForm([]);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (role: any) => {
    setSelectedRole(role);
    setRoleName(role.name);
    setPermissionsForm(role.permissions.map((rp: any) => rp.permissionId));
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!roleName) {
      toast({ variant: "destructive", title: "Role Name Required" });
      return;
    }
    
    setIsSaving(true);
    try {
      const res = await upsertRole({
        id: selectedRole?.id,
        name: roleName.toUpperCase().replace(/\s+/g, '_'),
        description: "",
        permissionIds: permissionsForm
      });
      if (res.success) {
        toast({ title: "Authority Configuration Saved" });
        setIsDialogOpen(false);
        loadData();
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePermission = (id: string) => {
    setPermissionsForm(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, any[]> = {};
    allPermissions.forEach(p => {
      const g = p.group;
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });
    return groups;
  }, [allPermissions]);

  const handleToggleGroup = (groupName: string) => {
    const groupPerms = groupedPermissions[groupName] || [];
    const groupIds = groupPerms.map(p => p.id);
    const allSelected = groupIds.every(id => permissionsForm.includes(id));

    if (allSelected) {
      setPermissionsForm(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setPermissionsForm(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  if (loading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Roles</h1>
          </div>
          <p className="text-muted-foreground text-lg">Dynamic Access Control Matrix.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeed} disabled={isSyncing} className="gap-2 border-primary/20 text-primary font-bold">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Sync Slugs
          </Button>
          <Button onClick={handleOpenAdd} className="bg-primary shadow-xl font-bold h-11 px-6 text-white hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Define New Role
          </Button>
        </div>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle>Personnel Designations</CardTitle>
          <CardDescription>Manage regional and operational authority levels.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="font-bold py-4 pl-8">Role Name</TableHead>
                <TableHead className="font-bold">Institutional Status</TableHead>
                <TableHead className="text-center font-bold">Capability Authority</TableHead>
                <TableHead className="text-right font-bold pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roleDefinitions.map((role) => (
                <TableRow key={role.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell className="font-black text-slate-900 pl-8">{role.name.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={role.active ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-slate-400'}>
                      {role.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <button 
                      onClick={() => handleOpenEdit(role)}
                      className="flex items-center justify-center gap-2 mx-auto hover:scale-105 transition-transform p-2 rounded-lg hover:bg-emerald-50 group"
                    >
                      <span className="font-bold text-slate-700 group-hover:text-emerald-700">{role.permissions.length} Rights</span>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </button>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(role)} className="h-8 w-8 text-primary rounded-full hover:bg-primary/5"><Settings2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deactivateRole(role.id).then(loadData)} className="h-8 w-8 text-destructive rounded-full hover:bg-destructive/5"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl animate-in zoom-in-95 duration-300">
          <div className="bg-[#fcfaf7]">
            <DialogHeader className="p-8 bg-white border-b space-y-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">
                      {selectedRole ? 'Update Role Rights' : 'Define New Role'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">
                      Institutional Capability Assignment Workspace
                    </DialogDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsDialogOpen(false)} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </DialogHeader>
            
            <div className="p-8">
              <div className="space-y-2 mb-10 max-w-sm">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Designation Label</Label>
                <Input 
                  placeholder="e.g. REGIONAL_DIRECTOR" 
                  className="h-12 bg-white border-slate-200 font-bold focus-visible:ring-primary/20 rounded-xl"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                />
              </div>

              <ScrollArea className="h-[55vh] pr-4">
                <div className="space-y-12">
                  {Object.entries(groupedPermissions).map(([group, perms]) => {
                    const groupIds = perms.map(p => p.id);
                    const allSelectedInGroup = groupIds.every(id => permissionsForm.includes(id));
                    
                    return (
                      <div key={group} className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary whitespace-nowrap">{group}</span>
                            <div className="h-px flex-1 bg-slate-200" />
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleToggleGroup(group)}
                            className="ml-4 h-8 px-3 rounded-lg hover:bg-primary/5 text-primary font-bold text-[10px] uppercase tracking-wider gap-2"
                          >
                            {allSelectedInGroup ? (
                              <><CheckSquare className="w-3.5 h-3.5" /> Deselect All</>
                            ) : (
                              <><Square className="w-3.5 h-3.5" /> Select All</>
                            )}
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {perms.map((p: any) => {
                            const isSelected = permissionsForm.includes(p.id);
                            return (
                              <div 
                                key={p.id} 
                                onClick={() => handleTogglePermission(p.id)}
                                className={cn(
                                  "flex items-center justify-between p-5 rounded-2xl border transition-all cursor-pointer group",
                                  isSelected 
                                    ? "bg-primary/5 border-primary/40 shadow-sm" 
                                    : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                                )}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={cn(
                                    "w-2 h-2 rounded-full transition-all",
                                    isSelected ? "bg-primary scale-125 shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-slate-200"
                                  )} />
                                  <span className={cn(
                                    "text-xs font-bold transition-colors",
                                    isSelected ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700"
                                  )}>{p.name}</span>
                                </div>
                                <div className={cn(
                                  "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center",
                                  isSelected ? "bg-primary border-primary" : "bg-white border-slate-200 group-hover:border-primary/30"
                                )}>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[4px]" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="p-8 bg-white border-t flex flex-row justify-end items-center gap-6 rounded-b-3xl">
              <button 
                onClick={() => setIsDialogOpen(false)} 
                className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Discard Changes
              </button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="h-12 px-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-xl shadow-primary/20 transition-all active:scale-95"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Commit Rights Map
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
