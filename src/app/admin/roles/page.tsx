
'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection, query, orderBy, setDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, UserRole } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  ShieldCheck, 
  Search,
  UserCog,
  ShieldAlert,
  UserCheck,
  Lock,
  Plus,
  Settings2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const DEFAULT_ROLES: UserRole[] = [
  'Branch Officer', 
  'KYC Officer', 
  'Supervisor', 
  'Director', 
  'Admin', 
  'Branch Manager', 
  'District Director'
];

interface PermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canSupervise: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

export default function StaffRolesPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const usersQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "users"), orderBy("name")) : null;
  }, [db]);

  const { data: users, loading } = useCollection<User>(usersQuery);

  const rolesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "roleDefinitions"), orderBy("name")) : null;
  }, [db]);

  const { data: dynamicRoles } = useCollection<{id: string, name: string, permissions: PermissionSet}>(rolesQuery);

  const allRoleNames = Array.from(new Set([...DEFAULT_ROLES, ...(dynamicRoles?.map(r => r.name as UserRole) || [])]));

  const handleRoleChange = (userId: string, newRole: UserRole, currentName: string) => {
    if (!db) return;
    const userRef = doc(db, "users", userId);
    const updateData = { role: newRole };

    updateDoc(userRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: "Role Updated",
      description: `${currentName} is now assigned as ${newRole}.`,
    });
  };

  const handleTogglePermission = (roleId: string, permission: keyof PermissionSet, currentValue: boolean) => {
    if (!db) return;
    const roleRef = doc(db, "roleDefinitions", roleId);
    const updateData = { [`permissions.${permission}`]: !currentValue };

    updateDoc(roleRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: roleRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const handleAddRole = () => {
    if (!db || !newRoleName.trim()) return;
    
    const roleId = newRoleName.toLowerCase().replace(/\s+/g, '-');
    const roleRef = doc(db, "roleDefinitions", roleId);
    const data = {
      id: roleId,
      name: newRoleName,
      permissions: {
        canSubmit: false,
        canReview: false,
        canSupervise: false,
        canViewReports: false,
        canManageUsers: false,
        canManageSystem: false
      }
    };

    setDoc(roleRef, data)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: roleRef.path,
          operation: 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({ title: "Role Created", description: `${newRoleName} added to registry.` });
    setIsAddRoleOpen(false);
    setNewRoleName("");
  };

  const filteredUsers = users?.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground">Retrieving institutional authorization matrix...</p>
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
          <p className="text-muted-foreground text-lg font-medium">Configure system access levels and operational privileges.</p>
        </div>
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
            <CardHeader className="bg-slate-50/50 border-b">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-primary" />
                    Staff Role Mapping
                  </CardTitle>
                  <CardDescription>Assign predefined roles to institutional personnel.</CardDescription>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Search personnel..." 
                    className="pl-9 h-11 border-primary/20 focus-visible:ring-primary" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="font-bold py-4">Staff Member</TableHead>
                    <TableHead className="font-bold">Current Designation</TableHead>
                    <TableHead className="font-bold">Branch / Office</TableHead>
                    <TableHead className="text-right font-bold pr-8">Update Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-slate-50 transition-colors group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold border border-primary/20">
                            {u.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{u.name}</span>
                            <span className="text-[10px] text-muted-foreground font-bold tracking-tighter">{u.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-primary/5 text-primary font-bold flex items-center gap-1.5 w-fit">
                          <UserCheck className="w-3 h-3" />
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                          {u.branch || 'Central HQ'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex justify-end">
                          <Select 
                            value={u.role} 
                            onValueChange={(val) => handleRoleChange(u.id, val as UserRole, u.name)}
                          >
                            <SelectTrigger className="w-[200px] h-10 border-primary/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {allRoleNames.map(role => (
                                <SelectItem key={role} value={role}>{role}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="definitions">
          <div className="grid gap-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Permission Matrix</h3>
                <p className="text-muted-foreground">Define what each institutional role can view and execute.</p>
              </div>
              <Button onClick={() => setIsAddRoleOpen(true)} className="gap-2 shadow-lg">
                <Plus className="w-4 h-4" /> Define New Role
              </Button>
            </div>

            <Card className="shadow-xl border-slate-200 overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-bold py-4">Role Designation</TableHead>
                      <TableHead className="font-bold text-center">Submissions</TableHead>
                      <TableHead className="font-bold text-center">Review Workflows</TableHead>
                      <TableHead className="font-bold text-center">Escalations</TableHead>
                      <TableHead className="font-bold text-center">Reports</TableHead>
                      <TableHead className="font-bold text-center">User Management</TableHead>
                      <TableHead className="font-bold text-center">System Settings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Default Roles (Read Only logic for MVP, or allow overriding) */}
                    {DEFAULT_ROLES.map(role => (
                      <TableRow key={role} className="hover:bg-slate-50">
                        <TableCell className="font-bold text-slate-900 flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          {role}
                        </TableCell>
                        <TableCell className="text-center"><CheckCircle2 className="w-4 h-4 mx-auto text-emerald-500" /></TableCell>
                        <TableCell className="text-center">
                          {['KYC Officer', 'Supervisor', 'Admin'].includes(role) ? <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-500" /> : <XCircle className="w-4 h-4 mx-auto text-slate-200" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {['Supervisor', 'Director', 'Admin'].includes(role) ? <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-500" /> : <XCircle className="w-4 h-4 mx-auto text-slate-200" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {['Supervisor', 'Director', 'Admin', 'District Director', 'Branch Manager'].includes(role) ? <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-500" /> : <XCircle className="w-4 h-4 mx-auto text-slate-200" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {role === 'Admin' ? <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-500" /> : <XCircle className="w-4 h-4 mx-auto text-slate-200" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {role === 'Admin' ? <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-500" /> : <XCircle className="w-4 h-4 mx-auto text-slate-200" />}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Dynamic Roles */}
                    {dynamicRoles?.map(role => (
                      <TableRow key={role.id} className="bg-primary/5 hover:bg-primary/10 transition-colors">
                        <TableCell className="font-bold text-slate-900 flex items-center gap-2">
                          <Settings2 className="w-3.5 h-3.5 text-primary" />
                          {role.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={role.permissions.canSubmit} onCheckedChange={() => handleTogglePermission(role.id, 'canSubmit', role.permissions.canSubmit)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={role.permissions.canReview} onCheckedChange={() => handleTogglePermission(role.id, 'canReview', role.permissions.canReview)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={role.permissions.canSupervise} onCheckedChange={() => handleTogglePermission(role.id, 'canSupervise', role.permissions.canSupervise)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={role.permissions.canViewReports} onCheckedChange={() => handleTogglePermission(role.id, 'canViewReports', role.permissions.canViewReports)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={role.permissions.canManageUsers} onCheckedChange={() => handleTogglePermission(role.id, 'canManageUsers', role.permissions.canManageUsers)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={role.permissions.canManageSystem} onCheckedChange={() => handleTogglePermission(role.id, 'canManageSystem', role.permissions.canManageSystem)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddRoleOpen} onOpenChange={setIsAddRoleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Role</DialogTitle>
            <DialogDescription>Define a new institutional designation for your network.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Role Name</Label>
              <Input 
                placeholder="e.g. Compliance Auditor" 
                value={newRoleName} 
                onChange={(e) => setNewRoleName(e.target.value)}
                className="h-11 border-primary/20 focus-visible:ring-primary"
              />
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsAddRoleOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRole} className="font-bold px-8 shadow-lg">Initialize Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
