'use client';

import { useState, useEffect, useMemo, memo, useCallback, useDeferredValue, useRef } from 'react';
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
import { getBranches, getDistricts } from '@/actions/hierarchy';
import { getRoleDefinitions } from '@/actions/roles';
import { USER_STATUS } from '@/lib/kyc-data';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { tempPasswordRegistry } from '@/lib/temp-password-registry';
import { TempPasswordModal } from '@/components/admin/temp-password-modal';
import { SYSTEM_SECTION_COPY } from '@/lib/access-ui';

const HQ_ONLY_ROLES = new Set([
  'SUPERVISOR',
  'FOLLOW_UP',
  'FOLLOW_UP_OFFICER',
  'DIRECTOR',
  'KYC_DIRECTOR',
  'DISTRICT_DIRECTOR',
  'KYC_OFFICER'
]);

const isHqOnlyRole = (role?: string) => {
  if (!role) return false;
  return HQ_ONLY_ROLES.has(role.toUpperCase());
};

const isDistrictDirectorRole = (role?: string) => role?.toUpperCase() === 'DISTRICT_DIRECTOR';

const buildEmailPreviewSegment = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALL_ROLES_FILTER = 'ALL_ROLES';

const getPrimaryRoleName = (user: any) => user.roles?.[0]?.role?.name || 'UNASSIGNED';
const formatRoleLabel = (role?: string) => role?.replace(/_/g, ' ') || 'Unassigned';

// Memoized UserTableRow component to prevent unnecessary re-renders
const UserTableRow = memo(({ 
  user, 
  tempPass,
  onEdit, 
  onReset, 
  onToggleStatus,
  onShowCredential,
  isAdminUser,
}: {
  user: any;
  tempPass: string | null;
  onEdit: (user: any) => void;
  onReset: (user: any) => void;
  onToggleStatus: (user: any) => void;
  onShowCredential: (user: any, password: string) => void;
  isAdminUser: boolean;
}) => (
  <TableRow className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
    <TableCell className="py-6 pl-8">
      <div className="flex items-center gap-5">
        <div className="w-12 h-12 rounded-full bg-[#FAF7F2] text-[#B89334] flex items-center justify-center font-black text-lg shadow-inner">
          {user.firstName.charAt(0)}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-black text-slate-900 text-lg leading-none",
              tempPass && "text-[#B89334] underline decoration-dotted decoration-[#B89334]/50"
            )}>
              {user.firstName} {user.lastName}
            </span>
            {tempPass && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onShowCredential(user, tempPass)}
                className="h-7 px-3 text-[10px] font-black uppercase text-[#B89334] bg-[#B89334]/5 hover:bg-[#B89334]/10 rounded-full gap-1.5"
                title="Click to view temporary password"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                View Credential
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Mail className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Phone className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-xs font-bold text-slate-500 tracking-tight">
              {user.phoneNumber || 'No phone saved'}
            </span>
          </div>
        </div>
      </div>
    </TableCell>
    
    <TableCell className="text-center">
      <div className="inline-flex h-8 items-center px-4 rounded-full bg-[#FAF7F2] border border-[#B89334]/10">
        <span className="text-[10px] font-black uppercase text-[#B89334] tracking-widest whitespace-nowrap">
          {formatRoleLabel(getPrimaryRoleName(user))}
        </span>
      </div>
    </TableCell>

    <TableCell className="w-[200px]">
      <div className="flex items-center gap-3 text-slate-600">
        <Building2 className="w-4 h-4 text-slate-300" />
        <span className="text-sm font-bold truncate">
          {user.branch?.name || (user.districtName ? `${user.districtName} District` : "HQ / Central")}
        </span>
      </div>
    </TableCell>

    <TableCell>
      <div className={cn(
        "inline-flex h-8 items-center px-5 rounded-full font-black text-[10px] uppercase tracking-widest",
        user.status === USER_STATUS.ACTIVE ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
      )}>
        {user.status}
      </div>
    </TableCell>

    <TableCell className="text-right pr-8">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-primary transition-colors rounded-full">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl border-slate-200 shadow-2xl">
          <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-4 py-2 border-b">Administrative Hub</DropdownMenuLabel>
          <DropdownMenuItem 
            onSelect={() => onEdit(user)}
            className="py-3 font-bold cursor-pointer gap-3"
          >
            <Edit3 className="w-4 h-4 text-[#B89334]" /> Edit Profile
          </DropdownMenuItem>
          <DropdownMenuItem 
            onSelect={() => onReset(user)}
            className="py-3 font-bold cursor-pointer gap-3"
          >
            <KeyRound className="w-4 h-4 text-[#B89334]" /> Reset Password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!isAdminUser && (
            <DropdownMenuItem 
              onSelect={() => onToggleStatus(user)}
              className={cn("py-3 font-bold cursor-pointer gap-3", user.status === USER_STATUS.ACTIVE ? "text-red-600" : "text-emerald-600")}
            >
              {user.status === USER_STATUS.ACTIVE ? (
                <><UserX className="w-4 h-4" /> Deactivate User</>
              ) : (
                <><UserCheck className="w-4 h-4" /> Activate User</>
              )}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  </TableRow>
));

