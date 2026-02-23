'use client';

import { useState, useEffect, useMemo } from 'react';
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
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
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
import { cn } from '@/lib/utils';

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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
      toast({ variant: "destructive", title: "Data retrieval failed" });
    } finally {
      setLoading(false);
    }
  };

  // Filtered and Paginated Users
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return users.filter(user => 
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage]);

  const handleOpenDialog = (user?: any) => {
    if (user) {
      setEditingUser(user);
      const currentRole = user.roles?.[0]?.role?.name || '';
      setFormData({ 
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        role: currentRole,
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
        role: roleDefinitions[0]?.name || '', 
        status: UserStatus.ACTIVE, 
        branchId: '' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({ variant: "destructive", title: "Identity Required", description: "First Name, Last Name, Email, and Role are mandatory." });
      return;
    }

    // Enforce branch removal for non-branch roles during save
    const isBranchRole = formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER';
    const finalFormData = {
      ...formData,
      branchId: isBranchRole ? formData.branchId : null
    };

    setIsSyncing(true);
    try {
      const id = editingUser?.firebaseUid || `user-${Math.random().toString(36).substr(2, 9)}`;
      await provisionUser({ ...finalFormData, id });
      toast({ title: "Profile Synchronized", description: "Staff record updated." });
      setIsDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Provisioning Error", description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    try {
      await updateUserStatus(user.id, newStatus);
      toast({ title: "Access Status Updated" });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  const isBranchSpecificRole = formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Personnel Directory</h1>
          <p className="text-muted-foreground text-lg font-medium">Blueprint-aligned institutional staff management.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to first page on search
              }}
              className="pl-10 h-11 bg-white border-slate-200 rounded-xl font-medium"
            />
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-lg font-bold h-11 px-6 text-white hover:bg-primary/90">
            <UserPlus className="w-4 h-4" />
            Provision User
          </Button>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4 pl-8">Identity</TableHead>
              <TableHead className="font-bold">Role</TableHead>
              <TableHead className="font-bold">Branch Mapping</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right font-bold pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic">No personnel records found.</TableCell></TableRow>
            ) : paginatedUsers.map((user) => (
              <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                <TableCell className="pl-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 shadow-inner">
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
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 font-black uppercase text-[9px] px-3 py-1">
                    {user.roles?.[0]?.role?.name?.replace(/_/g, ' ') || "Unassigned"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> {user.branch?.name || "Unmapped"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={user.status === UserStatus.ACTIVE ? 'text-green-600 border-green-200 bg-green-50 font-black text-[9px]' : 'text-slate-400 border-slate-200 bg-slate-50 font-black text-[9px]'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)} className="text-slate-400 rounded-full h-9 w-9 hover:bg-primary/5 hover:text-primary transition-colors">
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(user)} className="text-destructive rounded-full h-9 w-9 hover:bg-destructive/5 transition-colors">
                      {user.status === UserStatus.ACTIVE ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-8 py-4 bg-slate-50/50 border-t">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} Staff
            </p>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <span className="text-sm font-black text-primary">{currentPage}</span>
                <span className="text-sm font-bold text-slate-400">/</span>
                <span className="text-sm font-bold text-slate-400">{totalPages}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Institutional Profile
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">First Name</Label>
                <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Last Name</Label>
                <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-11 rounded-xl" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Official Email (@nibbank.com.et)</Label>
              <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 rounded-xl font-bold" />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input value={formData.phoneNumber || ""} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} placeholder="+251..." className="pl-10 h-11 rounded-xl" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-primary tracking-widest">System Role</Label>
                <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val})}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select Role" /></SelectTrigger>
                  <SelectContent>
                    {roleDefinitions.map(role => (
                      <SelectItem key={role.id} value={role.name}>{role.name.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {isBranchSpecificRole ? (
                <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Home Branch</Label>
                  <Select value={formData.branchId || ""} onValueChange={val => setFormData({...formData, branchId: val})}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select Branch" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unmapped</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2 opacity-60">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Home Branch</Label>
                  <div className="h-11 rounded-xl border border-slate-100 bg-slate-50 flex items-center px-3 gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-300" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">Institutional Role</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-6 gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSyncing} className="rounded-xl px-6">Cancel</Button>
            <Button onClick={handleSave} disabled={isSyncing} className="bg-primary hover:bg-primary/90 text-white font-black rounded-xl px-10 shadow-xl shadow-primary/20">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Commit Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
