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
  UserCheck,
  UserX,
  ShieldCheck,
  Phone,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRightLeft,
  Users,
  X,
  Copy,
  KeyRound
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
import { UserStatus } from '@prisma/client';
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
  
  // Local state to force Tooltip refresh when registry updates
  const [registryVersion, setRegistryVersion] = useState(0);
  const [isResetting, setIsResetting] = useState<string | null>(null);
  
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
    if (!permissionsLoading && !hasPermission('USER_CREATE')) {
      toast({ variant: "destructive", title: "Access Restricted", description: "You do not have administrative clearance for this node." });
      router.push('/');
    }
  }, [hasPermission, permissionsLoading, router, toast]);

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
      // Bump version to refresh tooltips reading from singleton registry
      setRegistryVersion(v => v + 1);
    } catch (error) {
      toast({ variant: "destructive", title: "Institutional sync failed" });
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
      .sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
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
        status: UserStatus.ACTIVE, 
        branchId: 'none' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({ variant: "destructive", title: "Identity Required", description: "First Name, Last Name, Email, and Role are mandatory." });
      return;
    }

    const isBranchRole = formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER';
    const finalBranchId = (isBranchRole && formData.branchId !== 'none') ? formData.branchId : null;

    setIsSyncing(true);
    try {
      const res = await provisionUser({ 
        ...formData, 
        id: editingUser?.id, 
        branchId: finalBranchId,
        authorizingAdminId: currentUser?.id 
      });
      
      if (res.success) {
        if (res.tempPassword) {
          tempPasswordRegistry.add(formData.email, res.tempPassword);
          setRegistryVersion(v => v + 1);
        }
        
        toast({ 
          title: editingUser ? "Profile Updated" : "Staff Provisioned", 
          description: res.tempPassword 
            ? `Personnel records updated. Temporary password generated.` 
            : "Personnel records and jurisdictional mappings have been updated." 
        });
        setIsDialogOpen(false);
        loadData();
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Provisioning Error", description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickReset = async (email: string) => {
    if (!currentUser) return;
    setIsResetting(email);
    try {
      const res = await resetUserPassword(email, currentUser.id);
      if (res.success && res.tempPassword) {
        tempPasswordRegistry.add(email, res.tempPassword);
        setRegistryVersion(v => v + 1);
        toast({ title: "Credential Rotated", description: `Temporary password issued for ${res.userName}.` });
      } else {
        toast({ variant: "destructive", title: "Reset Denied", description: res.error });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "System Fault" });
    } finally {
      setIsResetting(null);
    }
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    try {
      await updateUserStatus(user.id, newStatus);
      toast({ title: "Access Status Updated", description: `Account is now ${newStatus}.` });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  const handleCopyPassword = (pass: string) => {
    navigator.clipboard.writeText(pass);
    toast({ title: "Credential Copied", description: "Temporary password saved to clipboard." });
  };

  const isBranchSpecificRole = formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER';

  if (loading || permissionsLoading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Personnel Directory</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Manage staff identities and jurisdictional assignments.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 h-11 bg-white border-slate-200 rounded-xl font-medium"
            />
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-xl font-bold h-11 px-6 text-white hover:bg-primary/90 rounded-xl">
            <UserPlus className="w-4 h-4" />
            Provision User
          </Button>
        </div>
      </div>

      <div className="border rounded-2xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Identity</TableHead>
              <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500">Institutional Role</TableHead>
              <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500">Home Node</TableHead>
              <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500">Status</TableHead>
              <TableHead className="text-right font-bold pr-8 text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-32 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-6 bg-slate-50 rounded-full">
                      <Users className="w-12 h-12 text-slate-200" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900 text-lg">No records discovered</p>
                      <p className="text-sm text-muted-foreground">Adjust filters or search criteria.</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedUsers.map((user) => {
              const tempPass = tempPasswordRegistry.get(user.email);
              return (
                <TableRow key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <TableCell className="pl-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                        {user.firstName?.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <span className={cn(
                                "font-black text-slate-900 leading-tight cursor-default", 
                                tempPass && "underline decoration-dotted decoration-primary/60 underline-offset-4 cursor-help"
                              )}>
                                {user.firstName} {user.lastName}
                              </span>
                            </TooltipTrigger>
                            {tempPass && (
                              <TooltipContent className="bg-slate-900 text-white border-none p-5 rounded-2xl shadow-2xl w-72 animate-in zoom-in-95">
                                <div className="space-y-4">
                                  <div className="flex items-center gap-2">
                                    <KeyRound className="w-4 h-4 text-primary" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Temporary Credential Issued</span>
                                  </div>
                                  <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 group">
                                    <code className="text-xl font-mono font-black text-primary flex-1 text-center tracking-wider">{tempPass}</code>
                                    <Button size="icon" variant="ghost" className="h-9 w-9 hover:bg-white/10 text-white" onClick={() => handleCopyPassword(tempPass)}>
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  <div className="flex gap-2">
                                    <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase">
                                      The staff member must change this password upon first login.
                                    </p>
                                  </div>
                                </div>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase mt-0.5">
                          <Mail className="w-3 h-3 text-slate-300" /> {user.email}
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
                      <Building2 className="w-3.5 h-3.5 text-slate-400" /> {user.branch?.name || "Institutional Node"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={user.status === UserStatus.ACTIVE ? 'text-green-600 border-green-200 bg-green-50 font-black text-[9px]' : 'text-slate-400 border-slate-200 bg-slate-50 font-black text-[9px]'}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleQuickReset(user.email)} 
                              disabled={isResetting === user.email}
                              className="text-primary rounded-full h-9 w-9 hover:bg-primary/5 transition-colors"
                            >
                              {isResetting === user.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p className="font-bold text-[10px] uppercase">Rotate Credential</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)} className="text-slate-400 rounded-full h-9 w-9 hover:bg-primary/5 hover:text-primary transition-colors">
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(user)} className="text-destructive rounded-full h-9 w-9 hover:bg-destructive/5 transition-colors">
                        {user.status === UserStatus.ACTIVE ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-8 py-5 bg-slate-50/50 border-t">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Displaying {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} Staff
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  disabled={currentPage === 1} 
                  className="h-9 w-9 p-0 rounded-xl border-slate-200 hover:bg-white hover:text-primary"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-2 px-4 h-9 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <span className="text-sm font-black text-primary">{currentPage}</span>
                  <span className="text-xs font-bold text-slate-300">/</span>
                  <span className="text-sm font-bold text-slate-500">{totalPages}</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  disabled={currentPage === totalPages} 
                  className="h-9 w-9 p-0 rounded-xl border-slate-200 hover:bg-white hover:text-primary"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white space-y-1 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <DialogTitle className="text-2xl font-black tracking-tight text-white">Institutional Profile</DialogTitle>
              </div>
            </div>
            <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest pl-11">
              {editingUser ? 'MANAGING JURISDICTIONAL MAPPING' : 'PROVISIONING NEW STAFF CREDENTIALS'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">FIRST NAME</Label>
                <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-11 rounded-xl font-bold bg-slate-50/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">LAST NAME</Label>
                <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-11 rounded-xl font-bold bg-slate-50/50" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">OFFICIAL EMAIL (@NIBBANK.COM.ET)</Label>
                <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 rounded-xl font-black bg-slate-50/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">PHONE NUMBER</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input 
                    value={formData.phoneNumber} 
                    onChange={e => setFormData({...formData, phoneNumber: e.target.value})} 
                    placeholder="+251 ..."
                    className="h-11 rounded-xl font-black bg-slate-50/50 pl-10" 
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-primary tracking-widest">AUTHORITY ROLE</Label>
                <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val})}>
                  <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="Select Role" /></SelectTrigger>
                  <SelectContent>
                    {roleDefinitions.map(role => (
                      <SelectItem key={role.id} value={role.name}>{role.name.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {isBranchSpecificRole ? (
                <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3 h-3" /> HOME BRANCH
                  </Label>
                  <Select value={formData.branchId || "none"} onValueChange={val => setFormData({...formData, branchId: val})}>
                    <SelectTrigger className="h-11 rounded-xl font-black text-primary border-primary/20 bg-primary/5">
                      <SelectValue placeholder="Map to Node..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Institutional / HQ</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2 opacity-60">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">HOME BRANCH</Label>
                  <div className="h-11 rounded-xl border border-slate-100 bg-slate-50 flex items-center px-3 gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-300" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">Institutional Level</span>
                  </div>
                </div>
              )}
            </div>

            {editingUser && isBranchSpecificRole && formData.branchId !== (editingUser.branch?.id || 'none') && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex gap-3 animate-in zoom-in-95">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 font-bold leading-relaxed uppercase">
                  <strong>Branch Transfer:</strong> Moving this staff member will re-route future jurisdictional tasks. Historical records remain under their previous node for audit integrity.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="p-8 bg-slate-50 border-t flex items-center justify-end gap-6">
            <button 
              onClick={() => setIsDialogOpen(false)} 
              className="text-sm font-bold text-primary hover:underline transition-colors"
            >
              Discard
            </button>
            <Button 
              onClick={handleSave} 
              disabled={isSyncing} 
              className="bg-primary hover:bg-primary/90 text-white font-black rounded-xl px-10 shadow-xl shadow-primary/20 h-12"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingUser ? 'Commit Profile Changes' : 'Initialize Staff Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