UserTableRow.displayName = 'UserTableRow';

export default function UserManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Dialog States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<any | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  
  // Temp Password Modal State
  const [isTempPasswordModalOpen, setIsTempPasswordModalOpen] = useState(false);
  const [tempPasswordModalData, setTempPasswordModalData] = useState<{
    user: any;
    password: string;
  } | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(ALL_ROLES_FILTER);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const [phoneNumberError, setPhoneNumberError] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const canManageUsers = hasPermission('USER_CREATE');

  const [formData, setFormData] = useState<any>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    role: '',
    status: USER_STATUS.ACTIVE,
    branchId: '',
    districtName: ''
  });
  const isHqOnly = isHqOnlyRole(formData.role);
  const isDistrictDirector = isDistrictDirectorRole(formData.role);
  const generatedEmailPreview = useMemo(() => {
    const firstNamePart = buildEmailPreviewSegment(formData.firstName || '');
    const lastNamePart = buildEmailPreviewSegment(formData.lastName || '');

    if (editingUser && editingUser.firstName === formData.firstName && editingUser.lastName === formData.lastName) {
      return editingUser.email;
    }

    if (!firstNamePart || !lastNamePart) {
      return 'firstname.surname@nibbank.com.et';
    }

    return `${firstNamePart}.${lastNamePart}@nibbank.com.et`;
  }, [editingUser, formData.firstName, formData.lastName]);

  const roleFilterOptions = useMemo(() => {
    const roleMap = new Map<string, string>();

    roleDefinitions.forEach((role) => {
      if (role?.name) {
        roleMap.set(role.name, formatRoleLabel(role.name));
      }
    });

    users.forEach((userRecord) => {
      const roleName = getPrimaryRoleName(userRecord);
      if (roleName) {
        roleMap.set(roleName, formatRoleLabel(roleName));
      }
    });

    return Array.from(roleMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [roleDefinitions, users]);

  useEffect(() => {
    if (!permissionsLoading && !canManageUsers) {
      router.push('/');
    }
  }, [canManageUsers, permissionsLoading, router]);

  useEffect(() => {
    users.forEach((userRecord) => {
      if (!userRecord.needsPasswordChange) {
        tempPasswordRegistry.remove(userRecord.email);
      }
    });
  }, [users]);

  const loadInitialData = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [u, b, d, r] = await Promise.all([
        getAllUsers(), 
        getBranches(),
        getDistricts(),
        getRoleDefinitions()
      ]);
      setUsers(u);
      setBranches(b);
      setDistricts(d);
      setRoleDefinitions(r);
    } catch (error) {
      toast({ variant: "destructive", title: "Sync failed" });
    } finally {
      setInitialLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!permissionsLoading && canManageUsers) {
      void loadInitialData();
    }
  }, [canManageUsers, loadInitialData, permissionsLoading]);

  const refreshUsers = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const u = await getAllUsers();
      setUsers(u);
    } catch (error) {
      toast({ variant: "destructive", title: "Sync failed" });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast]);

  const filteredUsers = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    const roleFilter = selectedRoleFilter === ALL_ROLES_FILTER ? null : selectedRoleFilter;

    return users
      .filter(user => {
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const primaryRole = getPrimaryRoleName(user);
        const assignmentLabel = (user.branch?.name || user.districtName || 'HQ / Central').toLowerCase();
        const matchesRole = !roleFilter || primaryRole === roleFilter;
        const matchesSearch =
          !term ||
          fullName.includes(term) ||
          user.email.toLowerCase().includes(term) ||
          (user.phoneNumber || '').toLowerCase().includes(term) ||
          formatRoleLabel(primaryRole).toLowerCase().includes(term) ||
          assignmentLabel.includes(term);

        return matchesRole && matchesSearch;
      })
      .map((user) => ({
        user,
        tempPass: user.needsPasswordChange ? tempPasswordRegistry.get(user.email) : null,
        isAdminUser: user.roles?.some((roleEntry: any) => roleEntry.role?.name === 'SUPER_ADMIN'),
      }))
      .sort((left, right) => {
        const firstNameComparison = left.user.firstName.localeCompare(right.user.firstName);
        if (firstNameComparison !== 0) return firstNameComparison;
        return left.user.lastName.localeCompare(right.user.lastName);
      });
  }, [deferredSearchTerm, selectedRoleFilter, users]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRoleFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const handleOpenDialog = useCallback((user?: any) => {
    setPhoneNumberError('');
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
        branchId: user.branch?.id || 'none',
        districtName: user.districtName || ''
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
        branchId: 'none',
        districtName: ''
      });
    }
    setIsDialogOpen(true);
  }, [roleDefinitions]);

  const handleSave = useCallback(async () => {
    if (!formData.firstName || !formData.lastName || !formData.role) {
      toast({ variant: "destructive", title: "Information Required" });
      return;
    }

    if (!formData.phoneNumber?.trim()) {
      setPhoneNumberError('Please enter phone number.');
      phoneInputRef.current?.focus();
      return;
    }

    setPhoneNumberError('');

    if ((formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER') && (!formData.branchId || formData.branchId === 'none')) {
      toast({ variant: "destructive", title: "Branch Required" });
      return;
    }

    if (isDistrictDirector && !formData.districtName) {
      toast({ variant: "destructive", title: "District Required" });
      return;
    }

    setIsSyncing(true);
    try {
      const isBranchRole = formData.role === 'BRANCH_MANAGER' || formData.role === 'BRANCH_OFFICER';
      const res = await provisionUser({ 
        ...formData, 
        email: (formData.email || generatedEmailPreview).toLowerCase().trim(),
        id: editingUser?.id, 
        branchId: (isBranchRole && formData.branchId !== 'none') ? formData.branchId : null,
        districtName: isDistrictDirector ? formData.districtName : null
      });
      
      if (res.success) {
        if (res.tempPassword) {
          tempPasswordRegistry.add(res.user.email, res.tempPassword);
          setTempPasswordModalData({
            user: {
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: res.user.email
            },
            password: res.tempPassword
          });
          setIsTempPasswordModalOpen(true);
        }
        setIsDialogOpen(false);
        refreshUsers();
        toast({ title: "Successful" });
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.toLowerCase().includes('phone')) {
        setPhoneNumberError(error.message);
        phoneInputRef.current?.focus();
      }
      toast({ variant: "destructive", title: "Action Error", description: error.message });
    } finally {
      setIsSyncing(false);
    }
  }, [formData, editingUser, generatedEmailPreview, isDistrictDirector, refreshUsers, toast]);

  const handleToggleStatus = useCallback(async (user: any) => {
    const newStatus = user.status === USER_STATUS.ACTIVE ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE;
    try {
      await updateUserStatus(user.id, newStatus);
      toast({ title: "Successful", description: `Status set to ${newStatus}` });
      refreshUsers();
    } catch (e) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  }, [refreshUsers, toast]);

  const handleInitiateReset = useCallback((user: any) => {
    setUserToReset(user);
    setIsResetConfirmOpen(true);
  }, []);

  const handleShowCredential = useCallback((user: any, password: string) => {
    setTempPasswordModalData({
      user,
      password
    });
    setIsTempPasswordModalOpen(true);
  }, []);

  const handleConfirmReset = useCallback(async () => {
    if (!userToReset || !currentUser) return;
    setIsResetConfirmOpen(false);
    setIsResetting(true);
    try {
      const res = await resetUserPassword(userToReset.email, currentUser.id);
      if (res.success) {
        tempPasswordRegistry.add(userToReset.email, res.tempPassword!);
        // Show the temporary password modal immediately
       setTimeout(() => {
        setTempPasswordModalData({
          user: userToReset,
          password: res.tempPassword!
        });
        setIsTempPasswordModalOpen(true);
      }, 50);
        
        // Delay data refresh to avoid UI freeze (let modal display first)
        // No need to call loadData() immediately - modal is self-contained
        toast({ 
          title: "Credential Rotated", 
          description: `Temporary password displayed. User must change on next login.` 
        });
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
  }, [userToReset, currentUser, toast]);

  if (initialLoading || permissionsLoading) return <div className="py-48 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">{SYSTEM_SECTION_COPY.USER_CREATE.label}</h1>
          <p className="text-muted-foreground text-lg font-medium">{SYSTEM_SECTION_COPY.USER_CREATE.description}</p>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 bg-white border rounded-xl font-medium"
            />
          </div>
          <div className="w-full md:w-64">
            <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
              <SelectTrigger className="h-11 rounded-xl bg-white font-medium">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-2xl">
                <SelectItem value={ALL_ROLES_FILTER} className="font-bold">
                  All Roles
                </SelectItem>
                {roleFilterOptions.map((roleOption) => (
                  <SelectItem key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isRefreshing && (
            <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-primary/60" />
              Syncing
            </div>
          )}
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
              <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Assignment</TableHead>
              <TableHead className="font-black text-slate-500 text-[11px] uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-right font-black text-slate-500 text-[11px] uppercase tracking-widest pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-32 text-center text-muted-foreground italic">No personnel records discovered.</TableCell></TableRow>
            ) : paginatedUsers.map(({ user, tempPass, isAdminUser }) => {
              return (
                <UserTableRow 
                  key={user.id} 
                  user={user} 
                  tempPass={tempPass}
                  onEdit={handleOpenDialog}
                  onReset={handleInitiateReset}
                  onToggleStatus={handleToggleStatus}
                  onShowCredential={handleShowCredential}
                  isAdminUser={!!isAdminUser}
                />
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between px-8 py-5 bg-slate-50/50 border-t">
          <div className="space-y-0.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Page {currentPage} of {totalPages}
            </p>
            <p className="text-[9px] font-bold text-[#B89334] uppercase">
              {filteredUsers.length} Total Personnel Discovered
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-9 px-4 rounded-xl border-slate-200 bg-white font-bold text-slate-600 hover:text-primary transition-all shadow-sm active:scale-95"
            >
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            <div className="h-9 min-w-[36px] px-3 flex items-center justify-center bg-white border border-[#B89334]/20 rounded-xl font-black text-sm text-[#B89334] shadow-sm">
              {currentPage}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage >= totalPages}
              className="h-9 px-4 rounded-xl border-slate-200 bg-white font-bold text-slate-600 hover:text-primary transition-all shadow-sm active:scale-95"
            >
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* PROVISIONING DIALOG */}
    
  <Dialog
  open={isDialogOpen}
  onOpenChange={(open) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingUser(null); // clear editing user when closed
      setPhoneNumberError('');
    }
  }}
>
          <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">          <DialogHeader className="p-8 bg-primary text-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><ShieldCheck className="w-6 h-6 text-white" /></div>
              <DialogTitle className="text-2xl font-black tracking-tight">{editingUser ? 'Update Profile' : 'New Personnel'}</DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="absolute opacity-0 pointer-events-none -z-10 h-0 overflow-hidden" aria-hidden="true">
              <input type="text" name="username" autoComplete="username" tabIndex={-1} />
              <input type="password" name="current-password" autoComplete="current-password" tabIndex={-1} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">First Name</Label><Input name="personnel-first-name" autoComplete="given-name" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-11 rounded-xl font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500">Surname</Label><Input name="personnel-surname" autoComplete="family-name" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-11 rounded-xl font-bold" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Official Username</Label>
                <Input
                  name="personnel-outlook-address"
                  autoComplete="off"
                  value={formData.email || generatedEmailPreview}
                  onFocus={(e) => {
                    if (!formData.email) {
                      e.currentTarget.select();
                    }
                  }}
                  onChange={(e) => setFormData({
                    ...formData,
                    email: e.target.value.toLowerCase().replace(/\s+/g, '')
                  })}
                  className="h-11 rounded-xl font-bold"
                />
                <p className="text-[10px] font-bold text-slate-400">
                  Edit manually if needed. Use `firstname.surname` or the full bank address.
                </p>
              </div>
              <div className="space-y-2">
                <Label className={cn(
                  "text-[10px] font-black uppercase",
                  phoneNumberError ? "text-red-600" : "text-slate-500"
                )}>Phone Number *</Label>
                <Input
                  ref={phoneInputRef}
                  type="tel"
                  name="personnel-phone-number"
                  placeholder="e.g. +2519XXXXXXX"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  aria-invalid={phoneNumberError ? 'true' : 'false'}
                  value={formData.phoneNumber}
                  onChange={e => {
                    const nextValue = e.target.value;
                    setFormData({ ...formData, phoneNumber: nextValue });
                    if (phoneNumberError && nextValue.trim()) {
                      setPhoneNumberError('');
                    }
                  }}
                  className={cn(
                    "h-11 rounded-xl font-bold",
                    phoneNumberError && "border-red-500 focus-visible:ring-red-200 focus-visible:border-red-500"
                  )}
                />
                {phoneNumberError ? (
                  <p className="text-[10px] font-bold text-red-600">
                    {phoneNumberError}
                  </p>
                ) : (
                  <p className="text-[10px] font-bold text-slate-400">
                    Required for every personnel record.
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={val => setFormData((prev: typeof formData) => ({
                    ...prev,
                    role: val,
                    branchId: isDistrictDirectorRole(val) || isHqOnlyRole(val) ? 'none' : prev.branchId,
                    districtName: isDistrictDirectorRole(val) ? prev.districtName : ''
                  }))}
                >
                  <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="Select Role" /></SelectTrigger>
                  <SelectContent>{roleDefinitions.map(r => <SelectItem key={r.id} value={r.name}>{r.name.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">
                  {isDistrictDirector ? 'District' : (isHqOnly ? 'Head Office' : 'Branch')}
                </Label>
                <Select
                  value={isDistrictDirector ? (formData.districtName || "none") : (isHqOnly ? "none" : (formData.branchId || "none"))}
                  onValueChange={val => setFormData({
                    ...formData,
                    branchId: isDistrictDirector ? 'none' : val,
                    districtName: isDistrictDirector ? (val === 'none' ? '' : val) : formData.districtName
                  })}
                  disabled={isHqOnly && !isDistrictDirector}
                >
                  <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!isDistrictDirector && <SelectItem value="none">HQ / Central</SelectItem>}
                    {isDistrictDirector
                      ? districts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)
                      : branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                    }
                  </SelectContent>
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
      
    <AlertDialog
  open={isResetConfirmOpen}
  onOpenChange={(open) => {
    setIsResetConfirmOpen(open);
    if (!open) setUserToReset(null);
  }}
>
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
    

      {/* TEMPORARY PASSWORD DISPLAY MODAL */}
      {tempPasswordModalData && (
       <TempPasswordModal
  open={isTempPasswordModalOpen}
  onOpenChange={(open) => {
    setIsTempPasswordModalOpen(open);
    if (!open) {
      // Unmount the modal completely after it closes
      setTempPasswordModalData(null);
    }
  }}
  userName={`${tempPasswordModalData.user.firstName} ${tempPasswordModalData.user.lastName}`}
  tempPassword={tempPasswordModalData.password}
  email={tempPasswordModalData.user.email}
/>
      )}
    </div>
  );
}
