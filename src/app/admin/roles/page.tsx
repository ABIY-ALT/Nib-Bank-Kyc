'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ShieldCheck, 
  Search,
  Plus,
  Settings2,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Zap,
  Filter
} from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoleDefinitions, getAllPermissions, upsertRole, deactivateRole, seedInstitutionalPermissions } from '@/actions/roles';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function StaffRolesPage() {
  const { toast } = useToast();
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissionIds: [] as string[]
  });

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
    toast({ title: "Permissions Initialized", description: "Standard institutional roles and 100+ permissions seeded." });
    await loadData();
    setIsSyncing(false);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name) return;
    const res = await upsertRole(roleForm);
    if (res.success) {
      toast({ title: "Role Configuration Saved" });
      setIsRoleDialogOpen(false);
      loadData();
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };

  const handleTogglePermission = (id: string) => {
    setRoleForm(prev => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(id) 
        ? prev.permissionIds.filter(pid => pid !== id)
        : [...prev.permissionIds, id]
    }));
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions.map((rp: any) => rp.permissionId)
    });
    setIsRoleDialogOpen(true);
  };

  const resetForm = () => {
    setEditingRole(null);
    setRoleForm({ name: '', description: '', permissionIds: [] });
    setIsRoleDialogOpen(true);
  };

  if (loading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  const permissionsByGroup = allPermissions.reduce((acc: any, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Permissions</h1>
          </div>
          <p className="text-muted-foreground text-lg">Dynamic Role-Based Access Control (RBAC) Matrix.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeed} disabled={isSyncing} className="gap-2 border-primary/20 text-primary">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Sync Permissions
          </Button>
          <Button onClick={resetForm} className="bg-primary shadow-xl font-bold h-11 px-6">
            <Plus className="w-4 h-4 mr-2" /> Create Role
          </Button>
        </div>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle>Role Management</CardTitle>
          <CardDescription>Assign atomic permissions to institutional designations.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="font-bold py-4 pl-8">Role Name</TableHead>
                <TableHead className="font-bold">Description</TableHead>
                <TableHead className="text-center font-bold">Privileges</TableHead>
                <TableHead className="text-right font-bold pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roleDefinitions.map((role) => (
                <TableRow key={role.id} className="hover:bg-slate-50">
                  <TableCell className="font-black text-slate-900 pl-8">{role.name.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{role.description}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-primary/5 text-primary font-bold">
                      {role.permissions.length} Slugs
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(role)} className="h-8 w-8 text-primary"><Settings2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deactivateRole(role.id).then(loadData)} className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 bg-slate-50 border-b">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" />
              {editingRole ? 'Modify Role Definition' : 'Define Institutional Role'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-6 grid grid-cols-2 gap-6 border-b bg-white">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">System Designation</Label>
                <Input 
                  value={roleForm.name} 
                  onChange={e => setRoleForm({...roleForm, name: e.target.value.toUpperCase().replace(/\s+/g, '_')})} 
                  placeholder="e.g. KYC_SPECIALIST_L2"
                  className="h-11 font-mono font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Business Context</Label>
                <Input 
                  value={roleForm.description} 
                  onChange={e => setRoleForm({...roleForm, description: e.target.value})} 
                  placeholder="Brief role description..."
                  className="h-11"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-8 pb-8">
                {Object.entries(permissionsByGroup).map(([group, perms]: [string, any]) => (
                  <div key={group} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-slate-100" />
                      <Badge variant="outline" className="bg-slate-50 text-slate-400 font-black tracking-widest uppercase text-[10px] py-1">
                        {group} Capability Set
                      </Badge>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {perms.map((p: any) => (
                        <div 
                          key={p.id} 
                          onClick={() => handleTogglePermission(p.id)}
                          className={cn(
                            "flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all",
                            roleForm.permissionIds.includes(p.id) 
                              ? "border-primary bg-primary/5 shadow-sm" 
                              : "border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <Checkbox 
                            id={p.id} 
                            checked={roleForm.permissionIds.includes(p.id)}
                            onCheckedChange={() => handleTogglePermission(p.id)}
                          />
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-slate-900 leading-tight">{p.name}</p>
                            <p className="text-[9px] font-mono text-slate-400 uppercase">{p.slug}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50">
            <div className="flex items-center justify-between w-full">
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                {roleForm.permissionIds.length} atomic privileges selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveRole} className="bg-primary font-black px-10">Commit Changes</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
