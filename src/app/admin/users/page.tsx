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
  AlertCircle,
  MoreVertical,
  Edit3,
  RefreshCw
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  
  // Dialog States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<any | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  
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

  const handleInitiateReset = (user: any) => {
    setUserToReset(user);
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = async () => {
    if (!userToReset || !currentUser) return;
    setIsResetting(true);
    try {
      const res = await resetUserPassword(userToReset.email, currentUser.id);
      if (res.success) {
        tempPasswordRegistry.add(userToReset.email, res.tempPassword!);
        toast({ 
          title: "Credential Rotated", 
          description: `Hover over ${userToReset.firstName}'s name to view the new password.` 
        });
        loadData();
      } else {
        toast({ variant: "destructive", title: "Reset Failed", description: res.error });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Reset Failed" });
    } finally {
      setIsResetting(false);
      setIsResetConfirmOpen(false);
      setUserToReset(null);
    }
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

      <div className="border rounded-2xl bg-white shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-100">
              <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest py-5 pl-8">Identity</TableHead>
              <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest text-center">Role</TableHead>
              <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Node</TableHead>
              <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-right font-black text-slate-500 text-[11px] uppercase tracking-widest pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-32 text-center text-muted-foreground italic">No personnel records discovered.</TableCell></TableRow>
            ) : paginatedUsers.map((u) => {
              const tempPass = tempPasswordRegistry.get(u.email);
              return (
                <TableRow key={u.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                  <TableCell className="py-6 pl-8">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-full bg-[#FAF7F2] text-[#B89334] flex items-center justify-center font-black text-lg shadow-inner">
                        {u.firstName.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "font-black text-slate-900 text-lg leading-none cursor-help transition-colors",
                              tempPass && "text-[#B89334] underline decoration-dotted decoration-[#B89334]/50"
                            )}>
                              {u.firstName} {u.lastName}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="p-5 bg-slate-900 border-none shadow-2xl rounded-2xl min-w-[240px]">
                            {tempPass ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="w-3.5 h-3.5 text-[#B89334]" />
                                  <p className="text-[10px] font-black uppercase text-[#B89334] tracking-widest">Active Temporary Credential</p>
                                </div>
                                <div className="flex items-center justify-between gap-4 bg-white/5 p-3 rounded-xl border border-white/10">
                                  <code className="text-2xl font-mono font-black text-white tracking-widest">{tempPass}</code>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(tempPass);
                                      toast({ title: "Credential Copied" });
                                    }}
                                    className="h-10 w-10 text-[#B89334] hover:bg-white/10 hover:text-[#B89334] rounded-lg"
                                  >
                                    <Copy className="w-5 h-5" />
                                  </Button>
                                </div>
                                <p className="text-[9px] text-slate-400 font-medium leading-relaxed italic">
                                  Valid for next login attempt. Change forced on entry.
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                                <p className="text-xs font-bold text-slate-300">Staff Identity Record</p>
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-primary transition-colors rounded-full">
                          <MoreVertical className="w-5 h-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-xl border-slate-200 shadow-2xl">
                        <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-4 py-2 border-b">Administrative Hub</DropdownMenuLabel>
                        <DropdownMenuItem 
                          onSelect={(e) => { e.preventDefault(); handleOpenDialog(u); }}
                          className="py-3 font-bold cursor-pointer gap-3"
                        >
                          <Edit3 className="w-4 h-4 text-[#B89334]" /> Edit Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onSelect={(e) => { e.preventDefault(); handleInitiateReset(u); }}
                          className="py-3 font-bold cursor-pointer gap-3"
                        >
                          <KeyRound className="w-4 h-4 text-[#B89334]" /> Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onSelect={(e) => { e.preventDefault(); handleToggleStatus(u); }}
                          className={cn("py-3 font-bold cursor-pointer gap-3", u.status === USER_STATUS.ACTIVE ? "text-red-600" : "text-emerald-600")}
                        >
                          {u.status === USER_STATUS.ACTIVE ? (
                            <><UserX className="w-4 h-4" /> Deactivate User</>
                          ) : (
                            <><UserCheck className="w-4 h-4" /> Activate User</>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
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

      {/* RESET CONFIRMATION ALERT DIALOG */}
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <AlertDialogContent className="max-w-[440px] rounded-xl p-0 overflow-hidden border-none shadow-2xl bg-[#FCFAF7]">
          <div className="p-8 space-y-6">
            <AlertDialogHeader className="space-y-4">
              <AlertDialogTitle className="text-[28px] font-black text-[#0F172A] leading-tight tracking-tight">
                Are you sure?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-lg text-[#334155] leading-relaxed font-medium">
                This will reset the password for <span className="font-bold text-[#0F172A]">{userToReset?.firstName} {userToReset?.lastName}</span>. They will be forced to change it upon their next login.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-row items-center justify-end gap-3 pt-4">
              <AlertDialogCancel asChild>
                <Button variant="ghost" className="h-12 px-8 font-bold text-[#475569] hover:bg-black/5 hover:text-[#0F172A] rounded-lg">
                  Cancel
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button 
                  onClick={(e) => { e.preventDefault(); handleConfirmReset(); }}
                  disabled={isResetting}
                  className="h-12 px-8 bg-[#B89334] hover:bg-[#A6822D] text-white font-black text-base rounded-lg shadow-xl shadow-[#B89334]/20"
                >
                  {isResetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirm reset
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
