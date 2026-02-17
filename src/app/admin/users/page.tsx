'use client';

import { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Mail, 
  Loader2,
  Building2,
  Settings2,
  UserCheck,
  UserX,
  ShieldCheck,
  Phone,
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
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAllUsers, updateUserStatus, provisionUser } from '@/actions/users';
import { getBranches } from '@/actions/hierarchy';
import { getRoleDefinitions } from '@/actions/roles';
import { UserStatus } from '@prisma/client';

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [formData, setFormData] = useState<any>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    role: '',
    status: UserStatus.ACTIVE,
    branchId: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, b, r] = await Promise.all([
        getAllUsers(), 
        getBranches(),
        getRoleDefinitions()
      ]);
      setUsers(u);
      setBranches(b);
      setRoleDefinitions(r);
    } catch (error) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (user?: any) => {
    if (user) {
      setEditingUser(user);
      setFormData({ 
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        role: user.role || '',
        status: user.status || UserStatus.ACTIVE,
        branchId: user.branchId || ''
      });
    } else {
      setEditingUser(null);
      setFormData({ 
        firstName: '', 
        lastName: '',
        email: '', 
        phoneNumber: '',
        role: roleDefinitions[0]?.name || 'ADMIN', 
        status: UserStatus.ACTIVE, 
        branchId: '' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({ variant: "destructive", title: "Identity Required" });
      return;
    }

    setIsSyncing(true);
    try {
      const id = editingUser?.firebaseUid || `user-${Math.random().toString(36).substr(2, 9)}`;
      await provisionUser({ ...formData, id });
      toast({ title: "Profile Updated" });
      setIsDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    try {
      await updateUserStatus(user.id, newStatus);
      toast({ title: "Status Updated" });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Personnel Directory</h1>
          <p className="text-muted-foreground text-lg font-medium">Blueprint-aligned institutional staff management.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-lg font-bold h-11 px-6">
          <UserPlus className="w-4 h-4" />
          Provision User
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4">Identity</TableHead>
              <TableHead className="font-bold">Role</TableHead>
              <TableHead className="font-bold">Branch Mapping</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right font-bold pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                      {user.firstName?.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">{user.firstName} {user.lastName}</span>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold">
                        <Mail className="w-3 h-3" /> {user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-primary/5 text-primary font-bold">
                    {user.role?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> {user.branch?.name || "Unmapped"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={user.status === UserStatus.ACTIVE ? 'text-green-600 border-green-200 bg-green-50' : 'text-slate-400 border-slate-200 bg-slate-50'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)} className="text-primary rounded-full h-9 w-9">
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(user)} className="text-destructive rounded-full h-9 w-9">
                      {user.status === UserStatus.ACTIVE ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Institutional Profile
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">First Name</Label>
                <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Last Name</Label>
                <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-11" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500">Official Email</Label>
              <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11" />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input value={formData.phoneNumber || ""} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} placeholder="+251..." className="pl-10 h-11" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-primary">System Role</Label>
                <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val})}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    {roleDefinitions.filter(r => r.name !== 'ADMIN').map(role => (
                      <SelectItem key={role.id} value={role.name}>{role.name.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Branch</Label>
                <Select value={formData.branchId || ""} onValueChange={val => setFormData({...formData, branchId: val})}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select Branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSyncing}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSyncing} className="bg-primary px-8">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
