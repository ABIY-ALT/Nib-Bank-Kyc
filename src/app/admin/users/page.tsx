'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  UserX,
  UserCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Phone,
  Copy,
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
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
import { useAuth } from "@/lib/auth";
import { getAllUsers, updateUserStatus, provisionUser, resetUserPassword } from '@/actions/users';
import { getBranches } from '@/actions/hierarchy';
import { getRoleDefinitions } from '@/actions/roles';
import { USER_STATUS } from '@/lib/kyc-data';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { tempPasswordRegistry } from '@/lib/temp-password-registry';

export default function UserManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isResetResultOpen, setIsResetResultOpen] = useState(false);
  const [resetResult, setResetResult] = useState<{ pass: string, name: string } | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<any>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    role: '',
    status: USER_STATUS.ACTIVE,
    branchId: ''
  });

  useEffect(() => {
    if (!permissionsLoading && !hasPermission('USER_CREATE')) {
      router.push('/');
    }
  }, [hasPermission, permissionsLoading, router]);

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
      toast({ variant: "destructive", title: "Sync failed" });
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return users
      .filter(user => 
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      )
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
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
        status: user.status || USER_STATUS.ACTIVE,
        branchId: user.branch?.id || 'none'
      });
    } else {
      setEditingUser(null);
      setFormData({ 
        firstName: '', 
        lastName: '',
        email: '', 
        phoneNumber: '',
        role: roleDefinitions[0]?.name || '', 
        status: USER_STATUS.ACTIVE, 
        branchId: 'none' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({ variant: "destructive", title: "Information Required" });
      return;
    }

    setIsSyncing(true);
    try {
      const isBranchRole = formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER';
      const res = await provisionUser({ 
        ...formData, 
        id: editingUser?.id, 
        branchId: (isBranchRole && formData.branchId !== 'none') ? formData.branchId : null
      });
      
      if (res.success) {
        if (res.tempPassword) {
          setResetResult({ pass: res.tempPassword, name: `${formData.firstName} ${formData.lastName}` });
          setIsResetResultOpen(true);
          tempPasswordRegistry.add(formData.email, res.tempPassword);
        }
        setIsDialogOpen(false);
        loadData();
        toast({ title: "Successful" });
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action Error", description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === USER_STATUS.ACTIVE ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE;
    try {
      await updateUserStatus(user.id, newStatus);
      toast({ title: "Successful", description: `Status set to ${newStatus}` });
      loadData();
    } catch (e) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  const handleResetPassword = async (user: any) => {
    try {
      const res = await resetUserPassword(user.email, currentUser!.id);
      if (res.success) {
        setResetResult({ pass: res.tempPassword!, name: `${user.firstName} ${user.lastName}` });
        setIsResetResultOpen(true);
        tempPasswordRegistry.add(user.email, res.tempPassword!);
        toast({ title: "Credential Rotated" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Reset Failed" });
    }
  };

  const handleCopyPassword = (pass: string) => {
    navigator.clipboard.writeText(pass);
    toast({ title: "Copied to Clipboard" });
  };

  if (loading || permissionsLoading) return <div className="py-48 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Personnel Directory</h1>
          <p className="text-muted-foreground text-lg font-medium">Manage institutional staff and node assignments.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 bg-white border rounded-xl font-medium"
            />
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-xl font-bold h-11 px-6 text-white hover:bg-primary/90 rounded-xl">
            <UserPlus className="w-4 h-4" /> Add User
          </Button>
        </div>
      </div>

      <div className="border-y bg-white overflow-hidden">
        <Table>
          <TableHeader className="hidden">
            <TableRow>
              <TableHead>Identity</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Node</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-32 text-center text-muted-foreground italic">No personnel records discovered.</TableCell></TableRow>
            ) : paginatedUsers.map((u) => (
              <TableRow key={u.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                <TableCell className="py-6 pl-8 w-[350px]">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-full bg-[#FAF7F2] text-[#B89334] flex items-center justify-center font-black text-lg shadow-inner">
                      {u.firstName.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 text-lg leading-none">{u.firstName} {u.lastName}</span>
                      <div className="flex items-center gap-2 mt-2">
                        <Mail className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight">{u.email}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell className="text-center">
                  <div className="inline-flex h-8 items-center px-4 rounded-full bg-[#FAF7F2] border border-[#B89334]/10">
                    <span className="text-[10px] font-black uppercase text-[#B89334] tracking-widest whitespace-nowrap">
                      {u.roles?.[0]?.role?.name?.replace(/_/g, ' ') || "Unassigned"}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="w-[200px]">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Building2 className="w-4 h-4 text-slate-300" />
                    <span className="text-sm font-bold truncate">{u.branch?.name || "HQ / Central"}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className={cn(
                    "inline-flex h-8 items-center px-5 rounded-full font-black text-[10px] uppercase tracking-widest",
                    u.status === USER_STATUS.ACTIVE ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  )}>
                    {u.status}
                  </div>
                </TableCell>

                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-4">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleOpenDialog(u)} 
                      className="h-10 w-10 text-slate-400 hover:text-primary transition-colors rounded-full"
                    >
                      <Settings2 className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleToggleStatus(u)} 
                      className={cn(
                        "h-10 w-10 transition-colors rounded-full",
                        u.status === USER_STATUS.ACTIVE ? "text-red-500 hover:bg-red-50" : "text-emerald-500 hover:bg-emerald-50"
                      )}
                    >
                      {u.status === USER_STATUS.ACTIVE ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between px-8 py-5 bg-slate-50/50 border-t">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Page {currentPage} of {totalPages} &bull; {filteredUsers.length} Entries
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-9 px-4 rounded-xl border-slate-200">
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-9 px-4 rounded-xl border-slate-200">
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* PROVISIONING DIALOG */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><ShieldCheck className="w-6 h-6 text-white" /></div>
              <DialogTitle className="text-2xl font-black tracking-tight">{editingUser ? 'Update Profile' : 'New Personnel'}</DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">First Name</Label><Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-11 rounded-xl font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">Last Name</Label><Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-11 rounded-xl font-bold" /></div>
            </div>
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">Bank Email</Label><Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 rounded-xl font-bold" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Role</Label>
                <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val})}>
                  <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="Select Role" /></SelectTrigger>
                  <SelectContent>{roleDefinitions.map(r => <SelectItem key={r.id} value={r.name}>{r.name.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Branch Node</Label>
                <Select value={formData.branchId || "none"} onValueChange={val => setFormData({...formData, branchId: val})}>
                  <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">HQ / Central</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="p-8 bg-slate-50 border-t flex gap-4">
            <button onClick={() => setIsDialogOpen(false)} className="text-sm font-bold text-slate-400">Cancel</button>
            <Button onClick={handleSave} disabled={isSyncing} className="bg-primary hover:bg-primary/90 text-white font-black rounded-xl px-10 h-12 shadow-xl">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREDENTIAL RESULT DIALOG */}
      <Dialog open={isResetResultOpen} onOpenChange={setIsResetResultOpen}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="p-8 bg-emerald-50 space-y-6">
            <div className="flex items-center gap-4 text-emerald-700">
              <div className="p-3 bg-emerald-500 text-white rounded-2xl"><CheckCircle2 className="w-6 h-6" /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest">Protocol Success</p><p className="text-xl font-black">{resetResult?.name}</p></div>
            </div>
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Temporary Credential</Label>
              <div className="flex items-center gap-3 bg-white p-5 rounded-2xl border-2 border-emerald-100 border-dashed">
                <code className="text-3xl font-mono font-black text-emerald-600 flex-1 text-center tracking-widest">{resetResult?.pass}</code>
                <Button variant="ghost" size="icon" onClick={() => handleCopyPassword(resetResult?.pass || "")} className="h-12 w-12 text-emerald-600 hover:bg-emerald-50"><Copy className="w-5 h-5" /></Button>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-white/50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-emerald-800 leading-relaxed italic">
                Inform the user they must rotate this credential upon first gateway entry. This value will expire in 15 minutes.
              </p>
            </div>
            <Button onClick={() => setIsResetResultOpen(false)} className="w-full h-14 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-200">Close Disclosure</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
