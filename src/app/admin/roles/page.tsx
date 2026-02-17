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
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAllUsers, updateUserRole } from '@/actions/users';
import { getRoleDefinitions, upsertRoleDefinition, deleteRoleDefinition } from '@/actions/roles';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';

export default function StaffRolesPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    canSubmit: false,
    canReview: false,
    canEscalate: false,
    canViewReports: false,
    canManageUsers: false,
    canManageSystem: false,
    canAccessPerformance: false,
    canAccessFollowUp: false,
    canAccessArchive: false,
    canManageFindings: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([getAllUsers(), getRoleDefinitions()]);
      setUsers(u);
      setRoleDefinitions(r);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed", description: "Could not retrieve SQL staff list." });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string, currentName: string) => {
    try {
      await updateUserRole(userId, newRole);
      toast({ title: "Role Updated", description: `${currentName} is now ${newRole.replace(/_/g, ' ')}.` });
      loadData();
    } catch (e) {
      toast({ variant: "destructive", title: "Update Failed", description: "SQL registration could not be modified." });
    }
  };

  const handleSaveRoleDefinition = async () => {
    if (!roleForm.name) return;
    const res = await upsertRoleDefinition(roleForm);
    if (res.success) {
      toast({ title: "Role Definition Saved" });
      setIsRoleDialogOpen(false);
      resetRoleForm();
      loadData();
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm("Remove this role definition?")) return;
    await deleteRoleDefinition(id);
    toast({ title: "Role Purged" });
    loadData();
  };

  const resetRoleForm = () => {
    setRoleForm({
      name: '',
      canSubmit: false,
      canReview: false,
      canEscalate: false,
      canViewReports: false,
      canManageUsers: false,
      canManageSystem: false,
      canAccessPerformance: false,
      canAccessFollowUp: false,
      canAccessArchive: false,
      canManageFindings: false
    });
    setEditingRole(null);
  };

  const filteredUsers = users.filter(u => 
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Retrieving SQL Matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Authorization Management</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Relational staff role mapping and access control.</p>
        </div>
        <Button onClick={() => { resetRoleForm(); setIsRoleDialogOpen(true); }} className="bg-primary shadow-xl font-bold h-11 px-6">
          <Plus className="w-4 h-4 mr-2" /> Add New Role
        </Button>
      </div>

      <Tabs defaultValue="assignments" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 border h-12">
          <TabsTrigger value="assignments" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            Staff Assignments
          </TabsTrigger>
          <TabsTrigger value="definitions" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            Role Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b flex flex-row justify-between items-center">
              <div><CardTitle className="text-xl">Staff Role Mapping</CardTitle></div>
              <div className="relative w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search personnel..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold py-4 pl-8">Staff Member</TableHead>
                    <TableHead className="font-bold">Current Designation</TableHead>
                    <TableHead className="text-right font-bold pr-8">Update Authorization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-slate-50">
                      <TableCell className="pl-8 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{u.firstName} {u.lastName}</span>
                          <span className="text-[10px] text-muted-foreground font-medium">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="bg-primary/5 text-primary font-bold">{u.role?.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-right pr-8">
                        <Select value={u.role} onValueChange={(val) => handleRoleChange(u.id, val, `${u.firstName} ${u.lastName}`)}>
                          <SelectTrigger className="w-[220px] h-10 border-primary/20 bg-white"><SelectValue placeholder="Assign Role" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">ADMIN</SelectItem>
                            {roleDefinitions.filter(r => r.name !== 'ADMIN').map(role => (
                              <SelectItem key={role.id} value={role.name}>{role.name.replace(/_/g, ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="definitions">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl">Institutional Permission Matrix</CardTitle>
              <CardDescription>Define operational authority for each designation.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-bold py-4 pl-8">Role Name</TableHead>
                    <TableHead className="text-center font-bold">Sub</TableHead>
                    <TableHead className="text-center font-bold">Rev</TableHead>
                    <TableHead className="text-center font-bold">Esc</TableHead>
                    <TableHead className="text-center font-bold">KB</TableHead>
                    <TableHead className="text-center font-bold">Perf</TableHead>
                    <TableHead className="text-center font-bold">FU</TableHead>
                    <TableHead className="text-center font-bold">Arch</TableHead>
                    <TableHead className="text-center font-bold">User</TableHead>
                    <TableHead className="text-center font-bold">Sys</TableHead>
                    <TableHead className="text-right font-bold pr-8">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleDefinitions.map((def) => (
                    <TableRow key={def.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-black text-slate-900 pl-8">{def.name}</TableCell>
                      <TableCell className="text-center">{def.canSubmit ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canReview ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canEscalate ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canManageFindings ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canAccessPerformance ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canAccessFollowUp ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canAccessArchive ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canManageUsers ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-center">{def.canManageSystem ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-200 mx-auto" />}</TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingRole(def); setRoleForm(def); setIsRoleDialogOpen(true); }} className="h-8 w-8 text-primary"><Settings2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteRole(def.id)} className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {roleDefinitions.length === 0 && (
                    <TableRow><TableCell colSpan={11} className="py-20 text-center text-muted-foreground italic">No dynamic roles defined.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" />
              {editingRole ? 'Update Role' : 'Define New Role'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Designation Name</Label>
              <Input 
                value={roleForm.name} 
                onChange={e => setRoleForm({...roleForm, name: e.target.value.toUpperCase().replace(/\s+/g, '_')})} 
                placeholder="e.g. SENIOR_AUDITOR"
                className="h-11 font-mono font-bold"
                disabled={!!editingRole}
              />
            </div>

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Operational Authority</Label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'canSubmit', label: 'Case Submission' },
                  { id: 'canReview', label: 'KYC Review' },
                  { id: 'canEscalate', label: 'Risk Escalation' },
                  { id: 'canManageFindings', label: 'Knowledge Base (F&amp;Q)' },
                  { id: 'canManageUsers', label: 'User Access' },
                  { id: 'canManageSystem', label: 'System Config' }
                ].map(perm => (
                  <div key={perm.id} className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                    <Checkbox 
                      id={perm.id} 
                      checked={(roleForm as any)[perm.id]} 
                      onCheckedChange={(val) => setRoleForm({...roleForm, [perm.id]: !!val})} 
                    />
                    <label htmlFor={perm.id} className="text-xs font-bold text-slate-700 cursor-pointer">{perm.label}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-dashed">
              <Label className="text-[10px] font-black uppercase tracking-widest text-accent">Module Access (By Page)</Label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'canAccessPerformance', label: 'Performance Analytics' },
                  { id: 'canAccessFollowUp', label: 'Follow-up Audit' },
                  { id: 'canAccessArchive', label: 'Master Archive' }
                ].map(perm => (
                  <div key={perm.id} className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                    <Checkbox 
                      id={perm.id} 
                      checked={(roleForm as any)[perm.id]} 
                      onCheckedChange={(val) => setRoleForm({...roleForm, [perm.id]: !!val})} 
                    />
                    <label htmlFor={perm.id} className="text-xs font-bold text-slate-700 cursor-pointer">{perm.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-6 border-t mt-4">
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRoleDefinition} className="bg-primary font-black px-8">Commit Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}