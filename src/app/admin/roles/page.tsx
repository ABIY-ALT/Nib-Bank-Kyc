
'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection, query, orderBy, setDoc, deleteDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, UserRole } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  ShieldCheck, 
  Search,
  UserCog,
  UserCheck,
  Lock,
  Plus,
  Settings2,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2
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
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const DEFAULT_ROLES: UserRole[] = [
  'Branch Officer', 
  'KYC Officer', 
  'Supervisor', 
  'Director', 
  'Admin', 
  'Branch Manager', 
  'District Director',
  'Division Manager'
];

interface PermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canSupervise: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

interface DynamicRole {
  id: string;
  name: string;
  permissions: PermissionSet;
}

export default function StaffRolesPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRole, setEditingRole] = useState<DynamicRole | null>(null);

  const usersQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "users"), orderBy("name")) : null;
  }, [db]);

  const { data: users, loading } = useCollection<User>(usersQuery);

  const rolesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "roleDefinitions"), orderBy("name")) : null;
  }, [db]);

  const { data: dynamicRoles } = useCollection<DynamicRole>(rolesQuery);

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

  const handleUpdateRoleName = () => {
    if (!db || !editingRole || !newRoleName.trim()) return;
    
    const roleRef = doc(db, "roleDefinitions", editingRole.id);
    const updateData = { name: newRoleName };

    updateDoc(roleRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: roleRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({ title: "Role Renamed", description: `Role is now called ${newRoleName}.` });
    setIsEditNameOpen(false);
    setEditingRole(null);
    setNewRoleName("");
  };

  const handleDeleteRole = (role: DynamicRole) => {
    if (!db || !confirm(`Are you sure you want to delete the "${role.name}" role?`)) return;
    
    const roleRef = doc(db, "roleDefinitions", role.id);
    deleteDoc(roleRef).catch(() => {});
    toast({ title: "Role Deleted" });
  };

  const filteredUsers = users?.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground">Retrieving institutional authorization matrix...</p>
      </div>
    );
  }

  const EnabledIcon = () => <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-500" />;
  const DisabledIcon = () => <XCircle className="w-5 h-5 mx-auto text-slate-200" />;

  const PermissionIconToggle = ({ 
    enabled, 
    onClick 
  }: { 
    enabled: boolean; 
    onClick: () => void 
  }) => (
    <button 
      onClick={onClick}
      className="focus:outline-none transition-all active:scale-90 p-1 hover:bg-slate-100 rounded-full group/toggle"
    >
      {enabled ? <EnabledIcon /> : <DisabledIcon />}
    </button>
  );

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
            Permission Matrix
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search personnel..." className="pl-9 h-11" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="font-bold py-4">Staff Member</TableHead>
                    <TableHead className="font-bold">Designation</TableHead>
                    <TableHead className="font-bold">Branch / Office</TableHead>
                    <TableHead className="text-right font-bold pr-8">Update Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                            {u.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{u.name}</span>
                            <span className="text-[10px] text-muted-foreground">{u.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.role ? <Badge variant="secondary" className="bg-primary/5 text-primary font-bold">{u.role}</Badge> : <Badge variant="outline">Unassigned</Badge>}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{u.branch || 'Central HQ'}</TableCell>
                      <TableCell className="text-right pr-8">
                        <Select value={u.role} onValueChange={(val) => handleRoleChange(u.id, val as UserRole, u.name)}>
                          <SelectTrigger className="w-[200px] h-10"><SelectValue placeholder="Select Role" /></SelectTrigger>
                          <SelectContent>
                            {allRoleNames.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
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
          <Card className="shadow-2xl border-slate-200 overflow-hidden bg-white rounded-2xl">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b">
                    <TableHead className="font-bold py-6 pl-8 text-slate-500 uppercase tracking-widest text-[11px]">Role Designation</TableHead>
                    <TableHead className="font-bold text-center text-slate-500 uppercase tracking-widest text-[11px]">Submissions</TableHead>
                    <TableHead className="font-bold text-center text-slate-500 uppercase tracking-widest text-[11px]">Workflows</TableHead>
                    <TableHead className="font-bold text-center text-slate-500 uppercase tracking-widest text-[11px]">Escalations</TableHead>
                    <TableHead className="font-bold text-center text-slate-500 uppercase tracking-widest text-[11px]">Reports</TableHead>
                    <TableHead className="font-bold text-center text-slate-500 uppercase tracking-widest text-[11px]">Users</TableHead>
                    <TableHead className="font-bold text-center text-slate-500 uppercase tracking-widest text-[11px]">System</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEFAULT_ROLES.map(role => (
                    <TableRow key={role} className="border-b last:border-0">
                      <TableCell className="font-bold text-slate-900 py-6 pl-8 flex items-center gap-3">
                        <Lock className="w-4 h-4 text-slate-300" />
                        <span className="text-[15px]">{role}</span>
                      </TableCell>
                      <TableCell className="text-center"><EnabledIcon /></TableCell>
                      <TableCell className="text-center">
                        {['KYC Officer', 'Supervisor', 'Admin'].includes(role) ? <EnabledIcon /> : <DisabledIcon />}
                      </TableCell>
                      <TableCell className="text-center">
                        {['Supervisor', 'Director', 'Admin', 'Division Manager'].includes(role) ? <EnabledIcon /> : <DisabledIcon />}
                      </TableCell>
                      <TableCell className="text-center">
                        {['Supervisor', 'Director', 'Admin', 'Branch Manager', 'District Director', 'Division Manager'].includes(role) ? <EnabledIcon /> : <DisabledIcon />}
                      </TableCell>
                      <TableCell className="text-center">{role === 'Admin' ? <EnabledIcon /> : <DisabledIcon />}</TableCell>
                      <TableCell className="text-center">{role === 'Admin' ? <EnabledIcon /> : <DisabledIcon />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
